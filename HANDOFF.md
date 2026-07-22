# Överlämning — Handlingsvågen

Skriven 2026-07-19; senast uppdaterad 2026-07-22 (HV4 färdig + HV5-migreringen
FÖRBEREDD utan go-live: symmetritest b-0020, arkivväg, rättelseväg,
gated deploy, `MIGRERING.md`). Läs `CLAUDE.md` först (bindande
språkregler och kärnprinciper), sedan `SPEC-HANDLINGSVAGEN.md` (fastställd
spec) och `NEUTRALITET.md`. Alla metodval står i `data/beslutslogg.json`.

## Vad detta är

Tredje vågen för drygast.nu (systerrepo `bambapappa/valflask`, publikt):
ett register som väger partiers och ledamöters faktiska riksdagshandlingar
mot löftena (Fläskvågen) och ståndpunkterna (Frågevågen). Devisen: ord är
gratis, handlingar räknas. **Privat tills lanseringsgrinden HV5 passerats**
— ingenting härifrån får synas i valflask eller på drygast.nu före dess.

## Läget just nu (76 tester + ren typkontroll under `pipeline/`; `site/`-svit och `astro build` gröna)

- **HV0** — spec, neutralitetskontrakt, scheman, beslutslogg.
  b-0001–b-0012 är samtliga fastställda av ägaren (b-0009 och b-0011
  bekräftade 2026-07-19; b-0010/b-0012 tekniska följdbeslut).
- **HV1 — KLART, data incheckat.** Full skörd 2022/23–2025/26 ligger i
  `data/handlingar.json`: **23 629 handlingar** (13 010 motioner,
  939 propositioner, 2 628 interpellationer, 4 476 skriftliga frågor,
  2 576 voteringspunkter med röstfördelning per parti). Schemavaliderat,
  unika id:n. Voteringar hämtas EN OCH EN via `/votering/<id>` —
  `voteringlista` med stor `sz` trunkerar tyst (b-0010). Skördaren har
  retry med backoff och delsparar per block.
- **HV2 — byggt, väntar på skarpa körningar.** `src/grindar.ts` (H1–H5,
  samma citatnormalisering som valflask; H6 kan per definition inte
  passeras av kod), `src/foreslag.ts` + `prompts/koppling.md`
  (förslagssteg med deterministiskt kandidaturval, b-0011),
  `scripts/foreslag.mts` (kö: `data/kopplingsforslag.json`).
  Kräver `OPENROUTER_API_KEY` + `MODEL_KOPPLING`.
- **HV3 — motor + skript klara.** `src/domar.ts` (deterministisk,
  b-0009-reglerna), `scripts/domar.mts` (enda skrivvägen till
  `data/domar.json`), `scripts/roster.mts` (röstskörd).
- **b-0012 — kompakt röstlagring.** `data/personer.json` +
  `data/roster/<riksmöte>.json` med röststrängar (J/N/A/F/-);
  partibyten per votering i avvikelselista; `src/roster.ts`
  kodar/avkodar förlustfritt åt domsmotorn.
- **b-0013 — betänkandestöd, BYGGT.** Voteringar kopplas via
  betänkandets text: `--typ bet` skördar till eget index
  `data/betankanden.json` (nyckel = voteringens dok_id-form
  `202223:AU10`), `rankaVoteringsKandidater` rankar mot betänkandets
  titel, källtexten till modell och H2 är betänkandets, och beviset bär
  `bevis.kalla_dok_id`. Skörden är INTE körd (se nätblockering nedan).
- **H6-granskningsflödet — BYGGT.** Kön synkas till issues i DETTA
  privata repo (etikett `koppling-kö`, titel `[koppling <12 hex>]`),
  ägaren beslutar med `/godkänn`, `/godkänn --motionstyp parti`
  (b-0007) eller `/avvisa <skäl>`; `koppling-review.yml` exekverar,
  committar och stänger. Lokalt: `npm run granska -- list|godkann|avvisa`.
  OBS: överlämningen sade "issue-flödet i valflask", men HV5-grinden
  förbjuder allt synligt i valflask före lansering — därför ligger
  flödet här och speglas till valflask vid HV5 (spec §8). Vill ägaren
  annorlunda är flytten trivial (skripten läser GITHUB_REPOSITORY).

**Nätblockering i denna miljö:** egressproxyn nekar data.riksdagen.se
och openrouter.ai (403, organisationspolicy) — inga skördar eller
modellanrop kan köras från sessionscontainern. **Lösningen är byggd:**
skördar och förslagskörningar går som workflows på GitHubs runners
(fritt utnät) — `skord.yml` respektive `foreslag.yml`, båda startas
för hand under Actions-fliken. OpenRouter-nyckeln finns som hemlighet i
valflask men hemligheter kan aldrig läsas ut ur GitHub — ägaren lägger
in den (och `MODEL_KOPPLING`-variabeln) i DETTA repo:
Settings → Secrets and variables → Actions.

**Gjort 2026-07-22 (HV5-migreringen FÖRBEREDD utan go-live, grenen `claude/handoff-next-steps-osvpyr`):**

Allt som går att göra bakom privatgrinden är gjort; kvar är bara de steg som
gör något publikt (kräver ägarens go). Runbook: `MIGRERING.md`.

- **Symmetritest redovisat (b-0020):** `pipeline/tests/symmetri.test.ts` — samma
  röst/riktning ger samma utslag för båda block; motorn har ingen blockberoende
  gren. 80 pipeline-tester gröna. (HV5-checklistan ✔)
- **Arkivväg byggd (ej körd):** `scripts/arkiv.mts` + `arkiv.yml` hämtar en
  arkivögonblicksbild per vägt dokument och kontrollerar att citatet står ord
  för ord i kopian (kärnprincipen); en kopia utan citat accepteras aldrig.
  Delsparar till `data/arkiv.json` (+ schema), sajten slår in verifierade
  länkar. Körs via Actions (fritt utnät) — 0/16 gjorda, den enda kvarvarande
  hårda checklistepunkten.
- **Rättelseväg på plats:** `data/rattelser.json` (+ schema), `rattelser.astro`,
  `Rattelsenot.astro` (not på berörd sida — parti/ledamot/löftespanel),
  footer-länk. Tom men redo. (HV5-checklistan ✔)
- **Neutralitetssidan publicerbar:** `neutralitet.astro` (kontraktets tio
  punkter, ren läsartext). (HV5-checklistan ✔)
- **Gated deploy:** `hv-pages.yml` bygger/testar på begäran; ingen
  push-utlösare, deploy körs bara vid `deploy=true`. Egen CF-projektnyckel
  (b-0017). Sajten bär `noindex` tills grinden släpps.

**Gjort 2026-07-22 (HV4 färdig — Vy 2 + Vy 3, grenen `claude/handoff-next-steps-osvpyr`):**

- **Partisidan (Vy 2)** `site/src/pages/parti/[kod].astro` (8 sidor): partiets
  egna löften med status (ärligt tomt där ingen koppling finns), listan över
  handlingar som gett utslag (nyast först), andelen utan handling som tal.
- **Ledamotssidan (Vy 3)** `site/src/pages/ledamot/[id].astro` (alla 425
  sittande, F5): meritlista per löfte ur `domar.json` — egna handlingar skilda
  från röster i voteringar — frånvaro visad med kvittningsnot (fäller aldrig,
  b-0004), och avvikelse från partilinjen markerad (spec §6.4; räknas
  deterministiskt genom att jämföra ledamotens klassning mot partiets på samma
  koppling, bara voteringar). Just nu 0 avvikelser: de tre kopplade
  voteringarna var partienhetliga. Avhoppade får ingen sida — deras namn står
  kvar på handlingen.
- **Index och navigering:** `partier.astro` + `ledamoter.astro` (425 grupperade
  på parti). Global sökruta i sidhuvudet på ALLA sidor (`hv-sok.js`), eget
  index vidgat till partier + ledamöter (443 poster). Rutnätets partikolumner
  och panelens partipiller länkar till partisidorna; djuplänk `?lofte=<id>`
  öppnar rätt panel (så journalister kan länka exakt).
- **Grindar:** `site/` budget- och strukturgrindar gröna (`npm test`, ny
  `test-vyer.mts`), `astro build` grön (437 sidor), rökt i headless Chromium
  (partisida via kolumnrubrik, sök→ledamot, parti-länk, djuplänk→panel,
  425 i indexet, inga JS-fel).
- **Filtren (SKISS §3):** rutnätet filtreras på parti, kategori, status,
  dokumenttyp, motionstyp och riksmöte — som URL-parametrar
  (`?parti=s&status=emot&rm=2025/26`), länkbart och delbart. Fasetter härleds
  ur radernas kopplingar (`summary.json` bär dem); klientfiltret speglar
  URL:en och har en "Rensa filter"-knapp med räknare. Partisidan har ett
  statusfilter (`hv-listfilter.js`). Riksmöte härleds ur handlingens datum
  (`riksmoteAvDatum`). Rökt i headless Chromium — filter, URL-spegling,
  rensa och djuplänkar fungerar, inga JS-fel.
- **HV4 är därmed komplett** i spec-mening (§8: per löfte, per parti, per
  ledamot; metodsida; API-utkast; sök; filter). Nästa grind är HV5 — se
  Återstår.

**Gjort 2026-07-22 (HV4-sajtens första bit — grenen `claude/handoff-next-steps-osvpyr`):**

- **Rutnätet Vy 1 byggt på riktigt (b-0019), egen Astro-sajt under `site/`**
  (bas `/handlingsvagen`, b-0017; privat, `noindex`). Löfte × parti, status på
  form aldrig grön/röd (F2), tomma celler ärligt utskrivna (F1). Klick på
  löfte/cell → detaljpanel med kopplingarnas bevis (exakt citat, riksdagslänk,
  arkivlänk när den finns, riktning, metodnot, motionstyp, säkerhet, godkänd av
  människa). Metodsida i språk alla förstår. Eget sökindex (F3), laddas vid
  fokus; kategorifilter. CSP-rent: klientkod i `public/hv-rutnat.js`, ingen
  inline-JS.
- **Byggtidsskivning** `site/src/pages/api/hv/*`: `summary.json` (3,3 KB), per
  löfte-detalj (störst 5 KB), `sok-index.json` (1,2 KB) — råfilerna (17 MB)
  skeppas aldrig. Budget- och strukturgrindar gröna (`npm test` i `site/`),
  `astro build` grön (10 filer), rökt i headless Chromium (panel, sök, filter,
  inga JS-fel).
- **Alla åtta partier fylls ur egna röster (b-0019 b):** partidomar räknas nu
  för hela partiuniversumet, inte bara löftets eget parti — varje cell fylls av
  partiets EGEN handling (röst i kopplad votering, eget författarskap).
  `domar.mts` läser `data/parties.json`; `data/domar.json` regenererad (48
  partidomar, 19 med utslag; 745 meriter oförändrade). Domsmotorn och dess 76
  tester orörda. De två voteringskopplade löftena visar en blockspridning —
  det semantiska valet är öppet för din omprövning, se meddelande nedan.
- **Vendorat utdrag ur valflask (b-0019 a):** `data/loften-index.json` +
  `data/parties.json` via `npm run vendor`. Läskopia; valflask äger löftena.

**Gjort 2026-07-21 (kostnadsgrind, topologi, HV4-frågorna — grenen `…bundle-content-ueyqqy`):**

- **Kostnadsgrind i Fläskvågen (b-0016), valflask PR #424.**
  Kostnadsestimat är maskade tills läsaren kvitterat en godkännanderuta;
  grundläget är antal. Global `.belopp`-mask + `estimat-init.js`/
  `estimat-grind.js` (CSP-rena `public/`-filer), guardad taxameter,
  localStorage utan kaka. Krönikeprosa, rubriker och de strukturerade
  jämförelserna maskas via `site/src/lib/mask.ts`. `astro build` grönt
  (461 sidor), innehållstesterna gröna. OG-delningsbilderna maskar ännu
  INTE beloppet — medvetet parkerat.
- **Topologi (b-0017):** Handlingsvågen hostas som EGEN Pages-sajt bakom
  Cloudflare på `drygast.nu/handlingsvagen`, inte inbyggd i Fläskvågen —
  skyddar privatgrinden och håller blast radius liten. Temat delas som en
  källa. Omvärderas efter HV5.
- **HV4-frågorna F1–F5 avgjorda (b-0018), `SKISS-HV4.md` §5 uppdaterad:**
  F1 alla åtta partier per löfte (tomt = "ingen ren koppling ännu"); F2
  skilj status på form, inte färgton (hex i tema-arbetet); F3 eget litet
  sökindex; F4 båda källorna (löften + Frågevågens ståndpunkter) från
  start; F5 notis för avhoppade ledamöter, inte egen sida. **HV4-
  sidbyggandet är nu obeblockerat.**
- **Granskningsvy publicerad** (privat artefakt): statisk mobilsida som
  listar väntande kopplingsförslag sorterade på confidence, med djuplänk
  till rätt issue för `/godkänn`·`/avvisa`.
- **PR #40 öppnad** (motionstyp-backfill b-0015 + beständigt par-minne):
  merge-konflikt i `data/kopplingsforslag.json` löst genom att ta mains
  kö (ägarens issue-godkännanden är facit). Väntar på granskning/merge.

**Gjort 2026-07-20/21 (senare pass, grenen `…bundle-content-ueyqqy`):**

- **Nej-svar beständiga** — `data/provade-par.json` minns varje prövat
  par; omkörningar betalar bara för oprövat. `src/provade.ts` +
  `provade-uppdatera.mts`.
- **b-0015 — motionstyp ur riksdagens egen klassning** (subtyp), inte
  gissning. Berikade 12 887 motioner; `motionstyp-backfill.mts`.
  Gissningen var fel på alla 10 köade motionsförslag — nu rättade
  (h-2026-2074→parti, nio→enskild). 8 öppna issues fick synlig
  rättelsekommentar; de 4 redan godkända bar alla rätt typ.
- **⚠️ 401-fyndet:** körning 8 föll på 1 234 × HTTP 401 — kontrollera
  OpenRouter-nyckel/kredit före nästa fullkörning (se nedan).

**Gjort 2026-07-20 (fjärde passet, grenen `…bundle-content-ueyqqy`):**

- ~~Skördarna~~ **KLART**: `data/roster/` (899 024 röster),
  `data/personer.json` (425), `data/betankanden.json` (1 451,
  2576/2576 voteringar täckta). Workflown behövs bara för bakåtskörd
  och framtida riksmöten.
- ~~Nycklarna~~ **KLART & VERIFIERAT**: `OPENROUTER_API_KEY` +
  `MODEL_KOPPLING` (`moonshotai/kimi-k2.7-code`) +
  `MODEL_KOPPLING_FALLBACK` (`glm-5.2`, z.ai) på plats; vakten i
  `foreslag.yml` passerar. OBS: hemligheten `LLM_FALLBACK_KEY` är en
  felnamnad dubblett (workflown läser `LLM_FALLBACK_API_KEY`) — kan
  raderas.
- ~~foreslag-piloter~~ **BÅDA VÄGARNA BEVISADE**: nej-vägen
  (p-2026-0041 Nato, 9 korrekta avslag — samma politikområde är inte
  samma sakfråga) och ja-vägen (p-2026-0360 elevlagen → förslag genom
  H1–H5 → kön → issue #5, citatet oberoende omkontrollerat).
  **Issue #5 väntar på ägarens /godkänn.**
- **b-0014 GENOMFÖRT till hälften**: utskott (organ) i datamodell,
  schema och skörd + återfyllt på 23 388 handlingar
  (`scripts/organ-backfill.mts`); voteringar härleds ur beteckningen.
  241 utan uppgift, tomt är ärligt.
- **HV4-prototyp byggd och publicerad** (privat artefakt, källa i
  `prototyp/`), i nuvarande version med: Vågen (rutnät + Läge A/B-
  förklaring + omskriven läsanvisning), Utforskaren (fritt sök,
  röstmatriser, ledamotssidor, utfällbar ordlista för förstagångs-
  väljare), Ämnen (värmekartor parti/fråga över tid + Ordmolnet),
  Mot varandra (head-to-head med snabbval: partiledare i kammaren
  eller mest aktiva profil; komplett "röstade olika"-lista med
  punktnummer), Kartan (alla ledamöter placerade i 2D av sina egna
  röstmönster — blocken framträder ur datat). F1–F5 i SKISS-HV4.md.
  **Uppdatera samma artefakt:** bygg om enligt prototyp/README.md och
  publicera med url-parametern
  `https://claude.ai/code/artifact/006ea368-ed8b-4eca-97f5-a657c785045b`
  (annars myntas en ny länk).

Återstår (i ordning):

1. **Ägarens granskning av kön** — pågår. Ägaren har granskat ned kön:
   **18 koppling-kö-issues kvar på main** (2026-07-21) att /godkänna eller
   /avvisa; kör `npm run domar` när fler avgjorts för fler domar/meriter.
2. **b-0014 andra halvan — nyckelordsindexet**: byggtidsindex över
   dokumentens fulltexter (fritextsök + ordtrender per parti).
   Fulltexterna hämtas vid indexbygget och lagras aldrig; indexet
   checkas in skärvat. ~21 000 dokument ≈ ett par timmar i artigt
   tempo — bygg som Actions-workflow eller från session med öppet nät.
   EJ PÅBÖRJAT.
3. **Full förslagskörning** (`foreslag`-workflown med --alla):
   1 328 kandidatpar enligt dry-run 2026-07-20 (202 löften har
   kandidater, 220 ärligt tomma). Räkna med låg men ren träffkvot —
   precisionen är avsiktlig.
4. **Propositioner och H3**: alla 939 propositioner saknar parti
   (regeringen är avsändare). Mappning mot regeringspartierna är en
   öppen metodfråga — beslutslogga innan kod.
5. **Bakåtskörd till 2002/03** när ägaren vill: samma skript, fler
   `--rm`. Räkna ~1 h per mandatperiod i artigt tempo.
6. **HV4 — KLART (b-0019).** Rutnätet (Vy 1), partisidan (Vy 2),
   ledamotssidan (Vy 3), metodsidan, API-utkastet, sök (F3) och **filtren
   (SKISS §3)** är byggda i `site/` (egen Astro-sajt, bas `/handlingsvagen`).
   Rutnätet filtreras på parti, kategori, status, dokumenttyp, motionstyp och
   riksmöte som URL-parametrar (`?parti=s&status=emot` osv. — länkbart,
   delbart, arkiverbart); partisidan har ett statusfilter. Kvar är bara
   förfiningar som INTE blockerar HV5:
   - **Frågevågens ståndpunkter i rutnätet (F4):** kopplingsmodellen bär
     redan `stance_id` (mål = promise_id ?? stance_id), men det finns inga
     ståndpunktskopplingar än — det kräver att förslags-/grindsteget körs mot
     Frågevågens ståndpunkter (egen data-uppgift, inte sidbygge). Sajten
     hoppar tyst över `stance_id`-mål tills dess.
   - **Exakta temakulörer (F2)** hör till det delade tema-arbetet med valflask
     (en källa); HV använder neutrala platshållare tills dess.
   - **Kostnadsgrind (F7)** är inte aktuell här: HV visar inga belopp —
     grundläget är redan antal. Blir bara relevant om ägaren vill lägga in
     löftenas kostnadsestimat på HV-sidorna (då gäller samma grind som b-0016).
   - Prototypens övriga vyer (Ämnen, Mot varandra, Kartan) om ägaren vill ha
     dem; extra, inte spec-krav. Partibyten på ledamotssidan (per-votering ur
     roster-avvikelselistan) är en marginell datastump — avvikelse mot
     partilinjen är utskriven, partibyten ännu inte.
7. **HV5 — lanseringsgrinden. FÖRBEREDD — se `MIGRERING.md`.** Allt bakom
   privatgrinden är gjort: symmetritest redovisat (b-0020), rättelseväg,
   neutralitetssida, beslutslogg/metod publicerbara, arkivväg (skript +
   workflow) och gated deploy-workflow. Kvar är bara ägarstegen som gör
   något publikt, i ordning (MIGRERING.md): (1) kör `arkiv`-workflown tills
   arkivkopiorna är verifierade (0/16 nu — enda hårda datapunkten); (2)
   validera bygget (`hv-pages`, deploy=false); (3) Cloudflare-projekt +
   hemligheter; (4) **ta bort `noindex`** i `site/src/layouts/Layout.astro`
   (grinden släpps här); (5) deploy=true; (6) peka Cloudflare-routningen till
   `drygast.nu/handlingsvagen`; (7) spegla granskningsflödet till valflask;
   (8) verifiera live. Ägarens uttryckliga go krävs.
   Då speglas även granskningsflödet till valflask.

## Tekniska anteckningar (dyrköpta)

- **`partibet` är ofta "-"** i dokumentlistans intressenter — berika via
  ledamotsregistret (`berikaPartier`). Utan träff: lämna tomt, H3 stoppar.
  123 motioner har undertecknare som lämnat riksdagen och saknas i
  personlistan — kan förbättras med historisk personlista, tomt tills dess.
- **Fulltext hämtas ur `dokumentstatus/<id>.json`** (fältet
  `dokument.html` + `htmlTillText`) — `/dokument/<id>/text` svarar
  numera med dokumentstatus-XML, inte ren text.
- **Riksdagens API 503:ar ibland** — all skörd går via `scripts/hamta.mts`
  (300 ms tempo + 4 omförsök med backoff). Kör aldrig två skördar
  parallellt.
- **Riktningssemantik för voteringar**: kopplingens riktning = vad ett
  bifall (Ja) innebär för löftet. Ja+stödjer→i linje, Nej+stödjer→emot,
  osv. Fastslaget i `domar.ts` + tester; ändra aldrig utan beslutslogg.
- **Frånvaro räknas aldrig** (kvittningssystemet, b-0004). Avstår är
  varken eller. Lika röstetal ger `utfall: null`.
- **Enskilda motioner binder inte partiet** (b-0007); `klassaMotionstyp`
  ger bara kommitté/enskild — "parti" sätts av människa i granskningen.
- Riksdagens API svarar utan nyckel; skördaren håller artigt tempo
  (300 ms mellan anrop). `voteringlista` utan `gruppering` ger radnivå.
- Stack: Node 22, TypeScript strict (`exactOptionalPropertyTypes`),
  `node --test` via tsx — exakt som valflask/pipeline.

## Samarbete mellan parallella sessioner (bindande arbetssätt)

Flera Claude-sessioner arbetar i detta repo samtidigt, med OLIKA
nätpolicy (en når data.riksdagen.se/openrouter.ai direkt, en annan
inte). Git är brevlådan och HANDOFF är anslagstavlan:

1. **`main` är samlingspunkten.** Arbeta på din egen `claude/…`-gren,
   ta in `origin/main` ofta (`git fetch` + rebase). Pusha små commits
   tidigt och ofta — opushat arbete är osynligt för alla andra.
2. **Läs anslagstavlan innan du börjar:** `git fetch origin` och läs
   HANDOFF **på `origin/main`** (inte din lokala kopia) — läget kan ha
   flyttat sig sedan din session klonades.
3. **Gör anspråk före arbete:** skriv en rad under "Pågår just nu"
   nedan (datum, gren, område), committa och pusha DEN FÖRST, jobba
   sedan. Ta bort raden i samma commit som avslutar arbetet. Krockar
   två anspråk: den som pushade först har området; den andra väljer
   nytt eller bygger ovanpå via PR.
4. **Datafiler skrivs av en session åt taget.** Skörda aldrig
   parallellt (API-artighet + omergbara JSON-konflikter i
   `data/handlingar.json`/`data/roster/`). Anspråk på skörd = anspråk
   på datafilerna.
5. **Nätuppdelning:** session med öppet nät kör skördar och
   modellanrop direkt; nätblockerad session använder Actions-vägen
   (`skord.yml`/`foreslag.yml`) eller lämnar punkten på anslagstavlan.
6. **Beslutsloggen:** ta nästa lediga b-nummer; krockar vid rebase
   löses genom att numrera om sin EGEN post (aldrig någon annans).
7. **HANDOFF uppdateras när ett pass avslutas** ("Läget just nu" +
   "Återstår") — det är överlämningen till nästa session, mänsklig
   eller inte.
8. **Omergat arbete är osynligt på main.** Sessionerna har olika konton
   och ser aldrig varandras chattar — bara repot. Efter `git fetch`:
   kör `git branch -r --no-merged origin/main` och titta i de grenarnas
   HANDOFF och loggar innan du antar att något inte är gjort. Be ägaren
   merga små tavel-/datacommits snabbt så main speglar verkligheten.

### Pågår just nu

*(inga anspråk)*

Fullkörningen 2026-07-20 (körning 8): **34 förslag i kön över 12 löften**
(29 stödjer/5 motverkar, 5 via betänkanden), issues synkade. Ägaren har
godkänt sitt första (issue #5, elevlagen p-2026-0360) → 1 koppling i
`data/kopplingar.json`. Ägaren har sedan granskat vidare: **kön är 18 på
main (2026-07-21)**. Resten väntar på mänskligt beslut.

**⚠️ INNAN NÄSTA FULLKÖRNING — kontrollera OpenRouter-nyckeln/krediten.**
Körning 8 slutade röd för att **1 234 par föll på HTTP 401** efter ~91
lyckade anrop: OpenRouter-nyckeln slutade accepteras (utgången/slut
kredit) och z.ai-fallbacken räddade dem inte. Ingen kod-fix behövs —
men en omkörning med samma trasiga nyckel bränner bara tid. Verifiera
`OPENROUTER_API_KEY` + kredit (och att `MODEL_KOPPLING_FALLBACK=glm-5.2`
faktiskt svarar på z.ai) först.

**Nej-svar är nu beständiga (löst):** `data/provade-par.json` minns varje
prövat par (förslag/nej/grindfall), seedad med körning 8:s 92 klara par.
En omkörning betalar bara för det oprövade — de 1 234 401-felen prövas
om (rätt, de fick aldrig svar), men de 56 genuina nej-svaren och 34
förslagen frågas aldrig om igen. `scripts/provade-uppdatera.mts`
persisterar filen race-säkert i workflowen.

### Meddelanden mellan sessioner

- 2026-07-20 `…bundle-content-ueyqqy` → alla: femte passet (efter detta)
  lämnade INGA pushade spår i något repo — utgå från denna grens spets,
  inte från antaganden om vad det hann. Påminnelse ur protokollet:
  pusha små commits tidigt; opushat arbete finns inte.

Korta, daterade och signerade med grennamn; mottagaren tar bort raden
när den är hanterad (i samma commit som åtgärden):

- 2026-07-22 `claude/handoff-next-steps-osvpyr` → ägaren + alla: HV4-rutnätet
  är byggt (`site/`). **Ett val att kvittera (b-0019 b):** för att fylla alla
  åtta partikolumner räknas nu ett partis EGNA röst i en kopplad votering som
  dess handling på löftets sakfråga — så en oppositionsröst mot ett kopplat
  förslag blir "agerat emot" även på ett annat partis löfte. Det är öppna data
  och samma testade riktningssemantik, men säg till om du hellre vill att bara
  löftesägaren får utslag (då faller `domar.mts` tillbaka på målets egna
  partier — reversibelt). **OBS interface:** `npm run domar` förutsätter nu att
  `data/parties.json` finns (kör `npm run vendor` först). Kör aldrig
  vendor/domar parallellt med en skörd — samma datafilsanspråk.

- 2026-07-20 `…bundle-content-ueyqqy` → alla: grenen ligger före main
  med b-0014 (utskott i datamodellen + återfyllnad, organ-backfill)
  och HV4-prototypen — merga innan arbete i pipeline/ eller data/.
  Nästa lämpliga uppgift för en session med öppet nät eller via
  Actions: b-0014:s nyckelordsindex (Återstår punkt 2). Kör aldrig
  organ-backfill parallellt med annan skörd.

## Sessionspraktik

- Nätpolicy skiljer per session: passet 2026-07-19 nr 3 var blockerat
  mot data.riksdagen.se; nr 4 (bundlegrenen) hade öppen väg och körde
  skördarna direkt. Prova med `curl -sI https://data.riksdagen.se` innan
  du väljer väg.
- `main` finns och är samlingspunkt (PR #1–#2 mergade dit).
- Commits avslutas med Co-Authored-By-raden och sessionslänken enligt
  harnessens regler; modell-id får aldrig hamna i repoartefakter.
- Granskningsbeslut fattas alltid av ägaren (bambapappa) — föreslå,
  vänta på besked. H6-besluten verkställs via koppling-issues i DETTA
  repo (före HV5), eller `npm run granska` lokalt.
