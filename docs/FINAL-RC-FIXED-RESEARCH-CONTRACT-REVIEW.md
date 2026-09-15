# Final RC fixed research contract review

Date: 2026-09-15

## Scope and authority

This follow-up changes only `tests/final-rc-contract.test.mjs` and this review record, based on V3 tooling commit `63ae5cc128e8ebeff69c65dba604130c337ee8bd`. It corrects an assertion about where frozen Compound research values are stored. It changes no site source, visible copy, research data, engine, fixture, workbook, media, runtime integrity pin, or workflow.

The final owner authority freezes Compound's research independently of the interactive monthly simulator. The existing frozen module imports the exact JSON below; the assertion now checks that import link and reads the counts from that JSON.

| Frozen source | Unchanged Git blob |
| --- | --- |
| `src/data/compound-growth/fixedExperimentalData.ts` | `b7846c19d29ed983dbb2c716b312866f2f6efe98` |
| `src/data/compound-growth/sources/experiment-summary.json` | `6a1d5d9971a2189d6a0f8fdb4443357a226d3246` |
| `src/data/compound-growth/sources/projection-data.json` | `cccf41099bf89591c7a5ff31e187fdacc8642ec5` |
| `src/data/compound-growth/sources/experiment-4-results.json` | `30ca6ff6dda8a7950d4655c5fd468c23d54e0019` |

All existing frozen blob assertions remain unchanged.

## Observed problem and corrected assertion

The old test searched `fixedExperimentalData.ts` itself for `1248` and `five`. That file is an import wrapper and does not contain those literals. Running the full current source contract against the disposable final-lane composition produced 25 passes and one failure at that stale wrapper premise.

The replacement requires the exact `experiment-summary.json` import and strictly checks the frozen JSON's `program.number_of_experiments === 5`, `program.final_analytic_n_total === 1248`, and `experiments.length === 5`. It does not accept an alternative old/new value or remove an identity check.

Reviewed test SHA-256: `25dd56f56f02841311615916f745a0e4ac1652aac03182f23fdcb69e1a06d787`.

## Validation

Node `24.19.0`; `node --check tests/final-rc-contract.test.mjs` passes. The unchanged full `npm run test:source` command runs all five current source suites:

```text
tests/source-contract.test.mjs
tests/route-contract.test.mjs
tests/coast-download-safety.test.mjs
tests/smith-download-safety.test.mjs
tests/final-rc-contract.test.mjs
```

The disposable composition with the corrected assertion passes **26/26, zero skipped**. Four complete disposable mutation fixtures each run the same 26 tests: exactly 24 pass and the intended two fail, with zero skipped or unrelated failures.

| Deliberate mutation in a disposable copy | Required rejection |
| --- | --- |
| Program experiment count changed to 6 | Exact frozen blob and strict count |
| Final analytic total changed to 1247 | Exact frozen blob and strict total |
| One experiment record removed | Exact frozen blob and strict record count |
| Module import changed to a different summary filename | Exact frozen blob and strict import link |

The real frozen JSON and module are unchanged before and after these checks. Initial incomplete negative fixtures produced unrelated missing-script errors; those diagnostics remain preserved and are not counted as validation. Complete-fixture reruns above supersede those trial results.

Local evidence under `evidence/fixed-research-qa-reconciliation/`:

- Original failing log SHA-256: `d6dfae9f2fb15a0a7591afd69476d3560128586bdb4cac9a558c07fdcc6c293c`.
- Full passing log SHA-256: `7ecf30dd77b835c12ad516168dcaf8908a4a961e09f0bb0d9661b1eef257620b`.
- Complete negative-result JSON SHA-256: `58cf1f59a7973b655e3b37a83fa540f6fa16e1e3ff933b16220fc04a697f3617`.

Status: **NARROW SOURCE-CONTRACT VALIDATION PASS; COMPLETE TOOLING CI REQUIRED**. These local checks do not certify an integrated RC, resolve independent accessibility findings, authorize preview upload, or prove production readiness.

