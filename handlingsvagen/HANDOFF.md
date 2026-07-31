# Överlämning — Handlingsvågen

Skriven 2026-07-19; senast uppdaterad 2026-07-31 (granskning i skala: 60
kopplingar avgjorda av en människa, hela beståndet reviderat mot färska
källtexter, tre fel i matchningen hittade och täppta — fel voteringspunkt,
citat ur annat partis reservation, och koppling till dokumentet löftet
självt hämtades ur). Läs `CLAUDE.md` först (bindande
språkregler och kärnprinciper), sedan `SPEC-HANDLINGSVAGEN.md` (fastställd
spec) och `NEUTRALITET.md`. Alla metodval står i `data/beslutslogg.json`.

## MÅLET: utlovat.se live senast söndag 2026-08-02 — Handlingsvågen med

Fastställt genom mänskligt beslut 2026-07-31. Handlingsvågen ska **med i
lanseringen**, inte följa efter. Två dagar från beslutet.

Eftersom sammanslagningen ÄR lanseringen (`b-0025`) går vägen genom
`SAMMANSLAGNING.md`, inte `MIGRERING.md`. Handlingsvågen hamnar på
sökvägen `utlovat.se/handlingsvagen`; det finns ingen subdomän att sätta
upp och ingen egen deploy.

**Klart och avprickat:**
- Steg 0 — sökvägen vald, basstigen satt, bygget grönt på 440 sidor.
- HV5-checklistan: metodsidan, neutralitetskontraktet, beslutsloggen,
  symmetritestet och rättelsevägen är alla klara.
- Arkivkopiorna: 79 verifierade ord för ord (var 28), och betänkandevägen
  för voteringar är byggd så att även de kan arkiveras.

**Stegen 1 och 2 är GJORDA (2026-07-31)**, tillsammans med hela namnbytet,
på grenen `claude/lansering-utlovat-emtbcq` **i det här privata repot**.
Grenen bär det sammanslagna trädet: Fläskvågen och Frågevågen i roten,
Handlingsvågen under `handlingsvagen/`, båda historikerna kvar. Alla
grindar körda i det sammanslagna trädet — 305 + 139 pipelinetester, båda
typkontrollerna rena, båda sajterna byggda, citatgrindens fingeravtryck
oförändrat. `build.yml` bygger nu båda vågorna och lägger Handlingsvågen
under `site/dist/handlingsvagen`: ett bygge, en domän, en driftsättning.

**Steg 4 (lanseringen) återstår och är en människas beslut.** Den ordnade
listan står i `LANSERING.md` under "Lanseringsdagen". Tre saker där är
lätta att missa och skulle märkas först efteråt:

- **`hej@utlovat.se` måste gå fram** innan presssidan blir publik.
- **Handlingsvågens modellnycklar och variabler måste in i `valflask`**,
  annars slutar skörd och matchning fungera i samma stund trädet flyttar.
- **Schemana här måste stängas av vid lanseringen**, annars fortsätter de
  skörda till det privata repot och datamängderna glider isär.

**Steg 3 (avdubblering) bör skjutas.** Planen tillåter uttryckligen att
två `pipeline/`- och två `site/`-träd lever sida vid sida till dess. Med
två dagar är det den del som ska vänta — citatgrindens delade källa,
temat, söket, workflowsen och beroendena. Steg 5 (arkivera HV-repot)
likaså.

**Blockerar INTE lanseringen:** de 370 ogranskade förslagen i kön och den
pågående omkörningen. Inget av det är publikt — tomma celler är ärliga,
och sajten visar bara det en människa godkänt.

**Läs "Var arbetet får ske" i `SAMMANSLAGNING.md` före steg 1.** En gren i
publika `valflask` är publik; förberedelsearbetet får inte pushas dit.

## Vad detta är

Tredje vågen för drygast.nu (systerrepo `bambapappa/valflask`, publikt):
ett register som väger partiers och ledamöters faktiska riksdagshandlingar
mot löftena (Fläskvågen) och ståndpunkterna (Frågevågen). Devisen: ord är
gratis, handlingar räknas. **Privat tills lanseringsgrinden HV5 passerats**
— ingenting härifrån får synas i valflask eller på drygast.nu före dess.

## Läget just nu (76 tester + ren typkontroll under `pipeline/`; `site/`-svit och `astro build` gröna)

- **HV0** — spec, neutralitetskontrakt, scheman, beslutslogg.
  b-0001–b-0012 är samtliga fastställda av ägaren (b-0009 och b-0011
  bekräftade 2026-07-19; b-0010/b-0012 tekniska följdbeslut).
- **HV1 — KLART, data incheckat.** Full skörd 2022/23–2025/26 ligger i
  `data/handlingar.json`: **23 629 handlingar** (13 010 motioner,
  939 propositioner, 2 628 interpellationer, 4 476 skriftliga frågor,
  2 576 voteringspunkter med röstfördelning per parti). Schemavaliderat,
  unika id:n. Voteringar hämtas EN OCH EN via `/votering/<id>` —
  `voteringlista` med stor `sz` trunkerar tyst (b-0010). Skördaren har
  retry med backoff och delsparar per block.
- **HV2 — byggt, väntar på skarpa körningar.** `src/grindar.ts` (H1–H5,
  samma citatnormalisering som valflask; H6 kan per definition inte
  passeras av kod), `src/foreslag.ts` + `prompts/koppling.md`
  (förslagssteg med deterministiskt kandidaturval, b-0011),
  `scripts/foreslag.mts` (kö: `data/kopplingsforslag.json`).
  Kräver `OPENROUTER_API_KEY` + `MODEL_KOPPLING`.
- **HV3 — motor + skript klara.** `src/domar.ts` (deterministisk,
  b-0009-reglerna), `scripts/domar.mts` (enda skrivvägen till
  `data/domar.json`), `scripts/roster.mts` (röstskörd).
- **b-0012 — kompakt röstlagring.** `data/personer.json` +
  `data/roster/<riksmöte>.json` med röststrängar (J/N/A/F/-);
  partibyten per votering i avvikelselista; `src/roster.ts`
  kodar/avkodar förlustfritt åt domsmotorn.
- **b-0013 — betänkandestöd, BYGGT.** Voteringar kopplas via
  betänkandets text: `--typ bet` skördar till eget index
  `data/betankanden.json` (nyckel = voteringens dok_id-form
  `202223:AU10`), `rankaVoteringsKandidater` rankar mot betänkandets
  titel, källtexten till modell och H2 är betänkandets, och beviset bär
  `bevis.kalla_dok_id`. Skörden är INTE körd (se nätblockering nedan).
- **H6-granskningsflödet — BYGGT.** Kön synkas till issues i DETTA
  privata repo (etikett `koppling-kö`, titel `[koppling <12 hex>]`),
  ägaren beslutar med `/godkänn`, `/godkänn --motionstyp parti`
  (b-0007) eller `/avvisa <skäl>`; `koppling-review.yml` exekverar,
  committar och stänger. Lokalt: `npm run granska -- list|godkann|avvisa`.
  OBS: överlämningen sade "issue-flödet i valflask", men HV5-grinden
  förbjuder allt synligt i valflask före lansering — därför ligger
  flödet här och speglas till valflask vid HV5 (spec §8). Vill ägaren
  annorlunda är flytten trivial (skripten läser GITHUB_REPOSITORY).

**Nätblockering i denna miljö — GÄLLER INTE LÄNGRE (kontrollerat
2026-07-31):** egressproxyn nekade tidigare data.riksdagen.se och
openrouter.ai (403, organisationspolicy). Efter att inställningarna ändrats
svarar bägge nu normalt, liksom opencode.ai och api.z.ai. Skördar och
modellanrop går alltså att köra direkt från sessionen igen — men mät själv
innan du förlitar dig på det, miljön kan vara satt annorlunda för din
session. Workflowvägen nedan fungerar oavsett och är fortsatt den som
används skarpt. **Lösningen är byggd:**
skördar och förslagskörningar går som workflows på GitHubs runners
(fritt utnät) — `skord.yml` respektive `foreslag.yml`, **schemalagda
veckovis sedan 2026-07-30** (se nedan) men går fortsatt att starta för
hand under Actions-fliken. OpenRouter-nyckeln finns som hemlighet i
valflask men hemligheter kan aldrig läsas ut ur GitHub — ägaren lägger
in den (och `MODEL_KOPPLING`-variabeln) i DETTA repo:
Settings → Secrets and variables → Actions.

**Gjort 2026-07-31 (granskning i skala + tre härdningar av matchningen):**

Allt nedan gick direkt till `main` — ingen gren, ingen PR. 60 kopplingar
avgjorda av en människa, hela beståndet reviderat, och tre fel i
matchningen hittade och täppta.

- **Granskningen.** 50 köposter lästa mot källorna: 47 godkända
  (`k-2026-0138`–`0184`), 3 avvisade. Fyra citat bytta mot starkare ur
  samma dokument. Sedan revision av SAMTLIGA 167 aktiva kopplingar mot
  färska källtexter: **inget citat hade spruckit** — alla stod
  fortfarande ordagrant i källan.
- **Metodlärdom värd att bära vidare.** Första genomläsningen gjordes på
  löftenas `title` (avhuggen) och citatet ensamt. Den bedömningen höll
  inte: vid omläsning mot hela `quote` och hela källdokumentet vände
  domen på de flesta. Flera "floskler" var ingressmeningen i partiets
  EGEN motion på precis löftets sakfråga, följd av skarpa yrkanden.
  **Läs alltid hela löftescitatet och dokumentet runt citatet.**
- **Fel 1 — fel voteringspunkt.** Prompten sade VILKEN punkt en votering
  gällde men aldrig VAD punkten beslutade. Modellen fick hela betänkandet
  och citerade sammanfattningens beskrivning av propositionen — alltså
  punkt 1:s sak — som bevis för en punkt som bara avslog motioner. Av 51
  voteringskopplingar bar 7 det felet. Fixat: punktens rubrik och
  beslutstext hämtas nu från `utskottsforslag`-ändpunkten och skickas med.
- **Fel 2 — annat partis reservation.** Ett betänkande blandar utskottets
  text, propositionens sammanfattning och flera partiers reservationer i
  samma fil. Aktörsgrinden ser vilka partier som RÖSTADE (alla), inte vem
  som SKREV stycket. `k-2026-0124` belade ett M-löfte med text ur en
  reservation av S, V och MP. Fixat med promptregel; två andra
  reservationscitat visade sig giltiga (löftets parti stod bland
  undertecknarna).
- **Fel 3 — cirkulär koppling.** 58 av 417 aktiva löften är extraherade
  ur riksdagsdokument. Kandidaturvalet uteslöt aldrig löftets EGET
  källdokument, så modellen fick det serverat och hittade en perfekt
  träff — i ett fall ordagrant identisk med löftescitatet. Kopplingen
  svarade på "höll partiet sitt löfte?" genom att peka på papperet löftet
  stod skrivet på. **Fixat deterministiskt i koden, inte med en
  promptregel** — `lofteskallaDokId()` plus spärr i `rankaKandidater` och
  `rankaVoteringsKandidater`. En spärr i kod kan inte övertalas. Rensat:
  23 ur kön, 1 indragen (`k-2026-0083`).
- **Stickprov på glm-5.2.** Kön är till 89 % glm-5.2, men INGEN av de
  godkända kopplingarna kom därifrån — revisionen mätte alltså fel
  population. 20 glm-förslag lästes därför mot källorna: 15 starka, 3
  gränsfall (alla med ärligt låg confidence), 2 cirkulära. **Modellbytet
  i sig motiverar ingen omkörning** — glm-5.2 håller jämn kvalitet med
  deepseek-v4-pro i sak.
- **Riktad omkörning.** Alla sakfel satt i voteringar; dokumentkopplingarna
  hade inte ett enda. Därför glömdes 797 voteringspar för omprövning
  medan 2 335 dokumentpar lämnades orörda. **Viktigt om du gör om detta:**
  `foreslag.mts` minns godkända par BARA via `provade-par.json` — den
  läser aldrig `kopplingar.json`. Glömmer du ett godkänt par föds en
  dubblett i kön för något en människa redan avgjort.
- **Arkivvägen för voteringar byggd.** `arkiv.mts` hoppade tidigare över
  voteringskopplingar. Nu arkiveras och verifieras betänkandet som
  `bevis.kalla_dok_id` pekar ut. `arkiv.yml` är dessutom schemalagd
  veckovis (måndag 08:00 UTC, en timme efter `foreslag.yml`).

- **Gränsfallen avgjorda.** De 8 blev 3 vid omräkning — fem låg i kön och
  lyftes ur vid omkörningen, så de återkommer med den fixade prompten.
  Av de tre: `k-2026-0040` indragen (citatet beskrev punkt 1:s truppinsats,
  men voteringen gällde punkt 2 "Kärnvapenanvändning" som bara avslår en
  motion — samma fel som de sex, men mitt maskinella test missade den
  eftersom texten står under "Utskottets överväganden" i stället för i
  sammanfattningen). `k-2026-0044` indragen (citatet var enbart punktens
  lista på avslagna motioner, vilket prompten själv förbjuder; något
  bärande citat finns inte — kvar står bara S:s och C:s reservationer,
  andra partiers ord). **`k-2026-0042` behölls** och är värd att förstå:
  punkt 1 hette "Avslag på propositionen" och avslog V:s motion om att
  fälla propositionen, så M:s ja betyder att propositionen står kvar.
  **Ett motionsavslag är inte automatiskt fel underlag — det beror på vad
  motionen ville.** Läs alltid vad som avslogs innan du dömer.

**Kvar härifrån:** de ~45 avhuggna citaten i beståndet lämnades med flit —
de är sanna, och prompten gör nya citat till hela meningar. Omkörningen av
de 797 voteringsparen var igång när passet slutade; se om den nådde slutet
eller föll på z.ai:s kvot (gårdagens pass höll 2 h 53 min innan HTTP 429).
Kolla också vad de nya citatreglerna gav: de första 40 paren gav noll
förslag, vilket kan vara reglerna som biter — eller något som är för hårt.
Loggen per par säger vilket.

**Gjort 2026-07-30, senare passet (zai-glm skarpt provat, backfill igång, modelljämförelse 20/20):**

- **z.ai/GLM-5.2 verifierat skarpt.** Sedan hemligheterna (`LLM_ZAI_API_KEY`,
  `LLM_ZAI_BASE_URL`, `MODEL_KOPPLING_ZAI`) lagts in: en riktad testkörning
  (`workflow_dispatch`, `primar: zai-glm`, ett löfte) bekräftade ett äkta
  modellanrop — inte ett tyst fall-through till opencode. Kön bär nu ett
  förslag med `"model": "glm-5.2"` sida vid sida med deepseek-genererade.
  Ett första testförsök med `max_kandidater: 2` råkade bara träffa redan
  avgjorda par (0 anrop); lärdomen är att `max_kandidater` måste matcha det
  dry-run-fynd som pekade ut det oprövade paret, annars testar man inget.
- **Full backfill mot zai-glm igång** (`--alla`, `max_kandidater: 8`,
  startad 14:44). Går fortfarande efter mer än en timme utan att kylas —
  till skillnad från opencode Go, som kylde efter ~1,5–2 h i de tidigare
  körningarna. Antingen har z.ai en högre kvot eller en annan
  kylningsstruktur; vet vi inte förrän den faktiskt kyls första gången.
  Kön: 99 → 133+ (och växer), provade par: 1630 → 1795+. Fortsätt trigga om
  den kyls, tills backloggen (de ~1 700 obehandlade paren från den frusna
  korpusen, se de dyrköpta anteckningarna om röda körningar nedan) är
  avbetad.
- **Modelljämförelse: 20/20 samstämmigt mellan deepseek-v4-pro och
  glm-5.2.** Nytt fristående verktyg,
  `pipeline/scripts/jamfor-modeller.mts` + `.github/workflows/jamfor.yml`
  (PR #301): kör om ETT GIVET urval redan avgjorda par mot en ny modell,
  utan att röra `kopplingsforslag.json`/`provade-par.json` eller skapa
  GitHub-issues — bara ett fristående jämförelseunderlag. Urvalet
  (`data/jamforelse-urval-2026-07-30.json`, 20 par: 10 där deepseek
  föreslog en koppling, 10 där den nobbade, deterministiskt valda ur
  produktionsdatat) och resultatet
  (`data/modelljamforelse-2026-07-30.json`) ligger incheckade för
  spårbarhet. Slutresultat: **10/10 på de positiva förslagen, 10/10 på
  nej-svaren** — inget tecken på att modellbytet dömer annorlunda på samma
  indata.
- **En bugg i jämförelseverktyget, inte i produktionskoden** (PR #302):
  första körningen gav 17/20 — de tre "avvikande" var faktiskt tre 404:or
  vid källtexthämtningen för voteringspar, inte oenighet. Orsak: jämförelse-
  skriptet indexerade betänkanden på deras EGET `dok_id` (`"HA01KrU4"`)
  i stället för `betankandeNyckel(rm, beteckning)` (`"202425:KrU4"`), som
  är den form en voterings `handling.dok_id` faktiskt har.
  `foreslag.mts`/`rankaVoteringsKandidater` har alltid använt rätt
  funktion (`indexeraBetankanden()`) — bara det nya, fristående skriptet
  hade sin egen felaktiga indexering. Lagat, omkört, 20/20.

**Gjort 2026-07-30 (veckoschema + andra primär för engångsjobb, grenen `claude/foreslag-schema-och-zai`):**

- **`skord.yml` och `foreslag.yml` är nu schemalagda veckovis** — skörd
  måndag 04:00 UTC, matchning måndag 07:00 UTC (tre timmars marginal, gott
  om tid för en normal veckoskörd som tar minuter, inte timmar). Bägge går
  fortfarande att starta för hand.
- **`skord.yml` skördade tidigare bara röster och betänkanden — aldrig
  `data/handlingar.json` själv.** Det förklarar varför den filen bara hade
  EN commit i hela historiken sedan förstaskörden 25 juli. Ett nytt steg
  "Dokumentskörd" kör `harvest.mts` (standardtyperna mot/prop/ip/fr/vot) och
  fixar det. Ett schema-triggat anrop skördar bara INNEVARANDE riksmöte
  (beräknat av datum, september–augusti) — inte alla fyra historiska, det
  vore slöseri varje vecka. Manuella körningar respekterar `--rm` som förut.
- **Mätt, inte gissat, hur mycket en veckoskörd faktiskt kostar i
  modellanrop.** Byggde en engångssimulering med den riktiga
  `rankaKandidater`/`rankaVoteringsKandidater`-koden: tog bort en given
  veckas handlingar ur korpusen, rankade alla 417 aktiva löften mot både
  full och reducerad korpus, och räknade hur många av veckans handlingar
  som faktiskt bröt in i något löftes topp-8. **9 normalveckor (2026 v18–27):
  2–66 nya par, medel 22,4/vecka (~97/månad).** Toppen på hela året —
  allmänna motionstidens 2 352 handlingar på EN vecka (2024 v40) — gav
  ändå bara 200 nya par, för taket på 8+8 kandidater per löfte gör att
  volymen inte skalar linjärt med korpustillväxt. Hela sexveckorsfönstret
  runt motionstiden (2024 v38–43): 308 par totalt. Skälet är strukturellt:
  en ny handling kostar bara ett anrop om den faktiskt slår ut något som
  redan ligger i ett löftes topp-8 — inte annars.
- **opencode Go (deepseek-v4-pro) håller ~2 körningar som de vi körde i
  helgen per månad** (ägarens egen kontogräns, inte något vi kan läsa ur
  loggarna) — ≈280–540 par/månad, ~400 som riktvärde. Jämfört med
  simuleringen ovan: **löpande veckovis drift ryms bekvämt** (~24 % av
  budgeten en normal månad, ~77 % i toppmånaden). Den nuvarande
  engångsbacken på ~1 700 par däremot skulle ätit 4+ månaders hela budget
  och blockerat all löpande skörd under tiden.
- **Ny `primar`-växel i `foreslag.yml`** (`workflow_dispatch`-val
  `opencode-go` | `zai-glm`) löser det: engångsbacken kan betas av mot en
  helt SKILD kvot (z.ai, GLM-modell) utan att röra Go-budgeten, medan Go
  reserveras för den löpande veckoskörden. Kräver tre nya inställningar i
  DETTA repo: hemligheten `LLM_ZAI_API_KEY`, variabeln `LLM_ZAI_BASE_URL`
  (z.ai:s OpenAI-kompatibla endpoint) och variabeln `MODEL_KOPPLING_ZAI`
  (t.ex. `glm-5.2` — verifiera mot leverantörens egen modellista).
  **Schemat kan inte välja `zai-glm`** — bara ett medvetet
  `workflow_dispatch` — så en glömd inställning kan aldrig läcka in i
  nästa veckas automatiska körning. Ingen reserv kopplas in i zai-läget
  (OpenRouter har fortsatt ingen kredit).
- **En risk hittad och lagad i den egna kodgranskningen:** ternary-mönstret
  `PRIMAR == 'zai-glm' && vars.X || vars.Y` faller TYST tillbaka på
  opencodes värde om ett enskilt zai-fält glöms (t.ex. bas-URL:en satt men
  inte modellen) — skulle ha skickat z.ai:s nyckel till opencodes endpoint.
  "Kontrollera nycklar"-steget kollar nu alla tre zai-fälten innan
  körningen ens startar.

**Gjort 2026-07-29, senare passet (sökvägen vald — sammanslagningen är nu lanseringen):**

- **b-0025 fastställt: Handlingsvågen ligger på sökvägen
  `utlovat.se/handlingsvagen`**, inte på en subdomän. Ersätter `b-0021` och
  återgår till `b-0017`:s ursprungliga topologi.
  `site/astro.config.mjs` bär nu `site: 'https://utlovat.se'` +
  `base: '/handlingsvagen'`. Sajten var redan basstig-medveten
  (`import.meta.env.BASE_URL` genomgående), så bytet krävde ingen länkjakt:
  bygget grönt på 440 sidor, alla grindar gröna, och varje länk plus sökets
  `data-api-base` bär `/handlingsvagen/` i utdatan.
- **Följden är stor och står i `SAMMANSLAGNING.md`: sammanslagningen är
  lanseringen.** GitHub Pages tillåter en custom-domän per repo, så en sökväg
  kräver ett repo. Med två repon skulle den kräva en Cloudflare Worker, vilket
  `b-0021` avvisade. Alltså: ingen egen subdomän, inget eget Pages-projekt,
  ingen egen deploy, inga 301:or — men sammanslagningens arbete måste vara
  gjort innan lanseringen kan ske. `MIGRERING.md` steg 3 pekar nu vidare till
  `SAMMANSLAGNING.md` i stället för att sätta upp en subdomän.
- **En fälla skriven in:** en gren i publikt `valflask` är publik. `LANSERING.md`:s
  "förbered i grenar, merga inte" räcker för namnbytets texter men INTE för
  Handlingsvågens kodbas — pushas den dit faller privatgrinden direkt, mergad
  eller inte. Sammanslagningsarbetet måste därför ske lokalt (rekommenderat) eller
  i detta privata repo. Står under "Var arbetet får ske" i `SAMMANSLAGNING.md`.

**Gjort 2026-07-29 (lanseringsvägen mätt upp och förenklad, grenen `claude/handoongsvagen-launch-c25uzg`):**

- **b-0024 fastställt: Handlingsvågen görs publik vid lanseringen och ligger på
  GitHub Pages**, inte Cloudflare Pages. Cloudflare Pages fanns i planen av ett
  enda skäl — GitHub Pages från privat repo kräver betalplan — och det skälet
  faller när repot öppnas. Bort försvinner ett Pages-projekt, två
  API-hemligheter och en andra driftsättningsväg. `LANSERING.md` och
  `MIGRERING.md` är omskrivna efter beslutet. **Privatgrinden är orörd** — repot
  öppnas VID lanseringen, inte före.
- **Historiken kontrollerad före beslutet:** inga nycklar, tokens eller
  certifikat i något av repots 572 objekt, varken i arbetsträdet eller bakåt.
  Görs om skanningen hunnit bli gammal när lanseringen sker.
- **DNS uppmätt, inte antagen.** `utlovat.se` och `www.utlovat.se` svarar redan
  över HTTPS med giltigt certifikat, går genom Cloudflare och landar på GitHub
  Pages — men returnerar `404`, eftersom ingen repo-inställning pekar ut dem som
  sin custom domain. DNS och SSL är alltså inte kvarvarande arbete för
  huvudsajten; det enda som fattas är att byta custom domain i valflask.
  `utlovat.nu` och `utlovat.com` är tomma zoner. `handlingsvagen.drygast.nu`
  finns inte (NXDOMAIN) och behövs inte längre.
- **Två fel i `LANSERING.md` rättade.** Dokumentet sa att Cloudflare "bara gör
  DNS" åt huvudsajten — fel: `drygast.nu` löser upp till Cloudflares anycast-
  adresser, alltså proxad trafik. Det spelar roll, för GitHubs
  certifikatutfärdande validerar över HTTP och kan fastna bakom proxyn; posten
  ska stå på grått moln till certifikatet är utfärdat. Steg 0 sa också att
  domänerna skulle registreras — de är redan registrerade.
- **`hv-pages` med `deploy=false` körd på `main`: grön** (körning 30491901476).
  MIGRERING.md steg 2 därmed avklarat. Ingenting publikt rördes.
- **Stavningsfix i förslagsparsern** (PR #206) — se de dyrköpta
  anteckningarna om röda körningar och slut kredit.
- **Språkregeln lagad där koden bröt den:** `foreslag.mts` skrev "väntar på
  ägarbeslut H6" vid varje körning. Nu "väntar på mänskligt beslut" — utan
  grindkod. Samma ord rättat i `prototyp/README.md` och `SKISS-HV4.md`.

**Gjort 2026-07-22 (HV5-migreringen FÖRBEREDD utan go-live, grenen `claude/handoff-next-steps-osvpyr`):**

Allt som går att göra bakom privatgrinden är gjort; kvar är bara de steg som
gör något publikt (kräver ägarens go). Runbook: `MIGRERING.md`.

- **Symmetritest redovisat (b-0020):** `pipeline/tests/symmetri.test.ts` — samma
  röst/riktning ger samma utslag för båda block; motorn har ingen blockberoende
  gren. 80 pipeline-tester gröna. (HV5-checklistan ✔)
- **Arkivväg byggd (ej körd):** `scripts/arkiv.mts` + `arkiv.yml` hämtar en
  arkivögonblicksbild per vägt dokument och kontrollerar att citatet står ord
  för ord i kopian (kärnprincipen); en kopia utan citat accepteras aldrig.
  Delsparar till `data/arkiv.json` (+ schema), sajten slår in verifierade
  länkar. Körs via Actions (fritt utnät) — 0/16 gjorda, den enda kvarvarande
  hårda checklistepunkten.
- **Rättelseväg på plats:** `data/rattelser.json` (+ schema), `rattelser.astro`,
  `Rattelsenot.astro` (not på berörd sida — parti/ledamot/löftespanel),
  footer-länk. Tom men redo. (HV5-checklistan ✔)
- **Neutralitetssidan publicerbar:** `neutralitet.astro` (kontraktets tio
  punkter, ren läsartext). (HV5-checklistan ✔)
- **Gated deploy:** `hv-pages.yml` bygger/testar på begäran; ingen
  push-utlösare, deploy körs bara vid `deploy=true`. Egen CF-projektnyckel
  (b-0017). Sajten bär `noindex` tills grinden släpps.

**Gjort 2026-07-22 (HV4 färdig — Vy 2 + Vy 3, grenen `claude/handoff-next-steps-osvpyr`):**

- **Partisidan (Vy 2)** `site/src/pages/parti/[kod].astro` (8 sidor): partiets
  egna löften med status (ärligt tomt där ingen koppling finns), listan över
  handlingar som gett utslag (nyast först), andelen utan handling som tal.
- **Ledamotssidan (Vy 3)** `site/src/pages/ledamot/[id].astro` (alla 425
  sittande, F5): meritlista per löfte ur `domar.json` — egna handlingar skilda
  från röster i voteringar — frånvaro visad med kvittningsnot (fäller aldrig,
  b-0004), och avvikelse från partilinjen markerad (spec §6.4; räknas
  deterministiskt genom att jämföra ledamotens klassning mot partiets på samma
  koppling, bara voteringar). Just nu 0 avvikelser: de tre kopplade
  voteringarna var partienhetliga. Avhoppade får ingen sida — deras namn står
  kvar på handlingen.
- **Index och navigering:** `partier.astro` + `ledamoter.astro` (425 grupperade
  på parti). Global sökruta i sidhuvudet på ALLA sidor (`hv-sok.js`), eget
  index vidgat till partier + ledamöter (443 poster). Rutnätets partikolumner
  och panelens partipiller länkar till partisidorna; djuplänk `?lofte=<id>`
  öppnar rätt panel (så journalister kan länka exakt).
- **Grindar:** `site/` budget- och strukturgrindar gröna (`npm test`, ny
  `test-vyer.mts`), `astro build` grön (437 sidor), rökt i headless Chromium
  (partisida via kolumnrubrik, sök→ledamot, parti-länk, djuplänk→panel,
  425 i indexet, inga JS-fel).
- **Filtren (SKISS §3):** rutnätet filtreras på parti, kategori, status,
  dokumenttyp, motionstyp och riksmöte — som URL-parametrar
  (`?parti=s&status=emot&rm=2025/26`), länkbart och delbart. Fasetter härleds
  ur radernas kopplingar (`summary.json` bär dem); klientfiltret speglar
  URL:en och har en "Rensa filter"-knapp med räknare. Partisidan har ett
  statusfilter (`hv-listfilter.js`). Riksmöte härleds ur handlingens datum
  (`riksmoteAvDatum`). Rökt i headless Chromium — filter, URL-spegling,
  rensa och djuplänkar fungerar, inga JS-fel.
- **HV4 är därmed komplett** i spec-mening (§8: per löfte, per parti, per
  ledamot; metodsida; API-utkast; sök; filter). Nästa grind är HV5 — se
  Återstår.

**Gjort 2026-07-22 (HV4-sajtens första bit — grenen `claude/handoff-next-steps-osvpyr`):**

- **Rutnätet Vy 1 byggt på riktigt (b-0019), egen Astro-sajt under `site/`**
  (bas `/handlingsvagen`, b-0017; privat, `noindex`). Löfte × parti, status på
  form aldrig grön/röd (F2), tomma celler ärligt utskrivna (F1). Klick på
  löfte/cell → detaljpanel med kopplingarnas bevis (exakt citat, riksdagslänk,
  arkivlänk när den finns, riktning, metodnot, motionstyp, säkerhet, godkänd av
  människa). Metodsida i språk alla förstår. Eget sökindex (F3), laddas vid
  fokus; kategorifilter. CSP-rent: klientkod i `public/hv-rutnat.js`, ingen
  inline-JS.
- **Byggtidsskivning** `site/src/pages/api/hv/*`: `summary.json` (3,3 KB), per
  löfte-detalj (störst 5 KB), `sok-index.json` (1,2 KB) — råfilerna (17 MB)
  skeppas aldrig. Budget- och strukturgrindar gröna (`npm test` i `site/`),
  `astro build` grön (10 filer), rökt i headless Chromium (panel, sök, filter,
  inga JS-fel).
- **Alla åtta partier fylls ur egna röster (b-0019 b):** partidomar räknas nu
  för hela partiuniversumet, inte bara löftets eget parti — varje cell fylls av
  partiets EGEN handling (röst i kopplad votering, eget författarskap).
  `domar.mts` läser `data/parties.json`; `data/domar.json` regenererad (48
  partidomar, 19 med utslag; 745 meriter oförändrade). Domsmotorn och dess 76
  tester orörda. De två voteringskopplade löftena visar en blockspridning —
  det semantiska valet är öppet för din omprövning, se meddelande nedan.
- **Vendorat utdrag ur valflask (b-0019 a):** `data/loften-index.json` +
  `data/parties.json` via `npm run vendor`. Läskopia; valflask äger löftena.

**Gjort 2026-07-21 (kostnadsgrind, topologi, HV4-frågorna — grenen `…bundle-content-ueyqqy`):**

- **Kostnadsgrind i Fläskvågen (b-0016), valflask PR #424.**
  Kostnadsestimat är maskade tills läsaren kvitterat en godkännanderuta;
  grundläget är antal. Global `.belopp`-mask + `estimat-init.js`/
  `estimat-grind.js` (CSP-rena `public/`-filer), guardad taxameter,
  localStorage utan kaka. Krönikeprosa, rubriker och de strukturerade
  jämförelserna maskas via `site/src/lib/mask.ts`. `astro build` grönt
  (461 sidor), innehållstesterna gröna. OG-delningsbilderna maskar ännu
  INTE beloppet — medvetet parkerat.
- **Topologi (b-0017):** Handlingsvågen hostas som EGEN Pages-sajt bakom
  Cloudflare på `drygast.nu/handlingsvagen` (adressen ändrad till subdomänen
  `handlingsvagen.drygast.nu` i b-0021), inte inbyggd i Fläskvågen —
  skyddar privatgrinden och håller blast radius liten. Temat delas som en
  källa. Omvärderas efter HV5.
- **HV4-frågorna F1–F5 avgjorda (b-0018), `SKISS-HV4.md` §5 uppdaterad:**
  F1 alla åtta partier per löfte (tomt = "ingen ren koppling ännu"); F2
  skilj status på form, inte färgton (hex i tema-arbetet); F3 eget litet
  sökindex; F4 båda källorna (löften + Frågevågens ståndpunkter) från
  start; F5 notis för avhoppade ledamöter, inte egen sida. **HV4-
  sidbyggandet är nu obeblockerat.**
- **Granskningsvy publicerad** (privat artefakt): statisk mobilsida som
  listar väntande kopplingsförslag sorterade på confidence, med djuplänk
  till rätt issue för `/godkänn`·`/avvisa`.
- **PR #40 öppnad** (motionstyp-backfill b-0015 + beständigt par-minne):
  merge-konflikt i `data/kopplingsforslag.json` löst genom att ta mains
  kö (ägarens issue-godkännanden är facit). Väntar på granskning/merge.

**Gjort 2026-07-20/21 (senare pass, grenen `…bundle-content-ueyqqy`):**

- **Nej-svar beständiga** — `data/provade-par.json` minns varje prövat
  par; omkörningar betalar bara för oprövat. `src/provade.ts` +
  `provade-uppdatera.mts`.
- **b-0015 — motionstyp ur riksdagens egen klassning** (subtyp), inte
  gissning. Berikade 12 887 motioner; `motionstyp-backfill.mts`.
  Gissningen var fel på alla 10 köade motionsförslag — nu rättade
  (h-2026-2074→parti, nio→enskild). 8 öppna issues fick synlig
  rättelsekommentar; de 4 redan godkända bar alla rätt typ.
- **⚠️ 401-fyndet:** körning 8 föll på 1 234 × HTTP 401 — kontrollera
  OpenRouter-nyckel/kredit före nästa fullkörning (se nedan).

**Gjort 2026-07-20 (fjärde passet, grenen `…bundle-content-ueyqqy`):**

- ~~Skördarna~~ **KLART**: `data/roster/` (899 024 röster),
  `data/personer.json` (425), `data/betankanden.json` (1 451,
  2576/2576 voteringar täckta). Workflown behövs bara för bakåtskörd
  och framtida riksmöten.
- ~~Nycklarna~~ **KLART & VERIFIERAT**: `OPENROUTER_API_KEY` +
  `MODEL_KOPPLING` (`moonshotai/kimi-k2.7-code`) +
  `MODEL_KOPPLING_FALLBACK` (`glm-5.2`, z.ai) på plats; vakten i
  `foreslag.yml` passerar. OBS: hemligheten `LLM_FALLBACK_KEY` är en
  felnamnad dubblett (workflown läser `LLM_FALLBACK_API_KEY`) — kan
  raderas.
- ~~foreslag-piloter~~ **BÅDA VÄGARNA BEVISADE**: nej-vägen
  (p-2026-0041 Nato, 9 korrekta avslag — samma politikområde är inte
  samma sakfråga) och ja-vägen (p-2026-0360 elevlagen → förslag genom
  H1–H5 → kön → issue #5, citatet oberoende omkontrollerat).
  **Issue #5 väntar på ägarens /godkänn.**
- **b-0014 GENOMFÖRT till hälften**: utskott (organ) i datamodell,
  schema och skörd + återfyllt på 23 388 handlingar
  (`scripts/organ-backfill.mts`); voteringar härleds ur beteckningen.
  241 utan uppgift, tomt är ärligt.
- **HV4-prototyp byggd och publicerad** (privat artefakt, källa i
  `prototyp/`), i nuvarande version med: Vågen (rutnät + Läge A/B-
  förklaring + omskriven läsanvisning), Utforskaren (fritt sök,
  röstmatriser, ledamotssidor, utfällbar ordlista för förstagångs-
  väljare), Ämnen (värmekartor parti/fråga över tid + Ordmolnet),
  Mot varandra (head-to-head med snabbval: partiledare i kammaren
  eller mest aktiva profil; komplett "röstade olika"-lista med
  punktnummer), Kartan (alla ledamöter placerade i 2D av sina egna
  röstmönster — blocken framträder ur datat). F1–F5 i SKISS-HV4.md.
  **Uppdatera samma artefakt:** bygg om enligt prototyp/README.md och
  publicera med url-parametern
  `https://claude.ai/code/artifact/006ea368-ed8b-4eca-97f5-a657c785045b`
  (annars myntas en ny länk).

Återstår (i ordning):

1. **Ägarens granskning av kön — KLAR (2026-07-23).** Hela kön avbetad
   tillsammans med ägaren: **14 godkända, 4 avvisade** (0 kvar). Avvisade:
   #20 (kriminalitet i vården ≠ stoppa privatiseringar), #26 (granskande
   interpellation, inte handling som bygger militär förmåga), #17
   (arbetsmarknadspolitik "i hela landet" för bred passform), #15 (strandskydd
   egen sakfråga). `npm run domar` omkört: **72 partidomar (19→ fler med
   utslag), 1124 ledamotsmeriter** (upp från 48/745). Nästa förslagskörning
   fyller kön på nytt (punkt 3).
2. **b-0014 andra halvan — nyckelordsindexet**: byggtidsindex över
   dokumentens fulltexter (fritextsök + ordtrender per parti).
   Fulltexterna hämtas vid indexbygget och lagras aldrig; indexet
   checkas in skärvat. ~23 600 dokument ≈ ett par timmar i artigt
   tempo — bygg som Actions-workflow eller från session med öppet nät.
   EJ PÅBÖRJAT. **Indexet har TVÅ användningar — bygg det för båda:**

   a. **Sajten: fritextsök över handlingar** (ägarens fråga 2026-07-25).
      Läsaren ska kunna söka ett ämne fritt och få alla motioner,
      propositioner, frågor och voteringar som rör det. Viktigt för
      hederligheten: indexet SÖKER, det dömer aldrig. "För/mot" visas
      bara där det finns en godkänd koppling (som bär riktning) eller en
      faktisk votering (som bär röstfördelning) — aldrig härlett ur att
      ett ord förekommer i en text. Storleksgrind: `sok-index.json` har
      tak 400 KB (`site/scripts/test-budget.mts`) och rymmer i dag 443
      poster; 23 600 handlingar får aldrig plats i samma nyttolast —
      därför skärvat index som hämtas på begäran, i linje med b-0014
      ("incheckat skärvat") och budgetgrindens regel att sajten aldrig
      skeppar råfilerna.

   b. **Kandidaturvalet: väg in dokumenttexten, inte bara titeln.**
      `rankaKandidater` matchar löftets ord mot handlingens TITEL. En
      handling vars titel betonar en sak men vars innehåll gäller en
      annan prövas därför mot fel löften — och mot rätt löfte aldrig,
      eftersom noll titelöverlapp aldrig blir kandidat. **Konkret fall
      (issue #174, avvisad):** motionen "Snabbare uppbyggnad av
      krigssjukvård till stöd för Ukraina" yrkar sakligt på svensk
      försvarsförmåga, men prövades bara mot Ukrainastöds-löftet
      (titelorden "stöd" + "Ukraina") och kan aldrig nå löftet om ett
      starkt svenskt försvar (`p-2026-0040`, noll titelöverlapp). Med
      nyckelordsindexet kan rankningen väga dokumentets egna ord —
      fortfarande deterministiskt, fortfarande utan modell i urvalet
      (b-0011). Detta är den "kandidatstöd"-användning b-0014 självt
      pekar ut som möjlig internt.

   Kostar noll modellkvot: nyckelorden härleds deterministiskt
   (tokenisering + stoppord + ordvikt), inga språkmodellanrop.
3. **Full förslagskörning** (`foreslag`-workflown med --alla):
   1 328 kandidatpar enligt dry-run 2026-07-20 (202 löften har
   kandidater, 220 ärligt tomma). Räkna med låg men ren träffkvot —
   precisionen är avsiktlig.
4. **Propositioner och H3**: alla 939 propositioner saknar parti
   (regeringen är avsändare). Mappning mot regeringspartierna är en
   öppen metodfråga — beslutslogga innan kod.
5. **Bakåtskörd till 2002/03** när ägaren vill: samma skript, fler
   `--rm`. Räkna ~1 h per mandatperiod i artigt tempo.
6. **HV4 — KLART (b-0019).** Rutnätet (Vy 1), partisidan (Vy 2),
   ledamotssidan (Vy 3), metodsidan, API-utkastet, sök (F3) och **filtren
   (SKISS §3)** är byggda i `site/` (egen Astro-sajt, bas `/handlingsvagen`).
   Rutnätet filtreras på parti, kategori, status, dokumenttyp, motionstyp och
   riksmöte som URL-parametrar (`?parti=s&status=emot` osv. — länkbart,
   delbart, arkiverbart); partisidan har ett statusfilter. Kvar är bara
   förfiningar som INTE blockerar HV5:
   - **Frågevågens ståndpunkter i rutnätet (F4):** kopplingsmodellen bär
     redan `stance_id` (mål = promise_id ?? stance_id), men det finns inga
     ståndpunktskopplingar än — det kräver att förslags-/grindsteget körs mot
     Frågevågens ståndpunkter (egen data-uppgift, inte sidbygge). Sajten
     hoppar tyst över `stance_id`-mål tills dess.
   - **Exakta temakulörer (F2)** hör till det delade tema-arbetet med valflask
     (en källa); HV använder neutrala platshållare tills dess.
   - **Kostnadsgrind (F7)** är inte aktuell här: HV visar inga belopp —
     grundläget är redan antal. Blir bara relevant om ägaren vill lägga in
     löftenas kostnadsestimat på HV-sidorna (då gäller samma grind som b-0016).
   - Prototypens övriga vyer (Ämnen, Mot varandra, Kartan) om ägaren vill ha
     dem; extra, inte spec-krav. Partibyten på ledamotssidan (per-votering ur
     roster-avvikelselistan) är en marginell datastump — avvikelse mot
     partilinjen är utskriven, partibyten ännu inte.
7. **HV5 — lanseringsgrinden. FÖRBEREDD — se `MIGRERING.md`.** Allt bakom
   privatgrinden är gjort: symmetritest redovisat (b-0020), rättelseväg,
   neutralitetssida, beslutslogg/metod publicerbara, arkivväg (skript +
   workflow) och gated deploy-workflow. Kvar är bara ägarstegen som gör
   något publikt, i ordning (MIGRERING.md): (1) kör `arkiv`-workflown tills
   arkivkopiorna är verifierade (0/16 nu — enda hårda datapunkten); (2)
   validera bygget (`hv-pages`, deploy=false); (3) Cloudflare-projekt +
   hemligheter; (4) **ta bort `noindex`** i `site/src/layouts/Layout.astro`
   (grinden släpps här); (5) deploy=true; (6) sätt custom-domänen
   `handlingsvagen.drygast.nu` på HV-projektet (subdomän, b-0021 — ingen
   Worker); (7) spegla granskningsflödet till valflask; (8) verifiera live.
   Ägarens uttryckliga go krävs.
   Då speglas även granskningsflödet till valflask.

   > **ERSATT 2026-07-29 — läs inte stegen ovan som en att-göra-lista.**
   > `b-0024` och `b-0025` tog bort punkterna 3, 5, 6 och 7: det finns inget
   > Cloudflare-projekt, ingen egen deploy, ingen subdomän och inget flöde att
   > spegla. Handlingsvågen ligger på sökvägen `utlovat.se/handlingsvagen` i
   > samma bygge som Fläskvågen, vilket gör **sammanslagningen till
   > lanseringen**. Punkterna 1, 2 och 4 gäller fortfarande; 1 och 2 är körda.
   > Aktuell ordning: `SAMMANSLAGNING.md`.

## Tekniska anteckningar (dyrköpta)

- **`partibet` är ofta "-"** i dokumentlistans intressenter — berika via
  ledamotsregistret (`berikaPartier`). Utan träff: lämna tomt, H3 stoppar.
  123 motioner har undertecknare som lämnat riksdagen och saknas i
  personlistan — kan förbättras med historisk personlista, tomt tills dess.
- **Fulltext hämtas ur `dokumentstatus/<id>.json`** (fältet
  `dokument.html` + `htmlTillText`) — `/dokument/<id>/text` svarar
  numera med dokumentstatus-XML, inte ren text.
- **Riksdagens API 503:ar ibland** — all skörd går via `scripts/hamta.mts`
  (300 ms tempo + 4 omförsök med backoff). Kör aldrig två skördar
  parallellt.
- **Riktningssemantik för voteringar**: kopplingens riktning = vad ett
  bifall (Ja) innebär för löftet. Ja+stödjer→i linje, Nej+stödjer→emot,
  osv. Fastslaget i `domar.ts` + tester; ändra aldrig utan beslutslogg.
- **Frånvaro räknas aldrig** (kvittningssystemet, b-0004). Avstår är
  varken eller. Lika röstetal ger `utfall: null`.
- **Enskilda motioner binder inte partiet** (b-0007); `klassaMotionstyp`
  ger bara kommitté/enskild — "parti" sätts av människa i granskningen.
- Riksdagens API svarar utan nyckel; skördaren håller artigt tempo
  (300 ms mellan anrop). `voteringlista` utan `gruppering` ger radnivå.
- Stack: Node 22, TypeScript strict (`exactOptionalPropertyTypes`),
  `node --test` via tsx — exakt som valflask/pipeline.
- **Citatgrinden har ett kontrakt mot systerrepot.**
  `pipeline/tests/citatgrind.test.ts` är en **byte-identisk kopia** i detta repo
  och i valflask. `diff` mellan de två filerna ska vara tom:

      diff pipeline/tests/citatgrind.test.ts \
           ../valflask/pipeline/tests/citatgrind.test.ts

  Skälet: `normalizeForVerbatim` finns i två oberoende kopior (`grindar.ts` här,
  `gates.ts` där). Skärps den ena och glöms den andra får vågorna tysta olika
  krav på ordagrannhet — Handlingsvågen godtar ett citat Fläskvågen hade
  avvisat, utan att någon grind fäller. Testet spikar utfallet tecken för tecken
  plus ett fingeravtryck (`ff6628547e7ba295`), så varje beteendeändring fäller
  högt. Ändra ALDRIG förväntad utdata för att få testet grönt; ska grinden
  skärpas görs det i båda repon i samma omgång, och fingeravtrycket uppdateras i
  båda. Importvägen är gömd bakom `src/citatgrind.ts` just för att testfilen ska
  kunna vara identisk.
- **Löfteskopian uppdateras med `vendor.yml`, inte för hand.**
  `data/loften-index.json` är en läskopia av valflasks löften (b-0019 a).
  Den hann bli gammal åt två håll samtidigt: saknade sex nya löften och bar
  rader för fem tillbakadragna. Kör `vendor`-workflown efter att valflask ändrat
  löften. Kopian bär bara **aktiva** löften (417 vid skrivandet av detta);
  tillbakadragna utesluts med avsikt. Bygget läser den incheckade filen och når
  aldrig valflask — det är hela poängen med b-0019, så lägg inte
  vendoringen i `hv-pages`.
- **En röd förslagskörning betyder oftast inte att den misslyckades.**
  Körsteget avslutas rött så snart ETT par föll, även när körningen i
  övrigt gick igenom hundratals löften och pushade dem löpande. Läs alltid
  loggen innan du drar slutsatsen att inget blev gjort: körning 30159619034
  betade av 346 löften och skapade 21 granskningsärenden — och blev ändå
  röd. Det som saknas efter en röd körning är de par som föll, inte
  körningen.
- **Slut kredit ser ut som ett kodfel men är det inte.** Samma körning föll
  till slut på `HTTP 402: Insufficient credits` från reservendpointen
  (OpenRouter) — 26 par i rad mot slutet. Dödspärren löste ut precis som
  tänkt. Innan du felsöker kod: kontrollera krediten hos leverantören och
  att primärendpointen (`LLM_BASE_URL`) faktiskt svarar, annars går varje
  anrop via reserven.
- **Ett tyst reservläge var osynligt — nu varnar klienten.** Endpointkedjan
  är opencode Go som primär (`LLM_BASE_URL` + `LLM_API_KEY`) och OpenRouter
  som reserv (`LLM_FALLBACK_BASE_URL` + `LLM_FALLBACK_KEY`; workflown godtar
  också `LLM_FALLBACK_API_KEY`). Föll primären svarade reserven utan ett ord
  i loggen, så en död primär såg exakt ut som en frisk körning — ända till
  reserven också tog slut. Det var därför 30159619034 inte gick att felsöka
  i efterhand: felet från OpenRouter var allt man såg, och opencodes eget
  fel fanns ingenstans. `OpenRouterClient` skriver nu **en** rad första
  gången reserven svarar i primärens ställe, med primärens fel som skäl
  (`onReservSvarade`, default `console.error`). Ser du den raden i en logg:
  primären är nere, oavsett att körningen blev grön.
- **Modellen stavar svenska ordagrant.** Prompten ber om `stodjer` utan
  prickar; modellen svarade tidvis `stödjer` och paret föll på "okänd
  riktning". `parseForslagSvar` fäller nu in prickarna och normaliserar
  skiftläge innan jämförelsen — ett svar som betyder något annat faller
  fortfarande. Kostade 2 par i körning 30159619034.

## Samarbete mellan parallella sessioner (bindande arbetssätt)

Flera Claude-sessioner arbetar i detta repo samtidigt, med OLIKA
nätpolicy (en når data.riksdagen.se/openrouter.ai direkt, en annan
inte). Git är brevlådan och HANDOFF är anslagstavlan:

1. **`main` är samlingspunkten.** Arbeta på din egen `claude/…`-gren,
   ta in `origin/main` ofta (`git fetch` + rebase). Pusha små commits
   tidigt och ofta — opushat arbete är osynligt för alla andra.
2. **Läs anslagstavlan innan du börjar:** `git fetch origin` och läs
   HANDOFF **på `origin/main`** (inte din lokala kopia) — läget kan ha
   flyttat sig sedan din session klonades.
3. **Gör anspråk före arbete:** skriv en rad under "Pågår just nu"
   nedan (datum, gren, område), committa och pusha DEN FÖRST, jobba
   sedan. Ta bort raden i samma commit som avslutar arbetet. Krockar
   två anspråk: den som pushade först har området; den andra väljer
   nytt eller bygger ovanpå via PR.
4. **Datafiler skrivs av en session åt taget.** Skörda aldrig
   parallellt (API-artighet + omergbara JSON-konflikter i
   `data/handlingar.json`/`data/roster/`). Anspråk på skörd = anspråk
   på datafilerna.
5. **Nätuppdelning:** session med öppet nät kör skördar och
   modellanrop direkt; nätblockerad session använder Actions-vägen
   (`skord.yml`/`foreslag.yml`) eller lämnar punkten på anslagstavlan.
6. **Beslutsloggen:** ta nästa lediga b-nummer; krockar vid rebase
   löses genom att numrera om sin EGEN post (aldrig någon annans).
7. **HANDOFF uppdateras när ett pass avslutas** ("Läget just nu" +
   "Återstår") — det är överlämningen till nästa session, mänsklig
   eller inte.
8. **Omergat arbete är osynligt på main.** Sessionerna har olika konton
   och ser aldrig varandras chattar — bara repot. Efter `git fetch`:
   kör `git branch -r --no-merged origin/main` och titta i de grenarnas
   HANDOFF och loggar innan du antar att något inte är gjort. Be ägaren
   merga små tavel-/datacommits snabbt så main speglar verkligheten.

### Pågår just nu

- 2026-07-27 `claude/handlingsvagen-ko-beta-6oiq2r` → ämnessökets
  partifilter och röstfrågor (b-0023). Rör inte `site/src/lib/amne.ts`,
  `site/src/lib/delat.ts`, `site/src/pages/amnen.astro` eller
  `site/src/pages/api/hv/` parallellt.
- 2026-07-31 `claude/lansering-utlovat-emtbcq` → **sammanslagningen
  (stegen 1–2) och namnbytet till utlovat.se**, förberett i DETTA privata
  repo. Grenen bär hela det sammanslagna trädet: Handlingsvågen under
  `handlingsvagen/`, Fläskvågen i roten. Rör inte filflytten, workflowsen
  eller `HANDOFF.md`/`LANSERING.md`/`SAMMANSLAGNING.md` parallellt.
  Skördar och förslagskörningar berörs inte — de fortsätter mot `main`
  som vanligt.

#### Klart och mergat

| PR | vad |
| --- | --- |
| #196 | svensk ordstamsreducering (`stam.ts`), Snowball i kod — 0 avvikelser mot referensen på 16 017 unika ord |
| #197 | fritextsök över handlingarna + ordtrender per parti, skärvade nyttolaster |
| #198 | bestämd form i sökningen (`sokStammar`) — "skolan" och "skola" ger samma träffar |
| #199 | undertecknarnas namn ut ur termerna; sökformerna symmetriska genom konstruktion |
| #200 | anslagstavlan |
| #201 | innehållslösa ord + partinamn ur termerna, betänkandena indexeras, ordtrenden mäter övervikt mot övriga (b-0022) |

| #202–#203 | ombyggt index, innehållslösa ord och namn ute, betänkandena med |
| #204 | LANSERING: hur sajten faktiskt är driftsatt |

Indexet på main är ombyggt och rent: **21 052 handlingar** (alla med
visningsform) och **1 443 av 1 451 betänkanden**. Ordtrenderna visar
politik — MP: parisavtalet, kvotflyktingar, klimatanpassning; KD:
jerusalem, religionsfrihet; C: solceller, jordbruksmark, biogas.

#### Namnbytet till utlovat.se — planen ligger i LANSERING.md

Fastställt genom mänskligt beslut 2026-07-26: när Handlingsvågen är
färdig och går live byter hela sajten namn från `drygast.nu` till
**`utlovat.se`**. Planen hålls i **detta privata repo** (`LANSERING.md`) —
`valflask` är publikt, och ett namnbyte som syns i historiken innan det
är gjort är en förvarning, inte ett namnbyte.

Namnbytet är SIST. Först kalkylerna i valflask, sedan Handlingsvågen
färdig, sedan bytet som ett eget moment.

**En sak är dock brådskande:** registrera `utlovat.se`, `.nu` och `.com`
nu. Alla tre var lediga 2026-07-26 och tillgänglighet består inte.

Två fällor som `LANSERING.md` går igenom och som inte syns vid en snabb
titt: 14 scheman under `valflask/pipeline/schemas/` bär `$id`-rader med
`https://drygast.nu/...` — ett `$id` är en identitet, inte en länk — och
det publika API:t under `site/src/pages/api/v1/` har åtta ändpunkter som
går sönder för den som redan hämtar dem. Och drygast.nu är inte "live i
en liten krets" tekniskt sett: `robots.txt` tillåter allt och pekar ut en
sitemap, så adresserna finns i sökmotorerna.

#### Näst på tur, i ordning

1. **Trigga arkivkopiorna.** `arkiv.yml` under Actions-fliken. 0/16 av de
   vägda dokumenten har verifierad arkivkopia, och det är den sista hårda
   punkten på HV5-checklistan. En kopia godtas bara om citatet står ord
   för ord i själva ögonblicksbilden — bär den inte citatet lämnas
   arkivlänken tom, aldrig påklistrad.
2. **Fullkörning av `foreslag`** med det indexbaserade kandidaturvalet —
   82 löften återstår efter `p-2026-0469`. Kör INTE parallellt med ett
   indexbygge: båda skriver till main.
3. **Sedan namnbytet** enligt `LANSERING.md`, som ett eget moment.

#### Söket — KLART (b-0023)

Både partifiltret och röstfrågorna är byggda och mätta. Det som gäller
nu, för den som bygger vidare:

- **Partifiltret gäller hela träffmängden.** Partierna ligger som en
  bitmask i ORDSKÄRVAN bredvid postningslistan (`OrdPost.p`, två
  hexsiffror per id i `i`), just för att klienten ska kunna gallra före
  den kapar till 60. Att hämta handlingsskärvorna för att filtrera vore
  3,6 MB per bred sökning — gör inte det.
- **Betänkandena har en egen postningslista** (`b`/`bn`) med eget tak.
  I en gemensam lista kapas de bort av handlingarna, som är femton
  gånger fler: id:n sorteras som text och `h-2026-…` ligger alltid före
  `202526:…`. Röstfrågorna hade då tyst slutat svara.
- **Id:n skickas förkortade** till sitt löpnummer, med förled och
  nollfyllnadsbredd angivna en gång per skärva (`pre`, `bredd`). Det är
  den vinsten som gjorde att partikoderna och betänkandena fick plats:
  största ordskärvan 582 → 321 KB mot taket 500 KB. **Nollfyllningen är
  inte kosmetik** — `h-2026-0868` och `h-2026-868` är olika handlingar.
  Grinden "de förkortade id:na skrivs tillbaka till verkliga handlingar"
  finns just för att den skillnaden en gång slank igenom.
- **Röstfrågorna** går via betänkandet: `/api/hv/votering/<riksmöte>.json`
  har betänkandenyckeln (`202223:SkU2`) som voteringens `dok_id` pekar på,
  med riksdagens egna röstsiffror per parti. Sammanställningen står för
  sig själv på sidan. Ordförekomst betyder att ämnet BERÖRS; en röst är
  vad ett parti faktiskt gjorde — de två blandas aldrig ihop, och sidan
  skriver ut att ett ja gäller utskottets förslag i just den punkten.

#### Fällor som redan kostat tid

- **Grindar som mäter utfallet av en tyst reserv mäter ingenting.**
  "trendorden har visningsform" var grön på 21 052 dokument helt utan
  visningsform, eftersom modellen faller tillbaka på stammen. Grindarna
  mäter numera vid källan (i indexet), inte i utfallet.
- **Provdata döljer metodfel.** Ett provindex byggt på titlar gav
  vettiga trendord; fulltexterna gav "viktig, behövs, idag" för alla
  partier. Stäm alltid av mot riktig data innan en metod bedöms.
- **Workflowen `nyckelord.yml` checkar alltid ut defaultgrenen**
  (`ref: default_branch`), oavsett vilken gren den startas på.
- **Stop-hooken flaggar mergecommits felaktigt.** Efter varje merge
  ligger grenen på en commit av `bambapappa` eller `github-actions[bot]`
  som hooken vill att man skriver om. Gör aldrig det — det vore att
  skriva om publicerad historik. Pusha grenen i stället så
  `origin/<gren>` möter HEAD.

**⚠️ Fullkörning 2026-07-25 (run 30159619034) AVBRUTEN AV KREDITSLUT —
82 löften återstår.** Första fullkörningen med `deepseek-v4-pro` + den
skärpta prompten. Resultat: **21 nya förslag i kön**, provade par
1069 → 1215. Allt är pushat löpande; ingenting förlorat.

Förloppet: modellanropen fungerade rent i drygt en timme (13:23–14:38).
Från 14:45 föll **varje** par på `HTTP 402 Insufficient credits` från
OpenRouter — dvs. primärvägen (OpenCode Go) började neka, anropet gick
till reservvägen, och den saknar kredit sedan tidigare. Dödspärren löste
ut som avsett efter åtta löften i rad utan framsteg (17:12), vid löfte
nr 346 av 428.

**Felhanteringen är härdad efter detta (PR #195, mergad).** Orsaken till
de långsamma misslyckandena hittad: klienten kapade `Retry-After` vid 90 s
och sov så för VARJE omförsök, så en kvotspärrad leverantör kostade ~6 min
per par — om och om igen. Nu (a) kapas omförsökssömnen vid 20 s, (b) tas en
endpoint som svarat 401/402/403 eller slagit i 429 UR SPEL (permanent
respektive till dess `Retry-After` lossnar) och hoppas över direkt, och
(c) bär felet ett svar PER endpoint, så primärvägens kod inte längre
maskeras av reservvägens. Dödspärren sänkt 8 → 3 löften. Ny `llm.test.ts`
(6 fall); 88 tester gröna.

**Innan nästa fullkörning:** kontrollera OpenCode Go-kvoten och/eller fyll
på OpenRouter-krediten — härdningen gör misslyckanden billiga, den skaffar
ingen kapacitet. Med båda vägarna tomma dör en omkörning nu inom minuten
med tydlig felkod per endpoint i stället för att mala i timmar.

Kvar att köra: löftena efter `p-2026-0469` i `promises.json` (82 st).
En omkörning tar bara det oprövade — `provade-par.json` minns resten.

**Granskningskön 2026-07-24: HELT AVBETAD (0 kvar).** Alla 121 ärenden
avgjorda med ägaren, plus en dubbelkoll av bulk-godkännandena efteråt.
`data/kopplingar.json` har efter alla reverseringar **118 godkända
kopplingar**. `npm run domar` omkört: **440 partidomar, 6901
ledamotsmeriter** (drivs av voteringskopplingarna — varje votering ger
merit åt varje röstande ledamot i upp till åtta partier).

Tre saker upptäcktes och åtgärdades:

1. **Falsk partimatchning på frågor/interpellationer** (en fråga listar
   både frågeställaren OCH den tillfrågade ministern, så ministerns
   parti hamnade i handlingens partilista). 12 felkopplingar fångades;
   7 backades ur `kopplingar.json` + `#150` efter omprövning
   (tvångsäktenskap ≠ uppehållstillstånd). **Varaktig kodfix i PR #171
   (MERGAD)** — `aktorsPartier()` som både H3 och kandidatrankningen
   använder, så felet kan inte återkomma.
2. **Dubbelkoll av bulk-godkännandena** hittade 3 fler fel som backades
   (#85 SD motverkar-feltolkning, #119 MP budgetröst-förvirring, #132
   vag paroll + citat=titel). Tre gränsfall (#156/157/158, SD-motioner
   med title-only-citat) behölls efter substanskoll — de matchar
   namngivna löftesdelar (stärkt äganderätt, mindre regler för företag)
   och är partilinjemotioner.
3. Domarna var aldrig omräknade förrän efter alla reverseringar, så
   ingen felkoppling nådde någon publicerad dom.

**Öppen rekommendation (ej beslutad): byt `MODEL_KOPPLING` från
`kimi-k2.7-code` (kodtränad) till `deepseek-v4-pro`** (generell
resonemangsmodell, redan bevisad i valflask som MODEL_EXTRACT) — troligen
bättre på svensk politik-semantik. Överväg också en skärpt
`prompts/koppling.md` (avvisa vaga paroller, kräv sakligt citat inte
rubrik, förklara röstmekaniken) för att sänka felandelen i förslagskön.

**Två Go-primär-fullkörningar 2026-07-23/24 (run 30044095324 +
30076690510, uppsamling): KLARA, hela kön genomkörd båda gångerna.**
Kön har vuxit **78 → 104 → 121 förslag** (43 nya totalt). Bekräftat i
sak: primärmodellen `kimi-k2.7-code` via OpenCode Go fungerar stabilt
(PR #127:s `bash -e`-fix och fallback-koppling höll i båda körningarna
— inga tysta krascher, inga tappade poster, allt löpande pushat).

Båda jobben slutar ändå röda (`exit 1`) — inte modellfel, utan
**OpenRouter-fallbacken saknar kredit** (samma gamla brist som körning
8, aldrig åtgärdad): när Go enstaka gånger nekar ett par faller koden
över till OpenRouter, som svarar `HTTP 402 Insufficient credits`. Det
paret förblir oprövat (inte skrivet till `data/provade-par.json`) och
tas upp av nästa körning — vilket är precis vad som hände (körning två
fångade in en del av körning ett:s missade par). Ingen datakrasch,
ingen dödspärr utlöst i någondera. **Fortsatt omkörning kan i princip
fånga fler par, men avvaktar nu** — inte kört en tredje gång eftersom
avkastningen sjunker (Go bär redan det mesta av lasten) och sessionens
kvotförbrukning ska hållas nere. Åtgärda genom att fylla på
OpenRouter-krediten om alla par ska in, annars räcker Go ensamt.

Fullkörningen 2026-07-20 (körning 8, OpenRouter-primär, historisk):
34 förslag i kön över 12 löften. Ägaren betade 2026-07-23 av den då
gällande kön (14 godkända, 4 avvisade); domarna gav då 72 partidomar,
1124 ledamotsmeriter. Nu ersatt av 2026-07-24 års fullständiga
genomgång (se ovan).

**Nej-svar är beständiga:** `data/provade-par.json` minns varje prövat
par (förslag/nej/grindfall). En omkörning betalar bara för det
oprövade — `scripts/provade-uppdatera.mts` persisterar filen
race-säkert i workflowen.

### Meddelanden mellan sessioner

- 2026-07-20 `…bundle-content-ueyqqy` → alla: femte passet (efter detta)
  lämnade INGA pushade spår i något repo — utgå från denna grens spets,
  inte från antaganden om vad det hann. Påminnelse ur protokollet:
  pusha små commits tidigt; opushat arbete finns inte.

Korta, daterade och signerade med grennamn; mottagaren tar bort raden
när den är hanterad (i samma commit som åtgärden):

- 2026-07-25 `claude/kostnadsestimat-p2026-0470-24levf` (valflask) → sessionen
  som kör förslagskörningen: **språkgenomgång av HV-sidorna återstår — gör den
  när körningen är klar** (inte parallellt; rör bara `site/`, inte data).
  Samma jobb är gjort i valflask och kan kopieras därifrån. Tre regler att
  gå igenom i texten som möter läsaren:
  1. **Inga interna koder i läsartext.** Grindkoder (H-serien, G-serien),
     b-nummer och råa id:n (t.ex. gruppkoder som `g-…`) säger ingen
     utomstående något. Skriv ut vad som faktiskt sker i stället, eller gör
     koden läsbar — i valflask blev `g-slopad-karens` till "Slopad karens".
     Glöm inte sidbeskrivningarna (`description=` i `Layout`): de syns i
     sökresultat och delningar, och det var där valflask hade sina värsta fall.
  2. **"mänskligt beslut", aldrig "ägarbeslut"** — gäller all text, även
     kodkommentarer. Historiska loggposter (beslutslogg, DECISION_LOG) lämnas
     dock orörda: att skriva om dem i efterhand vore att ändra historien.
  3. **Ordet "verbatim" är förbjudet** i ny prosa — skriv "ordagrant" eller
     "ord för ord". Befintliga kodidentifierare får stå kvar.
  Nyttiga sökningar: `grep -rn "ägarbeslut\|verbatim" site/src` och
  `grep -rnE "\b(H[1-9]|G[1-5]|R[1-5])\b|\bb-[0-9]{4}\b" site/src --include=*.astro`.
  Kör sajtens testsvit efteråt. Ta bort den här raden när det är gjort.

- 2026-07-22 `claude/handoff-next-steps-osvpyr` → ägaren + alla: HV4-rutnätet
  är byggt (`site/`). **Ett val att kvittera (b-0019 b):** för att fylla alla
  åtta partikolumner räknas nu ett partis EGNA röst i en kopplad votering som
  dess handling på löftets sakfråga — så en oppositionsröst mot ett kopplat
  förslag blir "agerat emot" även på ett annat partis löfte. Det är öppna data
  och samma testade riktningssemantik, men säg till om du hellre vill att bara
  löftesägaren får utslag (då faller `domar.mts` tillbaka på målets egna
  partier — reversibelt). **OBS interface:** `npm run domar` förutsätter nu att
  `data/parties.json` finns (kör `npm run vendor` först). Kör aldrig
  vendor/domar parallellt med en skörd — samma datafilsanspråk.

- 2026-07-20 `…bundle-content-ueyqqy` → alla: grenen ligger före main
  med b-0014 (utskott i datamodellen + återfyllnad, organ-backfill)
  och HV4-prototypen — merga innan arbete i pipeline/ eller data/.
  Nästa lämpliga uppgift för en session med öppet nät eller via
  Actions: b-0014:s nyckelordsindex (Återstår punkt 2). Kör aldrig
  organ-backfill parallellt med annan skörd.

## Sessionspraktik

- Nätpolicy skiljer per session: passet 2026-07-19 nr 3 var blockerat
  mot data.riksdagen.se; nr 4 (bundlegrenen) hade öppen väg och körde
  skördarna direkt. Prova med `curl -sI https://data.riksdagen.se` innan
  du väljer väg.
- `main` finns och är samlingspunkt (PR #1–#2 mergade dit).
- Commits avslutas med Co-Authored-By-raden och sessionslänken enligt
  harnessens regler; modell-id får aldrig hamna i repoartefakter.
- Granskningsbeslut fattas alltid av ägaren (bambapappa) — föreslå,
  vänta på besked. H6-besluten verkställs via koppling-issues i DETTA
  repo (före HV5), eller `npm run granska` lokalt.
