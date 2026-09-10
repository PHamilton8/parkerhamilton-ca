# Foundation QA report

Recovered source tested on 2026-09-10 with Node 24.19.0 and npm 11.9.0.

## Passed on corrected stack

- `npm ci` — clean lockfile installation succeeds.
- `ASTRO_TELEMETRY_DISABLED=1 npm run check` — real Astro check and TypeScript; 0 errors, 0 warnings, 0 hints.
- `npm test` — 8 source/route tests pass.
- `ASTRO_TELEMETRY_DISABLED=1 npm run build` — 9 pages generated.
- `npm run test:browser` — 3 Playwright tests pass against the actual built Astro preview.
- `node scripts/public-safety-scan.mjs` — no flagged credentials, private original files, local paths, analytics IDs, or unapproved public wording.
- `npm audit --audit-level=high` — zero vulnerabilities.
- `python tests/contrast_check.py` — all six checked text/background pairs exceed 4.5:1.

## Browser coverage

Widths: 1440, 1280, 1024, 820, 768, 430, 390, 360 CSS px. At each width: no horizontal document overflow; both Thesis representations visible; hero integration zone visible; every homepage image loads; no browser console/page errors; corrected titles; no LinkedIn placeholder or AskWill staging label.

Keyboard/focus test covers first-tab skip link, visible outline, primary home link, and reduced-motion scroll behaviour. All seven project routes render their correct H1 and document title.

Screenshots captured from that same real built application:

- `docs/qa/foundation/homepage-1440.png`
- `docs/qa/foundation/homepage-820.png`
- `docs/qa/foundation/homepage-390.png`

Local suite used Chromium 152.0.7977.0 supplied by a scratch-only packaged binary because the standard browser CDN timed out. Standard browser security options were retained; only normal headless/container launch options were supplied. CI uses the browser paired with pinned Playwright 1.63.0. No separate HTML preview was used.

## Resolved issues

- Corrected all five central copy findings.
- Added explicit Node type dependency after CI identified missing `process` types.
- Upgraded Astro 7.2.4 to 7.2.8 for GHSA-26w7-cxv4-gfx2; audit now clean.
- Kept the built preview in Playwright's lifecycle through Astro's public preview API; this avoids the CLI's agent-specific automatic background process and stale process-lock behaviour.

## Remaining gates

Independent adversarial review PASS at candidate `acfeba769bea3d47672c0f200b6b85bfd40cde4f`. GitHub CI run `34444348179`: quality PASS and browser PASS. Foundation continuation condition is satisfied. Hero integration, full case-study pages, and launch/live AskWill recapture remain separate work.
