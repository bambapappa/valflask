# utlovat.se

> Neutral, källspårad granskning av de svenska riksdagspartierna inför riksdagsvalet den 13 september 2026.

**Live: [utlovat.se](https://utlovat.se)**

utlovat.se granskar partierna öppet och spårbart. Allvar i siffrorna, torr humor i glasyren.

## WebMCP demo — evidence, not a verdict

**Live URL for WebMCP judges:** [utlovat.se/webmcp](https://utlovat.se/webmcp/).
It was tested live in ChatGPT's in-app browser and registers its tools through
the WebMCP browser API, including in Google Chrome when WebMCP is enabled.
The entry page and tool descriptions are in English; the underlying published
Swedish quotes remain in their original language so that they can be checked
against their sources.

### Why WebMCP fits this use case

Election evidence is most useful when the person and the agent inspect the
same material. WebMCP lets an agent retrieve only Utlovat.se's published,
source-traceable evidence and place it in the site's visible evidence board,
instead of producing an opaque political summary in a separate chat.

Together, a person and an agent can:

- search published promises and party positions by a neutral Swedish topic,
  party and archive-copy requirement;
- assemble a shareable research brief that shows exact quotes, dates, sources,
  archive copies when available, recorded unclear positions and bounded gaps;
- follow one promise from its published source to linked, human-reviewed
  parliamentary actions; and
- let the person read the visible sources and mark the board as read. Until
  then its status remains `unverified`; the agent can read that status but
  cannot set it.

The tools do not recommend a party, score parties or decide whether a promise
was kept. A blank result is described as a gap in the selected material, not
as proof that a party lacks a policy.

### Implementation and tested tools

The browser client registers read-only tools through
[`document.modelContext.registerTool`](site/src/scripts/webmcp.ts). It uses the
same public static Utlovat.se API data as the visible site — no separate
WebMCP backend and no private political dataset.

The English contest entry registers five global tools:

- `search_verified_evidence`
- `build_research_brief`
- `show_party_comparison`
- `get_evidence_board_status`
- `trace_promise`

Two contextual tools appear after navigation: `trace_current_promise` on a
promise page and `build_current_question_brief` on an issue page. The
generated browser client and its independent retest are covered by
[`test-webmcp.mts`](site/scripts/test-webmcp.mts) and
[`test-webmcp-retest.mts`](site/scripts/test-webmcp-retest.mts). The live URL
was tested in ChatGPT's in-app browser on 2026-08-27.

### Run locally

The complete source code and the assets needed to build the demo are in this
repository. With a current Node.js release and pnpm installed:

```bash
git clone https://github.com/bambapappa/valflask.git
cd valflask/site
pnpm install --frozen-lockfile
pnpm dev
```

Open the local `/webmcp/` page. It renders in a normal browser; the tools are
registered when the browser provides WebMCP. To build and run the site checks:

```bash
pnpm build
pnpm test
```

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

Koden är **[Apache-2.0](LICENSE)**. Rotfilen `LICENSE` är den licens GitHub
identifierar som Apache-2.0 och visar i repots About-metadata. Publicerade
data och innehåll är **CC BY 4.0** — ange "utlovat.se" som källa. ·
[Om projektet](https://utlovat.se/om) · press: hej@utlovat.se
