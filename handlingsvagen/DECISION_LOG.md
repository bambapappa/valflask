
---

## 2026-08-22 — H2 prövas om varje vecka mot riksdagens källor, och svepet rapporterar

**Gäller:** Handlingsvågen. Fläskvågen och Frågevågen rörs inte — H2 prövar
kopplingar mellan löfte och riksdagshandling, och de finns bara här. Det
publicerade beståndet är kontrollerat i den våg raden nämner: svepet är kört
mot samtliga aktiva kopplingar i `kopplingar.json`.

**Beslut (mänskligt beslut 2026-08-22):** Ordagrannheten i publicerade
kopplingar prövas om veckovis mot riksdagens dokument. `h2-svep.yml` kör
`pnpm h2-svep`, som för varje aktiv koppling hämtar källdokumentet och prövar
båda leden i H2: att citatet står tecken för tecken i dokumentet, och att det
står i den del som ÄR handlingen. Utfallet skrivs till
`handlingsvagen/data/h2-svepet.json`.

Svepet **rapporterar och spärrar aldrig**. Ett fynd är ett mätvärde, inte ett
haveri, och körningen blir röd bara när svepet självt är trasigt — när mer än
hälften av kopplingarna inte gick att pröva alls. Att skriva «inga fynd» efter
en körning som inte kunde pröva något vore att rapportera tystnad som ett
friskintyg. De 76 kopplingar som med flit citerar brödtexten på utskriven
grund (`bevis.brodtext_oppen`) räknas för sig och är inga fynd.

**Motiv:** H2 prövas när en koppling skapas och sedan aldrig mer.
Kopplingarna bär bara metadata — dokumenttexten ligger hos riksdagen — så det
som står på sajten vilar på en kontroll gjord en gång, mot någon annans text.
Att den kontrollen åldras är mätt: andra ledet i H2 tillkom 2026-08-06 efter
att kön fyllts, och när kön kördes om mot den nya regeln föll 354 poster till
69. Frågorna kom in i grinden först 2026-08-14. Varje sådan skärpning gäller
bara det som prövas efter den, om ingen kör om — och omkörningen gjordes med
ett skript som låg utanför repot.

**Förkastade alternativ:** en byggrind som prövar H2 vid varje bygge — den
talar med riksdagens API och hade fallit när nätet gör det, inte när datat är
fel; att låta svepet rätta självt — ett citatbyte är en rättelse med
rättelsepost och ett mänskligt beslut, och tyst rättelse är förbjuden; att
räkna brödtextcitaten som fynd — de 76 hade fyllt listan varje vecka och lärt
läsaren att bortse från den.

---

## 2026-08-11 — Tom cell skiljs från oenighet och besläktning blir ett eget granskat lager

**Beslut (mänskligt beslut 2026-08-11):** Rutnätet ska säga direkt att det
inte jämför partiernas löften med varandra. Den tomma statusen benämns
"ingen godkänd koppling" och förklaras som frånvaro av en koppling på just
den raden, inte som politisk oenighet eller avsaknad av politik.

Möjliga relationer av typen "liknande riktning, olika åtaganden" tas fram i
ett separat förslagsskikt. Automatik får göra grovurval ur löften och nya
handlingar, men resultatet är oprövat tills en människa läst båda löftenas
egna ord. En sådan relation får senare komplettera detaljvyn med text och
referenser; den får aldrig fylla en cell eller ändra en dom.

**Motiv:** Rutnätsformen lockar läsaren att tolka ett streck som "partiet
håller inte med", trots att kopplingspipelinen besvarar den smalare frågan om
en godkänd handling finns på just löftesraden. Samtidigt skulle ett mjukare
cellutfall blanda granskat handlingsbevis med en bredare politisk tolkning.
Två lager behåller den hårda beviskedjan och ger plats för den nyans läsaren
saknar.

**Förkastade alternativ:** lägga till "nästan i linje" som cellstatus — det
gör en semantisk närhet till ett handlingsbevis; fylla andra partiers celler
genom automatisk likhetsmatchning — det publicerar en politisk tolkning utan
mänskligt beslut; bara förklara strecket och aldrig visa besläktade löften —
det förebygger feltolkningen men lämnar den sakliga likheten osynlig.

**Påverkan:** `site/src/pages/index.astro`, rutnätsgrinden och den privata
skillen `gruppera-beslaktade-loften` i `bambapappa/handoff`. Ingen koppling,
dom eller publicerad löftespost ändras i detta steg.

---

## 2026-08-11 — Den återstående kopplingskön avgörs 24/2

**Beslut (mänskligt beslut 2026-08-11):** den samlade rekommendationen för de
26 återstående kopplingsförslagen verkställs: 24 godkänns och 2 avvisas.
Underlaget post för post ligger i `bambapappa/handoff`,
`KOPPLINGSKO-REST-26-2026-08-11.md`.

- `k-2026-0845`–`k-2026-0868` är de 24 nya kopplingarna: 7 partilinjer och
  17 ledamotshandlingar.
- Fyra frågor/interpellationer bär den faktiska frågelydelsen, ordagrant
  omprövad mot Riksdagens dokument, i stället för köförslagets bakgrundstext.
- Två förslag avvisas. KD:s ja till att avslå V:s psykiatriyrkande visar inte
  KD:s eget agerande för det ospecificerade psykiatrilöftet. Ett allmänt nytt
  resursfördelningssystem för skolan säger inte att huvudmän som anställer
  behöriga lärare ska premieras ekonomiskt.
- Sakgrupperna är en granskningshjälp, inte en datagrupp. Återkommande
  likalydande motioner från skilda riksmöten står därför kvar som separata
  handlingar.

**Påverkan:** kopplingskön går från 26 till 0. C får partidomen
`agerat_i_linje` på `p-2026-0704` och `p-2026-0705`. På `p-2026-0708` får S
`agerat_i_linje` genom kommittémotionen och sin nej-röst till att avslå det
egna yrkandet; M, KD, L, SD och MP får `agerat_emot` genom sina ja-röster till
avslaget. Enskilda motioner, frågor och interpellationer syns bara som
ledamotshandlingar.

**Tekniskt fynd under verkställandet:** voteringskopplingen kunde först inte
skapas. Grinden krävde de avslagna yrkandenas lydelser före skapandet, medan
`avslag-backfill` bara nådde redan skapade kopplingar. `b-0041` gör vägen
sammanhängande: alla godkännandekanaler hämtar hela avslagsunderlaget först och
stoppar om en enda lydelse saknas. Två hänvisningar i JuU42 punkt 3 gäller
delyrkanden som Riksdagens öppna data endast publicerar inuti ett enda
sammansatt moder-yrkande. Hela den enda officiella lydelsen visas då med både
moder- och delhänvisningen; finns flera möjliga moder-yrkanden stoppas
godkännandet i stället för att gissa.

---

## 2026-08-10 — Sju handlingar godkänns mot löftet om utbyggt totalförsvar

**Beslut (mänskligt beslut 2026-08-10):** de sju genomgångna köförslagen mot
`p-2026-0691` godkänns enligt det samlade underlaget i `bambapappa/handoff`.

- `k-2026-0838`–`k-2026-0841` är fyra kommittémotioner från fyra riksmöten.
  De är separata handlingar och räknas som partilinje.
- `k-2026-0842`–`k-2026-0844` är två skriftliga frågor och en
  interpellation. De är separata ledamotshandlingar och får aldrig fälla en
  partidom.
- `k-2026-0844` bär den ordagrant källprövade frågelydelsen ur `HB1119`, inte
  köförslagets tidigare bakgrundsmening.

**Motiv:** alla sju handlingarna stödjer samma breda riktning — att bygga ut
totalförsvaret — men de är inte dubbletter. Motionerna upprepas i skilda
riksmöten; ledamotshandlingarna gäller tre olika delar av utbyggnaden.

**Påverkan:** sju köposter flyttas till `data/kopplingar.json`, kön går från
33 till 26 och `data/domar.json` räknas om. Fyra nya kopplingar kan bära
partilinje; de tre övriga syns enbart i ledamotsmeriterna.

**Rättelse som verkställandet utlöste:** dommotorn gav också mottagande
statsråd frågeställarens ledamotsmerit. Den avvikelsen blev synlig när de tre
nya ledamotshandlingarna räknades om. Samma aktörsurval som redan gäller i
förslagsgrinden används nu även i dommotorn; den tillfrågade ministern räknas
inte, och dubbletter i Riksdagens intressentlista kan inte dubblera en merit.
Den synliga rättelsen står i `data/rattelser.json`.

## 2026-08-04 — `Bevis:` byter citat i ett kopplingsbeslut

**Beslut (mänskligt beslut 2026-08-04):** Kopplingskommandot får en fjärde
form. En rad som börjar `Bevis:` under `/godkänn` byter ut förslagets citat mot
ett annat ur samma dokument. Det nya citatet hämtas mot källan och prövas
**ordagrant** med samma kanon och samma golv som H2 använder när förslaget
skapas. Håller det inte sker ingen ändring alls — varken i kön eller i
kopplingarna.

**Motiv:** Genomgången 2026-08-02 lade 28 förslag i högen "citatet bär inte,
men dokumentet bär sannolikt ett bättre". Den högen var **oåtkomlig**:
kommandot kunde godkänna, sätta motionstyp och avvisa, ingenting annat. Beviset
bor i `kopplingsforslag.json`, och att ändra där för hand hade gjort issuetexten
osann — den som beslutar hade läst ett citat medan datat bar ett annat.

Kontrollen av det nya citatet ligger i handlerskriptet, inte i den rena
logiken: `granskning.ts` når aldrig nätet, och källtexten måste hämtas som
dokumentet ser ut NU. `provaNyttBevis` är därför en ren funktion som tar både
citatet och källtexten, och anroparen ansvarar för hämtningen.

**Ett nätfel är inte ett underkänt citat.** Går hämtningen inte fram svarar
körningen att källan inte kunde läsas och att inget beslut är fattat. Att svara
"citatet håller inte" när vi inte kunnat läsa källan vore att påstå något vi
inte vet.

**Förkastade alternativ:** `--bevis "…"` på kommandoraden (citat bär
skiljetecken och citattecken; en märkt rad tål allt utom radbrytning och
speglar granskningsköns `Uträkning:`); att låta vilken fritext som helst under
kommandot bli bevis (då hade en kommentar kunnat hamna i ett publicerat citat);
att ändra i `kopplingsforslag.json` för hand och synka om issuena (fler steg,
och mellanläget bär ett citat ingen läst); att lita på förslagsstegets
kontroll och hoppa över omprövningen (citatet är nytt — det har aldrig prövats).

**Påverkan:** `pipeline/src/granskning.ts` (`provaNyttBevis`, `bevis` i
kommandot och i `godkannForslag`, issuemallens beslutstabell),
`pipeline/scripts/koppling-kommentar.mts` (hämtar källtexten och prövar före
beslut). Fyra nya grindar, 154 tester gröna, typecheck rent.

**Spåret syns i datat:** ett utbytt bevis skriver in
"(beviset utbytt av granskaren mot ett annat citat ur samma dokument)" i
kopplingens motivering, och svaret i issuet återger det nya citatet i sin helhet.
