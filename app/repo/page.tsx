"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type RepoInfo = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  homepage: string | null;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
};

type RepoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; repo: RepoInfo }
  | { status: "error"; message: string };

function parseGithubRepo(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const directMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)/
  );

  if (directMatch) {
    return {
      owner: directMatch[1],
      repo: directMatch[2].replace(/\.git$/, "")
    };
  }

  const shorthandMatch = trimmed.match(/^([^/\s]+)\/([^/\s?#]+)$/);

  if (shorthandMatch) {
    return {
      owner: shorthandMatch[1],
      repo: shorthandMatch[2].replace(/\.git$/, "")
    };
  }

  return null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export default function RepoLookupPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<RepoState>({ status: "idle" });

  const parsed = useMemo(() => parseGithubRepo(query), [query]);

  useEffect(() => {
    const repoRef = parsed;

    if (!repoRef) {
      setState({ status: "idle" });
      return;
    }

    const { owner, repo } = repoRef;

    const controller = new AbortController();

    async function loadRepo() {
      setState({ status: "loading" });

      try {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}`,
          {
            signal: controller.signal,
            headers: {
              Accept: "application/vnd.github+json"
            }
          }
        );

        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? "Repository not found."
              : `GitHub returned ${response.status}.`
          );
        }

        const repoData = (await response.json()) as RepoInfo;
        setState({ status: "success", repo: repoData });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load repository."
        });
      }
    }

    const timeoutId = window.setTimeout(loadRepo, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [parsed]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">GitHub lookup</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Search a repository link</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Paste a GitHub repo URL or `owner/repo`. The page fetches metadata automatically.
          </p>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-medium text-slate-200">Repository link</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="https://github.com/vercel/next.js"
              className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
            />
          </label>
        </header>

        {!query ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-400">
            Paste a GitHub repository link to see details.
          </div>
        ) : state.status === "loading" ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-slate-300">
            Loading repository details...
          </div>
        ) : state.status === "error" ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-red-100">
            {state.message}
          </div>
        ) : state.status === "success" ? (
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
            <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start">
              <div className="flex items-center gap-4">
                <img
                  src={state.repo.owner.avatar_url}
                  alt={state.repo.owner.login}
                  className="h-[72px] w-[72px] rounded-2xl object-cover"
                />
                <div>
                  <p className="text-sm text-slate-400">Owner</p>
                  <Link
                    href={state.repo.owner.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-cyan-300 hover:text-cyan-200"
                  >
                    {state.repo.owner.login}
                  </Link>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={state.repo.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xl font-semibold tracking-tight text-slate-50 hover:text-cyan-300"
                >
                  {state.repo.full_name}
                </Link>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  {state.repo.description ?? "No description provided."}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Stars" value={state.repo.stargazers_count.toLocaleString()} />
                  <Stat label="Forks" value={state.repo.forks_count.toLocaleString()} />
                  <Stat label="Open issues" value={state.repo.open_issues_count.toLocaleString()} />
                  <Stat label="Language" value={state.repo.language ?? "Unknown"} />
                </div>

                <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-300">
                  <Meta label="Updated" value={formatDate(state.repo.updated_at)} />
                  {state.repo.homepage ? (
                    <Meta
                      label="Homepage"
                      value={
                        <a
                          href={
                            /^https?:\/\//i.test(state.repo.homepage)
                              ? state.repo.homepage
                              : `https://${state.repo.homepage}`
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-cyan-300 hover:text-cyan-200"
                        >
                          {state.repo.homepage}
                        </a>
                      }
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Meta({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-full border border-white/10 bg-slate-950/50 px-4 py-2">
      <span className="text-slate-500">{label}: </span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}
