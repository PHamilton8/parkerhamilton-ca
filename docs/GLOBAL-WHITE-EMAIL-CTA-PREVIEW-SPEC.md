# Global Homepage-Style ContactBand + White Email CTA — Preview Spec

Authority: Parker's global owner decision of 2026-09-13, clarified after visual QA: every ParkerHamilton.ca route must use the complete final owner-approved Homepage V3 ContactBand treatment, not merely its white Email button. Parker then made one additional explicit global mobile refinement: on mobile, keep the ContactBand compact by placing the Email CTA beside `Have a question?` instead of stacking it below. Homepage owner-approval record: Drive `1K-_ERW4hKuA0QvncX7nvT0S9hjQ-r2G84UM_JjBTt28`.

Canonical implementation source: `src/components/layout/ContactBand.astro`.

## Global rule

All routes use the same shared ContactBand as the Homepage. Do not retain the older tall case-study ContactBand on non-Homepage routes. At desktop and tablet widths the band is short and horizontal, with `CONTACT` and `Have a question?` on the left and the white Email CTA on the right. At mobile the eyebrow remains above, while `Have a question?` and the Email CTA share the same row.

This is a shared/global normalization only. It does not reopen any route-specific page design, copy, calculator, research, graph, or workbook decision.

## Required markup and behavior

- Use the shared ContactBand component.
- Visible treatment remains `Email ↗`.
- Render the arrow as the canonical inline SVG `.contact-email-arrow`; do not render the arrow as a separate text/glyph chip or give it its own background, border, radius, shadow, or transformed painted box.
- Keep the arrow SVG `aria-hidden="true"` and `focusable="false"`, so the accessible name remains `Email`.
- Keep the existing `mailto:${site.email}` behavior.
- Do not emit the legacy `contact-action primary` classes for the ContactBand Email CTA.
- Do not show a green/teal filled Email button as an alternative state or route variant.

## Canonical ContactBand layout

Desktop / wider than 980px:

```css
width: min(calc(100% - 40px), 1400px);
max-width: 1400px;
margin: 42px auto 0;
padding: 42px 36px;
display: grid;
grid-template-columns: minmax(0, 1fr) auto;
grid-template-areas: 'eyebrow actions' 'title actions';
column-gap: 28px;
row-gap: 16px;
align-items: center;
border-radius: 26px;
background: linear-gradient(180deg, #0a4f4a 0%, #084843 100%);
color: #f8fbfa;
```

Desktop typography:
- Eyebrow: `12px`, weight `800`, letter-spacing `0.16em`, color `#9fd1ca`.
- Heading: `74px`, line-height `0.98`, weight `800`, letter-spacing `-0.055em`, color `#f8fbfa`.
- At 1180px and below, heading becomes `64px`.

Tablet / 980px and below:
- Preserve the same horizontal left-copy/right-CTA composition.
- `margin-top: 28px`.
- `padding: 18px 16px`.
- `row-gap: 10px`.
- `border-radius: 16px`.
- Eyebrow `10px`.
- Heading `28px`.

Mobile / 480px and below:
- Band width `calc(100% - 16px)`.
- `margin-top: 18px`.
- `padding: 14px 16px`.
- Two-row grid: first row is the `CONTACT` eyebrow spanning both columns; second row places `Have a question?` on the left and the Email CTA on the right.
- `grid-template-columns: minmax(0, 1fr) auto`.
- `grid-template-areas: 'eyebrow eyebrow' 'title actions'`.
- `column-gap: 12px`; `row-gap: 8px`.
- Eyebrow `10px`, no extra bottom margin.
- Heading `18px`, kept on one line.
- Actions have no extra top margin.
- This mobile layout must apply identically to Home and every case-study route.

## Canonical Email CTA

Desktop / wider than 980px:

```css
min-width: 126px;
min-height: 44px;
padding: 11px 14px;
display: inline-flex;
align-items: center;
justify-content: space-between;
gap: 16px;
overflow: hidden;
border: 0;
border-radius: 12px;
background: #f4f7f4;
color: #0a4f4a;
box-shadow: none;
font-size: 15px;
line-height: normal;
font-weight: 700;
text-decoration: none;
white-space: nowrap;
```

Arrow at desktop: a single transparent 15×15px inline SVG, `flex: 0 0 15px`, using a 1.8px `currentColor` stroke with round caps/joins. The SVG itself must have `background: transparent`, `border: 0`, `border-radius: 0`, and `box-shadow: none`. It must remain fully inside the Email button's single rounded white box.

Hover: translate the entire Email button up `1px`, `background: #fff`, `color: #073f3b`. Do not separately translate or animate the arrow.

Tablet / 980px and below: retain the same 126px minimum width, 44px minimum height, 11px × 14px padding and 12px radius; use `11px` label text and a 12×12px arrow SVG.

Mobile / 480px and below: make the button content-driven rather than fixed-width: `width: auto`, `min-width: 0`, `min-height: 44px`, `padding: 10px 12px`, `gap: 8px`, `border-radius: 11px`, `font-size: 11px`, and the same 12×12px arrow SVG. The reduced 8px Email-to-arrow gap is intentional to keep the CTA compact beside the heading.

Keyboard focus remains the site's existing global `:focus-visible` treatment: a `3px` `var(--color-focus)` outline with `4px` offset. Do not suppress or replace that focus ring. Existing reduced-motion rules remain authoritative for transition duration.

## Standalone-preview rule

Standalone route previews must copy the complete Homepage-style ContactBand exactly even when the rest of the route preview predates this global decision. An older tall ContactBand, stacked mobile CTA, or green Email button in a standalone preview is stale evidence, not an alternative owner-approved state.

At minimum, preview specialists must check 1440px, 820px, and 390px widths on Home, Design Day, Reporting Workflow, Grocery Automation, AskWill, Coast FI, Compound Growth, and Smith Manoeuvre. Mobile QA must additionally confirm the heading and Email CTA share one row and remain usable without overlap at 390px; 320px is a recommended narrow-width guard. Confirm that all eight ContactBands share the same geometry at each width; the Email CTA is one uninterrupted white rounded rectangle; the arrow stays contained; the accessible name is `Email`; the mailto target is preserved; and keyboard focus remains visible.
