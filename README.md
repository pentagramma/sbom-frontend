# SBOM Compliance Platform

Monorepo for the SBOM compliance platform.

## Layout

- `frontend/` — Next.js UI (App Router, TypeScript, Tailwind)
- `backend/` — Express API plus BullMQ worker (in progress)
- `docs/` — API contract and database schema
- `docker-compose.yml` — Postgres + Redis for local dev (the `api`/`worker`/
  `frontend` services are declared for later but have no Dockerfiles yet, so
  those run on the host for now)

## Getting started

Backend (API + worker + database): follow **[`backend/README.md`](backend/README.md)**
— it has full setup, run, and troubleshooting instructions. In short:

```bash
cp .env.example .env                     # defaults work out of the box
docker compose up -d postgres redis      # infra only
cd backend && npm install
npm run api                              # terminal 1
npm run worker                           # terminal 2
```

Frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
