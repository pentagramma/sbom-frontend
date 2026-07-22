# SBOM Compliance Platform

Monorepo for the SBOM compliance platform.

## Layout

- `frontend/` — Next.js UI (App Router, TypeScript, Tailwind)
- `backend/` — Express API plus BullMQ worker (in progress)
- `docs/` — API contract and database schema
- `docker-compose.yml` — runs everything: Postgres, Redis, API, worker, and frontend

## Getting started

Copy `frontend/.env.example` to `frontend/.env` and adjust as needed, then:

```bash
docker compose up
```

Or run the frontend on its own:

```bash
cd frontend
npm install
npm run dev
```
