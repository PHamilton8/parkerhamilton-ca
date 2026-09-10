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
