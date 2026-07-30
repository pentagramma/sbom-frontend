// Shared Postgres access for BOTH the API and worker processes. No ORM — just
// a connection pool and a thin `query()` helper. Import `query` anywhere you
// need the DB.
import pg from 'pg';

// One pool per process, reused for every query. Defaults match docker-compose
// (note the non-standard port 5433) so it works with zero env setup locally.
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://sbom:sbom@localhost:5433/sbom',
});

// Run a parameterised SQL query. Always pass values via `params` ($1, $2, ...),
// never string-concatenate them — that's what keeps us safe from SQL injection.
export function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never[]);
}

export function closeDb(): Promise<void> {
  return pool.end();
}
