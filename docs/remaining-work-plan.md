# Remaining Work — 21-Day Roadmap Gap Plan

Status snapshot as of 2026-08-16, measured against `docs/21-day-roadmap.md`.
The happy-path code is essentially built end to end (POST/GET scans, real Syft
worker, paginated components, CycloneDX export, polling UI, seeded demo DB). The
last commit — "implemented the remaining 21 day plan" — covers the *code*. What
is left is mostly **deployment scaffolding, the real-API switchover, verification
by breaking things, and demo prep** — i.e. the roadmap's Days 11–21 that are
process/hardening rather than new features.

Legend: 🔴 blocker · 🟠 required for demo sentence · 🟡 polish / nice-to-have

---

## 1. Deployment (roadmap Days 18–19) — 🔴 biggest remaining chunk

`docker-compose.yml` declares `api`, `worker`, and `frontend` with `build:` but
**no Dockerfiles exist**, so `docker compose up` cannot build the stack. The
roadmap's "fresh clone, docker compose up, works" (the on-prem proof) is not yet
achievable.

- [ ] 🔴 **`backend/Dockerfile`** — Node base, `npm ci`, run `tsx`. The image
      must also install **git** and the **Syft binary** (the worker shells out to
      both). Without Syft in the image the worker fails every real scan.
- [ ] 🔴 **`frontend/Dockerfile`** — `next build` + `next start` (multi-stage).
- [ ] 🔴 **Wire the compose services**: add port mappings (`api` 3001, `frontend`
      3000), set `NEXT_PUBLIC_API_URL` for the frontend service, point
      `DATABASE_URL`/`REDIS_HOST` at the compose service names (`postgres`,
      `redis`) rather than `localhost`, and add `command:` overrides so one image
      runs the API and the other the worker.
- [ ] 🟠 Update root `README.md` (it currently says the api/worker/frontend
      services "have no Dockerfiles yet, so those run on the host") once the above
      lands, plus a one-command "fresh clone → compose up" run-through.
- [ ] 🟡 Fix stale `.env.example`: it still documents the placeholder worker knobs
      (`SCAN_PHASE_DELAY_MS`, `SCAN_JOB_TIMEOUT_MS`) but the real worker reads
      `GIT_CLONE_TIMEOUT_MS` / `SYFT_TIMEOUT_MS` / `JOB_TIMEOUT_MS`.

## 2. Real-API switchover (roadmap Days 11–12) — 🟠

The env-var seam is in place (`NEXT_PUBLIC_API_URL` unset ⇒ in-browser fake).
The actual switchover — running the UI against the live backend and fixing the
friction the roadmap explicitly budgets for — has not been exercised.

- [ ] 🔴 **CORS**: the Express API has **no CORS middleware**. A browser calling
      `NEXT_PUBLIC_API_URL` cross-origin will be blocked. Add `cors` (or a
      same-origin proxy) before any real-API run — this will surface the instant
      the fake is turned off.
- [ ] 🟠 End-to-end run with the fake off: submit → poll → components → download,
      checking field-name and timing mismatches against the contract.
- [ ] 🟠 Real-data error/loading polish once talking to the live API (the roadmap
      Day 11–15 "real-data polish" item).

## 3. Verification by breaking things (roadmap Days 6–10 & 16–17) — 🟠

The failure paths are *coded* (ScanError → clean message, stalled-job detection,
git/Syft/job timeouts, 409 before completion) but the roadmap requires them
**verified on purpose**, and that has not happened.

- [ ] 🟠 Private / nonexistent repo fails cleanly with the human-readable message
      (test repos already listed in `docs/demo-repos.md`).
- [ ] 🟠 Kill the worker mid-scan → confirm stalled-job detection marks it failed,
      not stuck in `scanning`.
- [ ] 🟠 Hung-scan / timeout actually fires and writes the timeout message.
- [ ] 🟠 **Validate one exported CycloneDX file with an external validator** so
      "valid CycloneDX" is a checked claim, not an assumption (roadmap Day 11–15).

## 4. Torture + demo-repo selection (roadmap Days 6–15, Lakshay) — 🟠

`docs/demo-repos.md` exists but **every measurement column is empty**. No repo
has actually been run through the pipeline yet.

- [ ] 🟠 Run the demo candidates (chalk, axios, lodash, express, vite, prettier)
      and fill scan time / component count → pick the 2–3 that fit the narration
      window and show pagination.
- [ ] 🟡 Run the torture set (babel monorepo, next.js large tree, sharp native)
      and record deltas vs lockfile / cdxgen; log silent-omission gaps as
      **known limitations** rather than fixing them (per the cut line).
- [ ] 🟡 Independent lockfile-count script for the cross-check (referenced in
      demo-repos.md, not yet written).

## 5. Demo prep (roadmap Days 18–21, Lakshay) — 🟠

- [ ] 🟠 Confirm the seeded demo scan (`npm run seed` → `/scans/scn_demo0001`)
      renders through the UI as the demo-day fallback.
- [ ] 🟠 Draft the demo script incl. narration for the 2–3 min scan gap and the
      deliberate failure showcase.
- [ ] 🟡 Full dry run on the actual demo machine; freeze after.

## 6. Small feature gaps vs the roadmap text — 🟡

Deviations from the literal roadmap wording; low risk, decide keep-or-close:

- [ ] 🟡 **Confirm/metadata card**: roadmap says "paste URL, see card, click Scan."
      `/repo` posts directly with no confirm-card step.
- [ ] 🟡 **PURL "behind expand or copy"**: the table renders the full purl inline;
      roadmap wanted it behind an expand or a copy button.
- [ ] 🟡 **Long-name edge state**: zero-components and multi-license states are
      handled; very long component names aren't specifically truncated/wrapped.
- [ ] 🟡 **Unexpected mock login page** (`app/page.tsx`) exists but isn't in the
      roadmap (Keycloak is explicitly out of scope / mock header only). Confirm
      it's intended as a demo flourish, otherwise it's dead surface.
- [ ] 🟡 No automated tests anywhere (Lakshay = testing); at minute a couple of
      API contract-shape smoke tests would de-risk the switchover.

---

## Suggested order

1. **CORS + Dockerfiles + compose wiring** (§1, §2 CORS) — unblocks every real run.
2. **One real end-to-end run** through the UI on a small repo (§2, §3 validator).
3. **Break-it verification** of the three failure paths (§3).
4. **Fill demo-repos.md + pick demo repos** (§4).
5. **Demo script + dry run** (§5), close §6 polish items as time allows.

The pre-agreed cut line still applies: if this slips, export stays as stored raw
output, torture gaps become documented known limitations, and cosmetic polish
(§6) drops first.
