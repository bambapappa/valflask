# Migrering till lansering (HV5) — runbook

Den här filen beskriver hur Handlingsvågen går live, och exakt var gränsen
går mellan *förberett* och *själva sammanslagningen*. Allt nedanför rubriken
"Förberett" är gjort och ligger bakom privatgrinden. Allt under "Kvar — kräver
ditt go" är medvetet **inte** gjort: det är stegen som gör något publikt, och
de kräver ditt uttryckliga go (spec §8, kärnprincipen om privatgrinden).

Topologi (b-0017 + b-0021 + b-0024): Handlingsvågen driftsätts som en **egen**
statisk sajt bakom Cloudflare på **subdomänen `handlingsvagen.utlovat.se`**
(b-0021 valde subdomän före sökväg — ingen Worker behövs; b-0024 satte adressen
till det nya namnet). Den byggs aldrig in i Fläskvågens repo eller bygge.
Granskningsflödet speglas till valflask först vid lansering.

**Värden är GitHub Pages, inte Cloudflare Pages (b-0024).** Repot öppnas vid
lanseringen, och då fungerar GitHub Pages gratis precis som för Fläskvågen — en
CNAME-post bakom Cloudflare, ingenting annat. Det tidigare valet av Cloudflare
Pages Direct Upload fanns bara därför att GitHub Pages från ett privat repo
kräver betalplan; med ett öppnat repo faller skälet bort och med det ett andra
Pages-projekt, två API-hemligheter och en andra driftsättningsväg. **Öppnandet
sker vid lanseringen, inte före** — privatgrinden nedan gäller oförändrad
till dess.

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

1. **Verifiera arkivkopiorna.** *(Körd 2026-07-27: 91 dokument skördade, 28
   verifierade ord för ord. Resten bär inte citatet och lämnas utan arkivlänk —
   ärligt, enligt kärnprincipen. Kör om workflown om du vill leta bättre
   ögonblicksbilder innan lansering.)* Kör `arkiv`-workflown (Actions → arkiv) tills de
   vägda dokumenten har verifierade arkivkopior. Granska `data/arkiv.json`:
   `verifierad: true` betyder att citatet stod ord för ord i ögonblicksbilden.
   Poster med `verifierad: false` bär inte citatet — leta bättre ögonblicksbild
   eller lämna arkivlänken tom (ärligt). Voteringskopplingar arkiveras via
   betänkandet — den vägen byggs när betänkandelänkarna behövs.
2. **Validera bygget.** *(Körd 2026-07-29 på `main`: grön, körning 30491901476 —
   pipeline-tester, typkontroll, sajtens grindar och `astro build`. Ingenting
   publikt rördes. Kör om efter varje dataändring.)* Kör `hv-pages` (Actions)
   med `deploy=false`. Grönt = sajten är driftsättningsbar.
3. **Öppna repot.** Settings → General → Danger Zone → Change visibility →
   Public. Historiken kontrollerades 2026-07-29 och är ren — inga nycklar,
   tokens eller certifikat i något av repots 572 objekt. Görs om kontrollen
   är gammal: skanna om innan du öppnar. **Detta är samma grind som steg 5 —
   från och med nu är metoden och beslutsloggen offentliga.**
4. **Slå på GitHub Pages.** Settings → Pages → Source: GitHub Actions. Sätt
   custom domain **`handlingsvagen.utlovat.se`**. Lägg posten i
   `utlovat.se`-zonen i Cloudflare: CNAME `handlingsvagen` →
   `bambapappa.github.io`.

   **Sätt posten på DNS-only (grått moln) först.** Med proxyn påslagen
   svarar Cloudflare i GitHubs ställe, och GitHubs certifikatutfärdande —
   som validerar över HTTP — kan då fastna så att "Enforce HTTPS" aldrig går
   att kryssa. Vänta på certifikatet, kryssa Enforce HTTPS, och slå
   **därefter** på proxyn (orange moln) så sajten ligger bakom Cloudflare som
   Fläskvågen gör.
5. **Släpp privatgrinden.** Ta bort `<meta name="robots" content="noindex" />`
   i `site/src/layouts/Layout.astro`. **Detta är den punkt där sajten blir
   avsedd för publik indexering — gör det först när allt annat är klart och du
   gett go.**
6. **Driftsätt och verifiera subdomänen.** Kör `hv-pages`. Sajten byggs och
   publiceras av GitHub Pages; `handlingsvagen.utlovat.se` ska svara över
   HTTPS med giltigt certifikat. Först nu är sajten live.
7. **Spegla granskningsflödet till valflask.** Koppling-issue-flödet
   (`koppling-sync.yml`, `koppling-review.yml`) ligger i detta repo och kan
   flyttas/speglas till valflask (skripten läser `GITHUB_REPOSITORY`). Behåll
   det här eller flytta — ditt val; inget behöver ligga i valflask före HV5.
8. **Verifiera live.** Gå igenom rutnätet, en partisida, en ledamotssida,
   detaljpanelen med arkivlänk, sök och filter på `handlingsvagen.utlovat.se`.

## Vad den här förberedelsen medvetet INTE gjort

Inget publikt: `noindex` sitter kvar, repot är fortfarande privat, ingen deploy
är körd, subdomänen är inte uppsatt, och granskningsflödet är inte speglat till
valflask. Det är själva sammanslagningen — den väntar på ditt go.

Arkivskörden och byggvalideringen är däremot körda (steg 1 och 2 ovan) — båda
rör bara detta privata repo och kunde därför göras i förväg.
