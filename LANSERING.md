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
| repo | publikt | privat |
| status | **live och fullt indexerbar** | inte driftsatt |
| Cloudflare Pages | projekt `drygast` | projekt `handlingsvagen` (ej skapat) |
| adress | `drygast.nu` | planerad subdomän |

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

## Steg 0 — gör detta NU, inte vid lanseringen

**Registrera `utlovat.se`, `utlovat.nu` och `utlovat.com`.** Alla tre var
lediga 2026-07-26. Tillgänglighet är inget som består, och kostnaden är
försumbar jämfört med att upptäcka vid lansering att namnet är borta.

- `.se` blir kanonisk — signalerar svensk institution, vilket spelar roll
  när journalister ska hänvisa.
- `.nu` pekar mot `.se`. Bro från nuvarande adress.
- `.com` tas defensivt. Sajten pekar ut vad partier lovat och inte gjort,
  vilket gör den till ett naturligt mål: en irriterad sympatisör som
  registrerar den uppenbara adressen och lägger upp en parodi kostar mer
  i förtroende än domänen kostar i pengar.

Jaga inte svansen därutöver — `.org`, `.info`, felstavningar. Det går inte
att försvara allt, och nyttan faller brant efter de tre.

Registrera hos valfri registrar och spara inloggningen **offline**
(samma krav som `ops/AGARSTEG.md` ställer på nuvarande domän).

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
| `drygast.nu` | **GitHub Pages** | `valflask` → Settings → Pages → Custom domain |
| Cloudflare Pages-projektet | ingen (saknar custom-domän) | icke-blockerande spegel i `build.yml` |
| Netlify | ingen | spegel i `mirror.yml` |
| DNS för `drygast.nu` | Cloudflare | DNS-poster som pekar mot GitHub Pages |

`build.yml` kör `actions/deploy-pages` som **kanoniskt** bygge. Cloudflare-
och Netlify-stegen är märkta `continue-on-error` just för att de är
speglar och aldrig får fälla det riktiga bygget.

Cloudflare gör alltså bara DNS åt huvudsajten idag. Namnbytet på
`utlovat.se` rör därför **inte** Cloudflare Pages.

**Handlingsvågen är undantaget.** Repot är privat, och GitHub Pages från
privata repon kräver betalplan. Därför ska `handlingsvagen.utlovat.se`
ligga på **Cloudflare Pages Direct Upload**. Den blandade uppsättningen —
huvudsajt på GitHub Pages, Handlingsvågen på Cloudflare Pages — är
avsiktlig.

## Domänbytet, steg för steg

1. **Lägg till `utlovat.se` som zon i Cloudflare** och peka domänens
   namnservrar dit hos registraren. Vänta tills zonen är aktiv.
2. **Kopiera DNS-posterna** från `drygast.nu`-zonen rakt av till den nya.
   Samma poster, ny zon — inget behöver slås upp, de befintliga är rätt.
3. **Verifiera domänen hos GitHub** (Settings → Pages → verified domains).
   Skyddar mot att någon annan gör anspråk på den.
4. **Byt custom domain** i `valflask` → Settings → Pages, från
   `drygast.nu` till `utlovat.se`. Vänta på HTTPS-certifikatet — det kan
   ta upp till en timme.
5. **Slå på omdirigeringen** på `drygast.nu`-zonen: ta bort GitHub
   Pages-posterna och lägg en Redirect Rule, 301, **sökväg för sökväg**:
   `concat("https://utlovat.se", http.request.uri.path)`. Inte allt till
   förstasidan — en delad länk till ett visst löfte ska landa på det
   löftet.
6. **Samma för `utlovat.nu` och `utlovat.com`** → `utlovat.se`.
7. **Handlingsvågen:** skapa Pages-projektet (Direct Upload, namnet
   `handlingsvagen`) och sätt custom domain `handlingsvagen.utlovat.se`.
   Se `MIGRERING.md` steg 3.

**Fällan i steg 4:** GitHub Pages tillåter bara EN custom domän per repo.
I samma sekund `utlovat.se` sätts slutar `drygast.nu` serveras därifrån.
Förbered därför regeln i steg 5 i förväg, sparad men avstängd, och slå på
den direkt när certifikatet är klart. Annars ligger gamla adressen död en
stund.

**Behåll `drygast.nu`-registreringen** i minst två år. En omdirigering är
värdelös den dag domänen går ut, och en utgången domän som andra länkat
till är precis vad någon annan vill ha.

**Kontrollera att `site/public/_headers` följer med** — CSP och HSTS ska
gälla på nya adressen från första minuten.

## Sekvensen vid själva bytet

Förbered allt i grenar, växla i ett svep.

1. Gren i `valflask` med alla A–C-ändringar. **Merga inte.** Publikt repo:
   en mergad commit är en offentlig förvarning.
2. Gren i `handlingsvagen` med `astro.config.mjs` → `handlingsvagen.utlovat.se`
   och motsvarande texter.
3. Cloudflare-stegen 1–3 ovan. Nya adresser svarar, gamla orörda.
4. Verifiera på de nya adresserna innan något gammalt rörs: förstasidan,
   ett löfte, ett parti, en ledamot, en djuplänk `?lofte=<id>`, en
   API-ändpunkt, ett schema-`$id`, rättelsesidan.
5. Släpp privatgrinden på Handlingsvågen — ta bort `noindex` i
   `Layout.astro` (`MIGRERING.md` steg 4).
6. Merga båda grenarna, driftsätt båda projekten.
7. Slå på omdirigeringarna (steg 4 ovan).
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
