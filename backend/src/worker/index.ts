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
// IMPORTANT: the work inside each status is currently a PLACEHOLDER (a sleep +
// a reachability check). The status machine, failure handling, timeout, and
// crash recovery below are real and done. The Syft ticket replaces only the
// placeholder work in `processScan` — see the note there.
// ---------------------------------------------------------------------------

import { Worker, type Job } from 'bullmq';
import { query } from '../db/index.js';
import { PROGRESS_STATUSES, phaseOf, type ProgressStatus } from '../shared/status.js';
import { SCAN_QUEUE, JOB_TIMEOUT_MS, redisConnection, type ScanJobData } from '../shared/queue.js';

// How long to pretend each placeholder phase takes. Real work replaces this.
const PHASE_DELAY_MS = Number(process.env.SCAN_PHASE_DELAY_MS ?? 3000);

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

// PLACEHOLDER standing in for the real `git clone`. For now we only check the
// repo page is reachable; the Syft ticket replaces this with an actual shallow
// clone. Note the pattern to keep: on failure, throw a `ScanError` with a
// user-safe message.
async function checkRepoReachable(repoUrl: string): Promise<void> {
  let ok = false;
  try {
    const res = await fetch(repoUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  if (!ok) {
    throw new ScanError(
      'Repository could not be cloned. It may be private or the URL may be invalid.',
    );
  }
}

// The heart of the worker: run one scan from start to finish.
//
// >>> THIS IS WHERE THE SYFT TICKET LANDS. <<<
// The loop below is the placeholder: it walks each status and sleeps. Keep the
// `setStatus` calls, but replace the sleeps with real work per phase:
//   cloning   -> git clone --depth 1 (replaces checkRepoReachable)
//   scanning  -> run syft, get CycloneDX JSON
//   enriching -> parse, upsert components, write scan_components, save raw_output
// Anything that can go wrong for a user reason should `throw new ScanError(...)`.
async function processScan(job: Job<ScanJobData>): Promise<void> {
  const { scanId, repoUrl } = job.data;
  for (const status of PROGRESS_STATUSES) {
    if (status === 'queued') continue; // already set by the API when it inserted the row
    await setStatus(scanId, status); // announce this phase in the DB before doing its work
    console.log(`${scanId}: ${status}`);
    if (status === 'cloning') await checkRepoReachable(repoUrl);
    if (status !== 'completed') await sleep(PHASE_DELAY_MS);
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

console.log(`worker listening on queue "${SCAN_QUEUE}" (phase delay ${PHASE_DELAY_MS}ms)`);
