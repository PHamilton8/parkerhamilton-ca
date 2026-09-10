# Design Day — QA and provenance

Route `/work/design-day`; branch `feat/design-day` from foundation candidate `acfeba769bea3d47672c0f200b6b85bfd40cde4f`.

## Approved evidence

Canonical Case Studies / 02 Design Day planning folder `1vAiSNfxWLu4yaf4alw03E7zWR6rGvXRM` and public assets `12ZBrvLeYm_zdcy2o5kNKbBOKdiPni5_v`. Sources: owner addendum, copy bank, evidence, accessibility claims, case-study architecture, asset selection and provenance.

The seven media files are byte-identical approved derivatives, renamed for clear public paths. Final circular prototype is the actual team build. Museum photo is explicitly inspiration/reference. Process images show printing, soldering and bench testing; the owner approved teammate hands/arms. Image EXIF fields are absent. The 16.016-second demo contains H.264 video (480×848) and AAC actual instrument audio, with native controls, no autoplay, a poster and an associated written description. Original archives were not opened or copied.

The page preserves collaborative authorship, approximately five informal testers including about three musicians, and unvalidated accessibility-oriented rationale. It adds no undocumented component identity, testing-led redesign or formal accessibility validation. Exact award wording matches the [uOttawa winner record](https://www.uottawa.ca/faculty-engineering/centre-entrepreneurship-engineering-design/past-winners), checked during this run: 2023 Winter, Open 1, Beam Buccaneers.

## Local gates

- PASS: clean `npm ci`; Astro/TypeScript checks with zero errors/warnings/hints; source/route tests 9/9; actual Astro static production build.
- PASS: full Playwright suite 5/5, including all inherited foundation tests, responsive Design Day screenshots at 1440/820/390, loaded images, no overflow or console errors, native video controls/focus/readiness, text alternative and reduced motion.
- PASS: public-safety scan, including added media provenance review.
- Real-app screenshots: `docs/qa/design-day/design-day-{1440,820,390}.jpg`.
- Independent review is recorded separately before publication.

Local browser: Chromium 152 through the existing executable override after standard browser CDN timeout. CI uses ordinary pinned Playwright installation; no dependency changes.

No merge or deployment. Hero and integrated launch QA remain deferred.
