# Site Decisions — Foundation

## Approved visual direction

The production foundation uses the approved **Option B hybrid**: Option B's all-sans product/editorial feel, deep-teal rounded hero, spacing, hierarchy, and mobile composition; Option C's cleaner numbering, editorial heading discipline, layered Thesis evidence, quieter metadata, and less repetitive card treatment; and Option A's dark rounded contact close plus calmer neutral evidence surfaces.

## Required corrections incorporated

- No giant pale rounded container around the four More Work projects.
- Featured project cards use neutral/light surfaces; Design Day is no longer a dark dominant card.
- Thesis table and graph are layered at desktop/tablet and remain simultaneously visible at every breakpoint.
- Metadata/captions are at least approximately 12px; body copy is approximately 15–16px or larger.
- Tags are an inline, dot-separated metadata list rather than a field of pills.
- Internal prototype-planning copy has been removed.
- Design Day uses the circular light-based competition prototype, not the museum laser-harp inspiration.
- Public Design Day title is currently “Interactive light-based musical instrument.”
- Reporting project public title and route are “Reporting Workflow Automation” and `/work/reporting-workflow`.
- AskWill is described as a family-run service business without foregrounding the family relationship.

## Content decisions

Hero headline: **Researcher who builds things.**

Hero support: **I investigate problems, figure out what matters, and build useful things around what I learn.**

Credential: **MSc · Marketing Research & Behavioural Science · University of Ottawa**

Email: `parkerhamilton5324@gmail.com`

LinkedIn remains disabled in configuration until a verified public URL is supplied. No résumé CTA and no public GitHub link are rendered.

## Architecture

Static-first Astro with TypeScript and plain CSS. No React, Vue, Tailwind, Next, or heavy component library. The hero integration zone is deliberately framework-agnostic so a later SVG, Canvas, vanilla TypeScript, or Three.js hero can replace the placeholder without changing homepage structure.

Project pages are route shells only in this workstream.
