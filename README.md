# utlovat.se

> Neutral, källspårad granskning av de svenska riksdagspartierna inför riksdagsvalet den 13 september 2026.

**Live: [utlovat.se](https://utlovat.se)**

utlovat.se granskar partierna öppet och spårbart. Allvar i siffrorna, torr humor i glasyren.

## Tre vågar

Repot rymmer hela tjänsten. De tre vågarna delar infrastruktur, bygge och domän.

| Våg | Frågar | Var |
| --- | --- | --- |
| **Fläskvågen** | Vad kostar partiernas löften? Varje löfte har ett ordagrant citat med källa, ett kostnadsestimat med spann och en öppet redovisad uträkning. Summan för mandatperioden jämförs med regeringens reformbudget. | [utlovat.se](https://utlovat.se) |
| **Frågevågen** | Var står partierna i tio sakfrågor, cell för cell, belagt med exakta citat? Saknas ett rent citat lämnas cellen tom. | [utlovat.se/fragor](https://utlovat.se/fragor) |
| **Handlingsvågen** | Håller de vad de lovar? Väger partiernas och ledamöternas faktiska riksdagshandlingar mot löftena och ståndpunkterna. | [utlovat.se/handlingsvagen](https://utlovat.se/handlingsvagen) |

## Opartiskhet

Identisk insamling, metod och ton för alla åtta riksdagspartier. Inga röstrekommendationer, ingen värdering av sakpolitiken — bara *vad löftena kostar*, *vad partierna har sagt* och *vad de har gjort i riksdagen*. **Ingen reklam, inga intäkter, ingen finansiär** — en del av oberoendet.

## Så vet du att du kan lita på siffrorna

- **Ordagranna citat** — ett löfte, en ståndpunkt eller ett bevis publiceras bara om citatet står ord för ord i den hämtade källan. Det är den hårda spärren mot både påhitt och manipulation, och den lossas aldrig.
- **Källa + arkivkopia** för varje löfte, och ett **osäkerhetsspann** på varje belopp. En arkivkopia godtas bara om citatet står ordagrant i själva ögonblicksbilden.
- **Tomma celler är ärliga** — vi hittar aldrig på ett svar för att fylla täckning.
- **En människa godkänner varje belopp.** Inget maskinellt kostnadsestimat publiceras utan mänskligt beslut, och ingen koppling mellan löfte och riksdagshandling heller. Före varje godkännande prövas saken mot tre motparter — journalisten, den sakkunniga och det granskade partiet — och prövningen sparas.
- **Tyst rättelse är förbjuden.** Fel rättas synligt, med en rättelsenot på den berörda sidan och en post i den offentliga [rättelseloggen](https://utlovat.se/rattelser).

## Granska oss

För journalister, forskare och skeptiker — allt underlag är öppet:

- Metoden i klartext: [utlovat.se/metod](https://utlovat.se/metod)
- Öppet API (CC BY 4.0): [utlovat.se/api](https://utlovat.se/api)
- **[SPEC.md](SPEC.md)** — fullständig metod, neutralitetskontrakt och säkerhetsdesign för Fläskvågen.
- **[SPEC-FRAGEVAGEN.md](SPEC-FRAGEVAGEN.md)** — motsvarande för Frågevågen.
- **[DECISION_LOG.md](DECISION_LOG.md)** — varje beslut med motiv, i tidsordning.
- Git-historiken är en publik, omanipulerbar revisionslogg — varje sifferändring är spårbar.

## Hur den är byggd

En statisk sajt (Astro) driven av en schemalagd pipeline: den hämtar löften ur partiers och mediers källor, kör dem genom säkerhetsgrindar (citatet kontrolleras ord för ord mot källan, en oberoende modell verifierar, källtext behandlas som data och aldrig som instruktioner), kostnadssätter och lägger posten i en granskningskö. Handlingsvågen läser riksdagens öppna data och byggs i samma körning. Git är databasen, CDN är servern.

Ordningen är alltid densamma: **maskinen förbereder, en människa beslutar.** Byggd och underhållen av en privatperson på fritiden, med hjälp av AI.

```
pipeline/         hämtar, grindar, verifierar och kostnadssätter löften
site/             Astro-sajten för Fläskvågen och Frågevågen
handlingsvagen/   egen pipeline och sajt, byggs in under /handlingsvagen
data/             löften, ståndpunkter, körlogg, rättelselogg, granskningskö
ops/              drift och lanseringsrutiner
```

## Licens & kontakt

Data: **CC BY 4.0** — ange "utlovat.se" som källa. · [Om projektet](https://utlovat.se/om) · press: hej@utlovat.se
