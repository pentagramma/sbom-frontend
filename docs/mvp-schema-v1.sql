-- MVP Starter Schema v1 (thin slice)

CREATE TABLE scans (
  id           TEXT PRIMARY KEY,              -- 'scn_9b3a2f8c'
  repo_url     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',
    -- queued | cloning | scanning | enriching | completed | failed
  phase        INT  NOT NULL DEFAULT 0,
  phase_count  INT  NOT NULL DEFAULT 5,
  error        TEXT,
  raw_output   JSONB,                         -- raw Syft doc, audit only, not source of truth
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scans_status ON scans (status);

CREATE TABLE components (
  id        TEXT PRIMARY KEY,                 -- 'cmp_4f2e91aa'
  purl      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  version   TEXT NOT NULL,
  type      TEXT NOT NULL DEFAULT 'library',  -- TEXT not enum, AIBOM types later
  licenses  TEXT[] NOT NULL DEFAULT '{}',
  metadata  JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_components_name ON components (name);
CREATE INDEX idx_components_type ON components (type);

CREATE TABLE scan_components (
  scan_id      TEXT NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
  component_id TEXT NOT NULL REFERENCES components (id),
  direct       BOOLEAN NOT NULL DEFAULT false,
  found_by     TEXT NOT NULL DEFAULT 'syft',
  PRIMARY KEY (scan_id, component_id)
);

CREATE INDEX idx_scan_components_component ON scan_components (component_id);

-- Components endpoint query:
-- SELECT c.*, sc.direct FROM scan_components sc
-- JOIN components c ON c.id = sc.component_id
-- WHERE sc.scan_id = $1 ORDER BY c.name LIMIT $2 OFFSET $3;
