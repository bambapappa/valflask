# Projektminne för utlovat.se / valflask

Regler som gäller allt arbete i det här repot — chat, issuekommentarer,
commit-texter, PR-texter, sajtcopy, prompter och dokumentation.

## Vad utlovat.se är

En granskningssajt inför valet 2026 som granskar partierna öppet och
spårbart. Tjänsten består av tre vågar:

- **Fläskvågen** — vad partiernas löften kostar. Varje löfte har ett
  ordagrant citat med källa och arkivkopia, ett kostnadsestimat med spann
  och en öppet redovisad uträkning. Summan för mandatperioden jämförs med
  regeringens reformbudget (finansieringsgapet).
- **Frågevågen** — var partierna står i tio sakfrågor, cell för cell,
  belagt med exakta citat. Saknas rent citat lämnas cellen tom.
- **Handlingsvågen** — håller de vad de lovar? Väger partiernas och
  ledamöternas faktiska riksdagshandlingar mot löftena och ståndpunkterna.
  Ligger under `handlingsvagen/` i det här repot och på sökvägen
  `utlovat.se/handlingsvagen` — samma bygge och samma domän som de andra
  två vågarna. Har egen `HANDOFF.md`, egen spec och egen beslutslogg;
  läs dem innan du rör något där.

Repot rymmer alla tre vågarna. Fläskvågens och Frågevågens data lever i
`data/promises.json` (löften), `data/changelog.json` (körlogg med
`data_hash`), `data/rattelser.json` (offentlig rättelselogg) och
`data/needs_review.json` (granskningskö); Handlingsvågens ligger under
`handlingsvagen/data/`. Pipelinen i `pipeline/` extraherar, grindar
(G1–G5), verifierar och uppskattar kostnad; sajten i `site/` byggs med
Astro, och Handlingsvågens sajt byggs i samma körning och läggs under
`/handlingsvagen`. Inget LLM-estimat publiceras utan att en människa
godkänt det, och ingen koppling mellan löfte och handling heller.

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
- **Pluralen är "vågar", aldrig "vågor".** En våg man surfar på blir vågor;
  en våg man väger på blir vågar, och det är den betydelsen Fläskvågen,
  Frågevågen och Handlingsvågen bär. Sammansättningar där ordet betyder
  rörelse — "brottsvågor" i Handlingsvågens ordlistor — är rätt stavade och
  rörs inte.
- **De två orden ovan är grindade, inte påminda.** `pnpm test:ord` sveper
  hela repot och faller på båda. Regeln stod skriven om "ägarbeslut" i mer
  än en månad medan ordet levde kvar på ett trettiotal ställen, ett av dem i
  `data/issues.json` som serveras publikt — en språkregel utan grind är en
  påminnelse, och påminnelser åldras. Ska ett ord till förbjudas: lägg det i
  `ORDEN` i `site/scripts/test-ord.mts`, med rader som ska fällas och rader
  som ska passera. Mänskligt beslut 2026-08-10.

## Parallella sessioner

Flera Claude-sessioner kan arbeta i repot samtidigt. Bindande:
`main` är samlingspunkten och anslagstavlan ligger i `handoff`-repot
(`projekt/utlovat/HANDOFF.md`) — läs den innan nytt arbete, gör anspråk
under "Pågår just nu" före start, skörda aldrig parallellt. Fullständiga regler i `handoff`-repot, `AGENTS.md`.

## Att avsluta ett större spår

**Öppna PR:en utan att fråga om lov.** Ett färdigt större spår — en session
i omräkningsplanen eller ett motsvarande avslutat arbete — avslutas med
uppdaterad `HANDOFF.md`, pushad gren och **öppnad PR mot `main`**. Det är
ett stående mänskligt beslut (2026-07-28): vänta inte på klartecken för
själva PR:en, och avsluta inte ett spår utan att öppna den. Behörigheten
gäller att öppna PR:en — att slå ihop den med `main` är fortfarande en
människas beslut.

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
- **Prosan påstår inget om koden som inte mäts.** Skriver du en mening på
  metod-, om-, press-, api- eller neutralitetssidan som säger vad koden eller
  datat gör, ska den bära ett ankare i `site/src/lib/prosans-ankare.ts` — med
  meningen ord för ord, ett prov som mäter det koden faktiskt gör, och ett
  `fallprov` som säger vilket infört fel som fäller provet. Grinden
  `pnpm test:prosan` kräver dessutom att varje prov faller mot ett blänkt repo:
  ett prov som svarar ja utan att få läsa något mäter ingenting. **Provet ska
  mäta undantaget prosan inte nämner** — det var de nio modellskrivna
  vikt-raderna som gjorde «samma belopp ger ordagrant samma rad» osann, och
  ingen grind såg det. Går en mening inte att mäta ska den inte påstå mer än
  den bär: skärp prosan hellre än klassa den som omätbar. Mänskligt beslut
  2026-08-09.

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
- **Partiets egen siffra gäller.** Anger partiet själv ett belopp i löftet
  — hela reformens kostnad, en nivå per person eller per månad, en andel —
  är det den siffran som räknas. Byt aldrig ut den mot en egen. Är siffran
  ett styckepris byggs uträkningen på den och bara antalet mottagare
  uppskattas; skriv då ut vilken del som är partiets och vilken som är vår.
  Ett löfte som bär en egen siffra är aldrig ett inriktningslöfte — det ska
  prissättas, inte nollas.
- **Utpekad åtgärd utan nivå prissätts som åtgärden senast kostade.** Pekar
  löftet ut en bestämd åtgärd men säger inte hur mycket ("höja barnbidraget",
  "en historisk höjning av garantipensionen") ankras beloppet i vad samma
  åtgärd senast faktiskt kostade — den senast genomförda höjningen av samma
  förmån, det befintliga statsbidragets storlek. Skriv ut vilken höjning
  ankaret är. Ett värdeord ("rejält", "historisk", "kraftigt") är ingen nivå
  och får aldrig översättas till en siffra, och ett annat partis angivna nivå
  får aldrig lånas in som basbelopp utan att lånet står utskrivet.
  Osäkerheten hör hemma i spannet, inte i basbeloppet. Nollningsregeln gäller
  bara löften som varken pekar ut en åtgärd eller anger en nivå.
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

## Överlämningen ligger inte här

Anslagstavlan, lanseringsplanerna och driftanteckningarna ligger i det
privata repot `bambapappa/handoff` under `projekt/utlovat/`. Ska du ta vid
i arbetet: börja där, med `AGENTS.md` och `projekt/utlovat/HANDOFF.md`.
Skriv inte en ny överlämning här.
