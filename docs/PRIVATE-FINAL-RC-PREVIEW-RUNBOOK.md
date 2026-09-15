# ParkerHamilton.ca — Private Immutable Final-RC Preview Automation

**Purpose:** create one authenticated, versioned, immutable Cloudflare preview of one exact final release-candidate SHA without deploying it to production, changing DNS, attaching a production route/custom domain, altering analytics, or changing visitor-facing source.

The workflow remains fail-closed. A failed gate stops before upload or deletes the exact unpublished RC version if upload already occurred. It never performs a production deployment, custom-domain bind, Worker-route write, or DNS write.

## Final route accounting

The only accepted final public HTML accounting is:

- **8 indexable portfolio routes:** `/`, `/work/design-day`, `/work/reporting-workflow`, `/work/grocery-automation`, `/work/askwill`, `/work/coast-fi`, `/work/compound-growth`, `/work/smith-manoeuvre`.
- **1 noindex/noarchive auxiliary application route:** `/wealthsimple-2026`.
- a true noindex 404 document.

The Wealthsimple route must remain excluded from sitemap, homepage/work/project navigation, and other portfolio discovery. Its visible H1 must be `Wealthsimple 2027 - Parker Hamilton` even though its route remains `/wealthsimple-2026`.

## Final human/accessibility gates

`release/final-rc-human-gates.json` is required in the frozen RC.

- **Design Day:** the owner audio gate is CLOSED by durable sign-off `1kYgls9So9wrlyQXcfOv2CuFtC086dczc9SNvbIl2Kd0`. Do not ask Parker to listen again. The exact replacement MP4 is 8.475 seconds; retime the already-approved caption wording/visual description automatically and verify that no VTT cue exceeds the media duration.
- **Wealthsimple:** `FINAL-RC ACCESSIBILITY GATE — VERBATIM CAPTION TRACK REQUIRED`. The exact final ~101.652-second MP4 contains speech and must have a synchronized, verbatim caption track before preview. Use a media-capable transcription workflow; preserve Parker's wording. Ask Parker only to resolve genuinely uncertain words, if any remain after high-confidence transcription/review.

## Required runtime

- exact frozen RC SHA descending from green base `5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e`;
- Node 24.19.0;
- Git/npm and enough disk/time for clean install/build and full Playwright QA;
- Cloudflare credentials only for the explicitly authorized preview step.

Evidence is written under `.release-preview/<RC_SHA>/` and tied cryptographically to that SHA and dist manifest.

## Commands

### Local-only preflight

```bash
node scripts/final-rc-preview.mjs preflight --rc <FINAL_RC_SHA_OR_REF>
```

Preflight runs clean install/build, current final-RC QA, public-safety/privacy checks, accessibility/browser checks, asset/workbook/media identity checks, release-dist validation, and an infrastructure dry run. It independently verifies the final 8+1 route/indexation contract, exact production canonicals, sitemap containing exactly the 8 portfolio routes, true 404, approved workbook/media bytes, and absence of private Drive/review/local artifacts.

### Authorized private preview

```bash
node scripts/final-rc-preview.mjs preview --rc <FINAL_RC_SHA_OR_REF> --authorize CREATE_PRIVATE_FINAL_RC_PREVIEW
```

Required secrets remain runtime-only. If authorization/credentials are unavailable, do not mutate Cloudflare.

The authorized command must:

1. snapshot production routes, custom domains, and active deployment IDs;
2. prove the Access boundary with a harmless guard before routable RC bytes exist;
3. upload the exact certified `dist` as one unpublished version;
4. identify one immutable versioned `workers.dev` URL;
5. prove production bindings/deployments are unchanged;
6. prove anonymous access is denied and authenticated responses carry `X-Robots-Tag: noindex, nofollow, noarchive`;
7. byte-compare remotely served assets against the certified local manifest;
8. smoke all 9 HTML routes plus 404, including Wealthsimple noindex/noarchive/H1/captions;
9. write the version/deployment IDs, route checks, build hashes, cleanup commands, and one owner-review URL.

After successful preview creation, the future one-shot execution must stop with exact status:

`AWAITING PARKER FINAL INTEGRATED PREVIEW APPROVAL`

No timeout or inferred approval is permitted. Production launch requires Parker's explicit `GO` or an unambiguous equivalent.

### Repeat smoke

```bash
node scripts/final-rc-preview.mjs smoke --rc <FINAL_RC_SHA_OR_REF>
```

Revalidates privacy/noindex, all 8 indexable routes, the Wealthsimple noindex route, true 404, remote asset hashes, allowed network origins, and unchanged production bindings/deployments.

### Cleanup

```bash
node scripts/final-rc-preview.mjs cleanup --rc <FINAL_RC_SHA_OR_REF> --authorize DELETE_PRIVATE_FINAL_RC_PREVIEW
```

Deletes only the exact unpublished preview version after proving it is not referenced by an active deployment. Preview Access protection is retained by default.

## Indexation boundary

The source RC must stay production-correct: portfolio routes indexable, Wealthsimple noindex/noarchive. Preview-wide noindex is imposed at the versioned preview-host response layer, not by converting production-indexable portfolio source pages to `noindex`.

## Production boundary

This preview workflow does **not** merge, create a production tag/release, deploy production, bind a domain, change DNS/TLS, alter analytics, or make an owner decision. If any post-upload proof fails, delete the exact unpublished version when safe; if cleanup fails, persist the exact Worker/version IDs for manual cleanup and stop.

After Parker's later `GO`, production must use the **same certified candidate reviewed in preview**. Do not rebuild from different source after approval.
