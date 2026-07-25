import type { ConnectionOptions } from 'bullmq';

export const SCAN_QUEUE = 'scans';

// 30 min hard job timeout per the contract; overridable for local testing.
export const JOB_TIMEOUT_MS = Number(process.env.SCAN_JOB_TIMEOUT_MS ?? 30 * 60 * 1000);

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
