# Överlämning — Handlingsvågen

Skriven 2026-07-19; uppdaterad senare samma dag efter full skörd, HV2 och
b-0012. Läs `CLAUDE.md` först (bindande språkregler och kärnprinciper),
sedan `SPEC-HANDLINGSVAGEN.md` (fastställd spec) och `NEUTRALITET.md`.
Alla metodval står i `data/beslutslogg.json`.

## Vad detta är

Tredje vågen för drygast.nu (systerrepo `bambapappa/valflask`, publikt):
ett register som väger partiers och ledamöters faktiska riksdagshandlingar
mot löftena (Fläskvågen) och ståndpunkterna (Frågevågen). Devisen: ord är
gratis, handlingar räknas. **Privat tills lanseringsgrinden HV5 passerats**
— ingenting härifrån får synas i valflask eller på drygast.nu före dess.

## Läget just nu (43 tester, ren typkontroll under `pipeline/`)

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

Återstår (i ordning):

1. **Röstskörd 2022/23–2025/26** — `npm run roster -- --rm …` (pågick
   vid senaste överlämningen; kontrollera att `data/roster/` har fyra
   filer och committa).
2. **Skarpa förslagskörningar** (HV2) när ägaren satt nycklarna:
   `npm run foreslag -- --promises <valflask>/data/promises.json --alla`.
   Granskningskön ska sedan kopplas till issue-flödet i **valflask**
   (egen etikett, samma kommandon /godkänn /avvisa) — ej byggt ännu.
3. **Betänkanden för voteringskopplingar**: voteringars källtext är
   betänkandet; skörda `bet` (finns som DokTyp) och låt förslagssteget
   para voteringar via betänkandetexten. Ej byggt.
4. **Propositioner och H3**: alla 939 propositioner saknar parti
   (regeringen är avsändare). Hur de mappas mot regeringspartierna är
   en öppen metodfråga — beslutslogga innan kod.
5. **Bakåtskörd till 2002/03** när ägaren vill: samma skript, fler
   `--rm`. Räkna ~1 h per mandatperiod i artigt tempo.
6. **HV4 — sajtsektion** (byggs här, publiceras inte) + metodsida.
   Sajten ska skiva datat vid byggtid — aldrig skeppa 17 MB till läsaren.
7. **HV5 — lanseringsgrinden**: checklista i spec §8. Ägarens go krävs.

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

## Sessionspraktik

- Denna session var låst till valflask; add_repo-godkännandet gick aldrig
  fram — därav bundle-vägen. En session skapad **med handlingsvagen som
  källa** har direkt skrivåtkomst.
- Om repot på GitHub är tomt när du börjar: packa upp ägarens bundle
  (`git clone handlingsvagen.bundle`) och pusha main först av allt.
- Commits avslutas med Co-Authored-By-raden och sessionslänken enligt
  harnessens regler; modell-id får aldrig hamna i repoartefakter.
- Granskningsbeslut fattas alltid av ägaren (bambapappa) — föreslå,
  vänta på besked i chatten, verkställ via issuekommentarer i valflask.
