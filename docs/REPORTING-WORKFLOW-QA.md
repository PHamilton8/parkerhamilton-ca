# Reporting Workflow Automation — QA and provenance

Route: `/work/reporting-workflow`. Branch: `feat/reporting-workflow`.
Base: foundation candidate `acfeba769bea3d47672c0f200b6b85bfd40cde4f`.

## Sources and scope

Approved Drive package `1xoyD7H6Vo_ewUc3vCFhZ9Mw3oMII6N9L` from Case Studies / 05 Reporting Workflow. Copy follows its public copy bank, claims audit, evidence, workflow before/after, public framing and public-safety rules. Only the four approved synthetic dashboard PNGs were copied; public filenames use Reporting Workflow Automation.

The preparation-time result is explicitly Parker-reported: 45+ minutes to under 10 minutes. No independently measured savings, error-elimination claim, autonomous submission, or employer-identifying detail is added. Fictional records and example.com addresses remain labelled. Buttons change illustrations only; review, external submission, reference capture and sending stay with the user. No workbook, macros, private record or communication is published.

## Verification

- Clean `npm ci` passed on the isolated branch.
- `npm run check` passes Astro and TypeScript with zero errors, warnings or hints.
- `npm test`: 9 source and route assertions pass.
- `npm run build`: actual Astro static build passes (also runs in browser test startup).
- `npm run test:browser`: full suite covers foundation regressions and reporting desktop/tablet/mobile rendering, real image loading, console errors, overflow, keyboard activation, visible focus, illustration state changes and reduced motion.
- `node scripts/public-safety-scan.mjs`: PASS, including all added files.
- Real-app screenshots: `docs/qa/reporting-workflow/reporting-workflow-{1440,820,390}.jpg`.

Local browser QA uses Chromium 152 through the configurable Playwright executable path because the standard browser CDN download timed out. CI uses the normal pinned Playwright browser installation. No additional runtime package is committed.

Independent review is recorded separately before publication. No merge or deployment is performed. Hero and site-wide integration remain deferred.
