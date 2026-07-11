# Frågevågen — lanseringschecklista (V3)

**Inget går live förrän varje ruta är ikryssad, i ordning.** (Ägarkrav 2026-07-11:
"gör inget live innan vi dubbel- och trippelverifierat".) Tekniken är byggd så att
stegen inte går att hoppa över: passet är avstängt utan `STANCES_ENABLED=true`,
och en delfråga med `formulation_status: "utkast"` kan aldrig publiceras — varken
av pipelinen eller via review-CLI:t.

## Läge just nu

- `STANCES_ENABLED`: **inte satt** (= av). Pipelinen kör exakt som före Frågevågen.
- Samtliga 22 delfrågor: `formulation_status: "utkast"` — publicering omöjlig.
- Sajtsidorna (/fragor, /fraga/*, /svangningar) renderar tomt läge sanningsenligt
  ("besked saknas") och kan mergas utan risk: de påstår ingenting.

## Steg 1 — Verifiering nr 1: delfrågeformuleringarna (ägare + agent)

För VARJE delfråga i `data/issues.json`:

- [ ] Kontrollera mot dagsaktuella källor att frågan fortfarande är ett levande
      vägval (inte redan avgjort/inaktuellt), att termerna är korrekta
      (t.ex. exakt namn på regelverk) och att formuleringen klarar rättvisetestet
      i `fairness_note`.
- [ ] Justera formuleringen vid behov (PR mot `data/issues.json`).
- [ ] Sätt `formulation_status: "verifierad"`.

Särskilt flaggade (`VERIFIERA` i fairness_note): `sq-jobb-lonegolv` (rättsläget för
lönekravet), `sq-ekonomi-matmoms` (sänkningens utformning/giltighetstid),
`sq-energi-karnkraft` (finansieringsprogrammets status), `sq-forsvar-karnvapen`
(rättsläge/debattläge).

## Steg 2 — Verifiering nr 2: torrkörning mot skarpa källor (agent, ägare läser)

- [ ] Kör pipelinen lokalt/i Actions med `STANCES_ENABLED=true` och
      `PIPELINE_MODE=review` — ALLT hamnar i `data/stances_review.json`, inget
      publiceras.
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

- [ ] Sätt repovariabeln `STANCES_ENABLED=true` i GitHub Actions.
- [ ] Behåll `PIPELINE_MODE=review` första skarpa veckan (samma rutin som
      Fläskvågens lansering), därefter `auto`.
- [ ] Efter växling till `auto`: riktningsbyten fortsätter ALLTID gå via review
      (permanent regel, §5.5) — bevaka kön dagligen under valrörelsen.
- [ ] Aktivera källröta-workflown (V4) genom att slå på schemat i
      `.github/workflows/rot-watch.yml` (körs annars aldrig).

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
