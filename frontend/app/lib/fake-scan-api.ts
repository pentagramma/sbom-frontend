// In-browser fake of the scan API, returning the contract's response shapes
// (docs/mvp-api-contract-v1.md) so the UI is built against real payloads
// before the backend is wired in.
//
// Design: a scan's state is *derived from elapsed time* since creation, not
// stored — mirroring the backend's placeholder worker (~3s per phase). Created
// scans persist in sessionStorage so refresh/revisit of /scans/:id works, the
// same page-load recovery the real API supports.
//
// Failure path: any repo URL containing "fail" fails at the cloning phase with
// the contract's example error, so the failed UI is exercisable on demand.

import type { CreateScanRequest, CreateScanResponse, Scan } from "./scan-api";
import { ScanApiError, SCAN_PROGRESS_STATUSES } from "./scan-api";

const PHASE_MS = 3000;
const STORAGE_PREFIX = "fake-scan:";

const CLONE_FAILED_MESSAGE =
  "Repository could not be cloned. It may be private or the URL may be invalid.";

type StoredScan = {
  repoUrl: string;
  createdAt: string;
};

function newScanId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `scn_${hex}`;
}

export async function fakeCreateScan({
  repoUrl
}: CreateScanRequest): Promise<CreateScanResponse> {
  if (!/^https?:\/\/(www\.)?(github|gitlab)\.com\/[^/]+\/[^/]+/.test(repoUrl)) {
    throw new ScanApiError(
      "INVALID_REPO_URL",
      "repoUrl must be a GitHub or GitLab repository URL"
    );
  }

  const id = newScanId();
  const createdAt = new Date().toISOString();
  const stored: StoredScan = { repoUrl, createdAt };
  sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(stored));

  return { id, status: "queued", repoUrl, createdAt };
}

export async function fakeGetScan(scanId: string): Promise<Scan> {
  const raw = sessionStorage.getItem(STORAGE_PREFIX + scanId);

  if (!raw) {
    throw new ScanApiError("SCAN_NOT_FOUND", `No scan with id ${scanId}`);
  }

  const { repoUrl, createdAt } = JSON.parse(raw) as StoredScan;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const phaseCount = SCAN_PROGRESS_STATUSES.length;

  const shouldFail = repoUrl.toLowerCase().includes("fail");
  // Phase N is active from N*PHASE_MS; index clamped to the final phase.
  const phaseIndex = Math.min(Math.floor(elapsed / PHASE_MS), phaseCount - 1);

  if (shouldFail && phaseIndex >= 1) {
    return {
      id: scanId,
      status: "failed",
      phase: 2,
      phaseCount,
      repoUrl,
      createdAt,
      updatedAt: new Date(new Date(createdAt).getTime() + 2 * PHASE_MS).toISOString(),
      error: CLONE_FAILED_MESSAGE
    };
  }

  return {
    id: scanId,
    status: SCAN_PROGRESS_STATUSES[phaseIndex],
    phase: phaseIndex + 1,
    phaseCount,
    repoUrl,
    createdAt,
    updatedAt: new Date().toISOString(),
    error: null
  };
}
