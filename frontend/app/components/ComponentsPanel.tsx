"use client";

// Owns everything around the components table: paged loading, a cheap
// client-side name filter over the current page, and the CycloneDX download.
// The table itself (ComponentsTable) stays presentational.

import { useMemo, useState } from "react";
import { downloadExport, ScanApiError } from "../lib/scan-api";
import { COMPONENTS_PAGE_SIZE, useComponents } from "../lib/useScan";
import { ComponentsTable } from "./ComponentsTable";

// Turn a Blob + filename into a browser download. Kept here (not in scan-api)
// so the API client stays free of DOM wiring.
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

type DownloadState =
  | { status: "idle" }
  | { status: "downloading" }
  | { status: "error"; message: string };

export function ComponentsPanel({ scanId }: { scanId: string }) {
  const { state, page, setPage } = useComponents(scanId, true);
  const [filter, setFilter] = useState("");
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });

  const data = state.status === "ready" ? state.data : null;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / COMPONENTS_PAGE_SIZE));

  // Filter is client-side over the loaded page only — matching the roadmap's
  // "client-side name filter if cheap". Server-side search stays out of scope.
  const visibleComponents = useMemo(() => {
    if (!data) return [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return data.components;
    return data.components.filter((component) =>
      component.name.toLowerCase().includes(needle)
    );
  }, [data, filter]);

  async function handleDownload() {
    setDownload({ status: "downloading" });
    try {
      const { blob, filename } = await downloadExport(scanId);
      saveBlob(blob, filename);
      setDownload({ status: "idle" });
    } catch (error) {
      setDownload({
        status: "error",
        message:
          error instanceof ScanApiError
            ? error.message
            : "Could not download the SBOM. Please try again."
      });
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
      <div className="flex flex-col gap-4 border-b border-white/10 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Components</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span>Scan ID: {scanId}</span>
              <span>Total {total}</span>
              <span>
                Page {page} of {pageCount}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={download.status === "downloading" || state.status !== "ready"}
              className="h-11 shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {download.status === "downloading" ? "Preparing..." : "Download CycloneDX"}
            </button>
            {download.status === "error" ? (
              <p className="max-w-xs text-right text-xs text-red-200">{download.message}</p>
            ) : null}
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-200">Filter by name</span>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="e.g. express"
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full max-w-sm rounded-xl border border-white/10 bg-slate-900/80 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
          />
        </label>
      </div>

      {state.status === "loading" ? (
        <div className="p-6 text-sm text-slate-300">Loading components...</div>
      ) : state.status === "error" ? (
        <div className="m-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
          {state.message}
        </div>
      ) : (
        <>
          <ComponentsTable components={visibleComponents} />
          <div className="flex items-center justify-between gap-4 border-t border-white/10 p-6">
            <p className="text-sm text-slate-400">
              {filter.trim()
                ? `Showing ${visibleComponents.length} of ${data?.components.length ?? 0} on this page`
                : `Showing ${visibleComponents.length} of ${total} total`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount, page + 1))}
                disabled={page >= pageCount}
                className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
