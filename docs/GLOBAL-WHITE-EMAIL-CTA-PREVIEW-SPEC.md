# Global White Email CTA — Preview Spec

Authority: Parker's global owner decision of 2026-09-13, using the final owner-approved Homepage V3 ContactBand Email treatment as the site-wide standard. Homepage owner-approval record: Drive `1K-_ERW4hKuA0QvncX7nvT0S9hjQ-r2G84UM_JjBTt28`.

Canonical implementation source: `src/components/layout/ContactBand.astro`.

## Required markup and behavior

- Use the shared ContactBand Email anchor with class `contact-email-action`.
- Visible treatment remains `Email ↗`.
- Render the arrow as the canonical inline SVG `.contact-email-arrow`; do not render the arrow as a separate text/glyph chip or give it its own background, border, radius, shadow, or transformed painted box.
- Keep the arrow SVG `aria-hidden="true"` and `focusable="false"`, so the accessible name remains `Email`.
- Keep the existing `mailto:${site.email}` behavior.
- Do not emit the legacy `contact-action primary` classes for the ContactBand Email CTA.
- Do not show a green/teal filled Email button as an alternative state or route variant.

## Canonical visual treatment

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
transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
```

Arrow at desktop: a single transparent 15×15px inline SVG, `flex: 0 0 15px`, using a 1.8px `currentColor` stroke with round caps/joins. The SVG itself must have `background: transparent`, `border: 0`, `border-radius: 0`, and `box-shadow: none`. It must remain fully inside the Email button's single rounded white box.

Hover: translate the entire Email button up `1px`, `background: #fff`, `color: #073f3b`. Do not separately translate or animate the arrow.

Tablet / 980px and below: retain the same 126px minimum width, 44px minimum height, 11px × 14px padding and 12px radius; use `11px` label text and a 12×12px arrow SVG.

Mobile / 480px and below: use `width: 118px`, `min-width: 118px`, `min-height: 44px`, `padding: 10px 13px`, `border-radius: 11px`, and the same 12×12px arrow SVG.

Keyboard focus remains the site's existing global `:focus-visible` treatment: a `3px` `var(--color-focus)` outline with `4px` offset. Do not suppress or replace that focus ring. Existing reduced-motion rules remain authoritative for transition duration.

## Standalone-preview rule

Standalone route previews must copy this Email CTA treatment exactly even when the rest of the route preview predates the global decision. Keep the route's governing ContactBand layout, copy, spacing, and other visual decisions unchanged; normalize only the Email CTA. An older green Email button in a standalone preview is stale evidence, not an alternative owner-approved state.

At minimum, preview specialists must check 1440px, 820px, and 390px widths, confirm the visible `Email ↗` treatment is contained within one uninterrupted white rounded rectangle, confirm there is no arrow chip/protrusion/extra white border, confirm the accessible name is `Email`, confirm the mailto target is preserved, and confirm keyboard focus remains visible.
