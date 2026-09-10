# Production decision log

## 2026-09-10 — Run initialization

- Verified current main against GitHub and a clean local clone; it is the six-file bootstrap described by the authoritative workflow.
- Created `chore/foundation-recovery` from verified main before implementation edits.
- Preserve the existing Astro static-output architecture and approved Option B hybrid design; reconcile package/config corrections deliberately.
- Use Luna for batched source retrieval, Terra for ordinary implementation, and Sol for designated independent gates, as authorized by the workflow. Fast Mode is not requested.
- Original attachments remain outside the public repository. Approved Drive derivatives are the implementation sources.
- GitHub is the production ledger. Do not merge or deploy during this run.

## Foundation recovery

- Recovered missing source/assets from `parkerhamilton-ca-foundation-source.zip` in the canonical Foundation folder. Existing static Astro config was identical; preserved the main branch's Astro-aware check chain.
- Kept Astro 7.2.4 and TypeScript 5.9.3; pinned @astrojs/check 0.9.10 and @playwright/test 1.63.0 after registry verification. Generated lockfile with npm 11.9.0; npm ci succeeded under Node 24.19.0.
- Removed the placeholder import workflow and the parallel HTML QA generator. CI now runs install/check/tests/build and a real-app Chromium suite, with screenshot artifacts.
- Applied all five central copy corrections. Added a per-project shared-shell opt-out so a future dedicated page can own its route without duplicate generated output.
- Replaced historical environment-specific closeout/QA claims with current evidence records. Original historical reports remain in canonical Drive.
- Git CLI read access works, but direct push has no authenticated credential. Use the connected GitHub Git Database operations with verified file hashes and non-forced reference updates. No credential is copied into the checkout.
- The standard Chromium CDN download timed out. A scratch-only packaged Chromium is being prepared for the same repository test suite; it is not a production dependency. Managed browser preview access is blocked in this runtime.

## Release-gate corrections

- The first GitHub CI check identified a missing direct Node type dependency introduced by environment-based Playwright configuration. Pinned @types/node 24.10.1; the clean npm ci and full check now pass.
- npm audit reported a critical AVIF-processing advisory in Astro 7.2.4. Upgraded to the smallest patched Astro release, 7.2.8 (same Node compatibility). The current dependency audit reports zero vulnerabilities. Source: https://github.com/advisories/GHSA-26w7-cxv4-gfx2 . The portfolio uses trusted static assets; this correction hardens the build dependency without adding runtime services.
- The constrained environment's automatic detached Astro CLI preview conflicted with the test runner's process lifecycle. The browser harness now calls Astro's public preview API and retains the real built application's server in the runner lifecycle. It does not recreate page HTML.
- Draft PR #1 was opened early to expose CI while browser infrastructure was repaired. No foundation candidate or downstream clearance was declared from that early draft.

## Reporting Workflow Automation completed slice

- Independent branch from the exact foundation candidate; dedicated route opts out of the shared shell.
- Use four byte-identical approved synthetic dashboard images and local illustration controls; preserve Parker-reported preparation-time scope and human review/submission.
- Completed local Definition of Done and independent review; opened draft PR #2 against recovery. No merge or deploy.

## Grocery Automation completed slice

- Independent branch from the exact foundation candidate; dedicated route opts out of the shared shell.
- Use approved synthetic two-store sample and curated sanitized code excerpts; preserve AI-assisted authorship, price-estimate limits, human review and the historical/public-cleanup distinction.
- Completed local Definition of Done and independent review; opened draft PR #3 against recovery. No merge or deploy.

## Design Day completed slice and release-control repair

- `feat/design-day` was completed at `c74dc41e31c0eea4e1e035aa1403d2658ae1cc91` from the exact foundation candidate, using approved final-prototype media, museum-reference framing, process media, real demo video/audio, bounded role wording, and evidence-limited accessibility/testing claims.
- Original push CI run `34447214957` passed quality and browser jobs. The independent morning audit found no content/privacy/visual blocker; it identified only a missing draft PR and stale central ledger.
- Central orchestration opened draft PR #5 against `chore/foundation-recovery`. The PR-triggered CI run `34503836496` also passed both quality and browser jobs. No merge or deployment.

## Homepage hero implementation

- The scheduled hero workstream independently implemented the selected Cathedral Monument geometry/interaction on `feat/homepage-hero`, head `5bdecc19496611a3cccc6c1608d02786b7a84124`, draft PR #4.
- Production implementation uses deterministic server-rendered SVG plus a small TypeScript enhancement, with trajectory, responsive, reduced-motion, browser, safety and build gates green in run `34470520493`.
- This records implementation state only. Parker has subsequently reopened the literal hero H1/eyebrow wording and the surrounding homepage visual composition for specialist review. Do not infer that current copy/layout treatment is final merely because the implementation passes QA.

## Editorial and visual review hold

- Parker has intentionally opened two interactive specialist review loops before more user-facing production work: final copy/editorial review and visual-design audit.
- Current completed routes/hero should be preserved as audited starting points, not treated as immutable final copy or final composition.
- Known owner concerns include AI/cliche-sounding homepage H1/eyebrow wording, a weak Design Day title, inconsistent alignment of the lower model/system/automation card visuals, and excessive height in those cards.
- Until the specialist decision documents are available, do not spend Work allowance implementing new user-facing page copy or final layout for AskWill, Coast FI, Thesis, or Smith. Headless model/data/test preparation that cannot prejudice those decisions may proceed on isolated branches.
