// ---------------------------------------------------------------------------
// The WORKER process. It is the second half of the backend (the API is the
// first). They never call each other directly — the API drops a job on the
// Redis queue, and this process picks it up here.
//
// What it does for each job: takes a scan that the API saved as `queued`, and
// walks it through the remaining statuses, writing each step to the same DB
// row so `GET /scans/:id` reflects live progress:
//
//     queued -> cloning -> scanning -> enriching -> completed   (or -> failed)
//
// ---------------------------------------------------------------------------

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as CDX from '@cyclonedx/cyclonedx-library';
import { Worker, type Job } from 'bullmq';
import { query } from '../db/index.js';
import { newComponentId } from '../shared/ids.js';
import { phaseOf, type ProgressStatus } from '../shared/status.js';
import { SCAN_QUEUE, JOB_TIMEOUT_MS, redisConnection, type ScanJobData } from '../shared/queue.js';
import { runCommand, ExecTimeoutError } from './exec.js';


const GIT_CLONE_TIMEOUT_MS = Number(process.env.GIT_CLONE_TIMEOUT_MS ?? 60_000);
const SYFT_TIMEOUT_MS = Number(process.env.SYFT_TIMEOUT_MS ?? 120_000);

// Two kinds of failure exist. A `ScanError` carries a message we are happy to
// show the user (e.g. "repo could not be cloned"). Any OTHER error is treated
// as internal and hidden behind a generic message. The `failed` handler at the
// bottom decides which is which — throw a `ScanError` for anything the user
// should see, and a plain Error for bugs/infra problems.
class ScanError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The single place that advances a scan's status in the DB. Call this at the
// start of each phase; it also derives the numeric `phase` from the status.
async function setStatus(scanId: string, status: ProgressStatus): Promise<void> {
  await query(
    `UPDATE scans SET status = $2, phase = $3, updated_at = now() WHERE id = $1`,
    [scanId, status, phaseOf(status)],
  );
}

// Shallow clone into destDir as a child process with its own timeout,
// separate from the overall 30-minute BullMQ job timeout.
async function cloneRepo(repoUrl: string, destDir: string): Promise<void> {
  try {
    await runCommand('git', ['clone', '--depth', '1', '--quiet', repoUrl, destDir], {
      timeoutMs: GIT_CLONE_TIMEOUT_MS,
    });
  } catch {
    throw new ScanError(
      'Repository could not be cloned. It may be private or the URL may be invalid.',
    );
  }
}

// Runs Syft against the cloned directory, returning the raw CycloneDX JSON
// text. Own timeout, independent of the git clone and job timeouts.
async function runSyft(dir: string): Promise<string> {
  try {
    const { stdout } = await runCommand('syft', [dir, '-o', 'cyclonedx-json'], {
      timeoutMs: SYFT_TIMEOUT_MS,
    });
    return stdout;
  } catch (err) {
    if (err instanceof ExecTimeoutError) {
      throw new ScanError('SBOM generation timed out.');
    }
    throw new ScanError('SBOM generation failed.');
  }
}

interface CycloneDxLicense {
  license?: { id?: string; name?: string };
  expression?: string;
}

interface CycloneDxComponent {
  name: string;
  version?: string;
  type?: string;
  purl?: string;
  licenses?: CycloneDxLicense[];
}

interface CycloneDxDocument {
  bomFormat?: string;
  specVersion?: string;
  components?: CycloneDxComponent[];
}

// Syft's cyclonedx-json output is plain JSON matching a stable, known shape,
// so a full model deserializer isn't needed -- we just read the fields we
// store. (@cyclonedx/cyclonedx-library has no JSON->Bom deserializer; it's
// built for constructing/serializing/validating BOMs, not parsing them.)
function parseCycloneDxDocument(rawJson: string): CycloneDxDocument {
  let doc: CycloneDxDocument;
  try {
    doc = JSON.parse(rawJson);
  } catch {
    throw new ScanError('Syft produced output that could not be parsed as JSON.');
  }
  if (doc.bomFormat !== 'CycloneDX' || !Array.isArray(doc.components)) {
    throw new ScanError('Syft produced an unexpected CycloneDX document shape.');
  }
  return doc;
}

// Values are CycloneDX Spec objects whose `.version` is the library's `Version`
// enum (not a plain string) -- type the map by the object itself so that enum
// type survives to the JsonStrictValidator call below.
const SPEC_BY_VERSION: Record<string, typeof CDX.Spec.Spec1dot6> = {
  '1.2': CDX.Spec.Spec1dot2,
  '1.3': CDX.Spec.Spec1dot3,
  '1.4': CDX.Spec.Spec1dot4,
  '1.5': CDX.Spec.Spec1dot5,
  '1.6': CDX.Spec.Spec1dot6,
};

// Best-effort validation against the CycloneDX spec using the official
// library. Deliberately non-fatal: an unrecognized spec version or a missing
// optional peer dep (ajv) just skips/warns rather than failing the scan.
async function validateCycloneDx(rawJson: string, specVersion: string | undefined): Promise<void> {
  const spec = specVersion ? SPEC_BY_VERSION[specVersion] : undefined;
  if (!spec) return;
  try {
    const validator = new CDX.Validation.JsonStrictValidator(spec.version);
    const errors = await validator.validate(rawJson);
    if (errors !== null) {
      console.warn('CycloneDX validation warnings:', JSON.stringify(errors));
    }
  } catch (err) {
    if (err instanceof CDX.Validation.MissingOptionalDependencyError) {
      console.warn('CycloneDX JSON validation skipped: optional dependency missing');
      return;
    }
    console.warn('CycloneDX JSON validation error:', err);
  }
}

function extractLicenses(comp: CycloneDxComponent): string[] {
  if (!comp.licenses) return [];
  const names: string[] = [];
  for (const entry of comp.licenses) {
    if (entry.license?.id) names.push(entry.license.id);
    else if (entry.license?.name) names.push(entry.license.name);
    else if (entry.expression) names.push(entry.expression);
  }
  return names;
}

interface ComponentRow {
  id: string;
}

// Upserts by purl: a fresh id is only used if the component is new; on
// conflict, Postgres returns the existing row's id instead.
async function upsertComponent(comp: CycloneDxComponent): Promise<string | null> {
  if (!comp.purl || !comp.version) return null; // schema requires both; skip unresolvable components
  const id = newComponentId();
  const { rows } = await query<ComponentRow>(
    `INSERT INTO components (id, purl, name, version, type, licenses)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (purl) DO UPDATE
       SET name = EXCLUDED.name, version = EXCLUDED.version, type = EXCLUDED.type, licenses = EXCLUDED.licenses
     RETURNING id`,
    [id, comp.purl, comp.name, comp.version, comp.type ?? 'library', extractLicenses(comp)],
  );
  return rows[0].id;
}

// Links every parsed component to this scan. `direct` is hardcoded true for
// now -- real direct/transitive detection needs Syft's dependency graph,
// deferred to a later pass.
async function storeComponents(scanId: string, doc: CycloneDxDocument): Promise<void> {
  for (const comp of doc.components ?? []) {
    const componentId = await upsertComponent(comp);
    if (!componentId) continue;
    await query(
      `INSERT INTO scan_components (scan_id, component_id, direct, found_by)
       VALUES ($1, $2, $3, 'syft')
       ON CONFLICT DO NOTHING`,
      [scanId, componentId, true],
    );
  }
}



// The heart of the worker: run one scan from start to finish.
//
// >>> THIS IS WHERE THE SYFT TICKET LANDS. <<<
//   cloning   -> git clone --depth 1 (replaces checkRepoReachable)
//   scanning  -> run syft, get CycloneDX JSON
//   enriching -> parse, upsert components, write scan_components, save raw_output
// Anything that can go wrong for a user reason should `throw new ScanError(...)`.
async function processScan(job: Job<ScanJobData>): Promise<void> {
  const { scanId, repoUrl } = job.data;
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'sbom-'));
  try {
    await setStatus(scanId, 'cloning');
    console.log(`${scanId}: cloning`);
    await cloneRepo(repoUrl, tmpDir);

    await setStatus(scanId, 'scanning');
    console.log(`${scanId}: scanning`);
    const rawJson = await runSyft(tmpDir);
    const doc = parseCycloneDxDocument(rawJson);
    await validateCycloneDx(rawJson, doc.specVersion);

    await setStatus(scanId, 'enriching');
    console.log(`${scanId}: enriching`);
    await storeComponents(scanId, doc);
    await query(`UPDATE scans SET raw_output = $2, updated_at = now() WHERE id = $1`, [
      scanId,
      rawJson,
    ]);

    await setStatus(scanId, 'completed');
    console.log(`${scanId}: completed`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// Hard ceiling on a whole scan: race the real work against a timer, so a scan
// can never run forever. (The Syft ticket adds SHORTER per-step timeouts on git
// and syft inside processScan; this outer one is the last-resort backstop.)
function withTimeout(job: Job<ScanJobData>): Promise<void> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ScanError(`Scan timed out after ${Math.round(JOB_TIMEOUT_MS / 60000)} minutes.`)),
      JOB_TIMEOUT_MS,
    );
  });
  return Promise.race([processScan(job), timeout]).finally(() => clearTimeout(timer));
}

// Start consuming the queue. `withTimeout` runs for every job that arrives.
const worker = new Worker<ScanJobData>(SCAN_QUEUE, withTimeout, {
  connection: redisConnection(),
  // Stalled-job detection: if this process dies mid-job, another worker (or a
  // restart) fails the job instead of leaving the scan stuck in progress.
  // Consequence for the Syft ticket: a job can run more than once, so the real
  // work must be safe to repeat (idempotent).
  stalledInterval: 30_000,
  maxStalledCount: 1,
});

// One central failure handler for every job. Whatever `processScan` throws
// lands here, and the scan row is marked `failed` with an appropriate message.
worker.on('failed', async (job, err) => {
  const scanId = job?.data.scanId ?? job?.id;
  if (!scanId) return;
  const message =
    err instanceof ScanError
      ? err.message
      : err.message.includes('stalled')
        ? 'Scan was aborted because the worker stopped responding.'
        : 'Scan failed due to an internal error.';
  console.error(`${scanId}: failed - ${err.message}`);
  await query(
    `UPDATE scans SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [scanId, message],
  );
});

worker.on('error', (err) => console.error('worker error:', err));

console.log(
  `worker listening on queue "${SCAN_QUEUE}" (git timeout ${GIT_CLONE_TIMEOUT_MS}ms, syft timeout ${SYFT_TIMEOUT_MS}ms)`,
);
