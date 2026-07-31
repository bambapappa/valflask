# Lansering och namnbyte — drygast.nu → utlovat.se

Planen hålls i **detta** repo eftersom det är privat. `valflask` är publikt,
och ett namnbyte som syns i commit-historiken innan det är gjort är inget
namnbyte — det är en förvarning.

Beslutet: när Handlingsvågen är färdig och ska gå live byter hela sajten
namn till **utlovat.se**. Fastställt genom mänskligt beslut 2026-07-26.

## Varför byta alls

`drygast.nu` fäller en dom. Namnet utser en vinnare i en tävling om vem
som är drygast, medan sajten i övrigt är byggd på att aldrig tycka något
datat inte bär: tomma celler lämnas tomma, citat kontrolleras ord för
ord, en människa godkänner varje koppling. Adressen är den enda plats där
tonen krockar med metoden — och den första en läsare ser.

`utlovat` namnger måttstocken i stället för domen. Ett parti som hållit
allt passar lika bra under namnet som ett som inte hållit något, vilket
är testet ett neutralt namn ska klara.

## Läget som planen utgår från

| | drygast.nu (valflask) | Handlingsvågen |
| --- | --- | --- |
| repo | publikt | privat — **öppnas vid lanseringen** (b-0024) |
| status | **live och fullt indexerbar** | inte driftsatt |
| värd | GitHub Pages bakom Cloudflares proxy | samma väg vid lansering (b-0024) |
| adress | `drygast.nu` | `utlovat.se/handlingsvagen` — sökväg, inget eget DNS (b-0025) |

**Viktigt att inte missa:** drygast.nu är inte "live i en mindre krets" i
teknisk mening. `site/public/robots.txt` tillåter allt, bjuder uttryckligen
in AI-agenter och pekar ut en sitemap. Sajten är alltså indexerad, och
namnbytet flyttar adresser som redan finns i sökmotorer och i vad andra
länkat till.

## Ordningen — namnbytet är SIST

1. **Rätta kalkylerna i valflask.** Pågår.
2. **Bygg klart Handlingsvågen:** nyckelordsindex (klart), sök med
   partifilter och röstfrågor, fullkörning av `foreslag`, arkivkopior.
   Se `HANDOFF.md`.
3. **Verifiera Handlingsvågen bakom privatgrinden.** `hv-pages` med
   `deploy=false` grön.
4. **Först då:** namnbytet, som ett eget sammanhållet moment.

Skälet att inte byta tidigare: varje vecka på det nya namnet utan färdig
sajt är en vecka då adressen finns men inte håller vad den lovar. Och
varje omdirigering man lägger på i förväg är en till sak som kan gå sönder
under bygget.

## Steg 0 — GJORT (kontrollerat 2026-07-29)

Alla tre domänerna är registrerade och ligger på Cloudflares namnservrar.
Läget i detalj, uppmätt och inte antaget:

| domän | namnservrar | poster | svarar |
| --- | --- | --- | --- |
| `utlovat.se` | Cloudflare (`brenda`/`scott`) | proxade A-poster mot GitHub Pages | **HTTPS med giltigt certifikat — men `404`** |
| `www.utlovat.se` | samma zon | samma | samma `404` |
| `utlovat.nu` | Cloudflare (`scott`/`brenda`) | **inga** | nej |
| `utlovat.com` | Cloudflare (`lola`/`porter`) | **inga** | nej |
| `handlingsvagen.drygast.nu` | — | **finns inte** (NXDOMAIN) | nej |

**Läs `404`:et rätt — det är goda nyheter.** Svaret kommer från GitHub Pages
(`x-github-request-id` i huvudena), genom Cloudflare, över ett giltigt
certifikat. DNS-vägen och SSL fungerar alltså redan hela vägen fram; GitHub
vet bara inte vilket repo `utlovat.se` hör till, eftersom ingen repo-inställning
ännu pekar ut den som sin custom domain. Det enda som fattas för huvudsajten är
därför steg 4 nedan — inte något DNS-arbete.

**Kvar att göra i zonerna:** `utlovat.nu` och `utlovat.com` är tomma och
behöver sina omdirigeringsregler (steg 6).

Skälet att ta alla tre står kvar:

- `.se` är kanonisk — signalerar svensk institution, vilket spelar roll
  när journalister ska hänvisa.
- `.nu` pekar mot `.se`. Bro från nuvarande adress.
- `.com` togs defensivt. Sajten pekar ut vad partier lovat och inte gjort,
  vilket gör den till ett naturligt mål: en irriterad sympatisör som
  registrerar den uppenbara adressen och lägger upp en parodi kostar mer
  i förtroende än domänen kostar i pengar.

Jaga inte svansen därutöver — `.org`, `.info`, felstavningar. Det går inte
att försvara allt, och nyttan faller brant efter de tre.

Spara registrarens inloggning **offline** (samma krav som
`ops/AGARSTEG.md` ställer på nuvarande domän).

## Vad namnbytet faktiskt rör

84 filer i `valflask` nämner `drygast`. De faller i fyra grupper med helt
olika risk.

### A. Ofarligt — text och konfiguration

Sidcopy, sidfot, `site: 'https://drygast.nu'` i `astro.config.mjs`,
`robots.txt`, sitemap-adressen, OG-bilder, meta-beskrivningar. Byts rakt
av. Enda kravet är att inget missas, så det görs med sökning över hela
repot och inte för hand.

### B. Kräver eftertanke — det publika API:t

`site/src/pages/api/v1/` levererar åtta ändpunkter, och flera bär
`attribution: "drygast.nu"` i sitt svar. Om någon redan hämtar dem går de
sönder av ett värdbyte.

- Adresserna måste svara på **båda** värdnamnen under en övergångstid.
- `attribution` byts till `utlovat.se` samtidigt som resten, inte före.
- Lägg en not i `changelog`-ändpunkten om bytet, med datum. Sajtens egen
  princip är att fel rättas synligt; ett namnbyte är inget fel, men en
  adressändring som andra bygger på ska heller aldrig ske tyst.

### C. Farligast — JSON-schemanas `$id`

14 filer under `pipeline/schemas/` bär rader som

    "$id": "https://drygast.nu/schemas/changelog.schema.json"

Ett `$id` är en **identitet**, inte en länk. Byter man den utan eftertanke
slutar äldre data valideras mot samma identitet som förr; låter man den
stå kvar pekar den nya sajten ut en adress som inte längre är dess egen.

**Gör så här:** byt `$id` till `utlovat.se` i samma svep som allt annat,
och låt `drygast.nu/schemas/*` fortsätta svara via omdirigering
permanent. Ett schema-`$id` som slutar svara är värre än ett som pekar
vidare. Kör schemavalideringen efteråt — den fäller om något halkat.

### D. Dokumentation som beskriver verkligheten

`ops/AGARSTEG.md` och `ops/RUNBOOK*` beskriver hur domänen är uppsatt.
De ska uppdateras **efter** att bytet är gjort, så de beskriver det som
gäller och inte det som var tänkt.

## Hur sajten faktiskt är driftsatt — läs detta först

Det är lätt att tro att Cloudflare serverar drygast.nu. Det gör den inte.

| | serveras av | konfigureras i |
| --- | --- | --- |
| `drygast.nu` | **GitHub Pages, bakom Cloudflares proxy** | `valflask` → Settings → Pages → Custom domain |
| Cloudflare Pages-projektet | ingen (saknar custom-domän) | icke-blockerande spegel i `build.yml` |
| Netlify | ingen | spegel i `mirror.yml` |
| DNS för `drygast.nu` | Cloudflare | proxade poster (orange moln) mot GitHub Pages |

`build.yml` kör `actions/deploy-pages` som **kanoniskt** bygge. Cloudflare-
och Netlify-stegen är märkta `continue-on-error` just för att de är
speglar och aldrig får fälla det riktiga bygget.

**Rättat 2026-07-29:** en tidigare version av det här dokumentet sa att
Cloudflare "bara gör DNS" åt huvudsajten. Det stämmer inte. `drygast.nu`
löser upp till Cloudflares egna anycast-adresser (`172.67.…`, `104.21.…`),
alltså **proxad** trafik — Cloudflare terminerar TLS med sitt eget
certifikat och hämtar från GitHub Pages som origin. Skillnaden spelar roll
för namnbytet, se fällan i steg 4 nedan. Namnbytet rör fortfarande **inte**
Cloudflare Pages.

**Handlingsvågen ligger på SÖKVÄGEN `utlovat.se/handlingsvagen` (b-0025).**
Ingen egen subdomän, ingen egen domän, inget eget Pages-projekt och ingen egen
deploy: samma bygge och samma custom-domän som Fläskvågen. Det följer av att
GitHub Pages bara tillåter en custom-domän per repo — en sökväg kräver alltså
att vågorna bor i ett repo, och därför **är sammanslagningen lanseringen**. Se
`SAMMANSLAGNING.md`.

Namnbytet nedan rör därmed bara **en** adress att sätta: `utlovat.se`.

## Domänbytet, steg för steg

1. ~~Lägg till `utlovat.se` som zon i Cloudflare~~ — **gjort.** Zonen är
   aktiv på Cloudflares namnservrar.
2. ~~Kopiera DNS-posterna från `drygast.nu`-zonen~~ — **gjort.** `utlovat.se`
   och `www.utlovat.se` har proxade poster mot GitHub Pages och svarar över
   HTTPS med giltigt certifikat (se steg 0).
3. **Verifiera domänen hos GitHub** (Settings → Pages → verified domains).
   Skyddar mot att någon annan gör anspråk på den.
4. **Byt custom domain** i `valflask` → Settings → Pages, från
   `drygast.nu` till `utlovat.se`. Vänta på HTTPS-certifikatet — det kan
   ta upp till en timme. Detta är steget som gör att `utlovat.se` slutar
   svara `404` och börjar servera sajten.
5. **Slå på omdirigeringen** på `drygast.nu`-zonen: ta bort GitHub
   Pages-posterna och lägg en Redirect Rule, 301, **sökväg för sökväg**:
   `concat("https://utlovat.se", http.request.uri.path)`. Inte allt till
   förstasidan — en delad länk till ett visst löfte ska landa på det
   löftet.
6. **Lägg omdirigeringsreglerna för `utlovat.nu` och `utlovat.com`** →
   `utlovat.se`. Båda zonerna är tomma idag och behöver en A- eller
   AAAA-post (eller en proxad platshållare) för att en Redirect Rule alls
   ska träffa — en regel utan post har ingen trafik att omdirigera.
7. **Handlingsvågen kräver inget DNS-arbete alls (b-0025).** Den ligger på
   sökvägen `utlovat.se/handlingsvagen` — ingen post, inget certifikat, ingen
   subdomän. Det som återstår är sammanslagningen, och den är lanseringen: se
   `SAMMANSLAGNING.md`.

**Fällan i steg 4:** GitHub Pages tillåter bara EN custom domän per repo.
I samma sekund `utlovat.se` sätts slutar `drygast.nu` serveras därifrån.
Förbered därför regeln i steg 5 i förväg, sparad men avstängd, och slå på
den direkt när certifikatet är klart. Annars ligger gamla adressen död en
stund.

**Den andra fällan i steg 4 — proxyn:** posterna är proxade (orange moln),
och GitHubs certifikatutfärdande validerar över HTTP. Med proxyn påslagen
svarar Cloudflare i GitHubs ställe och utfärdandet kan fastna, så att
"Enforce HTTPS" aldrig går att kryssa. Ställ posten på **DNS-only (grått
moln)** medan GitHub hämtar certifikatet, kryssa Enforce HTTPS, och slå
**därefter** på proxyn igen. Att `utlovat.se` redan svarar med giltigt
certifikat idag är Cloudflares eget Universal SSL — det säger ingenting om att
GitHub hunnit utfärda sitt. Ordningen behöver bara göras **en gång**, för
`utlovat.se`: Handlingsvågen ligger på sökvägen och har inget eget certifikat
(`b-0025`).

**Behåll `drygast.nu`-registreringen** i minst två år. En omdirigering är
värdelös den dag domänen går ut, och en utgången domän som andra länkat
till är precis vad någon annan vill ha.

**Kontrollera att `site/public/_headers` följer med** — CSP och HSTS ska
gälla på nya adressen från första minuten.

## Lanseringsdagen — vad som är förberett och vad som återstår

Uppdaterat 2026-07-31. Sammanslagningens steg 1–2 är gjorda på grenen
`claude/lansering-utlovat-emtbcq` i **det privata HV-repot** (en gren i
publika `valflask` vore publik). Grenen bär hela det sammanslagna trädet:
Fläskvågen och Frågevågen i roten, Handlingsvågen under `handlingsvagen/`,
båda historikerna kvar.

**Klart på grenen:**

- Trädet sammanslaget, alla grindar körda: 305 + 139 pipelinetester, båda
  typkontrollerna rena, båda sajterna byggda, citatgrindens fingeravtryck
  oförändrat.
- Ett bygge: `build.yml` bygger båda sajterna och lägger Handlingsvågen
  under `site/dist/handlingsvagen`. En custom-domän, en driftsättning.
- Namnbytet gjort i kod, sajttext, scheman och botens identitet:
  `drygast.nu` → `utlovat.se` överallt utom i historiska loggposter, i
  `ops/` (de beskriver hur det ÄR uppsatt och uppdateras efter bytet) och i
  Cloudflare Pages-projektets namn, som är ett riktigt projektnamn hos
  leverantören.
- Adressbytet står skrivet där det ska: en rad på förstasidan och ett
  `adressbyte`-fält i `/api/v1/changelog.json`.
- Vågarna länkar till varandra: "Handlingarna" i sidhuvudet och sidfoten,
  och tillbakalänk från Handlingsvågens sidhuvud.
- Handlingsvågen får en egen `sitemap.xml` som `robots.txt` pekar ut —
  annars vore tredje vågen läsbar men osynlig för sökmotorerna.

**Kvar, i ordning — det här är lanseringen:**

1. **Kontrollera att `hej@utlovat.se` går fram.** Presskontakten står på
   presssidan, i sidfoten och i README. En adress som studsar är värre än
   ingen adress. (Zonen ligger hos Cloudflare; e-postvidarebefordran sätts
   där.)
2. **Flytta Handlingsvågens inställningar till `valflask`**, annars slutar
   skörd och matchning fungera i samma stund trädet flyttar:
   hemligheterna `LLM_API_KEY` (eller `OPENROUTER_API_KEY`) och
   `LLM_ZAI_API_KEY`, variablerna `MODEL_KOPPLING`, `LLM_BASE_URL`,
   `MODEL_KOPPLING_ZAI` och `LLM_ZAI_BASE_URL`. `BOT_APP_ID`/`BOT_APP_KEY`
   finns redan där.
3. **Verifiera `utlovat.se` hos GitHub** (Settings → Pages → verified
   domains). Zonen och posterna finns sedan tidigare.
4. **Släpp lanseringsgrinden:** sista committen på grenen tar bort
   `noindex` i `handlingsvagen/site/src/layouts/Layout.astro`. Ligger den
   inte med — kontrollera innan pushen.
5. **Pusha det sammanslagna trädet till `valflask`.** Det är den publika
   handlingen. Låt bygget bli grönt innan nästa steg.
6. **Byt custom domain** i `valflask` → Settings → Pages till
   `utlovat.se`. Grått moln under certifikatutfärdandet, kryssa Enforce
   HTTPS, orange moln igen efteråt (se fällorna i steg 4 ovan).
7. **Verifiera på de nya adresserna innan något gammalt rörs:** förstasidan,
   ett löfte, ett parti, en ledamot, en djuplänk `?lofte=<id>`, en
   API-ändpunkt, rättelsesidan — och Handlingsvågens rutnät, partisida,
   ledamotssida, sök och filter under `utlovat.se/handlingsvagen`.
8. **Slå på omdirigeringarna** (stegen 5–6 i domänbytet ovan).
9. **Stäng av Handlingsvågens scheman i det privata repot** (`skord.yml`,
   `foreslag.yml`, `arkiv.yml`). Annars fortsätter de skörda dit, och de
   två datamängderna glider isär utan att någon märker det. Arkivera repot
   när du är säker på att inget saknas — arkivera, radera inte:
   issue-historiken bär granskningsbesluten.
10. **Anmäl den nya sajten i Google Search Console** och behåll den gamla
    egendomen så flytten syns.

**Rullbart tillbaka fram till steg 8.** Efter att omdirigeringarna slagits
på är vägen framåt att laga, inte att backa.

## Sekvensen vid själva bytet

Förbered allt utanför det publika repot, växla i ett svep. Namnbytet och
Handlingsvågens lansering är nu **samma händelse**, eftersom båda hänger på att
`utlovat.se` sätts som custom domain på det sammanslagna trädet (`b-0025`).

1. Förbered A–C-ändringarna i `valflask` **utan att pusha dem dit.** En gren i
   ett publikt repo är läsbar för alla, så namnbytet skulle synas i förväg —
   och tillsammans med det sammanslagna trädet även hela Handlingsvågen. Se
   "Var arbetet får ske" i `SAMMANSLAGNING.md`.
2. Slå ihop repona lokalt (`SAMMANSLAGNING.md` steg 1–3) och kör alla grindar
   där. Handlingsvågens `astro.config.mjs` bär redan `https://utlovat.se` med
   bas `/handlingsvagen`.
3. **Verifiera `utlovat.se` hos GitHub** (steg 3 ovan). Zonen och posterna
   finns redan; nya adresser svarar, gamla orörda.
4. Släpp privatgrinden: ta bort `noindex` i Handlingsvågens `Layout.astro`.
5. Pusha det sammanslagna trädet och **byt custom domain i `valflask`** till
   `utlovat.se` (steg 4 ovan) — grått moln under certifikatutfärdandet, orange
   igen efteråt.
6. Verifiera på de nya adresserna innan något gammalt rörs: förstasidan, ett
   löfte, ett parti, en ledamot, en djuplänk `?lofte=<id>`, en API-ändpunkt,
   ett schema-`$id`, rättelsesidan — **och** Handlingsvågens rutnät, partisida,
   ledamotssida, sök och filter under `utlovat.se/handlingsvagen`.
7. Slå på omdirigeringarna (stegen 5 och 6 ovan).
8. Sitemap och `robots.txt` pekar på nya adressen; anmäl den nya sajten i
   Google Search Console och behåll den gamla egendomen så flytten syns.

## Vad som ska verifieras efteråt

- En delad länk till ett enskilt löfte, tagen från före bytet, landar
  rätt — inte på förstasidan.
- Varje API-ändpunkt svarar på båda värdnamnen.
- Schemavalideringen är grön.
- Arkivlänkarna fungerar. **Arkivkopiorna ska inte röras** — de är
  ögonblicksbilder av riksdagens dokument och har inget med vår domän att
  göra. Bär en kopia vår gamla adress är det ett fel, inte något att
  uppdatera.
- Rättelseloggens `affects`-fält pekar på sökvägar eller löftes-id. Byter
  ingen sökväg är loggen orörd — **kontrollera att ingen gör det**, för
  en rättelsenot som tappar sin sida är precis det tysta felet som är
  förbjudet i projektet.
- Krönikorna är ögonblicksbilder och räknas aldrig om vid ett namnbyte.

## Om något går fel

Rullbart tillbaka fram till steg 7. Efter att omdirigeringarna slagits på
är vägen framåt att laga, inte att backa: att vända 301:or ger sökmotorer
och läsare motstridiga besked och gör mer skada än felet.

Därför är verifieringen i steg 4 den viktiga grinden — den ligger före
den punkt där det blir dyrt.

## Att säga något om bytet

Sajten byter namn medan den redan är läst. Det förtjänar en rad på
förstasidan och en post i ändringsloggen: vad som hette vad, från vilket
datum, och att gamla länkar fortsätter fungera. Inte för att det är ett
fel, utan för att en läsare som skrev upp en adress ska förstå vad som
hänt utan att behöva gissa.
