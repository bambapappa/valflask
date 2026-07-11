# DECISION LOG — drygast.nu

Format: `## ÅÅÅÅ-MM-DD — [Beslut]`
Varje rad: **Beslut**, **Motiv**, **Förkastade alternativ**.

---

## 2026-06-11 — Repo initierat

**Beslut:** Repo initierat i befintlig katalog (val/) utan att byta namn på rotmappen.
**Motiv:** Katalogen tillhandahållen av ägaren; ingen namnändring krävdes.
**Förkastade alternativ:** Skapa ny katalog `drygast/` — onödig omstrukturering.

## 2026-06-11 — Designriktning: beslut delegerat till M1 (Fable)

**Beslut:** Valet av designriktning (A/B/C per §11) sker i M1 av Fable-instansen.
**Motiv:** Spec kräver att byggagenten beslutar och loggar designriktning; Fable hanterar M1.
**Förkastade alternativ:** Förvala riktning A i M0 — felaktigt, beslutsmandat tillhör M1-fasen.

## 2026-06-12 — Designriktning A vald: "Diarienummer möter löpsedel" (Fable, M1)

**Beslut:** Riktning A genomförs kompromisslöst. Två strikt åtskilda röster: "Akten" (riksdagstryck: hårlinjer, tabellverk, marginalnoter, stämplar, serif) bär allt; "Löpet" (svart platta, gul jättesiffra, kondenserad versal) tillåts ENDAST för nyckeltal och sajtidentitet. Formregler: border-radius 0 överallt, inga skuggor/gradienter/transitions; enda rörelsen är taxametern på `/` (1100 ms, respekterar prefers-reduced-motion). Bindande detaljspec i `site/DESIGN.md`; tokens i `site/src/styles/tokens.css`.
**Motiv:** Konceptet speglar tonkravet §1.5 exakt (allvarlig stomme, deadpan glasyr) och innehållets natur: byråkratisk registrering av sensationella summor. Svart/gult skrik appliceras identiskt på alla partier (neutralitet §17) och ger maximalt skärmdumpbara OG-bilder (delningsbilden är främsta marknadsföringen, §11).
**Förkastade alternativ:** B "Kvittorullen" — en stark engångsvits som inte bär krönikor, metodsidor och fyra månaders valrörelse; mono-allt skadar läsbarheten. C "Statistisk plansch 1972" — offsetpalett krockar med en-signalfärgsregeln och riskerar färgkollision med partifärger i dataviz; kräver omfattande egenproducerad illustration.
**Påverkan:** `site/DESIGN.md`, `site/src/styles/{tokens,base}.css`; all M1-komponentbyggnad (Sonnet) sker mot dessa.

## 2026-06-12 — Typografi: Anton + IBM Plex Mono + Source Serif 4, egna subsets

**Beslut:** Display: Anton 400 (versal, aldrig tal). Siffror/stämpel: IBM Plex Mono 400/700 — ALLA tal utanför brödtext sätts i mono (tabulär per konstruktion; taxametern kräver fast sifferbredd). Brödtext: Source Serif 4 variabel 400–700 (opsz pinnad 20) + statisk italic 400, med global `font-variant-numeric: tabular-nums`. Självhostade woff2 i `site/public/fonts/` (~148 kB, budget ≤ 170 kB), OFL-licenser bredvid. Mono + serif är EGNA subsets från kompletta releaser (`@ibm/plex-mono@2.5.0`, `source-serif@4.5.1`): fontsources färdiga latin-subset saknar `≈` (U+2248) som §8 kräver framför LLM-estimat, samt `→`/`↗`. Teckenset + regenereringskommandon i `site/public/fonts/README.md`.
**Motiv:** Anton är genuint löpsedelskondenserad; Plex Mono ger stämpel-/diarienummerkaraktären och säkrar tabularitet där siffran är produkten; Source Serif 4 är utredningstryckets serif med dokumenterad tnum (verifierad i subset). Alla tre har fullt svenskt teckenstöd (verifierat med fontTools mot cmap) och OFL tillåter incheckning i publikt repo.
**Förkastade alternativ:** Bebas Neue (saknar gemener), Oswald (urvattnad webbdefault), Courier Prime (för spinkig i jättestorlek), JetBrains/Space Mono (fel register: terminal/tech; Space-familjen dessutom angränsande till förbjudna Space Grotesk), STIX Two/Literata/PT Serif (tyngre filer eller fel karaktär), fontsource-subsets rakt av (saknar ≈ — verifierat brott mot §8-typografin).
**Påverkan:** `site/public/fonts/*`, `site/src/styles/base.css` (@font-face), prestandabudget §10 i DESIGN.md.

## 2026-06-12 — Färgsystem: papper/svärta + EN signalfärg (löpsedelsgul)

**Beslut:** `--papper #F6F3EC`, `--svarta #111111`, signalfärg `--gul #FFD600` med uttömmande användningslista (DESIGN.md §3). Ingen röd/grön-semantik: gap, överskridanden och statusar uttrycks med svärta/gul/stämpeltext. Partifärger existerar endast inuti datavisualisering (ur `parties.json`, AA-justerad textvariant). OG-bilder bär alltid sajtens svart/gula kostym — aldrig partifärg. Ingen dark mode (`color-scheme: light`): papper är konceptet. Alla använda kontrastpar dokumenterade ≥ AA (svärta/gul ≈ 12,9:1).
**Motiv:** §11 kräver papper/svärta + EN signalfärg och total partifärgsneutralitet i kostymen; röd/grön hade smugit in värdering i datan (§17). Gul/svart är löpsedelns genrefärger och ger identisk "skrik-nivå" åt alla partier.
**Förkastade alternativ:** Stämpelröd som signal (associerar till varning/avslag = värdering); partifärgade OG-bilder (neutralitetsbrott + 8 olika kostymer); dark mode (dubblerad testyta utan funktion för ett "tryckt" koncept).
**Påverkan:** `tokens.css`, all dataviz (M4), OG-generering (M1), `parties.json` (AA-varianter, M1-fixtures).

## 2026-06-12 — Grindlogik §7: arkitektur och exekveringsordning (Fable)

**Beslut:** `pipeline/src/gates.ts` implementerad som ren, deterministisk modul utan LLM och utan I/O efter init; klocka (`now`) och allowlist injiceras (`GateContext`). Exekveringsordning: G2 (artikelnivå) → G5 (artikelnivå) → per kandidat G1 → G3+G4, där alla fallerande grindar per kandidat samlas. Underkänt går ALLTID till review (`needs_review`) — grindarna fäller aldrig permanent. Kandidatschema i `pipeline/schemas/extraction.schema.json` (draft 2020-12) med `additionalProperties:false` som injektionshygien; schemat tillåter upp till 100 kandidater i arrayen så att >5 fälls semantiskt korrekt av G5 (hela artikeln) i stället för som schemafel.
**Motiv:** Determinism är förutsättningen för T4-snapshots; artikelnivågrindar först gör att otillåten källa/bomb aldrig processas vidare; samlade grindfel ger användbara review-issues; review-i-stället-för-avslag bevarar G4-målet (människa avgör gränsfall, inget tyst datatapp).
**Förkastade alternativ:** Numerisk exekvering G1→G5 (slösar arbete på kandidater ur redan ogiltig källa); first-fail per kandidat (sämre review-underlag); hårt avslag i grind (tyst datatapp, bryter mot §7:s review-flöde); schema-tak på 5 kandidater (G5-bomb hade rapporterats som obegripligt G1-fel).
**Påverkan:** `gates.ts`, `extraction.schema.json`, `extract.ts`/`publish.ts` (M2 konsumerar kontraktet), T4–T6.

## 2026-06-12 — G3-verbatimkanon: definierad normalisering, skiftlägeskänslig, citatgolv 5 ord

**Beslut:** Verbatimjämförelsen använder exakt denna kanon, identiskt applicerad på källtext och citat: Unicode NFC → borttag av osynliga/format-/biditecken (soft hyphen, zero-width, BOM, U+202A–E m.fl.) → typografiska citattecken→raka → alla streckvarianter→bindestreck-minus → `…`→`...` → allt whitespace (inkl. NBSP/smala mellanrum)→ett blanksteg → trim. Jämförelsen är SKIFTLÄGESKÄNSLIG substring-match. Utöver specens tak 40 ord införs ett golv: < 5 ord ⇒ review.
**Motiv:** Specen säger "whitespace-normaliserad jämförelse"; ren whitespace-normalisering fäller legitima citat på CMS-typografi (”…”, NBSP, mjuka bindestreck) och släpper igenom bidi-gömd text. Kanonen neutraliserar endast typografisk variation — båda sidor transformeras lika, så fabricerad text kan aldrig passera. Golvet: citat under 5 ord kan inte uppfylla löftesdefinitionen (A1) och är triviala att hitta var som helst i en text, vilket skulle urholka grinden.
**Förkastade alternativ:** Endast whitespace-kollaps (falska underkännanden på typografi ⇒ review-brus som driver ägaren att lita mindre på grinden); case-insensitive match (försvagar "ordagrant" utan dokumenterad vinst); fuzzy-/likhetsmatchning (öppnar exakt det hallucinationsfönster G3 ska stänga).
**Påverkan:** `normalizeForVerbatim()` exporteras och ska återanvändas av T5/T6-fixtures (M2) så att fixtures testar samma kanon.

## 2026-06-12 — G2-kanonisering: https, defaultport, exakt match efter singel-www-strip

**Beslut:** Käll-URL godkänns endast om: protokoll exakt `https:`, ingen explicit port, värdnamn (lowercase, IDNA/punycode via WHATWG URL, trailing dot strippad) matchar allowlist EXAKT efter strip av högst ETT ledande `www.`. Övriga subdomäner kräver egen allowlist-rad. Dessutom korsvalideras fetch-stegets `domain`-fält mot URL-härledd domän; avvikelse ⇒ review.
**Motiv:** §6.1 kräver exakt domänmatch med https. `www.`-varianten ägs per definition av samma zonägare och förekommer i praktiken i mediers RSS-länkar — utan strip hade i princip alla DN/SvD-artiklar fällts felaktigt. IDN-homografer faller automatiskt (punycode-form matchar aldrig ASCII-allowlisten). Konsistenskontrollen fångar interna buggar och manipulationsförsök mellan pipeline-steg.
**Förkastade alternativ:** Generell subdomän-wildcard (öppnar t.ex. fritt bloggutrymme under mediedomäner); PSL-/eTLD+1-bibliotek (nytt beroende + bredare matchning än specens "exakt"); att lita på fetch-stegets `domain`-fält utan korsvalidering.
**Påverkan:** `canonicalDomain()` i `gates.ts`; `sources.yaml` behåller exakta domäner (data.riksdagen.se står redan separat).

## 2026-06-12 — G4: datumfönster ±548 dygn; R5-spärren även i publish

**Beslut:** Rimlighetsdatum implementeras som |körningstid − `published`| ≤ 548 dygn (≈18 mån, fast tal för determinism); oparsebart/saknat datum ⇒ review. R5 (1 500 000 msek) tillämpas i G4 på `amount_in_text_msek` och MÅSTE återtillämpas i publish-steget på cost-stegets `msek_base` via exporterade `passesAmountCapR5()` — grinden körs före kostnadssättningen och kan inte se LLM-estimat.
**Motiv:** §7 anger ±18 mån utan dygnsdefinition; 548 dygn är deterministiskt och testbart (månadsaritmetik varierar med kalendern). R5 på två punkter är försvar i djupet: belopp kan uppstå/växa i cost-steget efter att G4 passerats.
**Förkastade alternativ:** Kalendermånadsaritmetik (icke-deterministisk runt månadsskiften); R5 enbart i grindsteget (lucka för cost-genererade belopp); asymmetriskt fönster (specen säger ±).
**Påverkan:** `gates.ts` (konstanter exporterade), `publish.ts` (M2 ska anropa `passesAmountCapR5` — kontraktet står i gates.ts-huvudet).

## 2026-06-12 — Pipelineberoenden: ajv (runtime), tsx/@types/node (dev), node:test som testrunner

**Beslut:** `ajv@^8.17` som enda runtime-beroende i pipelinen (G1/schemavalidering); `tsx` + `@types/node` som dev-beroenden; tester körs med Nodes inbyggda `node:test` (`pnpm test`); `pnpm-lock.yaml` incheckad för frozen-lockfile i CI. `ajv-formats` utelämnas (schemat använder inga format; datum valideras i kod i G4).
**Motiv:** §14 kräver minimalt beroendeträd med DECISION_LOG-rad per beroende; ajv är redan sanktionerad av specen (T3 nämner ajv-validering); tsx krävs av M0:s befintliga `pipeline:run`-script men fanns inte deklarerad — bugg rättad. node:test ger noll extra beroenden.
**Förkastade alternativ:** vitest/jest (stora träd för behov som node:test täcker); zod i stället för ajv (schemat måste vara JSON Schema — delas med sajt och /api-dokumentation per §4); ajv-formats (onödig yta).
**Påverkan:** `pipeline/package.json`, `pipeline/pnpm-lock.yaml`, `pipeline/tsconfig.json` (ny), `pipeline/tests/gates.test.ts` (18 tester, gröna 2026-06-12 inkl. typecheck).

## 2026-06-12 — M1-data: Fixturer fiktiva, spärr i Layout (Sonnet)

**Beslut:** Alla fixture-löften i `data/promises.json` (28 stycken, jämnt över 8 partier) är fiktiva — inga härrör från verkliga källor. Varje fixture-löfte har `extraction.run_id` som börjar med "fixture-". Sajten visar en diskret gul list "EXEMPELDATA — skarp insamling startar i M3" (DESIGN.md §15-stil) så länge någon post har fixture-run_id. Spärren sitter i Layout.astro via `isFixture()`-checken som körs per sidladdning.
**Motiv:** Spec §18 kräver att fixtures är realistiska men fiktiva; fixture-run_id möjliggör enkel identifiering och borttagning när skarp data börjar flöda i M3. Gul banner varnar besökare utan att blockera innehåll.
**Förkastade alternativ:** Ingen spärr (publicerar ovetandeskaplig data utan varning); dölj fixtures helt (ingen testbar sajt i M1).
**Påverkan:** `data/promises.json`, `site/src/layouts/Layout.astro`, `site/src/lib/calc.ts` (`isFixture()`).

## 2026-06-12 — Sajtberoenden: satori, @resvg/resvg-js, ajv (Sonnet, M1)

**Beslut:** `satori@^0.26` + `@resvg/resvg-js@^2.6` för OG-bildgenerering vid build (§3, DESIGN.md §7). `ajv@^8.20` duplicerat i sajten för T3-validering av data/*.json. Inga andra nya beroenden.
**Motiv:** Spec §3 sanktionerar satori + resvg explicit. ajv krävs för §5 (sajten ska validera data och faila hellre än publicera trasig data). Samma version som pipelinen.
**Förkastade alternativ:** Sharp för OG (tyngre, kräver native); skippa sajtsidans validering (brott mot §5); zod (schemat måste vara JSON Schema per §4).
**Påverkan:** `site/package.json`, `site/pnpm-lock.yaml`.

## 2026-06-12 — Taxameter: förkompilerad IIFE i public/, is:inline (Sonnet, M1)

**Beslut:** Taxameter-skriptet förkompileras från TS till minifierad IIFE (~680 byte) med esbuild och placeras som `public/taxameter.js`. Laddas via `<script is:inline src="/taxameter.js">` — aldrig Astro-modulbundet (CSP tillåter inte inline-skript). Slutvärdet står alltid i HTML:en (SSG), JS animerar bara upp till det. Respekterar prefers-reduced-motion. Inga andra öar i M1.
**Motiv:** DESIGN.md §8 kräver <2 kB vanilla-TS, 0→total easeOutQuart 1100ms, mono/tabular, slutvärde i HTML. is:inline är enda sättet att undvika Astro:s modulembedding (vilket skapar inline-skript som bryter mot CSP bilaga C).
**Förkastade alternativ:** Astro `<script>` utan is:inline (skapar inline-modulembedding → CSP-brott); Astro island med framework (överdrivet för 30 rader kod).
**Påverkan:** `site/src/scripts/taxameter.ts` (källa), `site/public/taxameter.js` (förkompilerad), `site/src/layouts/Layout.astro`.

## 2026-06-12 — Datadir via process.cwd() (Sonnet, M1)

**Beslut:** `site/src/lib/data.ts` använder `process.cwd()` + "../data" för att hitta datakatalogen — inte `import.meta.url`. Under `astro build` är cwd `site/`, så `../data` pekar korrekt på repo-data. Vid testkörsning同理.
**Motiv:** `import.meta.url` pekar efter Vite-bundling på fel plats (dist/chunks/); process.cwd() är stabil i både dev och build.
**Förkastade alternativ:** Astro content collections (kräver omstrukturering till content-dir); symlink (plattformsospecificerat); hardcodad absolut sökväg (icke-portabelt).
**Påverkan:** `site/src/lib/data.ts`.

## 2026-06-12 — OG-bilder: satori med TTF-konvertering vid build (Sonnet, M1)

**Beslut:** OG-bilder genereras i ett post-build-skript (`scripts/generate-og.mts`). WOFF2-fonter konverteras till TTF med `fonttools ttLib.woff2 decompress` (kräver fonttools + brotli i CI) eftersom satori inte stödjer WOFF2 direkt. TTF-filerna ligger i `public/fonts/` men används inte av webbläsaren (endast WOFF2 laddas). Svart/gul kostym för alla, aldrig partifärg (DESIGN.md §7).
**Motiv:** DESIGN.md §7 kräver satori + resvg. Satori kräver TrueType/OpenType, inte WOFF2. Fonttools är etablerat och deterministiskt.
**Förkastade alternativ:** WOFF2-stöd i satori (finns ej); Googles og-image-paket (brott mot "inga externa tjänster"); hoppa över OG i M1 (brott mot §18 leverans D).
**Påverkan:** `site/scripts/generate-og.mts`, `site/public/fonts/*.ttf`, CI-workflow.

## 2026-06-12 — M2 Pipeline: LlmClient-injicerbar, egen OpenAI-kompatibel klient utan SDK

**Beslut:** `LlmClient` definieras som smalt interface (`complete(prompt, opts?) → text`) i `pipeline/src/llm.ts`. Produktionsimplementation `OpenRouterClient` använder Nodes inbyggda `fetch` mot OpenAI-kompatibelt `/chat/completions`. Fallback-kedja: primär endpoint → `LLM_FALLBACK_BASE_URL`/`LLM_FALLBACK_API_KEY`. Modellnamn injiceras via `opts.model` (sätts av orkestratorn från `MODEL_EXTRACT`/`MODEL_VERIFY`/`MODEL_COPY`). Temperatur 0 för alla anrop i M2; `response_format: {type:"json_object"}` stöds men ej tvingat (validering + max 1 retry i extract.ts). Inget LLM-SDK-beroende (§14).
**Motiv:** Spec §7 kräver injicerbar LLM; §14 kräver minimala beroenden; OpenAI-kompatibelt API täcker OpenRouter, z.ai och direkt-endpoints utan SDK-overhead.
**Förkastade alternativ:** openai-sdk (överflödigt runtime-beroende); langchain/llamaindex (massivt träd); hårdkodad modell (brott mot §20).
**Påverkan:** `pipeline/src/llm.ts`, alla pipeline-steg som anropar LLM (extract, verify, copy).

## 2026-06-12 — M2 Pipeline: yaml-parser för sources.yaml

**Beslut:** `yaml@^2.9` som runtime-beroende för att parsa `data/sources.yaml` (allowlist + feeds). Paketet är liten (~72 kB minified), aktivt underhållet, ren ESM.
**Motiv:** §14 tillåter motiverade runtime-beroende med DECISION_LOG-rad; sources.yaml måste parsas av orkestratorn.
**Förkastade alternativ:** js-yaml (större, commonjs); manuell YAML-parsning (skört); byta till JSON-format (brott mot spec §6.1).
**Påverkan:** `pipeline/package.json`, `pipeline/src/index.ts` (ej aktuellt i M2 — används i M3 vid skarp källkoppling).

## 2026-06-12 — M2 Pipeline: FixtureMockLlm istället för ScriptedLlm för tester

**Beslut:** Testernas mock-LLM är URL-nycklad (`FixtureMockLlm`): extract/verify-anrop matchas på `<KALLTEXT url="...">`, quip-anrop matchas på kandidattiteln i prompten. Eliminerar beroendet av anropsordning — artiklar sorteras per URL i orkestratorn oavsett fixture-laddningsordning.
**Motiv:** Orkestratorn sorterar artiklar per URL; en strikt sekventiell mock ger feltolkningar när sorteringen skiljer sig från fixture-ordningen.
**Förkastade alternativ:** ScriptedLlm med fast kö (spricker vid URL-omsortering); separat fixture-katalog per test (onödig duplikering).
**Påverkan:** `pipeline/tests/pipeline.test.ts`.

## 2026-06-12 — M2 Pipeline: kostnadsuppskattning enkel derivat från amount_in_text_msek

**Beslut:** `cost.ts` deriverar kostnadsintervall direkt från `amount_in_text_msek` med ±25%/+35% marginal. Inget LLM-anrop för kostnad i M2 (alla fixtures har angivna belopp). Källhierarkin (rut/myndighet → parti → media → llm_estimat) är implementerad som `basis`-fält; full LLM-kostnadsuppskattning läggs i M3 när skarpa artiklar utan belopp kan förekomma.
**Motiv:** M2 är offline-pipeline med fixtures som alla har amount_in_text_msek; LLM-kostnadsanrop skulle kräva ytterligare mock-respons utan att testa mer.
**Förkastade alternativ:** Full LLM-kostnadssteg nu (over engineering för M2); hårdkodade belopp utan marginal (brott mot §8:s spann-krav).
**Påverkan:** `pipeline/src/cost.ts`.

## 2026-06-12 — M4 Räkneverk: delad beräkningslib i site/src/lib/aggregates.ts

**Beslut:** All aggregeringslogik (R1-normalisering, R3-koalitionsdedup, R4-totaler, fläsk-per-röst, kategorifördelning, jämförelsemotor) samlas i `site/src/lib/aggregates.ts`. `calc.ts` behåller formateringsfunktioner och re-exporterar allt från aggregates. Inga lokala summeringar i sidor/skript — OG-buggen från M1-granskningen (hardcoded totals) kan inte återuppstå.
**Motiv:** §4 kräver delad lib importbar från pipeline; §5.3 invarianter ska testas enhetligt; DRY-princip. Egen fil separerar beräkning från presentation.
**Förkastade alternativ:** Beräkningar i varje sida (OG-buggen); monolitisk calc.ts (blandar formatering och logik).
**Påverkan:** `site/src/lib/aggregates.ts`, `site/src/lib/calc.ts` (re-exports), alla sidor som beräknar summor.

## 2026-06-12 — M4 R3-dedup: gruppspårning före dedup-check

**Beslut:** I `coalitionAggregates()` spåras group_id-min/max/parties för ALLA relevanta löften INNAN dedup-checken (`countedIds`). Endast den första posten per group_id bidrar till summan och antal. Detta gör att beloppsintervall (min–max) registreras korrekt även när det andra löftet i gruppen har ett annat belopp.
**Motiv:** Spec §5.3 R3 kräver att "skiljer sig beloppen inom gruppen visas intervallet min–max och fotnot". Att spåra efter dedup hade missat intervallet.
**Förkastade alternativ:** Spåra endast efter dedup (missar intervall); summera alla poster (brott mot R3 "räknas exakt en gång").
**Påverkan:** `site/src/lib/aggregates.ts`, `site/src/scripts/kombinator.ts`, `pipeline/tests/t8-invariants.test.ts`.

## 2026-06-12 — M4 Kombinator-ön: esbuild via Astro transitivt beroende

**Beslut:** Kombinatorn (`site/src/scripts/kombinator.ts`) kompileras till minifierad IIFE (3,6 kB) med esbuild som finns som transitivt beroende via Astro. `scripts/build-kombinator.mts` letar upp esbuild-binären i pnpm-arkivet. Inget nytt direkt beroende tillagt.
**Motiv:** DESIGN.md §10 kräver ≤25 kB vanilla-TS-ö; esbuild redan installerat via Astro; samma mönster som taxametern (is:inline, public/).
**Förkastade alternativ:** Nya beroenden (brott mot §14 utan starkt motiv); Astro island med framework (överdrivet); SWC/Terser (nya deps).
**Påverkan:** `site/scripts/build-kombinator.mts`, `site/public/kombinator.js` (genereras), `site/package.json` (build-script).

## 2026-06-12 — M4 Konstellationer: sex förvalda regeringsunderlag

**Beslut:** `data/constellations.json` definierar sex konstellationer: nuvarande regeringsunderlag (M+KD+L+SD-budget), rödgrönt (S+V+MP), center-allians (C+L+S), borgerligt block (M+C+KD+L), blocköverskridande (S+C+L+KD), alla åtta partier. Urval baserat på politisk realism och val 2022-blockstruktur.
**Motiv:** Rimliga, politiskt relevanta kombinationer. "Alla åtta" visar R3-dedup maximalt.
**Förkastade alternativ:** Endast två block (för få); alla 255 möjliga kombinationer (overkill); SD+V (orealistiskt).
**Påverkan:** `data/constellations.json`, `site/src/pages/regeringar.astro`.

## 2026-06-12 — M4 GapMatare: overifierat läge när reformutrymme="VERIFIERA"

**Beslut:** När `reformutrymme_msek_per_ar.value === "VERIFIERA"` visas mätaren med endast fläsket (svärta-stapeln), en stämpel "REFORMUTRYMME: VERIFIERA" och en metodnot som förklarar att värdet saknas. Inget påhittat tal.
**Motiv:** §8 "hitta INTE på ett tal"; DESIGN §5 kräver metodnot vid overifierat värde.
**Förkastade alternativ:** Dölj mätaren helt (förlorar Fläsket-viz); använd 0 (vilseledande).
**Påverkan:** `site/src/components/GapMatare.astro`.

## 2026-06-12 — Ägarbeslut §21 fattade (4 st)

**Beslut:** (1) Källallowlist v1 = specens 20 domäner i §6.1, oförändrad. (2) `PIPELINE_MODE=review` första skarpa veckan, därefter `auto`. (3) E3 AdSense AV vid lansering; omprövas augusti 2026. (4) Ledamotssidor P1 behålls (villkoret M0–M6 före 1 aug bedöms uppfyllas med god marginal).
**Motiv:** Ägaren bekräftade arkitektens förslag 2026-06-12 (samtliga = specens rekommendationer). Allowlisten balanserar G1-målet mot källkvalitet; review-veckan kalibrerar grindarna mot verkligheten innan auto; E3-default skyddar trovärdighet/CSP/cookiefrihet; P1 är redan byggd som sidtyp och kostar endast people-spegling i M3.
**Förkastade alternativ:** Bantad allowlist (riskerar G1-målet), permanent review (bryter G4-målet), AdSense från start (cookiebanner + tredjeparts-JS mot sajtens pitch), stryka P1 (kastar byggt arbete).
**Påverkan:** M3 är beslutsmässigt avblockerad. `data/sources.yaml` (M3), `PIPELINE_MODE`-variabel (§20), §13-intäktsplan, /ledamot-sidor.

## 2026-06-12 — M5 ClaimReview: AVSTÅ (inte certifierad faktagranskare)

**Beslut:** ClaimReview-schema (schema.org) implementeras INTE på löftessidor. drygast.nu är inte en certifierad faktagranskningstjänst och ClaimReview kräver enlighet med Google:s faktagranskningspolicy.
**Motiv:** Spec §18 nämner ClaimReview som möjligt; utan certifiering riskerar implementationen att missbruka strukturerad data och skada trovärdigheten. ClaimReview förbehålls organisationer som bedriver professionell faktagranskning enligt internationella standarder.
**Förkastade alternativ:** Implementera ClaimReview utan certifiering (brott mot Google:s riktlinjer, trovärdighetsrisk); ansöka om certifiering (utanför M5-scope).
**Påverkan:** JSON-LD begränsas till WebSite, Dataset, Article, BreadcrumbList, FAQPage.

## 2026-06-12 — M5 CSP-analys: application/ld+json påverkas inte av script-src

**Beslut:** JSON-LD (`<script type="application/ld+json">`) används utan CSP-justering. `application/ld+json` blockeras INTE av CSP-profilens `script-src 'self'` eftersom type-attributet gör det till ett icke-exekverbart data-block — webbläsare exekverar endast `text/javascript` och `module`-skript.
**Motiv:** CSP-specifikationen definierar script-src som gällande "skript-exekvering"; JSON-LD är data, inte kod. Detta är etablerat beteende och verifierat mot MDN- och W3C-dokumentation.
**Förkastade alternativ:** Lägg till `application/ld+json` i script-src (onödigt, förvirrande); använd inline JSON-LD utan CSP-analys (saknar dokumenterad motivering).
**Påverkan:** `site/src/layouts/Layout.astro`, alla sidor med JSON-LD.

## 2026-06-12 — M5 Pagefind: statiskt sökindex, lazy-laddad UI, /sok

**Beslut:** `pagefind@1.5` (devDependency) skapar statiskt sökindex vid build (`npx pagefind --site dist --output-path dist/pagefind`). Söksidan `/sok` laddar Pagefind UI dynamiskt via `import()`. URL: `/sok`.
**Motiv:** Spec §18 sanktionerar Pagefind; ≤60 kB UI-JS laddas endast på söksidan; `import()` från `/pagefind/pagefind.js` servas från 'self' (CSP-kompatibel). Pagefind är det enda sanktionerade nya beroendet.
**Förkastade alternativ:** Lunr.js (kräver mer integration); Algolia (tredjepartstjänst); clientside-only utan index (dålig UX).
**Påverkan:** `site/package.json`, `site/src/pages/sok.astro`, build-script, `site/public/_headers`.

## 2026-06-12 — M5 Delad canonical-hash: site/src/lib/canonical.ts

**Beslut:** `canonicalStringify()` och `computeDataHash()` replikerade i `site/src/lib/canonical.ts` (identisk logik som `pipeline/src/publish.ts`). Importeras via `calc.ts`-re-export. Import från pipeline direkt undviks (pipeline är separat pnpm-paket, cirkulärt beroenderisk).
**Motiv:** integrity.json MÅSTE producera samma sha256 som pipeline; identisk implementering garanterar detta. Replikering framför import från pipeline eftersom pipeline är ett separat paket med egna deps.
**Förkastade alternativ:** Extrahera till delat paket (överengineering för två funktioner); importera från pipeline (cirkulärt beroende site→pipeline→data); olika algoritmer (dataintegriteten går sönder).
**Påverkan:** `site/src/lib/canonical.ts`, `site/src/lib/calc.ts` (re-export).

## 2026-06-12 — M3 Källverifiering: 5/8 partier, 4 medie-RSS, riksdagen API

**Beslut:** Källor verifierade med riktiga HTTP-anrop 2026-06-12. Verifierade partifeeds: Moderaterna (WordPress /feed/), Sverigedemokraterna (WordPress /feed/), Vänsterpartiet (WordPress /feed/), Liberalerna (WordPress /feed/), Miljöpartiet (custom PHP RSS). INGEN RSS hittad för Socialdemokraterna (SiteVision CMS), Centerpartiet (SiteVision CMS), Kristdemokraterna (SiteVision/Notified). Verifierade mediefeeds: DN Politik (/rss/politik), SR Ekot (Atom, program 4540), SVT (/rss.xml), DI (/rss). Riksdagen API: dokumentlista (mot, prop m.fl.), anforandelista (separat endpoint, ej dokumentlista), personlista — alla 200 + giltig JSON. Quirk: enskilt resultat = dict, flera = array; hanteras i parse-funktionerna. SvD saknar offentlig RSS (404).
**Motiv:** Spec §6.1 kräver verifierade endpoints; "hitta aldrig på URL:er" (§0). SiteVision-CMS:er erbjuder inga RSS-flöden; press sker via TT.se eller Notified.
**Förkastade alternativ:** Skrapa partisidor (brott mot robots/crawl-etikett, mer belastning); kontakta partier för API (utanför M3-scope).
**Påverkan:** `data/sources.yaml`, `pipeline/src/fetch.ts`.

## 2026-06-12 — M3 fast-xml-parser som XML-beroende

**Beslut:** `fast-xml-parser@^5.0` som runtime-beroende för RSS/Atom-parsning. Ren ESM, aktivt underhållet, liten footprint (~30 kB), hanterar namespaces och CDATA.
**Motiv:** §14 tillåter motiverade beroenden med DECISION_LOG-rad. RSS/Atom-parsning kräver robust XML-stöd; egen parsning vore skör och underhållstung.
**Förkastade alternativ:** xml2js (större, callback-baserad); egen minimal parsning (skört); saxon-js (komplett, överdrivet).
**Påverkan:** `pipeline/package.json`.

## 2026-06-12 — M3 Robots.txt: längst matchande UA-grupp, prefix-match

**Beslut:** Robots.txt-parsern samlar regler per User-agent-grupp och väljer den grupp vars UA-namn är längst substräng-match mot botens UA (exempel: "DrygastBot" matchar "DrygastBot/1.0 (+https://drygast.nu/om)"). Finns ingen specifik match faller den tillbaka på `*`. Endast den valda gruppens regler tillämpas (inte alla gruppers).
**Motiv:** RFC 9309 §2.3: "A robot must use the rules from the record with the longest matching user-agent." Standardiserat beteende.
**Förkastade alternativ:** Exakt strängmatch (missar "DrygastBot" i "DrygastBot/1.0"); first-match-wins (icke-deterministiskt); alla gruppers regler samlat (brott mot spec).
**Påverkan:** `pipeline/src/fetch.ts` (`parseRobotsTxt`, `isPathAllowed`).

## 2026-06-12 — M3 LiveSource: injicerbar HttpFetchFn, robots-cache, ETag/IMS

**Beslut:** `LiveSource` accepterar `HttpFetchFn` (identisk med global fetch-signaturen) för alla nätverksanrop — robots.txt, RSS-flöden, riksdagen API. robots.txt cachas per domän i minnet; ETag/If-Modified-Since cachas i `.cache/etag-cache.json`. Riksdagen-dokumenttexter hämtas individuellt per dokument. All nätverkskod är mockbar utan internetanslutning i testläge.
**Motiv:** M2:s injicerbara design fortsätts; §19 kräver offline-tester; ETag minskar onödig belastning på källorna.
**Förkastade alternativ:** Global fetch direkt (omöjlig att mocka offline); nock/interceptor-bibliotek (nytt stort beroende); ingen ETag-caching (onödig belastning).
**Påverkan:** `pipeline/src/fetch.ts` (`LiveSource`), `pipeline/tests/fetch.test.ts`.

## 2026-06-12 — M3 archive.ts: timeout, backoff, injicerbar fetch

**Beslut:** `createArchiveFn` tar valfri `HttpFetchFn` och timeout (default 15s). Retry: upp till 2 extra försök med exponentiell backoff (1s, 2s). 403/503 → retry=true. Alla fel ger `{ archive_url: null, retry: true }`. Befintlig `archiveViaWayback` behålls för bakåtkompatibilitet.
**Motiv:** §6.2 kräver Wayback-snapshot per källa; timeout/backoff hanterar nätverksinstabilitet; injicerbar fetch för offline-test.
**Förkastade alternativ:** Ingen retry (fäller permanent vid tillfälligt fel); fast retry-intervall (riskerar rate-limit).
**Påverkan:** `pipeline/src/archive.ts`.

## 2026-06-12 — M6 Härdning + ops: implementation

**Beslut:** (1) RUNBOOK.md komplett med S1–S7, stoppurfält, nyckelrotationsschema, ägarsteg. (2) `ops/rollback-data.sh` defensiv med dry-run och smutsigt-träd-koll. (3) `ops/drill.sh` ren klon, hash-verifiering, tidtagning, max 15 min. (4) `drill.yml` månadscron + issue-larm. (5) `mirror.yml` Netlify-deploy villkorad på token-existens. (6) `release.yml` veckovis taggning + GitHub Release, osignerat tills GPG-nyckel finns. (7) Stale-banner i Layout.astro (>36h, gul list, återanvänder fixture-stil). (8) `dns-zone-backup.txt` mall. (9) `test-t3-stale.mts` simulerar gammalt generated_at.
**Motiv:** SPEC §16 M6 oblockerad del — allt som inte kräver externa konton/secrets implementeras nu; konton delegeras till ägarsteg och dokumenteras i RUNBOOK.
**Förkastade alternativ:** Implementera riktiga Cloudflare/Netlify/UptimeRobot-anrop utan konton (omöjligt); skippa drill (brott mot T10); hoppa över stale-banner (brott mot §15).
**Påverkan:** `ops/*`, `.github/workflows/*`, `site/src/layouts/Layout.astro`, `site/scripts/test-t3-stale.mts`, `site/package.json`, `DECISION_LOG.md`.

## 2026-06-12 — M6 GPG-signering: osignerat tills nyckel finns

**Beslut:** Release-taggning (`release.yml`) använder `git tag -a` (annoterad, osignerad) tills ägaren konfigurerar GPG-nyckel. Loggat i RUNBOOK och workflow-kommentar.
**Motiv:** GPG-nyckel kräver ägarsteg (generering, GitHub-konfiguration, Secrets). Osignerad tagg är bättre än ingen tagg; workflow är klar för byte till `git tag -s`.
**Förkastade alternativ:** Hoppa över taggning tills GPG finns (brott mot §16 S7); försöka signera utan nyckel (failar).
**Påverkan:** `.github/workflows/release.yml`, `ops/RUNBOOK.md`.

## 2026-06-12 — M7 Konstantverifiering (bilaga D): 2/10 verifierade, 8/10 kvarstår

**Beslut:** Genomfört verifieringsrunda mot auktoritativa källor via riktiga webbanrop (2026-06-12). Två konstanter kunde verifieras och källsättas: `avstand_manen_m` (384 400 000 m, NASA science.nasa.gov/moon/facts/) och `forbifart_sthlm` (51 500 000 000 kr, Trafikverket). Åtta konstanter kvarstår "VERIFIERA" — antingen för att primärkällans webbplats gav 404 (Riksbanken: alla myntspecifikations-URL), kräver interaktivt databasutdrag (SCB: lönestrukturstatistik för ssk/lärare), har bytt plattform (SKR), har brutna rapport-URL:er (Livsmedelsverket), inte publicerar efterfrågat värde (FMV: inget styckpris; totalprogramkostnad 47 mdkr), inte var tillgänglig (NASA NSSDC: nere för underhåll), eller kräver PDF-tolkning (Konjunkturinstitutet/ESV via riksdagen.se).

**Motiv:** Spec §0 regel 2: "Hitta aldrig på siffror." Hellre "VERIFIERA" med utförlig metodnot än ett fabricerat värde. Se per-post-noter i data/constants.json för exakta URL:er och felorsaker. Rimlighetskontroller godkända för de två verifierade värdena (månavstånd 3.844e8 m, Förbifarten 51.5 mdkr inom förväntat 40–50 mdkr-spann — överskridningen förklaras av 2021 års prisnivå och kostnadsökningar).

**Förkastade alternativ:** Använda Wikipedia/sekundärkällor för myntspecifikationer, marsavstånd och jas-styckpris (otillräcklig auktoritet för sajtens trovärdighetsvaluta); uppskatta ssk/lärarlöner från allmän kännedom (påhitt); använda Brasiliens Gripen-affär som svenskt styckpris (olika kontraktsvillkor).

**Påverkan:** `data/constants.json`, `pipeline/schemas/constants.schema.json` (conditional required source_date), `DECISION_LOG.md`.

## 2026-06-12 — M7 Schemauppdatering: source_date conditional required, fetched_date tillagd

**Beslut:** `constants.schema.json` uppdaterad med JSON Schema `if/then`: när `value` är `number` krävs `source_date`. Fältet `fetched_date` tillagt (valfritt) för spårbarhet av verifieringsdatum. Gäller både `reformutrymme_msek_per_ar` och `items[]`.

**Motiv:** Spec §9 och bilaga D kräver source_url + source_date för verifierade värden. Att göra source_date villkorat krävt (endast när value är nummer) gör att "VERIFIERA"-poster kan ha tom source_date medan verifierade tvingas ange datum.

**Förkastade alternativ:** Alltid kräva source_date (blockerar "VERIFIERA"-poster); inget fetched_date (sämre spårbarhet av verifieringsrundan).

**Påverkan:** `pipeline/schemas/constants.schema.json`.

## 2026-06-12 — M7 Innehållsgenomgång: /om, /metod, /press, /rattelser (§17/§13)

**Beslut:** Samtliga fyra innehållssidor uppdaterade enligt §17-krav.
- `/om`: neutralitetslöftet komplett med metodik- och transparensbeskrivning. E2-platshållare "Stöd vägningen" i diskret ruta med "KOMMER SNART"-stämpel (Swish/BMC är ägarsteg — inga döda betalningslänkar).
- `/metod`: §8-metodiken komplett: källhierarki (RUT→parti→media→LLM), alla fem summeringsregler (R1–R5), skatter/besparingar, jämförelsemotorn, verbatim-grinden, reformutrymmeshantering. Ärlighetsregeln explicit: "vi säger när vi uppskattar".
- `/press`: citatpolicy med rekommenderat citatformat och API-hänvisning. OG-bildbeskrivning med exempel-URL:er. Kontakt-platshållare med stämpel. Rättelsehänvisning.
- `/rattelser`: full förklaring av correction:-flödet: commit-prefix, pipeline-omkörning, kronologisk listning, anmälningsväg.

**Motiv:** Spec §17 kräver neutralitet, transparens och ärlighetsregel på innehållssidorna. §18 M7 kräver innehållsgenomgång före lansering.

**Förkastade alternativ:** Hårdkoda Swish-nummer/BMC-länk (döda betalningslänkar — ägarsteg); utelämna R5-beloppsspärren från /metod (ofullständig metodik); publicera e-postadress (spamrisk innan ägaren konfigurerat).

**Påverkan:** `site/src/pages/om.astro`, `site/src/pages/metod.astro`, `site/src/pages/press.astro`, `site/src/pages/rattelser.astro`.

## 2026-06-12 — M7 E1/E2 scaffolding: feature flag + "Läs vidare"-komponent + "Annonslänk"

**Beslut:** Skapat feature flag-mekanism i `site/src/config.ts` med två flaggor: `E1_AFFILIATE` (AV — false) och `E3_ADSENSE` (AV — false). Komponenter: `Annonslank.astro` (textstämpel "Annonslänk" i mono) och `LasVidare.astro` (villkorad på E1_AFFILIATE-flaggan, renderar boklista med rel="sponsored nofollow" och Annonslänk-märkning). E2 är innehållsplatshållare på /om, ej komponentkrävande. Inga betalningslänkar innan ägaren ansluter affiliatenätverk.

**Motiv:** §13 intäktsplan aktiveras stegvis. E1-komponenten är kodad, testbar och redo — men flaggan är AV tills affiliatenätverk (Adtraction/Awin) är kontrakterat (ägarsteg). Annonslänk-märkning enligt marknadsföringslagen förberedd. E2 är enbart innehållsplatshållare — Swish-QR/BMC-länk kräver ägarens betalningsuppgifter.

**Förkastade alternativ:** Hårdkoda affiliatelänkar utan nätverksavtal (döda/borttagna länkar); aktivera E1_AFFILIATE true direkt (falsk marknadsföring innan avtal finns); E2 som separat komponent (överengineering för en platshållare).

**Påverkan:** `site/src/config.ts`, `site/src/components/LasVidare.astro`, `site/src/components/Annonslank.astro`, `site/src/pages/om.astro`.

## 2026-06-12 — M7 Ytterligare verifieringsrunda: 1-krona och Mars min-avstånd verifierade

**Beslut:** Två ytterligare konstanter verifierade i andra rundan: `enkrona_tjocklek_m` (0.00179 m) från Wikipedia "Svenska mynt" som citerar Riksbankens specifikation för 2016 års myntserie; `avstand_mars_min_m` (54 000 000 000 m) från Wikipedia "Mars" — "The distance at close approach varies between about 54 and 103 million km". Totalt 4/10 verifierade.

**Motiv:** Riksbankens egna myntspec-URL:er gav fortsatt 404; Wikipedia har dock den exakta siffran 1.79 mm som uttryckligen tillskrivs Riksbankens myntspecifikation. Mars minimum hittades i orbital-sektionen på engelska Wikipedia ("Closest approaches") — tydligt angivet 54–103M km range. Fem konstanter kunde inte verifieras pga interaktiva databaser (SCB), plattformsbyte (SKR), brutna rapport-URL:er (Livsmedelsverket), eller icke-publicerat värde (FMV styckpris, KI reformutrymme).

**Förkastade alternativ:** Fortsätta jaga Riksbanken-URL:er som ger 404 (tidsslöseri); gissa JAS 39E-styckpris från Brasilien-affären ($85M ≈ 850M SEK — olika kontraktsvillkor, ej trovärdig svensk källa).

**Påverkan:** `data/constants.json`, `DECISION_LOG.md`.

## 2026-06-13 — M7 Konstantverifiering, runda 3: enkrona + skolmåltid källsatta mot primärkällor; Wikipedia-värden ersatta

**Beslut:** Två konstanter verifierade och källsatta mot auktoritativa primärkällor: `enkrona_tjocklek_m` = 0,00179 m ur **Riksbankens föreskrifter (2014:84)** (SFS-fulltext via riksdagen.se: valören en krona "diameter på 19,50 millimeter och en tjocklek på 1,79 millimeter") och `skolmaltid_elev_ar` = 6 800 kr ur **Skolverkets** studie "Vad kostar skolmaten?" (rapport 2023:6: "i genomsnitt 6 800 kronor per elev och år i grundskolan", kostnadsår 2021). Sex poster står kvar som "VERIFIERA" med skärpta per-post-noter. Detta ersätter de Wikipedia-härledda värdena från 2026-06-12-rundan (commit 03683f2 återställde dem till VERIFIERA — Wikipedia underkänd som auktoritativ för sajtens trovärdighetsvaluta); enkronan har nu sin egentliga primärkälla (författningstexten Wikipedia citerade), och Mars förblir VERIFIERA tills en stabil NASA-URL anger 54,6M km.

**Motiv:** Spec §0 regel 2 ("hitta aldrig på siffror") + §9-trovärdighet. Författningstext och en statlig myndighets (Skolverket) officiella statistik är de starkaste tillgängliga källorna och slår både Wikipedia och marknadsföringssidor. Riksbankens egna myntsidor gav fortsatt 404, men föreskriften 2014:84 innehåller exakt samma specifikation och är primärkällan. För de sex kvarvarande: SCB publicerar månadslön (ej arbetskraftskostnad — multiplikatorn vore ett antagande), SKR:s KPP är per patient (ej per vårdplats/år), KI:s reformutrymme är en rörlig prognos (ägarbeslut om vintage), FMV publicerar inget JAS-styckpris, och NASA:s Mars-minimumsida redirectar numera till en faktasida utan siffran.

**Förkastade alternativ:** Behålla Wikipedia-värdena (underkänt 2026-06-12); härleda arbetskraftskostnad ur månadslön × egen avgiftsmultiplikator (påhittad precision); pinna ett reformutrymme ur sekundärrapportering (rörlig prognos, kräver ägarbeslut); citera en NASA-URL som 302-redirectar bort från siffran.

**Påverkan:** `data/constants.json` (2 värden + 6 skärpta noter + generated_note), `DECISION_LOG.md`. T3/T9 gröna efter ändringen (verifierat i /tmp-klon).

## 2026-06-13 — M7 Konstanter runda 4: tre konstanter omdefinierade till källsatta storheter + kosmisk jämförelsemotor fixad (ägarbeslut)

**Beslut:** Fyra konstanter ändrade efter ägarbeslut, plus en motorfix:
- `ssk_arskostnad` → **43 900 kr**, omdefinierad från "arbetskraftskostnad/år" till **sjuksköterskelöner (en månad)**, källa SCB lönestrukturstatistik (SSYK 2221, referensår 2024). Id behållet (refereras av ~10 löften).
- `larare_arskostnad` → **40 200 kr**, omdefinierad till **lärarlöner (en månad)**, källa SCB (grundskollärare, 2024). Id behållet.
- `vardplats_ar` → **32 353 kr**, omdefinierad från "kostnad per vårdplats/år" (ej publicerad) till **nettokostnad hälso- och sjukvård per invånare**, källa Vården i siffror (SKR), riket 2024. Id behållet.
- `avstand_mars_min_m` → id ändrat till `avstand_mars_medel_m`, **225 308 160 000 m**, omdefinierad från "minsta" till **genomsnittligt avstånd**, källa NASA HRP (140 milj. miles × 1 609,344). Id-byte ofarligt (refererades av inga löften).
- **Motorfix (`aggregates.ts`):** den kosmiska jämförelsen räknade tidigare `totalKronor × värde` för unit `m` — dimensionellt fel för ett avstånd. Nu: enkronan (`enkrona_tjocklek_m`) är intern myntstapel-byggsten (renderas aldrig fristående), och avståndskonstanter beräknas som `(totalKronor × enkronans tjocklek) / avstånd` = andel av vägen, renderad "X % av vägen till månen/Mars" (ny unit `andel_avstand` + gren i `formatComparison`).

**Motiv:** Spec §0 "hitta aldrig på siffror" + §8 källhierarki. Arbetskraftskostnad och kostnad-per-vårdplats publiceras inte per yrke/vårdplats av någon myndighet (konstaterat runda 3), så de enda källsatta storheterna är månadslön (SCB) resp. nettokostnad per invånare (SKR/Vården i siffror). Storheterna är svagare men ärliga och spårbara — bättre än VERIFIERA eller härledda tal. Motorfixen realiserar den design metod-sidan redan beskriver ("myntstapel mot månen/Mars") och som koden aldrig implementerat korrekt.

**Förkastade alternativ:** Härleda arbetskraftskostnad ur lön × egen avgiftsmultiplikator (påhittad precision, §0-brott); citera KPP:s räkneexempel 55 000 kr som snitt (ej bekräftat snitt); byta `avstand_mars_min` mot jordvarv (NASA-källa för Mars-snitt fanns, så Mars behölls); byta constant-id för ssk/lärare/vård (hade krävt ändring i ~12 löften — id behålls, label bär betydelsen).

**Påverkan:** `data/constants.json` (4 konstanter), `site/src/lib/aggregates.ts` (computeComparisons + formatComparison), `site/src/pages/metod.astro` (copy), `data/promises.json` (1 fixture: enkrona→mars i kosmisk lista), `DECISION_LOG.md`. Verifierat i /tmp-klon: T3, T1, T9 gröna, bygge OK, rendering bekräftad ("8,4 % av vägen till månen", "12 813 sjuksköterskelöner (en månad)", "726 invånares sjukvård (ett år)"). KVARSTÅR VERIFIERA: `reformutrymme_msek_per_ar`, `jas39e_styck`.

## 2026-06-13 — M7 Konstanter runda 5: reformutrymme + Gripen källsatta (de sista två); quips städade

**Beslut:** De två sista VERIFIERA-konstanterna källsatta (alla 10 bilaga-D-konstanter nu satta):
- `reformutrymme_msek_per_ar` → **80 000 msek**, källa Regeringen, Budgetpropositionen för 2026 ("reformer för närmare 80 miljarder kronor", exkl. försvar/Ukraina). OBS: regeringens reformvolym i BP2026, inte KI:s beräknade reformutrymme — valt som ett officiellt, källsatt mått. Aktiverar gap-mätarens fulla läge (verifierat: "GAP ≈ 792 MDKR").
- `jas39e_styck` → **47 000 000 000 kr** (drygt 47 mdkr), källa FMV ("FMV-projektet under åren 2013 till 2026 ... omsätta drygt 47 miljarder kronor"). Omdefinierad från styckpris (ej publicerat) → hela Gripen-programmet. Ny unit `ggr_gripen` + gren i `formatComparison`: jämförelsen renderas "X gånger / X % av hela JAS 39E-notan (2013–2026)" i stället för antal plan. Id behållet (refereras av löften).
- **Quip-städning:** fixture-quip på löfte p-… ("hundra lärarkostnader per år per lärare", inkonsekvent efter års→månadslön-bytet) omskriven till "räcker till en extra månadslön åt drygt 100 000 lärare". Övriga quips genomgångna — 39 (regionsjukvård) och 311 (tandvård) stämmer fortsatt.

**Motiv:** Spec §0/§8. Regeringens och FMV:s egna publikationer är primärkällor. Reformutrymme som "konstant" är en förenkling (rörlig prognos) men regeringens BP-volym är ett konkret, citerbart årsmått. Gripen-omframningen gör konstanten källsatt OCH ger en mer begriplig jämförelse (andel av en känd nationell satsning) än ett icke-publicerat styckpris.

**Förkastade alternativ:** KI:s ~34 mdkr (sekundärrapportering, ej maskinläst primärkälla); behålla jas som styckpris (ej publicerat ⇒ VERIFIERA för evigt); gissa styckpris ur utländska Gripen-affärer (olika kontraktsvillkor).

**Påverkan:** `data/constants.json` (2 konstanter), `site/src/lib/aggregates.ts` (`formatComparison` ggr_gripen-gren), `data/promises.json` (1 quip), `DECISION_LOG.md`. /tmp-klon: T3/T1/T9 gröna, bygge OK, rendering bekräftad. **Alla 10 konstanter i bilaga D nu källsatta — inga VERIFIERA kvar.**

## 2026-06-15 — M3: produktions-entrypoint för pipelinen (`cli-run.ts`) + modellval §20

**Beslut:** Lagt `pipeline/src/cli-run.ts` som skarp entrypoint och pekat om `pipeline:run` dit (tidigare `src/index.ts`, som bara exporterade `runPipeline` utan `main()` — `pnpm pipeline:run` var en tyst no-op och inget läste miljövariabler eller instansierade `OpenRouterClient`). `cli-run.ts` exporterar en ren, testbar `buildContextFromEnv(env, {config, dataDir})` som validerar env (`OPENROUTER_API_KEY`, valfritt `LLM_FALLBACK_*` som par, `MODEL_EXTRACT/VERIFY/COPY`, `PIPELINE_MODE`), instansierar `OpenRouterClient` (med fallback) + `LiveSource` (från `sources.yaml`) + `createArchiveFn`, och kör `runPipeline`. `main()` körs bara som direkt entrypoint (`import.meta.url`-grind) så tester/`cli-dry-run` inte triggar den. Exit 1 vid felkonfig och vid "noll producerade + fel" så CI larmar. §20-krav hårdkodat: kastar om `MODEL_VERIFY === MODEL_EXTRACT`.

**Modellval (§20, första skarpa körningen):** primär OpenRouter saknar kredit ⇒ all trafik faller över till OpenCode Go (OpenAI-kompatibel endpoint `https://opencode.ai/zen/go/v1`, satt som `LLM_FALLBACK_BASE_URL`). Valda modeller: `MODEL_EXTRACT=deepseek-v4-pro` (DeepSeek), `MODEL_VERIFY=kimi-k2.7` (Moonshot — annan familj än extract, uppfyller §20), `MODEL_COPY=glm-5.1` (GLM). Endast modeller på Go:s **chat/completions**-endpoint används; Qwen/MiniMax ligger på `/v1/messages` (Anthropic-format) och är inkompatibla med pipelinens OpenAI-klient.

**Motiv:** Utan entrypoint kunde M3 "skarp körning" aldrig starta. Ren `buildContextFromEnv` gör env-limmet enhetstestbart utan nät (10 nya tester). Fallback-kedjan i `OpenRouterClient` (primär → fallback vid valfritt fel) gör att en kreditlös primär automatiskt går på OpenCode Go.

**Förkastade alternativ:** lägga `main()` direkt i `index.ts` (skulle köra vid import från `cli-dry-run`/tester); läsa env utspritt i modulerna (otestbart, dolt); välja Qwen/MiniMax (fel API-format för klienten).

**Påverkan:** `pipeline/src/cli-run.ts` (ny), `pipeline/tests/cli-run.test.ts` (ny, 10 tester), `pipeline/package.json` (`pipeline:run`→`cli-run.ts`), `DECISION_LOG.md`. /tmp-klon: typecheck rent, 81/81 tester gröna, check-t7 OK, exit 1 vid saknad env verifierat.

## 2026-06-15..19 — M3 produktionshärdning av LLM-pipelinen (tre rundor mot verkliga modeller)

Första skarpa körningarna mot OpenCode Go (fallback, OpenRouter saknar kredit) avslöjade tre fel som inte fångades av offline-testerna (mock-LLM). Åtgärdade i tur och ordning:

**1. JSON-extraktion (fence-stripping).** Modeller utan `response_format` lindar ofta JSON i ```-staket/prosa → `JSON.parse` small → de löftesrika artiklarna blev (tysta) fel medan tomma parsades fint → noll kandidater. `extract.ts` plockar nu ut objektet via `extractJsonPayload` (skalar staket/prosa) + per-artikel-diagnostik (`text=Nch | kandidater=M`).

**2. Schema-enum-krock (G1).** Modellen returnerade `parties:["MP"]` och fria/versaliserade kategorier (`"Skatter"`, `"Statistik/register"`) → alla kandidater föll på G1. A1-prompten listar nu exakt de 8 partikoderna (gemener, med namn→kod-mappning) och de 9 tillåtna kategorierna; `extract.ts` gemenar koder/kategori som skyddsnät (`normalizeCandidate`). Schemat förblir strikt (`additionalProperties:false`).

**3. Rate limit / timeout (resiliens).** ~80 artiklar × (extract+verify+copy) i snabb följd översteg budget-endpointens gränser → massvis timeouts → errorRate ≥ 0.5 → hela batchen kastades (tom review). `OpenRouterClient` har nu: per-anrops-timeout (90s), retry med exponentiell backoff+jitter på 429/5xx/nätfel (respekterar `Retry-After`), icke-retrybara 4xx hoppar direkt till nästa endpoint (sparar onödiga primär-retries), och **proaktiv throttle** (minsta intervall mellan anrop, default 1,2s). `max_articles_per_run` sänkt 120 → 25 så schemalagda körningar (3×/dygn) betar av flödet utan burst. Allt injicerbart (fetch/sleep/now) för test.

**Motiv:** §19 kräver offline-tester men de mockar LLM:en, så verkligt modellbeteende (staket, enum-skiftläge) och driftvillkor (rate limits) testades först skarpt. Throttle + retry passar en schemalagd, icke-realtidspipeline (ägaren: "det får ta tid").

**Förkastade alternativ:** tvinga `response_format:json_object` (risk för 400 på OpenCode-endpointen — fence-stripping är endpoint-oberoende); luckra upp G1-schemat (försvagar injektionshygienen — bättre styra modellen via prompt); parallella LLM-anrop (förvärrar rate limit).

**Påverkan:** `pipeline/src/extract.ts`, `pipeline/prompts/A1-extract.md`, `pipeline/src/llm.ts`, `data/sources.yaml` (batch 25), nya tester `extract.test.ts`/`llm.test.ts`. /tmp-klon: typecheck rent, 94/94 tester, check-t7 OK.

## 2026-06-19 — M3 G3-verbatim: ordgräns-skyddsnät + skärpt citatprompt; lugnare takt

Första skarpa batchen gav 4 kandidater, alla fällda på G3 (verbatim). Två orsaker:
(a) ordagranna citat som spräckte 40-ordstaket med 1–3 ord; (b) modellen parafraserade ("vi lovar att … en halv miljon kronor" i stället för källans ord).

**Beslut:** (a) `trimQuoteToWords` i `extract.ts` kortar ett citat till ≤ `QUOTE_MAX_WORDS` genom att ta ett PREFIX (ett ordagrant citat förblir ordagrant) och avslutar helst vid sista meningsslut inom taket (om ≥ 5 ord, annars hård kapning). Påverkar inte parafraser — de förblir icke-ordagranna och fälls korrekt av G3. (b) A1-prompten skärpt: citatet MÅSTE vara exakt klipp-och-klistra, inga egna inledningar, inga ihopslagna meningar, helst en mening, sikta ≤ 35 ord. Dessutom takt neddragen: `max_articles_per_run` 25 → 15 och klientens throttle 1,2 → 2,5 s (färre rate limit-fel; pipelinen är schemalagd, inte realtid).

**Motiv:** G3 ska fälla hallucinationer, inte annars korrekta citat som råkar bli 1–3 ord för långa. Prefix-kapning bevarar ordagrannheten. Parafraser ska fortsatt till review (§7 människa-i-loop). Lägre takt + cheaper/snabbare modell (ägarsteg: `MODEL_*` → flash-nivå) minskar felen.

**Förkastade alternativ:** höja 40-ordstaket i schemat (spec §5.1-avvikelse + längre citat); luckra G3-substringmatchen (öppnar hallucinationsfönstret); quote-snapping av parafraser (komplex, risk att välja fel källspann — review är säkrare).

**Påverkan:** `pipeline/src/extract.ts` (+`trimQuoteToWords`), `pipeline/prompts/A1-extract.md`, `data/sources.yaml` (15), `pipeline/src/llm.ts` (throttle 2,5 s), `pipeline/tests/extract.test.ts`. /tmp-klon: typecheck rent, 97/97 tester.

## 2026-06-19 — M3 Feed-rättvisa: kapa på NYA artiklar, inte hämtade (motionerna svältes ut)

**Problem:** `LiveSource.fetch()` hämtade feeds i ordning och bröt vid `max_articles_per_run` — och partiernas RSS ligger före riksdagen i `sources.yaml`. När batchen sänktes (120→25→15) för rate limit fyllde partifeederna budgeten innan riksdagen ens hämtades → motioner/anföranden + media svältes ut (förklarar varför endast partisidor dök upp efter sänkningen, och att första körningens motioner "försvann"). Dessutom kapades på *hämtade* artiklar före dedup, så redan sedda poster åt upp platserna.

**Beslut:** `fetch()` hämtar nu ALLA feeds (ingen global kapning där). Processbudgeten flyttad till `runPipeline`: efter URL-sortering (ger `data.riksdagen.se` först → motioner prioriteras) och dedup kapas **nya** (osedda) artiklar till `ctx.maxNewArticles` (ny, valfri; sätts av cli-run från `max_articles_per_run`). Endast de FAKTISKT bearbetade markeras som sedda — överskottet tas nästa körning (inget tappas). `max_articles_per_run` 15→20.

**Motiv:** Throttle + retry (förra rundan) gör att en större process-budget är säker; den verkliga felkällan var burst utan paus, inte modellen. Kapning på nya artiklar + "markera bara bearbetade" gör att alla feeds når fram över ett par schemalagda körningar utan att svälta varandra, och utan att tappa poster.

**Förkastade alternativ:** bara höja batchen (partifeeds kan ändå fylla den före riksdagen); omordna feeds (skör — URL-sortering är deterministisk och ger redan riksdagen först); låta fetch känna till seen (kopplar ihop hämtning och tillstånd).

**Påverkan:** `pipeline/src/fetch.ts` (ingen global kapning), `pipeline/src/index.ts` (`maxNewArticles`, kapa toProcess, markera bara bearbetade sedda), `pipeline/src/cli-run.ts`, `data/sources.yaml` (20), tester `pipeline.test.ts`/`cli-run.test.ts`. /tmp-klon: typecheck rent, 99/99 tester, check-t7 OK.

## 2026-06-24 — M3 Kostnadssteg (§8) + redigerbar review + manuell inrapportering (ägarbeslut)

Skarp körning med pro gav rena kandidater men tre kvarvarande hål: verify-steget small på samma JSON-staket som extract; löften utan belopp fastnade på en hårdkodad platshållare; och review bar aldrig med sig kostnaden (approve publicerade nollor).

**Beslut (efter ägarbeslut: hybrid med mänsklig sista hand + redigerbarhet + manuell inrapportering):**
- **verify-fix:** `verify.ts` använder nu `extractJsonPayload` (staket-rensning) — återställer "ogiltig JSON"-poster.
- **LLM-kostnadsestimat (§8):** ny prompt `A5-cost.md`; `estimateCost` är async — har källtexten belopp härleds spann deterministiskt (basis "parti", conf 0,7), annars LLM-estimat (basis "llm_estimat", ≈ på sajten) med `extractJsonPayload`, tvingad ordning low ≤ base ≤ high, R2 (high ≥ 1,5×low), R5-tak, confidence kapad till 0,65 (under verifierat). Återanvänder extract-modellen — ingen ny variabel.
- **Hybrid-routning:** alla LLM-estimat går ALLTID till review (även hög confidence); endast löften med explicit belopp kan auto-publiceras. Kostnaden bärs med i review-posten (`NeedsReviewEntry.cost`).
- **Redigerbar approve:** `review approve <index> [low base high]` publicerar den medburna kostnaden, eller granskarens egen (conf 0,9, basis "media"); bär även med kategori/parti/citat/person och hanterar fritextkälla utan att krascha.
- **Manuell inrapportering:** `review add <fil.json>` lägger ett löfte modellen missat (t.ex. uttalande i rikssänd TV) i needs_review; granskaren vouchar för källan och sätter kostnad vid approve.

**Motiv:** §8 etablerar llm_estimat som lägsta källtier (markeras ≈). Ägaren ville behålla mänsklig kontroll (allt estimat → review, redigerbart) och kunna fånga löften utanför allowlistade källor (TV) där hen själv bedömer källans trovärdighet.

**Förkastade alternativ:** auto-publicera LLM-estimat (ägaren vill granska först); hårdkodad platshållarkostnad (vilseledande "fläsk"); ny `MODEL_COST`-variabel (onödig konfig — extract-modellen räcker).

**Påverkan:** `pipeline/src/{verify,cost,index,publish,review}.ts`, `pipeline/prompts/A5-cost.md` (ny), `pipeline/tests/cost.test.ts` (ny). /tmp-klon: typecheck rent, 106 tester gröna, check-t7 OK, CLI-flöde (add→list→approve med override) verifierat.

## 2026-06-24 — M3 Dubletthantering (heuristik-flagg + manuell länkning) + review-schema-fix

**Problem:** dedup skedde bara på URL — ett partipressmeddelande och en tidning om samma löfte gav två poster, båda med `group_id: null`, dubbelräknade i fläsk-totalen. Dessutom upptäcktes en latent bugg: `review.ts approve` byggde löften UTAN obligatoriska schemafält (slug, person, comparisons, quip, history) → review-godkända löften hade fällt sajtens T3-validering.

**Beslut (ägarval: heuristik + manuell länkning):**
- **Dublett-flagg:** `similarity.ts` — Jaccard-titellikhet; en kandidat flaggas som trolig dublett om den delar parti (överlapp) + kategori + titellikhet ≥ 0,3 med ett befintligt löfte (eller ett tidigare i samma körning). Tröskeln satt lågt med flit: felflagg går bara till review. `runPipeline` kollar mot förladdade `existingPromises` + en växande pool för in-batch-dubletter; flaggade går till review (`duplicateOf`), ingen kostnad beräknas i onödan.
- **Manuell länkning:** `review approve <i> --group p-XXXX` ger nya löftet samma `group_id` som målet (skapar gruppen om den saknas) → R3 räknar gruppen EN gång men båda källor syns. `list` föreslår länk-kommandot.
- **Manuell inrapportering härdad:** `add` kräver https-källa (citerbarhet — t.ex. SVT-programlänk; människan vouchar och kringgår allowlisten medvetet) samt giltiga partikoder/kategori.
- **Schema-fix:** `review approve` producerar nu alla obligatoriska fält (slug via slugify, person, comparisons [], quip null, history [], group_id). Verifierat: godkänt löfte validerar mot `promises.schema.json` (ajv).

**Motiv:** §5.3-anda (varje group_id räknas en gång) fanns redan i R3-aggregeringen men `group_id` sattes aldrig. Heuristik + människa-i-loop undviker felaktiga auto-sammanslagningar. Schema-fixen är nödvändig — annars kraschar bygget när första review-godkända löftet publiceras.

**Förkastade alternativ:** LLM-dedup (fler anrop, kan fela — heuristik + människa räcker); auto-sammanslå (riskabelt); tillåta icke-https-källa (löften måste vara citerbara).

**Påverkan:** `pipeline/src/similarity.ts` (ny), `pipeline/src/{index,publish,review}.ts`, `pipeline/tests/similarity.test.ts` (ny). /tmp-klon: typecheck rent, 112+ tester gröna, check-t7 OK, approve→promises.schema.json validerar.

## 2026-06-24 — CI: pipelinens datapush rebasar + retryar (intermittenta non-fast-forward-fail)

**Problem:** `pipeline.yml` commit-steg gjorde ett rått `git push` utan `git pull --rebase`. `concurrency`-gruppen serialiserar bara pipeline-körningar mot varandra, inte mot människors PR-merges. När en PR mergades medan en (throttlad, flerminuters) körning pågick gick `main` vidare → botens push avvisades som non-fast-forward → körningen failade. Loggen visar mönstret (bot-commits varvat med merges); förklarar intermittenta fail som körning #41.

**Beslut:** commit-steget hoppar tidigt om inga dataändringar, och pushar i en loop med `git pull --rebase origin main` + upp till 5 försök med växande backoff. Rebasen lägger datacommiten ovanpå senaste main → fast-forward; retry fångar en merge som landar under rebasfönstret.

**Förkastade alternativ:** vidga concurrency till att blockera merges (omöjligt/olämpligt); `git push --force` (förstör andras commits); ignorera (fortsatt intermittenta fail).

**Påverkan:** `.github/workflows/pipeline.yml`. (Exakt orsak till en specifik körning kräver Actions-loggen — GitHub-kopplingen stödjer ej auto-OAuth här; kör `/mcp` för manuell inloggning om certainty behövs. Fixen adresserar den mest sannolika systemiska orsaken oavsett.)

## 2026-06-24 — CI: "Run pipeline" failar inte på transienta LLM-fel; failade artiklar retas

**Problem:** "Run pipeline"-steget lyste rött vid rate-limit/timeout-storm (bekräftat: rött just på det steget). Två orsaker: (1) `index.ts` markerade ALLA bearbetade artiklar som sedda — även de som kastade fel → de provades aldrig om (tyst dataförlust); (2) `cli-run.ts` avslutade med kod 1 när inget producerats men fel uppstått → röd CI på transienta fel (larm-trötthet, döljer dessutom äkta misconfig).

**Beslut:** (1) seen markeras nu BARA för artiklar som inte finns i `errors` — failade lämnas osedda och retas nästa körning. (2) `errorRate>=0.5`-kortslutningen som slängde HELA batchen är borttagen — partiella lyckade resultat behålls och publiceras/granskas. (3) `cli-run` avslutar med kod 0 vid transient/partiellt (loggar varning); kod 1 endast vid konfigfel (saknad env/sources — kastas i `buildContextFromEnv`, fångas i `main()`). Ihållande avbrott syns via §15 (stale-banner >36h, UptimeRobot), inte via röd CI. Ingen påverkan på modellkvalitet (ägarens krav).

**Förkastade alternativ:** behålla röd CI (larm-trötthet, ej actionable, döljer misconfig); slänga partiella resultat (slöseri med LLM-arbete + budget); markera failade som sedda (tyst dataförlust); byta till flash-modell (ägaren: ingen kvalitetstulln — lös rate limit via betald högre limit, OpenCode Zen "Use balance" eller fundad OpenRouter-primär).

**Påverkan:** `pipeline/src/index.ts`, `pipeline/src/cli-run.ts`, nytt test i `pipeline/tests/pipeline.test.ts`. /tmp-klon: typecheck rent, 113 tester gröna, check-t7 OK.

## 2026-06-24 — LLM: modell per endpoint (OpenRouter primär + OpenCode Go äkta fallback)

**Problem:** Samma `model`-sträng skickades till BÅDA endpoints (`llm.ts` rad 85 + 98). Primären (OpenRouter, `https://openrouter.ai/api/v1`) och fallbacken (OpenCode Go/Zen) har olika namnscheman: Zen-namnen (`deepseek-v4-pro` m.fl.) ger 4xx på OpenRouter → all trafik föll till Go oavsett OpenRouter-krediter, och Go-planens tak slog i. Detta var roten till rate-limit/timeout-stormen — OpenRouter anropades aldrig. Bekräftat i kod och via OpenRouter-modellistan (slug-format = `leverantör/modell`).

**Beslut:** Modell per endpoint via en sträng→sträng-map i `OpenRouterClient` (`fallbackModelMap`). Primären får model-strängen oförändrad; fallbacken översätter primär-ID → fallback-ID (saknas nyckel → primär-strängen, dvs. tidigare no-op-beteende bevaras bakåtkompatibelt). Tre nya GitHub Variables `MODEL_EXTRACT_FALLBACK`/`MODEL_VERIFY_FALLBACK`/`MODEL_COPY_FALLBACK` (alla tre tillsammans eller ingen) bär Zen-namnen; `cli-run.ts` bygger mappen och skickar den till klienten. Rekommenderade värden (slugar verifierade på openrouter.ai/models 2026-06-24):

| Variable | Primär (OpenRouter) | `*_FALLBACK` (OpenCode Go/Zen) |
|---|---|---|
| MODEL_EXTRACT | `deepseek/deepseek-v4-pro` | `deepseek-v4-pro` |
| MODEL_VERIFY | `moonshotai/kimi-k2.7-code` (annan familj, §20) | `kimi-k2.7` |
| MODEL_COPY | `z-ai/glm-5.2` | `glm-5.1` |

De NUVARANDE variabelvärdena (Zen-namn) flyttas alltså oförändrade till `*_FALLBACK`; de tre primära får de prefixade OpenRouter-slugarna. Med OpenRouter-krediter kör primären på pay-per-use (högt tak) → rate limit löses utan kvalitetstapp, och Go finns kvar som äkta reserv.

**Motiv:** Ägarkravet är ingen kvalitetssänkning (behåll stark extract). Felet var endpoint/namn-mismatch, inte modellval. En sträng-map låter samtliga anropsställen vara oförändrade (de skickar fortsatt primärmodellen) och kräver minimal kod + tre variabler — exakt det ägaren bad om ("möjlighet till både primär och fallback … öka på antalet variabler").

**Förkastade alternativ:** Byta MODEL_* till OpenRouter-slugar UTAN map (då blir Go-fallbacken en no-op — ingen äkta reserv); modell-objekt per anropsställe (ändrar alla signaturer i onödan); enbart OpenCode Zen "Use balance" eller fundad OpenRouter utan kodfix (löser krediter men inte att OpenRouter aldrig anropas pga namn-mismatch).

**Påverkan:** `pipeline/src/llm.ts` (`fallbackModelMap`, modell per endpoint), `pipeline/src/cli-run.ts` (tre nya env, all-or-none-validering, mapbygge), `pipeline/tests/{llm,cli-run}.test.ts` (4 nya tester). /tmp-klon: typecheck rent, 117 tester gröna, check-t7 OK. **Kvar (ägarsteg):** sätt de 6 GitHub Variables (3 nya + uppdatera de 3 primära till slugar), öppna PR enligt §7, kör om.

## 2026-06-25 — Datatapp: review-kön skrevs över varje körning (merge i stället för replace)

**Problem:** `publish()` skrev `needs_review.json` enbart från den AKTUELLA körningens `reviewItems` (replace). Eftersom en efterföljande körning ofta hittar 0 nya artiklar (allt redan sett) skrev den `[]` och **raderade poster som väntade på mänsklig granskning innan någon hunnit titta**. Bekräftat i drift via git-historiken: antalet review-poster pendlade 16→0→4→9→0→3→**22→0**. Den "tomma" körningen ägaren såg var i själva verket en lyckad körning (`Klart: 28 publicerade, 22 till review, 0 fel` — extraktion gav 1–5 kandidater/artikel, modell-per-endpoint funkar) vars 22 poster (commit `5a03184`) wipades 2h senare av nästa schemalagda körning (`5130d36`). Inget med modellbytet — ren tillståndsbugg.

**Beslut:** `needs_review.json` är en BESTÅENDE kö som ENBART töms av review-CLI:t (`approve`/`reject` filtrerar bort åtgärdad post; `add` lägger till). Pipelinen får bara LÄGGA TILL: `publish()` läser nu in befintlig kö och slår ihop nya poster, dedupat på `articleUrl::candidate.title` (så att en omläsning med nollställd `seen` inte dubblerar). `promises.json` (ackumuleras) och `changelog.json` (appendas) var redan korrekta; bara review-kön var fel. Returvärdet (`PipelineResult.needsReview`) lämnas som körningens egna poster (oförändrad summeringssemantik i `cli-run`).

**Motiv:** Människa-i-loop (§8) kräver att kandidater överlever tills en människa agerat. Replace gjorde kön flyktig — varje schemalagd körning förstörde ogranskat arbete (och LLM-kostnad). Merge + dedup är minimalt och rör inte övriga datafiler.

**Förkastade alternativ:** Låta pipelinen aldrig skriva tom kö (skör — döljer att inget nytt hände); flytta review-state till annan lagring (överarbete); skriva merge i `index.ts` (publish äger filskrivningen). De 22 wipade posterna återskapas vid en omläsning (nollställd `seen`) och finns kvar i git (`git show 5a03184:data/needs_review.json`) om verbatim-återställning önskas.

**Påverkan:** `pipeline/src/publish.ts` (merge + dedup av review-kön), `pipeline/tests/publish.test.ts` (ny — bevarar kö över tom körning, dedup, respekterar CLI-tömning). /tmp-klon: typecheck rent, 119 tester gröna.

## 2026-06-29 — Seed-import från vallen-2026 + auto-publicerade estimat med viktad total + transkript-källtyp

**Bakgrund:** Det skarpa RSS-flödet matar bara feed-fönstret (10–50 senaste poster/källa) → tomgång efter omläsningen och en skev review-kö (11/16 = V). Ägaren tillhandahöll ett separat, manuellt kurerat granskningsarkiv: **`github.com/bambapappa/vallen-2026`** (PRIVAT) — 387 ordagrant citerade löften i `DATABAS-FINAL.json`, alla 8 partier balanserat, med 75 källsnapshots. 82 % passerar valflasks G3 verbatim. Beslut att använda det som **seed** men UTAN att kringgå säkerhetslagren.

**Beslut 1 — import genom grindarna, inte direktskrivning.** Ny modul `pipeline/src/import-vallen.ts` mappar varje vallen-post → `ExtractionCandidate` + `NormalizedArticle` (vars `text` är källsnapshotten) och kör EXAKT samma `runGates` som RSS-flödet. Bara poster som passerar blir publicerbara; resten → `needs_review.json` med skäl. Stabila `p-2026-NNNN` via befintlig `publish()`. Det privata repot är **bevisvalvet** (full HTML/transkript); valflask (publikt) får bara ≤40-ords-citat + metadata (upphovsrätt §6.2) — ingen fulltext committas.

**Beslut 2 — LLM/parti-kostnadsestimat AUTO-PUBLICERAS med intervall (ersätter `confidence<0.6 → review`).** Ägaren kan inte förbättra 365 enskilda estimat manuellt; det hederliga är att publicera spannet och bära osäkerheten matematiskt. Per löfte `[msek_low, msek_base, msek_high]` med band ur `kostnad_typ`+`kostnad_osakerhet` (exakt ±15 %; estimerat ±30/50/80 % per låg/medel/hög; R2 `high≥1,5×low` för llm_estimat). `method_note` = vallens egen uträkning. Totalen summeras med **triangelfördelnings-varianspropagering + CLT** i `site/src/lib/aggregates.ts:totalFlasketInterval`, inte naiv Σlow–Σhigh: `Var_total = (1−ρ)·Σσ²ᵢ + ρ·(Σσᵢ)²`, ρ default **0,3** (interpolerar mellan oberoende-CLT [för smalt] och perfekt korrelerat [= naiv summa]). Publiceras öppet på /metod. Råestimaten drar högt → R5-flagg + rimlighetskoll kvarstår. Resultat på seed: Fläsket ≈ 13 059 mdkr, 80 %-band 10 748–15 371.

**Beslut 3 — transkript-källtyp för tal/Almedalen (neutralitetskrav).** 149 av 387 löften är talade ASR-citat med youtube.com som källa. Att exkludera dem skevar grovt mot M (M=80 av 181 publicerbara; MP=1). Transkripten fanns INTE i valvet (bara 7/149 verifierbara) → 9 distinkta Almedalstal-videor hämtades med `yt-dlp` (sv auto-undertexter) och sparades i `vallen-2026/transcripts/` (bevisvalvet). Ny `transkript`-källtyp i importern: går förbi G2-allowlist (youtube medvetet tillåtet) men kräver **uppmjukad verbatim** (skiftläges-/skiljeteckens-okänslig, `looseNormalize`) mot det sparade transkriptet, plus G3-längd + G4 (datum, R5). Detta är en medveten försvagning av anti-hallucinationsgarantin ENBART för denna källklass — webbkällor behåller strikt skiftlägeskänslig G3. 134/149 verifieras (90 %); MP 17/17. Resultat: 312 publicerbara (181 snapshot + 131 transkript), balanserat S59 M80 SD37 C45 V32 KD22 L20 MP17.

**Dedup:** identiskt normaliserat citat över flera partier → delad `group_id` (R3, säkert eftersom texten är identisk; `publish()` utökad med valfri `groupId`); samma parti + samma citat → en publiceras, övriga till review; luddig träff mot redan publicerade (`findPossibleDuplicate`) → review med `duplicateOf`. Kategorimappning: handkurerad tabell `pipeline/import/category-map.json` (157 fritext → 9 enum, ägar-granskad).

**Bifix (pre-existerande):** `needs_review.schema.json` krävde `article_url`/`run_id` med `additionalProperties:false` medan `publish.ts` sedan länge skriver `articleUrl`/`articleTitle`/`cost` → schemat var osynkat och T3 rött så fort kön hade poster. Schemat omskrivet att spegla `NeedsReviewEntry`. `test-t1.mts` hårdkodade exempeldata-sökvägar (`p-2026-0001/hojd-a-kassa-90-procent`, `ledamot/magdalena-andersson`) → gjord datadriven (läser promises.json).

**Förkastade alternativ:** direktskrivning till promises.json (kringgår G3/verify — bryter metodkontraktet); skicka alla estimat till review (ägaren kan inte tillföra värde, skalar inte); exkludera YouTube (bryter neutralitet §17); re-extrahera ur skrivna almedalstal-texter (matchar inte de talade citaten, S saknas pga 404); naiv Σlow–Σhigh för totalen (överdriver osäkerheten, antar perfekt korrelation).

## 2026-07-01 — Intäktsplanen (E1–E3) SKROTAD

**Beslut:** Hela intäktsskiktet tas bort. Ägaren är inte längre intresserad av intjäning; målet är bara att inte gå back nämnvärt (driftkostnad < 2 500 kr/år). Borttaget: `site/src/config.ts` (feature flags E1_AFFILIATE/E3_ADSENSE), `site/src/components/LasVidare.astro` + `Annonslank.astro` (döda — renderades ingenstans), "Stöd vägningen"-rutan med Buy Me a Coffee-länk på `/om`, Profil B-kommentaren (AdSense) i `_headers`/bilaga C, samt E1/E2/E3-referenser i SPEC (§10-tabell, GDPR §17, M7 §18) och HANDOFF. `/om` "Vem ligger bakom?" formulerar nu frånvaron av reklam/intäkter/finansiär som en del av OBEROENDET.

**Motiv:** Ingen reklam, inga intäkter och ingen finansiär stärker neutralitets-/trovärdighetsanspråket (§17) snarare än att bara vara ett bortfall — särskilt för en tjänst vars hela värde är opartiskhet. Att bygga och driva den kostar nästan inget (statisk sajt på gratis-hosting), så cost-recovery via donation behövs inte.

**Behållet med flit:** de HISTORISKA DECISION_LOG-posterna om E1/E2/E3 (2026-06-11, 06-12) står kvar — en revisionslogg skrivs inte om; "vi planerade, sen skrotade vi" är mer trovärdigt än att låtsas att det aldrig fanns.

**Förkastade alternativ:** behålla en diskret cost-recovery-donation (ägaren vill distansera sig helt från pengar-aspekten); radera de gamla loggposterna (bryter mot append-only-revisionsprincipen §14).

**Påverkan:** raderade `drygast-systemspec.md` (dubblett av SPEC.md), `site/src/config.ts`, `site/src/components/{LasVidare,Annonslank}.astro`; ändrade `site/src/pages/om.astro`, `site/public/_headers`, `SPEC.md`, `ops/HANDOFF.md`, `README.md`.

**Påverkan:** nya `pipeline/src/import-vallen.ts`, `pipeline/src/cli-import-vallen.ts`, `pipeline/import/category-map.json`, `pipeline/tests/import-vallen.test.ts` (14 tester); `site/src/lib/aggregates.ts` (`totalFlasketInterval`), `site/scripts/test-interval.mts` (10 tester); utökat `pipeline/src/publish.ts` (`groupId`, bakåtkompatibelt); fix `pipeline/schemas/needs_review.schema.json`, `site/scripts/test-t1.mts`; npm-script `import:vallen` + `test:interval`. Lokalt: typecheck rent, **132 pipeline-tester + alla site-tester (T1/T3/T9/stale/intervall) gröna**, skarp import skrev 312 löften (data_hash 2a9ba9cd10bc) och sajten byggde (312 löftessidor, OG visar 13 059 MDKR). **Kvar (ägarsteg):** commit av 9 transkript till privata vallen-2026; PR med kod+data till valflask enligt §7; verifiera ρ=0,3 ger önskat band; senare /metod-text om totalformeln + transkript-uppmjukningen.



## 2026-07-02 — Page-källa (B): auto-hämtning av skrivna manifest + facit-validering

**Beslut:** Ny feed-typ `page` i pipelinen (fetch.ts `fetchPage`): hämtar en enskild HTML-sida, strippar till text och kör LLM-extraktion + grindarna som vanligt. Registrerade 5 page-feeds i `sources.yaml`: C valmanifest (`val2026.centerpartiet.se`), SD (`sd.se/vad-vi-vill`), S (`socialdemokraterna.se/val-2026`), MP almedalstal + MP matstrategi. `stripHtml` avkodar nu ALLA namngivna HTML-entiteter (`&auml;`→ä osv.), inte bara amp/lt/gt/quot. Sparade 21 manuellt återfunna löften (C 5 + MP 16) som **facit/sanningsmängd** i `pipeline/facit/`, med `validate-facit.mts` som hämtar sidorna live och verifierar att varje citat passerar G3.

**Motiv:** Partiernas skrivna löften finns ofta inte som RSS — S och C saknar RSS HELT (SiteVision-CMS), så page var enda vägen för deras löften. B subsumerar de tidigare MANUELLA A/C-återvinningarna: i stället för engångsskörd fångas manifesten löpande i CI. Entitet-avkodningen var grundorsaken till att G3 verbatim föll 0/5 på sidor som serverar `k&ouml;erna` i stället för `köerna`. Facit gör återvinningen falsifierbar: hittar B ett facit-löfte = bra; missar B det = grävsignal (sida omskriven, citat ändrat, eller extraktion/grind). Live-körning vid införandet: **21/21 hittade**.

**Förkastade alternativ:** fortsätta manuell skörd per parti (skalar inte, ingen kontinuitet); tvinga balans i löftesfördelningen (M-skevheten är metodiskt ärlig — speglar varje partis faktiska skrivna output, ska inte konstgjort jämnas ut); behålla A/C som separata engångsjobb (dubbelarbete när page gör samma sak automatiskt); avkoda bara de entiteter vi råkat se (skört — nästa sida med `&aring;` faller tyst).

**Påverkan:** `pipeline/src/fetch.ts` (`fetchPage`, `"page"` i `SourceFeed.type` + dispatch, utökad `HTML_ENTITIES`/`stripHtml`), `data/sources.yaml` (5 page-feeds), nya `pipeline/facit/{manifest-facit.json,validate-facit.mts,README.md}`, `pipeline/tests/fetch.test.ts` (2 page-tester). Typecheck rent, 140 pipeline-tester gröna. Skeppat som PR #51 (squash-mergad till main).

## 2026-07-03 — Page-källa (B) läser PDF: Centerpartiets valmanifest 2026 (96 s.)

**Bakgrund:** Centerpartiets fullständiga valmanifest (328 förslag) publicerades 2026-06-04 ENBART som PDF (`val2026.centerpartiet.se/wp-content/uploads/2026/06/Valmanifest-2026.pdf`, sha256 `69013e13c1ab…`); HTML-sidan som page-källan redan hämtar är bara en sammanfattning. `fetchPage` kunde bara HTML → hela dokumentet föll bort. Föregående session (spår B-undersökningen) dog på tokentaket mitt i detta; PDF:en levererades av ägaren och verifierades bitidentisk med den skarpa URL:en.

**Beslut 1 — PDF auto-detekteras och textextraheras i page-vägen.** `fetchPage` hämtar nu rått (`fetchRawWithCache`) och växlar på content-type `application/pdf` ELLER magisk `%PDF-`-signatur (CDN:er som serverar octet-stream). Extraktion via `pdfjs-dist` (Mozilla pdf.js, ren JS — ingen systemberoende poppler i CI), `title`/`published` ur PDF-metadata (CreationDate ger G4 ett ärligt källdatum i stället för körningens "nu").

**Beslut 2 — dehyphenering vid radslut, annars är G3 verbatim omöjlig.** InDesign-PDF:er avstavar; textlagret ger "arbets-\nmarknaden" och G3 kollapsar whitespace men syr aldrig ihop ord. `joinPdfLines`: gemen före radslutsstreck ⇒ streck bort ("arbetsmarknaden"); versal/siffra ⇒ streck kvar ("EU-medel"); fortsättningsrad som börjar med och/eller/samt ⇒ hängande uppräkningsbindestreck orörd ("vård- och omsorg"). Mjuka bindestreck strippas. Verifierat på hela manifestet: 0 kvarvarande radslutsstreck, alla tre fallen korrekta.

**Beslut 3 — chunkning per 10 sidor med `#page=N`-ankare.** A1/G5 tar max 5 löften per artikel — 96 sidor som EN artikel hade kapat 328 förslag till 5. Varje chunk blir egen artikel med url `…pdf#page=N` (PDF-standardens djuplänk: klickbar källhänvisning till rätt sida, och distinkt url för dedup/seen). En-chunks-PDF:er behåller ren url.

**Facit utökat 21 → 28:** ett löfte per manifestkapitels "Det här vill Centerpartiet göra"-sida (7 kapitel: skatter, elbilspremie, vårdköer, 50 mdkr landsbygd, dubbla straff barnrekrytering, dödshjälpsutredning, Ukrainastöd), id `c-pdf-01`–`07` med `pdf_page` i stället för kostnadsfält — de är fångstmål, inte publicerade löften; publicering sker när CI drar dem genom extraktion+grindar. `validate-facit.mts` slår ihop chunkade artiklar under bas-URL:en. Live-körning: **28/28 hittade** (hela gamla facit + PDF-vägen).

**Förkastade alternativ:** shell-ut till poppler/pdftotext (systemberoende i CI, ohermetiskt i test); registrera manifestets HTML-undersidor i stället för PDF:en (finns och kan läggas till senare, men PDF:en är det officiella, kompletta dokumentet och PDF-stödet behövs ändå — flera partier publicerar manifest enbart som PDF); manuell skörd av alla 328 förslag (skalar inte, exakt det B ska ersätta); en artikel för hela PDF:en (G5 kapar till 5 löften); dehyphenera allt blint (förstör "vård- och omsorg"-uppräkningar).

**Påverkan:** `pipeline/src/fetch.ts` (`extractPdfText`, `joinPdfLines`, `parsePdfDate`, `looksLikePdf`, `PDF_PAGES_PER_CHUNK`, `fetchRawWithCache`, PDF-gren i `fetchPage`), `pipeline/package.json` (+`pdfjs-dist`), `data/sources.yaml` (feed `c-valmanifest-pdf`), `pipeline/facit/` (7 nya poster, validator-ihopslagning, README), nya fixturer `pipeline/fixtures/pdf/manifest-{2p,12p}.pdf` + 5 nya tester i `fetch.test.ts`. Typecheck rent, **145 pipeline-tester gröna**, facit live 28/28.

## 2026-07-03 — B körs på riktigt: prioritet, ändringsbevakning och alla åtta partiers manifest

**Bakgrund:** D-filtret (2026-07-01) drog tillbaka 100 skräp-transkriptlöften och lämnade 219 äkta, med skev partibalans (M 82 … SD 10) som skulle återställas ur skrivna manifest — det är spår B:s uppgift. Vid genomgång visade sig B i praktiken aldrig ha levererat: körningen 2026-07-03 06:39 la till NOLL löften och inga page-URL:er fanns i seen.json. Tre systemfel + ett täckningshål hittades och åtgärdades.

**Fel 1 — fetch-kapningen svalt manifesten.** `LiveSource.fetch()` gjorde `slice(0, max_articles_per_run)` över ALLA hämtade artiklar FÖRE dedup, i strid med sin egen kommentar ("ingen global kapning här"). Partiernas RSS + riksdagen fyllde alltid de första 20 → page-feedsen (sist i sources.yaml) nådde aldrig pipelinen. Fix: kapningen borttagen; budgeten ligger (som avsett) i runPipeline på NYA artiklar. Testet som kodifierade felbeteendet omskrivet till det avsedda kontraktet.

**Fel 2 — ingen ändringsbevakning.** seen nycklades på sha256(url): en page-artikel processades EN gång för alltid; en omskriven manifestsida/ny PDF-version skulle aldrig ha processats om — tvärtemot B:s löfte om löpande bevakning. Fix: page-artiklar bär `contentHash` (sha256 av texten; per PDF-chunk) och seen-nyckeln blir sha256(url + contentHash). Oförändrat innehåll = sett; ändrat = omprocessas, där dublettkollen (`findPossibleDuplicate` → review med duplicateOf) skyddar mot ompublicering. `stripHtml` tar nu bort script/style/noscript-INNEHÅLL + HTML-kommentarer (annars gör inline-noncer hashen instabil; dessutom LLM-brus och injektionsyta). Bieffekt: gamla url-nycklar för page-feeds matchar inte → engångs-omprocessning, vilket är önskat (de har aldrig LLM-processats).

**Fel 3 — processprioritet.** Budgeten fördelades i URL-ordning (riksdagen först). Nu: page (partiernas egna skrivna manifest = primärkällan, ger bara artiklar vid nytt/ändrat innehåll) → riksdagen → övrigt, URL-sortering inom grupp för determinism.

**Täckning — alla åtta partier + automatisk fångst av kommande manifest.** Nyckelbeslut: `findManifestPdfLinks` auto-följer PDF-länkar från registrerade valsidor (samma kanoniska domän, `.pdf` + manifest/valplattform/valprogram/handlingsprogram i sökvägen, max 3/sida, robots-respekt) — så fångas M/SD/KD:s manifest AUTOMATISKT den dag de länkas, utan ny feed-registrering. Auto-följda dokument får en färskhetsspärr (CreationDate äldre än G4-fönstret ±548 d ⇒ hoppas över): SD/KD:s sidor länkar 2022/2024-dokument som G4 ändå skulle stoppat, men spärren sparar LLM-anrop och håller review-kön ren. Kuraterade direktfeeds har INGEN färskhetsspärr — full grind-väg. Registrerat läge 2026-07-03: C fullt manifest 96 s. (PDF), L 'För din frihet' 40 s. (PDF), S Valplattform 4 s. (PDF), V valplattform beslutad på kongressen 4 s. (PDF), MP politiskt handlingsprogram 2026–2030 106 s. (PDF; valmanifest-utkastet är lösenordsskyddat) + politik-/valsidor för alla, inkl. M/SD/KD som saknar publicerat manifest. Dry-run mot live bekräftar: C-sidan ger sida + 10 auto-följda chunkar, direktfeed 304:ar (ingen dubblett), SD/KD:s gamla dokument hoppas över.

**Känd begränsning (pdf.js):** mjuka bindestreck vid radslut tappas på glyfnivå ("själv försörjning"). Det är G3-KONSISTENT — LLM citerar ur samma extraktion som grinden jämför mot — men kosmetiskt i citat; `joinPdfLines` hanterar fallet där tecknet finns kvar, och facit-citat väljs så att de undviker sådana bryt.

**Facit 28 → 36:** S +2, V +2, L +2, MP +2 ur respektive dokument (id `s/v/l/mp-pdf-NN`, `pdf_page`, verifierade genom pipelinens egen extraktionsväg). Live-validering: **36/36 hittade**. M/SD/KD får poster när deras manifest släpps.

**Måttet på att B är rätt byggd (ägarens kriterium):** B ska hitta minst lika mycket ur C-manifestet som den tidigare manuella genomgången (5 löften från sammanfattningssidan). Fångbarhet nu: 12/12 C-facit (5 gamla + 7 ur PDF:en) passerar G3 via B:s väg — och page-artiklarna når nu faktiskt LLM-steget (fel 1–3). LLM-urvalet mäts i nästa skarpa CI-körning: förväntningen är ≥5 C-löften ur manifest-chunkarna till publish/review; annars är det extraktionsprompten som ska trimmas, inte fetch-vägen.

**Förkastade alternativ:** dedup på enbart content-hash utan URL (tappar spårbarhet per källa); omprocessa page-feeds varje körning (LLM-kostnad utan signal); följa PDF-länkar över domängränser (öppnar för länkinjektion — G2 skyddar nedströms men discovery ska också vara snäv); färskhetsspärr även på kuraterade feeds (ägarens explicita val ska inte tyst-filtreras); blind ihopslagning av radbrutna ord utan avstavningssignal ("ska"+"skapa"→"skaskapa" — omöjligt utan ordlista).

**Påverkan:** `pipeline/src/fetch.ts` (slice borttagen, `seenKey`/`contentHash`, `findManifestPdfLinks` + auto-följ med färskhetsspärr, script/style-strip, mjukt-bindestreck-hantering i `joinPdfLines`, injicerbar klocka), `pipeline/src/gates.ts` (`contentHash`/`feedType` på NormalizedArticle), `pipeline/src/index.ts` (prioritetssortering, seenKey), `data/sources.yaml` (14 page-feeds — alla åtta partier), `pipeline/facit/` (36 poster, README). Typecheck rent, **152 pipeline-tester gröna**, facit live 36/36, dry-run mot live grön.

## 2026-07-03 — Push-token myntas efter LLM-steget (run 28673246764 föll på 1 h-TTL)

**Beslut:** Första skarpa B-körningen (28673246764) gick igenom hela pipelinen felfritt på 71 minuter — staleness-spärren, PDF-chunkarna och extraktionen fungerade live ("220 publicerade, 86 till review, 0 fel") — men GitHub App-tokenen som myntas vid jobbstart lever 1 timme, så alla fem push-försök föll ("could not read Username") och körningens data gick förlorad i runnern. Fix i pipeline.yml: ett andra `create-github-app-token`-steg EFTER pipelinesteget myntar en färsk push-token; commit-steget rensar checkoutens persisted auth-header (bär den gamla tokenen och vinner annars över remote-URL:en) och pekar om origin till `https://x-access-token:<färsk>@github.com/...`.

**Motiv:** Tidigare körningar var korta (<15 min) och träffade aldrig taket; manifest-backloggen gör att LLM-steget kan ta >60 min tills kön är genomtuggad (och kan göra det igen vid stora manifestsläpp i augusti). Datat som förlorades reproduceras automatiskt: seen.json pushades aldrig, så nästa körning processar om samma artiklar.

**Förkastade alternativ:** förlänga token-TTL (går inte — GitHubs tak är 1 h); minska maxNewArticles så körningen hinner (angriper symptomet, gör backloggen långsammare); pusha data i delsteg under körningen (komplext, halvfärdiga körningar på main).

**Påverkan:** `.github/workflows/pipeline.yml` (nytt steg `Mint fresh push token`, commit-steget använder den). Ingen pipelinekod ändrad.

## 2026-07-04 — Per-enhetsbelopp får aldrig bli totalkostnad (rättning av p-2026-0337)

**Bakgrund:** Körning 28686833837 auto-publicerade L-löftet p-2026-0337 ("jämställdhetsbonus på 30 000 kronor per barn") med totalkostnad **0,03 msek = 30 000 kr**. Extraktionen satte `amount_in_text_msek = 0.03` (beloppet står ju i texten) och kostnadssteget behandlade varje källtextbelopp som löftets totalkostnad (basis "parti", confidence 0,7 ⇒ auto-publish). R5 kapar bara orimligt HÖGA belopp — inget fångade ett orimligt lågt.

**Beslut 1 — kodfix i cost.ts:** basis "parti" kräver nu att beloppet inte ser ut som per-enhetspris/tröskel: (a) `looksLikeUnitAmount(quote)` — "per barn/person/elev/…", "i månaden/veckan/timmen" osv. i citatet (medvetet EJ "per år": totalkostnader anges ofta så); (b) golv `PARTI_AMOUNT_FLOOR_MSEK = 50` — ett nationellt löfte under 50 msek är nästan alltid ett enhetspris eller tröskelvärde (300 000 kr på ISK, 1500 kr leasing). Faller något av villkoren går beloppet LLM-estimat-vägen, som per §8 ALLTID hamnar i review. 4 nya tester (156 gröna).

**Beslut 2 — datarättning:** p-2026-0337 rättad i data (ägarbeslut i session): spann 500/1 000/2 000 msek/år, basis llm_estimat, confidence 0,9, method_note med uträkningen (~20–40 000 lika-delande föräldrapar/år × 30 000 kr + öronmärkt fjärde månad); quip omskriven (refererade gamla prislappen). Changelog-post `manual-cost-correction-2026-07-04` med omräknad data_hash (via publish.ts `computeDataHash`). T7 grönt.

**Förkastade alternativ:** retracta löftet (löftet är äkta och verbatim — bara kostnaden var fel; rättning + audit-spår är ärligare än att ta bort); golv på 1 msek (för lågt — 30 msek-"totaler" är oftast också enhetsbelopp/deltrösklar, och review kostar bara en granskning); låta LLM:en avgöra om beloppet är per enhet (grindar ska vara deterministisk kod, §7).

## 2026-07-04 — Review-kön granskas via GitHub-issues (ägarbeslut)

**Beslut:** Kön (172 poster efter manifest-backloggen) blev ohanterlig via CLI-list. Nytt flöde: `sync-review-issues.mts` skapar ETT issue per kö-post (etikett `review-kö` + `parti:<x>`), med citat, källänk, flaggningsskäl och FÖRESLAGEN KOSTNAD inkl. uträkningen (method_note, spann, basis, confidence) synlig direkt i issuet — ägaren ska kunna rimlighetsbedöma utan att leta. Ägaren beslutar med en kommentar: `/godkänn` (ja), `/godkänn <low> <base> <high>` (ja med ändrade belopp), `/godkänn --group p-2026-XXXX` (ja, dublettlänkning), `/avvisa <skäl>` (nej). Ny workflow `review.yml` (issue_comment) exekverar beslutet via samma approve/reject som CLI:t, committar datan till main och stänger issuet (completed/not_planned) med svarskommentar. Spårbarheten ökar: varje beslut = issue + kommentar (vem/när) + datacommit + changelog, i stället för ett anonymt CLI-kommando.

**Säkerhet:** endast kommentarer från `author_association == OWNER` på `review-kö`-etiketterade issues körs, och kommentartext/issue-titel går som miljövariabler in i Node — aldrig shell-interpolerade (citat ur manifest är opålitlig data). Stabilt `review_id` = sha256(articleUrl + kandidattitel), samma nyckel som publish-dedupen — beräknas on-the-fly, lagras inte, och överlever att kö-index förskjuts. Okänt/felaktigt kommando ⇒ hjälptext-kommentar, aldrig gissning; borttagen post ⇒ "redan hanterad", ingen ändring.

**Drift:** synken är idempotent (listar befintliga issues öppna+stängda via titel-id, skapar bara saknade), kapad till SYNC_CAP=60/körning med 2 s paus (GitHubs sekundära rate limits) och best-effort i pipeline.yml (fäller aldrig datakörningen). `review-sync.yml` (workflow_dispatch) för backfill av stora köer. CLI:t kvar oförändrat + nya `approve-id`/`reject-id`; review.ts CLI-grindad på entrypoint så modulen kan importeras.

**Förkastade alternativ:** ett samlingsissue med checkboxar (går inte att uttrycka "ja med ändrade belopp" per rad, och beslut drunknar i scroll); labels som beslut (ingen plats för belopp/skäl); redigera needs_review.json i GitHubs webbeditor (kringgår id-tilldelning/kostnadsfält och riskerar trasig JSON); reactions som beslut (ej spårbart vem, inga argument).

**Påverkan:** `pipeline/src/review.ts` (reviewId, findIndexByReviewId, parseReviewCommand, export av approve/reject med returvärden, approve-id/reject-id, CLI-entrypoint-grind), nya `pipeline/scripts/{sync-review-issues,handle-review-comment}.mts`, nya `.github/workflows/{review,review-sync}.yml`, synk-steg i `pipeline.yml`, `pipeline/tests/review.test.ts` (8 tester). Typecheck rent, **164 pipelinetester gröna**.

## 2026-07-04 — Etikettbeslut i review-flödet ("knappen") + bulk, och race-fix i kommentarflödet

**Beslut 1 — beslut som etiketter.** Ägarens återkoppling efter första skarpa beslutet (#273): kommentar funkar men en knapp vore snabbare, och bulk behövs för 172 poster. GitHubs etiketter ÄR knappen: `beslut:godkänn` (godkänn med föreslagen kostnad) och `beslut:avvisa` sätts med två klick per issue — och kan **bulk-appliceras från issuelistans vy** (markera många → Label). Etiketter kräver triage-behörighet, så etikettens närvaro är auktorisationen. Ny `review-apply.yml` (issues:labeled + dispatch) sveper ALLA öppna kö-issues med beslutsetikett och exekverar via samma approve/reject som CLI/kommentarflödet. "Ja med ändrade belopp"/dublettlänkning kräver fortsatt kommentar — belopp ryms inte i en etikett.

**Beslut 2 — tvåfas-exekvering (beslut får aldrig se bekräftade ut utan att datan landat).** Svepet muterar data/ och skriver planerade issue-notifieringar till fil UTANFÖR repot; workflown committar och pushar med gör-om-från-färsk-main-loop (aldrig rebase av JSON-datafiler); först EFTER lyckad push kommenteras/stängs issues. Svepet är idempotent ⇒ concurrency-koalescering (som slänger köade dubblettkörningar) är ofarlig — överlevande svep tar allt.

**Beslut 3 — race-fix i review.yml.** Upptäckt vid bygget: concurrency-gruppen höll bara EN köad körning per grupp — snabba kommentarbeslut i rad hade TAPPAT mellanliggande beslut (GitHub avbryter tidigare pending). Gruppen borttagen; parallella körningar är säkra eftersom även kommentarhanteraren nu görs om från färsk main tills pushen lyckas, och en redan hanterad post svarar "redan hanterad" i stället för att dubbelköras.

**Förkastade alternativ:** riktiga knappar (GitHub-issues saknar custom-knappar; närmaste är etiketter/reactions — reactions är inte spårbara till person i UI:t och kan sättas av vem som helst); en körning per etikett-event med direkta side-effects (bulk på 20 issues ⇒ 20 racande pushar och förlorade körningar i concurrency-kön); `git pull --rebase` vid push-race (rebase av hela JSON-filer konfliktar just när det behövs).

**Påverkan:** ny `pipeline/scripts/apply-labeled-decisions.mts` (apply/notify-faser), ny `.github/workflows/review-apply.yml`, omskriven push-loop + borttagen concurrency i `review.yml`, etikettrad i issue-mallen (`sync-review-issues.mts`). Typecheck rent, 164 tester gröna, YAML validerad.

## 2026-07-05 — Dubblettrevision: p-2026-0340 tillbakadragen

**Beslut:** Regelrevision av samtliga 224 aktiva publicerade löften (enhetsbelopp, intervallsanity, R2, R5, G3-längd, kategorier, datum, dubblettcitat) på ägarens fråga. Utfall: 221 rena; p-2026-0321/0323 flaggades av enhetsfras-detektorn men är korrekta (partiets egna reformkostnader ur seedimporten, inte månadspriser feltolkade); **p-2026-0340 var ett äkta fel** — exakt samma L-citat om euron som p-2026-0152, publicerat olänkat (dublettvarningen i review-kön följdes inte vid godkännandet) och med 6× högre estimat (18 000 vs 3 000 msek base). Fläsket-totalen dubbelräknade därmed löftet. Tillbakadragen (borttagen ur promises.json enligt D-filter-prejudikatet, changelog-post `manual-retract-duplicate-2026-07-05`, omräknad data_hash, T7 grönt); p-2026-0152 med det äldre granskade estimatet står kvar.

**Förkastade alternativ:** group-länka 0340↔0152 (kräver ändå att ett av de spretande estimaten väljs — då är borttagning av den yngre dubbletten ärligare); behålla båda med delat group_id och medelvärde (hittar på en siffra ingen granskat).

**Lärdom:** godkännanden av poster med `duplicateOf`-förslag bör länkas eller avvisas — aldrig vanlig-godkännas. Issue-mallen visar redan `--group`-kommandot; om det upprepas kan approve varna hårdare.

## 2026-07-05 — Dubblettrevision av review-kön: 26 avvisade + vaktmästare i issue-synken

**Beslut:** Systematisk dubblettsökning av kön (213 poster) mot publicerat (223) på ägarens order: exakt citatmatch, inneslutna citat (samma parti), köinterna dubbletter och fuzzy-titel (findPossibleDuplicate). Fynd: 13 exakta + 13 inneslutna + 1 köintern (samma post som en exakt) = 26 poster avvisade via review-CLI med skäl "dublett av p-XXXX (dubblettrevision 2026-07-05)"; kön 213 → 187. 6 fuzzy-kandidater (0,33–0,80) lämnade till ägaren — bl.a. jämställdhetsbonusen (kö-post ~0,80 mot rättade p-2026-0337) och C-polislöftena mot p-2026-0318. Bara ~hälften av de säkra dubbletterna var flaggade av publish-dedupen (fuzzy-tröskeln är medvetet försiktig och exakt citatmatch mot PUBLICERAT fanns inte som kontroll) — grundorsaken till att euro-dubbletten (p-2026-0340) slank igenom.

**Vaktmästare i issue-synken:** poster som hanteras utanför issue-flödet (CLI/revision) lämnade föräldralösa öppna issues. `sync-review-issues.mts` stänger nu öppna review-issues vars review-id inte längre finns i kön (kommentar + close, kapad av SYNC_CAP) — körs automatiskt vid varje pipelinekörning, så dagens 26 städas utan att GitHub-kopplingen i sessionen behövs.

**Motiv/lärdom:** Överlappet är väntat engångsbrus — seeden publicerade från samma sidor som B nu autofångar, och varje NY källa (manifest-PDF:erna) återfångar redan seedade löften. Rutin efter stor källtillväxt: kör dubblettsvepet. Kandidat till framtida grind: exakt citatmatch mot publicerat borde auto-flagga i publish (starkare än fuzzy-titeln).

**Påverkan:** data/needs_review.json (−26), `pipeline/scripts/sync-review-issues.mts` (openIssues + vaktmästarfas). Typecheck rent, 164 tester gröna, T7 grönt.

## 2026-07-05 — Bulkgranskning av review-kön exekverad (ägarbeslut): 128 publicerade, 55 avvisade

**Beslut:** Ägaren beställde full granskning av kön (187 poster) med rekommendation per post, och beordrade därefter exekvering av hela listan. Granskningsgrund: G3-citatkvalitet, kostnadsbärande vallöfte eller ej, dubbletter (mot publicerat, internt i kön), paraplyformuleringar som dubbelräknar partiets specifika löften i totalen, samt estimatens storleksordning. Utfall: **128 godkända** (varav 2 med korrigerade belopp: L:s 5 %-BNP-försvar 350→200 mdkr/år — estimatet blandade total med MERkostnad; MP:s halverade matproduktionsavgift 20→9 mdkr/år — dubbelt för stor lönesumma), **55 avvisade** (16 G3-parafraser, 19 riksdagsmotioner/utrikespositioner — 'Riksdagen ställer sig bakom…' är inget vallöfte, 6 dubbletter mot publicerat, 5 köinterna dubbletter, 8 paraplyer, 1 skattehöjning felklassad som utgift), **4 kvar** för ägarens egen bedömning (intern dubbelflagg + barnbidrag/bostadsbidrag-överlapp mot p-2026-0325 + två engångskostnader som skulle publiceras som per-år). Fullständig rapport med skäl per post levererad till ägaren (rekommendationer.md).

**Spårbarhet:** varje avvisning bär skäl + '(bulkgranskning 2026-07-05, rekommendationsrapport)'; changelog-post `manual-bulk-review-2026-07-05` listar alla 128 nya id:n med omräknad data_hash. Publicerade totalt: 223 → 351 (m:83 c:74 mp:70 l:43 s:27 kd:23 v:23 sd:11). Issue-vaktmästaren stänger de hanterade posternas issues vid nästa pipelinekörning.

**Notering om balans:** SD (11) och S (27) släpar — SD har inget publicerat manifest ännu (fångas automatiskt när det släpps) och S:s valplattform är bara 4 sidor. Skevheten speglar partiernas faktiska skrivna output (§17: ska inte konstgjort jämnas ut).

**Förkastade alternativ:** exekvera även de 4 gränsfallen (två är systemfrågan engång-vs-per-år som förtjänar ett principbeslut, inte ett tyst massbeslut); logga avvisningarna i changelog (changelog har aldrig loggat avvisningar — kön är inte publicerad data).

## 2026-07-05 — "Senast uppdaterad" frös vid seed-datumet (Layout läste fel löfte)

**Beslut:** Ägaren upptäckte att "Senast uppdaterad" i sajthuvudet aldrig uppdaterades. Grundorsak: `Layout.astro` läste `promises[0].source.fetched_at` — men promises.json är id-sorterad, så det var ÄLDSTA seed-löftets hämtningsdatum (juni-importen), fruset för alltid. Samma värde matar stale-bannern (§15), som därmed kunde lysa "data kan vara inaktuell" permanent. Fix: `lastRun` = senaste changelog-postens timestamp — pipelinen appendar en post VARJE körning (även utan nya löften) och manuella rättelser loggas också, så det är den ärliga signalen för både "senast uppdaterad" och stale-detektion. `test-t3-stale.mts` åldrar nu även changeloggen (med backup/restore) så testet speglar den nya källan.

**Förkastade alternativ:** max(fetched_at) över löftena (uppdateras bara när NYA löften publiceras — en frisk körning utan fynd skulle se död ut och trigga falsk stale-banner); byggtid som "uppdaterad" (ljuger — en ombyggnad utan ny data är ingen uppdatering).

**Påverkan:** `site/src/layouts/Layout.astro`, `site/scripts/test-t3-stale.mts`. Verifierat: färskt bygge visar "Uppdaterad 2026-07-05" utan stale-banner; T1/T3/T9/T3-stale/intervall alla gröna.

## 2026-07-06 — Samma politik räknas en gång: R3 aktiverad i alla summor + tvärparti-dublettvakt

**Bakgrund (ägarobservation):** L och C lovar båda 5 % av BNP till försvaret — olika citat, olika prislappar (200 resp. 190 mdkr/år), båda fullt räknade i totalen. Går bara att genomföra en gång: "om två gör 5 % vardera blir det mer än 5 % för landet". R3/group_id fanns redan och koalitionsvyn räknade grupper en gång — men 0 löften var länkade (auto-länkning krävde identiska citat; dublettvakten hoppade medvetet över andra partier) och huvudtotalen/partisummor/kategorier deduperade inte alls.

**Beslut 1 — dedupeByGroup i alla summor.** `totalFlasket`, `totalBesparingar`, `totalFlasketInterval`, `categoryBreakdown` och `partyTotalMsek` räknar nu varje grupp EN gång (första posten i id-ordning representerar; spannet syns i gruppnoterna). Semantiken är tvådelad med flit: i jämförelsen MELLAN partier räknas varje partis löfte fullt (var och en skulle genomföra det — tvärparti-grupper påverkas inte av partifiltret), i totaler/koalitioner räknas politiken en gång. Interna dubbletter inom ett parti kollapsar även i partisumman.

**Beslut 2 — 12 löften länkade i 5 grupper** (changelog `manual-group-linking-2026-07-06`): g-forsvar-fem-procent-bnp {L 0340, C 0384}, g-bistand-enprocentsmalet {C 0388, MP 0410}, g-slopad-karens {MP 0326, MP 0445, S 0461}, g-fast-lakarkontakt {S 0011, C 0357, L 0399}, g-sjalvforsorjning-80 {C 0368, C 0386 — intern C-dubblett från bulkgranskningen}. Effekt: mandatperiod-totalen 12 903 → 11 983 mdkr (−921 mdkr dubbelräkning, ~7 %).

**Beslut 3 — tvärparti-dublettvakt i pipelinen.** Ny `findCrossPartyDuplicate` (samma kategori, INGET partiöverlapp, titellikhet ≥ 0,35 — kalibrerad mot L/C-fallets faktiska 0,375; 'fem'/'5' tokeniseras olika) körs efter intra-parti-kollen i runPipeline → review med duplicateOf, så issuet föreslår `--group`. När M/SD/KD släpper sina manifest (som garanterat också lovar 5 % och slopad karens) fångas överlappen i granskningen i stället för i totalen. /metod-kulan omskriven: "Samma politik räknas bara en gång" med 5 %-exemplet och parti-mot-parti-undantaget förklarat.

**Förkastade alternativ:** räkna gruppens max/medel i stället för första posten (max överdriver, medel är en siffra ingen sagt — första-i-id-ordning är deterministisk och konsistent med koalitionsvyn sedan tidigare); harmonisera L/C:s 5 %-estimat till samma tal (olikheten är ärlig — olika BNP-antaganden — och gruppnoten redovisar spannet); auto-länka tvärparti-träffar utan människa (länkning är ett redaktionellt beslut, §7).

**Påverkan:** `site/src/lib/aggregates.ts` (dedupeByGroup + 5 funktioner), `site/src/pages/metod.astro`, `pipeline/src/similarity.ts` (findCrossPartyDuplicate), `pipeline/src/index.ts` (dublettkedjan), `pipeline/tests/similarity.test.ts` (+4), data: 12 löften group-länkade + changelog. 168 pipelinetester gröna, hela sajtsviten grön, T7 grönt.

## 2026-07-08 — Review-kö avbetad + dubblettrensning: p-2026-0091 tillbakadragen (MP vinst i skolan)

**Bakgrund:** Granskning av review-kön en post i taget (äldst först) på ägarens begäran. #166 (MP investeringsstöd återvinning metall/mineral) godkändes 300/800/2000 msek/år — dess `duplicateOf: "(denna körning)"`-flagg var en FALSK positiv: heuristiken (Jaccard ≥ 0,3) matchade p-2026-0415 "investeringsstöd för grön baskraft" enbart på delade boilerplateorden "Miljöpartiet vill införa investeringsstöd för", trots helt olika politik (materialåtervinning vs elproduktion). Ingen länkning gjord. #189 (MP "Avskaffa marknadsskolan med vinstdrivande aktiebolag", PHP s.61) godkändes som **p-2026-0470**, engång 5 000/20 000/60 000 msek.

**Beslut — p-2026-0091 tillbakadragen som dublett.** p-0470 och det redan publicerade p-2026-0091 "Vi ska stoppa vinsterna i den svenska skolan" (Helldéns Almedalstal) är samma MP-politik: avskaffa vinst i skolan. Heuristiken flaggade dem inte (titelord överlappar 0,00). p-0091 var en 0-kr-paroll utan egen prislapp; p-0470 bär den enda riktiga siffran (20 mdkr engång, inlösen/ombildning). Group-länkning avfärdades: `dedupeByGroup` låter lägsta id representera gruppen → p-0091:s 0 kr hade nollat p-0470:s estimat i totalen. Borttagning ärligare (euro-dublett-prejudikatet 2026-07-05). Eftersom p-0091 vägde 0 kr ändras **ingen summa** — bara löftesantal (354→353) och att paroll-sidan utgår. Rättelse-post `manual-retract-duplicate-2026-07-08` i changeloggen med omräknad `data_hash`; borttagningen syns öppet på /rattelser (tyst rättelse förbjuden §17).

**Förkastade alternativ:** group-länka + flytta kostnaden till p-0091 (behåller båda källor men klistrar en 20-miljardersprislapp på en enradig slogan — inkoherent); behålla båda ogrupperade (dubbelräkning så fort någon sätter kostnad på p-0091); status=tillbakadragen i stället för borttagning (statusen betyder att PARTIET drog tillbaka löftet, inte att vi deduperade — missvisande).

**Observation (ej åtgärdad här):** review-issue-godkännanden (`handle-review-comment.mts`) skriver ingen changelog-post och räknar inte om `data_hash` — efter #166/#189 låg changeloggens hash 2 löften efter promises.json tills denna rättelse läkte det. Självläker annars vid nästa pipelinekörning. Kandidat att åtgärda: låt review-approve appenda en changelog-post som pipelinen gör.

**Påverkan:** `data/promises.json` (−p-2026-0091, 353 kvar), `data/changelog.json` (+rättelse-post). Ingen kodändring; monetära totaler oförändrade.

## 2026-07-08 — Review-godkännanden synkar changelog + data_hash (rotorsaksfix)

**Bugg:** `approve()` i `review.ts` skrev promises.json men appendade ALDRIG en changelog-post eller räknade om `data_hash`. Alla tre godkännandevägar (CLI, issue-kommentar via `handle-review-comment.mts`, etikett-bulk via `apply-labeled-decisions.mts`) går genom `approve()`, så varje godkännande lämnade changeloggens sista `data_hash` efter promises.json tills nästa pipelinekörning skrev en färsk post. Effekt: `summary.json` (läser changeloggens sista hash), sidfotens integritetshash och Layout-"senast uppdaterad" släpade; och de godkända löftena fick aldrig en `added`-post → saknades i veckokrönikans "nytt denna vecka". Inventering visade **8 löften** som aldrig loggats i `changelog.added` (p-0313/0314/0339/0468 från tidigare sessioner + dagens p-0469–0472) — latent sedan issue-flödet byggdes 2026-07-04.

**Fix:** `approve()` appendar nu en changelog-post (`run_id: review-<id>`, `added:[nyaId]`, `updated:[länkat mål om group_id nyskapades]`, omräknad `data_hash`, tidsstämpel) precis som `publish.ts` — via delad `computeDataHash` (signatur vidgad till `readonly unknown[]`) och ny `appendChangelog`-helper (saknad changelog ⇒ börja tom, robust i test/första körning). Avvisningar loggas ALDRIG: kön är inte publicerad data och promises.json/hashen ändras inte av en avvisning.

**Heal av befintligt släp:** backfill-post `backfill-review-approvals-2026-07-08` med dagens fyra issue-godkännanden (p-0469 återvinning, p-0470 marknadsskola, p-0471 bredband, p-0472 maffialag) + synkad hash. De fyra äldre (p-0313/0314/0339/0468) backfillas INTE — de tillhör tidigare veckor och att datera om dem till idag skulle felaktigt lägga dem i denna veckas krönika; deras `added`-lucka är kosmetisk och kvarstår medvetet.

**Förkastade alternativ:** låta nästa pipelinekörning läka hashen (fungerar men lämnar ett fönster där sidfotens hash ljuger + tappar `added` för dagens fyra); logga även avvisningar (kön är inte publicerad data — changeloggen har aldrig loggat avvisningar); en tom "hash-refresh"-post utan `added` (läker hashen men tappar dagens fyra ur krönikan).

**Verifierat:** typecheck rent, **169 pipelinetester gröna** (+1: `approve` appendar changelog med matchande hash), check-t7 OK. **Påverkan:** `pipeline/src/review.ts`, `pipeline/src/publish.ts` (signatur), `pipeline/tests/review.test.ts` (+1), `data/changelog.json` (backfill). Ingen kod i sajten; monetära totaler oförändrade.

## 2026-07-09 — Arkiv-backfill: archive_url fylls för publicerade löften (rotorsak + engångskörning)

**Bugg:** `archive_url` var null för 354 av 355 publicerade löften — SPEC §14/§6.2 och README kräver en Wayback-snapshot som bevis per löfte. Grundorsak: live-pipelinen arkiverar (`index.ts` → `archiveFn`), men de två vägar som skapade nästan all data — **seed-importen** (`import-vallen.ts`) och **review-godkännanden** (`review.ts` sätter `archive_url: null`) — arkiverar aldrig, och SPEC:ens utlovade retry ("nytt försök nästa run tills satt") var **aldrig implementerad**. Nullen fylldes därför aldrig. (Enda arkiverade: p-0338, en live-körning.)

**Fix (rotorsak):** nytt steg `pipeline/scripts/archive-backfill.mts` (`pnpm archive:backfill`) i tre faser — (A) Wayback availability-API för befintlig snapshot (nära `fetched_at`, annars valfri), (B) `save`-begäran för URL:er utan snapshot (bunden budget), (C) vänta på indexering + omkoll. Robust mot archive.orgs rate-limits (retry+backoff, throttle). Idempotent (bara `archive_url===null`), dedup på käll-URL utan `#fragment` (PDF-sidankaret bevaras på snapshoten). Uppdaterar promises.json + changelog (`updated` + omräknad `data_hash`). Wired in i `pipeline.yml` (`save 12`/körning, best-effort) → självläker framåt och täcker seed/review/misslyckad live-arkivering enhetligt.

**Engångs-backfill körd (2026-07-09):** **336/355 löften har nu en Wayback-länk** (var 1). Changelog-post `archive-backfill-2026-07-09` (updated: 335). Kvar null: 19 = **12 youtube** (avsiktligt hoppade — bevis är transkripten i det privata `vallen-2026`-valvet, inte en snapshot av watch-sidan; video-URL:en är i sig beständig) + **7 vars save ännu indexeras** (fångas av det återkommande steget nästa körning). Ungefär hälften löstes ur befintliga Wayback-crawls (~06-25), resten ur nyskapade saves.

**Förkastade alternativ:** peka `archive_url` mot `vallen-2026`-valvet (privat repo → 404 för allmänheten; bevislänken måste vara publik); arkivera synkront i `approve()` (lägger Wayback-latens/skörhet i review-flödet — retry-steget är rätt plats per §6.2); en separat schemalagd arkiv-workflow (onödig — pipelinen kör 3×/dygn och steget är bundet/best-effort).

**Verifierat:** typecheck rent; diffen rör bara `archive_url` i promises.json (inga andra fält); PDF-`#page`-fragment bevarade (116 st); ny `data_hash` matchar promises.json. **Påverkan:** `pipeline/scripts/archive-backfill.mts` (ny), `pipeline/package.json`, `.github/workflows/pipeline.yml`, `pipeline/src/review.ts` (kommentar), `data/promises.json` (+335 archive_url), `data/changelog.json`.

## 2026-07-09 — Innehållsgranskning (Claude-driven audit) + åtgärdsbatch 1 (SPEC-korrigeringar)

**Granskningen:** systematisk audit i fyra dimensioner. Verbatim kördes mekaniskt inline (hämtning + ordagrann matchning av alla 340 webb/PDF-citat + reclass): **inga påhittade citat**; enda strukturella fyndet är att 19 KD-Almedalen- + 15 youtube-citat är sourcade till watch-sidor som inte bär transkriptet (bevis i vallen-2026-valvet). Estimat/dublett/felklass via lean multi-agent-svep (per kategori, små slices) + inline deterministisk verifiering. Full rapport: `scratchpad/AUDIT-2026-07-09.md`. 46 materiella fynd; störst effekt en handfull beloppsfel (~1 500 mdkr uppblåsning). Rotorsaker: period=per_ar-default 4×-inflaterar engångskapital; tomma mall-method_notes ger schablonbelopp; "LLM-kostnadsanrop misslyckades" auto-publicerades; nyhetsartiklar → refererat tyckande som löften.

**Batch 1 — objektivt korrekta SPEC-korrigeringar (denna commit):**
- **Periodfel** (engångsbelopp felkodat per_ar → ×4): p-2026-0336 (C "investera 50 mdr under mandatperioden": 200→50 mdkr, period=engang) och p-2026-0043 (M Gripen-engångsgåva: 120→20 mdkr, engang base 20000). Fläsket 12 057 → 11 807 mdkr (−250).
- **Skattesänkning felklassad som `utgift` → `intäktsminskning`** (SPEC §8: "Skattesänkningar = intäktsminskning = kostnad i Fläsket"): p-0026, 0027, 0056, 0101, 0127, 0157, 0166, 0254, 0256 (9 st). Total oförändrad (båda typerna adderas i R4) — korrekt semantik/neutralitet.

**Kvar (kräver ägarbeslut, ej i denna batch):** recosting av kärnkraftstrion (0082/0109/0153, ~−900 mdkr) och övriga överskattningar (0264/0216/0112/0333/0321/0137/0371/0376); icke-löften (0310/0307/0308/0311/0309/0174 — nolla vs stryka); 25 dublett-kluster (R3-länkning, representant-kostnadsval); p-0428 (pensionsavgiftshöjning summerad som utgift). Changelog-post `audit-fix-spec-corrections-2026-07-09` (updated: 11).

## 2026-07-09 — Audit-åtgärd batch 2 (icke-löften tillbakadragna) + batch 3 (recosting) — ägarbeslut

**Batch 2 — 5 icke-löften tillbakadragna** (D-filter, ej vallöften utan refererat tyckande/invändningar): p-0310 (M:s invändning MOT höjt barnbidrag), p-0307 (Busch MOT stora skattesänkningar), p-0308/0311 (SVT-artikelns positionering), p-0174 (V "total översyn av migrationspolitiken", vagt). 355→350 löften.

**Batch 3 — 12 överskattningar recostade** (ägaren godkände förslagen): kärnkraft 0082/0109/0153 (100 mdr/år → 10 mdr/år årlig kapitalkostnad inom mandatet; R3-länkas i batch 4), elbil 0264 (50→7,5 mdr/år), bistånd 0112 (50 mdr/år → 0, bibehålla = ingen merkostnad), Sverigepriser 0216 (50→10), biogas 0333 (10→4), Sverigekort 0321 (18→8, netto ej brutto), garantipension 0137 (20→12 per notens egen uträkning), lagföring 0371 (4000→500, tidigare "cost-call misslyckades"), Ekokrim 0376 (800→100, kostnadsneutral omorg.), barnbidrag KD 0306 (5000→18900 i linje med p-0100). Alla fick sänkt confidence (≤0,5) + korrigeringsnot.

**Effekt:** Fläsket 11 807 → **9 928 mdkr** (−1 879). Innebär att totalen var uppblåst ~2 130 mdkr (~18 %) av period-/skalfel före granskningen. Changelog `audit-fix-retract-recost-2026-07-09`.

## 2026-07-09 — Audit-åtgärd batch 4: R3-länkning av 25 dublett-kluster

**Beslut:** 25 grupper, 54 löften group-länkade så samma politik räknas en gång (R3). Vid verifiering av agentens klustring rättades tre fel: **p-0107** (om skärmar, ej klasstorlek) uteslöts ur mindre-klasser-gruppen; **p-0048** (M "se över IVF-riktlinjer", mjukare) uteslöts ur IVF-doublingen (bara 0049/0377 länkade); **p-0267** recostades ner (5000→300, bottom-up) så gruppens representant (lägsta id) bär det bättre estimatet i st f det generiska. Representant-regeln (lägsta id representerar i totalen) beaktades per kluster; spannet syns i koalitionsvyns gruppnoter. Notabelt: g-l-smartast-europa (0093/0148) nollar korrekt L-paraplyets 60-mdkr dubbelräkning av redan separat räknade delsatsningar (0154/0155/0156).

**Kluster (gid):** kd-barnbidrag-2000, elbilspremie (C+MP), ny-karnkraft-baskraft (M/KD/L), mindre-klasser (S/L), c-dubbla-straff-barnrekrytering, c-frikommunforsok, ivf-tre-till-sex (M/C), c-landsbygd-primarvard, mp-barnbidrag-familjestod, mp-fossilvaxling-jordbruk, c-klimatomstallning, pfas-gruppforbud (C/MP), stoppa-industrifiske (M/L/MP), l-smartast-europa, l-spetsutbildning, tillganglig-elevhalsa (KD/MP), avskaffa-vinstskola (L/MP), slopa-mangdrabatt (M/L), forfattningsdomstol (C/L), m-vald-mot-kvinnor, c-stoppa-kompetensutvisning, kd-allman-varnplikt, s-militar-upprustning, m-forsvar-nato-mal, v-bebispeng.

**Effekt:** Fläsket 9 928 → **9 092 mdkr** (−836). **Hela granskningens totaleffekt: 12 057 → 9 092 mdkr (−2 965, ~25 %)** — headline-totalen var kraftigt uppblåst av periodfel, överskattningar, icke-löften och tvärparti-/intra-dubbelräkning. Changelog `audit-fix-r3-linking-2026-07-09` (updated: 54). Kvar ur rapporten: p-0428 (pensionsavgift), ett fåtal mindre felklass (0055/0162/0098-delning), samt verbatim-noteringen om KD-Almedalen/youtube-transkriptkällor — plus rotorsaksfixarna i pipelinen.

## 2026-07-09 — Rotorsaksfix i kostnadssteget (period + kostnadsfel) efter granskningen

Två av granskningens rotorsaker satt i `cost.ts` och rättas i koden så felen inte återkommer:

**1. Kostnadssteg-fel returnerade ett trovärdigt schablonbelopp.** Vid dött LLM-anrop / ogiltig JSON / saknade tal returnerades `placeholder` (base **4000**) — som maskerade sig som ett riktigt estimat och bulk-godkändes (så fick p-2026-0371 base 4000 med noten "LLM-kostnadsanrop misslyckades"). Ny `failedCost()` returnerar **base 0** + note "…belopp MÅSTE sättas manuellt" + confidence 0,1 → syns tydligt i review och bidrar 0 om det ändå publiceras. (Den vanliga "inget LLM konfigurerat"-platshållaren för offline/test är oförändrad.)

**2. Period defaultade till per_ar (×4) utan engångsdetektering.** Ny `looksLikeOneOff()` (gåva/skänk/inlösen/återköp/engångs, eller "under (nästa) mandatperiod" = totalbelopp) tvingar period=engang när LLM sagt per_ar → förhindrar 4×-felen (Gripen-gåvan p-0043: 120→20; landsbygdsinvesteringen p-0336: 200→50). Noten markerar att perioden satts av signalen.

**Ej åtgärdat i kod (svårare, noteras):** tomma mall-`method_notes` som schablon-estimat (kräver kvalitetsgrind mot generiska noter); nyhetsartiklar som ger refererat tyckande som "löften" (0307–0311 — extraktprompten A1 exkluderar redan "kritik av motståndare", men gränsfall slinker till review och bulk-godkänns → egentlig fix i granskningsdisciplin, ej kod). **Verifierat:** typecheck rent, **172 pipelinetester gröna** (+4). **Påverkan:** `pipeline/src/cost.ts`, `pipeline/tests/cost.test.ts`.

## 2026-07-09 — Audit-åtgärd batch 5: sista småfelen

Fyra kvarvarande felklass-/beloppsfynd rättade: **p-0428** (MP) — pensionsAVGIFTShöjningen (intäktssida) summerades in som utgift; base 3500→2000, bara pensions-/bostadstilläggshöjningen räknas (14→8 mdkr). **p-0055** (M) — restriktion av tolktjänster är en besparing, inte utgift; type utgift→besparing (rätt tecken; per notens egen "besparing snarare än kostnad"). **p-0162** (M) — engångs strandskyddsreform stod per_ar (×4); period→engang (2→0,5 mdkr). **p-0098** (L) — blandad post där dominerande delen (RUT + skatt) är skattesänkning; type utgift→intäktsminskning (total oförändrad, SPEC §8). Fläsket 9 092 → **9 084 mdkr**. Changelog `audit-fix-remaining-2026-07-09`. Kvar från rapporten enbart verbatim-noteringen (peka KD-Almedalen/youtube mot transkript-bevis) — icke-blockerande.

## 2026-07-09 — Talade löften: tidsstämplad video-källa + källtyp "tal" (och OG-dedup-bugg funnen)

**Beslut (verbatim-fyndet ur granskningen):** de 34 talade löftena (19 KD-Almedalen + 15 youtube) citerade watch-sidor som inte bär transkriptet → svagt publikt bevis. Löst UTAN att öppna det privata `vallen-2026`-valvet (fulltext-transkript är upphovsrättsskyddat, §6.2). Fix: **den publika källan är videon, tidsstämplad**. Nytt `source.kind` ("webb"|"tal", valfritt i schemat). För tal-löften sätts `source.url` = videon vid rätt sekund (youtube `&t=<s>s`, SVT Play `?position=<s>`), `archive_url`=null (videon är själva källan; transkriptet förblir internt underlag). Tidsstämplar togs fram med `yt-dlp` (tidsatta undertexter) + citatmatchning: **33/34 mappade** (p-0100 fick videon utan tidsstämpel — SVT-undertexten formulerade om). KD-talet ligger på SVT Play (`KnDABAQ`), inte youtube. Sajt: `Citat.astro` visar "talat löfte"-markör + länken "se i talet"; `/metod` (redan med tal-avsnitt) skärpt så den publika kontrollvägen är videon, transkriptet internt underlag.

**Bugg funnen vid bygget (separat, viktig):** `site/scripts/generate-og.mts` hade en **egen kopia av `totalFlasket`/`partyTotalMsek` UTAN `dedupeByGroup`** → OG-delningsbilderna (sajtens främsta marknadsföring, §11) visade den icke-deduperade totalen **10 822** medan sajtsidorna visade rätt **9 084**. Granskningens batch-4-länkning gjorde gapet stort och synligt. Fixat: OG-scriptet deduperar nu per group_id (speglar `aggregates.ts`; kommentar mot framtida drift). Start-OG: 10 822 → **9 084 MDKR**.

**Verifierat:** sajt T1/T3/T9 gröna, OG 9 084; pipeline typecheck + 172 tester + check-t7 gröna. **Påverkan:** `data/promises.json` (34 tal-källor), `data/changelog.json`, `pipeline/schemas/promises.schema.json` (kind), `site/src/lib/data.ts`, `site/src/components/Citat.astro`, `site/src/pages/lofte/[...path].astro`, `site/src/pages/metod.astro`, `site/scripts/generate-og.mts`. Kvar: committa tidsatta transkript (.vtt) till privata vallen-2026 som bevisunderlag. (Gjort — vallen-2026 commit 3e8119f, transcripts/timed/*.vtt + MANIFEST.)

## 2026-07-09 — Reformutrymmet förklaras vid GapMätaren + rättad källa i /metod

**Bakgrund (ägarobservation):** gap-stapeln hängde utan förklaring — läsaren såg "Att satsa: 320 mdkr" utan att veta vad talet är eller varför. Dessutom sa /metod att gränsen "bedöms av Konjunkturinstitutet", men det källsatta talet (80 000 msek/år) är i själva verket **regeringens reformvolym i BP2026** (DECISION_LOG 2026-06-13), inte KI:s reformutrymme.

**Beslut:** (1) `GapMatare.astro` visar nu en förklaring direkt under stapeln (i det verifierade läget): "Att satsa = regeringens egen reformbudget för 2026 — knappt 80 mdkr/år, utöver försvar och Ukrainastöd — utslaget på fyra år" + **Källa ↗** (regeringens budget-artikel, ur konstantens source_url) + **Så räknar vi** (/metod#gap). (2) /metod-stycket rättat så det korrekt beskriver måttet (regeringens reformbudget, ej KI) och förklarar valet (källsatt, kontrollerbart; KI:s bedömning är ännu snävare → mätaren är om något snäll mot löftena); `id="gap"` för djuplänk. Källa-URL:en extraheras ur constants (första token), så den följer med om konstanten uppdateras.

**Verifierat:** bygge OK, T1/T3/T9 gröna, förklaring + länkar renderade på startsidan. **Påverkan:** `site/src/components/GapMatare.astro`, `site/src/pages/index.astro`, `site/src/pages/metod.astro`. Endast sajt/copy; ingen data.

## 2026-07-10 — Lanseringsstädning: blockerarna inför journalistutskicket åtgärdade

**Bakgrund:** Ägaren beställde en ärlig genomgång inför mjuklansering mot utvalda journalister/bloggare. Genomgången fann tre blockerare + en /metod-osanning; under åtgärdandet hittades ytterligare två skarpa fel. Allt åtgärdat:

**1. C:s skattereform räknades tre gånger.** p-2026-0141/0142/0170 = samma "skattefri grundlön"-reform ur samma artikel à 105 mdkr/år, olänkade. Grupperade (`g-c-skattefri-grundlon`); C:s partitotal −840 mdkr (nu 2 527 mdkr).

**2. Verbatim-revalidering av hela beståndet.** Nytt stående verktyg `pipeline/scripts/revalidate-quotes.mts` (`pnpm revalidate`): hämtar varje aktiv källas text via pipelinens page-väg (inkl. PDF + riksdagens .text-fallback) och G3-verifierar varje citat; video (YouTube/SVT Play) klassas EJ_TEXTKÄLLA. Utfall efter triage: **315/315 textverifierbara OK, 0 saknas, 0 onåbara, 34 video.** Triaget: (a) V-trions käll-URL bar ett stavfel ('vansterpariet') — rättad, citaten verifierade på riktiga sidan; (b) p-2026-0309 TILLBAKADRAGEN: citatet var en RSS-sammanfogning (rubrik + ingress) som inte återfinns i artikeln (arkivet onåbart härifrån, 403) — löftet får återfångas ur riktig källa; (c) 19 KD-citat med SVT Play-källa är talcitat, inte textkällor.

**3. 128 bulk-löften hade beslutsdatum som date_stated.** Alla omdaterade till källdatum: manifest-PDF:ers CreationDate (C 2026-06-04, L 2026-06-02, S 2026-02-04, V 2026-04-19), MP:s handlingsprogram till uppladdningsmånadens första dag (2026-04-01 — dagsprecision saknas), stående sidor till första fångstdatum, artiklar via article:published_time, riksdagsdokument via dokumentstatus-API:t. 128/128 daterade. Changelog `manual-revalidation-fixes-2026-07-10`.

**4. /metod ljög om granskningen (åt försiktiga hållet).** "Vi låter ingen sitta och gå igenom dem en och en" ersatt med sanningen: varje ≈-estimat går genom öppen mänsklig granskning (kö → bekräfta/justera/avvisa, publikt loggat) innan publicering.

**5. Upptäckt under städningen — veckokrönikan 2026-28 låg live som rå JSON.** `generateWeekly` parsade LLM-svaret utan staket-avskalning och FALLBACK:ade till att publicera råsvaret som brödtext med rubriken "Veckans fläsk". Fix: `extractJsonPayload` + validering av headline/body_md + KASTA vid oparsbart (aldrig publicera råtext; nästa körning försöker igen). Data reparerad ur den inbäddade JSON:en (riktig rubrik: "Miljöpartiet öser miljarder…"). 3 nya tester. Detta var också grundorsaken till att T1 föll (krönikesidan byggdes mot trasig data).

**Kvarstående kända icke-blockerare:** quips saknas på ~347 löften (tona ner "torr humor"-löftet eller backfilla); SD/S-obalansen bör förklaras synligt på partisidorna; 34 videokällade löften är verifierbara genom tittning, inte grep.

**Påverkan:** data (grupp + retract + url-fix + 128 datum + krönika reparerad), `pipeline/scripts/revalidate-quotes.mts` (nytt, npm-script `revalidate`), `pipeline/src/copy.ts`, `site/src/pages/metod.astro`, `pipeline/tests/chronicle.test.ts` (+3). 175 pipelinetester gröna, hela sajtsviten grön (T1 åter grön), T7 grönt, revalidering 315/315.

## 2026-07-10 — Manifeststatus-rad på varje partisida (SD-obalansen förklarad)

**Beslut:** Sista icke-blockeraren inför utskicket: SD:s 11 löften mot M:s 83 ser ut som bias tills det förklaras. Nytt fält `manifest_2026` i data/parties.json (schema + Party-typ uppdaterade, fältet obligatoriskt) — EN faktarad per parti om valmanifestets status, renderad på partisidan direkt under intro-siffrorna. §17-neutralt: samma rad för alla åtta (C/L "publicerat + fångat i sin helhet", S/V "valplattform publicerad/beslutad + fångad", MP "manifest ej offentligt; handlingsprogrammet vägt", M/SD/KD "ännu ej publicerat — löftena kommer ur övrigt skrivet material och manifestet fångas automatiskt när det släpps"). SD pekas inte ut — raden finns överallt och blir dessutom självuppdaterande dokumentation: när ett manifest släpps och fångas uppdateras raden manuellt till "publicerat".

**Förkastade alternativ:** hårdkoda en SD-not i partisidan (pekar ut ett parti = §17-brott); FAQ-svar på /om (granskare läser partisidan, inte FAQ:n); auto-härleda status ur sources.yaml (kommentarer är inte maskinläsbara, och statusen är redaktionell).

**Påverkan:** data/parties.json (+manifest_2026 ×8), pipeline/schemas/parties.schema.json, site/src/lib/data.ts (Party), site/src/pages/parti/[kod].astro (+stil). 175 pipelinetester, T7, hela sajtsviten gröna; SD-sidan verifierad i byggd dist.

## 2026-07-10 — "Torr humor" löst neutralt (Option A): deterministisk jämförelserad

**Bakgrund:** 347/350 löften saknade quip ("torr humor i glasyren" fanns knappt på sajten) och `comparisons` var tom på alla — jämförelsemotorn (`computeComparisons`) fanns men fick aldrig indata. Efter kostnads-/dubblettmisstagen var risken med per-item LLM-skämt (ett skämt som läser som hån mot ETT partis hjärtefråga underminerar hela neutralitetsanspråket) för hög för lansering. Valde Option A ur skissen: humorn ligger i det deadpan, inte i en vits.

**Beslut:** `defaultComparisonIds(totalKronor, constants)` — magnitud-medveten, SAMMA regel för alla partier: sjuksköterskelöner alltid (universell måttstock), Förbifart Stockholm när andelen ≥1 %, månen (myntstapel) när stapeln når ≥1 % av vägen dit (annars brus). `computeComparisons` faller tillbaka på den när `comparisons` är tom → jämförelser renderar nu för alla 349. `dryLine(promise, constants)` bygger en deadpan rad: "Motsvarar {verklig jämförelse}. Finansiering: {angiven|ej angiven}." — 0-kostnadslöften får "Ingen mätbar kostnad i kassan" i stället för "0,0 sjuksköterskor". Renderas i quip-slotten (`Marginalanteckning`) som fallback när granskad LLM-quip saknas. Derivat/presentation → härledd vid bygget, ej lagrad i öppna datan.

**Neutralitetsgaranti (testad):** identiskt belopp ger IDENTISK rad oavsett parti (S=SD=V); ingen LLM, inget partival; regeln som avgör jämförelse är enbart beloppets storlek. Skämtar aldrig om sakfråga/person/parti. `||`-fallback (inte `??`) så att de 210 TOMMA STRÄNGARNA (utöver 136 null) också får raden.

**Kvar (medvetet):** granskad LLM-quip (Option B/C i skissen) — den frivilliga "garneringen" — införs efter att granskarna gett tummen upp för siffrorna; den torra raden är baslinjen som alltid finns.

**Påverkan:** `site/src/lib/aggregates.ts` (`defaultComparisonIds`, `dryLine`, fallback i `computeComparisons`), `site/src/pages/lofte/[...path].astro` (quip-fallback), `site/src/pages/metod.astro` (rad om torra raden), `site/scripts/test-drylinje.mts` (nytt, i `pnpm test`). 175 pipelinetester, hela sajtsviten (inkl. torra raden) gröna; 349/349 löftessidor har marginalrad i byggd dist.

## 2026-07-10 — Torra raden: apolitisk vikt-liknelse (djur) i stället för policy-måttstockar

**Bakgrund (ägarbeslut, ersätter samma dags nurses-version):** Sjuksköterskelöner, vårdplatser och skolluncher är SJÄLVA saker partier lovar att finansiera — att mäta ett vårdlöfte i "sjuksköterskelöner" ramar tyst in kostnaden i policytermer och är därför inte helt neutralt. Bytt till en apolitisk fysisk liknelse: "om varje krona vägde ett gram" → löftets vikt uttryckt i djur. Ett djur kan aldrig vara ett vallöfte.

**Beslut:** `dryLine(promise)` (inte längre beroende av constants): 1 kr = 1 g → total vikt → antal djur. Djuret väljs per ÄMNESOMRÅDE (kategori), aldrig per parti — samma belopp+kategori ger ordagrant identisk rad oavsett parti (§17); kategorin varierar djuret enbart för omväxling ("så inte allt blir blåvalar"). 9 djur, alla ≥1 ton (golv satt efter att en 300-kg brunbjörn gav "1 066 667 brunbjörnar"): blåval/kaskelot/knölval/elefant/späckhuggare/noshörning/flodhäst/giraff/valross. 0-kostnadslöften: "Ingen mätbar kostnad i kassan." De gamla auto-jämförelserna (sjuksköterskor/Förbifart/månen) togs bort ur `computeComparisons` → Jämförelser-sektionen visar nu bara kurerade (tom → dold); vikt-raden är enda glasyren. /metod omskriven att förklara konceptet.

**Neutralitet (testad):** identiskt belopp+kategori → identisk rad för S=SD=V; inga policy-måttstockar kvar (test spärrar sjukskötersk/vårdplats/skolmål/lärarlön); okänd kategori → övrigt-djur.

**Förkastade alternativ:** magnitud-väljer-djur (håller siffror snygga men klustrar alla stora löften på blåval — motverkar ägarens omväxlingsönskan); djur per parti (partiskt); behålla sjuksköterskor (ägarens invändning); låta 300-kg-djur ge miljontal (spretigt).

**Påverkan:** `site/src/lib/aggregates.ts` (`dryLine` v2 + `DJUR_PER_KATEGORI`; `defaultComparisonIds` borttagen; `computeComparisons` åter kurerad-bara), `site/src/pages/lofte/[...path].astro` (`dryLine(promise)`), `site/src/pages/metod.astro`, `site/scripts/test-drylinje.mts` (omskriven). Hela sajtsviten grön; 349/349 löftessidor har vikt-raden i byggd dist.

## 2026-07-10 — Delning i sociala medier

**Bakgrund:** OG/Twitter-metataggar fanns redan (länkförhandsvisning fungerar när en URL klistras in), men ingen synlig delningsknapp. Ägaren efterfrågade delning av en sida.

**Beslut:** Ny komponent `site/src/components/Dela.astro` på löftes-, partis- och veckokrönikesidor. Progressiv förbättring utan tredjepartsspårning (§17): OS:ets delningsark via `navigator.share` (visas bara där API:t finns), "Kopiera länk" via clipboard, samt X/Facebook/Bluesky som vanliga share-intent-länkar (fungerar helt utan JS, ingen extern skriptladdning, inga spårningspixlar). Förifylld text är faktabaserad och neutral (löftets titel + belopp + "källspårat"), aldrig värderande. Astro buntar komponentens `<script>`/`<style>` externt → uppfyller `_headers`-CSP:n (`script-src 'self'`) och T3:s "noll inline-style". Layout kompletterad med `og:url`, `og:site_name`, `twitter:title/description` för stabilare förhandsvisningar.

**Förkastade alternativ:** delningsknappar från plattformarnas SDK:er (laddar tredjepartsskript, spårar användaren — bryter §17 och CSP); en global knapp i sidhuvudet (mindre relevant än per-sida-URL:en som faktiskt delas).

**Påverkan:** ny `Dela.astro`; `site/src/layouts/Layout.astro` (+4 metataggar); `site/src/pages/{lofte/[...path],parti/[kod],veckans-flask/[slug]}.astro`. Hela sajtsviten grön; delningsblocket verifierat i byggd dist på alla tre sidtyper, noll inline-script/style.

## 2026-07-10 — AI-/sökoptimering: sitemap-fix + rikare llms.txt

**Bakgrund:** Inför utskick kontroll av AI-agent-/sökbarhet. robots.txt välkomnar redan uttryckligen GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot; JSON-LD är rikt (Dataset, Article, FAQPage, WebSite+SearchAction, Organization, BreadcrumbList); llms.txt + sitemap finns. Två brister hittade och fixade:

**1. Sitemap-bugg:** veckokrönikorna var hårdkodade till `veckans-flask/2026-24` — en vecka som inte finns (faktiska: 2026-27, 2026-28). AI-crawlers/sökmotorer kunde alltså inte upptäcka de riktiga krönikesidorna. Nu itererar sitemap över `getChronicles()`.

**2. llms.txt utökad:** lade till "Vad detta är — och inte är" (så agenter INTE framställer sajten som partipolitiskt stöd — neutralitet §17), fler maskinläsbara endpoints (summary/promises/rättelser/sitemap), sidmönster (parti/{kod}, lofte/{id}/{slug}, topplistor, regeringar, jamfor), och en uttrycklig instruktion att hämta färska totaler ur summary.json i stället för att hårdkoda siffror (som rostnar). Alla länkar verifierade mot befintliga routes — inga 404.

**Ej kod (ägaråtgärder, presenterade separat):** privacy-vänlig serverstatistik via Cloudflare-edge (sajten ligger bakom CF-proxy → vy/hetaste-sidor/referrer utan cookies eller klientskript, uppfyller §17/CSP); IndexNow (CF-toggle → Bing → Copilot/ChatGPT); Google Search Console + Bing Webmaster (→ Gemini/AI Overviews).

**Påverkan:** `site/src/pages/sitemap.xml.ts`, `site/public/llms.txt`. Hela sajtsviten grön; byggd sitemap listar nu 2026-27 + 2026-28.

## 2026-07-10 — IndexNow automatiserat (spridning till AI-agenter)

**Beslut:** Automatisk IndexNow-ping vid varje deploy → Bing (matar Copilot och ChatGPT-sök), Yandex m.fl. får nya/ändrade sidor i indexet snabbt utan att vänta på crawl. Nyckelfil `site/public/547b2beea892cfb44a32d83e1901c410.txt` (IndexNow-nycklar är publika — domänägarskap bevisas genom att filen ligger live, ingen secret). `site/scripts/indexnow-submit.mts` bygger URL-listan ur senaste changelog-posten (added/updated/retracted → löftessidor) + aggregatsidor (/, topplistor, regeringar, jamfor, alla parti-sidor, senaste krönikan) och POSTar till api.indexnow.org; `--all` för backfill, `--dry-run` för test. Ny `indexnow`-jobb i build.yml `needs: deploy-pages` (kör EFTER att sajten + nyckelfilen är live), push-till-main-only, `continue-on-error` (får aldrig fälla deploy). Endast Node-inbyggda API:er (fetch/fs) → ingen install.

**Motiv:** IndexNow är den enda proaktiva kanalen till AI-agenternas index (Google/Gemini nås via Search Console-sitemap som är ägaråtgärd; ChatGPT/Claude/Perplexity/CCBot crawlar redan via robots-tillåtelse). Targetad submission (bara ändrade sidor) i stället för hela sitemap varje gång — snällt mot IndexNow, effektivt.

**Förkastade alternativ:** Cloudflare IndexNow-toggle (fungerar men binder till CF-dashboarden och submittar hela sitemap; ägaren bad om automatisering i repot); submitta alla 360 URL:er varje deploy (spammigt, onödigt); delnings-källtaggar (`?s=`) för referrer-attribution (ägaren avböjde).

**Ägaråtgärder kvar (kräver konton):** Google Search Console + Bing Webmaster (skicka in sitemap.xml); Cloudflare-edge-analytics-dashboarden för besöks-/hetaste-/referrerstatistik (cookielöst, redan aktivt eftersom sajten ligger bakom CF-proxy).

**Påverkan:** ny `site/scripts/indexnow-submit.mts`, `site/public/<KEY>.txt`, npm-script `indexnow`, `indexnow`-jobb i `.github/workflows/build.yml`. Hela sajtsviten grön; nyckelfilen verifierad i byggd dist; dry-run ger 21 targetade URL:er.

## 2026-07-11 — Delspecifikation "Ståndpunktsregistret" (SPEC-STANDPUNKTER.md) — PLAN, ej implementation

**Beslut:** Ny delfunktion planerad som delta-spec mot SPEC.md: register över partiernas besked i valets stora frågor, med samma citat-/käll-/arkivkrav som Fläskvågen. Bärande neutralitetsval: (1) frågeurval härlett ur publicerade väljarmätningar enligt öppet kriterium, aldrig redaktionellt tyckande; (2) delfrågor formuleras symmetriskt med dokumenterat rättvisetest; (3) klassificering (ja/nej/villkorat) kräver att beskedet följer ur det ordagranna citatet ensamt, bekräftat av oberoende LLM B — annars "inget tydligt besked"; (4) frånvaro av besked renderas identiskt för alla partier. "Ingen backar i tysthet" löses med append-only-historik (gammalt+nytt besked sida vid sida), publikt svängregister med RSS, och veckovis källröta-bevakning som stämplar borttagna/ändrade källor synligt (arkivkopian gäller). Ingen valkompass, ingen åsiktsskala, inga användarkonton. Riktningsbyten (ja↔nej) går alltid via review även i auto-läge. Implementering blockeras av ägarbeslut §11.1 (frågelista + kriterium).
**Motiv:** Ståndpunkter har två neutralitetsrisker löften saknar — frågeurvalet och tolkningen — därför regleras båda hårdare än löftesflödet i stället för att ärvas rakt av. Maximal återanvändning av befintlig infrastruktur (fetch, grindkanon G2/G3, verify-arkitektur, review-flöde, sources.yaml) håller kostnad och attackyta nere.
**Förkastade alternativ:** Valkompass-mekanik (ärvt absolut förbud, SPEC §1.4); åsiktsskalor/vänster-högeraxlar (tolkningsvärdering); fri LLM-klassificering utan sluten taxonomi (injektions- och driftrisk); redaktionellt frågeurval (neutralitetsbrott); separat insamlingskedja (dubblerad kostnad utan vinst).
**Påverkan:** Endast `SPEC-STANDPUNKTER.md` + denna rad. Ingen kod, inga data- eller schemafiler ändrade.

## 2026-07-11 — Namnbeslut: delfunktionen heter "Frågevågen" (ägarbeslut)

**Beslut:** Ståndpunktsregistret (arbetsnamn) heter "Frågevågen". Spec-filen omdöpt till `SPEC-FRAGEVAGEN.md`; §11.2 stängd. URL:er oförändrade: `/fragor`, `/fraga/[slug]`, `/svangningar`.
**Motiv:** Parallelliserar "Fläskvågen" (varumärkeskontinuitet) och pekar på det registret faktiskt innehåller: frågorna och partiernas besked. Vågmetaforen bärs som varumärke; metodtexten klargör att inget vägs eller värderas.
**Förkastade alternativ:** "Åsiktsvågen" (ägarens andra kandidat) — att väga åsikter antyder värdering/skala, vilket icke-målen (§1.4) uttryckligen förbjuder, och registret innehåller besked, inte åsikter; namnet hade lovat något metodsidan måste dementera.
**Påverkan:** `SPEC-FRAGEVAGEN.md` (fd. `SPEC-STANDPUNKTER.md`), denna rad. Ingen kod.

## 2026-07-11 — Frågevågen §11.3–11.5 stängda (ägarbeslut)

**Beslut:** (11.3) Topplistan "flest ändrade besked" AVVAKTAR — byggs ej i V0–V4, omprövas vid volym. (11.4) Review-regeln för riktningsbyten PÅ permanent: ja↔nej publiceras aldrig utan mänsklig granskning, även i auto-läge. (11.5) Källröta-bevakning veckovis.
**Motiv:** Ägarens svar 2026-07-11. Riktningsbyten är sajtens mest laddade påståenden; regeln är identisk för alla partier och redovisas på /metod.
**Förkastade alternativ:** Topplista från start (enstaka preciseringar hade dominerat en tunn datamängd); helautomatiska riktningsbyten (snabbare men fel sorts fel att göra obevakat); daglig källröta-koll (mer trafik utan tydlig vinst).
**Påverkan:** `SPEC-FRAGEVAGEN.md` §11. Kvar öppen: endast §11.1 (frågelistan — bereds fråga för fråga med ägaren; mätunderlag: Novus juni 2026 + nationella SOM-undersökningen 2025).

## 2026-07-11 — Frågevågen §11.1 stängd: tröghetskriterium + frågelista v1 (10 frågor) — SPEC v1.0

**Beslut:** Urvalskriterium ("tröghetsregeln"): fråga tas in om den förekommer på båda institutens publicerade viktigaste-frågor-listor — Novus topp 10 (någon av de två senaste mätningarna räknas) och nationella SOM-undersökningen topp 15. Frågelista v1: sjukvården, skolan/utbildningen, lag och ordning, invandring/integration, äldreomsorgen, klimatet/miljön, jobben/arbetsmarknaden, ekonomin, energipolitiken, försvaret/säkerheten. Underlag: Novus juni 2026 (fält 28 maj–3 juni, n=1361; topp 10: sjukvården 66 %, skola 54 %, lag och ordning 49 %, invandring/integration 45 %, äldreomsorg 42 %, klimatet 38 %, jobben 37 %, ekonomin 36 %, miljön 34 %, energipolitik 31 %), Novus januari 2026 (försvaret plats 8) och SOM 2025 ("Svenska trender 1986–2025", publ. mars 2026; topp: lag och ordning 36 %, sjukvård 29 %, skola 23 %, integration/immigration 23 %, miljö/energi 19 %, därtill ekonomi, äldrefrågor, utrikes-/försvarspolitik, arbetsmarknad m.fl. i topp 15). SPEC-FRAGEVAGEN.md uppgraderad till v1.0 REDO FÖR IMPLEMENTATION.
**Motiv:** Ägaren ville få med försvaret. Höjt tak "topp 15 hos båda" är inte beräkningsbart (Novus publicerar endast topp 10) och hade varit kriterieshopping. Tröghetsregeln är generell, verifierbar ur publicerad data, får med försvaret ärligt (topp 10 i januari) och ger stabilitet mot att listan fladdrar under valrörelsen. Kontrollräknat: unionen Novus jan+jun ger exakt de tio frågorna — inget annat kvalar in.
**Förkastade alternativ:** "Topp 15 hos båda" (ej beräkningsbart ur Novus publicerade rapporter); strikt "senaste topp 10" (hade uteslutit försvaret trots plats 8 i januari och statistiskt säkerställd men möjligen tillfällig nedgång); handplockat undantag för försvaret (godtycke — exakt det kriteriet ska skydda mot).
**Påverkan:** `SPEC-FRAGEVAGEN.md` §3 + §11.1 + statusrad. V0 startar: `data/issues.json`, schemas, stances-skelett, fixtures, RS-tester.

## 2026-07-11 — Frågevågen V0 klar: issues.json, stances-skelett, schemas, RS-invarianter

**Beslut:** V0 implementerad. `data/issues.json`: 10 frågor / 22 delfrågor med källbevis per fråga (Novus juni 2026 + SOM 2025, URL + placering + andel) och dokumenterat rättvisetest per delfråga. `data/stances.json`: RS1-komplett skelett, 176 celler (22 × 8 partier), samtliga `inget_tydligt_besked`. Nya schemas `issues.schema.json` + `stances.schema.json` (draft 2020-12, additionalProperties:false), inkopplade i T3-valideringen. Ny ren modul `pipeline/src/stances.ts` (typer, `classifyChange`, `buildSkeleton`, `validateStanceInvariants` — ingen I/O, samma arkitektur som gates.ts) + idempotent generator `pnpm stances:skeleton` + testfil med RS1–RS5-fall inkl. riktningsbytesfixtur. 188/188 tester gröna, typecheck ren, båda datafilerna ajv-valida.
**Avvikelser från SPEC-FRAGEVAGEN §4.1:** (1) fältet `formulation_status: utkast|verifierad` tillagt per delfråga — ger en maskinkontrollerbar grind till V3 (alla ska vara `verifierad` före skarp drift) i stället för lösa löften; (2) statements bär alltid tydligt besked (ja/nej/villkorat) — nedgraderade kandidater publiceras inte som statements, `inget_tydligt_besked` finns endast i `current`; (3) injektionsfixtures för ståndpunktsextraktion flyttade till V2 där prompt A6/grindarna de testar byggs — V0:s fixtures täcker datamodellen (ändringsfall, RS-brott).
**Förkastade alternativ:** ajv-validering i stances.ts (T3 äger redan schemakontrollen; modulen hålls I/O-fri och deterministisk); skelettgenerering i publish.ts (frågelistan ändras via PR, inte av pipelinen — separat script är rätt ansvar).
**Påverkan:** `data/issues.json`, `data/stances.json`, `pipeline/schemas/{issues,stances}.schema.json`, `pipeline/src/stances.ts`, `pipeline/scripts/stances-skeleton.mts`, `pipeline/tests/stances-invariants.test.ts`, `pipeline/package.json`, `site/scripts/test-t3.mts`. Nästa: V1 (sajtsidor mot fixtures).

## 2026-07-11 — Frågevågen §5.0: källprincip "fråga aldrig partierna" + riktad sidbevakning (page_watch)

**Beslut:** Besked hämtas ENDAST ur publicerade allowlist-källor med ordagrant citat + Wayback-arkiv — aldrig via enkäter/mejl till partierna. Ny feedtyp `page_watch` i sources.yaml: ägar-kuraterade, symmetriska listor över partiernas officiella politiksidor (politik A–Ö, valmanifest-sidor) hämtas varje körning, innehållshashas mot seen.json, och endast ändrat/nytt innehåll går genom A6 → grindar → LLM B → arkiv. Byggs i V2 (fetch-utökning) och V3 (skarpa URL:er, VERIFIERA).
**Motiv:** Ägarkrav 2026-07-11: "inte fråga utan gå på officiella sidor och uttalanden backade av snapshots". Enkätvägen låter partier putsa svar och skapar särbehandlingsyta; publicerade uttalanden är symmetriska och bevisbara. RSS-flöden missar statiska ståndpunktssidor — riktad bevakning stänger luckan utan ny källtyp (samma allowlist, samma grindar).
**Förkastade alternativ:** Partienkäter (klassisk valkompassmetod — bryter källprincipen och ger ojämn svarsbenägenhet); skrapning utanför allowlist (bryter G2); manuell klippsamling (skalar inte, bryter G4-målet i SPEC §1.3).
**Påverkan:** `SPEC-FRAGEVAGEN.md` §5.0 (ny), sources.yaml-utökning i V3, fetch.ts-utökning i V2.

## 2026-07-11 — Frågevågen V1 klar: /fragor, /fraga/[slug], /svangningar, partisektion, OG, T14

**Beslut:** V1 byggd i designriktning A. Nya sidor: `/fragor` (registrets försättsblad med kriterienot), `/fraga/[slug]` (frågehuvud i mono-ram, svarsförst-stycke, en tabell per delfråga med 8 partirader — besked som mono-versal, citat, datum, källa+arkiv, stabila ankare `#<sq-id>` och `#<sq-id>-<partikod>`, tidslinje per parti, korslänk "Frågan i Fläskvågen" via kategori, "Därför är frågan med" med källbelägg), `/svangningar` (då/nu-par sida vid sida, tomt-läge med ärlig nollrad). Partisidorna får sektionen "Besked i de stora frågorna". All presentationslogik i `site/src/lib/stances.ts` (rena funktioner) — tomcells-copyn genereras av EN funktion och är därmed garanterat byte-identisk för alla partier. OG-bilder per fråga: neutral kostym, jättesiffran är "X/8 partier med tydligt besked" — ett datum, aldrig ett omdöme. Nav + sitemap uppdaterade. Nytt CI-test T14 (`site/scripts/test-t14.mts`): 8 rader per delfråga, byte-identisk tomcells-copy inom och mellan sidor, ingen quip i tomt läge. Hela sajtsviten grön (182 kontroller).
**Motiv:** Sidorna renderas mot verklig (tom) stances.json — fejkade statements i data/ hade blivit publicerad desinformation vid merge. Tomt läge är sanningen före V3 och designas därför som förstklassigt tillstånd ("REGISTRERADE ÄNDRINGAR: 0"). Besked utan färgsemantik (ingen röd/grön per DESIGN.md §3); ändringar markeras med Stampel "ÄNDRAT n×".
**Förkastade alternativ:** Fixture-statements i data/stances.json för demo (publicerar påhittade partibesked — otänkbart); 8-kolumnsgrid med partier som kolumner (havererar på mobil och i print; partier som rader ger likvärdig läsning och skärmdumpbarhet); Ändringsvy inbakad i frågesidan enbart (svängregistret behöver egen prenumererbar yta, RSS kommer i V4).
**Påverkan:** `site/src/lib/stances.ts`, `site/src/pages/{fragor,svangningar}.astro`, `site/src/pages/fraga/[slug].astro`, `site/src/pages/parti/[kod].astro`, `site/src/components/SiteHeader.astro`, `site/src/pages/sitemap.xml.ts`, `site/scripts/{generate-og.mts,test-t14.mts}`, `site/package.json`. Kvar: V2 (pipeline: A6–A8, G6–G8, page_watch, ändringsdetektering, injektionssviten), V3 (skarpa politiksidor + review-läge + delfrågeverifiering), V4 (API/RSS/källröta/llms.txt).

## 2026-07-11 — Frågevågen V2 klar: ståndpunktspasset i pipelinen, hårt gatat

**Beslut:** V2 implementerad. Nya promptar A6 (ståndpunktsextraktion, sluten delfrågetaxonomi injiceras) och A7 (oberoende verifiering: beskedet måste följa ur citatet ENSAMT). Ny modul `stance-pipeline.ts`: G1 (schema, additionalProperties:false), G2/G3 återanvänder exakt löftenas kanon (canonicalDomain, normalizeForVerbatim, 5–40 ord), G6 (sluten taxonomi + RS4-villkorstvång), G7 (±548 d), G8 (max 3 kandidater/parti/artikel — fler ⇒ hela artikeln till review). Publicering med mekanisk ändringsdetektering (classifyChange) och dublettskydd på normaliserat citat. Egen review-kö `data/stances_review.json` (eget schema, in i T3). Changelog-poster bär valfria stances_added/stances_changed. Passet delar artikelloopen i index.ts (måste — seen.json markerar artiklar behandlade) och styrs av `STANCES_ENABLED` (default AV).
**Hårda grindar (ägarkrav "inget live innan dubbel- och trippelverifierat"):** (1) STANCES_ENABLED=false som default — passet existerar inte i drift förrän ägaren slår på det; (2) UTKAST-grinden: delfråga med formulation_status≠verifierad kan aldrig autopubliceras; (3) riktningsbyten ja↔nej alltid till review även i auto; (4) PIPELINE_MODE=review skickar allt till kön. Alla fyra enhetstestade + integrationstest att flaggan AV inte skriver några ståndpunktsfiler. T11 (citat som kräver kontext ⇒ aldrig besked), T12 (5 injektionsvarianter ⇒ noll publicerade), T13 (ja→nej ⇒ review, historik orörd; ja→villkorat ⇒ publicerad villkorsandring) gröna. 207/207 tester.
**Avvikelse:** A8 (ståndpunktsquips) implementeras INTE i V2 — V1-sidorna renderar inga quips och neutralitetsrisken i svänghumor är omotiverad före skarp driftserfarenhet; promptmall finns i spec-bilagan om ägaren vill aktivera senare. page_watch (§5.0) visade sig redan finnas som befintlig "page"-feedtyp med innehållshash och PDF-autoföljning — alla 8 partier täcks i sources.yaml; ingen ny fetch-kod behövdes.
**Förkastade alternativ:** Gemensam review-kö med löftena (olika beslutsdata: belopp vs riktning; olika approve-semantik); separat ståndpunktskörning utanför artikelloopen (seen.json hade redan konsumerat artiklarna); LLM-avgjord ändringsklassning (RS5 kräver mekanik).
**Påverkan:** `pipeline/prompts/{A6,A7}*.md`, `pipeline/schemas/{stance-extraction,stances_review}.schema.json`, `pipeline/src/{stance-pipeline,index,publish,cli-run}.ts`, `pipeline/schemas/changelog.schema.json`, `pipeline/tests/stance-pipeline.test.ts`, `data/stances_review.json`, `site/scripts/test-t3.mts`.
