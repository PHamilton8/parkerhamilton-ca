# Cathedral Monument hero — implementation QA

Authority: `ParkerHamilton.ca / Prompts / Next Parallel Workflows / 09-hero-production-implementation.md` and `ParkerHamilton.ca / Production / Hero / Final Cathedral Monument`.

Base candidate: `acfeba769bea3d47672c0f200b6b85bfd40cde4f`.

## Implementation

- Technology: deterministic server-rendered SVG plus a small vanilla TypeScript enhancement; no Three.js/WebGL and no added runtime dependency.
- The exact `final-config.json` handoff is committed as the machine-readable source of locked constants.
- Resting SVG paths are server-rendered so the monument is complete before JavaScript runs.
- Interaction only offsets ribbons around the analytical centreline; it does not alter the rest trajectory.
- Pointer motion uses the locked 96 ms damping constant and stops requesting frames after the target settles. There is no idle/perpetual animation.
- Reduced-motion visitors receive the complete static resting monument with interaction disabled.
- The visual is decorative/supportive (`aria-hidden`) and adds no keyboard focus target.
- Touch uses Pointer Events with `touch-action: pan-y`; vertical page scrolling remains available.

## Locked geometry

- `k = 2.0`
- `A = 324.1696`
- `x0 = 64.34`
- `x1 = 505.66`
- `y0 = 405.56`
- 320 direct analytical samples
- 9 locked ribbons with the supplied widths, opacities, violet/coral layer map, spread, proximity, lift, parallax, shadow, and neutral-pointer constants

`tests/hero-trajectory.test.mjs` independently validates 400 analytical samples, strictly increasing visible slope, convexity, a steepest terminal interval, and the handoff's five equal-horizontal-interval gains.

## Browser QA

`tests/browser/hero.spec.ts` exercises the actual built homepage at 1440, 1280, 1024, 820, 768, 430, 390, and 360 px; checks all nine ribbons, stage geometry, path containment, page overflow, console/page errors, pointer opening/settling, and reduced-motion static behaviour. It captures 1440, 820, and 390 px full-page screenshots plus a 390 px reduced-motion capture into `test-results/hero/` for the CI artifact.

## Performance design

The implementation adds no package dependency and no raster hero payload. The SVG has a stable aspect ratio and server-rendered geometry, avoiding a late hero layout shift. Interaction work is bounded to 320 samples × 9 ribbons and animation frames stop after each movement/settle transition.
