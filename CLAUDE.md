# Projektminne för drygast.nu / valflask

Regler som gäller allt arbete i det här repot — chat, issuekommentarer,
commit-texter, PR-texter, sajtcopy, prompter och dokumentation.

## Vad drygast.nu är

En granskningssajt inför valet 2026 som granskar partierna öppet och
spårbart. Tjänsten består av tre vågor:

- **Fläskvågen** — vad partiernas löften kostar. Varje löfte har ett
  ordagrant citat med källa och arkivkopia, ett kostnadsestimat med spann
  och en öppet redovisad uträkning. Summan för mandatperioden jämförs med
  regeringens reformbudget (finansieringsgapet).
- **Frågevågen** — var partierna står i tio sakfrågor, cell för cell,
  belagt med exakta citat. Saknas rent citat lämnas cellen tom.
- **Handlingsvågen** — håller de vad de lovar? Väger partiernas och
  ledamöternas faktiska riksdagshandlingar mot löftena och ståndpunkterna.
  Utvecklas i systerrepot `bambapappa/handlingsvagen` och driftsätts på
  `handlingsvagen.drygast.nu`. **Privat tills ägaren släpper den** — den
  byggs medvetet inte in i det här repot, just för att skydda den grinden.
  Sammanslagning kan omvärderas efter lansering.

Det här repot (`valflask`) rymmer Fläskvågen och Frågevågen. Data lever i
`data/promises.json` (löften), `data/changelog.json` (körlogg med
`data_hash`), `data/rattelser.json` (offentlig rättelselogg) och
`data/needs_review.json` (granskningskö). Pipelinen i `pipeline/`
extraherar, grindar (G1–G5), verifierar och uppskattar kostnad; sajten i
`site/` byggs med Astro. Inget LLM-estimat publiceras utan att en
människa godkänt det.

Tonen är torr och saklig — humorn ligger i siffrornas storlek, aldrig i
att håna ett parti eller en person.

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
  projektet. Interna grindkoder (G-serien, R-regler, b-nummer) får aldrig
  synas i text som möter läsare — de säger ingen utomstående något;
  skriv i stället vad som faktiskt sker ("citatet kontrolleras ord för
  ord", "en människa godkänner varje belopp").

## Parallella sessioner

Flera Claude-sessioner kan arbeta i repot samtidigt. Bindande:
`main` är samlingspunkten och `HANDOFF.md` är anslagstavlan — läs
versionen på `origin/main` innan nytt arbete, gör anspråk under
"Pågår just nu" före start, skörda aldrig parallellt. Fullständiga
regler i HANDOFF.md §9 "Samarbete mellan parallella sessioner".

## Kärnprinciper (fastställda genom mänskligt beslut)

- **Tomma celler är ärliga.** Hitta aldrig på svar för att fylla täckning.
  Ett parti utan rent, exakt citat genom grindarna lämnas tomt.
- **Citatgrindarna lossas aldrig.** Räcker inte citatet: leta bättre citat
  eller formulera om frågan — sänk aldrig kravet på exakt återgivning.
- **Tyst rättelse är förbjuden.** Fel rättas synligt: rättelsenot på
  berörd sida plus post i `data/rattelser.json`.
- **Krönikor är ögonblicksbilder.** Rättas en krönika ska beloppen räknas
  om från datat som gällde när den genererades — inte från dagens siffror.
- **Arkivlänkar måste bära citatet.** En arkivkopia accepteras bara om
  citatet står ordagrant i själva ögonblicksbilden.

## Vad ett kostnadsestimat ska prissätta

Beloppet avser **statens verkliga nya nettokostnad för själva åtgärden** —
inte politikens samhällsföljder. Reglerna nedan är fastställda genom
mänskligt beslut och finns även kodade i `pipeline/prompts/A5-cost.md`:

- **Lagar, förbud, avregleringar och marknadsåtgärder → 0.** Löftet hålls
  av lagändringen, vars direkta kostnad är försumbar. En prissänkning för
  konsumenter, en vinst som "återtas", en utebliven exportintäkt eller en
  skatt byggd för att avskaffa sitt eget underlag är en överföring eller
  en följd — inte en statlig utgift. Skriv i noten att beloppet avser
  åtgärden, inte följderna.
- **Utrednings- och planlöften → 0.** Är löftet att tillsätta en utredning
  eller ta fram en handlingsplan prissätts utredningen (försumbar) — inte
  den politik den kan leda till. Ett litet löfte är ändå ett löfte.
- **Netto, inte brutto.** Att staten tar över en utgift som redan betalas
  (t.ex. av kommunerna) är omfördelning, inte ny kostnad. Prissätt bara
  den marginella nettoförändringen.
- **Väg in beteende och utnyttjande.** Alla tar inte del (utnyttjandegrad),
  skatter ändrar beteende (kapitalflykt, skatteplanering) och inom
  subventioner och högkostnadsskydd betalar staten ofta bara den
  marginella delen ovanför egenavgiften.
- **Breda uppräkningslöften → 0.** En önskelista över flera politikområden
  utan konkret åtagande prissätts inte — delarna ligger redan på partiets
  specifika löften och får inte dubbelräknas.
- **Samma politik ska kosta lika.** Prissätts samma åtgärd hos flera
  partier ska beloppen harmoniseras och vila på samma grund. Samma politik
  hos olika partier är ett delat löfte (`group_id`, räknas en gång, R3);
  samma parti som upprepar sig är en dubblett och dras tillbaka.
- **Fyra kostnadstyper:** `utgift`, `intäktsminskning` (sänkt skatt),
  `besparing` (minskade utgifter) och `intäktsökning` (ny/höjd skatt som
  ger staten pengar). Blanda aldrig ihop de två sista med varandra.
- **Uträkningen är offentlig.** Fältet `calculation` visar stegen bakom
  beloppet, både i granskning och publikt. Hitta aldrig på myndighets-
  siffror — visa antagandena öppet i stället.

## Arbetssätt vid dataändringar

- Varje ändrat löfte får en **egen `history`-post** som beskriver vad som
  ändrades och varför.
- Mönstret är **två commits**: först dataändringen med platshållaren
  `"commit": "0000000"`, sedan en commit som backfillar den riktiga
  hashen och räknar om `data_hash`.
- **`data_hash` i sista changelog-posten måste alltid matcha**
  `computeDataHash(promises.json)`. Verifiera efter varje ändring.
- **Rättelser samlas.** En systematisk kvalitetshöjning eller en
  genomgång blir *en* post i `data/rattelser.json` — inte en per löfte.
  Enskilda felrättelser får däremot en egen post.
- Kör `pnpm test` och `tsc --noEmit` i `pipeline/` före push. Ändrad
  klientkod i `site/src/scripts/` kräver ombyggd `site/public/kombinator.js`.
