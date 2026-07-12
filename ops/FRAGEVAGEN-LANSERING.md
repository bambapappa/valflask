# Frågevågen — lanseringschecklista (V3)

**Inget går live förrän varje ruta är ikryssad, i ordning.** (Ägarkrav 2026-07-11:
"gör inget live innan vi dubbel- och trippelverifierat".) Tekniken är byggd så att
stegen inte går att hoppa över: passet är avstängt utan `STANCES_ENABLED=true`,
och en delfråga med `formulation_status: "utkast"` kan aldrig publiceras — varken
av pipelinen eller via review-CLI:t.

## Läge just nu (uppdaterat 2026-07-11 efter steg 1)

- `STANCES_ENABLED`: **PÅ som default i pipeline.yml** (ägarbeslut 2026-07-11) —
  torrkörningen (steg 2) startar automatiskt när branchen mergas. Avstängning:
  sätt repovariabeln `STANCES_ENABLED=false`. `STANCES_MODE` är osatt = **review**
  (egen ratt, delas INTE med löftesflödets PIPELINE_MODE): allt hamnar i
  `data/stances_review.json`, inget publiceras, tills `STANCES_MODE=auto` sätts i steg 4.
- Samtliga 22 delfrågor: `formulation_status: "verifierad"` — STEG 1 KLART 2026-07-11
  (ägargodkännande + källkontroll mot dagsaktuellt rättsläge; nio formuleringar
  omformulerades/förankrades, se DECISION_LOG).
- Sajtsidorna (/fragor, /fraga/*, /svangningar) renderar tomt läge sanningsenligt
  ("besked saknas") och kan mergas utan risk: de påstår ingenting.
- BEVAKA: straffåldersfrågan omformuleras om prop. 2025/26:293 antas i augusti
  (sänkas → behållas), se fairness_note.

## Steg 1 — Verifiering nr 1: delfrågeformuleringarna (ägare + agent) — KLART 2026-07-11

- [x] Ägaren godkände frågorna (2026-07-11).
- [x] Samtliga 22 delfrågor källkontrollerade mot dagsaktuellt rättsläge/debattläge.
      Nio omformulerades/förankrades: matmomsen (tillfällig t.o.m. 2027-12-31),
      lönekravet (90 % sedan 2026-06-01 — symmetrisk "behållas på minst dagens nivå"),
      a-kassetaket (34 000 kr sedan 2025-10-01), kärnkraftsfinansieringen (lag 2025:587),
      reduktionsplikten (10 % sedan 2025-07-01), säkerhetszoner (lagens term),
      straffåldern (prop. 2025/26:293: 14 år för allvarliga brott),
      värnplikten ("utöver beslutade nivåer"), kärnvapen (lagstadgat förbud —
      den verkliga skiljelinjen; enighet råder redan om fredstid).
- [x] `formulation_status: "verifierad"` på samtliga.

## Steg 2 — Verifiering nr 2: torrkörning mot skarpa källor (agent, ägare läser)

- [ ] Merga PR:en — torrkörningen startar av sig själv vid nästa schemalagda
      körning (STANCES_MODE osatt = review: ALLT hamnar i `data/stances_review.json`,
      inget publiceras; löftesflödets PIPELINE_MODE påverkas inte).
- [ ] Granska kön med `pnpm stances:review`: träffar extraktionen rätt delfrågor?
      Är citaten ordagranna och beskeden rimliga? Är LLM B:s bedömningar strikta?
- [ ] Justera promptar/grindar vid behov och kör om. Upprepa tills en hel veckas
      körningar ser rätt ut.

## Steg 3 — Verifiering nr 3: första publiceringarna (ägare)

- [ ] Godkänn en första, liten batch manuellt: `pnpm stances:review approve <id>`.
      (Hårda grindfel G1–G8 kan inte godkännas; utkast-delfrågor kan inte godkännas.)
- [ ] Kontrollera de publicerade beskeden på /fraga-sidorna: citat, källänk,
      arkivlänk, datum — allt ska gå att klicka och verifiera för hand.
- [ ] Testa ändringsflödet: när ett riktningsbyte dyker upp i kön, godkänn det och
      kontrollera att BÅDA beskeden visas sida vid sida på /svangningar.

## Steg 4 — Skarp drift

- [ ] Sätt repovariabeln `STANCES_MODE=auto` i GitHub Actions (löftesflödets
      PIPELINE_MODE rörs inte).
- [ ] Efter växling till `auto`: riktningsbyten fortsätter ALLTID gå via review
      (permanent regel, §5.5) — bevaka kön dagligen under valrörelsen.
- [ ] Källröta-workflown (rot-watch.yml) följer samma default-PÅ och är en
      ofarlig no-op tills publicerade besked finns — ingen åtgärd krävs.

## Snabbreferens

| Kommando | Gör |
|---|---|
| `pnpm stances:skeleton` | Kompletterar celler när frågelistan ändrats (RS1) |
| `pnpm stances:review` | Listar granskningskön |
| `pnpm stances:review approve <id>` | Publicerar godkänt besked (RS-validerat före skrivning) |
| `pnpm stances:review reject <id> [skäl]` | Avvisar |
| `pnpm test` (pipeline/ och site/) | Hela sviten inkl. T11–T14 |

**Vid fel efter lansering:** samma rutin som Fläskvågen (ops/RUNBOOK.md S2):
`ops/rollback-data.sh` + `correction:`-commit — tyst rättelse är förbjuden.
