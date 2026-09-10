# Parker Hamilton portfolio

Astro static portfolio using the approved Option B hybrid design system.

## Local development

Use the Node version in `.nvmrc`.

```sh
npm ci
npm run dev
```

## Validation

```sh
npm run check
npm test
npm run build
npm run test:browser
node scripts/public-safety-scan.mjs
```

Install the Chromium test browser with `npx playwright install chromium` before the browser suite. The suite builds and starts the actual Astro application. It does not render a parallel HTML implementation.

The optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` and `PLAYWRIGHT_CHROMIUM_ARGS` environment values allow an installed Chromium in constrained test environments. CI uses Playwright's pinned browser.

## Production state

See [orchestration status](docs/ORCHESTRATION-STATUS.md), [QA register](docs/QA-REGISTER.md), and [overnight handoff](docs/OVERNIGHT-HANDOFF.md). Main remains the bootstrap until the recovery draft PR is explicitly reviewed and merged later. No deployment is part of this work.

Only approved public-safe project derivatives belong in this repository. Original confidential documents and financial workbooks are excluded.
