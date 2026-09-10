# Smith Manoeuvre independent review

## Status: PASS

No contradiction was found among the V2 specification, reference model, canonical fixtures, and production engine. This review was limited to the approved V2 financial/accounting contract, representative independent period traces, runtime/output safeguards, the approved download identity, and repository gates.

## Contract and implementation findings

- The production engine preserves monthly ordering and does not round period values. For the standard case, the Canadian quoted mortgage conversion gives a monthly rate of `0.0037153195748071965`, the HELOC approximation gives `0.005416666666666667`, the effective investment conversion gives `0.004867550565343048`, and the fixed mortgage budget is `$2,324.586407999052`.
- Month 1 of the standard case independently reconciles: mortgage interest `$1,560.434221419023`, payment `$2,324.586407999052`, closing mortgage `$419,235.84781342`, actual principal reduction and month-end HELOC draw both `$764.152186580002`, opening-HELOC interest `$0`, and Smith/baseline external cash both `$2,324.586407999052`. The new draw earns no current-month HELOC interest and enters the portfolio at month end.
- Month 12 of the standard case applies one estimated tax offset of `$96.808628733659`; it all goes to the mortgage. Actual principal reduction and the new HELOC draw are both `$892.777237999311`. HELOC interest is calculated from the `$8,563.576307502633` opening balance and equals `$46.386038332306`. External cash is `$2,370.972446331358` in both scenarios.
- At an exact 65% starting LTV, month 1 closes with mortgage `$389,290.4301124614` and HELOC `$709.569887538615`. Eligible capacity, actual principal reduction, and draw are all `$709.569887538615`; secured debt remains exactly `$390,000`, or 65% of the constant `$600,000` home value.
- The standard case month 252 tax offset of `$8,974.570011190654` is routed once to the mortgage. It contributes to actual principal reduction of `$11,250.126266661651`, and readvancement uses that actual reduction. In payoff month 253, the mortgage opens at `$1,946.626136689256`, closes at zero, and the draw is limited to the same `$1,946.626136689256`; the unused `$370.727933119323` of the fixed mortgage budget is invested. Month 254 invests the full `$2,324.586407999052` unused budget.
- Post-payoff tax routing remains lossless. In the dedicated short-amortization case, month 24 sends the full `$5,000` offset to the portfolio, draws nothing, invests the full `$8,513.48587562512` mortgage budget, and matches `$833.333333333333` Smith HELOC interest in the baseline. External cash is `$9,346.819208958454` in each scenario.
- The standard case cumulative external cash is `$1,024,236.872858056` for both scenarios. Smith net position is `$640,806.6594520542` (`$1,060,806.6594520542 - $0 - $420,000`); baseline net position is `$529,827.1272850146`; their difference is `$110,979.5321670396`. Cumulative HELOC interest is not subtracted again.
- A separate recurrence calculation matched the selected production periods and totals within at most `5.19e-9` dollars across the standard, exact-65%, payoff, and post-payoff traces. These checks were calculated independently of fixture expected values.
- The fixture copy is byte-identical to canonical V2 JSON: 21 cases, SHA-256 `533e3118da10e1df92e60451ed8164093af48b36d66169b5e06f48d2b36527cc`. The runner compiles and executes the production module rather than the canonical reference source.
- Zero and near-zero mortgage-rate payment branches both return `$100` for `$1,200` over 12 months. Canonical zero mortgage, zero HELOC, zero investment-return, negative-return, payoff, tax, convergence, and 65% cases all pass.
- The engine clones inputs, is deterministic, performs no logging, storage, or network activity, and validates finite/domain inputs. Derived month counts must be safe integers. A 41-year manual horizon produces 492 periods, while a 1,001-year horizon throws typed `SIMULATION_LIMIT_EXCEEDED` before allocation; the 12,000-month operational guard is separate from the financial accounting rules.
- The approved workbook is an exact 170,917-byte copy with SHA-256 `3eb26f8f76c6dbc16ca42ec10debbb7d8b9f5b56fe9169fc55c49618a98c6ef9`. The scanner allowlist is limited to that path and hash, and mutation/path tests reject altered or unapproved binaries.
- Changed files are confined to the headless engine, fixture/runner, download safety/provenance, package test configuration, and the approved download. No UI, component, route, layout, CSS, visitor-facing copy, or browser test changed.

## Gates

| Gate | Result |
|---|---:|
| `npm run test:smith` | PASS — 21/21 canonical scenarios plus universal and helper invariants |
| `npm test` | PASS — Smith 21/21, then 11/11 Node tests: 8 baseline + 3 download-safety |
| `npm run check` | PASS — 29 files, 0 errors, 0 warnings, 0 hints; TypeScript clean |
| `ASTRO_TELEMETRY_DISABLED=1 npm run build` | PASS — 9 static pages built |
| `node scripts/public-safety-scan.mjs` | PASS — 70 repository files scanned, 0 flags |
| `git diff --check` | PASS |

No browser tests were added or run. No model rule, tax rule, or lending rule was reopened during review.
