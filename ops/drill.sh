#!/usr/bin/env bash
set -euo pipefail
START=$(date +%s)
echo "=== Återställningsdrill startad $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# 1. Verifiera git-repo
git status --short

# 2. Kontrollera data_hash mot promises.json
if command -v sha256sum >/dev/null; then
  HASH=$(cat data/promises.json | sha256sum | cut -d' ' -f1)
else
  HASH=$(cat data/promises.json | shasum -a 256 | cut -d' ' -f1)
fi
echo "data_hash: $HASH"

# 3. Bygg sajten
cd site && pnpm install --frozen-lockfile && pnpm build && cd ..

# 4. Verifiera att dist/ innehåller index.html
[ -f "site/dist/index.html" ] && echo "✓ index.html finns" || (echo "✗ index.html saknas" && exit 1)

END=$(date +%s)
ELAPSED=$((END - START))
echo "=== Drill klar på ${ELAPSED}s ==="
echo "Uppdatera 'Senast övad' i ops/RUNBOOK.md med $(date -u +%Y-%m-%d)"
