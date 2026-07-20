# Överlämning — Handlingsvågen

Skriven 2026-07-19; senast uppdaterad 2026-07-20 (fjärde passet: skördar
klara, b-0014, HV2-piloter bevisade, HV4-prototyp). Läs `CLAUDE.md` först (bindande
språkregler och kärnprinciper), sedan `SPEC-HANDLINGSVAGEN.md` (fastställd
spec) och `NEUTRALITET.md`. Alla metodval står i `data/beslutslogg.json`.

## Vad detta är

Tredje vågen för drygast.nu (systerrepo `bambapappa/valflask`, publikt):
ett register som väger partiers och ledamöters faktiska riksdagshandlingar
mot löftena (Fläskvågen) och ståndpunkterna (Frågevågen). Devisen: ord är
gratis, handlingar räknas. **Privat tills lanseringsgrinden HV5 passerats**
— ingenting härifrån får synas i valflask eller på drygast.nu före dess.

## Läget just nu (68 tester, ren typkontroll under `pipeline/`)

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
  `prototyp/`): Vågen (rutnät + Läge A/B-förklaring), Utforskaren
  (fritt sök, röstmatriser, ledamotssidor), Ämnen (värmekartor:
  parti över tid / fråga över tid på utskottsindelningen),
  Mot varandra (head-to-head mellan ledamöter, generellt eller per
  utskott, med samsynsprocent). Ägarens öppna frågor F1–F5 i
  SKISS-HV4.md.

Återstår (i ordning):

1. **Ägarens /godkänn eller /avvisa i issue #5** — systemets första
   H6-beslut; därefter `npm run domar` för första domen/meriten.
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
6. **HV4 — sajtsektion på riktigt** (Astro, byggs här, publiceras
   inte) + metodsida. Prototypen i `prototyp/` är designunderlaget;
   sajten ska skiva datat vid byggtid — aldrig skeppa 17 MB.
   Väntar på ägarens F1–F5-beslut.
7. **HV5 — lanseringsgrinden**: checklista i spec §8. Ägarens go krävs.
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

### Meddelanden mellan sessioner

Korta, daterade och signerade med grennamn; mottagaren tar bort raden
när den är hanterad (i samma commit som åtgärden):

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
