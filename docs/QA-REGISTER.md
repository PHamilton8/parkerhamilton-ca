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
