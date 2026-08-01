"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { createScan, ScanApiError } from "../lib/scan-api";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export default function RepoLookupPage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedRepoUrl = repoUrl.trim();
    if (!trimmedRepoUrl || submitState.status === "submitting") {
      return;
    }

    setSubmitState({ status: "submitting" });

    try {
      const scan = await createScan({ repoUrl: trimmedRepoUrl });
      router.push(`/scans/${scan.id}`);
    } catch (error) {
      setSubmitState({
        status: "error",
        message:
          error instanceof ScanApiError
            ? error.message
            : "Could not start the scan. Check the repository URL and try again."
      });
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">GitHub lookup</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Search a repository link</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Paste a GitHub or GitLab repository URL, then start a scan. All status updates come
            from the shared scan API.
          </p>

          <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
            <label className="block flex-1">
              <span className="mb-2 block text-sm font-medium text-slate-200">Repository URL</span>
              <input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="https://github.com/vercel/next.js"
                autoComplete="off"
                spellCheck={false}
                className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
              />
            </label>
            <button
              type="submit"
              disabled={!repoUrl.trim() || submitState.status === "submitting"}
              className="h-12 shrink-0 rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-6 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitState.status === "submitting" ? "Starting scan..." : "Scan repository"}
            </button>
          </form>

          {submitState.status === "error" ? (
            <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-100">
              {submitState.message}
            </p>
          ) : null}
        </header>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-400">
          Supported inputs: GitHub and GitLab repository URLs. The scan page shows queued,
          cloning, scanning, enriching, completed, and failed states.
        </div>
      </section>
    </main>
  );
}
