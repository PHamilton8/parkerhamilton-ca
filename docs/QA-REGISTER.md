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

Foundation continuation condition passed at the recorded candidate. Downstream pages now require their own Definition of Done and independent review.

## Reporting Workflow Automation

- Branch `feat/reporting-workflow`, head `a4b60e6722ea04eb4724d424afea041741591418`, [draft PR #2](https://github.com/PHamilton8/parkerhamilton-ca/pull/2).
- npm ci/check/test (9/9)/build/browser (5/5)/safety PASS; independent review PASS; GitHub CI PASS (quality + browser, run 34445631143).
- Evidence: feature branch `docs/REPORTING-WORKFLOW-QA.md` and `docs/qa/reporting-workflow/`.
- No outstanding implementation blocker.

## Grocery Automation

- Branch `feat/grocery-automation`, head `672818569d66764cc5892aa55fc32b8670294716`, [draft PR #3](https://github.com/PHamilton8/parkerhamilton-ca/pull/3).
- npm ci/check/test (9/9)/build/browser (5/5)/safety PASS; independent review PASS; GitHub CI pending.
- Evidence: feature branch `docs/GROCERY-AUTOMATION-QA.md` and `docs/qa/grocery-automation/`.
- No page blocker. Source audit asks owner to confirm historical credential rotation; no credential was accessed or published.
