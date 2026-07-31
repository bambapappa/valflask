# drygast.nu — Fläskvågen

> Neutral, källspårad prislapp på svenska riksdagspartiers vallöften inför riksdagsvalet den 13 september 2026.

**Live: [drygast.nu](https://drygast.nu)**

drygast.nu väger valfläsket: varje vallöfte fångas, prissätts, summeras per parti och koalition, och översätts till jämförelser som alla förstår. Allvar i siffrorna, torr humor i glasyren.

## Opartiskhet

Identisk insamling, metod och ton för alla åtta riksdagspartier. Inga röstrekommendationer, ingen värdering av sakpolitiken — bara *vad löftena kostar* och *om finansiering anges*. **Ingen reklam, inga intäkter, ingen finansiär** — en del av oberoendet.

## Så vet du att du kan lita på siffrorna

- **Ordagranna citat** — ett löfte publiceras bara om citatet står ordagrant i den hämtade källan (hård spärr mot både påhitt och manipulation).
- **Källa + arkiv** för varje löfte, och ett **osäkerhetsspann** på varje belopp.
- **Öppen metod, öppna data** — inget sker i det dolda.

## Granska oss

För journalister, forskare och skeptiker — allt underlag är öppet:

- Metoden i klartext: [drygast.nu/metod](https://drygast.nu/metod)
- Öppet API (CC BY 4.0): [drygast.nu/api](https://drygast.nu/api)
- **[SPEC.md](SPEC.md)** — fullständig metod, neutralitetskontrakt och säkerhetsdesign.
- **[DECISION_LOG.md](DECISION_LOG.md)** — varje beslut med motiv, i tidsordning.
- Git-historiken är en publik, omanipulerbar revisionslogg — varje sifferändring är spårbar.

## Hur den är byggd

En statisk sajt (Astro) driven av en schemalagd pipeline: den hämtar löften ur partiers och mediers källor, kör dem genom säkerhetsgrindar (verbatim-kontroll, oberoende verifiering, anti-injektion), kostnadssätter och publicerar. Git är databasen, CDN är servern. Byggd och underhållen av en privatperson på fritiden, med hjälp av AI.

## Licens & kontakt

Data: **CC BY 4.0** — ange "drygast.nu" som källa. · [Om projektet](https://drygast.nu/om) · press: hej@drygast.nu
