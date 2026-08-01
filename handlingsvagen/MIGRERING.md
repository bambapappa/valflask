# Migrering till lansering (HV5) — runbook

Den här filen beskriver hur Handlingsvågen går live, och exakt var gränsen
går mellan *förberett* och *själva sammanslagningen*. Allt nedanför rubriken
"Förberett" är gjort och ligger bakom privatgrinden. Allt under "Kvar — kräver
ditt go" är medvetet **inte** gjort: det är stegen som gör något publikt, och
de kräver ditt uttryckliga go (spec §8, kärnprincipen om privatgrinden).

Topologi (b-0017 + b-0024 + **b-0025**): Handlingsvågen ligger på **sökvägen
`utlovat.se/handlingsvagen`**, serverad av GitHub Pages bakom Cloudflares proxy
— samma bygge och samma domän som Fläskvågen. `b-0025` ersätter `b-0021`:s
subdomän och återgår till `b-0017`:s ursprungliga sökväg.

**Följden är att sammanslagningen är lanseringen.** GitHub Pages tillåter en
custom-domän per repo, så en sökväg kräver att vågorna bor i ett repo; med två
repon skulle den kräva en Cloudflare Worker, vilket `b-0021` avvisade och
`b-0025` inte återinför. Det finns därför **ingen egen subdomän, inget eget
Pages-projekt och ingen egen deploy** för Handlingsvågen längre. Runbooken för
själva sammanslagningen är `SAMMANSLAGNING.md`; den här filen täcker
förberedelserna fram till den.

**Värden är GitHub Pages, inte Cloudflare Pages (b-0024).** Cloudflare Pages
fanns i planen bara därför att GitHub Pages från ett privat repo kräver
betalplan.

**Följdändring 2026-07-31 (b-0027): det här repot behöver aldrig bli publikt.**
b-0024 utgick från att Handlingsvågen skulle serveras HÄRIFRÅN, och då krävdes
öppnandet. Med sökvägen och sammanslagningen (b-0025, b-0026) flyttar koden i
stället in i `valflask`, som redan är publikt — och då finns det inget kvar för
det här repot att göra. Det arkiveras privat vid lanseringen. Privatgrinden
gäller oförändrad fram till dess.

## HV5-checklistan (spec §8) — status

| Punkt | Status | Var |
|---|---|---|
| Metodsidan skriven i språk alla förstår | **Klar** | `site/src/pages/metod.astro` |
| Neutralitetskontraktet publicerbart | **Klar** | `site/src/pages/neutralitet.astro` (spec §7) |
| Beslutsloggen publicerbar | **Klar** | `data/beslutslogg.json` (blir publik när trädet flyttar in i valflask) |
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
3. **Sammanslagningen — och den ÄR lanseringen (b-0025).** Härifrån gäller
   `SAMMANSLAGNING.md`, inte den här filen.

   Skälet: Handlingsvågen ska ligga på **sökvägen**
   `utlovat.se/handlingsvagen`, och GitHub Pages tillåter bara en
   custom-domän per repo. Sökvägen är alltså gratis först när vågorna bor i
   ett repo; med två repon skulle den kräva en Cloudflare Worker, vilket
   `b-0021` avvisade och `b-0025` inte återinför.

   Därför finns **ingen egen subdomän att sätta upp**, inget eget
   Pages-projekt och ingen egen deploy för Handlingsvågen. Sajtens basstig är
   redan satt till `/handlingsvagen` och prövad (bygget grönt på 440 sidor,
   alla grindar gröna). Det som återstår är att slå ihop repona och publicera
   det sammanslagna trädet — steg 1–4 i `SAMMANSLAGNING.md`, där steg 4 är
   den publika handlingen och kräver ditt go.

   Privatgrinden håller ända dit: repot är privat och `noindex` sitter kvar
   till och med steg 4. **Läs "Var arbetet får ske" i `SAMMANSLAGNING.md`
   först** — en gren i publikt `valflask` är publik, så förberedelsearbetet
   får inte pushas dit.
4. **Granskningsflödet behöver inte flyttas.** Koppling-issue-flödet
   (`koppling-sync.yml`, `koppling-review.yml`) läser `GITHUB_REPOSITORY` och
   följer därför med av sig självt när trädet slås ihop. Det som tidigare stod
   här — att flödet skulle speglas till valflask vid lansering — utgår med
   `b-0025`: efter sammanslagningen finns bara ett repo att ligga i.
5. **Verifiera live.** Gå igenom rutnätet, en partisida, en ledamotssida,
   detaljpanelen med arkivlänk, sök och filter — på
   `utlovat.se/handlingsvagen`.

## Vad den här förberedelsen medvetet INTE gjort

Inget publikt: `noindex` sitter kvar, repot är fortfarande privat, och
ingenting är driftsatt. Det är själva sammanslagningen som är lanseringen, och
den väntar på ditt go.

Körda i förväg, eftersom de bara rör detta privata repo: arkivskörden,
byggvalideringen, och basstigen `/handlingsvagen` med alla grindar gröna mot
den slutliga adressformen.
