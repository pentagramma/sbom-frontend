import { randomBytes } from 'node:crypto';

// 8 hex chars, e.g. scn_9b3a2f8c / cmp_4f2e91aa per the contract examples.
export function newScanId(): string {
  return `scn_${randomBytes(4).toString('hex')}`;
}

export function newComponentId(): string {
  return `cmp_${randomBytes(4).toString('hex')}`;
}
