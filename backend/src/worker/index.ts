import { Worker, type Job } from 'bullmq';
import { query } from '../db/index.js';
import { PROGRESS_STATUSES, phaseOf, type ProgressStatus } from '../shared/status.js';
import { SCAN_QUEUE, JOB_TIMEOUT_MS, redisConnection, type ScanJobData } from '../shared/queue.js';

const PHASE_DELAY_MS = Number(process.env.SCAN_PHASE_DELAY_MS ?? 3000);

// Error whose message is safe to store on the scan row and show to users.
class ScanError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setStatus(scanId: string, status: ProgressStatus): Promise<void> {
  await query(
    `UPDATE scans SET status = $2, phase = $3, updated_at = now() WHERE id = $1`,
    [scanId, status, phaseOf(status)],
  );
}

// Placeholder for the real clone: a reachability probe on the repo page.
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

async function processScan(job: Job<ScanJobData>): Promise<void> {
  const { scanId, repoUrl } = job.data;
  for (const status of PROGRESS_STATUSES) {
    if (status === 'queued') continue; // set by the API at insert time
    await setStatus(scanId, status);
    console.log(`${scanId}: ${status}`);
    if (status === 'cloning') await checkRepoReachable(repoUrl);
    if (status !== 'completed') await sleep(PHASE_DELAY_MS);
  }
}

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

const worker = new Worker<ScanJobData>(SCAN_QUEUE, withTimeout, {
  connection: redisConnection(),
  // Stalled-job detection: if this process dies mid-job, another worker (or a
  // restart) fails the job instead of leaving the scan stuck in progress.
  stalledInterval: 30_000,
  maxStalledCount: 1,
});

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
