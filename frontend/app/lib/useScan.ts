"use client";

// Two hooks, one concern each:
//   useScan       — polls GET /scans/:id for live status (roadmap: "auto-
//                   refreshing status check with slowing refresh rate").
//   useComponents — loads GET /scans/:id/components a page at a time once the
//                   scan is complete.
// Splitting them keeps the poll loop terminal on completion, while pagination
// re-fetches independently as the user moves between pages.

import { useEffect, useRef, useState } from "react";
import type { Scan, ScanComponentsResponse } from "./scan-api";
import { getComponents, getScan, ScanApiError } from "./scan-api";

const BACKOFF = [
  { untilMs: 15_000, intervalMs: 3_000 },
  { untilMs: 45_000, intervalMs: 5_000 },
  { untilMs: Infinity, intervalMs: 10_000 }
];

export const COMPONENTS_PAGE_SIZE = 50;

function intervalFor(elapsedMs: number): number {
  return BACKOFF.find((step) => elapsedMs < step.untilMs)!.intervalMs;
}

export type ScanPollState =
  | { status: "loading" }
  | { status: "polling"; scan: Scan }
  | { status: "completed"; scan: Scan }
  | { status: "failed"; scan: Scan }
  | { status: "error"; code: string; message: string };

export function useScan(scanId: string | null): ScanPollState {
  const [state, setState] = useState<ScanPollState>({ status: "loading" });
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!scanId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    let initialized = false;
    startedAt.current = Date.now();

    async function poll() {
      if (!initialized) {
        initialized = true;
        setState({ status: "loading" });
      }

      try {
        const scan = await getScan(scanId!);

        if (cancelled) return;

        if (scan.status === "completed") {
          setState({ status: "completed", scan });
          return;
        }

        if (scan.status === "failed") {
          setState({ status: "failed", scan });
          return;
        }

        setState({ status: "polling", scan });
        const elapsed = Date.now() - (startedAt.current ?? Date.now());
        timeoutId = window.setTimeout(poll, intervalFor(elapsed));
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ScanApiError) {
          setState({ status: "error", code: error.code, message: error.message });
          return;
        }

        // Network hiccup: keep the last known state and retry on the cadence.
        const elapsed = Date.now() - (startedAt.current ?? Date.now());
        timeoutId = window.setTimeout(poll, intervalFor(elapsed));
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [scanId]);

  return state;
}

export type ComponentsState =
  | { status: "loading" }
  | { status: "ready"; data: ScanComponentsResponse }
  | { status: "error"; code: string; message: string };

// Paginated components loader. `page` is owned here; call `setPage` to move
// between pages and the effect re-fetches. Only runs while `enabled` (i.e. the
// scan has completed), so it never races the 409 the endpoint returns earlier.
export function useComponents(scanId: string | null, enabled: boolean) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<ComponentsState>({ status: "loading" });

  useEffect(() => {
    if (!scanId || !enabled) {
      return;
    }

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const data = await getComponents(scanId!, { page, limit: COMPONENTS_PAGE_SIZE });
        if (!cancelled) setState({ status: "ready", data });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ScanApiError) {
          setState({ status: "error", code: error.code, message: error.message });
        } else {
          setState({
            status: "error",
            code: "NETWORK_ERROR",
            message: "Could not load components. Please try again."
          });
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [scanId, enabled, page]);

  return { state, page, setPage };
}
