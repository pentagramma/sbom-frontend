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

import type {
  CreateScanRequest,
  CreateScanResponse,
  GetComponentsRequest,
  Scan,
  ScanComponent,
  ScanComponentsResponse
} from "./scan-api";
import { ScanApiError, SCAN_PROGRESS_STATUSES } from "./scan-api";

const PHASE_MS = 3000;
const STORAGE_PREFIX = "fake-scan:";

const CLONE_FAILED_MESSAGE =
  "Repository could not be cloned. It may be private or the URL may be invalid.";

type StoredScan = {
  repoUrl: string;
  createdAt: string;
};

type ScanSnapshot = Scan & {
  repoUrl: string;
};

const GENERIC_COMPONENTS: ScanComponent[] = [
  {
    id: "cmp_accepts",
    name: "accepts",
    version: "1.3.8",
    type: "library",
    purl: "pkg:npm/accepts@1.3.8",
    licenses: ["MIT"],
    direct: true
  },
  {
    id: "cmp_body_parser",
    name: "body-parser",
    version: "1.20.3",
    type: "library",
    purl: "pkg:npm/body-parser@1.20.3",
    licenses: ["MIT"],
    direct: true
  },
  {
    id: "cmp_debug",
    name: "debug",
    version: "4.3.7",
    type: "library",
    purl: "pkg:npm/debug@4.3.7",
    licenses: ["MIT"],
    direct: true
  },
  {
    id: "cmp_finalhandler",
    name: "finalhandler",
    version: "1.3.1",
    type: "library",
    purl: "pkg:npm/finalhandler@1.3.1",
    licenses: ["MIT"],
    direct: false
  },
  {
    id: "cmp_mime_types",
    name: "mime-types",
    version: "3.0.1",
    type: "library",
    purl: "pkg:npm/mime-types@3.0.1",
    licenses: ["MIT"],
    direct: false
  },
  {
    id: "cmp_qs",
    name: "qs",
    version: "6.14.0",
    type: "library",
    purl: "pkg:npm/qs@6.14.0",
    licenses: ["BSD-3-Clause"],
    direct: true
  },
  {
    id: "cmp_send",
    name: "send",
    version: "1.2.0",
    type: "library",
    purl: "pkg:npm/send@1.2.0",
    licenses: ["MIT"],
    direct: false
  },
  {
    id: "cmp_type_is",
    name: "type-is",
    version: "2.0.1",
    type: "library",
    purl: "pkg:npm/type-is@2.0.1",
    licenses: ["MIT"],
    direct: false
  }
];

function newScanId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `scn_${hex}`;
}

function readStoredScan(scanId: string): StoredScan {
  const raw = sessionStorage.getItem(STORAGE_PREFIX + scanId);

  if (!raw) {
    throw new ScanApiError("SCAN_NOT_FOUND", `No scan with id ${scanId}`);
  }

  return JSON.parse(raw) as StoredScan;
}

function deriveScanSnapshot(scanId: string, stored: StoredScan): ScanSnapshot {
  const elapsed = Date.now() - new Date(stored.createdAt).getTime();
  const phaseCount = SCAN_PROGRESS_STATUSES.length;
  const shouldFail = stored.repoUrl.toLowerCase().includes("fail");
  const phaseIndex = Math.min(Math.floor(elapsed / PHASE_MS), phaseCount - 1);

  if (shouldFail && phaseIndex >= 1) {
    return {
      id: scanId,
      status: "failed",
      phase: 2,
      phaseCount,
      repoUrl: stored.repoUrl,
      createdAt: stored.createdAt,
      updatedAt: new Date(new Date(stored.createdAt).getTime() + 2 * PHASE_MS).toISOString(),
      error: CLONE_FAILED_MESSAGE
    };
  }

  return {
    id: scanId,
    status: SCAN_PROGRESS_STATUSES[phaseIndex],
    phase: phaseIndex + 1,
    phaseCount,
    repoUrl: stored.repoUrl,
    createdAt: stored.createdAt,
    updatedAt: new Date().toISOString(),
    error: null
  };
}

function fakeComponentsForRepo(repoUrl: string): ScanComponent[] {
  const lower = repoUrl.toLowerCase();

  if (lower.includes("expressjs/express")) {
    return GENERIC_COMPONENTS;
  }

  if (lower.includes("vercel/next.js")) {
    return [
      {
        id: "cmp_next_env",
        name: "@next/env",
        version: "16.2.10",
        type: "library",
        purl: "pkg:npm/@next/env@16.2.10",
        licenses: ["MIT"],
        direct: true
      },
      {
        id: "cmp_react",
        name: "react",
        version: "19.1.0",
        type: "library",
        purl: "pkg:npm/react@19.1.0",
        licenses: ["MIT"],
        direct: true
      },
      ...GENERIC_COMPONENTS.slice(1, 5)
    ];
  }

  return GENERIC_COMPONENTS;
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
  const stored = readStoredScan(scanId);
  const scan = deriveScanSnapshot(scanId, stored);

  return scan;
}

export async function fakeGetComponents(
  scanId: string,
  options: GetComponentsRequest = {}
): Promise<ScanComponentsResponse> {
  const stored = readStoredScan(scanId);
  const scan = deriveScanSnapshot(scanId, stored);

  if (scan.status !== "completed") {
    throw new ScanApiError("SCAN_NOT_COMPLETE", "Scan is not completed yet");
  }

  const page = Math.max(1, Math.floor(options.page ?? 1));
  const limit = Math.max(1, Math.floor(options.limit ?? 50));
  const allComponents = fakeComponentsForRepo(stored.repoUrl);
  const startIndex = (page - 1) * limit;

  return {
    scanId,
    page,
    limit,
    total: allComponents.length,
    components: allComponents.slice(startIndex, startIndex + limit)
  };
}

// Mirrors the backend export: hands back a CycloneDX JSON document, built here
// from the same fake components the table shows so the download is coherent
// with the UI. `format` is validated like the real endpoint.
export async function fakeExport(
  scanId: string,
  format: string
): Promise<{ blob: Blob; filename: string }> {
  if (format !== "cyclonedx") {
    throw new ScanApiError("UNSUPPORTED_FORMAT", `Unsupported export format: ${format}`);
  }

  const stored = readStoredScan(scanId);
  const scan = deriveScanSnapshot(scanId, stored);

  if (scan.status !== "completed") {
    throw new ScanApiError("SCAN_NOT_COMPLETE", "Scan is not completed yet");
  }

  const document = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: "application", name: stored.repoUrl }
    },
    components: fakeComponentsForRepo(stored.repoUrl).map((component) => ({
      type: component.type,
      name: component.name,
      version: component.version,
      purl: component.purl,
      licenses: component.licenses.map((id) => ({ license: { id } }))
    }))
  };

  const blob = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" });
  return { blob, filename: `${scanId}.cyclonedx.json` };
}
