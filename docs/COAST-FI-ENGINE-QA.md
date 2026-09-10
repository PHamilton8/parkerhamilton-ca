# Coast FI engine QA

## Source identity

Authority: `ParkerHamilton.ca / Case Studies / 07 Coast FI / Planning` (Drive folder `1JP2-eO8jmq-5MqsfDlN0vccFkkJesZR3`), specifically the V2 specification, reference model, fixed V2 fixture suite, runner, and regression evidence. Exact foundation base: `acfeba769bea3d47672c0f200b6b85bfd40cde4f`; branch: `prep/coast-fi-engine`.

Canonical Drive file identities: specification `1_HdsA6wtFwstnXINd3TlgAQbUP2ZJaLS`, reference model `12H9pn6yHvAVxLkcCTm2AFcRZYqWC9uRD`, fixtures `1jZJ3tIixlqRhakynLRomi-8hMAa_9bgJ`, runner `1LEPkxDc-7khzqZ5blsXP6xaeLB0C8pXG`, and evidence `1Bmzd5___q0mKDD2w6uwm6id8Z7GrfaDb`.

`tests/fixtures/coast-fi/coast-fi-test-cases-v2.json` is byte-identical to the approved fixture source: SHA-256 `58aae6e5edc30921b1c49c6a8abdf26ba955deb6fd4ef0ba60aa0c3e084d866a`.

## Implementation

`src/lib/calculators/coastFi.ts` is a pure, typed V2 port. It supports all four modes, effective monthly real returns, end-of-month constant real contributions, zero-return branches, negative real returns above -100%, whole-month age resolution, and the approved relative tolerance for Coast-crossing equality.

No UI, storage, analytics, network, date access, or financial-input logging was added.

## Validation

- Production V2 fixtures: **34 passed, 0 failed, 34 total**.
- Coast invariant tests: **16 passed, 0 failed, 16 total**.
- Existing repository and download-safety tests: **11 passed, 0 failed, 11 total**.
- Type and Astro checks: **0 errors, 0 warnings, 0 hints**.
- Static build: **9 pages built**.
- Dependency audit: **0 vulnerabilities**.

The production fixture runner imports the production module directly, so fixture results do not execute the canonical reference module.

## Numerical hardening

Independent review identified overflowing derived results, a possible false Mode C crossing caused by infinite tolerance, missing exported-helper portfolio validation, and tiny nonzero returns being treated as zero. The production engine uses stable `log1p`/`expm1` arithmetic, exact zero branches, explicit helper validation, and a separate `CoastFiCalculationError` with code `NUMERIC_RANGE_EXCEEDED` for values outside JavaScript's representable range. It does not narrow the approved return range or clamp negative returns. Mode C skips an unrepresentably large threshold when a finite portfolio cannot reach it and continues searching later months.

The financial rules and all 34 canonical fixture bytes remain unchanged. Successful results contain finite numbers; an unrepresentable output is a calculation-range failure rather than an invalid-input or successful zero/infinite result. A later UI must handle this typed failure. These are numerical safeguards, not new financial assumptions.

**NO USER-FACING UI/COPY/STYLING IMPLEMENTED.** No route, component, global style, public copy, or browser test was added or changed. No merge or deployment.

## Review status

Independent Sol mathematical review is **PASS**, with no unresolved findings. See `COAST-FI-INDEPENDENT-REVIEW.md` for independent high-precision examples and adversarial numerical cases. All 61 tests, Astro/TypeScript checks, the 9-page build, and the public-safety scan were rechecked after the numerical fixes. The engine is prepared for a draft PR; editorial/visual approval and future UI integration remain separate.
