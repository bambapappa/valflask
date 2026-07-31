#!/usr/bin/env bash
set -euo pipefail

# rollback-data.sh — Återställ data till ett tidigare läge
# Användning: bash ops/rollback-data.sh <datum|commit> [--dry-run]
# Exempel: bash ops/rollback-data.sh 2026-06-10

REFERENCE="${1:-}"
DRY_RUN=false
if [[ "${2:-}" == "--dry-run" ]]; then DRY_RUN=true; fi

if [[ -z "$REFERENCE" ]]; then
  echo "Användning: $0 <datum|commit> [--dry-run]"
  echo "  datum:    YYYY-MM-DD — reverta alla data-commits sedan och med detta datum"
  echo "  commit:   git-sha    — reverta alla data-commits efter denna commit"
  exit 1
fi

# Defensiv: vägra vid smutsigt träd
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: Smutsigt träd. Stash eller commit innan rollback."
  exit 2
fi

# Hitta commits som rör data/ sedan referensen
# Om referensen ser ut som ett datum (YYYY-MM-DD), hitta första data-commit på eller efter det datumet
# Om referensen är en commit-sha, använd den direkt

if [[ "$REFERENCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  # Hitta alla data-commits från och med detta datum
  SINCE="${REFERENCE}T00:00:00"
  COMMITS=$(git log --format="%H" --since="$SINCE" -- data/)
else
  # Hitta alla data-commits efter denna commit
  COMMITS=$(git log --format="%H" "${REFERENCE}..HEAD" -- data/)
fi

if [[ -z "$COMMITS" ]]; then
  echo "Inga data-commits hittades att reverta."
  exit 0
fi

if $DRY_RUN; then
  echo "=== DRY RUN ==="
  echo "Följande data-commits skulle revertas (nyaste först):"
  git log --format="%h %s (%ad)" --date=short --reverse <<< "$COMMITS"
  echo ""
  echo "Kommandon som skulle köras:"
  for sha in $COMMITS; do
    echo "  git revert --no-commit $sha"
  done
  echo "  git commit -m 'rollback: revert data-commits till läge före $REFERENCE'"
  echo "  git push"
  echo ""
  echo "GLÖM INTE: Skriv en synlig rättelse-commit efteråt:"
  echo "  git commit --allow-empty -m 'correction: [beskriv felet och åtgärden]"
  exit 0
fi

# Kör revert
for sha in $COMMITS; do
  echo "Reverterar $sha ..."
  git revert --no-commit "$sha"
done

git commit -m "rollback: revert data-commits till läge före $REFERENCE"

echo ""
echo "Rollback committad. Pusha med:"
echo "  git push"
echo ""
echo "VARNING: Tyst rättelse är förbjuden (§17). Skriv en synlig rättelse-commit:"
echo "  git commit --allow-empty -m 'correction: [beskriv felet och åtgärden]'"
echo "  git push"
echo ""
