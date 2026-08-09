# kanal/ — lodräta delningsbilder

Bilder i 1080×1920 för lodräta flöden (TikTok och liknande), riktade till
förstagångsväljare. Byggs av `site/scripts/generate-kanalbilder.mts`:

```sh
cd site && pnpm kanalbilder     # skriver om alla PNG:er och TEXTER.md
cd site && pnpm test:kanalbilder # grindarna: golv, mätningar, ramen
```

Ingenting här laddas upp automatiskt någonstans. Bilderna läggs upp för hand,
och [`TEXTER.md`](TEXTER.md) bär skärmtexten, ett förslag på bildtext och —
viktigast — vilket mätt tal varje avrundning vilar på.

## Tre serier

- **`a1`–`a7` — så funkar det.** Vad sajten är, de tre vågorna, hur ett löfte
  kontrolleras, varför rutor får stå tomma, hur fel rättas, vad man kan göra
  själv. Talen på dessa bilder (partier, mandat, ledamöter, sakfrågor) rör sig
  knappt, så bilderna åldras långsamt.
- **`b1`–`b7` — dagens siffror.** Summan, jämförelsen mot reformutrymmet,
  partiernas summor, Frågevågens rutnät, Handlingsvågens omfattning,
  arkivtäckningen — och ämnessöket, med `csn` som exempel.

- **`l1`–`l3` — artikelbilder, liggande 1920×1080.** Omslag till längre texter,
  skrivna för vuxna läsare med mer text och fler tal än de lodräta. `l1` har
  Handlingsvågen i fokus: vad partierna gjort i riksdagen under mandatperioden,
  och ämnessöket *Ämnen och ord*. `l2` beskriver hela sajten och de tre vågorna.
  `l3` är siffrorna just nu, samlade på ett ställe.

## Sökexemplen är räknade, inte hämtade från sidan

`b7` säger att `csn` ger över 90 handlingar och `l1` att `npf` ger 23. Båda
talen räknas fram i `kanalbilder.mts` på samma väg som sidan *Ämnen och ord*
själv går: sökordet stammas med `sokStammar` ur Handlingsvågens pipeline, bara
stammarna slås upp (visningsformerna är inte sökbara), betänkanden räknas inte,
och en träff som inte finns i handlingsregistret räknas inte heller — söket
hoppar över den, så den är ingen träff för läsaren.

Orden är valda för att de ger **ett** uppslag i indexet. "klimat" stammas till
både `klim` och `klimat`, och då känner sajten själv bara ett undre tak för
antalet. Ett tal som redan är avrundat nedåt ska inte dessutom vara ett tak för
ett tak.

## Varför det står "över" och inte det exakta talet

En bild ligger kvar i ett flöde långt efter att den lagts upp, och beståndet
växer varje vecka. Ett exakt tal är därför sant i några dagar och osant sedan.
Bilderna säger i stället det rundaste talet som ligger *under* mätningen utan
att tappa mer än en femtedel — "över 3 500 miljarder" där datat säger 3 816,8.

Det exakta talet är inte bortgömt: det står i `TEXTER.md` bredvid varje bild,
med mätdatum, och varje bild bär en källrad med datum och akt-hash. En grind i
`test-kanalbilder.mts` faller om ett golv någon gång skulle hamna över sin egen
mätning, eller om ett avrundat tal skrivs in på en bild utan att mätningen bakom
det registreras.

**Artikelbilderna (`l1`–`l3`) är undantaget: de skriver talen exakt.** De hör
till daterade texter som någon valt att öppna, och en läsare som klickar sig
vidare ska hitta samma tal i registret — ett golv hade där sett ut som slarv.
Ska en gammal artikel återanvändas: bygg om bilden först.

**Bygg om bilderna när ett golv passerats** — alltså när ett mätt tal vuxit så
att nästa runda tal ligger under det, eller sjunkit under sitt eget golv.
Kör om skriptet, ladda upp de bilder som ändrats, och byt ut de gamla i flödet.

## Kostymen

Samma som resten av sajten (`site/DESIGN.md`): papper, svärta, en signalfärg,
inga rundade hörn, inga skuggor, inga emoji. Anton för rubriker, IBM Plex Mono
för allt annat — sajtens brödtextfont är en variabel fil som satori inte kan
läsa, precis som i `generate-og.mts`.

Det lodräta formatet lägger till en regel: **allt som bär betydelse ligger i
den övre två tredjedelarna.** Appens egna knappar och bildtext täcker
underkanten, så nedersta fjärdedelen är medvetet tom och uppmaningen längst ned
säger inget som inte redan står på bilden.

Anton bär höga ringar och prickar. Ett `Ä` eller `Å` först på en bruten
rubrikrad skär in i raden ovanför, så rubrikerna är formulerade för att bryta
där det inte händer — det är därför de ser ut som de gör.

## Innehållsytan klipper, och grinden mäter det

Både ramar har en innehållsyta med låst höjd. Växer innehållet förbi den
försvinner det tyst: inget felmeddelande, och felet syns bara i bilden. Det
hände under bygget av `l1` och kostade en panels sista rad.

Grinden räknar därför inte höjder — den **mäter** dem. Samma innehåll ritas en
gång till i en avsiktligt alldeles för hög ram, och understa raden med bläck är
innehållets verkliga höjd. Ryms det inte med 8 px till godo faller grinden.
Marginalen är ett krav i sig: en layout som slutar exakt på kanten klipps så
snart ett tal blir en siffra längre, och talen kommer ur data som ändras varje
vecka.
