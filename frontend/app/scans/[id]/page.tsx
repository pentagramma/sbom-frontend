"use client";

// /scans/:id — live scan status. The id lives in the URL (per the contract,
// this page must rebuild from a refresh), the polling hook does the rest.

import Link from "next/link";
import { useParams } from "next/navigation";
import { ComponentsTable } from "../../components/ComponentsTable";
import { ScanProgress } from "../../components/ScanProgress";
import { useScan } from "../../lib/useScan";

export default function ScanStatusPage() {
  const params = useParams<{ id: string }>();
  const state = useScan(params.id ?? null);

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
              state.status === "completed" ? (
                <ComponentsTable data={state.components} />
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-slate-300">
                  Loading components...
                </div>
              )
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
