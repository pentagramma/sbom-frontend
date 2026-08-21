
# Post-Sprint Roadmap: 21-Day Demo to MVP

## Where we are

The 21-day thin slice is done. A user pastes a GitHub URL for an npm project, watches the scan run, sees the component list, and downloads a CycloneDX file. The system runs end to end on Docker Compose on a single machine, which doubles as the first proof of the on-prem story.

That slice was deliberately narrow. It supports one ecosystem (npm), one output format (CycloneDX), and no vulnerability or compliance layer. Everything below closes that gap.

----------

## What this plan covers

Six weeks of work, grouped by capability rather than by day. Each week has one theme and nothing runs in parallel with anything else.

Weeks 1 to 3 are committed. Weeks 4 to 6 are planned, meaning the scope is right but the dates carry more uncertainty because they sit behind three weeks of dependencies.

Items deferred from the 21-day sprint are all in this plan. The genuine long-term backlog (AIBOM, HBOM, CI/CD plugins, supplier portal, policy engine, multi-tenancy) stays out and is tracked separately.

----------

## Week 1: Export correctness and Python support

**Ships:** SBOM export generated from our own data model rather than passed through from the scanner. Python support alongside npm.

Today the CycloneDX file we hand a customer is the scanner's raw output forwarded unchanged. It is valid, but we do not control what is in it, and we cannot add fields to it. Every compliance feature later in this plan depends on us building the file ourselves. This is the single most important item in the plan and it comes first for that reason.

Python rides along in the same week because the scanner already handles it well and the work is small.

**Checkpoint:** export a CycloneDX file we generated, validated against the official schema, for a Python project.

----------

## Weeks 2 to 3: Java

**Ships:** Java and Maven support.

Java is the largest single item in this plan and needs two weeks. It is also the one with the strongest commercial case. Java dominates Indian enterprise software, particularly in banking and government, and the government's own open-source platforms are Java-based.

The complication: Java projects do not list their full dependencies in a readable file the way npm projects do. Getting a complete list requires running part of the build. That means adding a Java toolchain to our scanning environment and handling projects split across multiple modules.

This matters commercially, not just technically. Without the build step we would return only the libraries a project directly names, missing everything underneath. That fails the transparency bar buyers are working to, so partial Java support is not worth shipping.

**Checkpoint:** a real Java project scanned with full dependency depth, cross-checked against what the project's own build reports.

----------

## Week 4: Vulnerabilities and licences

**Ships:** CVE matching and licence compliance.

Components get matched against known vulnerabilities and surfaced with severity in the UI. Licences get mapped to the standard SPDX identifiers so we can report on them and flag risky combinations.

This is the first week the product does something a security team would pay for on its own merits, independent of compliance.

**Checkpoint:** scan a project with known vulnerable dependencies and see them listed correctly with severity.

----------

## Week 5: CERT-In compliance reporting

**Ships:** the 21 CERT-In fields populated, per-component completeness reporting, and the compliance report PDF.

We currently populate 5 of the 21 fields. Weeks 1 to 4 supply most of the rest as a side effect: licences, hashes, vulnerability status, dependency relationships.

Some fields we will not be able to fill from an automated scan, such as criticality and usage restrictions, which are judgements the customer makes about their own software. The report will show those as explicitly unknown rather than blank. Stating what we do not know is treated as a mark of a good SBOM under current guidance, not a gap, and the completeness view is a feature buyers will use to see where they stand.

**Checkpoint:** a PDF compliance report for a real repository, reviewed against the CERT-In field list.

----------

## Week 6: Formats, signing, and access control

**Ships:** SPDX export and conversion, digital signatures on exported SBOMs, real login with basic roles.

CERT-In accepts both SPDX and CycloneDX, so we need both. Conversion between the two loses information in places; we flag those losses rather than hide them.

Signing proves an SBOM has not been altered after we produced it. Login and roles replace the placeholder authentication used through the sprint.

**Checkpoint:** signed SBOM in both formats, downloaded by a user who logged in with a real account.

----------

## Not in this plan

Deferred with reasons, not dropped:

-   **Docker image scanning.** Real customer demand, but a separate scanning path from repositories. Best done once the repository path is stable.
-   **Android and Gradle.** Builds on the Java work and needs it finished first. Indian government services are mobile-first, so this is a strong follow-on.
-   **.NET.** Strong market signal, and the same build-step problem as Java. Sequenced right after Java so it inherits that work rather than repeating it.
-   **On-prem packaging.** We already run on Docker Compose. Turning that into something a bank's IT team installs unattended is its own project.
-   **Go.** Weak demand in Indian government and BFSI compared to Java, Python and .NET. Technically the cheapest ecosystem we could add, so it can go in quickly if a customer asks for it.

The long-term backlog (AIBOM, HBOM, CBOM, CI/CD plugins, VEX and CSAF workflows, supplier ingestion, policy engine, multi-tenancy, air-gapped deployment) is unchanged and tracked separately.

----------

## Known limitations to state, not hide

These are properties of automated scanning generally, not defects specific to us. Competitors have the same gaps and are quieter about them. Naming them is the more defensible position with a technical buyer.

-   **Scanners can miss code silently.** Vendored code, C and C++ libraries bundled inside packages, and unfamiliar file layouts produce fewer components with no error. We cross-check component counts against the project's own dependency files to catch this, and disclose it in the report when it happens.
-   **Some fields cannot be automated.** Criticality and usage restrictions are customer judgements. We collect what we can and mark the rest explicitly unknown.
-   **Format conversion is lossy.** SPDX and CycloneDX do not map perfectly. We flag what was lost rather than silently dropping it.

----------

## Compliance context

CERT-In's Technical Guidelines v2.0 and its 21 minimum data fields remain our compliance target, and remain what RBI and SEBI point their regulated entities at.

Separately, CERT-In co-signed an international minimum-elements baseline published in July 2026 alongside CISA, BSI, ANSSI and others. Our 21-field work covers its component-level requirements. We are tracking it in case CERT-In revises its own guidelines to align.

Useful in a sales conversation: building to CERT-In's list is the harder target, so clearing it clears the international baseline on component data as well.

----------

## Open items

Decisions and verifications owned at the architecture level, not by the engineering team:

-   Terms under which the vulnerability database can be redistributed to on-prem customers. Business question, needs answering before on-prem packaging is scoped.
-   Vulnerability data freshness in disconnected environments. Air-gapped customers run whatever was last synced manually. This is a product limitation to state up front, not a bug.
-   Whether to accept already-built artifacts (JAR, WAR) as scan inputs in addition to repositories. Would sidestep part of the Java build-step problem.
