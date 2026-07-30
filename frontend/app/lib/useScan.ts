"use client";

// Reusable polling hook for a scan (roadmap: "auto-refreshing status check
// with slowing refresh rate, packaged as a reusable hook").
//
// Polls GET /scans/:id on the contract's cadence — every 3s, backing off to
// 5s then 10s — and stops on the terminal states (completed / failed) or a
// SCAN_NOT_FOUND. Works identically against the fake and the real API.

import { useEffect, useRef, useState } from "react";
import type { Scan } from "./scan-api";
import { getScan, ScanApiError } from "./scan-api";

const BACKOFF = [
  { untilMs: 15_000, intervalMs: 3_000 },
  { untilMs: 45_000, intervalMs: 5_000 },
  { untilMs: Infinity, intervalMs: 10_000 }
];

function intervalFor(elapsedMs: number): number {
  return BACKOFF.find((step) => elapsedMs < step.untilMs)!.intervalMs;
}

export type ScanPollState =
  | { status: "loading" }
  | { status: "polling"; scan: Scan }
  | { status: "settled"; scan: Scan }
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
    startedAt.current = Date.now();
    setState({ status: "loading" });

    async function poll() {
      try {
        const scan = await getScan(scanId!);

        if (cancelled) return;

        if (scan.status === "completed" || scan.status === "failed") {
          setState({ status: "settled", scan });
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
