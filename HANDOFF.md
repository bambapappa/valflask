# HANDOFF — drygast.nu (Fläskvågen + Frågevågen)

Fullständig karta över hela `valflask`-repot så att vilken ny Claude-session som
helst kan sätta sig in och ta vid. Status per **2026-07-23**, verifierad mot
koden (se §11 för testkörning).

Detta är det övergripande överlämningsdokumentet. Kompletterande läsning:
`SPEC.md` (fullständig metod + neutralitetskontrakt), `SPEC-FRAGEVAGEN.md`
(Frågevågen som delta mot SPEC), `DECISION_LOG.md` (varje beslut i tidsordning —
det längsta och viktigaste dokumentet), `CLAUDE.md` (bindande språkregler),
`ops/HANDOFF.md` (äldre, mer detaljerad driftlogg t.o.m. drift/deploy),
`ops/RUNBOOK.md` (drift/katastrof), `ops/AGARSTEG.md` (kontosteg),
`ops/FRAGEVAGEN-LANSERING.md` (lanseringsstegen för Frågevågen).

---

## 0. Bindande regler innan du rör något

- **Läs `CLAUDE.md` först.** Ordet "verbatim" är förbjudet i ny text — skriv
  "ordagrant", "ord för ord" eller "exakt citat". Befintliga kodnamn som
  `normalizeForVerbatim` får stå kvar. Skriv "mänskligt beslut", inte
  "ägarbeslut". Enkelt språk i allt som möter läsare/partier/journalister.
  Interna koder (grindnamn G1–G5, R-regler, T-tester) får förklaras här i det
  interna dokumentet men aldrig synas i sajtens texter.
- **Fyra kärnprinciper (får aldrig lossas):** (1) Tomma celler är ärliga — hitta
  aldrig på svar. (2) Citatgrindarna lossas aldrig — leta bättre citat i stället
  för att sänka kravet. (3) Tyst rättelse är förbjuden — fel rättas synligt
  (rättelsenot + post i `data/rattelser.json`). (4) Krönikor är ögonblicksbilder
  — rättas de räknas beloppen om från datat som gällde när de skrevs, inte
  dagens siffror. (5) Arkivlänkar måste bära citatet ordagrant i själva
  ögonblicksbilden.

---

## 1. Vad projektet är

**drygast.nu** är ett neutralt, källspårat register inför riksdagsvalet
**13 september 2026**. Det består av två delar som delar infrastruktur:

- **Fläskvågen** — väger vad partiernas **vallöften kostar**. Varje löfte fångas
  med ordagrant citat, prissätts (spann med osäkerhet), summeras per parti och
  koalition, och översätts till vardagliga jämförelser. Devis: *"Allvar i
  siffrorna, torr humor i glasyren."*
- **Frågevågen** — register över vad partierna **säger** i valets stora
  sakfrågor. Varje besked är ett ordagrant citat med källa, arkivlänk och datum.
  Append-only: byter ett parti fot syns gamla och nya beskedet sida vid sida.
  Väger ingenting — registrerar besked, värderar dem aldrig. "Inget tydligt
  besked" är ett förstklassigt, likabehandlat värde.

**Opartiskhet är kontraktet:** identisk insamling, metod och ton för alla åtta
riksdagspartier (s, m, sd, c, v, kd, l, mp). Inga röstrekommendationer, ingen
värdering av sakpolitiken. **Ingen reklam, inga intäkter, ingen finansiär** (den
gamla intäktsplanen skrotades 2026-07-01). Byggd och underhållen av en
privatperson på fritiden, med hjälp av AI.

**Publik status:** Sajten är **LIVE och härdad** på
[drygast.nu](https://drygast.nu). Data-licens CC BY 4.0. Presskontakt
hej@drygast.nu.

**Viktig produktpivot (mänskligt beslut 2026-07-21, DECISION_LOG):**
kostnadsestimat är numera ett **tillval bakom en godkännandegrind** — läsaren
måste aktivt kvittera att beloppen är uppskattningar, inte facit, innan en krona
visas. Grundläget på hela sajten är **antal** (hur många löften, hur många i
linje/emot, hur många tomma celler). Beloppen tänds först efter kvitteringen och
`≈` betyder datorgissning. (Byggdelen på sajten kan vara delvis kvar att göra —
kontrollera mot `site/` och senaste DECISION_LOG innan du rör startsidan.)

---

## 2. Repo-karta

```
CLAUDE.md              Bindande språk- och kärnprinciper (läs först)
SPEC.md                Fullständig metod, neutralitet, säkerhet, milstolpar M0–M7
SPEC-FRAGEVAGEN.md     Frågevågen som delta mot SPEC (V0–V4, T11–T16)
DECISION_LOG.md        Varje beslut med motiv, i tidsordning (störst — sök här)
README.md              Publik projektbeskrivning
HANDOFF.md             (detta) övergripande karta
ops/                   HANDOFF (äldre driftlogg), RUNBOOK, AGARSTEG,
                       FRAGEVAGEN-LANSERING, drill.sh, rollback-data.sh, dns-backup
pipeline/              Skörd → extraktion → grindar → verifiering → kostnad → publicering
site/                  Astro-sajt (statisk SSG)
data/                  Git är databasen — alla kanoniska JSON-filer
.github/workflows/     11 workflows (CI, schemalagd pipeline, review, drift)
```

### 2.1 `pipeline/` (TypeScript, körs med `tsx`)

Flödet i `pipeline/src/` (entrypoint `cli-run.ts` → `index.ts:runPipeline`):

- `fetch.ts` — `LiveSource`, hämtar alla feeds (RSS, riksdagens öppna data,
  page-källor/PDF). Kapning på nya artiklar sker i `runPipeline`.
- `extract.ts` — steg A1: LLM föreslår löfteskandidater, staket-rensning +
  normalisering. `extractJsonPayload` plockar ut JSON ur LLM-svar.
- `gates.ts` — **G1–G5, ren kod utan LLM, deterministisk** (det viktigaste
  säkerhetslagret). Se §3.
- `verify.ts` — steg A2: oberoende verifiering med annan modellfamilj.
- `cost.ts` — steg A5: kostnadssättning (härlett belopp eller LLM-estimat), plus
  grannkontroll och avvikelseflagg. Se §3 och §6.
- `copy.ts` — steg A3/A4: quip/glasyr och veckokrönika.
- `chronicle.ts` — veckokrönikor ("Veckans fläsk"), ögonblicksbilder.
- `similarity.ts` — dubbletthantering + grannkontroll (`findComparableCosts`).
- `publish.ts` — skriver kanoniska data, `computeDataHash` (se §3).
- `review.ts` — CLI för granskningskön (`pnpm review …`). Se §5.
- `llm.ts` — `OpenRouterClient`: timeout, retry, backoff, throttle, primär →
  fallback, modell per endpoint (se §4).
- `archive.ts` / `archive-verify.ts` — Wayback-arkivering; `snapshotBacksQuote`
  kräver att citatet står ordagrant i själva snapshotten innan arkivlänk sätts.
- **Frågevågen/stances:** `stances.ts`, `stance-pipeline.ts`, `stance-backfill.ts`
  (steg A6/A7 med prompts, isolerat från löftesflödet).
- `import-vallen.ts` / `cli-import-vallen.ts` — importer som kör poster ur det
  privata granskningsarkivet `vallen-2026` genom hela grindkedjan.

`pipeline/prompts/` — A1-extract, A2-verify, A3-quip, A4-weekly, A5-cost,
A6-stance-extract, A7-stance-verify.
`pipeline/scripts/` — engångs-/underhållsscript (backfills, rot-check,
review-issue-synk m.m.). `pipeline/schemas/` — JSON-scheman (ajv 2020-12) som
validerar all data. `pipeline/tests/` — testsviten (node:test, se §11).

### 2.2 `site/` (Astro 6, statisk SSG)

- `site/src/lib/aggregates.ts` — **jämförelse-/summeringsmotorn**. R3-dedup på
  `group_id`, per_ar ×4 i mandattotalen, triangelvarians-intervall för totalen
  (ρ=0,3), koalitionsaggregat, kategorifördelning, den "torra raden" (neutral
  djur-liknelse). Se §3 och §8.
- `site/src/lib/` — `data.ts` (typer + inläsning), `calc.ts` (`≈`-formatering),
  `stances.ts`, `canonical.ts`, `source-link.ts`, `mask.ts`, `seo.ts`.
- `site/src/pages/` — startsida (`index.astro`), `jamfor`, `regeringar`,
  `parti/`, `lofte/`, `fraga/`, `fragor`, `ledamot/`, `veckans-flask/`,
  `svangningar` (ståndpunktsändringar), `topplistor`, `metod`, `om`, `press`,
  `rattelser`, `sok`, `api/`, RSS/sitemap/llms-txt.
- Bygg: `pnpm build` = kombinator-script → `astro build` → Pagefind-index →
  OG-bilder (satori + resvg, kräver Python-`fonttools` för fontuppackning i CI).
  Deploy: GitHub Pages bakom Cloudflare-proxy (se §4/deploy).

### 2.3 `data/` — Git är databasen

| Fil | Vad det är |
|---|---|
| `promises.json` | Alla vallöften (Fläskvågen). Kanonisk. **428 löften** nu. |
| `stances.json` | Frågevågens ståndpunkter (parti × delfråga). **176 poster**. |
| `issues.json` | Frågevågens frågor/delfrågor + urvalskällor + rättvisetest. **10 frågor**. |
| `chronicles.json` | Veckokrönikor ("Veckans fläsk"), ögonblicksbilder. **4 poster**. |
| `changelog.json` | En post per körning: added/updated/retracted + `data_hash` + timestamp. Integritetskedjan. **233 poster**. |
| `rattelser.json` | Publik rättelselogg (append-only). Renderas på /rattelser. **9 poster**. |
| `needs_review.json` | Granskningskön (löften som inte passerade allt). **Tom just nu (`[]`)**. |
| `stances_review.json` | Frågevågens granskningskö. |
| `parties.json` | De åtta partierna: namn, färg, mandat 2022, röster 2022, block. |
| `people.json` | Personer (företrädare) som citeras. |
| `constants.json` | Källsatta konstanter för jämförelser + `reformutrymme` (80 000 msek/år, BP2026). |
| `constellations.json` | Koalitioner/regeringsalternativ. |
| `sources.yaml` | Källallowlist (exakta domäner) + feed-typer + `max_articles_per_run`. |
| `seen.json` | Sedda artiklar (dedup-nyckel). **177 URL:er**. |

---

## 3. Datamodell och grindar

### 3.1 Löftets fält (`promises.schema.json`)

Obligatoriskt: `id` (`p-2026-NNNN`), `title`, `slug`, `parties` (1–8 av de åtta
koderna), `person` (eller null), `quote` (10–600 tecken), `date_stated`,
`source` (url/domain/archive_url/fetched_at, ev. `kind` webb|tal), `category`
(välfärd, skatter, försvar, klimat-miljö, rättsväsende, utbildning,
infrastruktur, migration, övrigt), `cost`, `financing_claimed`, `comparisons`,
`quip`, `status` (aktiv|uppdaterad|tillbakadragen|infriad), `history`,
`extraction`. Valfritt `group_id` (`g-…`) — se R3.

### 3.2 Kostnadsobjektet (`cost`)

`type` (utgift|intäktsminskning|besparing), `period` (**per_ar|engang** — per_ar
räknas ×4 i mandattotalen!), `msek_low`/`msek_base`/`msek_high`, `basis`
(rut|myndighet|parti|media|llm_estimat), `basis_url`, `method_note`,
`confidence`, och nya valfria **`calculation`** (max 800 tecken): den stegvisa
uträkningen bakom beloppet. Visas publikt på löftessidan ("Så räknades beloppet
ut") och i `pnpm review list`. Sätts bara för LLM-estimat; deterministiska belopp
(basis "parti") saknar uträkning.

Kostnadslogik (`cost.ts`): har källtexten ett belopp ≥ 50 msek (och inte ett
per-enhetspris, `looksLikeUnitAmount`) → deterministiskt spann, basis "parti",
confidence 0,7, kan publiceras. Annars **LLM-estimat** (basis "llm_estimat",
märks `≈`), confidence kapas < 0,7, går **alltid** till review. Fallerar
LLM-anropet returneras base **0** med tydlig note (inte ett trovärdigt
schablonbelopp — det maskerade sig förr som riktigt estimat). Engångssignal i
löftet (`looksLikeOneOff`: gåva/inlösen/återköp/"under mandatperioden") tvingar
`period` till `engang` så beloppet inte fyrdubblas.

### 3.3 Grindarna G1–G5 (`gates.ts`) — hårda spärren

Ren, deterministisk kod (klocka och allowlist injiceras). Underkänd kandidat går
**alltid till review**, aldrig "avslag för alltid".

- **G1** — schemavalidering (ajv 2020-12) mot `extraction.schema.json`.
- **G2** (artikelnivå) — källdomän: https krävs, ingen explicit port, exakt
  domänmatch mot `sources.yaml` efter strip av ett ledande "www."; IDN-homografer
  faller automatiskt. Otillåten källa fäller hela artikeln.
- **G3** — **citatgrinden (ordagrann):** `normalizeForVerbatim` (NFC + bort med
  osynliga/bidi-tecken + unifierade citattecken/streck/ellipsis +
  whitespace-kollaps) tillämpas **identiskt** på citat och källtext. Citatet
  måste återfinnas ordagrant. **Skiftlägeskänsligt.** Golv 5 ord, tak 40 ord.
  Kan aldrig släppa igenom påhittad text — bara neutralisera typografi.
- **G4** — belopp (R5-tak) + datumfönster ±548 dygn (≈18 mån) mot artikelns
  publiceringsdatum.
- **G5** (artikelnivå) — max 5 kandidater per artikel (spam-/bombskydd), annars
  hela artikeln till review.

### 3.4 R-reglerna

- **R2:** spannet tvingas `low ≤ base ≤ high` med `high ≥ 1,5 × low`.
- **R3 (viktigast):** **samma politik hos olika partier grupplänkas
  (`group_id`) och räknas EN gång** i totaler och koalitioner — man kan inte höja
  försvaret till 5 % av BNP mer än en gång oavsett hur många partier som lovar
  det. Gruppen representeras av medlemmen med HÖGST belopp för mandatperioden
  (lika belopp bryts på id); spannet mellan
  partiernas prislappar visas i koalitionsvyns gruppnoter. **Partijämförelser
  påverkas inte** av tvärparti-grupper (varje parti behåller sin egen medlem med
  fullt belopp) — men interna dubbletter inom ett parti kollapsar även där.
  Implementerat i `aggregates.ts:dedupeByGroup`. Människan länkar i review via
  `--group`; `similarity.ts:findCrossPartyDuplicate` föreslår kandidater.
- **R5:** enskilt löfte > 1 500 mdkr (`R5_CAP_MSEK = 1 500 000` msek) publiceras
  aldrig automatiskt. Återtillämpas på `cost`-stegets `msek_base` i publish
  (`passesAmountCapR5`, försvar i djupet).

### 3.5 `data_hash`-kedjan

`publish.ts:computeDataHash(promises)` → kanonisk sträng via `canonicalStringify`
(sorterade nycklar, deterministisk) → **sha256** hex. Läggs i varje
`changelog`-post. Sajtens `/api/v1/summary.json` bär senaste `data_hash`.
Månadsdrillen (`ops/drill.sh`) jämför byggd `integrity.json` mot changeloggens
sista `data_hash` — git-historiken blir en omanipulerbar revisionslogg.

---

## 4. Så kör man

### 4.1 pnpm-scripts

**`pipeline/` (`cd pipeline`):**
- `pnpm pipeline:run` — hela skörd→publicera-flödet (kräver LLM-nycklar/modeller).
- `pnpm pipeline:dry-run` — utan att skriva.
- `pnpm review …` — granskningskön (§5).
- `pnpm test` — testsviten (node:test).
- `pnpm typecheck` — `tsc --noEmit` (inkl. `scripts/` och `facit/` sedan
  2026-07-17).
- `pnpm check-t7` — integritetskontroll (archive_url-täckning, ingen fulltext i
  data, seen/review-räkning).
- `pnpm calc:backfill` — bakåtfyllnad av `cost.calculation` (§6).
- `pnpm archive:backfill` — fyll saknade `archive_url` (Wayback).
- `pnpm import:vallen <sökväg>` — seed-import ur `vallen-2026`.
- `pnpm revalidate` — omvalidera citat mot källor.
- `pnpm stances:skeleton | stances:review | stances:rot-check | stances:backfill`
  — Frågevågens verktyg.

**`site/` (`cd site`):** `pnpm build` (kombinator → astro → pagefind → OG),
`pnpm test` (T1/T3/T9 + stale/interval/drylinje/T14/data-clean), `pnpm dev`,
`pnpm preview`, `pnpm indexnow`.

### 4.2 Lokalt köra tester i denna sandlåda

`pnpm install` klagar på ignorerad esbuild-byggscript och `pnpm test/typecheck`
kortsluts av pnpm:s pre-run deps-check. Kringgå genom att köra direkt:
```
cd pipeline && pnpm install --frozen-lockfile   # (ignorerad esbuild-varning ofarlig)
node --import tsx/esm --test "tests/**/*.test.ts"     # testsviten
node ./node_modules/typescript/bin/tsc --noEmit       # typecheck
node --import tsx/esm scripts/check-t7.mts            # T7
```
tsx bär sin egen bundling, så esbuild-postinstall behövs inte för dessa. I CI
körs allt via `pnpm install --frozen-lockfile` som vanligt.

### 4.3 CI-workflows (`.github/workflows/`)

- **`pipeline.yml`** — schemalagd skarp körning 3×/dygn (cron `10 3,9,15 * * *`
  UTC) + manuell. Kör tester + T7, sedan `pipeline:run`, arkiv-backfill,
  committar data med **färsk bot-token** (app-token lever 1 h, minnas efter
  LLM-steget), rebase+retry mot main, synkar review-kö till issues. Frågevågen
  PÅ som default (`STANCES_ENABLED`, `STANCES_MODE` osatt = review/torrkörning).
- **`build.yml`** — CI + deploy. Testar pipeline, bygger sajten, kör T1/T3,
  deployar **GitHub Pages** (kanonisk origin) vid push till main. Cloudflare
  Pages-Direct-Upload-steget är `continue-on-error` (övergivet, kan tas bort).
- **`calculation-backfill.yml`** — manuell uträknings-backfill (§6). Dry-run som
  default, rapport som artifact, committar direkt till main när `dry_run=false`.
- **`review.yml`** — granskningsbeslut via issue-kommentarer (`/godkänn`,
  `/godkänn <low> <base> <high>`, `/godkänn --group p-2026-XXXX`, `/avvisa
  <skäl>`). **Endast repo-ägarens kommentarer** på issues med etikett "review-kö"
  körs.
- **`review-apply.yml`** / **`review-sync.yml`** — etikettstyrda beslut / synk av
  kö till issues.
- **`stances-backfill.yml`**, **`rot-watch.yml`** — Frågevågen: engångs-backfill
  respektive veckovis källröta-bevakning (måndagar). Kör bara när
  `STANCES_ENABLED != 'false'`.
- **`drill.yml`** — månadsdrill (1:a varje månad), grön på ~23 s.
- **`release.yml`** — veckovis release-tagg (måndagar).
- **`mirror.yml`** — spegling efter lyckat build (Netlify-steget icke-blockerande,
  token utgången — kan släppas).

**Secrets:** `OPENROUTER_API_KEY` (primär LLM), `LLM_FALLBACK_BASE_URL` +
`LLM_FALLBACK_API_KEY` (OpenCode Zen/Go-reserv), `BOT_APP_ID` + `BOT_APP_KEY`
(GitHub App-bot som pushar data direkt, bypassar PR-krav).
**Variables:** `MODEL_EXTRACT`, `MODEL_VERIFY`, `MODEL_COPY` (modell per endpoint
— primären OpenRouter-slug, fallbacken översätts via map i klienten),
`PIPELINE_MODE`, `STANCES_ENABLED`, `STANCES_MODE`, `ALERT_EMAIL`. Modeller per
2026-06-24: extract `deepseek/deepseek-v4-pro`, verify
`moonshotai/kimi-k2.7-code`, copy `z-ai/glm-5.2` (verify hålls i annan
modellfamilj än extract för oberoende, SPEC §20).

### 4.4 Deploy / drift (per 2026-07-01, se ops/HANDOFF §12)

Kedjan: **GitHub Pages** (origin, `build.yml` bygger `site/dist`) bakom
**Cloudflare-proxy** (orange moln, SSL Full). Säkerhetsheaders sätts via en
Cloudflare **Transform Rule** (GitHub Pages struntar i `_headers`). **Rocket
Loader måste vara AV** (bryter strikt CSP). HSTS medvetet uppskjuten. Konto på
Martin.kronvall@outlook.com's Cloudflare. Verifiera: `curl -sI
https://drygast.nu/` och `curl -s https://drygast.nu/api/v1/summary.json`.

---

## 5. Review-/rättelseflödet

**Granskningskön** (`data/needs_review.json`) betas av lokalt i `pipeline/`:
- `pnpm review list` — visar poster med kostnad, ev. dubblett-flagg, och (nytt)
  uträkningen.
- `pnpm review approve <i>` — godkänn (bär kostnaden med). `approve <i> <low>
  <base> <high>` — sätt egen kostnad i msek. `approve <i> --group p-2026-XXXX` —
  länka dublett (delad `group_id`, R3, båda källor syns).
- `pnpm review reject <i> <orsak>`.
- `pnpm review add <fil.json>` — manuell inrapportering av löfte modellen missat
  (t.ex. TV/tal). Kräver https-källa + giltiga partikoder/kategori.

Samma beslut kan fattas via GitHub-issue-kommentarer (`review.yml`, endast
ägaren). `publish.ts` **slår ihop** nya review-poster med befintlig kö (dedup på
`articleUrl::title`) — kön töms bara av review-CLI:t (annars wipades den varje
tom körning, historisk bugg).

**Tyst rättelse är förbjuden.** Ett fel rättas synligt: (1) rättelsenot på den
berörda sidan, och (2) en post i `data/rattelser.json` (mall: `date`, `affects`,
`what`, `why` — inklusive vad som hindrar återfall). Krönikerättelser räknas om
från datat som gällde när krönikan skrevs (ögonblicksbild), aldrig dagens siffror.

---

## 6. Kvalitetsverktyg för kostnadsestimat (allt mergat i main)

- **Grannkontroll** (`pipeline/src/similarity.ts` → `findComparableCosts`): nya
  estimat ankras mot jämförbara publicerade löften (samma kategori,
  böjningstålig likhet). Injiceras i `A5-cost.md`-prompten av `estimateCost`
  (`pipeline/src/cost.ts`). (PR #430)
- **Avvikelseflagg** (`cost.ts` → `costDeviation`): markerar i review-raden när
  ett estimat avviker ≥ 3× från grannarnas median; ändrar aldrig belopp. (PR #433)
- **Öppen uträkning** (`cost.calculation`, valfritt schemafält): varje nytt
  estimat får en stegvis uträkning som visas publikt på löftessidan ("Så
  räknades beloppet ut") och i `pnpm review list`; tappas om granskaren skriver
  om beloppet. (PR #434)
- **Backfill** (`pipeline/scripts/calculation-backfill.mts`, `pnpm calc:backfill`):
  flaggor `--sample=N`/`--all`, `--dry-run`, `--seed`, `--factor`, `--stub`,
  `--rounds=N`, `--max-minutes=N`.
  Triage: nytt belopp nära det publicerade → fäst (rekonstruerad) uträkning,
  behåll belopp; avviker → till `data/calculation_review.json`. Körs via workflow
  `calculation-backfill.yml` (manuell start, dry-run default, rapport som
  artifact). (PR #436, #438)
- **Avgränsningsregler i A5-prompten** (`pipeline/prompts/A5-cost.md`, regel
  9–13): kodar de mönster som orsakade nästan alla rättelser i genomgången —
  förbud/regleringar prissätts efter sin direkta kostnad, utredningslöften
  prissätter utredningen, netto före brutto, utnyttjandegrad och beteende vägs
  in, och breda uppräkningar behandlas som inriktningslöften. Ett enhetstest
  vaktar att reglerna ligger kvar i systemprompten. (PR #452)
- **Uppräkningsflagga** (`similarity.ts` → `looksLikeUmbrella`,
  `findSamePartyInCategory`): känner igen breda sammanfattningslöften ("fler
  poliser, fler lösta brott och en fungerande rättskedja") som annars prissätts
  trots att delarna redan ligger på partiets egna löften. Titellikhet fångar dem
  INTE — likheten mellan en sammanfattning och dess egna delar är 0,00–0,13, så
  det är uppräkningsformen som känns igen. Flaggar ~10 % av löftena, sätter
  aldrig belopp, listar bara partiets egna löften i kategorin för granskaren.
  (PR #452)
- **Fjärde kostnadstypen `intäktsökning`**: systemet saknade en hink för löften
  som GER staten pengar (ny/höjd skatt). Räknas som besparing i aggregeringen
  men har egen, ärlig etikett. Blanda aldrig ihop med `intäktsminskning`.
- **Backfillen tappar inte arbete vid avbrott** (PR #454): checkpoint var 10:e
  löfte, SIGTERM/SIGINT-hantering, tidsbudget `--max-minutes` (default 240),
  `timeout-minutes: 330` på jobbet, uppladdning med `always()` och ett
  commit-jobb som accepterar avbrutet backfill-jobb. Bakgrund: körning
  30191490153 slog i GitHubs hårda 6-timmarstak och dödades — allt skrevs först
  efter loopen, så flera timmars LLM-arbete gick förlorat.

---

## 7. Läget just nu / pågående arbete

*Uppdaterad 2026-07-28.*

### Nästa uppgift: räkna om beloppen på säkrare grund

Genomgången av löften där beloppet inte stämde med den publicerade
uträkningen är **klar** — 63 rättade, resten kontrollerade och friade. Men
det arbetet flyttade beloppen till en *redovisad* grund, inte till en
säkrare. De flesta uträkningar är rekonstruerade i efterhand av
bakåtfyllnaden, vilket står utskrivet i varje sådan text.

**Ordningen för omräkningen (mänskligt beslut 2026-07-27):**

1. ~~**Tandvården först.**~~ **Klar 2026-07-27** — se avsnittet längre ned.
2. **Därefter övriga ämnen i fallande storleksordning**, alltså det
   ämnesområde som väger tyngst i mandattotalen först, och inom ämnet de
   största beloppen först. **Näst på tur: skatterna, de elva tyngsta
   (session 2).**

Ett löfte är fortfarande uttryckligen märkt för omräkning i sin egen
uträkning: p-2026-0390 (sanktioner mot bidrag, vilar på en antagen
procentsats utan erfarenhet bakom). Det ligger i session 10.

#### Sessionsplan: en rad är en session

Mätt på `data/promises.json`, uppdaterad efter session 5. En **räkneenhet**
är ett ensamt löfte eller en hel grupp — gruppen räknas en gång och företräds
av sitt högsta belopp. 421 aktiva löften blir 363 räkneenheter, varav 220 bär
ett belopp över noll. Pengarna är fortfarande snedfördelade, men mindre än
när planen skrevs: hälften av mandattotalen ligger nu i 13 enheter, 80 procent
i 39 och 95 procent i 88. Det var alltså de tyngsta enheterna som var mest
felräknade — vilket är precis vad ordningen i planen bygger på. Kolumnen
Enheter räknar vad som är kvar att göra i ämnet, inte ämnets hela storlek.

| # | Session | Enheter | Tankenivå |
|---|---|---|---|
| 1 | ~~**Tandvården**~~ **KLAR 2026-07-27.** 4 löften på 2 enheter blev 1 grupp; ämnet gick från 120 000 till 28 000 mkr. Se avsnittet nedan | klar | **max** |
| 2 | ~~**Skatter, de elva tyngsta**~~ **KLAR 2026-07-27.** 17 löften, ämnet gick från 2 817 till 1 381 mdkr. Se avsnittet nedan | klar | **max** |
| 3 | ~~Skatter, resten~~ **KLAR 2026-07-27.** 15 omräknade, 3 tillbakadragna; ämnet gick från 1 381 till 1 110 mdkr. Se avsnittet nedan | klar | hög |
| 4 | ~~**Försvar, hela ämnet**~~ **KLAR 2026-07-27.** 12 löften, ämnet gick från 1 437 till 460 mdkr. Se avsnittet nedan | klar | **max** |
| 5 | ~~**Välfärd, de tyngsta**~~ **KLAR 2026-07-28.** 17 löften på 12 enheter; ämnet gick från 540 till 360 mdkr. Se avsnittet nedan | klar | **max** |
| 6 | Välfärd, resten | 72 | hög |
| 7 | Utbildning, hela ämnet, tyngsta först | 60 | hög |
| 8 | Klimat-miljö, hela ämnet | 38 | hög |
| 9 | Övrigt (25) och infrastruktur (11) | 36 | hög |
| 10 | Rättsväsende (38) och migration (43, inklusive p-2026-0390) | 81 | hög |

Ämnesordningen är mandattotalen, efter session 5: skatter 1 115 mdkr (klart),
försvar 460 (klart), **välfärd 360** (tyngsta klara), **utbildning 359**,
klimat-miljö 268, övrigt 120, rättsväsende 71, infrastruktur 63, migration 47.
Skatterna, försvaret och välfärdens tyngsta är alltså genomgångna; härnäst
står välfärdens resterande löften (rad 6) och därefter utbildningen. Löften
som ger staten pengar ligger kvar i sitt eget ämne och räknas om i samma
session som resten av ämnet.

**Så väljs nivån.** Max när sessionens beslut lägger en grund som andra
löften vilar på, eller när en enskild enhet väger över hundra miljarder för
mandatperioden — där kostar ett fel mer än hela ämnen längre ned i listan.
Hög i övrigt: varje löfte är då litet och avgränsat, och arbetet är att
tillämpa ett regelverk som redan står skrivet. **Lägre än hög duger inte
för det här arbetet** — netto mot brutto, utnyttjandegrad, beteendeeffekter
och nollningsreglerna är precis där ett billigare tankepass gör
systematiska fel som ser rimliga ut i efterhand.

**När sessionen byts.** En rad i tabellen är en session. Den avslutas med
öppnad PR och uppdaterad HANDOFF, och då byts session. **PR:en öppnas utan
att fråga om lov** — stående mänskligt beslut 2026-07-28, se CLAUDE.md
"Att avsluta ett större spår". Sammanslagningen till `main` är däremot
fortfarande en människas beslut. Tar kontexten slut
före ämnet: avsluta där du står och skriv in i tabellen var nästa session
tar vid. **Bryt aldrig mitt i en grupp och aldrig mitt i en
harmonisering** — hela gruppen ska räknas om i samma session, annars vilar
medlemmarna på olika grund. Raderna 6, 7 och 10 är stora nog att troligen
behöva delas.

Genomströmningen är ännu en gissning: ungefär tio till femton enheter i en
max-session och fyrtio till sextio i en hög-session. **Skriv in det
verkliga utfallet** när sessionen är klar, så vilar planen på mätt
erfarenhet i stället för på ett antagande.

*Utfall session 5:* tolv enheter (sjutton löften), alltså i linje med
gissningen för en max-session. Fyndet låg inte i räknefelen utan i att ämnet
**behandlade samma sorts löfte olika beroende på parti**. Leta efter den
sneda behandlingen, inte bara efter fel belopp: sortera ämnets löften efter
form, inte efter belopp, och kontrollera att löften utan angiven nivå
prissätts lika oavsett vem som gav dem.

*Utfall session 3:* 45 enheter genomgångna, varav 18 löften ändrades — resten
kontrollerades och lämnades. En hög-session klarar alltså gott och väl de
40–60 enheter planen gissade, **så länge ämnets tunga enheter redan är
gjorda**: de små löftena tar tid bara när de visar sig vara dubbletter.

*Utfall session 4:* elva enheter (tolv löften). Hela ämnet vilade på en enda
föråldrad siffra — vad försvaret kostar i dag. **Kontrollera basåret innan du
rör beloppen:** går flera löften i samma ämne mot samma nuläge, räcker det att
det nuläget är fel för att hela ämnet ska bli fel.

*Utfall session 2:* elva enheter (sjutton löften) på en session, alltså i
linje med gissningen för en max-session. Tre av de fyra stora fynden hittades
inte i beloppet utan **i citatet**: vad partiet faktiskt lovar, och om det
redan är beslutat. Läs citatet före uträkningen.

*Utfall session 1:* två enheter (fyra löften) på en session, men den gick
nästan helt åt till att leta rätt på underlaget — och den sökningen betalade
sig: regeringens proposition prissatte reformen åt oss. **Leta efter en
myndighetssiffra innan du bygger en egen uträkning.** Ligger löftet nära en
proposition, en utredning eller en budgetpost finns beloppet ofta redan
räknat, och då blir sessionen både snabbare och säkrare. Enheter per session
säger därför mindre än hur väl ämnet är dokumenterat.

**Innan du lämnar en session:**

- varje ändrat löfte har en egen `history`-post,
- två-commit-mönstret följt och `data_hash` matchar `computeDataHash`,
- *en* samlad post i `data/rattelser.json` för sessionen, inte en per löfte,
- `pnpm test` och `tsc --noEmit` gröna i `pipeline/`,
- nollade du ett grupplänkat löfte — kontrollera gruppens representant,
- tabellraden ovan ifylld med utfall, och anspråket nedan struket.

**Att pröva i session 2:** C:s grundlönsreform ligger i två grupper.
`g-c-skattefri-grundlon` bär kostnaden (105 000 mkr per år, 420 mdkr för
perioden) medan `g-c-skattereform-grundlon` bär finansieringen (45 000 mkr
per år i ökade skatteintäkter när jobbskatteavdraget avskaffas) och dess
tre övriga medlemmar står på noll. Summorna håller isär utgifter och ökade
intäkter, så inget dubbelräknas i dag — men det är samma reform i två
grupper, och frågan om kostnaden ska visas brutto eller netto är inte
avgjord.

#### Pågår just nu

Skriv din rad här innan du börjar, stryk den när PR:en är öppnad.

- **Session 6 — välfärdens resterande enheter.** Gren
  `claude/session-5-valfarden-sbny1t` (samma grennamn, nytt spår efter att
  session 5 slagits ihop). Rör de 72 återstående räkneenheterna i välfärden,
  inklusive den öppna frågan om Centerpartiets och Miljöpartiets tillägg till
  ensamstående föräldrar. Ingen annan session bör röra välfärdslöften förrän
  raden är struken.

#### Välfärdens tyngsta är omräknade — session 5, klar 2026-07-28

Sjutton löften i tolv räkneenheter. Ämnet gick från 540 till 360 mdkr,
utbildningen från 419 till 359 (ett löfte låg i fel ämne, se nedan) och
rikssumman till **2 851 596 mkr**. Det stora fyndet var inte ett räknefel:

**Ämnet prissatte samma sorts löfte olika beroende på vilket parti som gav
det.** Ett löfte som pekar ut en riktning utan att ange någon nivå stod på
noll hos några partier — "Vi ska satsa på vårdpersonalen", "Pensionen ska
bli bättre", Sverigedemokraternas uppräkning av hela välfärden — och på
tiotals miljarder hos andra med exakt samma form. Det är inte bara ett
prisfel, det är en snedhet i behandlingen av partierna, och den var osynlig
så länge man läste ett löfte i taget. **Sortera ämnets löften efter form och
inte efter belopp, så syns det direkt.**

Ordningen som gäller nu, och som är tillämpad rakt igenom ämnet:

| Vad löftet säger | Hur det prissätts |
|---|---|
| Ingen åtgärd, ingen nivå ("satsa på välfärden") | noll |
| Åtgärd utpekad, ingen nivå ("höja barnbidraget") | vad samma åtgärd senast faktiskt kostade |
| Partiet anger nivån ("till 2 000 kronor") | partiets egen siffra |

**Mellanraden är den nya.** Den fanns i praktiken redan — men den byggde på
en gissad nivå, och gissningen var i flera fall lånad från ett annat partis
konkreta löfte utan att det stod utskrivet. Nu är ankaret den senaste
faktiska höjningen av samma förmån, vilket är samma sorts spårbar siffra
som ett partis egen.

**Barnbidraget bar hela mönstret.** Fyra partier lovar att höja det. Bara
Kristdemokraterna anger en nivå (1 250 → 2 000 kronor). Vänsterpartiets
"höja barnbidraget rejält" var prissatt till 18 000 mkr/år — nästan hela
Kristdemokraternas konkreta höjning, med den partiets nivå lånad rakt av.
Nu vilar alla fyra på Försäkringskassans utbetalningsstatistik (2,65 mdkr i
december 2025 ≈ **1,9 miljoner barn**), och de som inte anger någon nivå
prissätts som den senaste faktiska höjningen: **200 kronor i månaden, 2018**
— samma steg som Socialdemokraterna föreslog hösten 2025. V gick till 5 000,
KD till 17 000 (nära de 16,5 mdkr som angavs när löftet presenterades), och
MP **upp** från 4 000 till 6 000: uträkningen hade räknat multiplikationen
till hälften (2 miljoner × 200 kr × 12 mån angavs som 2,4 mdkr).

**Sökningen efter en partisiffra betalade sig igen — den gången genom att
bekräfta beloppet.** Slopat karensavdrag står kvar på 5 000 mkr/år, men det
är nu Socialdemokraternas egen siffra för vad förslaget kostar statskassan,
inte en efterhandsräkning på antal sjukfall. Det avgjorde också en fråga som
såg ut att gå åt andra hållet: enligt regeln om att en lagändring bärs av
arbetsgivarna borde beloppet ha skurits till statens egna anställda, men
partiet anger själv statens kostnad, och **partiets egen siffra går före vår
egen härledning**. Arbetsgivarnas 21–42 mdkr står nu utskrivna i uträkningen
som det de är: en följd för dem, inte en post i statens budget.

Samma sak för garantipensionen: V:s "historisk höjning" prissätts som den
senaste faktiska historiska höjningen, riksdagsbeslutet i juni 2022 (upp till
1 002 kr/mån), som enligt Pensionsmyndigheten kostade staten **10 467 mkr
2023**. 12 000 → 10 000, men på en siffra i stället för på ett antagande.

**Fem löften nollade**, alla breda uppräkningar: MP:s och V:s "kraftigt
stärkta resurser till vård, socialtjänst, psykiatri och skola" (fyra ämnen i
en mening, 60 000 mkr för perioden), Centerpartiets två vårdlöften och dess
löfte om förebyggande arbete.

**Ett löfte låg i fel ämne och dubblerade ett annat.** Centerpartiets
"korta köerna, stärka den nära vården, satsa på ungas psykiska hälsa och ge
skolan bättre förutsättningar" (p-2026-0316) står som *utbildning* men är
samma politik som partiets vårdlöfte i välfärden. Det räknades om här i
stället för att lämnas till session 7, eftersom det annars hade blivit noll i
ett ämne och 60 000 i ett annat för samma sak. Det bar dessutom **fjärde
sessionen i rad av samma fel**: beloppet stod på 15 000 mkr/år medan
uträkningen i samma fält summerade delarna till 6 500 och angav spannet
3 000–10 000. **Sökningen efter belopp utanför sin egen uträkning har nu
missat minst fyra. Bygg om den eller lita inte på den.**

**Ny grupp:** `g-aldreomsorg-satsning` (S + L). Båda lovar mer till
äldreomsorgen utan att ange nivå, och det kan bara göras en gång. Båda står
nu på 3 000 mkr/år, ankrat på att kommuner och regioner delade på närmare
nio miljarder i riktade äldreomsorgsbidrag 2023 och att det största enskilda
(Äldreomsorgslyftet) ligger på ~1,8 mdkr/år.

Dessutom: MP:s pensionslöfte säger "bostadstillägget **eller**
garantipensionen" men uträkningen prissatte båda och lade ihop dem, och den
höjda pensionsavgiften betalar den högre allmänna pensionen med sig själv —
den ligger utanför statsbudgeten och kostar den inget. SD:s a-kassa lovar
"steg tas mot" en reform, inte reformen, och prissätts nu på den avgift
kassorna faktiskt betalar in till staten (5,1 mdkr 2025).

**Kontrollerat och lämnat orört:** gruppen om fast läkarkontakt (S, C, L,
12 600 mkr). Den harmoniserades i en tidigare omgång, och den avvisade
efterhandsberäkningen på 1 125 mkr står utskriven i noten — ett fattat
beslut rivs inte upp utan nytt skäl. Tandvårdsgruppen är gjord i session 1.

**Kvar att avgöra:** Centerpartiets och Miljöpartiets tillägg till
ensamstående föräldrar är samma politik men varken grupplänkade eller
harmoniserade — MP:s ligger i ett paket med höjt barnbidrag, så en
grupplänkning skulle svälja även den delen. Ligger i session 6.

#### Skatteämnet är färdiggånget — session 3, klar 2026-07-27

Femton löften omräknade, tre tillbakadragna. Ämnet gick från 1 381 till 1 110
mdkr och rikssumman till **3 091 596 mkr**. Inga stora enskilda fynd som i
session 2 — det här var städning, men fyra mönster går igen och är värda att
leta efter i varje ämne:

**1. Samma parti lovar samma sak i flera formuleringar.** Liberalerna hade
*tre* löften om skattefritt sparande och ett fjärde om att hälften ska vara
kvar av löneökningen, som är samma sak som partiets löften om statlig
inkomstskatt. Fyra nya grupplänkningar gjordes, varav tre inom ett och samma
parti. **Sök på partinivå innan du prissätter — inte bara mellan partier.**

**2. Sammanfattande citat som räknar upp partiets egna löften.** MP:s citat om
"slopad karensdag och kortare arbetstid" nämner två åtgärder som partiet lovar
var för sig och som redan är prissatta. Nollat. Fyra andra nollades på samma
grund eller för att de är uppräkningar utan nivå.

**3. Belopp som ligger utanför sitt eget spann.** C:s löfte om billigare att
anställa långtidsarbetslösa stod på 5 000 mkr/år fast uträkningen i samma fält
angav 500–3 000. **Det är andra sessionen i rad som hittar ett sådant** — efter
beredskapsapoteken i försvaret. Sökningen som skulle fånga dem missade båda.

**4. Fel kostnadstyp.** MP:s gruvskatt låg som en *utgift* trots att den ger
staten pengar, alltså räknades den åt fel håll. En höjd brytpunkt låg också som
utgift i stället för sänkt skatt.

Dessutom: matmomsen satt på regeringens egen siffra (skattebortfallet för den
tillfälliga sänkningen är 37,2 mdkr för april 2026–december 2027, alltså ~21
mdkr/år; sänkningen gäller redan till och med 2027, så löftet om permanentning
kostar bara åren därefter), och införandet av euron ändrat från årlig kostnad
till engångskostnad.

**Tre citat i dåtid tillbakadragna** (M): "När matmomsen halverades…",
"Pensionsspararna har mer pengar på kontot…", "Vi har sänkt skatten på arbete
och pension…". Alla tre beskriver genomförd politik utan åtagande om
framtiden — samma grund som de två som drogs tillbaka tidigare. **Leta vidare
i övriga ämnen; extraktionen skiljer fortfarande inte på löfte och skryt.**

#### Försvaret är omräknat — session 4, klar 2026-07-27

Tolv löften i elva räkneenheter. Ämnet gick från 1 437 till 460 mdkr och
rikssumman till **3 362 596 mkr**. Ett enda faktafel bar det mesta:

**Uträkningarna trodde att försvarsanslagen ligger på omkring 120 miljarder
kronor per år, alltså två procent av BNP. De är 175 miljarder 2026** — 2,8
procent enligt Natos sätt att räkna — **och beslutade planer tar dem till 3,1
procent från 2028.** Skillnaden mot det som redan är beslutat är alltså
betydligt mindre än skillnaden mot den gamla siffran.

**Fem procent av BNP: 190 000 → 50 000 mkr/år.** Fem procent är 312 miljarder,
alltså 118 över den beslutade banan när målet är nått. Men Natos mål gäller
2035 och Sverige siktar på 2030 — sista året i mandatperioden. **Ett mål som
nås i slutet av perioden kostar inte slutnivån gånger fyra, utan genomsnittet
av upptrappningen.** Den regeln lär återkomma. M:s löfte om Natos mål till
2030 är grupplänkat med L:s och C:s: samma mål, samma upprustning, kan bara
genomföras en gång.

**Stödet till Ukraina har också en beslutad ram: 40 mdkr/år för 2026 och
2027.** C:s löfte om minst en procent av bruttonationalinkomsten (~65 mdkr)
kostar skillnaden: 25 000 mkr/år. M:s löfte om fortsatt starkt stöd nollat —
det anger ingen nivå över den som redan gäller.

**Gripenplanen: 20 000 mkr/år → 5 000 mkr som engångskostnad.** En gåva av
begagnade flygplan sker en gång, men beloppet räknades fyra gånger. Att
Ukraina *köper* Gripen E/F är dessutom en intäkt för Sverige, inte en utgift —
löftet hade ingen uträkning alls.

**Ett belopp rättat rakt av:** beredskapsapoteken stod på 600 mkr/år fast
uträkningen angav 300 (en miljon kronor per apotek gånger 300 apotek). Samma
sorts fel som genomgången av belopp mot uträkning letade efter — **den missade
alltså minst ett.**

Dessutom: S:s omfattande upprustning 60 000 → 25 000 (det gamla beloppet var
halva försvarsbudgeten, tolkat ur ordet *omfattande*), KD:s allmänna värnplikt
fick äntligen en uträkning som vilar på statens kostnad per värnpliktig
(217 000 kr för ett helt år), och beredskapspengen till kommuner
grupplänkades mellan C och MP.

#### Skatternas tyngsta är omräknade — session 2, klar 2026-07-27

Sjutton löften i elva räkneenheter. Ämnet gick från 2 817 till 1 381 mdkr och
rikssumman från 5 775 996 till **4 339 276 mkr**. Fyra fynd bar hela
förändringen:

**1. C:s skattereform låg i två grupper och räknades två gånger.** Den ena
prissatte kostnaden till 105 000 mkr/år, den andra bar partiets påstående om
45 000 mkr/år i *ökade* intäkter — vilket gav partiet ett avdrag på 180 000
mkr för perioden byggt på en påstådd sysselsättningseffekt. Grupperna är nu en
enda med sju medlemmar. Beloppet vilar på partiets egen siffra per person
(1 200 kr/mån), gånger vår uppskattning av antalet med arbetsinkomst, netto
efter avskaffat jobbskatteavdrag: 78 000 mkr/år. Påståendet om ökade intäkter
ligger nu i `financing_claimed` — **följdeffekter räknas inte för något
parti**, vilket metodsidan säger rakt ut.

**2. MP:s kortare arbetsvecka: 150 000 → 30 000 mkr/år.** Den gamla
uträkningen antog att staten kompenserar 20–100 procent av allas löneborfall.
Löftet säger inget om det: kortare normalarbetstid är en ändring i
arbetstidslagen. Statens egen kostnad är den för dess omkring 281 000
anställda (medellön 46 300 kr/mån enligt SCB) — 12,5 procent kortare vecka
kräver omkring 14 procent fler för samma verksamhet. Kostnaden för privata och
kommunala arbetsgivare, och effekten på ekonomin i stort, är följder och
hör inte hemma i statens nota. **Det här är sessionens mest omtvistliga beslut
— pröva det först om något ska prövas om.**

**3. M:s löfte om skattesänkningarna i budgeten för 2026 nollat**
(414 720 mkr). Riksdagen har redan beslutat budgeten, så den är gällande rätt
och ingen ny kostnad för 2027–2030. **Leta efter fler av samma sort** — det är
samma fel som de två citat i dåtid som drogs tillbaka tidigare.

**4. L:s två löften om statlig inkomstskatt: 40 000 → 4 500 mkr/år**, och
grupplänkade. Det gamla beloppet låg *över* vad partiet självt uppger att hela
halveringen kostar (30 mdkr/år), trots att löftet gäller ett första steg om en
eller två procentenheter.

Dessutom: M:s och KD:s löften om sänkt skatt på arbete grupplänkade och satta
på det senast tagna stegets pris (det tionde jobbskatteavdraget, 17,36
mdkr/år). Elskatten, bolagsskatten och anställningsskatten har oförändrade
eller nära oförändrade belopp men utbytta underlag.

**Kvar att avgöra:** C:s löfte om anställningsskatt för unga (p-2026-0345)
ligger utanför partiets grupp om anställningskostnader i småföretag. De är
olika avgränsningar av samma idé, och om de ska räknas en gång är inte prövat.

#### Tandvården är omräknad — session 1, klar 2026-07-27

De fyra löftena vilade på tre oförenliga bilder av vuxentandvårdens storlek
(14,7, 25 respektive 45 mdkr per år). Rätt storlek: **24,7 miljarder kronor
2024** för vuxentandvården inom det statliga tandvårdsstödet, enligt
Tandvårds- och läkemedelsförmånsverket. Statens egna tandvårdsutgifter var
7,62 mdkr 2024, och anslaget för 2026 är 12,8 mdkr.

**Viktigast: gissningen behövdes aldrig.** Regeringens proposition om ett
förstärkt högkostnadsskydd för tandvård prissätter exakt det partierna lovar.

| Vad propositionen räknar med | Per år |
|---|---|
| Etappen som gäller dem som fyllt 67 sedan januari 2026 | drygt 3,8 mdkr |
| Fullt utbyggd reform, alla från 20 år | 7,7–9,9 mdkr, huvudscenario 8,4 |
| **Kvar att lova bort: utvidgningen till alla vuxna** | **≈ 4,6 mdkr** |

Löftena är utvidgningen — inte hela reformen. **Den metoden går igen: dra
bort det som redan är beslutad lag innan du prissätter ett löfte.**

| Löfte | Parti | Före | Efter | Grund |
|---|---|---|---|---|
| p-2026-0552 | SD | 10 000 | 4 600 | myndighet |
| p-2026-0484 | SD | 10 000 | 4 600 | myndighet |
| p-2026-0489 | V | 10 000 | 4 600 | egen uppskattning |
| p-2026-0440 | MP | 20 000 | 7 000 | egen uppskattning |

**MP:s löfte ligger nu i gruppen** (mänskligt beslut 2026-07-27) — det
tidigare beslutet att hålla det utanför är alltså omprövat och rivet. Alla
tre partierna lovar i praktiken nästan avgiftsfri vuxentandvård, och
propositionen visar att mekanismerna ligger närmare varandra än etiketterna:
omkring 75 procent av patienterna i första etappen hamnar ändå på 1 400
kronor eller mindre per år, alltså under V:s föreslagna tak på 1 450.
Gruppen räknas en gång och företräds av MP:s belopp, som är högst eftersom
sjukvårdens principer går längre än tio procents patientavgift — den lämnar
patienten kvar på omkring 26 procent av sin räkning, eftersom undersökningar
och förebyggande vård står utanför.

Steget från tio procents patientavgift till sjukvårdens principer, omkring
2 mdkr, är **vår egen uppskattning** och står utskriven som sådan i MP:s
uträkning. Allt annat är propositionens egna siffror.

De fyra löftena väger nu **28 000 i stället för 120 000 mkr** för
mandatperioden. Rikssumman gick från 5 867 996 till **5 775 996 mkr**.

**Kvar att avgöra:** SD:s två löften är samma löfte i två citat, och regeln
säger att ett parti som upprepar sig är en dubblett som dras tillbaka.
Gruppen kollapsar dem redan i summan, så det påverkar inga belopp — bara hur
de visas. Lämnade orörda med flit: ett tidigare mänskligt beslut lade dem i
gruppen i stället för att dra tillbaka det ena.

#### Två harmoniseringar är gjorda och behöver inte tas om

- **Mindre klasser** (`g-mindre-klasser`): alla tre löftena vilar nu på
  samma uträkning, hämtad från det enda löftet som anger en nivå
  (Liberalernas maxtak om tjugo elever). S:s löfte prissätts på ett lånat
  antagande, och uträkningen skriver ut att antagandet är vårt och inte
  partiets. L:s vagare löfte är nollat eftersom partiets eget konkreta löfte
  bär kostnaden.
- **Regeln som följde av det:** ett löfte utan angiven nivå nollas när
  partiets EGET konkreta löfte bär kostnaden. Finns inget sådant löfte bär
  riktningslöftet kostnaden själv, prissatt på samma grund som ett annat
  partis motsvarande löfte — annars blir partiets politik oprissatt överallt.

#### Sökningen efter avvikelser duger inte som facit

Den har **både falsklarm och falska negativ**. Den läser fragment: "Bas
2 500 kr per förlossning" tolkas som basbeloppet 2 500 fast det är ett
styckpris, och "bas 1,5 miljarder" blir talet 1. Den missar samtidigt
uträkningar som anger sitt resultat utan ordet bas — ett löfte om mindre
klasser bar samma fel men fastnade aldrig i nätet, eftersom texten skrev
"≈ 12 miljarder kronor per år". Kön är genomgången manuellt, men sökningen
garanterar inte att den är tom.

### Gjort 2026-07-27 (kön betad från 58 till 0, 63 belopp rättade, tre systemfynd)

**Kön är tom.** `data/calculation_review.json` är `[]`. Rör den inte utan att
först läsa "Kör INTE fler backfill-körningar" nedan.

**Alla aktiva löften med datorgissat belopp har en öppen uträkning.** De elva
som saknade en var de en människa prövat och satt belopp på — se
review-fixen nedan.

**Tre fynd som gick längre än kön:**

1. **Grupprepresentanten valdes på lägst id.** När ett brett riktningslöfte
   nollades och råkade ha lägst id i sin grupp föll gruppens verkliga belopp
   ur summan: tre nollningar dolde 283 200 mkr innan felet upptäcktes.
   Representanten väljs nu på högsta belopp för mandatperioden, i tre
   kopior som måste räkna lika (`site/src/lib/aggregates.ts`,
   `pipeline/src/chronicle.ts`, `site/scripts/test-t3.mts`). Tre tester
   vaktar det. **Lärdom: nollar du ett grupplänkat löfte — kontrollera
   gruppen.**
2. **Granskarens belopp tappade uträkningen.** `review.ts` byggde om hela
   `cost`-objektet och `calculation` fanns inte i listan. Nu kan uträkningen
   anges i samma beslut: `--calc "…"` på kommandoraden, eller en rad som
   börjar `Uträkning:` i en issue-kommentar. Märkningen är medvetet
   uttrycklig — ett första utkast tolkade all text under kommandoraden som
   uträkning, och då hade ett "tack, ser bra ut" hamnat på löftessidan.
3. **Ny kärnprincip: partiets egen siffra gäller.** Se `DECISION_LOG.md`
   2026-07-27. Kodad i `CLAUDE.md`, som regel 14 i `pipeline/prompts/A5-cost.md`
   och vaktad av ett enhetstest. Bakgrund: V:s bebispeng låg på 0 trots att
   partiledaren angav 15 000 kronor per förstagångsförälder i samma mening.

**Beslut i kön:** tolv breda löften nollade, 32 belopp nedjusterade, elva
löften bytte period från per år till engångskostnad (deras uträkningar
beskrev redan en engångsinsats medan beloppet räknades fyra gånger), fem
belopp höjda eller prissatta för första gången, två löften tillbakadragna.

**Två citat i DÅTID drogs tillbaka** — p-2026-0099 ("vi har gett polisen
verktyg") och p-2026-0061 ("har en jobbpremie införts"). De beskriver
genomförd politik och innehåller inget åtagande om framtiden. **Leta efter
fler: extraktionen skiljer inte på löfte och skryt.**

**Två beslut lämnades med flit orörda** trots maskinförslag: p-2026-0039
(straffskärpningar) och p-2026-0470 (marknadsskolan). Båda prövades av en
människa tidigare, och ett maskinförslag får inte tyst riva upp ett fattat
beslut.

**Fyra grupplänkningar gjorda:** SD/M fler poliser, M:s två bidragstakscitat,
C:s tre löften om anställningskostnader (38 000 -> 15 000 mkr/år) och SD/V
högkostnadsskydd i tandvården. MP:s tandvårdslöfte lämnades UTANFÖR gruppen
med flit: att finansiera tandvården som annan sjukvård är en större reform än
ett kostnadstak. *(Det sista är omprövat senare samma dag i session 1 — MP
ligger nu i gruppen. Se "Tandvården är omräknad" ovan.)*

**Publika uträkningar städade:** inga råa löftesnummer kvar (40 omskrivna),
inga hänvisningar till interna prissättningsregler (6), fackuttryck utskrivna
i 196 texter. Två fel rättade på vägen: ett basantagande angivet i miljarder
i stället för miljoner, och en räkning som blandade tre enhetsförkortningar.

**Totalen** gick från 7 016 120 till **5 867 996 mkr** under omgången, och
vidare till **5 775 996 mkr** när tandvården räknades om i session 1.

### Öppna frågor som ingen avgjort

- Fler löften som beskriver genomförd politik i dåtid (se ovan).
- Fler par där samma politik ligger på två löften utan grupplänk. C:s
  trippel hittades bara för att en beloppsavvikelse pekade dit.

### Kör INTE fler backfill-körningar

Detta är dyrköpt och lätt att göra fel: av de **114 löften som saknar
`cost.calculation` är 111 avvikare** — de *har* körts, och fick medvetet ingen
uträkning eftersom deras belopp inte ska ändras automatiskt. En fjärde körning
räknar bara om samma 111 till samma slutsats och kostar fyra timmar. Avkastningen
föll från 76 → 67 → **10** nya uträkningar per körning av precis det skälet. Bara
3 löften är kvar av andra skäl (ej hunna/API-fel); de tas av nästa ordinarie
körning.

**Fallgrop:** `data/calculation_review.json` är **inte kumulativ** — den skrivs
om vid varje körning med just den körningens avvikelser. Att kön "minskade" från
122 till 111 betyder alltså inte att poster försvunnit, utan att färre löften
hanterades i sista körningen. Ett avvikande löfte kommer tillbaka i kön varje
gång det körs, eftersom det aldrig får någon `calculation`.

**Resultat av backfillen:** 92 → **245 av 359** llm-estimat har nu en öppen,
rekonstruerad uträkning. Kontrollera nuläget med:
```
node -e "const a=require('./data/promises.json');const l=a.filter(p=>p.status!=='tillbakadragen'&&p.cost.basis==='llm_estimat');console.log('med:',l.filter(p=>p.cost.calculation).length,'utan:',l.filter(p=>!p.cost.calculation).length)"
```

**Gjort i omgången 2026-07-24…27 (allt mergat i main):**

- **Backfillen genomförd** i tre körningar (30203965114, 30214357813,
  30222848368): 92 → 245 löften med öppen uträkning, 111 avvikare till
  granskning. Vägen dit kostade tre misslyckanden som nu är åtgärdade — se
  §6 och punkten "Kör INTE fler backfill-körningar" ovan.

- **44 flaggade avvikelser avgjorda en och en** (PR #447): 15 belopp justerade,
  12 nollade, 3 bekräftade med tillagd uträkning, 11 avfärdade som falsklarm.
  Den kön tömdes helt — de 111 poster som ligger där nu är NYA, från
  backfill-körningarna efteråt.
- **Strukturella fynd:** Centerns skattereform (p-0144/0172/0252/0254) beskrev
  samma reform på fyra sätt och prissattes var för sig → nu en grupp som räknas
  en gång på partiets egen nettosiffra. Två S-dubbletter tillbakadragna
  (p-0481, p-0488) — ordagrant identiska citat och samma käll-URL som
  originalen; tog bort ~33 000 mkr felaktig dubbelräkning.
- **Fjärde kostnadstypen `intäktsökning`** införd, åtta feltypade löften rättade.
- **Förebyggande** (PR #452): fem avgränsningsregler i A5-prompten och flaggan
  för breda uppräkningslöften — se §6.
- **Krönikorna** (PR #447): varje krönikesida visar en "Då och nu"-ruta med
  veckans total och gap bredvid dagens. Krönikor skrivs aldrig om; rutan
  förklarar tidsdriften automatiskt även för framtida krönikor. Vecka 29 fick en
  rättelsenot (dess text nämner de två tillbakadragna dubbletterna).
- **Sajtspråk:** interna koder bort ur läsartexten ("R3-dedup" ur två
  sidbeskrivningar och kombinatorn; rå gruppkod skrivs nu läsbart).
- **Backfillens robusthet** (PR #453, #454): skip-orsaker ytas, omtagsvarv, och
  arbete går inte längre förlorat vid avbrott — se §6.
- **T3-testet fixat:** räknade fram förväntad fläsk-total utan att filtrera bort
  tillbakadragna löften, till skillnad från `aggregates.totalFlasket`.

Tidigare omgång (2026-07-22…23): p-2026-0470 rättat till 0 kr; Grupp 1–2 (12
förbuds-/vinstlöften) nollställda; Grupp 3 (5 straffskärpningar) och Grupp 4 (4
krav/regleringar) översedda; review-kön tömd; karensgruppen städad.
`data/rattelser.json` har nu **15 poster**.

**Frågevågen:** grunden byggd och isolerad från löftesflödet. 10 frågor, 176
ståndpunktsceller (8 partier × delfrågor), just nu mest "inget tydligt besked" i
väntan på backfill/körning. Lanseringsstegen i `ops/FRAGEVAGEN-LANSERING.md`;
STANCES_MODE osatt = review/torrkörning tills steg 4.

---

## 8. Att tänka på / fallgropar

- **msek och period:** allt räknas i **msek** (miljoner kr). `period: per_ar`
  multipliceras **×4** i mandattotalen (`promiseTotalMsek` i `aggregates.ts` och
  i pipelinens chronicle). En engångssignal som feltolkas som per_ar fyrdubblar
  beloppet — därför tvingar `looksLikeOneOff` period till `engang`.
- **Grupplänkning (R3):** summor och koalitioner dedupar på `group_id`, men
  partijämförelsen gör det EFTER partifiltret (tvärparti-grupper behåller
  partiets egen medlem, interna dubbletter kollapsar). Ändra aldrig en summering
  utan att tänka på var dedupen sker.
- **Startsida och krönika måste räkna lika:** krönikans `totalFlasket` speglar
  sajtens `aggregates` (dedup + aktiv-filter + gap = total − reformbudget). Ett
  test (`chronicle.test.ts`) vaktar sambandet. Historisk bugg: gap sattes = total.
- **Krönikor är ögonblicksbilder:** rätta med genereringsveckans tal, inte
  dagens. Skillnad mot dagens startsida är hederlig tidsdrift (t.ex. att
  tvärparti-grupperingen infördes efteråt), inte inkonsekvens. Sedan 2026-07-25
  förklarar krönikesidans "Då och nu"-ruta driften automatiskt — lägg alltså
  INTE en rättelsenot bara för att siffrorna glidit isär. En not behövs bara när
  krönikans egen TEXT pekar på något som ändrats (t.ex. ett tillbakadraget
  löfte), annars är det översignalering.
- **Backfillen committar direkt till main** (bot bypassar PR-krav) — den kan
  landa mitt i annat arbete. Rebasa alltid mot färsk `origin/main`.
- **Språkreglerna** gäller commits, PR-texter, issues och all prosa: aldrig
  "verbatim", aldrig "ägarbeslut", enkelt språk (§0). `site/` är genomgånget
  2026-07-25 (inga interna koder i läsartext, inget "ägarbeslut"). Kvar med
  "ägarbeslut" är HISTORISKA loggposter i `DECISION_LOG.md` och
  `ops/FRAGEVAGEN-LANSERING.md` — de lämnas medvetet orörda, att skriva om dem
  i efterhand vore att ändra historien. Skriv inte nytt så.
- **Interna koder får aldrig möta läsaren:** grindkoder (G-serien), R-regler,
  b-nummer och råa id:n (gruppkoder som `g-…`). Lätt att missa: `description=`
  i `Layout` syns i sökresultat och delningar — det var där de värsta fallen
  satt. Skriv ut vad som faktiskt sker, eller gör koden läsbar.
- **Arkivlänkar:** en Wayback-kopia accepteras bara om citatet står ordagrant i
  själva snapshotten (`snapshotBacksQuote`). Hellre en synlig lucka än en länk
  som ser ut som bevis men inte är det.
- **Fulltext committas aldrig** (§6.2/T7) — bara citat + metadata. Bevisvalvet
  (full HTML/transkript) ligger i det privata `vallen-2026`.

---

## 9. Samarbete mellan parallella sessioner

Flera Claude-sessioner kan arbeta i repot samtidigt. Bindande:

- **`main` är samlingspunkten.** Läs `origin/main` (`git fetch origin main`)
  innan nytt arbete.
- **Gör anspråk innan du börjar** — anteckna vad du tar dig an (t.ex. under en
  "Pågår just nu"-rubrik i din PR-beskrivning eller detta dokument) så två
  sessioner inte river i samma sak.
- **Skörda aldrig parallellt** — en enda pipeline-/skördekörning i taget
  (workflow-concurrency skyddar CI, men gör inte manuella skarpa körningar
  samtidigt).
- **Arbeta i egen worktree/gren**, committa med tydligt scope, öppna PR mot main.
  Boten pushar data direkt; människor och Claude går via PR. **PR:en öppnas
  utan att fråga om lov** när spåret är färdigt (stående mänskligt beslut
  2026-07-28, se CLAUDE.md "Att avsluta ett större spår"); att slå ihop den
  med `main` är fortfarande en människas beslut.
- Commit-/PR-texter följer språkreglerna (§0).

---

## 10. Nyckelkommandon i sammandrag

```
git fetch origin main                              # innan allt
cd pipeline
node --import tsx/esm --test "tests/**/*.test.ts"   # tester (253, gröna)
node ./node_modules/typescript/bin/tsc --noEmit     # typecheck (rent)
node --import tsx/esm scripts/check-t7.mts          # T7 (OK)
pnpm review list                                    # granskningskön
pnpm calc:backfill --sample=10 --dry-run --stub     # backfill-logiktest utan nyckel
cd ../site && pnpm build && pnpm test               # bygg + sajttester
```

---

## 11. Verifierad status (2026-07-23, i denna worktree)

Kört mot `origin/main` (commit `b13f889`, efter PR #438):

- **`pnpm test` (pipeline): 253 tester, 43 sviter, 0 fel.** ✅
- **`pnpm typecheck` (pipeline): rent, exit 0.** ✅
- **`pnpm check-t7`: ALLT OK** — 404 löften har `archive_url`, 24 saknar
  (retry-flagga hanteras av pipeline), ingen fulltext i data, 177 seen-URL:er,
  0 review-poster. ✅
- **Data (2026-07-23, se §7 för dagens siffror):** 428 löften (s 44, m 79, sd 28, c 88, v 31, kd 23, l 47, mp 91 —
  summan > 428 pga tvärparti-grupper), 361 llm_estimat varav **4** med
  `calculation` (backfillen ännu ej landad), 176 stances, 10 frågor, 4 krönikor,
  233 changelog-poster, 9 rättelseposter, needs_review tom.
- Sajtbygget (`site/`) inte körd i denna session (kräver Python-fonttools för OG
  + Astro-deps) — CI (`build.yml`) täcker den.

> Osäkerheter: (1) Backfill-körningens exakta utfall (~180/~180) är ännu inte
> verifierbart — den låg fortfarande i CI. (2) Produktpivoten 2026-07-21
> (belopp bakom godkännandegrind) var i DECISION_LOG markerad "kommande, ej
> byggd än" — kontrollera hur långt sajtbygget kommit innan du rör startsidan.
