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

The API and worker run on the host (there are no Dockerfiles for them yet).
Run **exactly one of each**, in its own terminal, and leave both open — they
stream logs. Postgres and Redis stay running in the background from `up -d`.

```sh
# terminal 1, from backend/
npm run api        # Express on :3001 (API_PORT); prints "api listening on :3001"

# terminal 2, from backend/
npm run worker     # BullMQ consumer; prints "worker listening on queue \"scans\""
```

Config comes from environment variables, but the code defaults
(`localhost:5433` Postgres, `localhost:6379` Redis) already match the compose
setup, so `npm run api` / `npm run worker` work with no extra steps. Only if you
change `.env` from the defaults do you need to export it into these shells
(e.g. `set -a && . ../.env && set +a` before the `npm run` command).

> Run only **one** API and **one** worker. Two APIs fight over port 3001
> (`EADDRINUSE`); two workers both consume the same queue, so a job's logs land
> in whichever one happened to grab it — making the other terminal look dead.

The worker is a placeholder: it probes the repo URL for reachability, then
walks the status enum `queued → cloning → scanning → enriching → completed`
(~3 s per phase, `SCAN_PHASE_DELAY_MS`), updating the scan row on each
transition. Unreachable/invalid repos are marked `failed` with a
human-readable `error`. Jobs have a hard 30-minute timeout
(`SCAN_JOB_TIMEOUT_MS`) and stalled-job detection, so a dead worker never
leaves a scan stuck in progress.

## Demo-day seed (fallback)

Insert one already-`completed` scan — id `scn_demo0001`, with components and a
valid CycloneDX `raw_output` — straight into Postgres, so the read path
(`GET /scans/:id`, `/components`, `/export`) works during a demo without the
network, git, Syft, or even the worker:

```sh
# from backend/, with postgres up
npm run seed        # prints: seeded demo scan scn_demo0001 (8 components) ...
```

Then open `/scans/scn_demo0001` in the UI. The script is idempotent — re-running
replaces the demo scan rather than duplicating it.

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

## Troubleshooting

**`Cannot connect to the Docker daemon` / `dial unix /var/run/docker.sock:
connect: no such file or directory`** — your Docker VM isn't running. With
colima: `colima start`, then confirm `colima status` says running and
`docker context show` prints `colima` (colima removes that context when it
stops, so the CLI falls back to a socket that doesn't exist). Re-run the
`docker compose up -d` afterward.

**Tables don't exist / `relation "scans" does not exist`** — the schema is only
applied on the **first** boot of a fresh Postgres volume. If the volume predates
the schema, reset it: `docker compose down -v && docker compose up -d postgres redis`.
(`-v` deletes the data volume, so all scans are lost.)

**`EADDRINUSE: address already in use :::3001`** — an API is already running
(possibly a stray background one). Find and stop it:
`lsof -iTCP:3001 -sTCP:LISTEN -P -n`, then `kill <pid>`.

**Worker terminal shows nothing after a POST** — either no worker is running, or
a *second* worker grabbed the job. Check with `ps aux | grep "tsx src/worker"`;
there should be exactly one.

**Repo on an external drive / outside `$HOME` (e.g. `/Volumes/...`)** — the
compose file bind-mounts `docs/mvp-schema-v1.sql` into Postgres, so your Docker
VM must mount that path. colima mounts `$HOME` by default; for other paths start
it with the mount, e.g. `colima start --mount /Volumes/YourDrive:w`. Verify with
`colima ssh -- ls <repo>/docs/mvp-schema-v1.sql`.

## Not in this slice (days 6–10)

Components endpoint, export endpoint, real Syft integration, auth
(`Authorization: Bearer dev_placeholder` is sent and ignored).
