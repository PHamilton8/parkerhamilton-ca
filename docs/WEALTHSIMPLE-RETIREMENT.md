# Retired application route — 2026-10-27

The owner requested removal of the obsolete Wealthsimple application page after the application was rejected. This candidate has eight indexable portfolio routes plus the normal 404 page. `/wealthsimple-2026` and `/wealthsimple-2026/` must return 404, not an application page or homepage fallback.

The dedicated MP4, poster, and caption track are removed. Design Day's separate working-demo video, poster, captions, page, and all other portfolio content are unchanged. There were no inbound portfolio navigation or sitemap links to remove.

Current source, built-output, browser, and postlaunch preview/production smoke contracts assert retirement. Older final-RC assembler/preview tools and their synthetic fixtures are historical tooling; they do not authorize restoration of this retired route. They must not be used to recreate an old candidate for a new production release.

This change does not renew the expired, source/artifact-bound release risk exception. Production publication remains gated on fresh dependency/security qualification, exact-commit CI, reviewed candidate, and the normal promotion workflow. A successful local build is not deployment evidence.

## Security remediation and normal clean qualification

The supported dependency updates pin Wrangler 4.154.0 and its bundled/miniflare Undici 7.30.1, http-cache-semantics 4.3.0 and Zod 4.6.7. Normal release qualification now requires a complete credential-free, zero-exit audit with zero findings at every severity; it binds exact source inputs, package/lock hashes, runtime, installed toolchain, bundled Undici and complete built-artifact identity. Candidate creation repeats the audit before any provider credential use. The reviewed candidate carries its receipt into promotion, where source/tree/artifact identity and one-hour evidence freshness are rechecked at the final dispatch boundary. This freshness limit is not a security exception or approval extension. The historical exception remains unchanged and expired. No repository permissions, branch protections, secrets or provider security settings were changed.
