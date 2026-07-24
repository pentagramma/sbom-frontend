// Ordered progress statuses per docs/mvp-api-contract-v1.md; `failed` is
// terminal and reachable from any of them.
export const PROGRESS_STATUSES = [
  'queued',
  'cloning',
  'scanning',
  'enriching',
  'completed',
] as const;

export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];
export type ScanStatus = ProgressStatus | 'failed';

export const PHASE_COUNT = PROGRESS_STATUSES.length;

// Contract examples are 1-based: status "scanning" => phase 3.
export function phaseOf(status: ProgressStatus): number {
  return PROGRESS_STATUSES.indexOf(status) + 1;
}
