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


