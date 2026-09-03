#!/usr/bin/env bash
# Kö-passet: prövar båda köerna genom kvalitetsfiltret.
#
# Godkännandet vägrar släppa igenom något som inte gått genom filtret. Kön fylls
# på schemalagt — kopplingsförslag varje dygn, skörden varje måndag — medan
# prövningen kördes för hand, och skillnaden byggde upp 623 oprövade köposter på
# en vecka. Det här passet stänger den skillnaden.
#
#   pipeline/scripts/ko-pass.sh --torr            mät och pröva, skriv ingenting
#   pipeline/scripts/ko-pass.sh                   skriv, committa och pusha
#
# **Passet beslutar ingenting.** Det gör poster prövbara; godkännandet är kvar
# hos en människa, och sammanslagningen av grenen likaså. Det är samma delning
# som gällt sedan 2026-08-09.
#
# **Ingen modell behövs.** Varje steg nedan är ett deterministiskt skript. Det
# är skälet till att passet alls kan schemaläggas: antagandet att kö-arbetet
# kräver bedömning gäller BESLUTEN, inte prövningen.
#
# Miljö:
#   HANDOFF   sökväg till det privata repot med skripten och granskningsloggen
#   VALFLASK  sökväg till det här repot (default: två nivåer upp)
set -euo pipefail

TORR=0
[ "${1:-}" = "--torr" ] && TORR=1

VALFLASK="${VALFLASK:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
HANDOFF="${HANDOFF:?HANDOFF måste peka på det privata repot}"
SKILL="$HANDOFF/.claude/skills/haller-det/scripts"
UT="$(mktemp -d)"
trap 'rm -rf "$UT"' EXIT

steg() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

# ── 1. Mät båda köerna i den form de skulle publiceras ──────────────────────
#
# Mätningen måste läsa KÖN och inte det publicerade. Läses det publicerade får
# posten sin prövning först efter beslutet, och då ligger filtret på fel sida
# om grinden — vilket är precis den ordning som gjorde att ingenting gick att
# godkänna.
steg "Mäter granskningskön"
(cd "$VALFLASK/pipeline" && pnpm --silent utrakningen -- --ko --json "$UT/utrakningen-ko.json")

steg "Mäter kopplingskön mot källdokumenten"
(cd "$VALFLASK/handlingsvagen/pipeline" && npm run --silent handlingsklass -- --ko --skriv)

# ── 2. Härled prövningarna ur mätningarna ───────────────────────────────────
#
# Arkivkontrollen ligger med flit inte här. Den öppnar drygt tolvhundra
# ögonblicksbilder i artigt tempo och tar timmar — det är skälet, och det räcker
# som skäl för att hålla den utanför ett nattligt pass.
#
# Skälet stod tidigare som «nätet når inte arkivet». Det var fel, och rättades
# 2026-09-03 när kontrollen kördes med normal åtkomst: enstaka läsningar går
# fint även från en trång miljö, och sparandet fungerar från en maskin som når
# arkivet. Det som fallerar i en trång miljö är svepet i skala — arkivet stryper
# — och det syns då som `oavgjort` på nästan varenda post. `oavgjort` mäter
# alltså uppkopplingen och inte kopiorna, vilket var rätt slutsats av fel skäl.
#
# Arkivraden hamnar därför i `oprovat`: en känd lucka går att lita på.
steg "Härleder prövningar"
python3 "$SKILL/svep-till-provning.py" "$VALFLASK" --loften --ko \
  --utrakningen "$UT/utrakningen-ko.json" --ut "$UT/provningar-loften.json"
python3 "$SKILL/svep-till-provning.py" "$VALFLASK" --kopplingar --ko \
  --ut "$UT/provningar-kopplingar.json"

if [ "$TORR" = 1 ]; then
  steg "Torrkörning — ingenting skrivet"
  # Talen är hela svaret på om passet fungerar. Skrivs de inte ut är en
  # torrkörning bara ett grönt jobb som inte säger något.
  python3 - "$UT/provningar-loften.json" "$UT/provningar-kopplingar.json" <<'PY'
import json, sys
from collections import Counter
for f in sys.argv[1:]:
    poster = json.load(open(f))
    print(f"  {len(poster):5}  {f.split('/')[-1]}  {dict(Counter(p['utfall'] for p in poster))}")
PY
  exit 0
fi

# ── 3. Skriv till granskningsloggen, som är beviset ─────────────────────────
#
# Loggen committas FÖRE exporten. Exporten vägrar annars — och den vägran är
# rätt: en rad i facit utan en rad i loggen är en prövning vars underlag ingen
# kan läsa. 832 sådana rader fanns 2026-09-02, från ett pass som exporterade
# utan att committa.
DAG="$(date -u +%Y-%m-%d)"
steg "Skriver prövningarna till granskningsloggen"
python3 "$SKILL/logg.py" "$HANDOFF" skriv --valflask "$VALFLASK" \
  --fil "$UT/provningar-loften.json" --spar "$DAG-ko-pass-loften"
python3 "$SKILL/logg.py" "$HANDOFF" skriv --valflask "$VALFLASK" \
  --fil "$UT/provningar-kopplingar.json" --spar "$DAG-ko-pass-kopplingar"

steg "Committar loggen"
git -C "$HANDOFF" add projekt/utlovat/granskningslogg/
if git -C "$HANDOFF" diff --cached --quiet; then
  echo "  Inga nya loggrader."
else
  git -C "$HANDOFF" commit -q -m "granskningslogg: kö-passet $DAG"
  git -C "$HANDOFF" push -q origin HEAD:main
fi

# ── 4. Exportera indexet grinden läser ──────────────────────────────────────
#
# UTAN --tillat-radering med flit. Skulle poster försvinna ur facit är det inte
# något ett schemalagt pass ska besluta i tysthet — då stannar passet och en
# människa får titta. Flaggan finns, men den är ett beslut.
steg "Exporterar prövningsindexet"
python3 "$SKILL/logg.py" "$HANDOFF" export --valflask "$VALFLASK"

# ── 5. Pusha grenen. ko-pass-pr.yml öppnar PR:en. ───────────────────────────
#
# Grennamnet är inte fritt: `ko-pass-pr.yml` lyssnar på `claude/ko-pass-**`.
steg "Pushar grenen"
GREN="claude/ko-pass-$DAG"
git -C "$VALFLASK" checkout -q -B "$GREN"
git -C "$VALFLASK" add data/provningar.json handlingsvagen/data/handlingsklass-ko.json
if git -C "$VALFLASK" diff --cached --quiet; then
  echo "  Inget nytt att publicera — ingen gren pushad."
  exit 0
fi
git -C "$VALFLASK" commit -q -F - <<EOF
Kö-passet $DAG: båda köerna prövade genom kvalitetsfiltret

Prövningarna är härledda ur mätningarna och skrivna i granskningsloggen.
Passet har inte godkänt och inte avvisat någonting — besluten är kvar hos
en människa, och sammanslagningen av den här grenen likaså.

Grinden läser data/provningar.json från main, så etikettbesluten fungerar
först när det här är inne.

Arkivraden står som oprövad: arkivkontrollen öppnar drygt tolvhundra
ögonblicksbilder och tar timmar, och hör därför inte hemma i ett
schemalagt pass. Den körs för sig.
EOF
git -C "$VALFLASK" push -q --force-with-lease origin "HEAD:$GREN"
echo "  Pushad: $GREN"
