# Plan: två repon → ett

`b-0017` lämnade frågan öppen ("omvärderas efter lansering") och `CLAUDE.md`
säger samma sak. Den här filen är svaret, med det som mätts upp i stället för
antagits.

**Beslutet: slå ihop, men EFTER lansering.** Skälet till delningen var
privatgrinden, och den gäller fram till lanseringen. Att lägga om
repostrukturen mitt i ett namnbyte är att lägga två risker på samma vecka.

## Varför alls

Delningen kostar tre saker idag. Två av dem är redan lagade i väntan på
sammanslagningen; den tredje går inte att laga utan den.

1. **Citatgrinden fanns i två byte-identiska kopior.**
   `normalizeForVerbatim` — regeln som avgör om ett citat räknas som återgivet
   ord för ord — ligger i `valflask/pipeline/src/gates.ts` och
   `handlingsvagen/pipeline/src/grindar.ts`. Skärps den ena och glöms den
   andra får vågorna tysta olika krav på ordagrannhet, och Handlingsvågen
   godtar ett citat som Fläskvågen hade avvisat. Ingen befintlig grind fäller
   på det.
   *Lagat i väntan:* `pipeline/tests/citatgrind.test.ts` är en byte-identisk
   kopia i båda repon som spikar utfallet tecken för tecken plus ett
   fingeravtryck. `diff` mellan de två filerna ska vara tom. Vid
   sammanslagningen ersätts konstruktionen av **en** delad källa, och
   `src/citatgrind.ts` (bara en omexport) kan tas bort.
2. **Löftena läses ur en manuell kopia.** `data/loften-index.json` skrivs ur
   valflasks `promises.json` med `npm run vendor`. Kopian hann bli gammal åt
   två håll: den saknade sex nya löften och bar rader för fem tillbakadragna.
   *Lagat i väntan:* `vendor.yml` uppdaterar kopian på begäran. Vid
   sammanslagningen försvinner både workflown och `scripts/bygg-vendor.mts` —
   löftena läses direkt ur samma träd, och glappet kan inte uppstå.
3. **Sökningen är tre ytor som läsaren upplever som en sajt.** Det här går
   inte att laga med två repon. Se `SKISS-SOK.md`.

Därtill: en hemlighet i stället för två (HANDOFF klagar redan på att
modellnyckeln måste läggas in separat i båda repon), ett tema i stället för
två, en anslagstavla i stället för två.

## Vad det kostar

Mätt, inte gissat:

| | valflask | handlingsvagen | efter merge |
|---|---|---|---|
| git-historik | 2,3 MB | 16 MB | ~18 MB |
| arbetsträd | 4,1 MB | 59 MB | ~63 MB |
| workflows | 11 | 7 | 18 att avdubblera |
| commits | 170 | 81 | 251 |

- **~15× tyngre repo.** Varje klon, varje CI-checkout och varje sessionsstart
  betalar. Långt under GitHubs gränser, men valflasks elva workflows blir alla
  långsammare. `data/handlingar.json` är 17 MB och `data/nyckelord/` 37 MB.
- **Push-trängsel på en `main`.** `foreslag.yml` pushar efter varje löfte med
  en omförsöksloop, och en fullkörning tar timmar. Valflask har egna
  datacommittande körningar. Idag krockar de aldrig.
- **Skadeytan växer — `b-0017`:s uttryckliga skäl.** "Ett HV-byggfel kan inte
  fälla live-Fläskvågen." Mergat blockerar ett trasigt HV-bygge möjligheten
  att publicera en **rättelse** av ett löfte. För en sajt där tyst rättelse är
  förbjuden är det en verklig kostnad, och den måste vägas med öppna ögon.
- **Privatgrinden går inte att återta.** En fjärde våg som behöver samma
  inkubation får starta i ett eget repo igen.

## Den mekaniska nyckeln: en custom-domän per repo

GitHub Pages tillåter **en** custom-domän per repo. Det styr hela topologin:

- **Två repon** ⇒ två domäner ⇒ `utlovat.se` + `handlingsvagen.utlovat.se`.
  Det är dagens plan (`b-0021`).
- **Ett repo** ⇒ en domän ⇒ Handlingsvågen på **sökvägen**
  `utlovat.se/handlingsvagen`.

Och här inverteras `b-0021`. Det beslutet valde subdomän före sökväg med
motiveringen att en sökväg krävde en Cloudflare Worker som delar trafiken på
path — "ett extra rörligt element". Med **ett** repo är sökvägen bara en
katalog i samma bygge: ingen Worker, ingen andra domän, inget andra
certifikat. Invändningen som dödade sökvägsalternativet upphör att finnas.

Notera att `b-0017` ursprungligen valde just sökvägen
(`drygast.nu/handlingsvagen`), och att HV-sajten redan har byggts med
basstigen `/handlingsvagen` en gång. Sammanslagningen går alltså tillbaka till
den ursprungliga topologin, nu utan det som gjorde den dyr.

**Följd för lanseringen:** lanseras Handlingsvågen på subdomänen och flyttas
den sedan till sökvägen, byter varje HV-adress form. Då krävs 301:or från
`handlingsvagen.utlovat.se/*` till `utlovat.se/handlingsvagen/*`, och
`LANSERING.md`:s regel gäller: sökväg för sökväg, aldrig allt till
förstasidan.

**Därför bör valet göras FÖRE lansering, även om flytten görs efter.**
Lanseras HV direkt på sökvägen behövs ingen omdirigering någonsin. Det är
det enda i den här planen som är brådskande.

## Ordningen

Ingenting här rör privatgrinden; allt sker efter lansering utom steg 0.

**Steg 0 — före lansering (beslut, inte arbete).** Avgör om Handlingsvågen
lanseras på subdomänen eller direkt på sökvägen. Väljs sökvägen: sätt
`site/astro.config.mjs` till `https://utlovat.se` med bas `/handlingsvagen`,
och hoppa över subdomänsteget i `MIGRERING.md`. Väljs subdomänen: räkna med
301:orna ovan när flytten görs.

**Steg 1 — flytta HV in som en underkatalog.** Behåll historiken:

    git remote add hv <handlingsvagen>
    git fetch hv
    git merge --allow-unrelated-histories hv/main

Lägg HV under en egen rot (`handlingsvagen/`) i valflask, så att ingenting
kolliderar i första omgången. Två `pipeline/`-träd och två `site/`-träd får
leva sida vid sida tills steg 3.

**Steg 2 — förena anslagstavlorna och beslutsloggarna.** Här ligger den
verkliga risken, inte i koden.
- Två format: valflask har `DECISION_LOG.md` (markdown), HV har
  `data/beslutslogg.json` (b-0001–b-0024). Välj **ett** och konvertera det
  andra; JSON är maskinläsbart och kan renderas på sajten, markdown är
  lättare att skriva.
- **Numrera aldrig om någon annans post** — HANDOFF förbjuder det. Bär
  HV-posterna sina `b-`nummer vidare måste valflasks eventuella krockar
  lösas på valflasks sida, eller så prefixas serierna (`hv-0024`).
- Två HANDOFF-filer (80 + 38 KB). Slå ihop till en, men **tappa inte de
  dyrköpta anteckningarna** — de är den faktiska överlämningen.

**Steg 3 — slå ihop det som är dubbelt.** I den här ordningen, en sak per PR:
1. Citatgrinden → en delad källa. `src/citatgrind.ts` och den dubblerade
   testfilen tas bort; det pinnade fingeravtrycket flyttar till den delade
   sviten. **Detta är den PR som betalar för hela sammanslagningen.**
2. Temat → en källa (det `b-0017` ville med "paketera tokens" och som aldrig
   blev gjort).
3. Sökningen → enligt `SKISS-SOK.md`.
4. Workflows → 18 blir färre. Slå ihop de som gör samma sak (tester,
   typkontroll, deploy) och behåll de datahämtande var för sig, med **skilda
   `concurrency`-grupper** så de inte trängs om `main`.
5. Beroenden → ett `pipeline/` och ett `site/`. Idag samma versioner
   (Astro `^6.4.6`, TypeScript, ajv, tsx) — det är disciplin, inte något som
   upprätthålls, och sammanslagningen gör det upprätthållet.

**Steg 4 — en deploy.** Ett bygge, en custom-domän, Handlingsvågen på
sökvägen. `hv-pages.yml` upphör.

**Steg 5 — arkivera HV-repot.** Arkivera, radera inte: issue-historiken bär
granskningsbesluten (kopplingar godkända av människa), och de är en del av
spårbarheten.

## Vad som ska verifieras efteråt

- **Citatgrinden ger exakt samma utfall som före** — fingeravtrycket
  `ff6628547e7ba295` ska vara oförändrat. Ändras det har sammanslagningen
  lossat grinden, vilket aldrig får hända som bieffekt.
- Löftesantalet på HV-rutnätet matchar valflasks aktiva löften **utan** en
  vendor-körning (417 vid skrivandet).
- Varje HV-adress svarar, eller omdirigeras sökväg för sökväg.
- Rättelseloggarnas `affects` pekar fortfarande rätt — byter sökvägar form
  måste posterna följa med, annars är det precis det tysta felet som är
  förbjudet.
- Arkivkopiorna är orörda. De är ögonblicksbilder av riksdagens dokument och
  har inget med vår struktur att göra.
- Krönikorna räknas aldrig om.

## Vad som INTE ska göras

- **Inte slå ihop före lansering.** Privatgrinden gäller, och `LANSERING.md`
  utgår från två repon.
- **Inte bygga in HV i Fläskvågens `site/` som en tredje våg i samma
  Astro-rot i första steget.** Flytta in katalogen först, slå ihop sedan —
  annars görs migration och refaktorering i samma commit och ingen kan
  granska den.
- **Inte lossa en grind för att få bygget grönt.** Om två grindar krockar
  vinner den strängare.
