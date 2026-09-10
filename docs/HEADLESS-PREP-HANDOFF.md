# Headless production prep handoff — 2026-09-10

Authority: `ParkerHamilton.ca / Prompts / Next Parallel Workflows / 13-headless-production-prep-work.md`, Drive `10VQwMoLuQvYGdvJgZxKDQGZE7v-2TBku`, read in full. This was a fresh continuation from live GitHub and Drive state. The stalled execution was not resumed.

## Current durable state

- Live main: `ab35cba4647afec3ebf94365865fac49d34e049e`, unchanged.
- Immutable approved foundation candidate: `acfeba769bea3d47672c0f200b6b85bfd40cde4f`, unchanged.
- Central branch: `chore/foundation-recovery`. Its live head immediately before this final documentation record was `9a8b5c49617d4888a0206a17c6b7d8c7afb9231a`; this record adds documentation only. The enclosing Git commit identifies the final ledger revision.
- Repository: `PHamilton8/parkerhamilton-ca`, still public. Visibility was not changed.
- Each engine branches independently from the exact foundation candidate above. Local and remote Git trees, commit parents, fixture hashes, and binary blob identities were verified.
- All eight PRs are open drafts and unmerged. Engine PRs target `chore/foundation-recovery`; foundation PR #1 targets `main`.

| PR | Branch | Verified implementation head | Status |
|---|---|---|---|
| [#1](https://github.com/PHamilton8/parkerhamilton-ca/pull/1) | `chore/foundation-recovery` | Approved source candidate above; later commits are central ledger updates | Open draft |
| [#2](https://github.com/PHamilton8/parkerhamilton-ca/pull/2) | `feat/reporting-workflow` | `a4b60e6722ea04eb4724d424afea041741591418` | Open draft; preserved |
| [#3](https://github.com/PHamilton8/parkerhamilton-ca/pull/3) | `feat/grocery-automation` | `672818569d66764cc5892aa55fc32b8670294716` | Open draft; preserved |
| [#4](https://github.com/PHamilton8/parkerhamilton-ca/pull/4) | `feat/homepage-hero` | `5bdecc19496611a3cccc6c1608d02786b7a84124` | Open draft; preserved |
| [#5](https://github.com/PHamilton8/parkerhamilton-ca/pull/5) | `feat/design-day` | `c74dc41e31c0eea4e1e035aa1403d2658ae1cc91` | Open draft; preserved |
| [#6](https://github.com/PHamilton8/parkerhamilton-ca/pull/6) | `prep/coast-fi-engine` | `3e29b184bd1ee6935b5f9ff0c2761f256a36a894` | Complete; open draft |
| [#7](https://github.com/PHamilton8/parkerhamilton-ca/pull/7) | `prep/compound-growth-engine` | `bab5a26c6b4ce76cfa9ccf155284910c9116e19c` | Complete; open draft |
| [#8](https://github.com/PHamilton8/parkerhamilton-ca/pull/8) | `prep/smith-manoeuvre-engine` | `95dab36128fe436bc5ba62b7157b1c9fe72ba523` | Complete; open draft |

## Completed engines

| Engine | Test result on its branch | Independent review | GitHub CI |
|---|---|---|---|
| Coast FI | 34 canonical fixtures +16 invariants +11 foundation/download tests =61 passed | Sol mathematics/security PASS | Quality + browser PASS, [run 34518800172](https://github.com/PHamilton8/parkerhamilton-ca/actions/runs/34518800172) |
| Compound Growth | 13 data/explorer tests +8 foundation tests =21 passed | Sol statistical/data/mathematical boundary PASS | Quality + browser PASS, [run 34520118857](https://github.com/PHamilton8/parkerhamilton-ca/actions/runs/34520118857) |
| Smith Manoeuvre | 21 canonical cases with period/helper invariants +11 foundation/download tests =32 named cases/tests passed | Sol independent period-trace accounting PASS | Quality + browser PASS, [run 34521253242](https://github.com/PHamilton8/parkerhamilton-ca/actions/runs/34521253242) |

All three branches passed Astro/TypeScript checks with zero diagnostics, the existing 9-page build, and repository public-safety scans. Existing CI browser gates passed; no new UI/browser tests or design-approval screenshots were created for these headless engines. Engine-specific QA, provenance, and independent-review documents are committed on each engine branch.

### Canonical authority

- Coast: V2 spec `1_HdsA6wtFwstnXINd3TlgAQbUP2ZJaLS`; reference `12H9pn6yHvAVxLkcCTm2AFcRZYqWC9uRD`; fixtures `1jZJ3tIixlqRhakynLRomi-8hMAa_9bgJ`; closeout `1AzMCIjI-Spgq3yXFELpabDX9l6ATPSTg`.
- Compound: V2 interaction spec `1y6HU1MCgP_eyM6a1nSIVuRFaz4v0-yf4`; closeout `160nPmSjQyNFRk9ria_gooyMaOU8BihLM`; projection `1s762vzgrB782XD8nNQLD18jbzuFZF12k`; five-study summary `1baNNmWUYXg6Y93CU21V02Ns-N6f988mR`; Experiment 4 results `1c4VNgwPvkIOafI88s3pOOXg2510Pz6w7`.
- Smith: V2 spec `1e1TSzHDU58ecYR6aQSizmE5TDplFzKKS`; reference `1JDURkIrLSmDji2BSnwSAs0OabjMEHQ6s`; fixtures `1IKinurUs6nIqPr92cWT_ES7IHGXU1-yc`; closeout `1vPtIi3hrJkwZi75caOtZcvyONKftJ5u_`.

## Approved workbook preparation

| Branch | Exact public path | Source Drive identity | Bytes | SHA-256 |
|---|---|---|---:|---|
| Coast | `public/downloads/Coast_FI_Calculator_Public_Sanitized.xlsx` | `1iAvfZiNr4MSH2904x_swFck06rVgvSjs` | 257,107 | `469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a` |
| Smith | `public/downloads/Smith_Manoeuvre_Public_Sanitized_V2.xlsx` | `1OWhf0LuPxXO64zBwxJY5UcK7dA2bHPnR` | 170,917 | `3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9` |

Both are exact approved sanitized files. Read-only package checks passed. Original private files and the legacy Smith workbook were not included. Each branch permits its approved workbook only at the exact path with the exact hash; changed bytes and other private-source types remain blocked. No visible page link was added. Neither workbook was edited or recalculated.

## Resolved issues and integration notes

- Coast review found and fixed non-finite results, tiny-return precision loss, missing helper validation, and false crossing risks. Unrepresentable results now raise a distinct typed calculation-range error; the approved financial assumptions and canonical fixtures remain unchanged.
- Compound tests now run entirely from repository files and recorded source hashes. All nine experimental rows remain stored, separate from the annual explorer. The engine does not predict measured mediators or actual investment behaviour. The configurable starting portfolio defaults to zero; the later UI remains a separate decision.
- Smith's 12,000-month operational guard rejects impractical simulations before allocation. It is separate from financial-input validation and changes no V2 accounting rule. Independent monthly traces matched production within $5.19e-9. No accounting contradiction was found.
- Future integration must deliberately combine the engine test scripts and retain both approved-download path/hash entries. The isolated branches intentionally share the same foundation rather than depending on one another. Do not resolve shared-file conflicts by dropping another engine's tests or safety exception.

## Stop point and next task

The optional AskWill readiness check confirmed the Services, Water Softener Repair, and Contact comparison groups still exist by exact Drive identity and nonzero provider size. See `ASKWILL-ASSET-READINESS.md`. Fresh checksum equivalence remains unverified because provider metadata did not expose checksums and the bounded optional check did not download images. Verify bytes before any later copy; preserve the fresh live V2 recapture launch TODO. No AskWill page, asset, or crop was changed.

The three required safe headless engine slices are complete. No unresolved engine implementation blocker remains. The next user-facing production pass must wait for final decision documents from the active editorial and visual-design review loops (prompts 11 and 12). Do not opportunistically apply partial decisions.

After those decisions are final, perform a separate authorized integration and UI implementation pass. Preserve immutable canonical datasets and fixture suites, handle the documented calculation/resource errors, and retain approved public-download disclosures. No merge or deployment is authorized by this handoff.

**NO USER-FACING UI/COPY/STYLING IMPLEMENTED.** Existing visitor-facing copy, layout, components, cards, global styles, design tokens, hero geometry, and completed feature branches were preserved. No PR was merged, site deployed, DNS changed, repository visibility changed, or `askwill-staging` modified.
