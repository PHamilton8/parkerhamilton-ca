# Compound Growth independent review

## Status: PASS

Independent review found no remaining blocker against `canonical/13-headless-production-prep-work.md` section 7 and `canonical/compound/THESIS-INTERACTION-SPEC-V2.md`. Review was bounded to the headless Compound Growth data, explorer engine, EGR helpers, tests, and supporting QA/provenance documentation.

## Findings

- The fixed recreation contains exactly nine authoritative rows: years `0, 5, 10, 15, 20, 25, 30, 35, 40`; contributions `0, 6000, 12000, 18000, 24000, 30000, 36000, 42000, 48000`; balances `0, 7717, 20146, 40162, 72399, 124316, 207929, 342589, 559461`.
- The three repository JSON copies match the canonical files byte-for-byte. Their recorded SHA-256 values are `18e9f2fe67702dacfcf0c9e5afbdb141c2ff8a532d1809499acba00212bed4a9`, `342f410073d22e5a1dd38f80be8757252d82b13dbe283bfa0b3d035489a58012`, and `74ac7423668fd3627ce8a811c05e76ce9166a92f1fc355591ae22c65f24ef0c0`.
- The fixed-data module has exactly three runtime imports, all local canonical JSON copies. It has no explorer dependency and does not recalculate historical balances.
- The five-study summary and Experiment 4 values remain unchanged canonical source data. Presentation condition is the randomized variable; Estimated Growth Ratio, growth confidence, retirement-goal achievability, and planned contributions remain measured outcomes or associations. No engine type or function turns the mediator sequence into a causal chain or describes planned contributions as actual behaviour.
- The explorer is a separate pure typed annual ledger. It supports a configurable headless `startingPortfolio`, defaults it to `0`, compounds the opening balance once per year, and adds the annual contribution at year-end. It uses the V2 annual-return decimal directly, with no monthly conversion or annuity-due timing.
- Input validation covers finite values, whole-year and inclusive V2 age bounds, retirement after starting age, a maximum 60-year horizon, nonnegative starting portfolio and annual contribution, and returns greater than `-100%`. Equal ages produce the typed no-time-remaining error. Non-representable output values also fail with a typed error.
- The zero-return branch is explicit. Zero contribution, zero starting balance, optional positive starting portfolio, end-of-year timing, annual ledger points, and five-year display-point selection are covered.
- An independent representative calculation for age 30 to 32, $100 contributed annually, 10% annual return, and zero starting portfolio gives `$210`, matching the engine. The default 40-year scenario gives `$531,111.066818113`, 40 year-end contributions, and `$48,000` total contributions; this expected annual-model result remains distinct from the fixed `$559,461` experimental balance.
- EGR helpers use the specified `3.6 / 10.3 / 17.0` and `3.6 / 10.3 / 27.8` presets. The ratios are exactly `1` and `17.5 / 6.7` (approximately `2.61`), and a zero earlier-gain denominator returns `undefined`.
- Changed files are confined to headless data, calculator code, tests, package/type configuration, and Compound Growth QA/provenance documents. No page, component, layout, copy, or CSS file changed.

## Gates

| Gate | Result |
|---|---:|
| `npm test` | PASS — 21/21: 13 Compound Growth + 8 baseline |
| `npm run check` | PASS — 30 files, 0 errors, 0 warnings, 0 hints; TypeScript clean |
| `npm run build` | PASS — 9 static pages built |
| `npm run public-safety` | PASS — 71 repository files scanned, 0 flags |
| `git diff --check` | PASS |

No browser tests were added or run for this headless workstream. No manuscript or public-finance research was used.
