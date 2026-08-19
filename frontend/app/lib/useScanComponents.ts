"use client";

import { useEffect, useState } from "react";
import type { ScanComponentsResponse } from "./scan-api";
import { getComponents, ScanApiError } from "./scan-api";

export type ScanComponentsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "completed"; components: ScanComponentsResponse }
  | { status: "error"; code: string; message: string };

export function useScanComponents(
  scanId: string | null,
  enabled: boolean,
  page: number,
  limit: number
): ScanComponentsState {
  const shouldLoad = Boolean(scanId && enabled);
  const queryKey = shouldLoad ? `${scanId}:${page}:${limit}` : null;
  const [loaded, setLoaded] = useState<{
    queryKey: string;
    components?: ScanComponentsResponse;
    code?: string;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (!queryKey || !scanId) {
      return;
    }

    const resolvedScanId = scanId;
    const resolvedQueryKey = queryKey;

    let cancelled = false;

    async function loadComponents() {
      try {
        const components = await getComponents(resolvedScanId, { page, limit });

        if (cancelled) {
          return;
        }

        setLoaded({ queryKey: resolvedQueryKey, components });
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ScanApiError) {
          setLoaded({ queryKey: resolvedQueryKey, code: error.code, message: error.message });
          return;
        }

        setLoaded({
          queryKey: resolvedQueryKey,
          code: "UNKNOWN",
          message: "Failed to load components."
        });
      }
    }

    loadComponents();

    return () => {
      cancelled = true;
    };
  }, [scanId, page, limit, queryKey]);

  if (!queryKey) {
    return { status: "idle" };
  }

  if (!loaded || loaded.queryKey !== queryKey) {
    return { status: "loading" };
  }

  if (loaded.code && loaded.message) {
    return { status: "error", code: loaded.code, message: loaded.message };
  }

  return { status: "completed", components: loaded.components! };
}
