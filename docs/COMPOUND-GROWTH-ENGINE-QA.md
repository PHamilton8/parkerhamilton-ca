# Compound Growth engine QA

## Authorities

- Governing prep workflow 13: Drive `10VQwMoLuQvYGdvJgZxKDQGZE7v-2TBku`.
- `THESIS-INTERACTION-SPEC-V2.md`: Drive `1y6HU1MCgP_eyM6a1nSIVuRFaz4v0-yf4`.
- `WORKSTREAM-CLOSEOUT.md`: Drive `160nPmSjQyNFRk9ria_gooyMaOU8BihLM`.
- `THESIS-CLAIMS-AND-CAUSAL-LANGUAGE.md`: Drive `16J0Ot76MgAF3BZmw-XIirpLt9ROQxd7f`.
- Canonical data identities and SHA-256 hashes: `COMPOUND-GROWTH-DATA-PROVENANCE.md`.
- Branch `prep/compound-growth-engine`; exact base `acfeba769bea3d47672c0f200b6b85bfd40cde4f`.

## Implementation boundary

`src/data/compound-growth/sources/` contains byte-preserved copies of the three canonical JSON files. `fixedExperimentalData.ts` exports historical source data only and does not import the explorer. The nine displayed experimental rows are stored values and are never calculated.

`src/lib/calculators/compoundGrowth.ts` separately implements the V2 annual model: existing balance grows once, then the annual contribution is credited at year-end. It defaults to age 25 to 65, $1,200 annual contribution, 10% annual return, and a zero starting portfolio. The typed headless input can accept an optional starting portfolio; the V2 launch plan uses four controls and a zero starting balance; this branch makes no UI-control decision.

Experiment 4 and study-summary JSON stay raw historical source material. The engine does not derive mechanisms, causal ordering, or actual behaviour from their measured mediator data. Contribution-related identifiers use `planned` only where supplied by the canonical source.

## Verification

`npm test` runs 13 Compound Growth tests plus the 8 existing repository contracts (21 total):

- SHA-256 identity checks against the recorded canonical hashes for all 3 JSON files;
- all 9 fixed experimental rows checked exactly;
- fixed-data dependency boundary check;
- independent annual future-value, zero-return, zero-contribution/zero-start, optional-starting-portfolio, approved age/horizon bounds, annual-age-ledger, and end-of-year timing checks;
- invalid age/portfolio/contribution/return and non-representable finite-number safeguards;
- negative and tiny valid return checks;
- presentation-neutral EGR preset and formula checks.

Also run `npm run check`, `npm run build`, and `npm run public-safety` before handoff. No browser tests are added for this headless engine.

## Review status

Statistical-boundary review: **PASS**, with no unresolved findings; see `COMPOUND-GROWTH-INDEPENDENT-REVIEW.md`. Independent verification passed all 21 tests, Astro/TypeScript checks with 0 diagnostics, the 9-page build, and the public-safety scan with 0 flags. The initial scratch-file test dependency was removed; all committed tests run using repository files and recorded canonical hashes. Input bounds, negative starting portfolios, and the explicit zero-return branch were also checked.

**NO USER-FACING UI/COPY/STYLING IMPLEMENTED.** No routes, components, existing visitor data, CSS, or download assets were changed. No merge or deployment.
