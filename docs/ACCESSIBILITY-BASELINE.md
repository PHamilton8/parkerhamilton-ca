# Accessibility Baseline

The foundation treats accessibility as a shared-system contract rather than a later polish pass.

## Implemented baseline

- Semantic `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`, headings, figures, and lists.
- A keyboard-visible “Skip to main content” link.
- Exactly one homepage H1 and hierarchical H2/H3 use.
- Visible `:focus-visible` treatment using a 3px high-contrast outline.
- Primary navigation and project/contact links designed around a practical 44px minimum target height.
- `prefers-reduced-motion: reduce` disables smooth scrolling and effectively removes transition/animation duration.
- Meaningful real images carry descriptive alt text.
- Decorative synthetic card visuals use empty alt plus a text-equivalent caption/note.
- Thesis table and graph are both present in the DOM at every breakpoint and are not hidden as a responsive shortcut.
- Project categories are text, not colour-only distinctions.
- Core token contrast pairs are checked by `tests/contrast_check.py`.
- No hover-only content or required hover state exists in the foundation.

## Follow-up requirements for future builders

Project-page builders must preserve heading order, focus visibility, reduced-motion behaviour, minimum target sizing, text equivalents for charts/diagrams, and meaningful alt text. New interactive visualization work must include keyboard support and a non-visual text equivalent before release.
