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
  det. Gruppens första post (lägst id) representerar den; spannet mellan
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
  flaggor `--sample=N`/`--all`, `--dry-run`, `--seed`, `--factor`, `--stub`.
  Triage: nytt belopp nära det publicerade → fäst (rekonstruerad) uträkning,
  behåll belopp; avviker → till `data/calculation_review.json`. Körs via workflow
  `calculation-backfill.yml` (manuell start, dry-run default, rapport som
  artifact). (PR #436, #438)

---

## 7. Läget just nu / pågående arbete

**Pågår just nu — VÄNTAR PÅ CI:** En skarp fullkörning av uträknings-backfillen
ligger i GitHub Actions (`calculation-backfill.yml`, run-id 30011446295, startad
2026-07-23 ~13:29 UTC, `all=true, dry_run=false, factor=1.5`). Modellen
(deepseek/deepseek-v4-pro) är seg (~36 s/anrop → ~3–4 h). När den är klar
committar den **direkt till main**: ~180 löften får ett `cost.calculation` utan
att beloppet ändras (märkt "Rekonstruerad i efterhand …"), ~180 hamnar i
`data/calculation_review.json` (avvikande, orörda löften) för mänsklig genomgång,
och EN samlad rättelsepost skrivs i `data/rattelser.json` (sentinel "systematisk
kvalitetshöjning", idempotent). **Nästa steg:** gå igenom
`calculation_review.json` tillsammans med ägaren; de justeringarna ryms under den
enda samlade rättelseposten (INGEN rättelse per löfte) — uppdatera bara
`promises.json` + changelog, inte `rattelser.json`.

> Kontrollpunkt vid övertagande: när denna HANDOFF skrevs hade backfillen ännu
> inte landat i main (endast 4 av 361 llm_estimat hade `calculation`, och
> `data/calculation_review.json` fanns inte). Kolla `git log` och filens existens
> för att se om körningen är klar.

**Redan gjort denna omgång (allt mergat):** p-2026-0470 rättat till 0 kr; Grupp
1–2 (12 förbuds-/vinstlöften) nollställda; Grupp 3 (5 straffskärpningar) och
Grupp 4 (4 krav/regleringar) översedda — med rättelsepost + historik.
Review-kön tömd (6 avvisade dubletter/grindfel, 7 behandlade). Karensgruppen
`g-slopad-karens` städad (dublett tillbakadragen, belopp harmoniserade,
p-2026-0326 utlyft med överlappsnot). Alla dessa syns i `data/rattelser.json`
(9 poster).

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
  tvärparti-grupperingen infördes efteråt), inte inkonsekvens.
- **Backfillen committar direkt till main** (bot bypassar PR-krav) — den kan
  landa mitt i annat arbete. Rebasa alltid mot färsk `origin/main`.
- **Språkreglerna** gäller commits, PR-texter, issues och all prosa: aldrig
  "verbatim", aldrig "ägarbeslut", enkelt språk (§0). OBS: en del BEFINTLIG kod
  och äldre DECISION_LOG-text använder fortfarande "ägarbeslut" — det får stå,
  men skriv inte nytt så.
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
  Boten pushar data direkt; människor och Claude går via PR.
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
- **Data:** 428 löften (s 44, m 79, sd 28, c 88, v 31, kd 23, l 47, mp 91 —
  summan > 428 pga tvärparti-grupper), 361 llm_estimat varav **4** med
  `calculation` (backfillen ännu ej landad), 176 stances, 10 frågor, 4 krönikor,
  233 changelog-poster, 9 rättelseposter, needs_review tom.
- Sajtbygget (`site/`) inte körd i denna session (kräver Python-fonttools för OG
  + Astro-deps) — CI (`build.yml`) täcker den.

> Osäkerheter: (1) Backfill-körningens exakta utfall (~180/~180) är ännu inte
> verifierbart — den låg fortfarande i CI. (2) Produktpivoten 2026-07-21
> (belopp bakom godkännandegrind) var i DECISION_LOG markerad "kommande, ej
> byggd än" — kontrollera hur långt sajtbygget kommit innan du rör startsidan.
