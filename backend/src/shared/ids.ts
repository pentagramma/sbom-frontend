// Prefixed random ids so a bare id tells you what it is at a glance:
// scn_ = scan, cmp_ = component. 8 hex chars each, per the contract examples.
import { randomBytes } from 'node:crypto';

export function newScanId(): string {
  return `scn_${randomBytes(4).toString('hex')}`;
}

// Used by the worker's enriching step when inserting rows into `components`.
export function newComponentId(): string {
  return `cmp_${randomBytes(4).toString('hex')}`;
}
