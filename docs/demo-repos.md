# Demo & Test Repos

This document tracks candidate repositories for the day 21 demo and for correctness testing. Measured columns are filled in by the backend dev after running each repo through the pipeline; the final selection decision is made by Lakshay once the numbers are in.

## Demo candidates (npm)

| Repo | URL | Scan time | Components found | Lockfile entries | cdxgen | Delta | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| commander | https://github.com/tj/commander.js | - | - | - | - | - | - |
| axios | https://github.com/axios/axios | - | - | - | - | - | - |
| lodash | https://github.com/lodash/lodash | - | - | - | - | - | - |
| zod | https://github.com/colinhacks/zod | - | - | - | - | - | - |
| vite | https://github.com/vitejs/vite | - | - | - | - | - | - |
| prettier | https://github.com/prettier/prettier | - | - | - | - | - | - |

Selection criteria: scan completes in under ~2 minutes (fits the demo narration window), enough components to demonstrate pagination, clean scan with no errors, recognizable project name.

## Demo candidates (Python)

Same selection criteria as above. Dependency files below were verified on 2026-08-24 by fetching each repo's default branch directly (not via our pipeline), so the dep-file type and pinning are independent starting facts; the measured columns get filled after a real scan. Lockfile-entry counts are left blank pending the independent cloned-repo walk (which must include subdirectories, per "Why the lockfile cross-check matters" below); the declared-dependency counts noted per repo are root-file lower bounds.

| Repo | URL | Scan time | Components found | Lockfile entries | cdxgen | Delta | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| microblog | https://github.com/miguelgrinberg/microblog | - | - | - | - | - | - |
| rich | https://github.com/Textualize/rich | - | - | - | - | - | - |
| pipenv | https://github.com/pypa/pipenv | - | - | - | - | - | - |

- **microblog** — `requirements.txt`, fully pinned with `==` (~54 entries). The clean-path Python demo: pinned requirements are exactly what Syft resolves reliably, and ~54 components exercise pagination. Flask Mega-Tutorial, recognizable.
- **rich** — `poetry.lock` (~49 packages). Proves the Poetry lockfile path end to end; well-known library, single page-ish so pair with microblog for pagination.
- **pipenv** — `Pipfile.lock` (~10 main / ~100 dev). Proves the third Python lockfile format. The main-vs-dev split is itself a test: decide whether the pipeline should surface dev dependencies or only the default group.

Why these three: each exercises a different Python dependency-file format (plain pinned `requirements.txt`, `poetry.lock`, `Pipfile.lock`) — the three Syft resolves reliably — so a clean pass across all three is evidence the Python path works regardless of tooling, not just for one packaging style.

## Failure showcase

This section covers test cases for deliberate failure scenarios during the demo:

- **Private repository**: https://github.com/lakshaykarnwal/sbom-test-private
  - **Expected behavior**: Scan fails cleanly with a human-readable message per the API contract ("Repository could not be cloned. It may be private or the URL may be wrong."), not a raw git error or an endless spinner.
- **Nonexistent repository URL**: https://github.com/lakshaykarnwal/this-repo-does-not-exist
  - **Expected behavior**: Same clean error handling expected, since users encounter typo'd URLs more frequently than private repositories.

## Torture set

| Repo | URL | What it tests | Scan time | Components found | Lockfile entries | cdxgen | Delta | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| babel | https://github.com/babel/babel | Monorepo. Multiple packages with lockfiles in subdirectories. Tests whether Syft finds sub-packages or silently scans only the root. | - | - | - | - | - | - |
| next.js | https://github.com/vercel/next.js | Very large dependency tree. Stresses pagination, scan time, memory, and job timeouts. | - | - | - | - | - | - |
| sharp | https://github.com/lovell/sharp | Native code. Wraps the libvips C library, so a substantial non-JS dependency exists that never appears in any npm manifest. This is the silent-omission probe. | - | - | - | - | - | - |
| poetry | https://github.com/python-poetry/poetry | Python. Large `poetry.lock` (~80 packages including dev/optional groups). Stresses pagination and tests whether the pipeline surfaces dev/optional groups or only the main dependencies. | - | - | - | - | - | - |
| face_recognition | https://github.com/ageitgey/face_recognition | Python. Unpinned `requirements.txt` (bare names + `>=`: `numpy`, `Pillow`, `dlib>=19.3.0`, `Click>=6.0`, `scipy>=0.17.0`). Syft skips unpinned requirements, so it returns ~0 components and the scan "succeeds" with an empty table — the Python silent-omission probe (analogue of sharp for npm). Also native code (`dlib` C++). | - | - | - | - | - | - |

These repositories are chosen to break things rather than demo well.

Note: Non-JS code in npm packages spans C, C++, and increasingly Rust (via napi-rs), and often ships as pre-compiled binaries rather than source. So the coverage gap is broader than vendored source alone, and that belongs in the known-limitations write-up.

## Why the lockfile cross-check matters

Syft can silently skip ecosystems, vendored code, and subdirectories it cannot parse - it reports no error, just fewer components. Comparing the component count against the repo's lockfile entry count is how we catch silent omissions. A large negative delta means Syft missed something, and that gap gets documented as a known limitation rather than hidden.

The lockfile count must come from an independent script that walks the cloned repo and finds every package-lock.json including ones in subdirectories. Counting via our own pipeline would defeat the purpose, since a lockfile Syft failed to find is also one it would fail to count. cdxgen component count is included as a second opinion to compare against Syft and lockfile results.

### Python caveat: pinned vs unpinned (verified 2026-08-24 via offline Syft 1.50 fixtures)

The silent-omission risk is sharpest for Python. Syft's `requirements.txt` cataloger only emits packages pinned with `==`; unpinned entries (`flask>=3.0`, bare `requests`) are **skipped entirely** — not merely stored without a version. A controlled fixture test confirmed the behavior: a fully pinned `requirements.txt` (5/5) and a `poetry.lock` (3/3) yielded every component, while an unpinned `requirements.txt` yielded **zero**. `SYFT_PYTHON_GUESS_UNPINNED_REQUIREMENTS=true` recovers only entries that carry a lower-bound constraint (3 of 5 in the fixture) and guesses the constraint floor (`flask 3.0`, not the resolved `3.0.3`), so the purl is imprecise for any later vuln matching.

Consequence for the code path: even when Syft *does* emit an unpinned package without a version, the worker drops it (`upsertComponent` requires both `purl` and `version`, `backend/src/worker/index.ts:163`). Net rule for demo selection: prefer lockfiles or `==`-pinned requirements for the clean demo (microblog, rich, pipenv); keep an unpinned repo (face_recognition) as the deliberate silent-omission probe.
