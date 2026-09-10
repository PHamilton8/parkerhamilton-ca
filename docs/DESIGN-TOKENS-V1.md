# Design Tokens V1

This file is the canonical human-readable design-token reference for the parkerhamilton.ca production foundation. Matching CSS custom properties live in `src/styles/tokens.css`.

## Colour

| Role | Token | Value | Use |
|---|---|---:|---|
| Page background | `--color-canvas` | `#F5F7F4` | Main open editorial canvas |
| Primary text | `--color-ink` | `#132124` | Headings, primary UI text |
| Body text | `--color-text` | `#26383B` | Long-form body copy |
| Secondary text | `--color-muted` | `#657477` | Metadata, captions, supporting copy |
| Accent teal | `--color-teal` | `#0A817D` | Links, numbering, selected emphasis |
| Deep teal | `--color-deep-teal` | `#0A3F3D` | Hero/contact closing surfaces |
| Deep teal shade | `--color-deep-teal-2` | `#072F2E` | Restrained depth inside deep surfaces |
| Pale teal | `--color-pale-teal` | `#DCEFEB` | Calm evidence and UI surfaces |
| Neutral surface | `--color-surface` | `#FFFFFF` | Cards and artifact frames |
| Soft neutral | `--color-surface-soft` | `#EEF4F2` | Thesis/evidence surfaces |
| Pale blue | `--color-surface-blue` | `#EDF3F6` | Digital-product evidence surfaces |
| Warm neutral | `--color-surface-warm` | `#F2F0E9` | Select low-priority neutral contrast |
| Border | `--color-line` | `#D5DFDC` | Default rules and cards |
| Strong border | `--color-line-strong` | `#BDCDCA` | Media frames |
| Focus | `--color-focus` | `#F2B84A` | Keyboard focus outline |

Teal is concentrated rather than used as a project-by-project rainbow. Featured project hierarchy comes from size, typography, and evidence rather than aggressive card colour.

## Spacing

Base scale: `0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7rem` via `--space-1` through `--space-28`.

Major homepage sections use responsive spacing in the `5–8rem` range on large screens and reduce deliberately on narrow screens. The lower project grid sits on the normal page canvas and is not wrapped in a giant rounded section container.

## Widths

- `--content-wide: 92rem` — site shell and homepage sections.
- `--content-main: 78rem` — case-study shell.
- `--content-reading: 46rem` — future long-form reading measure.

## Radius

- Small UI: `0.75rem`.
- Standard module: `1rem`.
- Project card: `1.25rem`.
- Hero: `2rem`.
- Contact close: `1.75rem`.

Not every object is a rounded card. Open editorial space is an intentional part of the system.

## Typography

All-sans system for the approved Option B hybrid. Primary stack: `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif`.

- Metadata/tags: `0.75–0.84rem` (12–13.4px at a 16px root).
- Captions: `0.76rem` (~12.2px).
- Card body: `0.93–0.96rem` (~14.9–15.4px), with site body at 16px.
- Section heading: `clamp(2.15rem, 3.7vw, 3.65rem)`.
- Hero display: `clamp(3.65rem, 6.4vw, 6.25rem)`.

Line heights: 1.01 display, 1.08 headings, 1.58 body.

## Elevation

Elevation is restrained and evidence-led:

- `--shadow-soft`: quiet surface lift.
- `--shadow-media`: stronger only for overlapping artifact frames such as the Thesis table/graph composition.

No glassmorphism, glow, glossy 3D, or broad shadow stacking.

## Breakpoints

Canonical CSS breakpoints:

- Phone: `35rem` (560px).
- Tablet: `51.25rem` (820px).
- Compact desktop: `68.75rem` (1100px).

QA additionally renders 1440, 1280, 1024, 820, 768, 430, 390, and 360 CSS pixels.

## Motion

Default motion duration is 140–220ms with `--ease-standard`. The foundation currently uses almost no decorative motion. `prefers-reduced-motion: reduce` disables smooth scrolling and collapses animation/transition duration.

## Focus

Every interactive element inherits a visible 3px `#F2B84A` focus outline with 4px offset. Touch/link targets are designed around a practical 44px minimum height.
