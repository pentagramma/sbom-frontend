// ---------------------------------------------------------------------------
// Demo-day fallback seed (roadmap Days 16-17: "seed a demo database with a
// completed scan as demo-day fallback"). Inserts ONE already-`completed` scan
// with its components and a valid CycloneDX raw_output, so the whole read path
// — GET /scans/:id, /components (paginated), /export — works with zero reliance
// on the network, git, Syft, or the worker during the demo.
//
// Idempotent: keyed to a fixed id (DEMO_SCAN_ID), so re-running replaces the
// demo scan cleanly rather than piling up duplicates. Visit it at
// /scans/scn_demo0001 in the UI.
//
// Run: `npm run seed` (from backend/).
// ---------------------------------------------------------------------------

import { closeDb, query } from './index.js';
import { newComponentId } from '../shared/ids.js';
import { PHASE_COUNT, phaseOf } from '../shared/status.js';

const DEMO_SCAN_ID = 'scn_demo0001';
const DEMO_REPO_URL = 'https://github.com/expressjs/express';

interface SeedComponent {
  name: string;
  version: string;
  type: string;
  purl: string;
  licenses: string[];
  direct: boolean;
}

// A small, realistic npm dependency set (mirrors the contract's example
// components). `direct` is a mix so the Direct/Transitive badge shows both.
const DEMO_COMPONENTS: SeedComponent[] = [
  { name: 'accepts', version: '1.3.8', type: 'library', purl: 'pkg:npm/accepts@1.3.8', licenses: ['MIT'], direct: true },
  { name: 'body-parser', version: '1.20.3', type: 'library', purl: 'pkg:npm/body-parser@1.20.3', licenses: ['MIT'], direct: true },
  { name: 'debug', version: '4.3.7', type: 'library', purl: 'pkg:npm/debug@4.3.7', licenses: ['MIT'], direct: true },
  { name: 'finalhandler', version: '1.3.1', type: 'library', purl: 'pkg:npm/finalhandler@1.3.1', licenses: ['MIT'], direct: false },
  { name: 'mime-types', version: '3.0.1', type: 'library', purl: 'pkg:npm/mime-types@3.0.1', licenses: ['MIT'], direct: false },
  { name: 'qs', version: '6.14.0', type: 'library', purl: 'pkg:npm/qs@6.14.0', licenses: ['BSD-3-Clause'], direct: true },
  { name: 'send', version: '1.2.0', type: 'library', purl: 'pkg:npm/send@1.2.0', licenses: ['MIT'], direct: false },
  { name: 'type-is', version: '2.0.1', type: 'library', purl: 'pkg:npm/type-is@2.0.1', licenses: ['MIT'], direct: false },
];

// A minimal but schema-valid CycloneDX 1.7 document built from the same
// components, so /export returns a real, valid SBOM for the demo scan.
function buildCycloneDx(components: SeedComponent[]): unknown {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.7',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: 'application', name: DEMO_REPO_URL },
    },
    components: components.map((c) => ({
      type: c.type,
      name: c.name,
      version: c.version,
      purl: c.purl,
      licenses: c.licenses.map((id) => ({ license: { id } })),
    })),
  };
}

async function seed(): Promise<void> {
  const rawOutput = buildCycloneDx(DEMO_COMPONENTS);

  // Clear any prior demo run first. Deleting the scan cascades to its
  // scan_components (FK ON DELETE CASCADE); shared `components` rows are left in
  // place and re-upserted by purl below.
  await query(`DELETE FROM scans WHERE id = $1`, [DEMO_SCAN_ID]);

  await query(
    `INSERT INTO scans (id, repo_url, status, phase, phase_count, raw_output)
     VALUES ($1, $2, 'completed', $3, $4, $5)`,
    [DEMO_SCAN_ID, DEMO_REPO_URL, phaseOf('completed'), PHASE_COUNT, JSON.stringify(rawOutput)],
  );

  for (const comp of DEMO_COMPONENTS) {
    // Upsert by purl, exactly like the worker's enriching step: reuse the
    // existing component row on conflict so the demo shares the real catalog.
    const { rows } = await query<{ id: string }>(
      `INSERT INTO components (id, purl, name, version, type, licenses)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (purl) DO UPDATE
         SET name = EXCLUDED.name, version = EXCLUDED.version, type = EXCLUDED.type, licenses = EXCLUDED.licenses
       RETURNING id`,
      [newComponentId(), comp.purl, comp.name, comp.version, comp.type, comp.licenses],
    );
    await query(
      `INSERT INTO scan_components (scan_id, component_id, direct, found_by)
       VALUES ($1, $2, $3, 'seed')
       ON CONFLICT DO NOTHING`,
      [DEMO_SCAN_ID, rows[0].id, comp.direct],
    );
  }

  console.log(
    `seeded demo scan ${DEMO_SCAN_ID} (${DEMO_COMPONENTS.length} components) — open /scans/${DEMO_SCAN_ID}`,
  );
}

seed()
  .catch((err) => {
    console.error('seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
