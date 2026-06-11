#!/usr/bin/env bash
set -euo pipefail
DATE="${1:?Ange datum ÅÅÅÅ-MM-DD}"
echo "Söker data-commit för $DATE..."
COMMIT=$(git log --oneline --before="${DATE}T23:59:59" --after="${DATE}T00:00:00" -- data/ | head -1 | cut -d' ' -f1)
if [ -z "$COMMIT" ]; then
  echo "Ingen data-commit hittades för $DATE"
  exit 1
fi
echo "Återställer data/ till $COMMIT"
git checkout "$COMMIT" -- data/
git add data/
git commit -m "correction: rollback data to $DATE (from $COMMIT)"
echo "Klar. Kör git push för att triggra rebuild."
