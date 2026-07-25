import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://sbom:sbom@localhost:5433/sbom',
});

export function query<R extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<R>> {
  return pool.query<R>(text, params as never[]);
}

export function closeDb(): Promise<void> {
  return pool.end();
}
