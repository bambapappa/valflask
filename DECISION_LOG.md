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


