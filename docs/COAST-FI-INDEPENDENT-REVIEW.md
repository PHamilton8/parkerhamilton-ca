# Coast FI independent mathematical and security review

## Status

**PASS.**

The four-mode mathematical contract, canonical regression wiring, adversarial numeric behavior, validation, privacy properties, and public-download controls pass review. No unresolved mathematical or security findings remain in the reviewed scope.

## Scope and method

This review is limited to the headless Coast FI engine, its V2 specification and canonical fixtures, its focused tests, and the approved-download provenance/scanner change. It does not repeat the workbook research or test a webpage.

The review compared `src/lib/calculators/coastFi.ts` with the V2 mathematical contract, checked fixture identity and runner imports, recomputed representative outputs with an independent 60–70 digit Decimal implementation, exercised adversarial numeric and validation inputs, searched the engine for storage/network/logging behavior, and inspected the download allowlist delta.

## Findings

### High — valid inputs could escape the finite numeric result domain — RESOLVED

The specification permits every finite real return greater than -100% through 20%, ages from 18 through 100, and finite non-negative money values without a stated upper limit. Some permitted combinations exceed JavaScript's finite number range.

For example, the original port allowed Mode B with current age 18, retirement age 100, target Coast age 50, a zero portfolio, a $1,000,000 target, and annual real return `-0.9999999999999999` to overflow its Coast threshold and then throw `INVALID_NUMBER` for an internally derived value. Mode A could return non-finite values. Large finite portfolio/contribution inputs could likewise overflow under positive returns.

Resolution verified: `CoastFiCalculationError` now returns the distinct code `NUMERIC_RANGE_EXCEEDED` when a required result cannot be represented. Successful results are guarded against overflow and underflow. Mode C distinguishes overflowing and underflowing thresholds, skips only an unreachably high threshold, never compares non-finite values, and raises the typed range error when a crossed threshold cannot be represented in its result.

### Medium — exported target solver omitted current-portfolio validation — RESOLVED

`requiredMonthlyToTarget()` is part of the documented exported reference-function contract. The original port returned `NaN` for a `NaN` portfolio and accepted a negative portfolio, unlike the shared money-input rules and `portfolioFutureValue()`.

Resolution verified: the exported helper now rejects a non-finite portfolio with `INVALID_NUMBER` and a negative portfolio with `NEGATIVE_PORTFOLIO`.

### Medium — epsilon branch changed valid nonzero rates to zero — RESOLVED

The locked contract uses the linear annuity branch when the monthly rate equals zero. The original port instead used `abs(monthlyRate) < 1e-12`, so sufficiently small nonzero valid rates received zero-rate contribution accumulation while current-portfolio growth and thresholds still used compounding. Direct `pow(...)-1` evaluation also lost information for very small annual rates.

Resolution verified: zero branching is now exact, and stable `log1p`/`expm1` calculations preserve tiny nonzero rates. Scaling preserves an exact zero exponent, retains small growth increments without adding them to a much larger logarithm, and handles representability explicitly. The focused probe `portfolioFutureValue(1e16, 0, 480, 1e-16)` now returns `1e16 + 40` rather than losing or overstating the small nonzero growth.

### Medium — Mode C tolerance could create a false crossing for tiny targets — RESOLVED

The original comparison used a fixed minimum tolerance of `1e-12`. For a valid subnormal target this could make a zero portfolio compare above a positive threshold. Its range-error catch also skipped both high overflow and low underflow even though only a high overflowing threshold is necessarily unreachable by a finite portfolio.

Resolution verified: the comparison tolerance is now proportional to the threshold without a fixed-dollar floor. Range errors carry an internal direction, Mode C skips only threshold overflow, a zero portfolio continues past an underflowing positive threshold without a false crossing, and a positive portfolio crossing an unrepresentable threshold receives `NUMERIC_RANGE_EXCEEDED` rather than a delayed or fabricated Coast month.

## Independent mathematical checks

The following inputs were chosen independently of the fixture suite.

| Mode | Independent result | Hardened production result | Assessment |
|---|---:|---:|---|
| A, ages 37y3m to 67y9m, $123,456.78 current, $1.35m target, 3.7% real | Coast threshold `445740.09226609538`; zero-contribution retirement value `373909.94413960925` | `445740.0922660954`; `373909.94413960923` | PASS within normal binary64 error |
| B, ages 29y6m to 66y3m, Coast at 48y9m, $43,210.98 current, $1.75m target, 6.1% real | Monthly contribution `1130.1962380216297`; Coast balance `620895.95484309943` | `1130.1962380216298`; `620895.9548430995` | PASS; 231 month-end contributions and effective monthly rate used |
| C, ages 32y3m to 64y6m, $75,000 current, $1.25m target, 4.3% real, $1,250/month | First crossing month 337; portfolio `1049154.0085967571`, threshold `1048879.0102362734` | First crossing month 337; portfolio `1049154.008596757`, threshold `1048879.0102362735` | PASS; at month 336 portfolio `1044233.9511738632` remains below threshold `1045205.5380807560` |
| D, ages 41y6m to 68y3m, $310,000 current, $2m target, -2.7% real | Monthly contribution `8123.131589525658`; projected total exactly $2m at Decimal precision | `8123.131589525659`; `2000000` | PASS; negative effective real return and 321 end-of-month contributions preserved |

The formulas used an effective monthly rate `(1+r)^(1/12)-1`, ordinary-annuity contributions, fractional remaining years on the month grid, and no intermediate rounding.

## Canonical and security checks

- The fixture in `tests/fixtures/coast-fi/coast-fi-test-cases-v2.json` is byte-identical to the canonical V2 fixture and has SHA-256 `58aae6e5edc30921b1c49c6a8abdf26ba955deb6fd4ef0ba60aa0c3e084d866a`.
- The fixture runner imports `../src/lib/calculators/coastFi.ts` directly. It does not import the canonical reference implementation.
- The production engine began as a formula-for-formula port of the canonical reference model and adds only input/result validation and numerically stable evaluation of the same formulas. There are no fixture IDs, fixture reads, lookup tables, or case-specific constants in the engine.
- The engine contains no console logging, storage, network, analytics, URL, DOM, or date access. Test-runner console output reports only fixed regression data and failures.
- The approved workbook is byte-identical to the canonical sanitized workbook: 257,107 bytes, SHA-256 `469df9f9c589f57f17c4de52652abeca295223fbe90fe004268354958da6cf6a`.
- The scanner change allowlists only that exact repository path and hash. Other workbook/archive/document names remain rejected, altered approved-path bytes are rejected, and focused tests cover both cases. This does not create a general binary-file bypass.

## Verification gates

- Canonical V2 fixtures: **34 passed, 0 failed**.
- Coast invariants and adversarial regressions: **16 passed, 0 failed**.
- Existing repository and download-safety tests: **11 passed, 0 failed**.
- Total automated tests: **61 passed, 0 failed**.
- Astro and TypeScript checks: **0 errors, 0 warnings, 0 hints**.
- Static build: **9 pages built**.
- Public-safety scan: **PASS**, 71 repository files scanned.
- Dependency audit: **0 vulnerabilities** in the integration verification.

No UI, copy, layout, merge, deployment, or repository-visibility changes were reviewed or made.
