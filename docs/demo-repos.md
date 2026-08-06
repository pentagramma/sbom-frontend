# Demo & Test Repos

This document tracks candidate repositories for the day 21 demo and for correctness testing. Measured columns are filled in by the backend dev after running each repo through the pipeline; the final selection decision is made by Lakshay once the numbers are in.

## Demo candidates

| Repo | URL | Scan time | Components found | Lockfile entries | cdxgen | Delta | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| chalk | https://github.com/chalk/chalk | - | - | - | - | - | - |
| axios | https://github.com/axios/axios | - | - | - | - | - | - |
| lodash | https://github.com/lodash/lodash | - | - | - | - | - | - |
| express | https://github.com/expressjs/express | - | - | - | - | - | - |
| vite | https://github.com/vitejs/vite | - | - | - | - | - | - |
| prettier | https://github.com/prettier/prettier | - | - | - | - | - | - |

Selection criteria: scan completes in under ~2 minutes (fits the demo narration window), enough components to demonstrate pagination, clean scan with no errors, recognizable project name.

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

These repositories are chosen to break things rather than demo well.

Note: Non-JS code in npm packages spans C, C++, and increasingly Rust (via napi-rs), and often ships as pre-compiled binaries rather than source. So the coverage gap is broader than vendored source alone, and that belongs in the known-limitations write-up.

## Why the lockfile cross-check matters

Syft can silently skip ecosystems, vendored code, and subdirectories it cannot parse - it reports no error, just fewer components. Comparing the component count against the repo's lockfile entry count is how we catch silent omissions. A large negative delta means Syft missed something, and that gap gets documented as a known limitation rather than hidden.

The lockfile count must come from an independent script that walks the cloned repo and finds every package-lock.json including ones in subdirectories. Counting via our own pipeline would defeat the purpose, since a lockfile Syft failed to find is also one it would fail to count. cdxgen component count is included as a second opinion to compare against Syft and lockfile results.
