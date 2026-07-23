# Överlämning — kostnadsestimat & kvalitet (valflask)

Skriven 2026-07-23. Läs `CLAUDE.md` först (bindande språkregler och
kärnprinciper). Den här handoffen gäller arbetsflödet kring
**kostnadsestimaten** och deras spårbarhet — inte hela valflask.

## Pågår just nu — VÄNTAR PÅ CI

**En skarp fullkörning av uträknings-backfillen ligger i GitHub Actions.**

- Workflow: `calculation-backfill.yml`, run-id **30011446295** (Actions-fliken).
  Startad 2026-07-23 ~13:29 UTC med `all=true, dry_run=false, factor=1.5, seed=1`.
- Modellen (`deepseek/deepseek-v4-pro`) är seg, ~36 s/anrop → **~3–4 h**.
- När den är klar **committar den direkt till `main`** (workflowen har
  pull-rebase-retry mot samtidiga pipeline-pushar):
  - ~180 löften får ett `cost.calculation` **utan att beloppet ändras**
    (den "nära"-grenen), märkt *"Rekonstruerad i efterhand …"*.
  - ~180 hamnar i **`data/calculation_review.json`** (avvikande estimat,
    orörda löften) för mänsklig genomgång.
  - **EN** samlad rättelsepost skrivs i `data/rattelser.json`
    (sentinel "systematisk kvalitetshöjning", idempotent).

### Nästa steg för den som tar vid
1. Kontrollera att run 30011446295 är `completed/success` (annars läs loggen;
   vanligaste felet är modell-timeouts → posterna hamnar som SKIP och kan
   köras igen, skriptet är idempotent).
2. **Gå igenom `data/calculation_review.json` tillsammans med ägaren** — de
   avvikande estimaten (publicerat belopp vs nytt). Besluta per fall:
   behåll gamla, eller justera beloppet. Flera avvikelser avslöjar skeva
   gamla siffror (10-urvalet visade t.ex. strandskydd p-2026-0162 500 → 5).
   **Viktigt (beslutat med ägaren):** dessa justeringar ska INTE ge en rättelsepost
   var — de ryms under den enda samlade posten ovan. Uppdatera bara
   `promises.json` + changelog (belopp + ev. `calculation`), inte
   `rattelser.json`.
3. Kör resten skarpt igen vid behov (idempotent — hoppar löften som redan
   har `calculation`).

## Verktygen (allt mergat i `main`)

- **Grannkontroll** (`pipeline/src/similarity.ts` → `findComparableCosts`):
  nya estimat ankras mot jämförbara publicerade löften (samma kategori,
  böjningstålig likhet). Injiceras i `A5-cost.md`-prompten av
  `estimateCost` (`pipeline/src/cost.ts`).
- **Avvikelseflagg** (`cost.ts` → `costDeviation`): markerar i review-raden
  när ett estimat avviker ≥ 3× från grannarnas median. Ändrar aldrig belopp.
- **Öppen uträkning** (`cost.calculation`, valfritt fält i schemat): varje
  nytt estimat får en stegvis uträkning som visas publikt på löftessidan
  ("Så räknades beloppet ut") och i `pnpm review list`. Skrivs granskaren
  om beloppet tappas uträkningen (den gällde ett annat tal).
- **Backfill** (`pipeline/scripts/calculation-backfill.mts`,
  `pnpm calc:backfill`): flaggor `--sample=N` / `--all`, `--dry-run`,
  `--seed`, `--factor` (nära-tröskel), `--stub` (lokal logiktest utan nyckel).
  Triage: nytt belopp nära det publicerade → fäst uträkning, behåll belopp;
  avviker → till `calculation_review.json`. Körs via `calculation-backfill.yml`
  (manuell start, dry-run som default, rapport som artifact, `OPENROUTER_API_KEY`).

## Vad som redan gjorts denna omgång (allt mergat)

- **p-2026-0470** rättat till 0 kr; **Grupp 1–2** (12 förbuds-/vinstlöften)
  nollställda; **Grupp 3** (5 straffskärpningar) och **Grupp 4** (4
  krav/regleringar) översedda — alla med rättelsepost + historik.
- **Review-kön tömd** (13 poster): 6 avvisade (dubletter + G3-grindfel),
  7 behandlade. Karensgruppen `g-slopad-karens` städad (dublett
  tillbakadragen, belopp harmoniserade, p-0326 utlyft med överlappsnot).
- Verktygen ovan (PR #430, #433, #434, #436, #438).

## Att tänka på

- **Belopp i miljoner kronor (msek).** `period` per_ar räknas ×4 i
  mandattotalen; engång räknas en gång. Kolla perioden vid harmonisering.
- **Samma politik, olika parti = två löften men grupplänkade** (delad
  `group_id`, R3 räknar gruppen en gång) och **samma belopp**. Grupplänka
  i review med `approve <index> --group p-XXXX`.
- **`data_hash`** (senaste changelog-posten) ska alltid matcha `promises.json`
  — review-CLI:t och backfill-skriptet håller det i synk; vid handpåläggning
  räkna om med `computeDataHash` (kanonisk sha256, se `pipeline/src/publish.ts`).
- **Backfillen commitar till `main`** — inte via PR. Håll utkik efter
  merge-konflikter i `changelog.json` mot samtidiga pipeline-körningar
  (behåll båda posterna, sist ska matcha `promises.json`).
- Följ språkreglerna i `CLAUDE.md` (inte "verbatim"; "mänskligt beslut"
  inte "ägarbeslut"; inga interna grindkoder i text som möter läsare).
