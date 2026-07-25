import express from 'express';
import { Queue } from 'bullmq';
import { query } from '../db/index.js';
import { newScanId } from '../shared/ids.js';
import { PHASE_COUNT } from '../shared/status.js';
import { SCAN_QUEUE, redisConnection, type ScanJobData } from '../shared/queue.js';

const app = express();
app.use(express.json());

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

// Accepts GitHub/GitLab repo URLs of the form https://<host>/<owner>/<repo>[.git]
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

app.post('/api/v1/scans', async (req, res) => {
  const { repoUrl } = req.body ?? {};
  if (!isValidRepoUrl(repoUrl)) {
    res
      .status(400)
      .json(errorBody('INVALID_REPO_URL', 'repoUrl must be a GitHub or GitLab repository URL'));
    return;
  }

  const id = newScanId();
  const { rows } = await query<ScanRow>(
    `INSERT INTO scans (id, repo_url, status, phase, phase_count)
     VALUES ($1, $2, 'queued', 1, $3)
     RETURNING *`,
    [id, repoUrl, PHASE_COUNT],
  );

  await scanQueue.add('scan', { scanId: id, repoUrl }, { jobId: id });

  res.status(202).json({
    id,
    status: 'queued',
    repoUrl,
    createdAt: rows[0].created_at.toISOString(),
  });
});

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
