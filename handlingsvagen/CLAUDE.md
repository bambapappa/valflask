# Projektminne för drygast.nu / valflask

Regler som gäller allt arbete i det här repot — chat, issuekommentarer,
commit-texter, PR-texter, sajtcopy, prompter och dokumentation.

## Språkregler

- **Ordet "verbatim" är förbjudet.** Skriv "ordagrant", "exakt citat" eller
  "ord för ord" i stället. Det gäller överallt: chatt, issues, commits,
  PR-texter, sajtens texter, prompter, dokumentation.
  - Enda undantaget är det latinska citatet "verbatim et litteratim",
    återgivet som citat.
  - Befintliga kodidentifierare (t.ex. `normalizeForVerbatim`) får finnas
    kvar, men ny prosa och nya namn ska undvika ordet.
- Skriv språk som alla förstår. Ingen teknisk jargong i texter som riktar
  sig till läsare, partier eller journalister.
- **Skriv "mänskligt beslut", aldrig "ägarbeslut".** Gäller all text i
  projektet. Interna grindkoder (H1–H6, G-serien, b-nummer) får aldrig
  synas i text som möter läsare — de säger ingen utomstående något;
  skriv i stället vad som faktiskt sker ("citatet kontrolleras ord för
  ord", "en människa godkänner varje koppling").
- **Pluralen är "vågar", aldrig "vågor".** En våg man väger på blir vågar.
  Undantaget är ord där betydelsen verkligen är rörelse — "brottsvågor" i
  ordlistorna under `data/nyckelord/` är rätt stavat och rörs inte.
- **De två orden ovan är grindade.** `pnpm test:ord` i `site/` sveper hela
  repot, det här trädet inräknat, och faller på båda. Bakgrunden och hur man
  lägger till ett ord står i `site/scripts/test-ord.mts`.

## Parallella sessioner

Flera Claude-sessioner kan arbeta i repot samtidigt. Bindande:
`main` är samlingspunkten och anslagstavlan ligger i `handoff`-repot
(`projekt/utlovat/HANDOFF.md`) — läs den innan nytt arbete, gör anspråk
under "Pågår just nu" före start, skörda aldrig parallellt. Fullständiga regler i `handoff`-repot, `AGENTS.md`.

## Kärnprinciper (fastställda genom mänskligt beslut)

- **Tomma celler är ärliga.** Hitta aldrig på svar för att fylla täckning.
  Ett parti utan rent, exakt citat genom grindarna lämnas tomt.
- **Citatgrindarna lossas aldrig.** Räcker inte citatet: leta bättre citat
  eller formulera om frågan — sänk aldrig kravet på exakt återgivning.
- **Tyst rättelse är förbjuden.** Fel rättas synligt: rättelsenot på
  berörd sida plus post i `data/rattelser.json`.
- **Krönikor: texten är statisk, talen dynamiska.** Redogörelsen — vad
  veckan handlade om och hur vi såg på den — skrivs aldrig om; det vore att
  skriva om historien. Summor, gap och antal är däremot påståenden om datat
  och slås upp mot dagens siffror när sidan byggs. Talen skrivs därför som
  platshållare i krönikans text, aldrig som siffror (se
  `pipeline/src/kronikans-tal.ts`). Mänskligt beslut 2026-08-09, som ersätter
  den tidigare regeln att en krönika är en ögonblicksbild vars belopp räknas
  om ur datat som gällde när den skrevs. Den regeln gav antingen en
  rättelsepost per krönika för varje rättad siffra någon annanstans, eller
  krönikor som tyst blev osanna. **Är redogörelsen fel gäller
  rättelseregeln fortfarande** — det är ett fel i texten.
- **Arkivlänkar måste bära citatet.** En arkivkopia accepteras bara om
  citatet står ordagrant i själva ögonblicksbilden.
- **Prosan påstår inget om koden som inte mäts.** Gäller Handlingsvågens
  metodsida och neutralitetskontraktet lika mycket som Fläskvågens sidor: en
  mening om vad koden eller registret gör ska bära ett ankare i
  `site/src/lib/prosans-ankare.ts`, med meningen ord för ord, ett prov och ett
  `fallprov`. Grinden är `pnpm test:prosan` i `site/`. Talen på metodsidan slås
  redan upp vid bygget (`metodtal.ts`) — skriv aldrig in en siffra om registret
  i texten, den blir en tyst osanning. Mänskligt beslut 2026-08-09.

## Överlämningen ligger inte här

Anslagstavlan, lanseringsplanerna och driftanteckningarna ligger i det
privata repot `bambapappa/handoff` under `projekt/utlovat/`. Ska du ta vid
i arbetet: börja där, med `AGENTS.md` och `projekt/utlovat/HANDOFF.md`.
Skriv inte en ny överlämning här.
