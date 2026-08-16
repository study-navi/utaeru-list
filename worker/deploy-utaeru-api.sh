#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
echo "=== wrangler whoami ==="
npx wrangler whoami
echo ""
echo "=== deploy utaeru-api only ==="
npx wrangler deploy
echo ""
echo "=== verify Set-Cookie (logout) ==="
curl -sS -D - -o /dev/null -X POST "https://utaeru-api.manabit.workers.dev/api/auth/logout" \
  -H "Content-Type: application/json" -d '{}' | grep -i set-cookie
