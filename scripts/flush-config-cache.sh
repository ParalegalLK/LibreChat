#!/usr/bin/env bash
#
# Flush LibreChat's *config* caches from Redis without destroying user sessions.
#
# Why not FLUSHALL: Redis also holds OPENID_SESSION:* keys (the server-side half
# of every SSO login). FLUSHALL signs every user out — they get kicked on their
# next token refresh. This script deletes only config/permission/tool caches.
#
# Usage: ./scripts/flush-config-cache.sh   (then: docker compose restart api)

set -euo pipefail

PATTERNS=(
  'librechat::CONFIG_STORE*'
  'librechat::APP_CONFIG*'
  'librechat::STARTUP_CONFIG*'
  'librechat::ROLES*'
  'librechat::TOOL_CACHE*'
)

total=0
for pattern in "${PATTERNS[@]}"; do
  deleted=$(docker compose exec -T librechat-redis sh -c "
    redis-cli --scan --pattern '$pattern' | while read -r key; do
      redis-cli DEL \"\$key\" > /dev/null && echo \"\$key\"
    done | wc -l
  ")
  echo "  $pattern -> ${deleted} key(s) deleted"
  total=$((total + deleted))
done

echo "Done: ${total} config cache key(s) flushed. User sessions untouched."
echo "Now run: docker compose restart api"
