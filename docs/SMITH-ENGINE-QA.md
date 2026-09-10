# Smith Manoeuvre V2 Engine QA

## Implementation

- Production module: `src/lib/calculators/smithManoeuvre.ts`
- Branch: `prep/smith-manoeuvre-engine`; exact base: `acfeba769bea3d47672c0f200b6b85bfd40cde4f`.
- Canonical fixture: `tests/fixtures/smith/smith-test-cases-v2.json`
- Fixture SHA-256: `533e3118da10e1df92e60451ed8164093af48b36d66169b5e06f48d2b36527cc`
- Fixture identity: byte-for-byte copy of the approved V2 canonical JSON; 21 cases.
- Runner: `tests/run-smith-manoeuvre-tests.cjs` compiles and imports the production module, then runs the fixture suite. It does not execute a copied reference model.

The engine preserves the V2 monthly ordering: Canadian nominal-semi-annual mortgage conversion, opening-balance HELOC interest at annual rate divided by 12, effective monthly investment return, annual tax-offset settlement, actual-principal readvancement, constant-home-value 65% revolving cap, external HELOC-interest cash, equal-cash baseline, post-payoff budget investment, and the specified net-position equations.

## Canonical Drive authority

Authority is the current Smith Manoeuvre V2 contract and closeout in ParkerHamilton.ca / Case Studies / 06 Smith Manoeuvre, with planning folder `17TRG4r_6AW2IEMtiqNCS8GydPuDTfI6W`. Governing prep workflow 13 is Drive `10VQwMoLuQvYGdvJgZxKDQGZE7v-2TBku`.

| Artifact | Drive ID |
|---|---|
| V2 specification | `1e1TSzHDU58ecYR6aQSizmE5TDplFzKKS` |
| Reference model | `1JDURkIrLSmDji2BSnwSAs0OabjMEHQ6s` |
| V2 fixture JSON | `1IKinurUs6nIqPr92cWT_ES7IHGXU1-yc` |
| Canonical runner | `17wJEwR4_hr2sjjTBSwzNWg6Tsb-LKf2g` |
| Formula QA | `1kM6B9yX3FPz5JugJRJIwmdUPVaTfeUtQ` |
| Workstream closeout | `1vPtIi3hrJkwZi75caOtZcvyONKftJ5u_` |

The approved sanitized-workbook provenance is maintained separately in `docs/SMITH-DOWNLOAD-PROVENANCE.md`.

## Test coverage

`npm run test:smith` covers all 21 canonical cases, including the five golden scenarios and expected validation errors. For every valid case it also asserts:

- finite outputs and deterministic monthly count/order;
- tax offset only in months 12, 24, 36, and so on, with each annual amount based on that year's HELOC-interest bucket exactly once;
- HELOC draws never exceed actual principal reduction or the 65% secured-LTV envelope;
- Smith and baseline external cash are equal every month and cumulatively;
- mortgage and HELOC balances never go negative;
- Smith, baseline, and difference net-position identities.

Focused helper checks cover Canadian mortgage conversion, annual/12 HELOC conversion, effective monthly investment conversion, and invalid helper domains. Dividend/investment double counting is not applicable to V2: it has no dividend or distribution input, and contributions are limited to new HELOC draws, tax-offset excess, unused Smith mortgage budget, unused baseline mortgage budget, and the baseline's matching HELOC-interest contribution.

## Operational limit

`MAX_SIMULATION_MONTHS` is 12,000 months (1,000 model years). It is an execution-resource guard, separate from the V2 financial input domain and well beyond the soft launch UI range. `runSmithScenario` throws `SmithComputationLimitError` with code `SIMULATION_LIMIT_EXCEEDED` before allocating periods when the horizon exceeds this limit. Derived period counts must also be safe integers. The runner verifies that a 41-year manually entered horizon remains valid, an unsafe derived count fails validation, and a 1,001-year scenario fails promptly with the typed operational error. A future UI must handle that error neutrally.

## Review status

Independent Sol period-trace accounting review: **PASS**, no unresolved findings or accounting contradiction. See `SMITH-INDEPENDENT-REVIEW.md` for independent monthly calculations, the 65% boundary, tax/prepayment, payoff, post-payoff, and equal-cash traces.

Final gates: **21/21 canonical cases plus period/helper invariants**, **11/11 repository/download tests** (32 named cases/tests overall), Astro/TypeScript **0 diagnostics**, static build **9 pages**, and `node scripts/public-safety-scan.mjs` **PASS**. Fixture and approved V2 workbook byte identities were independently verified.

**NO USER-FACING UI/COPY/STYLING IMPLEMENTED.** No routes, components, styling, visitor-facing copy, or browser tests were added. No merge or deployment.
