#!/usr/bin/env bash
set -euo pipefail

# drill.sh — Månadsdrill: bygg från ren klon, verifiera data_hash
# Användning: bash ops/drill.sh
# Krav: pnpm, git, node ≥ 22, sha256sum/shasum

MAX_MINUTES=15
START_TIME=$(date +%s)

REPO_URL="https://github.com/bambapappa/valflask.git"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== DRILL: ren klon + build + hash-verifiering ==="
echo "Temp-katalog: $TMP_DIR"
echo "Start: $(date '+%Y-%m-%d %H:%M:%S')"

# 1. Klon
echo "[1/4] Klonar repo ..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo"
cd "$TMP_DIR/repo"

# 2. Install site deps
echo "[2/4] pnpm install --frozen-lockfile (site) ..."
cd site
pnpm install --frozen-lockfile

# 3. Build site
echo "[3/4] Bygger site ..."
pnpm build
cd ..

# 4. Hash-verifiering
echo "[4/4] Verifierar data_hash ..."

# OBS: data_hash är sha256 av en KANONISK serialisering av promises.json (sorterade
# nycklar, minifierad) — inte sha256sum av råfilen. Vi jämför därför den byggda
# integrity.json mot changeloggens sista data_hash (pipelinens kanoniska hash för
# samma promises.json). En ren ombyggnad ska reproducera exakt samma hash.
EXPECTED_HASH=$(node -e "const c=JSON.parse(require('fs').readFileSync('data/changelog.json','utf8')); console.log(c[c.length-1].data_hash)")
BUILT_HASH=$(node -e "console.log(JSON.parse(require('fs').readFileSync('site/dist/api/v1/integrity.json','utf8')).data_hash)")

if [[ "$EXPECTED_HASH" != "$BUILT_HASH" ]]; then
  echo "ERROR: data_hash mismatch!"
  echo "  changelog (förväntat):  $EXPECTED_HASH"
  echo "  integrity.json (byggt): $BUILT_HASH"
  exit 3
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
ELAPSED_MIN=$(echo "scale=2; $ELAPSED / 60" | bc)

echo ""
echo "=== DRILL OK ==="
echo "Tid: ${ELAPSED}s (${ELAPSED_MIN} min)"

if (( ELAPSED > MAX_MINUTES * 60 )); then
  echo "ERROR: Drill tog längre tid än ${MAX_MINUTES} min ($ELAPSED_MIN min)"
  exit 4
fi

exit 0
