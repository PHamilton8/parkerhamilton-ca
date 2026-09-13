# ParkerHamilton.ca Final Release-Candidate Assembler v1

This tool builds a release candidate from an explicit, owner-authorized manifest. It is deliberately fail-closed. It does not decide what Parker approved; it only assembles commits Parker explicitly lists and gates conditional route work on durable owner-authority IDs.

## Non-negotiable base and default

- Repository: `PHamilton8/parkerhamilton-ca`
- Authorized base / rollback point: `5bd7356fca9ff506d7d6ab3bb1a24cda3dc1902e`
- Default mode: `DRY-RUN`
- DRY-RUN uses a detached temporary worktree and never pushes.
- EXECUTE is accepted only when the exact integration branch appears both in the manifest and on the CLI. The branch must start with `integration/`, must not already exist locally or on origin, and must not be `main`, `master`, production, the immutable baseline branch, or the assembler branch.
- EXECUTE pushes only the validated integration branch. It never merges `main`, creates a tag/release, deploys, or changes production.

## Why the current lane order starts with Homepage

The earlier readiness package separated Homepage locked deltas from still-conditional Homepage repairs, with Reporting between those waves. Parker subsequently issued a durable final approval for the complete integrated Homepage V3, converting the remaining Homepage Current-state items into one approved Shared/Homepage source package. The current implementation branch is a three-commit descendant of the immutable base and contains the approved shared Homepage state as one lineage. v1 therefore treats that complete Homepage lineage as the first Shared/Homepage lane, then applies route-local Reporting, then any newly authorized route lanes, final QA, and release infrastructure. Reporting is route-local, so this preserves the collision principle: shared work first, route-local work second, QA after source, infrastructure last.

## Manifest contract

Every lane key is mandatory. Use `null` to say “intentionally skip”; omission is an error. This prevents an absent field from being mistaken for owner approval.

A lane can be expressed in three forms:

```json
"homepage": "<tip-sha>"
```

A string is a **tip**. If it descends from the authorized base, the assembler expands `base..tip` into its exact ordered commit lineage.

```json
"homepage": ["<commit-1>", "<commit-2>"]
```

An array is an explicit ordered commit list.

```json
"homepage": {
  "commits": ["<commit-1>", "<commit-2>"],
  "authorityIds": ["<durable-drive-owner-authority-id>"],
  "allowNonDescendant": false
}
```

The object form is for explicit control. `allowNonDescendant` is false by default and should remain false. A non-descendant patch is accepted only when explicitly enabled, owner authority is supplied, its file footprint is legal for the lane, and it cherry-picks cleanly in the isolated candidate worktree.

Conditional route lanes (`designDay`, `askWill`, `grocery`, `coast`, `compound`, `smith`) are rejected unless their manifest entry includes at least one durable owner-authority ID. The assembler never infers approval from a preview, specialist recommendation, branch name, PR mergeability, or commit message.

## Fail-closed checks

Before applying anything, the assembler:

1. verifies the exact immutable base;
2. verifies each supplied SHA exists (it may fetch that exact object from `origin`, but does not push);
3. rejects merge commits;
4. rejects commits already subsumed by the base;
5. expands tip entries deterministically from the base;
6. rejects duplicate SHAs and duplicate stable patch IDs;
7. rejects the same path being changed by more than one lane;
8. validates every commit against the lane allowlist and global frozen-path register;
9. rejects missing owner authority for conditional lanes;
10. rejects out-of-order or hidden shared/model/test/release-infra changes by ownership.

The frozen boundaries include the Cathedral interaction library, Coast FI engine/workbook, Compound canonical evidence/engine, Smith engine/workbook, engine fixtures, and `scripts/public-safety-scan.mjs`. A route lane cannot alter shared Homepage source, central tests, package/release files, another route, or frozen model assets merely because Git could merge it.

## Conflict behavior

Each source commit is cherry-picked with its original committer identity/date so identical source lineages remain reproducible where the parent is unchanged. If Git reports any conflict, the assembler immediately writes `conflict-diagnostics.json`, including unmerged paths, index stages, combined diffs, Git status, and cherry-pick stderr. It then aborts the cherry-pick and fails the run.

There is no `ours`, `theirs`, automatic merge-driver resolution, or semantic guessing.

## Test waves

The assembler installs the baseline lockfile with `npm ci`, then runs tests after each logical lane:

- ordinary Homepage/route source: `npm run check`, `npm run test:source`, `npm run build`;
- Coast/Compound/Smith: the above plus `npm run test:engines`;
- QA harness: source checks plus `npm test` and build;
- release infrastructure: refresh `npm ci`, then check, source tests, full tests, public-safety, build, and available infra validators.

The final RC gate always runs on the exact assembled candidate:

```text
npm ci
npm run check
npm test
npm run public-safety
npm run qa:contrast
npm run build
npm run infra:validate          # if present
npm run infra:validate-dist     # if present
npm audit --audit-level=high
npm run test:browser
```

Any non-zero exit code fails the RC and prevents an EXECUTE push.

## Evidence generated

Outputs are required to live outside the repository checkout. The run writes:

- `manifest.normalized-input.json`
- `preflight-lane-plan.json`
- `changed-files-after-<lane>.json`
- `conflict-diagnostics.json` on conflict
- `changed-file-manifest.json`
- `authority-to-commit-manifest.json`
- `test-summary.json`
- `build-artifact-manifest.json`
- `final-rc-summary.json`
- `FINAL-RC-CLOSEOUT.md`
- `logs/` with exact command output

The successful closeout records final candidate SHA, tree SHA, deterministic changed-file ownership, authority-to-source/assembled commit mapping, build artifact SHA-256, all test results, pushed integration branch (if any), and rollback point.

The build artifact hash is a deterministic SHA-256 over the sorted `dist/` file paths and each file’s SHA-256.

## Current approved demonstration manifest

`scripts/final-rc/manifest.current-approved-demo.json` contains only the presently explicit Homepage and Reporting approvals:

- Homepage tip `778724599ef18de15b59a19bdfa95fffe1b424de`, which expands to:
  - `db81c7a353b124f24b91b549419d3590a6f1c9bc`
  - `e76c9b225051bb0dc1fd9803bc3a419b48532959`
  - `778724599ef18de15b59a19bdfa95fffe1b424de`
- Homepage authority: `1K-_ERW4hKuA0QvncX7nvT0S9hjQ-r2G84UM_JjBTt28`
- Reporting tip `40bdfa5cd20d8feb569f2d500d678a3372d8aced`
- Reporting authority: `1JVPD0dbrhV6DVIsZ54_BGQyZKps5QUKt`
- all unresolved case-study route lanes: `null`
- QA harness and release infrastructure: `null` for this narrow demonstration only

Run it from a clean repository checkout:

```bash
node scripts/final-rc/assemble.mjs \
  --manifest scripts/final-rc/manifest.current-approved-demo.json \
  --mode DRY-RUN \
  --output-dir ../parkerhamilton-final-rc-output/current-approved-demo
```

DRY-RUN does the real local assembly and test sequence; it differs from EXECUTE only by never creating/pushing an integration branch.

## Expected future manifest

Copy `scripts/final-rc/manifest.template.json` to an operator-owned manifest **outside the repository checkout**, for example `../parkerhamilton-final-rc-manifest.json`, and replace every placeholder only after owner decisions are durable. `null` is a valid explicit choice for a route that remains excluded from the RC. Do not “fill in” a conditional lane from a specialist recommendation.

`qaHarness` and `releaseInfra` can be supplied as exact tips. The currently known prepared inputs are `e62fc9002080cf876b5365bfa460b4e094f3f8ca` and `9034eae2e072eefb14c33fee94c5b20dc94579ed`, respectively, but the operator should use the final validated tips at assembly time rather than assume those historical values remain current.

## Exact final operator command

After all owner decisions are complete and `../parkerhamilton-final-rc-manifest.json` contains the final explicit SHAs and durable authority IDs, Parker can run exactly:

```bash
node scripts/final-rc/assemble.mjs --manifest ../parkerhamilton-final-rc-manifest.json --mode EXECUTE --integration-branch integration/final-rc-v1 --output-dir ../parkerhamilton-final-rc-output
```

The manifest must also set `execution.authorizedIntegrationBranch` to exactly `integration/final-rc-v1`. If it does not, EXECUTE fails before assembly.
