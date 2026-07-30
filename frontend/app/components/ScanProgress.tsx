"use client";

// Scan progress UI (chips per phase), driven by the contract's scan resource:
// status string + phase/phaseCount, including the terminal `failed` state with
// its human-readable error.

import type { Scan } from "../lib/scan-api";
import { SCAN_PROGRESS_STATUSES } from "../lib/scan-api";

export function ScanProgress({ scan }: { scan: Scan }) {
  const failed = scan.status === "failed";
  // On failure, `phase` is where the scan stopped; that chip renders red.
  const currentIndex = failed
    ? scan.phase - 1
    : Math.max(SCAN_PROGRESS_STATUSES.indexOf(scan.status as never), 0);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div
          className={[
            "flex h-16 w-16 items-center justify-center rounded-2xl border",
            failed
              ? "border-red-400/20 bg-red-400/10 text-red-300"
              : "border-cyan-400/20 bg-cyan-400/10 text-cyan-300"
          ].join(" ")}
        >
          {failed ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <path
                d="M12 8v5m0 3.5v.5M4.5 19.5h15L12 4.5l-7.5 15Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
              <path
                d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>

        <p
          className={[
            "mt-5 text-sm uppercase tracking-[0.3em]",
            failed ? "text-red-300/80" : "text-cyan-300/80"
          ].join(" ")}
        >
          {failed ? "Scan failed" : scan.status === "completed" ? "Scan complete" : "Scanning"}
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
          {failed
            ? "This scan could not finish"
            : scan.status === "completed"
              ? "Repository analysis complete"
              : "Analyzing repository"}
        </h2>
        <p className="mt-3 break-all text-sm text-slate-300">{scan.repoUrl}</p>

        <div className="mt-8 w-full rounded-3xl border border-white/10 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            {SCAN_PROGRESS_STATUSES.map((item, index) => {
              const isFailedHere = failed && index === currentIndex;
              const isActive = !failed && index === currentIndex && item !== "completed";
              const isDone =
                index < currentIndex || (!failed && scan.status === "completed");

              return (
                <div
                  key={item}
                  className={[
                    "flex items-center gap-2 rounded-full border px-4 py-2 capitalize transition",
                    isFailedHere
                      ? "border-red-400/40 bg-red-400/10 text-red-200"
                      : isActive
                        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                        : isDone
                          ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-white/5 text-slate-400"
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-2.5 w-2.5 rounded-full",
                      isFailedHere
                        ? "bg-red-300"
                        : isActive
                          ? "bg-cyan-300"
                          : isDone
                            ? "bg-emerald-300"
                            : "bg-slate-600"
                    ].join(" ")}
                  />
                  {item}
                </div>
              );
            })}
          </div>
        </div>

        {failed && scan.error ? (
          <div className="mt-6 w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
            {scan.error}
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-400">
            Stage {scan.phase} of {scan.phaseCount}:{" "}
            <span className="text-slate-200">{scan.status}</span>
          </p>
        )}
      </div>
    </section>
  );
}
