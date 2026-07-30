// The scan lifecycle, in one place, shared by the API and worker so they never
// disagree. Order is meaningful — the worker walks the list top to bottom.
// Per docs/mvp-api-contract-v1.md; `failed` is terminal and reachable from any
// of these.
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
