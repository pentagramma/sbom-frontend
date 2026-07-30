// Shared queue + Redis config used by BOTH processes. The API and worker must
// agree on the queue name and connection, or jobs would never meet.
import type { ConnectionOptions } from 'bullmq';

// The one queue name. The API adds jobs to it; the worker consumes from it.
export const SCAN_QUEUE = 'scans';

// 30 min hard job timeout per the contract; overridable for local testing.
export const JOB_TIMEOUT_MS = Number(process.env.SCAN_JOB_TIMEOUT_MS ?? 30 * 60 * 1000);

// The payload the API puts on the queue and the worker reads off it. Keep it
// small — just what the worker needs to find the scan and clone the repo.
export interface ScanJobData {
  scanId: string;
  repoUrl: string;
}

export function redisConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    // Required by BullMQ workers so blocking commands never give up.
    maxRetriesPerRequest: null,
  };
}
