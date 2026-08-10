// ---------------------------------------------------------------------------
// The API process. It is the HTTP front door — the only thing the frontend
// talks to. It does NO scanning itself; its whole job is:
//   POST /scans    -> validate, save a `queued` row, drop a job on the queue
//   GET  /scans/:id -> read that row back for the frontend's status polling
// The actual work happens later in the WORKER process (src/worker/index.ts),
// which shares the same DB and queue. Shapes here follow docs/mvp-api-contract-v1.md.
// ---------------------------------------------------------------------------

import express from 'express';
import { Queue } from 'bullmq';
import { query } from '../db/index.js';
import { newScanId } from '../shared/ids.js';
import { PHASE_COUNT } from '../shared/status.js';
import { SCAN_QUEUE, redisConnection, type ScanJobData } from '../shared/queue.js';


const app = express();
app.use(express.json()); // parse JSON request bodies into req.body

// Our handle to the Redis queue. `.add()` here is picked up by the worker.
const scanQueue = new Queue<ScanJobData>(SCAN_QUEUE, {
  connection: redisConnection(),
});


interface ScanRow {
  id: string;
  repo_url: string;
  status: string;
  phase: number;
  phase_count: number;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}


function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

// Gate at the door: only accept GitHub/GitLab repo URLs of the form
// https://<host>/<owner>/<repo>[.git]. Anything else is rejected before we
// touch the DB or queue.
function isValidRepoUrl(repoUrl: unknown): repoUrl is string {
  if (typeof repoUrl !== 'string') return false;
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'github.com' && host !== 'gitlab.com') return false;
  const segments = url.pathname.split('/').filter(Boolean);
  return segments.length >= 2 && segments.every((s) => s.length > 0);
}

// Start a scan. Order matters: validate -> save row -> enqueue job. The row is
// written FIRST (as `queued`) so the scan exists in the DB the instant we reply,
// before the worker has touched it. Returns 202 (accepted, not done).
// TODO: Submitting the same repoUrl multiple times creates a new scan each time
// with a new id, running the full clone and scan pipeline again for every request.
app.post('/api/v1/scans', async (req, res) => {
  const { repoUrl } = req.body ?? {};
  if (!isValidRepoUrl(repoUrl)) {
    res
      .status(400)
      .json(errorBody('INVALID_REPO_URL', 'repoUrl must be a GitHub or GitLab repository URL'));
    return;
  }

  // 1. Save the scan as `queued`. Reusing the id as the BullMQ jobId (below)
  //    keeps scan and job traceable as one thing.
  const id = newScanId();
  const { rows } = await query<ScanRow>(
    `INSERT INTO scans (id, repo_url, status, phase, phase_count)
     VALUES ($1, $2, 'queued', 1, $3)
     RETURNING *`,
    [id, repoUrl, PHASE_COUNT],
  );

  // 2. Hand the job to the worker via Redis. This is the API's last involvement.
  await scanQueue.add('scan', { scanId: id, repoUrl }, { jobId: id });


  res.status(202).json({
    id,
    status: 'queued',
    repoUrl,
    createdAt: rows[0].created_at.toISOString(),
  });
});

// Read a scan back. This is what the frontend polls every few seconds to show
// live status. It is a plain read of the row the worker keeps updating — no
// logic, so it works the same whether the scan is in progress, done, or failed.
app.get('/api/v1/scans/:id', async (req, res) => {
  const { id } = req.params;
  const { rows } = await query<ScanRow>('SELECT * FROM scans WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json(errorBody('SCAN_NOT_FOUND', `No scan with id ${id}`));
    return;
  }


  const row = rows[0];
  res.json({
    id: row.id,
    status: row.status,
    phase: row.phase,
    phaseCount: row.phase_count,
    repoUrl: row.repo_url,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    error: row.error,
  });
});


interface ScanComponentRow {
  id: string;
  name: string;
  version: string;
  type: string;
  purl: string;
  licenses: string[];
  direct: boolean;
}


app.get('/api/v1/scans/:id/components', async (req, res) => {
  const { id } = req.params;


  const { rows: scanRows } = await query<Pick<ScanRow, 'status'>>(
    'SELECT status FROM scans WHERE id = $1',
    [id],
  );
  if (scanRows.length === 0) {
    res.status(404).json(errorBody('SCAN_NOT_FOUND', `No scan with id ${id}`));
    return;
  }
  if (scanRows[0].status !== 'completed') {
    res.status(409).json(errorBody('SCAN_NOT_COMPLETE', `Scan ${id} has not completed yet`));
    return;
  }


  const page = Math.max(1, Math.trunc(Number(req.query.page)) || 1);
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(req.query.limit)) || 50));
  const offset = (page - 1) * limit;


  const { rows: countRows } = await query<{ count: string }>(
    'SELECT COUNT(*) FROM scan_components WHERE scan_id = $1',
    [id],
  );
  const total = Number(countRows[0].count);


  const { rows } = await query<ScanComponentRow>(
    `SELECT c.id, c.name, c.version, c.type, c.purl, c.licenses, sc.direct
     FROM scan_components sc
     JOIN components c ON c.id = sc.component_id
     WHERE sc.scan_id = $1
     ORDER BY c.name
     LIMIT $2 OFFSET $3`,
    [id, limit, offset],
  );


  res.json({
    scanId: id,
    page,
    limit,
    total,
    components: rows,
  });
});

// Export the SBOM. The demo's final step: download a valid CycloneDX file.
// v1 shortcut (per the roadmap): stream back the raw Syft output stored on the
// scan row, rather than regenerating from the internal tables. `raw_output` is
// a JSONB column, so pg hands it back as a parsed object — we re-stringify it.
app.get('/api/v1/scans/:id/export', async (req, res) => {
  const { id } = req.params;

  // `cyclonedx` is the only format this slice serves; `spdx` is reserved by the
  // contract but not built, so anything else is a 400 rather than a silent default.
  const format = req.query.format ?? 'cyclonedx';
  if (format !== 'cyclonedx') {
    res
      .status(400)
      .json(errorBody('UNSUPPORTED_FORMAT', `Unsupported export format: ${String(format)}`));
    return;
  }

  const { rows } = await query<Pick<ScanRow, 'status'> & { raw_output: unknown }>(
    'SELECT status, raw_output FROM scans WHERE id = $1',
    [id],
  );
  if (rows.length === 0) {
    res.status(404).json(errorBody('SCAN_NOT_FOUND', `No scan with id ${id}`));
    return;
  }
  // Only completed scans have a stored SBOM; a missing raw_output on a row that
  // claims completion is treated the same as not-yet-complete.
  if (rows[0].status !== 'completed' || rows[0].raw_output == null) {
    res.status(409).json(errorBody('SCAN_NOT_COMPLETE', `Scan ${id} has not completed yet`));
    return;
  }

  res
    .status(200)
    .type('application/json')
    .set('Content-Disposition', `attachment; filename="${id}.cyclonedx.json"`)
    .send(JSON.stringify(rows[0].raw_output));
});

// Catch-all safety net: any error thrown in a handler above ends up here and
// becomes a clean 500, instead of crashing the process. (The 4-argument shape
// is how Express recognises error-handling middleware.)
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json(errorBody('INTERNAL_ERROR', 'Unexpected server error'));
  },
);


const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
