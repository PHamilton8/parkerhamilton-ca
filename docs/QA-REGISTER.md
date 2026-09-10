# QA register

| ID | Scope | Gate | Status | Evidence / resolution |
|---|---|---|---|---|
| F01 | Foundation | Source recovery and required copy corrections | PASS | Reconciled source; 5 corrections and regression assertions |
| F02 | Foundation | Exact package pins and npm lockfile | PASS | Astro 7.2.8, TS 5.9.3, check 0.9.10, Playwright 1.63.0, Node types 24.10.1; Node 24.19.0 |
| F03 | Foundation | npm ci, Astro/TypeScript checks, source tests, build | PASS | 0 diagnostics; 8 tests; 9 pages |
| F04 | Foundation | Actual Astro app browser QA at eight required widths | PASS | 3 Playwright tests; screenshots at docs/qa/foundation; keyboard/focus/skip/reduced-motion |
| F05 | Public repository | Secret/privacy/claim scan | PASS | Full source/assets provenance review; automated scan passes; npm audit 0 vulnerabilities |
| F06 | Foundation | Independent adversarial review | PASS | Sol review at candidate acfeba769bea3d47672c0f200b6b85bfd40cde4f; no implementation blocker |
| F07 | Foundation | Draft PR and CI | PASS | Draft PR #1 open; CI run 34444348179 quality and browser success |

Foundation continuation condition passed at the recorded candidate. Downstream pages require their own Definition of Done and independent review.

## Reporting Workflow Automation

- Branch `feat/reporting-workflow`, head `a4b60e6722ea04eb4724d424afea041741591418`, [draft PR #2](https://github.com/PHamilton8/parkerhamilton-ca/pull/2).
- npm ci/check/test (9/9)/build/browser (5/5)/safety PASS; independent review PASS; GitHub CI PASS (quality + browser, run 34445631143).
- Evidence: feature branch `docs/REPORTING-WORKFLOW-QA.md` and `docs/qa/reporting-workflow/`.
- No implementation blocker. Copy/visual treatment is now subject to Parker's separate specialist review loop before final integration.

## Grocery Automation

- Branch `feat/grocery-automation`, head `672818569d66764cc5892aa55fc32b8670294716`, [draft PR #3](https://github.com/PHamilton8/parkerhamilton-ca/pull/3).
- npm ci/check/test (9/9)/build/browser (5/5)/safety PASS; independent review PASS; GitHub CI PASS (quality + browser, run 34446359420).
- Evidence: feature branch `docs/GROCERY-AUTOMATION-QA.md` and `docs/qa/grocery-automation/`.
- No page implementation blocker. Historical Gemini credential was not accessed or published; Parker has confirmed separately that the historical credential was revoked/rotated. Copy/visual treatment remains subject to the specialist review loop.

## Design Day

- Branch `feat/design-day`, head `c74dc41e31c0eea4e1e035aa1403d2658ae1cc91`, [draft PR #5](https://github.com/PHamilton8/parkerhamilton-ca/pull/5).
- Original push CI run `34447214957`: quality + browser PASS.
- PR-triggered CI run `34503836496`: quality + browser PASS.
- Route-specific npm ci/check/test/build/browser/safety and independent review PASS; real-app screenshots exist at `docs/qa/design-day/`.
- The morning independent audit found no content, privacy, provenance, or objective visual blocker. The former release-control gap (missing PR/stale ledger) is now closed.
- Parker has separately reopened the literal title/copy and final visual treatment for specialist review, so QA approval does not mean the current wording/composition is final.

## Homepage hero

- Branch `feat/homepage-hero`, head `5bdecc19496611a3cccc6c1608d02786b7a84124`, [draft PR #4](https://github.com/PHamilton8/parkerhamilton-ca/pull/4).
- GitHub CI run `34470520493`: quality + browser PASS.
- Trajectory mathematics, nine-ribbon structure, actual-Astro responsive behavior, reduced-motion, pointer settle-back, public safety, build and performance evidence PASS.
- The Cathedral Monument implementation remains technically valid, but Parker has reopened the homepage H1/eyebrow wording and surrounding visual integration for a separate editorial/visual decision pass.

## Current review hold

Further user-facing page UI for AskWill, Coast FI, Thesis, and Smith should wait for the interactive copy/editorial and visual-design audits. Non-UI model/data/test preparation may proceed when it cannot prejudice those decisions.
