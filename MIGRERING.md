# Migrering till lansering (HV5) — runbook

Den här filen beskriver hur Handlingsvågen går live, och exakt var gränsen
går mellan *förberett* och *själva sammanslagningen*. Allt nedanför rubriken
"Förberett" är gjort och ligger bakom privatgrinden. Allt under "Kvar — kräver
ditt go" är medvetet **inte** gjort: det är stegen som gör något publikt, och
de kräver ditt uttryckliga go (spec §8, kärnprincipen om privatgrinden).

Topologi (b-0017): Handlingsvågen driftsätts som en **egen** statisk Pages-sajt
bakom Cloudflare på `drygast.nu/handlingsvagen` — den byggs aldrig in i
Fläskvågens repo eller bygge. Granskningsflödet speglas till valflask först vid
lansering.

## HV5-checklistan (spec §8) — status

| Punkt | Status | Var |
|---|---|---|
| Metodsidan skriven i språk alla förstår | **Klar** | `site/src/pages/metod.astro` |
| Neutralitetskontraktet publicerbart | **Klar** | `site/src/pages/neutralitet.astro` (spec §7) |
| Beslutsloggen publicerbar | **Klar** | `data/beslutslogg.json` (blir publik när repot blir publikt) |
| Symmetritestet redovisat | **Klar** | `pipeline/tests/symmetri.test.ts`, b-0020 |
| Rättelseväg på plats | **Klar** | `site/src/pages/rattelser.astro`, `Rattelsenot.astro`, `data/rattelser.json` |
| Arkivkopior verifierade | **Skript + workflow klara, körning återstår** | `pipeline/scripts/arkiv.mts`, `.github/workflows/arkiv.yml` (0/16 körda) |
| Ägarens uttryckliga go | **Ditt** | — |

## Förberett (gjort, bakom privatgrinden)

- **Sajten** (HV4): rutnätet, partisidor, ledamotssidor, metod, neutralitet,
  rättelser, sök och filter. Bär `noindex` tills grinden släpps. Bygger rent
  (`npm run build` i `site/`, alla grindar gröna).
- **Arkivväg**: `arkiv.mts` hämtar en arkivögonblicksbild per vägt dokument och
  kontrollerar att citatet står ord för ord i kopian (kärnprincipen). En kopia
  som inte bär citatet accepteras aldrig. `arkiv.yml` kör det på GitHubs runners
  (fritt utnät) och committar bara `data/arkiv.json`. Sajten slår in verifierade
  arkivlänkar automatiskt.
- **Deploy-workflow**: `hv-pages.yml` bygger och testar sajten på begäran. Ingen
  push-utlösare; deploy-steget körs bara vid `deploy=true`. Ett vanligt anrop
  rör inget publikt.
- **Rättelseväg**: tom men redo. En rättelse = post i `data/rattelser.json`
  (`affects` = sökväg eller löftes-id) → not syns automatiskt på berörd sida och
  i rättelseloggen.
- **Symmetritest**: en grind som fälls om domsmotorn någonsin blir asymmetrisk
  mellan blocken.

## Kvar — kräver ditt go (själva sammanslagningen)

Gör dessa i ordning. Fram till steg 4 är ingenting publikt.

1. **Verifiera arkivkopiorna.** Kör `arkiv`-workflown (Actions → arkiv) tills de
   vägda dokumenten har verifierade arkivkopior. Granska `data/arkiv.json`:
   `verifierad: true` betyder att citatet stod ord för ord i ögonblicksbilden.
   Poster med `verifierad: false` bär inte citatet — leta bättre ögonblicksbild
   eller lämna arkivlänken tom (ärligt). Voteringskopplingar arkiveras via
   betänkandet — den vägen byggs när betänkandelänkarna behövs.
2. **Validera bygget.** Kör `hv-pages` (Actions) med `deploy=false`. Grönt =
   sajten är driftsättningsbar.
3. **Sätt upp Cloudflare-projektet.** Skapa ett Pages-projekt för Handlingsvågen
   och lägg `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` som GitHub Secrets
   (och `CLOUDFLARE_HV_PROJECT_NAME` som variabel om projektet inte heter
   `handlingsvagen`).
4. **Släpp privatgrinden.** Ta bort `<meta name="robots" content="noindex" />`
   i `site/src/layouts/Layout.astro`. **Detta är den punkt där sajten blir
   avsedd för publik indexering — gör det först när allt annat är klart och du
   gett go.**
5. **Driftsätt.** Kör `hv-pages` med `deploy=true`. Filerna landar i
   CF-projektet.
6. **Peka routningen.** Ställ Cloudflare så att `drygast.nu/handlingsvagen`
   serverar HV-projektet. Först nu är sajten live.
7. **Spegla granskningsflödet till valflask.** Koppling-issue-flödet
   (`koppling-sync.yml`, `koppling-review.yml`) ligger i detta repo och kan
   flyttas/speglas till valflask (skripten läser `GITHUB_REPOSITORY`). Behåll
   det här eller flytta — ditt val; inget behöver ligga i valflask före HV5.
8. **Verifiera live.** Gå igenom rutnätet, en partisida, en ledamotssida,
   detaljpanelen med arkivlänk, sök och filter på `drygast.nu/handlingsvagen`.

## Vad den här förberedelsen medvetet INTE gjort

Inget publikt: `noindex` sitter kvar, ingen deploy är körd, Cloudflare-routningen
är orörd, och granskningsflödet är inte speglat till valflask. Arkivskörden är
byggd men inte körd. Det är själva sammanslagningen — den väntar på ditt go.
