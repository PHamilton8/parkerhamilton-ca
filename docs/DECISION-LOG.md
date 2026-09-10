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
