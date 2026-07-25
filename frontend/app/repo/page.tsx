"use client";

import Image from "next/image";
import Link from "next/link";
import type { ChangeEvent, ReactNode } from "react";
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

type PackageJsonData = {
  name?: string;
  version?: string;
  private?: boolean;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
};

type PackageJsonState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; packageJson: PackageJsonData }
  | { status: "missing" }
  | { status: "error"; message: string };

type ScanPhase = "idle" | "queued" | "cloning" | "scanning" | "enriching" | "completed";

const scanPhases: ScanPhase[] = ["queued", "cloning", "scanning", "enriching", "completed"];

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

async function fetchPackageJson(
  owner: string,
  repo: string,
  signal: AbortSignal
): Promise<PackageJsonState> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
    {
      signal,
      headers: {
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (response.status === 404) {
    return { status: "missing" };
  }

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} while loading package.json.`);
  }

  const data = (await response.json()) as {
    content?: string;
    encoding?: string;
  };

  if (data.encoding !== "base64" || !data.content) {
    throw new Error("GitHub returned package.json in an unexpected format.");
  }

  const decoded = window.atob(data.content.replace(/\n/g, ""));

  try {
    return { status: "success", packageJson: JSON.parse(decoded) as PackageJsonData };
  } catch {
    throw new Error("package.json could not be parsed.");
  }
}

export default function RepoLookupPage() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [state, setState] = useState<RepoState>({ status: "idle" });
  const [packageJsonState, setPackageJsonState] = useState<PackageJsonState>({
    status: "idle"
  });

  const parsed = useMemo(() => parseGithubRepo(query), [query]);

  function handleQueryChange(event: ChangeEvent<HTMLInputElement>) {
    const nextQuery = event.target.value;
    const nextParsed = parseGithubRepo(nextQuery);

    setQuery(nextQuery);

    if (!nextQuery.trim() || !nextParsed) {
      setPhase("idle");
      setState({ status: "idle" });
      setPackageJsonState({ status: "idle" });
      return;
    }

    setPhase("queued");
    setState({ status: "loading" });
    setPackageJsonState({ status: "loading" });
  }

  useEffect(() => {
    const repoRef = parsed;

    if (!repoRef) {
      return;
    }

    const { owner, repo } = repoRef;
    const controller = new AbortController();
    const timeoutIds: number[] = [];

    async function loadRepo() {
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
          signal: controller.signal,
          headers: {
            Accept: "application/vnd.github+json"
          }
        });

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

    async function loadPackageJson() {
      try {
        const packageJsonResult = await fetchPackageJson(owner, repo, controller.signal);
        setPackageJsonState(packageJsonResult);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setPackageJsonState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load package.json."
        });
      }
    }

    const phaseTimings = [
      { phase: "cloning" as const, delay: 1500 },
      { phase: "scanning" as const, delay: 3000 },
      { phase: "enriching" as const, delay: 4500 },
      { phase: "completed" as const, delay: 6000 }
    ];

    timeoutIds.push(window.setTimeout(loadRepo, 100));
    timeoutIds.push(window.setTimeout(loadPackageJson, 100));

    phaseTimings.forEach(({ phase: nextPhase, delay }) => {
      timeoutIds.push(
        window.setTimeout(() => {
          setPhase(nextPhase);
        }, delay)
      );
    });

    return () => {
      controller.abort();
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [parsed]);

  const showStatusScreen = phase !== "idle" && phase !== "completed";

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
              onChange={handleQueryChange}
              placeholder="https://github.com/vercel/next.js"
              className="h-12 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
            />
          </label>
        </header>

        {!query ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-8 text-slate-400">
            Paste a GitHub repository link to see details.
          </div>
        ) : !parsed ? (
          <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-8 text-amber-100">
            Enter a valid GitHub repository link or an <code>owner/repo</code> value.
          </div>
        ) : showStatusScreen ? (
          <StatusScreen phase={phase} />
        ) : state.status === "loading" ? (
          <StatusScreen phase="completed" />
        ) : state.status === "error" ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-8 text-red-100">
            {state.message}
          </div>
        ) : state.status === "success" ? (
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl">
            <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start">
              <div className="flex items-center gap-4">
                <Image
                  src={state.repo.owner.avatar_url}
                  alt={state.repo.owner.login}
                  width={72}
                  height={72}
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

                <PackageJsonPanel state={packageJsonState} />
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}

function StatusScreen({ phase }: { phase: ScanPhase }) {
  const currentIndex = Math.max(scanPhases.indexOf(phase), 0);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8">
            <path
              d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <p className="mt-5 text-sm uppercase tracking-[0.3em] text-cyan-300/80">Scanning</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">
          Preparing repository analysis
        </h2>
        <p className="mt-3 text-sm text-slate-300">
          Please wait while we inspect the repository and package manifest.
        </p>

        <div className="mt-8 w-full rounded-3xl border border-white/10 bg-slate-950/70 p-4">
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            {scanPhases.map((item, index) => {
              const isActive = index === currentIndex;
              const isDone = index < currentIndex;
              const isQueued = item === "queued";

              return (
                <div
                  key={item}
                  className={[
                    "flex items-center gap-2 rounded-full border px-4 py-2 capitalize transition",
                    isActive
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      : isDone
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                        : "border-white/10 bg-white/5 text-slate-400"
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-2.5 w-2.5 rounded-full",
                      isActive
                        ? "bg-cyan-300"
                        : isDone
                          ? "bg-emerald-300"
                          : isQueued
                            ? "bg-slate-500"
                            : "bg-slate-600"
                    ].join(" ")}
                  />
                  {item}
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-6 text-sm text-slate-400">
          Current stage: <span className="text-slate-200">{phase}</span>
        </p>
      </div>
    </section>
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

function PackageJsonPanel({ state }: { state: PackageJsonState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-slate-950/50 p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300/80">
            package.json
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Repository manifest</h2>
        </div>
      </div>

      {state.status === "loading" ? (
        <p className="mt-4 text-sm text-slate-300">Loading package.json...</p>
      ) : state.status === "missing" ? (
        <p className="mt-4 text-sm text-slate-300">
          No root package.json found in this repository.
        </p>
      ) : state.status === "error" ? (
        <p className="mt-4 text-sm text-red-200">{state.message}</p>
      ) : (
        <div className="mt-4 space-y-5">
          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-xs leading-6 text-slate-200">
            {JSON.stringify(state.packageJson, null, 2)}
          </pre>

          <div className="grid gap-4 lg:grid-cols-2">
            <DependencyGroup label="Dependencies" items={state.packageJson.dependencies} />
            <DependencyGroup
              label="Dev dependencies"
              items={state.packageJson.devDependencies}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function DependencyGroup({
  label,
  items
}: {
  label: string;
  items?: Record<string, string>;
}) {
  const entries = Object.entries(items ?? {});

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
          {entries.length}
        </span>
      </div>

      {entries.length ? (
        <ul className="mt-4 space-y-2">
          {entries.map(([name, version]) => (
            <li
              key={name}
              className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-100">{name}</span>
              <span className="font-mono text-slate-300">{version}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-slate-400">No entries found.</p>
      )}
    </div>
  );
}
