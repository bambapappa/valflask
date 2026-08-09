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
- **`b1`–`b6` — dagens siffror.** Summan, jämförelsen mot reformutrymmet,
  partiernas summor, Frågevågens rutnät, Handlingsvågens omfattning och
  arkivtäckningen.

- **`l1` — artikelbild, liggande 1920×1080.** Omslag till en längre text, med
  Handlingsvågen i fokus: vad partierna gjort i riksdagen under mandatperioden,
  och ämnessöket *Ämnen och ord*. Skriven för vuxna läsare, med mer text och
  fler tal än de lodräta.

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

**Artikelbilden (`l1`) är undantaget: den skriver talen exakt.** Den hör till en
daterad text som någon valt att öppna, och en läsare som klickar sig vidare ska
hitta samma tal i registret — ett golv hade där sett ut som slarv. Ska en gammal
artikel återanvändas: bygg om bilden först.

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
