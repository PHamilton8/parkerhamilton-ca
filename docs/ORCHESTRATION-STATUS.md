# Overnight production status

Authority: Drive `ParkerHamilton.ca / Prompts / Next Parallel Workflows / 08-overnight-production-orchestrator.md`, read in full on 2026-09-10.

No merges, deployments, DNS changes, infrastructure changes, or repository visibility changes are authorized for this run.

Current main: `ab35cba4647afec3ebf94365865fac49d34e049e` (verified live).

FOUNDATION_CANDIDATE_SHA: `acfeba769bea3d47672c0f200b6b85bfd40cde4f`.

Foundation gate PASS: local gates, independent Sol review, and GitHub quality/browser jobs all pass. [Draft PR #1](https://github.com/PHamilton8/parkerhamilton-ca/pull/1) is open and unmerged. [CI evidence](https://github.com/PHamilton8/parkerhamilton-ca/actions/runs/34444348179).

| Phase/task | Branch | Status | Head SHA | PR | Tests run | Blockers | Next action |
|---|---|---|---|---|---|---|---|
| A: Foundation recovery | chore/foundation-recovery | COMPLETE / unmerged | acfeba769bea3d47672c0f200b6b85bfd40cde4f | [#1](https://github.com/PHamilton8/parkerhamilton-ca/pull/1) | ci/check/test/build/browser/safety/audit/contrast PASS | None | Preserve candidate |
| Foundation release gate | chore/foundation-recovery | PASS | acfeba769bea3d47672c0f200b6b85bfd40cde4f | #1 | Independent review PASS; GitHub quality + browser PASS | Hero intentionally deferred | Begin isolated slices |
| B: Canonical backlog | chore/foundation-recovery | COMPLETE | Same candidate | #1 | Seven approved handoffs read | None | Use authorities below |
| C1: Reporting Workflow Automation | feat/reporting-workflow | COMPLETE / draft unmerged | a4b60e6722ea04eb4724d424afea041741591418 | [#2](https://github.com/PHamilton8/parkerhamilton-ca/pull/2) | npm ci/check/test (9/9)/build/browser (5/5)/safety PASS; independent review PASS; CI PASS (quality + browser, run 34445631143) | None | Start Grocery Automation from the foundation candidate |
| C2: Grocery Automation | feat/grocery-automation | COMPLETE / draft unmerged | 672818569d66764cc5892aa55fc32b8670294716 | [#3](https://github.com/PHamilton8/parkerhamilton-ca/pull/3) | npm ci/check/test (9/9)/build/browser (5/5)/safety PASS; independent review PASS; CI pending | None | Start Design Day from the foundation candidate |
| C3: Design Day | feat/design-day | Not started | — | — | None | Earlier slice must finish | Follow priority order |
| C4: AskWill | feat/askwill | Not started | — | — | None | Earlier slice must finish | Follow priority order |
| C5: Coast FI | feat/coast-fi | Not started | — | — | None | Earlier slice must finish | Follow priority order |
| C6: Thesis / Compound Growth | feat/compound-growth | Not started | — | — | None | Earlier slice must finish | Follow priority order |
| C7: Smith Manoeuvre | feat/smith-manoeuvre | Not started | — | — | None | Earlier slice must finish | Follow priority order |


Feature branches must start at the recorded foundation candidate, remain independent, and target `chore/foundation-recovery` as draft PRs.

## Canonical production backlog

All seven approved handoffs have been read (Reporting and Grocery use package README/planning equivalents). Historical instructions about a private initial repository are superseded by the overnight authority: the existing public visibility stays unchanged.

| Priority / task | Canonical Drive folder | Authoritative copy / evidence | Approved assets / engine | Privacy / claims | Route | Complexity | Required tests |
|---|---|---|---|---|---|---|---|
| 1 Reporting Workflow Automation | Case Studies / 05 Reporting Workflow; folder `1Bo4gsr6YH01hsLr8Edz6gV-KkdAvZzIS` | Package README, public copy bank, evidence, workflow before/after, claims audit, public framing | Synthetic dashboard sequence and demo from approved package | Generic internal reporting; owner-reported 45+ min → under 10 min; human review and submission; no private workbook | `/work/reporting-workflow` | Low | Source claims, synthetic-only asset scan, keyboard/focus, 1440/820/390, build |
| 2 Grocery Automation | Case Studies / 04 Grocery Automation; folder `1Di-6L0nnC6OIpmqqt-FbQ-hFLYiPUO5j` | GROCERY-COPY-BANK, CASE-STUDY-ARCHITECTURE, ARCHITECTURE, AUTHORSHIP-WORDING, CLAIMS-AUDIT, PUBLIC-SAFETY | Public code and sample flyer/menu JSON; approved sample output | No development-history document or credential; label sample output; bounded AI-assisted authorship | `/work/grocery-automation` | Low–medium | Route content, samples, code safety, keyboard, responsive QA, build |
| 3 Design Day | Case Studies / 02 Design Day; planning `1vAiSNfxWLu4yaf4alw03E7zWR6rGvXRM` | WORKSTREAM-CLOSEOUT, COPY-BANK, OWNER-ADDENDUM, EVIDENCE, ACCESSIBILITY-CLAIMS | Final circular prototype hero; working demo with actual audio; process sequence | Open 1 winner, uOttawa Design Day Winter 2023; testing did not drive redesign or validate accessibility; museum harp is inspiration | `/work/design-day` | Medium | Media/controls, correct photo identity, claims, responsive and keyboard QA, build |
| 4 AskWill | Case Studies / 03 AskWill; planning `16ouRWv-6pbd5TkcET2abUokY_Zg1JLoA` | WORKSTREAM-CLOSEOUT, BEFORE-AFTER-SELECTION, ASSET-PROVENANCE, approved copy/evidence | Services, Water Softener Repair, Contact final detail composites | Final-stage V2 preview provenance; fresh live recapture before launch; no invented mobile comparison or performance claims; no AskWill configuration | `/work/askwill` | Medium | Three comparisons, zoom/keyboard if applicable, labels, responsive QA, build |
| 5 Coast FI | Case Studies / 07 Coast FI; planning `1JP2-eO8jmq-5MqsfDlN0vccFkkJesZR3` | COAST-FI-CALCULATOR-SPEC-V2, COPY-BANK, CASE-STUDY-ARCHITECTURE, PUBLIC-SAFETY | coast-fi-reference-model.ts; coast-fi-test-cases-v2.json and runner | Four modes; today's dollars, effective real returns, end-month contributions; no logging entered financial values | `/work/coast-fi` | High | All 34 canonical fixtures against production engine, input boundaries, accessible chart/table, four modes, responsive QA |
| 6 Thesis / Compound Growth | Case Studies / 01 Thesis / Planning; `19QhHSgqFvhMCea97KaZGVuuAMFU54wly` | THESIS-INTERACTION-SPEC-V2, PORTFOLIO-COPY-BANK, CLAIMS-AND-CAUSAL-LANGUAGE, CASE-STUDY-EVIDENCE | Fixed projection-data.json; experiment-4-results.json; experiment-summary.json; separate annual end-year exploratory model | Planned contributions; measured mediators; no thesis download; experimental recreation never recomputed | `/work/compound-growth` | High | Fixed values, separate formula/zero return, toggles, EGR presets, result detail focus/touch, statistical review, responsive QA |
| 7 Smith Manoeuvre | Case Studies / 06 Smith Manoeuvre; planning `17TRG4r_6AW2IEMtiqNCS8GydPuDTfI6W` | SMITH-PUBLIC-CALCULATOR-SPEC-V2, FORMULA-QA, PUBLIC-SAFETY, CASE-STUDY-ARCHITECTURE | smith-public-reference-model.ts; smith-test-cases-v2.json + runner | Equal-cash baseline; monthly ordering; 65% room; estimated tax-offset proxy; no private workbook or changed accounting | `/work/smith-manoeuvre` | Very high | All 21 canonical fixtures and invariants against production engine; disclosure/input/accessibility/financial review |
| 8 Hero integration | Separate active workstream | Deferred | Preserve integration zone | Do not solve or redesign tonight | Homepage | Deferred | Future integration QA |
| 9 Site integration / global QA | Future phase | All approved feature PRs | Integrate only after review | No merge or deploy during overnight run | Site-wide | Future | Full integrated regression and launch review |

File naming inside private planning packages is historical. Public routes, headings, asset names, and repository files use the approved generic Reporting Workflow Automation wording.
