# Final private-preview runner V3 — deliberate source supersession

## Owner authorization and limits

On September 15, 2026, Parker explicitly authorized a new durable, reviewed readable replacement preview runner because the intended V2 source is unrecoverable. This authorization is limited to release/private-preview tooling. It does not change route design, copy, data, engines, workbooks, media, SEO, or the owner preview/GO gate. Production configuration remains untouched before GO.

## Preserved V2 forensic record

- Red branch: `prep/final-release-tooling-v2`
- Exact red commit: `b5c8148fa63d20d75e2782ad74374436fd937893`
- Failed validation: https://github.com/PHamilton8/parkerhamilton-ca/actions/runs/34926338094
- Historical intended decoded SHA-256: `46b2812a7d17dd50f2f4d0aedf748966df38ddf9570c11528ed8c3bc2d808e30`
- Payload A: 12,474 bytes; SHA-256 `d567a6a5c420aebd33e8ffabb7576a9732596c6aca61b3c8c647b6d0c333d6ef`
- Payload B: 6,240 bytes; SHA-256 `89b91fc14faecb75f319945bc72dd68479f521956261c3fdb54a815910c5bcb3`
- Strict decompression fails with `Z_BUF_ERROR: unexpected end of file`; recoverable prefix is approximately 48,320 bytes and truncates at `page.on('`.
- Recoverable predecessor SHA-256: `fd9f1dcf3961c8968d9b71c46ddaea69641ea0e3d60b7c7b77951511ade25929`.
- Appending its obsolete tail produced `40e809f0cd8912d511486def862028fe5b07e2c143af42406dbe3c590d062dfc`, which does not recover the intended source and preserves stale behavior. That reconstruction is rejected.

Durable reports remain in the final handoff folder: `FINAL-EXECUTION-PHASE-1-INTEGRITY-BLOCKER-2026-09-15.md` (Drive `1pZIkkOuZjGuMvSPL-GKgg0Yv8bwk8ZkV`) and `FINAL-EXECUTION-PAYLOAD-HISTORY-INVESTIGATION-2026-09-15.md` (Drive `1aZSLsRIFo_EeqI7qrzRqklcy_scPRnTK`). Neither report nor V2 history is overwritten.

## Successor and acceptance

The successor branch is `prep/final-release-tooling-v3-reviewed-replacement`, based directly on the red V2 commit. Readable canonical source and its executable dependencies are pinned by `release/preview-runner-v3-integrity.json`. No compressed/base64 payload is needed for V3; the readable source is the executable authority. The historical V2 expected digest is provenance only.

`docs/FINAL-PREVIEW-RUNNER-V3-CAPABILITY-REVIEW.md` maps the current contracts to source functions and deterministic tests. The `final-release-tooling-v3-validation` workflow validates syntax, actual wrapper loading, exact hashes, complete deterministic tests, current QA harness load, infrastructure safeguards, release-dist CLI behavior, build/dry run and high-severity audit. No skipped packaging checks count as green.

The replacement becomes execution authority only after one exact complete green CI run and a durable `FINAL-PREVIEW-RUNNER-V3-REPLACEMENT-AUTHORITY.md` handoff record that binds that run and commit. Route/site implementation may then resume from the first incomplete original launcher phase. A later final candidate still requires full integrated QA and one Access-protected immutable preview before Parker's explicit GO.
