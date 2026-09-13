# ParkerHamilton.ca — Private Immutable Final-RC Preview Automation

**Purpose:** create one authenticated, versioned, immutable Cloudflare preview of one exact final release-candidate SHA without deploying it to production, changing DNS, attaching a production route/custom domain, altering analytics, or changing route source.

**Infrastructure authority:** `prep/cloudflare-workers-release-infra-v1` @ `9034eae2e072eefb14c33fee94c5b20dc94579ed`.

This package is fail-closed. A failed gate stops before upload, or, if the RC version has already been uploaded, deletes that exact unpublished version. It never calls `wrangler deploy`, `wrangler versions deploy`, a Worker route/domain write API, or a DNS API.

## What must already be true about the final RC

The final RC must be frozen as one exact Git commit. The commit must descend from the immutable green baseline `5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e`. Direct ancestry from the reviewed Cloudflare infrastructure SHA `9034eae2e072eefb14c33fee94c5b20dc94579ed` is recorded when present; if integration carried that change set by cherry-pick/rebuild, the existing strict infrastructure validator and pinned Wrangler/config contracts must prove semantic compatibility instead.

The RC must also contain `release/final-rc-human-gates.json`. Copy `release/final-rc-human-gates.example.json`, record the Design Day full-audio human-review disposition and durable evidence reference, commit it, and then freeze the RC SHA. This is deliberately inside the RC so Parker does not have to supply another runtime flag later.

## Required local/runtime prerequisites

- Git clone of `PHamilton8/parkerhamilton-ca` with the RC ref fetchable.
- Node **24.19.0** exactly.
- npm and Git.
- Enough disk/time for a clean install, clean Astro build, and Chromium/Firefox/WebKit Playwright release QA.
- No Cloudflare credentials are needed for preflight.

Evidence is written under `.release-preview/<RC_SHA>/` and is ignored by Git.

## Cloudflare credentials for the authorized step

Set these only in the operator environment or secret store; never commit them:

```bash
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_ACCOUNT_ID='...'
export CF_ACCESS_CLIENT_ID='...'
export CF_ACCESS_CLIENT_SECRET='...'
```

The API token should be deliberately narrow: it needs Workers Scripts read/write for version upload/read/delete and read-only deployment/domain inspection, Access Apps and Policies write for the preview-only Access guard, and Access Service Tokens read so the supplied service-token client ID can be resolved. It does **not** need DNS write, Worker custom-domain write, zone-route write, analytics, KV, D1, R2, or other product permissions.

`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` are an existing Cloudflare Access service token used only for automated smoke testing of the private preview. The script never prints the secret.

For interactive Parker review, the script uses `PREVIEW_REVIEW_EMAIL` if set; otherwise it attempts to derive one unique email from the built site's `mailto:` contact link. If neither is unambiguous, it stops before upload and asks for `PREVIEW_REVIEW_EMAIL`. Cloudflare Access must already have at least one identity provider / One-time PIN method configured.

## The four operator commands

### 1. Preflight — local only

```bash
node scripts/final-rc-preview.mjs preflight --rc <FINAL_RC_SHA_OR_REF>
```

This resolves and records the full SHA and tree, verifies required ancestry, creates a detached clean worktree, runs a clean `npm ci`, the existing infra validator, type/check gate, unit/regression suites, a clean build, public-safety scan, contrast QA, high-severity npm audit, the targeted final-RC release QA, the full three-browser Playwright suite, release-dist validator, and Wrangler preview dry run. It then independently checks the exact route/SEO/public-artifact contracts and copies the exact `dist` bytes into the immutable evidence packet with a SHA-256 manifest.

Preflight requires exactly these public HTML routes and no others:

- `/`
- `/work/compound-growth`
- `/work/design-day`
- `/work/askwill`
- `/work/grocery-automation`
- `/work/reporting-workflow`
- `/work/smith-manoeuvre`
- `/work/coast-fi`

It also requires a true 404, exact production-apex canonicals/sitemap, production-safe route meta, the host-scoped `workers.dev` `X-Robots-Tag` rule, the two approved workbook hashes, no private/review/source-map/archive/office artifacts beyond the approved XLSX files, and no automatic third-party resource origins in built markup/styles.

### 2. Authorized private preview — only command allowed to create the RC preview

```bash
node scripts/final-rc-preview.mjs preview --rc <FINAL_RC_SHA_OR_REF> --authorize CREATE_PRIVATE_FINAL_RC_PREVIEW
```

The command reuses a valid preflight packet or reruns preflight. **If any required credential is absent, it completes all local/dry-run work and exits successfully without any Cloudflare mutation.**

If credentials are present, the exact authorization phrase is mandatory. The command then:

1. snapshots the Worker's current routes, custom domains, and active deployments;
2. if the Worker does not yet exist, creates only a non-routable bootstrap version with `workers_dev=false` and `preview_urls=false` — no preview URL can exist yet;
3. resolves the Worker immutable ID and creates/reuses a `preview_worker` Cloudflare Access application, with an exact-email owner policy and service-token smoke policy;
4. uploads a harmless **Access guard** version containing no RC content, proves that anonymous access is challenged/denied and authenticated access receives the workers.dev noindex header, then deletes that guard version; this proves the Access boundary is live before any routable RC bytes exist;
5. only after the guard passes, uploads the exact preflight `dist` bytes with `wrangler versions upload` using the reviewed assets-only config;
6. identifies exactly one new Worker version and obtains its unique versioned `workers.dev` URL;
7. proves that routes, custom domains, and active deployment IDs are byte-for-byte/logically unchanged and that the new version is not in an active deployment;
8. proves anonymous access does not return content, authenticated access succeeds, and every preview response carries `X-Robots-Tag: noindex, nofollow, noarchive`;
9. byte-compares every remotely served asset against the local build manifest, checks the eight routes + true 404, and runs a real Chromium network-origin smoke across all routes;
10. writes `preview.json`, post-upload smoke evidence, and `OWNER-REVIEW-LINK-PACKET.md` containing the preview URL, route links, RC/build/version identifiers, production-binding proof, and cleanup/rollback references.

The source HTML is intentionally **not** given a preview-only `meta noindex`, because that same RC must remain production-indexable if later deployed. Preview noindex is response-scoped to the versioned `workers.dev` host. The script verifies that combination explicitly.

If any post-upload proof fails, it tries to delete the exact new unpublished version immediately. If cleanup itself fails, it records `MANUAL-CLEANUP-REQUIRED.txt` with the exact version and Worker IDs and exits non-zero.

### 3. Repeat smoke test

```bash
node scripts/final-rc-preview.mjs smoke --rc <FINAL_RC_SHA_OR_REF>
```

This revalidates Access privacy/noindex, all eight routes, true 404 behavior, all remote asset hashes, runtime automatic origins, and the unchanged route/domain/deployment snapshots from the preview packet.

### 4. Cleanup — deletes only the exact unpublished RC preview version

```bash
node scripts/final-rc-preview.mjs cleanup --rc <FINAL_RC_SHA_OR_REF> --authorize DELETE_PRIVATE_FINAL_RC_PREVIEW
```

Cleanup reads the recorded `preview.json`, rechecks production routes/domains, and **refuses to delete** if that version is referenced by any active deployment. It then deletes only the recorded preview version through Cloudflare's Worker-version API and verifies the URL no longer serves content.

The preview-only Access application is intentionally retained. Removing it during routine cleanup could expose some other preview version. Deleting the Access guard is therefore a separate manual security decision, not part of this workflow.

## Fail-closed release stops

The workflow stops on any failed existing RC test/QA gate; final-RC human-gate absence; wrong RC lineage; non-clean build; route set other than the exact eight; unexpected private/review artifact; workbook identity drift; source/manifest mismatch; preview that is anonymously accessible or lacks response-level noindex; unexpected automatic network origin; remote asset byte mismatch; custom-domain or Worker-route change; active-deployment change; or any evidence that the new version has become a production deployment.

A source/config change after preflight invalidates the packet because the manifest is tied to the exact SHA. Run preflight again on the new frozen SHA.

## Cloudflare identity recorded in the packet

The owner packet records:

- exact RC commit and tree;
- exact dist manifest SHA-256;
- Worker name and immutable Worker ID;
- exact preview version ID and version number;
- versioned preview URL;
- pre-existing deployment IDs and the fact that **no new deployment ID was created**;
- Access application and policy IDs (never secrets);
- smoke/indexing/origin/remote-manifest results;
- exact cleanup command;
- exact API delete endpoint for this version;
- the production rollback command template from the rollback runbook, clearly marked as **not** a preview-cleanup command.

## Production rollback boundary

Preview cleanup is version deletion, not production rollback. If a future production incident occurs, use the separately verified last-known-good Worker version from the release record:

```bash
npx wrangler rollback <EXACT_LAST_KNOWN_GOOD_VERSION_ID> --name parkerhamilton-ca --message "INCIDENT <YYYYMMDD-HHMM>: rollback to LKG <GIT_SHA>"
```

Never infer the rollback target and never change DNS as a first reaction to an application-version problem.

## Deliberately out of scope

This workflow does not merge branches, deploy a production version, attach `parkerhamilton.ca` or `www`, modify DNS/TLS, alter analytics, edit source routes, create KV/D1/R2/service bindings, or make an owner approval decision. Parker's review of the authenticated preview remains a separate explicit release gate.
