"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

function LoginCard() {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/repo");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1f2937_0%,_#0f172a_45%,_#020617_100%)] px-4 py-8 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">Sign in</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Repository portal</h1>
        <p className="mt-2 text-sm text-slate-300">
          Enter any details to continue to the repo search page.
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-200">Username</span>
            <input
              name="username"
              type="text"
              placeholder="anything works"
              className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-200">Password</span>
            <input
              name="password"
              type="password"
              placeholder="anything works"
              className="h-12 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
            />
          </label>

          <button
            type="submit"
            className="h-12 w-full rounded-xl bg-cyan-400 font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}

export default function HomePage() {
  return <LoginCard />;
}
