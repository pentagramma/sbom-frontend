#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Standalone, independent lockfile-entry counter.
//
// Clones a repo fresh and walks the ENTIRE tree for every package-lock.json
// (including nested ones in subdirectories/workspaces), parsing each and
// summing entries. This is deliberately independent of our own scan pipeline
// (backend/src/worker) -- it must NOT import from it or read our database,
// because a lockfile Syft failed to find is also one it would fail to count.
// A count built from our own code would prove nothing about whether our
// pipeline is missing anything.
//
// Usage: node scripts/count-lockfile-entries.mjs <repoUrl>
//
// Reports RAW numbers only -- no reconciliation against our pipeline's
// output. Lockfiles include dev dependencies and duplicate entries across
// resolved versions, so small deltas vs. our component counts are expected;
// we're looking for large shortfalls only.
// ---------------------------------------------------------------------------


import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

async function cloneRepo(repoUrl, destDir) {
  await run('git', ['clone', '--depth', '1', '--quiet', repoUrl, destDir]);
}

// Recursively finds every package-lock.json under `dir`. Skips `.git` (not
// source) but otherwise walks everything on purpose, including node_modules
// and nested workspace packages -- the whole point is an unfiltered count.
// Returns { path, name } for every supported lock file found.
const LOCK_FILE_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

async function findLockfiles(dir) {
  const found = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return; // permission errors etc. -- skip, don't crash the whole count
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && LOCK_FILE_NAMES.has(entry.name)) {
        found.push({ path: fullPath, name: entry.name });
      }
    }
  }
  await walk(dir);
  return found;
}

// yarn.lock (classic v1 and Berry v2+): each resolved package block has
// exactly one "  version" line at 2-space indent.
function countYarnEntries(content) {
  const matches = content.match(/^  version[: ]/mg);
  return matches ? matches.length : 0;
}

// pnpm-lock.yaml: each package entry has exactly one "resolution:" line.
function countPnpmEntries(content) {
  const matches = content.match(/^\s+resolution:/mg);
  return matches ? matches.length : 0;
}

// Recursively finds every package.json under `dir`. Skips `.git` and
// `node_modules` -- we only want source manifests, not installed copies.
async function findPackageJsons(dir) {
  const found = [];
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name === 'package.json') {
        found.push(fullPath);
      }
    }
  }
  await walk(dir);
  return found;
}

// Counts declared deps in a package.json per field. Only direct deps -- no
// transitive resolution. Version values are ranges, not exact pinned versions.
// Note: Syft reads only `dependencies` when no lock file is present, so the
// `dependencies` subtotal is what Syft would report; the other fields explain
// any gap between Syft's count and this script's total.
function countPackageJsonDeps(pkg) {
  const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const breakdown = {};
  let total = 0;
  for (const field of fields) {
    const n = pkg[field] && typeof pkg[field] === 'object' ? Object.keys(pkg[field]).length : 0;
    breakdown[field] = n;
    total += n;
  }
  return { total, breakdown };
}

// npm lockfile v2/v3 use a flat `packages` map keyed by path (the root
// project itself is the "" key). v1 uses a nested `dependencies` map instead,
// where each dependency can itself carry a `dependencies` field for its own
// sub-tree. Both formats mark dev-only entries with `"dev": true`.
// The root package ("" key) is included in the prod count -- this matches
// Syft's behaviour of counting the scanned package itself as a component.
function countEntries(lockfile) {
  let prod = 0;
  let dev = 0;

  if (lockfile.packages && typeof lockfile.packages === 'object') {
    for (const [key, entry] of Object.entries(lockfile.packages)) {
      if (entry && entry.dev) dev += 1;
      else prod += 1; // includes the root package ("" key) -- matches Syft's behaviour
    }
    return { total: prod + dev, prod, dev };
  }

  if (lockfile.dependencies && typeof lockfile.dependencies === 'object') {
    (function walkDeps(deps) {
      for (const dep of Object.values(deps)) {
        if (dep && dep.dev) dev += 1;
        else prod += 1;
        if (dep && typeof dep === 'object' && dep.dependencies) {
          walkDeps(dep.dependencies);
        }
      }
    })(lockfile.dependencies);
    return { total: prod + dev, prod, dev };
  }

  return { total: 0, prod: 0, dev: 0 };
}

async function main() {
  const repoUrl = process.argv[2];
  if (!repoUrl) {
    console.error('Usage: node scripts/count-lockfile-entries.mjs <repoUrl>');
    process.exitCode = 1;
    return;
  }

  const cloneDir = await mkdtemp(path.join(tmpdir(), 'lockfile-count-'));
  try {
    console.log(`Cloning ${repoUrl} ...`);
    await cloneRepo(repoUrl, cloneDir);

    const lockfiles = await findLockfiles(cloneDir);
    const hasAnyLockfile = lockfiles.length > 0;
    if (!hasAnyLockfile) {
      console.warn('Warning: No lock files found (package-lock.json, yarn.lock, pnpm-lock.yaml) -- falling back to package.json declared dependencies.');
      console.warn('Counts will be direct deps only (no transitive), with version ranges not exact versions.\n');


      const packageJsons = await findPackageJsons(cloneDir);
      if (packageJsons.length === 0) {
        console.log('No package.json files found either. Cannot produce a count.');
        return;
      }

      let grandTotal = 0;
      console.log(`Found ${packageJsons.length} package.json file(s):\n`);
      for (const file of packageJsons) {
        const relPath = path.relative(cloneDir, file);
        let parsed;
        try {
          parsed = JSON.parse(await readFile(file, 'utf8'));
        } catch (err) {
          console.log(`  ${relPath}: FAILED TO PARSE (${err.message})`);
          continue;
        }
        const { total, breakdown } = countPackageJsonDeps(parsed);
        grandTotal += total;
        console.log(`  ${relPath}: ${total} declared deps`);
        console.log(`    dependencies: ${breakdown.dependencies}  (Syft reads this)`);
        if (breakdown.devDependencies)     console.log(`    devDependencies: ${breakdown.devDependencies}  (Syft skips)`);
        if (breakdown.optionalDependencies) console.log(`    optionalDependencies: ${breakdown.optionalDependencies}  (Syft skips)`);
        if (breakdown.peerDependencies)    console.log(`    peerDependencies: ${breakdown.peerDependencies}  (Syft skips)`);
      }

      console.log(`\nRaw total across all package.json files (declared deps only): ${grandTotal}`);
      console.log(
        '\n(Fallback count -- no lock file was present. Includes dependencies, devDependencies,\n' +
          'optionalDependencies, and peerDependencies. No transitive deps. Expect large undercounts\n' +
          'vs. Syft output if the repo has deep dependency trees.)',
      );
      return;
    }

    let grandTotal = 0;
    let grandProd = 0;
    let grandDev = 0;
    console.log(`Found ${lockfiles.length} lock file(s):\n`);
    for (const { path: file, name: lockName } of lockfiles) {
      const relPath = path.relative(cloneDir, file).replace(/\\/g, '/');
      let content;
      try {
        content = await readFile(file, 'utf8');
      } catch (err) {
        console.log(`  ${relPath}: FAILED TO READ (${err.message})`);
        continue;
      }

      if (lockName === 'package-lock.json') {
        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch (err) {
          console.log(`  ${relPath}: FAILED TO PARSE (${err.message})`);
          continue;
        }
        const { total, prod, dev } = countEntries(parsed);
        grandTotal += total;
        grandProd += prod;
        grandDev += dev;
        console.log(`  ${relPath}: ${total} entries (${prod} prod, ${dev} dev)`);
      } else if (lockName === 'yarn.lock') {
        const n = countYarnEntries(content);
        grandTotal += n;
        console.log(`  ${relPath}: ${n} entries (yarn -- no dev/prod split in lock file)`);
      } else if (lockName === 'pnpm-lock.yaml') {
        const n = countPnpmEntries(content);
        grandTotal += n;
        console.log(`  ${relPath}: ${n} entries (pnpm -- no dev/prod split in lock file)`);
      }
    }

    const npmNote = grandProd + grandDev > 0
      ? `  npm prod: ${grandProd}  npm dev: ${grandDev}\n`
      : '';
    console.log(`\nRaw total across all lock files (before dedup): ${grandTotal}`);
    if (npmNote) process.stdout.write(npmNote);
    console.log(
      '\n(Syft deduplicates packages with the same name+version found across multiple\n' +
        'lock files, so its component count will be lower than the raw total above.\n' +
        'Syft includes dev dependencies by default -- compare the grand total\n' +
        'against Syft\'s output when looking for large shortfalls.)',
    );
  } finally {
    await rm(cloneDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
