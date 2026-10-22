#!/usr/bin/env bash
set -euo pipefail

# This checks the environment BEFORE the following Node process starts. It does
# not attest the runner, earlier action processes, or a compromised shell.
blocked=(BASH_ENV ENV LD_PRELOAD DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH NODE_OPTIONS NODE_EXTRA_CA_CERTS NODE_TLS_REJECT_UNAUTHORIZED NODE_USE_SYSTEM_CA
  NODE_USE_ENV_PROXY SSL_CERT_FILE SSL_CERT_DIR OPENSSL_CONF OPENSSL_MODULES
  HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy all_proxy no_proxy
  CLOUDFLARE_API_BASE_URL CF_API_BASE_URL CLOUDFLARE_API_ENVIRONMENT
  CLOUDFLARE_COMPLIANCE_REGION WRANGLER_API_ENVIRONMENT WRANGLER_API_BASE_URL
  WRANGLER_CI_OVERRIDE_NAME CLOUDFLARE_ENV WRANGLER_CI_GENERATE_PREVIEW_ALIAS WRANGLER_CI_MATCH_TAG
  WRANGLER_LOG_PATH WRANGLER_LOG_SANITIZE WRANGLER_LOG)
for name in "${blocked[@]}"; do
  if [[ -n "${!name+x}" ]]; then
    printf 'Release environment rejected: %s is present. Its value was not logged.\n' "$name" >&2
    exit 1
  fi
done
if [[ "${WRANGLER_SEND_METRICS:-}" != false ]]; then
  printf 'Release environment requires optional Wrangler metrics disabled.\n' >&2
  exit 1
fi
if [[ "${1:-}" == --wrangler ]]; then
  shift
  exec ./node_modules/.bin/wrangler "$@"
fi
exec node "$@"
