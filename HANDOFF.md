# Överlämning — Handlingsvågen

Skriven 2026-07-19 av föregående session. Läs `CLAUDE.md` först (bindande
språkregler och kärnprinciper), sedan `SPEC-HANDLINGSVAGEN.md` (fastställd
spec) och `NEUTRALITET.md`. Alla metodval står i `data/beslutslogg.json`.

## Vad detta är

Tredje vågen för drygast.nu (systerrepo `bambapappa/valflask`, publikt):
ett register som väger partiers och ledamöters faktiska riksdagshandlingar
mot löftena (Fläskvågen) och ståndpunkterna (Frågevågen). Devisen: ord är
gratis, handlingar räknas. **Privat tills lanseringsgrinden HV5 passerats**
— ingenting härifrån får synas i valflask eller på drygast.nu före dess.

## Läget just nu

Klart och grönt (15 tester, ren typkontroll under `pipeline/`):

- **HV0** — spec, neutralitetskontrakt, scheman (`schemas/`), beslutslogg
  med b-0001–b-0008 fastställda av ägaren; **b-0009 är bara föreslagen**
  (interpellationer/skriftliga frågor = ledamotsmerit, aldrig partidom)
  och ska bekräftas av ägaren.
- **HV1** — `pipeline/src/riksdagen.ts` (klient mot data.riksdagen.se:
  dokumentlista, voteringlista, personlista; injicerbar fetch, paginering
  via `@nasta_sida`) och `pipeline/src/handlingar.ts` (normalisering,
  idempotent id-tilldelning h-ÅÅÅÅ-NNNN, motionstypsklassning).
- **HV3** — `pipeline/src/domar.ts`: deterministisk domsmotor,
  partidomar + ledamotsmeriter. Ingen språkmodell får skriva domar.
- **Skördare** — `pipeline/scripts/harvest.mts` (`--rm`, `--typ`,
  `--limit`, `--out`). Rökprov kört 2026-07-19 mot riktiga API:t:
  601 handlingar, samtliga med korrekt parti.

Återstår (i ordning):

1. **Full skörd** av riksmötena 2022/23–2025/26, alla typer
   (`mot,prop,ip,fr,vot`) → `data/handlingar.json` i detta repo.
   Räkna med tiotusentals poster; skördaren är idempotent så den kan
   köras om. Voteringar hämtas med stor `sz` — kontrollera att alla
   punkter kommer med (jämför `@traffar` om fältet finns).
2. **HV2 — kopplingar**: förslagssteg (språkmodell läser löfte + kandidat-
   dokument och föreslår koppling med exakt citat), grindarna H1–H6
   (se spec §5; citatkontrollen ska återanvända mönstret från valflask
   `pipeline/src/gates.ts`/`normalizeForVerbatim` — identifieraren får
   behållas, men skriv aldrig ordet i prosa), granskningskö via
   issue-flödet i **valflask** (egen etikett, samma kommandon
   /godkänn `/avvisa`) eftersom detta repo är privat och flödena finns där.
   Ägarbeslut krävs för varje koppling.
3. **HV3-komplettering**: `data/roster/<votering_id>.json` för kopplade
   voteringar (per-ledamotsrösterna) + skript som genererar
   `data/domar.json` ur kopplingar + handlingar.
4. **HV4 — sajtsektion** (byggs här, publiceras inte) + metodsida.
5. **HV5 — lanseringsgrinden**: checklista i spec §8. Ägarens go krävs.

## Tekniska anteckningar (dyrköpta)

- **`partibet` är ofta "-"** i dokumentlistans intressenter — berika via
  ledamotsregistret (`berikaPartier`). Utan träff: lämna tomt, H3 stoppar.
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
