# sbom-platform backend

Express API + BullMQ worker for the day 1–5 thin slice. Two entry points
(`src/api/index.ts`, `src/worker/index.ts`) in one package, sharing `src/db`
(pg pool + query helper) and `src/shared` (status enum, id generation, queue
config). Contract: `docs/mvp-api-contract-v1.md`. Schema: `docs/mvp-schema-v1.sql`.

## Prerequisites

- Node 20+
- Docker with compose (any runtime; colima works)

## Setup

```sh
# from the repo root
cp .env.example .env          # defaults work out of the box
docker compose up -d postgres redis
cd backend && npm install
```

Postgres 16 listens on host port **5433** (5432 is left free for any local
Postgres) and applies `docs/mvp-schema-v1.sql` automatically on first boot of
a fresh volume. To re-apply the schema from scratch: `docker compose down -v`
then `up -d` again.

## Run

In two terminals, from `backend/`:

```sh
npm run api        # Express on :3001 (API_PORT)
npm run worker     # BullMQ consumer
```

The worker is a placeholder: it probes the repo URL for reachability, then
walks the status enum `queued → cloning → scanning → enriching → completed`
(~3 s per phase, `SCAN_PHASE_DELAY_MS`), updating the scan row on each
transition. Unreachable/invalid repos are marked `failed` with a
human-readable `error`. Jobs have a hard 30-minute timeout
(`SCAN_JOB_TIMEOUT_MS`) and stalled-job detection, so a dead worker never
leaves a scan stuck in progress.

## End-to-end proof

Submit a scan:

```sh
$ curl -s -X POST localhost:3001/api/v1/scans \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer dev_placeholder" \
    -d '{"repoUrl":"https://github.com/expressjs/express"}'
{"id":"scn_51645a31","status":"queued","repoUrl":"https://github.com/expressjs/express","createdAt":"2026-07-24T17:22:25.999Z"}
```

Poll it (every 3 s) until terminal:

```sh
$ while true; do curl -s localhost:3001/api/v1/scans/scn_51645a31 \
    -H "Authorization: Bearer dev_placeholder"; echo; sleep 3; done
{"id":"scn_51645a31","status":"cloning","phase":2,"phaseCount":5,"repoUrl":"https://github.com/expressjs/express","createdAt":"2026-07-24T17:22:25.999Z","updatedAt":"2026-07-24T17:22:26.034Z","error":null}
{"id":"scn_51645a31","status":"scanning","phase":3,"phaseCount":5,"repoUrl":"https://github.com/expressjs/express","createdAt":"2026-07-24T17:22:25.999Z","updatedAt":"2026-07-24T17:22:29.163Z","error":null}
{"id":"scn_51645a31","status":"enriching","phase":4,"phaseCount":5,"repoUrl":"https://github.com/expressjs/express","createdAt":"2026-07-24T17:22:25.999Z","updatedAt":"2026-07-24T17:22:32.245Z","error":null}
{"id":"scn_51645a31","status":"completed","phase":5,"phaseCount":5,"repoUrl":"https://github.com/expressjs/express","createdAt":"2026-07-24T17:22:25.999Z","updatedAt":"2026-07-24T17:22:35.269Z","error":null}
```

Error shapes per the contract:

```sh
$ curl -s -X POST localhost:3001/api/v1/scans -H "Content-Type: application/json" \
    -d '{"repoUrl":"https://bitbucket.org/foo/bar"}'
{"error":{"code":"INVALID_REPO_URL","message":"repoUrl must be a GitHub or GitLab repository URL"}}   # 400

$ curl -s localhost:3001/api/v1/scans/scn_deadbeef
{"error":{"code":"SCAN_NOT_FOUND","message":"No scan with id scn_deadbeef"}}                          # 404

# nonexistent repo -> worker marks the scan failed:
{"id":"scn_d20ec2de","status":"failed","phase":2,"phaseCount":5,...,"error":"Repository could not be cloned. It may be private or the URL may be invalid."}
```

## Not in this slice (days 6–10)

Components endpoint, export endpoint, real Syft integration, auth
(`Authorization: Bearer dev_placeholder` is sent and ignored).
