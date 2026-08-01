#!/usr/bin/env bash
set -euo pipefail

alias_name="my-airport-taxi-ni"

if [ "${ENSURING_ALIAS_WORKER:-}" = "1" ]; then
  echo "Alias worker deploy already in progress, skipping nested build step."
  exit 0
fi

echo "Ensuring alias worker \"${alias_name}\" exists for service binding..."
echo "Deploy context: WORKERS_CI=${WORKERS_CI:-} CI=${CI:-} CI_OVERRIDE=${WRANGLER_CI_OVERRIDE_NAME:-}"

export ENSURING_ALIAS_WORKER=1

if env -u WRANGLER_CI_OVERRIDE_NAME npx wrangler deploy --config wrangler.alias.toml --name "${alias_name}"; then
  echo "Alias worker \"${alias_name}\" is ready."
  exit 0
fi

if [ "${WORKERS_CI:-}" = "1" ] || [ "${CI:-}" = "true" ]; then
  echo "Alias worker deploy failed in Workers CI."
  exit 1
fi

echo "Alias worker deploy skipped locally (no Cloudflare credentials)."
exit 0
