# HV4-prototyp

Klickbar prototyp på riktig data — underlag för ägarbeslut om
visualiseringen (se SKISS-HV4.md, frågorna F1–F5). Publiceras aldrig.

Bygg:
1. `node bygg-payload.mjs` (läser ../data + valflask promises.json,
   skriver payload.json — sökvägarna i skriptet kan behöva pekas om)
2. Ersätt `__PAYLOAD__` i `mall.html` med innehållet i payload.json
   → färdig HTML-fil, helt fristående.

Två lager: **Vågen** (löfte × parti, bara grindat material) och
**Utforskaren** (fritt sök i alla handlingar, röstmatriser per votering,
ledamotssidor med avvikelser mot partilinjen). Ja/Nej-färgerna är ett
icke-värderande blå/orange-par, kontrollerat för färgblindhet i både
ljust och mörkt läge.
