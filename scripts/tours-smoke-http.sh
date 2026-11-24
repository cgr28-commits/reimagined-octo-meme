#!/usr/bin/env bash
# Bounded-retry HTTP helper for the staging smoke tests (tours-settings job). Source it; do not execute it.
#
#   . scripts/tours-smoke-http.sh
#   smoke_call <expected-http-code> <label> <curl args...>     # body in $SMOKE_BODY, code in $SMOKE_CODE
#
# Transient failures (HTTP 5xx, or no response at all) are retried a bounded number of times (default 6 attempts,
# 5 seconds apart). Everything else (2xx/3xx/4xx) is never retried. After the last attempt, or on any other code that
# is not the expected one, the call FAILS: persistent failures are never hidden. Every retry is logged as a warning and
# counted in $SMOKE_RETRIES.
#
# Diagnostics are sanitised: at most 200 characters of the body, control characters removed, any "Bearer <token>"
# replaced, and the secret in $SMOKE_SECRET (if set) replaced. Request headers and arguments are never printed.

SMOKE_MAX_ATTEMPTS="${SMOKE_MAX_ATTEMPTS:-6}"
SMOKE_DELAY="${SMOKE_DELAY:-5}"
SMOKE_RETRIES=0
SMOKE_BODY="${SMOKE_BODY:-$(mktemp)}"
SMOKE_CODE=""

smoke_sanitise() {
  local text
  text="$(tr -d '\000-\010\013-\037' < "$SMOKE_BODY" 2>/dev/null | head -c 200)"
  text="$(printf '%s' "$text" | sed -E 's/(Bearer )[A-Za-z0-9._~+\/=-]+/\1[redacted]/g')"
  if [ -n "${SMOKE_SECRET:-}" ]; then text="${text//"$SMOKE_SECRET"/[redacted]}"; fi
  printf '%s' "$text"
}

smoke_call() {
  local expected="$1" label="$2" attempt code
  shift 2
  for attempt in $(seq 1 "$SMOKE_MAX_ATTEMPTS"); do
    : > "$SMOKE_BODY"
    code="$(curl -s -o "$SMOKE_BODY" -w '%{http_code}' --max-time 20 "$@" 2>/dev/null || true)"
    [ -n "$code" ] || code="000"
    case "$code" in
      5* | 000)
        SMOKE_RETRIES=$((SMOKE_RETRIES + 1))
        echo "::warning::${label}: transient HTTP ${code} on attempt ${attempt}/${SMOKE_MAX_ATTEMPTS}: $(smoke_sanitise)"
        if [ "$attempt" -lt "$SMOKE_MAX_ATTEMPTS" ]; then sleep "$SMOKE_DELAY"; fi
        ;;
      *) break ;;
    esac
  done
  SMOKE_CODE="$code"
  if [ "$code" != "$expected" ]; then
    echo "::error::${label}: expected HTTP ${expected}, got ${code}: $(smoke_sanitise)"
    return 1
  fi
  return 0
}
