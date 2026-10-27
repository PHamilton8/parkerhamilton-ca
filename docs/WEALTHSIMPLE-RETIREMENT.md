# Retired application route — 2026-10-27

The owner requested removal of the obsolete Wealthsimple application page after the application was rejected. This candidate has eight indexable portfolio routes plus the normal 404 page. `/wealthsimple-2026` and `/wealthsimple-2026/` must return 404, not an application page or homepage fallback.

The dedicated MP4, poster, and caption track are removed. Design Day's separate working-demo video, poster, captions, page, and all other portfolio content are unchanged. There were no inbound portfolio navigation or sitemap links to remove.

Current source, built-output, browser, and postlaunch preview/production smoke contracts assert retirement. Older final-RC assembler/preview tools and their synthetic fixtures are historical tooling; they do not authorize restoration of this retired route. They must not be used to recreate an old candidate for a new production release.

This change does not renew the expired, source/artifact-bound release risk exception. Production publication remains gated on fresh dependency/security qualification, exact-commit CI, reviewed candidate, and the normal promotion workflow. A successful local build is not deployment evidence.
