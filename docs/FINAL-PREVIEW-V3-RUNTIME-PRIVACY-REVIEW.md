# Preview runtime privacy and native media follow-up review

Date: 2026-09-15

Status: SOURCE PATCH AND LOCAL VALIDATION COMPLETE / INDEPENDENT COORDINATOR REVIEW AND COMPLETE SUCCESSOR CI REQUIRED.

This is a narrow release-tooling correction under Parker's current explicit runtime privacy instructions. No route source, approved design/copy, frozen data/engine/workbook/media, caption wording, production configuration or preview authorization gate is changed. The earlier V3 recovery and native-duration review remain preserved; see `docs/FINAL-PREVIEW-V3-CURRENT-QA-AND-MEDIA-REVIEW.md`.

## Actual findings and corrections

| Observed source path | Concrete exposure | Corrected behavior and proof |
| --- | --- | --- |
| remote adapter Access evidence | `reviewEmail` and the owner policy include persisted the configured email in `access-policy.json` and `preview.json` | Exact identities are validated internally; returned/persisted proof masks all five configured runtime values. Synthetic existing Access fixture proves no policy broadening and no write. |
| remote API errors | Failure text included the account ID in the endpoint and serialized arbitrary API error messages | API diagnostics retain method, safe endpoint, HTTP status and numeric error codes. Exposed errors redact configured values and discard raw assertion properties. Synthetic HTTP 403 proof preserves the failure/code while leaking none of the five values. |
| executor child output | Raw stdout/stderr were streamed before any filtering, copied to JSONL and included in failure errors | Complete output is buffered up to 64 MiB and redacted before terminal/log output, including a value split between process chunks. Overflow kills the child and fails without emitting a partial prefix. Captured command data remains internal so parsing/gates retain their behavior. |
| executor child environment | Ordinary npm/Git/build/test children inherited `PREVIEW_REVIEW_EMAIL` | All five configured variables are removed from default child inheritance; only explicit per-command authorization is added back. The upload continues to receive only the API token/account ID it requires. |
| pinned Wrangler 4.131.1 secondary log | `cli.js:63262` enables direct disk logs unless `WRANGLER_WRITE_LOGS` is false/0; `cli.js:133913` logs the raw API endpoint | Every child receives forced `WRANGLER_WRITE_LOGS=false` and `WRANGLER_LOG_SANITIZE=true` after caller overrides. The runner retains its redacted command log. Deterministic test proves override resistance and correct narrow child scope. |
| CLI wrapper / error inspection | An uncaught AssertionError can render `.actual`/`.expected` in addition to its message | Exported CLI and client operations convert failures into errors with redacted message/stack/code and no raw actual/expected/cause. The uncaught CLI subprocess remains nonzero and contains no fixture value. |
| JSON, owner packet and snapshot persistence | Masking metadata alone could hide a changed private-valued binding field on packet reload | JSON/Markdown output is redacted. Real snapshots also hash the complete canonical raw binding state before masking; existing comparisons remain and additionally require this digest. Reload comparison passes for identical state and fails for a change hidden by a display mask. |

The five configured names are `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, and `PREVIEW_REVIEW_EMAIL`. Their values are not recorded here. Source tests use synthetic constants only. No real credential was sourced or sent for this review.

The redactor covers literal values plus their JSON-string and URL-encoded forms in both nested object keys and values at output boundaries. Ambiguous redacted-key collisions fail closed rather than silently discarding evidence. Private values remain available internally only where needed for authentication, exact Access policy validation or command parsing. Evidence retains operational Worker/version/domain/deployment identities and uses the aggregate raw binding digest to preserve comparison fidelity.

## Safety review

The actual Cloudflare mutation call sites remain exactly: empty Worker shell creation with public workers.dev disabled, preview-only Access application creation, and deletion of an exact proved inactive version. The only Wrangler upload command remains allowlisted `versions upload`; no production deployment, activation, DNS, route, custom-domain, analytics or registrar path was added. Existing transaction tests prove Access/guard ordering, cleanup ownership, exact candidate uniqueness, noindex protection and unchanged production bindings.

API credentials remain scoped to the fixed HTTPS Cloudflare API origin with redirect errors. Service-token headers are supplied only for the exact immutable preview origin. Authenticated redirects are checked before a second request; the external-redirect test proves no credential-bearing request reaches another origin. Browser automation still uses request interception with `maxRedirects: 0`, without global browser credentials. No request handling or gate was relaxed.

## Independent native duration check

The incoming remote module was SHA-256 `3273bffaffa44910aaf81b20a1b3e154deb125ed91873f14534c02f0f923bfbb`. Its `assertBrowserMediaDuration` helper is unchanged by this privacy patch. It uses the independently probed approved Wealthsimple video-stream duration 101.63486666666667 seconds for WebKit, and the unchanged 101.652-second container/audio duration for Chromium/Firefox. Absolute tolerance remains 0.001 seconds; Design Day remains 8.475 seconds. VTT upper bounds and exact MP4/poster hashes are unchanged. The four duration tests reject the wrong stream, invalid/stale values, unknown routes/engines and values beyond the existing tolerance.

## Reviewed source identities

| File | SHA-256 |
| --- | --- |
| Input canonical executor | `6c03590af87d16e11d1cbdce96497a8f30134bc14ee87a72c80aeef8733184c0` |
| Final readable executor | `c0eafd82a4e46ddaeb7c59f3d86ef89336acbee42d55bd764e0e6fe518b171ca` |
| Final remote adapter, including duration correction | `05e01c37b84da2fbc49e87bca55413f4e10943f0a54c674f66ea09bff4247bc7` |
| Unchanged release-dist validator | `e412bca399668d2e4106e5b8fea444b3eee7644d7c7c557cb42b46f257a068e7` |
| Runtime privacy tests | `f8873b2e88e070653e969d4989d02ad722a93df136c9d30dee5b25fe0399078a` |
| Native duration tests | `cebdbf7b63589819bc750788cebb68084e9c070e6f60a37c15be68d4623ca9c0` |

The integrity manifest must pin these final runtime bytes deliberately after review. The historical unrecoverable V2 digest remains `46b2812a7d17dd50f2f4d0aedf748966df38ddf9570c11528ed8c3bc2d808e30`; its payload bytes are unchanged. No derived payload replaces readable source authority.

## Validation evidence

Local composed suite: **74 PASS / 0 FAIL / 0 SKIPPED** under Node 24.19.0, covering 12 new privacy tests, four native-duration tests, 46 existing V3 behavior tests, four static safety tests and eight source-integrity tests. Canonical executor/remote syntax checks pass. The complete test output is `evidence/preview-security-local-tests.tap`, SHA-256 `cb6fcc7e17fb79826259de8fd28ba4ffe71cbcadbca557327f029177d4b84a95`. The initial isolated fixture omission was repaired by copying the unchanged frozen fixture inputs; it did not require a source or expected-hash change. No failed test was reclassified as PASS.

The complete successor Actions workflow explicitly includes `tests/preview-v3-runtime-privacy.test.mjs` together with existing integrity, release-dist, static safety and duration tests. Full QA self-check, infrastructure validation, build, release-dist validation, and Wrangler dry-run remain required in the one exact green run. This local report is not a substitute for that run, final integrated certification, authenticated preview, independent owner-parity review, or conditional production authorization.

Production mutations during this review: **0**. No site source or frozen artifact was changed.
