# Final Preview Runner V3 — Independent Capability Review

Status: **SOURCE CAPABILITY REVIEW PASS — SOURCE CI PASS — FINAL DURABLE AUTHORITY STILL REQUIRED**

This review is limited to release/private-preview tooling. It does not certify any route implementation, caption transcript, integrated candidate, Cloudflare account state, or production release. The final integrated candidate must still pass every live preflight and remote preview gate.

## Authority and review method

The reviewer read the current launcher, QA contract, machine-readable authority manifest, integration plan, private-preview runbook, infrastructure validators, QA harness, tooling status, owner checklist, and Design Day audio sign-off. Source existence, predecessor behavior, and syntax alone are not evidence of a capability passing.

Requirements references used below:

- **OWNER** — Parker's explicit `OWNER-AUTHORIZED FINAL PREVIEW TOOLING RECOVERY + RESUME ORIGINAL LAUNCH` instruction, sections 1–13 and stop conditions. It supersedes only the unrecoverable tooling artifact.
- **LAUNCHER** — [Final launcher](https://drive.google.com/file/d/1R2AznxH6ACtZeniDWuBEDlcmcPs_sjKx/view), especially phases 1, 8–10 and durable closeout.
- **QA** — [Final QA/accessibility/SEO/privacy/performance contract](https://drive.google.com/file/d/12hKr1lq7XBkjeIM5KJsGAep1fYk1k398/view).
- **MANIFEST** — [Final site authority manifest](https://drive.google.com/file/d/1Hxq9bXbmFIQRI6fRlQlOWbDVqp_RJUr2/view).
- **PLAN** — [Final commit/integration plan](https://drive.google.com/file/d/1vTbP5TSnE05LHsALYQWKc25JsLl0ZqWE/view).
- **RUNBOOK** — `docs/PRIVATE-FINAL-RC-PREVIEW-RUNBOOK.md`, authority `1bcdd96210e2406fbde2701ac4f74afa28896297`.
- **INFRA** — Cloudflare release infrastructure authority `9034eae2e072eefb14c33fee94c5b20dc94579ed` and its validators.
- **AUDIO** — [Design Day final audio sign-off](https://drive.google.com/file/d/1kYgls9So9wrlyQXcfOv2CuFtC086dczc9SNvbIl2Kd0/view): gate CLOSED, no intelligible speech, approved wording/visual-description treatment, automatic retiming authorized, exact 8.475-second MP4.

Result semantics:

- **PASS** means the reviewed replacement's implemented capability has evidence from the current source review and deterministic tests, with the evidence named. It never means live candidate or Cloudflare proof has already occurred.
- **FAIL / PENDING EXTERNAL** means a required acceptance gate has not yet been completed. The source CI proof in C41 is now complete. C41 acceptance remains open until the final documentation tip passes CI and the durable replacement authority is saved; this source review alone cannot close it.
- The separate **Live proof** column records the evidence the original launcher must obtain later; it cannot be satisfied by mocked tests.

## Current Cloudflare mechanics independently checked

The review consulted primary Cloudflare documentation on 2026-09-15:

- [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/): version URLs are immutable; aliases are mutable and are not acceptable as the owner review URL. Preview versions become routable immediately when preview URLs are enabled, so Access must precede RC upload.
- [Workers Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/): `preview_worker` limits protection to previews for one Worker. Production-wide Access policy changes are outside this task.
- [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/): `versions upload` creates an unpublished version, `--dry-run` performs no upload, and `versions deploy`, `triggers deploy`, normal `deploy`, and `rollback` mutate production or bindings.
- [Version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/): version `urls` identify immutable routable URLs and exclude aliases; version deletion uses the exact Worker/version endpoint. The API accepts a prefix or `latest`, so the runner must reject these locally.

## Capability matrix

Source abbreviations: **EXEC** = `scripts/final-rc-preview-exec.mjs`; **REMOTE** = `scripts/final-rc-preview-remote.mjs`; **UNIT** = `tests/final-rc-preview-v3.test.mjs`. Every location below refers to current readable source. Source capability review is complete for the exact hashes below. All 75 current deterministic tests pass with zero skips; the actual pinned wrapper verifies and loads. C41 records the exact successful source CI run; final-tip CI/Drive acceptance remains external. The proving-validation column distinguishes unit tests, source review and subsequent complete CI; no mocked remote response is live proof.

| ID | Current requirement | Source location/function | Required proving validation | Authority | Result | Live proof required later |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | Exact single RC SHA/ref, full SHA/tree, green-base ancestry | EXEC `parseArgs`, `main`, `preflight` | CLI negative tests; exact `rev-parse`; ancestry and clean worktree checks | OWNER §4, QA runtime | PASS | `preflight.json` with candidate SHA/tree |
| C02 | Clean detached worktree, exact Node 24.19.0, clean `npm ci` | EXEC `detached`, `preflight` | Runtime gate and command inventory; full CI uses exact Node/install | OWNER §4, QA runtime | PASS | Preflight command log |
| C03 | Current infrastructure validation and Wrangler preview dry run | EXEC `preflight`; `validate-cloudflare-infra.mjs` | Complete CI infra validator + `versions upload --dry-run` | OWNER §4/10, INFRA | PASS | Exact-candidate preflight logs |
| C04 | Exact final-RC QA, source/engine checks, build and built-route gate | EXEC `preflight`; `final-rc-qa.mjs` | QA harness syntax/load self-check; runner gate integration review | OWNER §4, QA, LAUNCHER phase 8 | PASS | Candidate `final-rc-qa/result.json` PASS at exact SHA |
| C05 | Public-safety, privacy, contrast and high-severity dependency audit | EXEC `preflight`, `verifyDist` | Current actual scripts invoked fail-closed; leakage fixtures; audit/contrast steps | OWNER §4, QA privacy/accessibility | PASS | Exact-candidate logs and dist checks |
| C06 | Full Chromium, Firefox and WebKit final release QA | EXEC `preflight`; final QA harness; Playwright config | Explicit three-project integration, authority tests load; no selective subset or skip override | OWNER §4/9, QA | PASS | Three-browser report from candidate |
| C07 | Applicable performance harness and reviewable asset sizes | EXEC `preflight`, `makeManifest` | Performance-script discovery and per-asset size/hash manifest checks | QA performance | PASS | Candidate performance output if harness exists; asset manifest |
| C08 | Exactly 8 indexable +1 noindex auxiliary +true404 | EXEC route constants, `validateRouteAccounting`, `verifyDist` | UNIT exact route list rejects missing/extra/duplicate HTML | OWNER §4, MANIFEST, QA | PASS | Local and remote nine-route +404 results |
| C09 | Sitemap exactly eight production-apex portfolio URLs | EXEC `validateSitemap` | UNIT rejects ninth/missing/duplicate/www/preview/query URLs | OWNER §4, QA sitemap | PASS | Local XML and remote byte identity |
| C10 | Exactly one production-apex self canonical on all nine real routes | EXEC `validateHtmlMetadata` | UNIT wrong/missing/duplicate canonical cases | OWNER §4/7, QA SEO | PASS | Local +remote metadata results |
| C11 | Portfolio source stays indexable; preview noindex is response-scoped | EXEC `validateHtmlMetadata`, `assertNoindexHeader`; REMOTE boundary/smoke | UNIT noindex/none/duplicate restrictive robots and complete header tests | OWNER §4/6, QA | PASS | Source robots + authenticated response headers |
| C12 | Wealthsimple exact H1, noindex/noarchive, no ContactBand or portfolio navigation | EXEC `validateHtmlMetadata` | UNIT H1/robots/ContactBand and absolute/relative navigation cases | OWNER §4/5, QA Wealthsimple | PASS | Remote exact HTML metadata |
| C13 | Wealthsimple absent from sitemap/Home/Work/global discovery | EXEC `validateHtmlMetadata`, `validateSitemap`; final-RC source contracts | UNIT discovery links and sitemap exclusions; final source contract | OWNER §4, QA | PASS | Candidate source/HTML and remote manifest |
| C14 | Genuine synchronized verbatim Wealthsimple captions tied to exact media | EXEC `validateHumanGates`, `validateMediaGate`, `verifyDist` | UNIT provenance/hash/uncertainty/timing gates; genuine transcription evidence required | OWNER §5, QA Wealthsimple, LAUNCHER phase 3 | PASS | Real transcription/review record + exact VTT hash; not satisfiable by synthetic text |
| C15 | VTT parses and cues stay inside measured media duration | EXEC `parseVtt`, `validateMediaGate`, measured durations | UNIT malformed/empty/reversed/out-of-order/overrun cases; actual ffprobe duration | OWNER §5, AUDIO, QA | PASS | Final VTT parse/timing output and native track load |
| C16 | Native player controls, no autoplay, correct preload, actual caption wiring | EXEC `validateMediaGate`, `verifyDist`; browser media checks | UNIT missing controls/autoplay/preload/caption/source mismatch cases | OWNER §5, AUDIO, QA | PASS | Remote video/track network and browser checks |
| C17 | Design Day audio gate CLOSED, exact authority; no renewed owner listen | EXEC `validateHumanGates`, media constants | UNIT closed signed authority required; no prompt/reopen execution path | OWNER §5, AUDIO | PASS | Frozen human-gates record quoting existing authority |
| C18 | Design Day exact approved 8.475-second MP4 and approved visual description | EXEC `validateMediaGate`, `verifyDist`; final source/browser gates | UNIT exact hash/duration/description tests; actual media hashing/ffprobe | OWNER §5, AUDIO, QA | PASS | Media hash/timing + adjacent description evidence |
| C19 | Wealthsimple final MP4/poster bytes unchanged | EXEC media constants, `validateMediaGate`, `verifyDist` | UNIT independent MP4/poster wrong-hash cases | OWNER §5, MANIFEST | PASS | Exact approved hashes in local and remote evidence |
| C20 | Coast/Smith workbooks and frozen engines/fixtures/research preserved | EXEC `assertFrozenAssets`; final-RC source contract; UNIT frozen blobs | UNIT independent exact workbook hashes and frozen repository blob identities | OWNER §2/7, MANIFEST, PLAN | PASS | Integrated frozen-path contract and remote workbook hashes |
| C21 | Immutable certified local dist and complete SHA-256 manifest | EXEC `files`, `makeManifest`, `preflight` | UNIT sorted manifest/size and same-size-byte-drift tests; source review of copy, symlink, certification-identity/reuse comparisons | OWNER §4/6/8, QA | PASS | Saved read-only dist and manifest hash |
| C22 | Snapshot routes, custom domains, deployments/version IDs and current LKG before guard | EXEC `runPreviewTransaction`; REMOTE snapshot | UNIT transaction order and snapshot mutation/malformed-response negatives | OWNER §6, RUNBOOK | PASS | Full `production-before.json`, exact current production identity |
| C23 | Establish narrowly scoped Access before any routable RC bytes | EXEC `assertSafeMutation`, `assertAccessPolicies`, transaction; REMOTE Access | UNIT scopes/identity policies and guard-before-candidate order | OWNER §6/7, RUNBOOK | PASS | Access application/policy identity, harmless guard proof |
| C24 | Anonymous denied/challenged; authenticated harmless guard allowed | EXEC `assertAnonymousDenied`, transaction; REMOTE boundary | UNIT denies success/arbitrary/spoofed redirects; mock auth failures block upload | OWNER §6, QA preview | PASS | Anonymous status + Access challenge and authenticated guard bytes |
| C25 | Authenticated noindex/nofollow/noarchive header before RC upload | EXEC `assertNoindexHeader`, transaction; REMOTE boundary | UNIT complete directive tokens and failure-before-upload tests | OWNER §6, QA preview | PASS | Guard and actual preview headers |
| C26 | Upload exact certified dist only as unpublished version | EXEC `assertUploadCommand`, transaction; REMOTE upload | Command whitelist, config allowlist, certificate/hash checks, mock ordering | OWNER §6/7, RUNBOOK | PASS | Upload record + immutable version detail + manifest match |
| C27 | Exactly one immutable version review URL; never a mutable alias | EXEC `assertImmutablePreviewUrl`, `main`; REMOTE upload/packet | UNIT immutable URL association; durable remote same-RC detection; actual adapter refuses an existing candidate in a fresh workspace before upload/mutation | OWNER §6/13, Cloudflare version contract | PASS | Exact version API URL tied to full UUID |
| C28 | Byte-compare every served asset with certified local bytes | REMOTE `smoke` asset loop | Current-source review verifies HTTP/length/SHA comparison for every served manifest entry; transaction mock proves a smoke failure triggers cleanup. The mock does not prove real remote bytes. | OWNER §6, QA preview | PASS | Per-asset HTTP/hash result; infrastructure-only metadata identified separately |
| C29 | Smoke all nine routes +true HTTP404 with noindex | REMOTE route smoke | Mock status/metadata/noindex failure cases; exact route accounting shared | OWNER §6, QA | PASS | Remote route matrix, true404 response |
| C30 | Remote Wealthsimple metadata/captions/media exact and VTT served correctly | REMOTE media/route smoke | Same metadata/media helpers; browser track and MIME checks | OWNER §6, QA, AUDIO | PASS | Remote caption `text/vtt`, parsed cues, native track loaded |
| C31 | No unexpected automatic network origins, page errors or broken assets | EXEC `verifyDist`; REMOTE `fetchPreview`, `browserSmoke` | Actual HTTP adapter test rejects external redirects without forwarding credentials; current-source review verifies browser origin/redirect/error interception. Browser observations remain live proof. | OWNER §6, QA privacy/performance | PASS | Browser network and error logs |
| C32 | Production routes unchanged | EXEC `assertBindingsUnchanged`; transaction/cleanup; REMOTE snapshot | UNIT route additions/edits/deletions fail; before/after comparisons | OWNER §6/7, LAUNCHER | PASS | Before/after exact route snapshots |
| C33 | Custom domains unchanged; neither apex nor www bound | EXEC mutation whitelist, equality; REMOTE snapshot | UNIT custom-domain drift and forbidden write endpoints | OWNER §6/7, production-domain supplement | PASS | Before/after exact domain snapshots |
| C34 | Active deployment/version IDs unchanged | EXEC snapshot equality, cleanup; REMOTE snapshot | UNIT deployment IDs/version IDs/percentages and deletion mutation tests | OWNER §6/7, RUNBOOK | PASS | Before/after active deployment identity |
| C35 | No DNS writes, production activation, analytics change or production fallback | EXEC mutation/CLI whitelists; all REMOTE effects | UNIT forbidden endpoints/commands; explicit exhaustive source review | OWNER §7, LAUNCHER absolute rules | PASS | API request log + unchanged bindings; no production operation |
| C36 | Cleanup exact unpublished inactive UUID only; preserve Access | EXEC `assertSafeCleanup`, transaction; REMOTE delete | UNIT full IDs/inactive proof; active/malformed/drifted snapshots rejected; nonce-bound upload ownership excludes foreign/concurrent versions | OWNER §6/7/9, RUNBOOK | PASS | Exact deletion result or named manual-cleanup record |
| C37 | Failures after upload retain exact evidence and attempt safe cleanup | EXEC transaction catch; REMOTE upload reconciliation | Transaction mocks exercise upload/smoke/cleanup failures; actual adapter pre-upload failure records NO_UPLOAD_ATTEMPTED without reconciliation/deletion; ambiguous ownership preserves manual evidence | OWNER §6/9, LAUNCHER phase 9 | PASS | Failure/cleanup evidence, never broad deletion |
| C38 | Durable packet: source/tree/dist/version/access/routes/current LKG/cleanup/one URL | EXEC evidence functions; REMOTE owner packet | Evidence shape/order tests and packet content assertions | OWNER §9/13, LAUNCHER closeout | PASS | Owner review packet + GitHub/Drive evidence |
| C39 | Readable canonical authority; derived artifacts reproducible; all executable modules pinned | Wrapper `verifyRunnerIntegrity`; V3 integrity manifest; direct readable-source execution | Eight source/dependency integrity tests and actual wrapper verify/help. No new compressed payload remains; a round-trip test is inapplicable | OWNER §3/8/10 | PASS | Exact committed source hashes and green run |
| C40 | V2 red bytes/history/old expected digest preserved without force-push | V3 provenance docs, original V2 files/workflow | Frozen historical payload bytes and prior digest tested; narrow successor provenance/diff review; exact commit ancestry remains part of C41 evidence | OWNER §1/8/11 | PASS | Successor commit/ancestry and unchanged forensic records |
| C41 | Full replacement CI green, review durable, then resume first incomplete phase | V3 workflow and authority addendum | Source CI run `34932894887` at `e9ca622818c621564aa4383e1d7e7a0a987eec66`: SUCCESS, 18 successful steps, zero skipped; final documentation tip and Drive authority still required | OWNER §10–12 | PASS (source CI); PENDING EXTERNAL (final acceptance) | Durable replacement authority with commit/run/source hashes |
| C42 | Stop for owner preview approval; no implicit post-preview production path | CLI command allowlist; transaction/owner packet | No production command supported; static mutation inventory; exact stop text | OWNER §7/13, LAUNCHER phase 10 | PASS | Owner packet ending at required status; later explicit GO only |

## Explicit dangerous-operation review

The current readable source has one process-spawn primitive, one guarded Wrangler upload call site, and three direct Cloudflare API mutation call sites. This inventory is checked with the TypeScript parser in `tests/preview-v3-static-safety.test.mjs`, not by searching comments for reassuring wording.

| Effect | Exact current call site | Guard and purpose | Review decision |
| --- | --- | --- | --- |
| Create an empty Worker metadata record, only if the named Worker does not exist | REMOTE `ensureAccess`: `POST /accounts/{account}/workers/workers` | EXEC `assertSafeMutation` requires exactly `{name:'parkerhamilton-ca',subdomain:{enabled:false,previews_enabled:true}}` and proved absence. No modules, assets, route, custom domain, or deployment field can be supplied. Before/after production snapshots must match. | Within preview scope; no RC bytes or production activation |
| Create the single narrowly scoped preview Access application if absent | REMOTE `ensureAccess`: `POST /accounts/{account}/access/apps` | Exact `preview_worker` destination for the discovered immutable Worker ID; exact owner-email allow policy plus matching service-token non-identity policy. No update/delete of existing policies or production-wide destination. | Within preview authorization; harmless guard must still prove real enforcement |
| Upload harmless guard or certified candidate version | REMOTE `upload`: pinned local Wrangler executable with `versions upload` | EXEC `assertUploadCommand` rejects production commands, duplicate flags, route/domain/secret/alias overrides and dynamic provisioning. Candidate directory is copied from certified packet and hash-compared; guard has only harmless fixed HTML/headers. | Permitted unpublished version creation; never activation |
| Delete one known unpublished version | REMOTE `deleteVersion`: `DELETE /accounts/{account}/workers/workers/{worker-id}/versions/{full-version-uuid}` | EXEC `assertSafeCleanup` requires full UUID, full Worker ID, recorded unpublished state, complete fresh snapshots unchanged from baseline, and no deployment referencing the version. Exact GET must subsequently return 404. Access remains. | Permitted exact cleanup only |
| Run infrastructure preview dry run | EXEC `preflight`: `npm run infra:preview-dry-run` | Current infra validator requires the script to be exactly `wrangler versions upload --dry-run`. CI runs this actual command. | Local validation only |
| Production deploy/activation/rollback; routes/custom domains/DNS/analytics writes; broad deletion | No permitted runner command or direct API call site | `assertSafeMutation` defaults to rejection; `assertUploadCommand` accepts only its limited upload grammar; AST tests inventory every direct mutation. Production workflow remains separate and uninvoked. | Prohibited before owner GO |

All Cloudflare API calls use the fixed API origin and reject redirects. Authenticated preview fetches follow only inspected redirects on the exact preview origin. Remote browser smoke gives the browser no global service-token headers, blocks service workers, intercepts requests before sending, uses `route.fetch` with `maxRedirects:0`, and rejects cross-origin redirects before fulfillment. This prevents a detected unexpected origin from receiving the Access service secret first. The underlying redirect behavior was checked against [Playwright's routing documentation](https://playwright.dev/docs/api/class-route).

The current production/LKG identity is an explicit separate snapshot of the deployment the Cloudflare API documents as currently active. Empty deployments are recorded as `NO_EXISTING_PRODUCTION_DEPLOYMENT`; no version is guessed. The owner packet distinguishes observed route/domain/deployment equality from the narrower statement that no DNS writes were performed.

## Review findings and resolution evidence

The independent review found issues in the new code and required corrections before approval:

1. Permissive cleanup-ID matching accepted 32-character version strings. It now requires a full UUID and complete deployment allocations; negative tests exercise rejection.
2. Duplicate Wrangler `--config` flags were accepted. They are now rejected; the executable command-policy test proves it.
3. Absolute Wealthsimple portfolio links escaped the original relative-link check. URL normalization now covers both forms; negative tests prove it.
4. Media scanning could select a caption/source outside the native player. Selection now occurs inside the same video element, and exact video/VTT review hashes bind provenance to the final track.
5. Caption evidence was a generic PASS statement. The gate now requires exact MP4/VTT hashes, media-capable transcription, completed verbatim/timing review, zero unresolved words, and durable evidence. The real caption content still requires a genuine transcription process later.
6. Design Day description linkage was unverified. The media gate now requires the existing equivalent visual description through `aria-describedby`, while using the existing closed audio sign-off.
7. Global browser service-token headers could escape through redirects. The browser now receives no global credentials, external origins are blocked, and authenticated request redirects are inspected before continuation.
8. An API outage after upload could leave no durable reconciliation context. Upload intent now records Worker ID and the exact before-version set before execution; uncertain outcomes persist explicit manual-cleanup evidence.
9. The whole deployment history was labeled rollback identity. The runner now records the API's explicit active deployment/version allocation and rejects unresolved identity.
10. Wrapper verification alone did not exercise its CLI import. The canonical runner now exports the wrapper entry point; the actual wrapper verification and help both pass, and CI exercises both.
11. A local packet check alone could create a second preview for the same RC from a fresh workspace. Remote version annotations now detect an existing current or predecessor-tagged candidate before Access mutation and upload; the adapter test proves refusal without mutation. Existing evidence must be restored, not replaced with a newly inferred baseline.
12. Failure before an upload attempt could incorrectly attribute a concurrently created version to this run. Durable per-attempt UUID and exact annotation now establish ownership; before/after set difference alone cannot authorize deletion. Three regression tests cover exact ownership, foreign/concurrent versions and actual pre-upload failure with no reconciliation or deletion.

These resolutions are assessed against current code and current tests. The old runner was not used as proof that any row passed.

## Reviewed source locations and integrity

These locations refer to the source bytes reviewed below; function names remain the authoritative mapping if a documentation-only commit changes surrounding files.

| Source | Reviewed function entry lines |
| --- | --- |
| EXEC | `validateRouteAccounting`:44; `validateHtmlMetadata`:49; `validateSitemap`:85; `parseVtt`:94; `validateHumanGates`:119; `validateMediaGate`:128; `assertFrozenAssets`:163; `assertNoindexHeader`:167; `assertImmutablePreviewUrl`:172; `assertAnonymousDenied`:180; `assertBindingsUnchanged`:194; `assertSafeCleanup`:203; `assertSafeMutation`:213; `assertAccessPolicies`:238; `assertUploadCommand`:254; `findExistingCandidateVersions`:267; `findOwnedUploadVersions`:281; `runPreviewTransaction`:289; `makeManifest`:377; `detached`:383; `verifyDist`:395; `measuredDurations`:435; `preflight`:448; `toolingIdentity`:505; `assertRouteResponse`:511; `parseArgs`:516; `main`:527 |
| REMOTE | `createCloudflareClient`:24; `api`:32; `readDeployments`:64; `snapshot`:75; `ensureAccess`:90; `withCandidate`:134; `rejectExistingCandidate`:149; `upload`:156; `fetchPreview`:230; `proveBoundary`:244; `deleteVersion`:256; `browserSmoke`:269; `smoke`:333; `writeOwnerPacket`:370 |
| Wrapper / dist validator | `verifyRunnerIntegrity`:10 in `scripts/final-rc-preview.mjs`; `validateReleaseDist`:21 in `scripts/validate-release-dist.mjs` |

| Readable executable authority | Reviewed and pinned SHA-256 |
| --- | --- |
| `scripts/final-rc-preview-exec.mjs` | `6c03590af87d16e11d1cbdce96497a8f30134bc14ee87a72c80aeef8733184c0` |
| `scripts/final-rc-preview-remote.mjs` | `38007e883cd1fc11294099393bd84856756c9c660043ed02091be00f24017eb2` |
| `scripts/validate-release-dist.mjs` | `e412bca399668d2e4106e5b8fea444b3eee7644d7c7c557cb42b46f257a068e7` |

`release/preview-runner-v3-integrity.json` pins all three modules. The wrapper executes readable source directly: there are no V3 payload chunks or derived gzip artifacts. Historical V2 chunks and intended digest remain preserved and explicitly superseded, so no decompression/round-trip step is silently skipped because of the old failure.

## Validation and limitations

The independent reviewer executed the final combined suite with Node `v24.19.0`: **75 PASS, 0 FAIL, 0 SKIP**.

```text
node --test tests/final-rc-preview-v3.test.mjs tests/preview-v3-integrity.test.mjs tests/release-dist-v3.test.mjs tests/preview-v3-static-safety.test.mjs
```

- `tests/final-rc-preview-v3.test.mjs`: **46 PASS**. Includes route/metadata/media/human gates, frozen assets, certificate/order/cleanup transaction mocks, actual HTTP adapter boundary/snapshot/redirect tests, existing-candidate refusal, and nonce ownership/concurrent-upload regression tests.
- `tests/preview-v3-integrity.test.mjs`: **8 PASS**. All three readable executable dependency hashes, changed source, omitted/injected dependency, symlink rejection and retained V2 provenance.
- `tests/release-dist-v3.test.mjs`: **17 PASS**. Explicitly synthetic 8+1+404 fixture with real frozen public workbook bytes, and negative route/metadata/sitemap/hash/leak cases.
- `tests/preview-v3-static-safety.test.mjs`: **4 PASS**. Exact API mutation call sites, process/CLI safety, dispatch-ref handling and original V2 payload bytes.
- Actual `node scripts/final-rc-preview.mjs --verify-only`: **PASS** for the exact three hashes above.
- Actual `node scripts/final-rc-preview.mjs help`: **PASS**; this exercises the canonical module entry point, not merely wrapper syntax.
- Current Cloudflare infrastructure validator: **PASS**. The obsolete main-only/direct-upload assertion was deliberately superseded by the reviewed wrapper, explicit preview authorization, permitted tooling/integration refs and no production command assertion. Static assets-only config and pinned Wrangler requirements remain enforced.
- Root validation evidence also records successful frozen-base substrate build and actual Wrangler preview dry run. Those are tooling substrate checks, not final-candidate site certification.

**Independent source capability review: PASS. No unresolved source-code findings remain for the exact hashes above.** The reviewed workflow `.github/workflows/final-release-tooling-v3-validation.yml` requires complete syntax/load/self-check/infra/build/release-dist/dry-run and all deterministic tests without a packaging skip, including operational wrapper help.

**Complete source CI evidence (C41):** GitHub Actions run `34932894887`, job `104264648759`, on successor commit `e9ca622818c621564aa4383e1d7e7a0a987eec66` finished **SUCCESS**. Root inspected all 18 job steps: all success, zero skipped, including syntax/pins, all 75 tests, QA harness self-check, infrastructure validation, release-dist CLI/build, Wrangler dry run, audit and evidence. The source hashes in this review are unchanged.

**Final external acceptance remains open:** a documentation-only successor carrying this completed review must receive its own complete green CI run, then the final Drive authority must record that exact final commit/run and these exact source hashes. That durable authority closes the final acceptance gate. This document does not claim that the final-tip run or Drive write has occurred before it does.

PREP syntax/load validation, synthetic fixtures and deterministic mocks are tooling evidence only. No review or test described here uploaded an RC or performed a Cloudflare mutation. They do not certify final integrated site QA, real caption wording/timing, remote served bytes, live Access enforcement, account state or production. Every live-proof column remains mandatory when the original launcher resumes. Production was untouched by this review; no route, design, copy, engine, workbook, research, approved media or site authority was edited.
