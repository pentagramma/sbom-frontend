"use client";

// /scans/:id — live scan status. The id lives in the URL (per the contract,
// this page must rebuild from a refresh), the polling hook does the rest.

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ComponentsTable } from "../../components/ComponentsTable";
import { ComponentsPagination } from "../../components/ComponentsPagination";
import { ScanProgress } from "../../components/ScanProgress";
import { useScan } from "../../lib/useScan";
import { useScanComponents } from "../../lib/useScanComponents";
import { exportScan, ScanApiError } from "../../lib/scan-api";

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v2.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ScanStatusPage() {
  const params = useParams<{ id: string }>();
  const state = useScan(params.id ?? null);
  const demoMode = !process.env.NEXT_PUBLIC_API_URL;
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(2);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const scanIsComplete = state.status === "completed";
  const componentsState = useScanComponents(
    scanIsComplete ? state.scan.id : null,
    scanIsComplete,
    page,
    limit
  );

  async function handleExport() {
    if (state.status !== "completed") {
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const exported = await exportScan(state.scan.id, { format: "cyclonedx" });
      const blob = new Blob([exported.body], { type: exported.contentType });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = exported.filename;
      link.rel = "noopener";
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      if (error instanceof ScanApiError) {
        setExportError(error.message);
      } else {
        setExportError("Failed to export SBOM.");
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Scan</p>
            <h1 className="mt-1 font-mono text-xl text-slate-200">{params.id}</h1>
          </div>
          <Link
            href="/repo"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            Scan another repository
          </Link>
        </header>

        {demoMode ? (
          <div className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
            Demo mode is active, so this scan is using the in-browser fake API.
          </div>
        ) : null}

        {state.status === "loading" ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">
            Loading scan status...
          </div>
        ) : state.status === "error" ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-red-100">
            <p className="font-medium">{state.message}</p>
            <p className="mt-2 text-sm text-red-200/80">
              The scan may have expired or the link may be wrong.{" "}
              <Link href="/repo" className="underline hover:text-red-100">
                Start a new scan
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <ScanProgress scan={state.scan} />
            {state.scan.status === "completed" ? (
              componentsState.status === "loading" || componentsState.status === "idle" ? (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                  Loading components...
                </div>
              ) : componentsState.status === "error" ? (
                <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-sm text-red-100">
                  {componentsState.message}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-100">Export SBOM</p>
                      <p className="text-sm text-slate-400">
                        Download the completed CycloneDX document for this scan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExport}
                      disabled={isExporting}
                      className="inline-flex items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="mr-2">
                        <ExportIcon />
                      </span>
                      {isExporting ? "Exporting..." : "Export SBOM"}
                    </button>
                  </div>

                  {exportError ? (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                      {exportError}
                    </div>
                  ) : null}

                  <ComponentsTable data={componentsState.components} />

                  <ComponentsPagination
                    page={page}
                    limit={limit}
                    total={componentsState.components.total}
                    onPageChange={setPage}
                    onLimitChange={(nextLimit) => {
                      setPage(1);
                      setLimit(nextLimit);
                    }}
                  />
                </div>
              )
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
