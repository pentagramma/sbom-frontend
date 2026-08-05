// Scan API client, typed to docs/mvp-api-contract-v1.md. Every shape here is
// copied from the contract — if the contract changes, this file changes with it.
//
// The UI only ever talks to `createScan` / `getScan`. Whether the data comes
// from the real backend or the in-browser fake is decided by env:
// set NEXT_PUBLIC_API_URL to use the real API, leave it unset for the fake.
// Switchover on days 11-12 is one env var, zero component changes.

import { fakeCreateScan, fakeGetComponents, fakeGetScan } from "./fake-scan-api";

export const SCAN_PROGRESS_STATUSES = [
  "queued",
  "cloning",
  "scanning",
  "enriching",
  "completed"
] as const;

export type ScanProgressStatus = (typeof SCAN_PROGRESS_STATUSES)[number];
export type ScanStatus = ScanProgressStatus | "failed";

export type Scan = {
  id: string;
  status: ScanStatus;
  phase: number;
  phaseCount: number;
  repoUrl: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
};

export type ScanComponent = {
  id: string;
  name: string;
  version: string;
  type: string;
  purl: string;
  licenses: string[];
  direct: boolean;
};

export type ScanComponentsResponse = {
  scanId: string;
  page: number;
  limit: number;
  total: number;
  components: ScanComponent[];
};

export type CreateScanResponse = {
  id: string;
  status: "queued";
  repoUrl: string;
  createdAt: string;
};

export type CreateScanRequest = {
  repoUrl: string;
};

export type GetComponentsRequest = {
  page?: number;
  limit?: number;
};

export class ScanApiError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

const AUTH_HEADER = { Authorization: "Bearer dev_placeholder" };

async function parseError(response: Response): Promise<never> {
  let code = "UNKNOWN";
  let message = `API returned ${response.status}.`;

  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // non-JSON error body; keep the fallback message
  }

  throw new ScanApiError(code, message);
}

export async function createScan({
  repoUrl
}: CreateScanRequest): Promise<CreateScanResponse> {
  if (!API_BASE) {
    return fakeCreateScan({ repoUrl });
  }

  const response = await fetch(`${API_BASE}/api/v1/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...AUTH_HEADER },
    body: JSON.stringify({ repoUrl })
  });

  if (!response.ok) {
    return parseError(response);
  }

  return (await response.json()) as CreateScanResponse;
}

export async function getScan(scanId: string): Promise<Scan> {
  if (!API_BASE) {
    return fakeGetScan(scanId);
  }

  const response = await fetch(`${API_BASE}/api/v1/scans/${scanId}`, {
    headers: AUTH_HEADER
  });

  if (!response.ok) {
    return parseError(response);
  }

  return (await response.json()) as Scan;
}

export async function getComponents(
  scanId: string,
  options: GetComponentsRequest = {}
): Promise<ScanComponentsResponse> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;

  if (!API_BASE) {
    return fakeGetComponents(scanId, { page, limit });
  }

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });

  const response = await fetch(`${API_BASE}/api/v1/scans/${scanId}/components?${params}`, {
    headers: AUTH_HEADER
  });

  if (!response.ok) {
    return parseError(response);
  }

  return (await response.json()) as ScanComponentsResponse;
}
