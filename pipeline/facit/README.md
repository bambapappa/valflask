# Facit — sanningsmängd för page-källan (B)

`manifest-facit.json` är en **valideringsmängd**: 36 skrivna löften som hittats
**manuellt** genom att läsa partiernas egna sidor/dokument och köra dem genom
grindarna.

| Källa | Antal | Parti |
|---|---|---|
| `val2026.centerpartiet.se/.../Valmanifest-2026.pdf` (96 s.) | 7 | C |
| `val2026.centerpartiet.se/` | 5 | C |
| `socialdemokraterna.se/.../Valplattform.pdf` (4 s.) | 2 | S |
| `vansterpartiet.se/.../Preliminar-Valplattform-...-2026.pdf` (4 s.) | 2 | V |
| `liberalerna.se/.../liberalernas-valmanifest-2026-....pdf` (40 s.) | 2 | L |
| `mp.se/.../politiskt-handlingsprogram-2026-2030.pdf` (106 s.) | 2 | MP |
| `mp.se/.../daniel-helldens-almedalstal/` | 13 | MP |
| `mp.se/.../miljopartiet-ny-strategi-for-fossilfri-matproduktion.../` | 3 | MP |

PDF-posterna (`*-pdf-*`) är fångstmål som validerar B:s **PDF-väg**
(textextraktion + dehyphenering + sidchunkning). De har fältet `pdf_page`
i stället för kostnadsfält: de är fångstmål, inte publicerade löften —
publiceringen sker när CI-körningen drar dem genom LLM-extraktion + grindar.

**M/SD/KD saknar poster:** inget publicerat nationellt valmanifest per
2026-07-03. Deras politiksidor ligger som page-feeds i `sources.yaml` och
manifest-PDF:er auto-följs när de länkas — utöka facit då dokumenten släpps.

## Varför det finns

`page`-källan (B) i `data/sources.yaml` hämtar samma sidor automatiskt och kör
LLM-extraktion + grindarna. Facit svarar på frågan: **hittar B det jag hittade
för hand?**

- **B hittar ett facit-löfte → bra.** Den automatiska vägen fångar det manuella.
- **B missar ett facit-löfte → gräv.** Antingen tog LLM-extraktionen inte med det
  (för svagt formulerat), en grind fällde det (oftast G3 verbatim), eller sidan
  har skrivits om. Facit-citaten är verbatim som de stod när de återvanns — om en
  sida ändras kan ett citat sluta matcha, vilket är förväntat och betyder att
  löftet flyttat, inte att B är trasig.

## Köra valideringen

```
cd pipeline && node --import tsx/esm facit/validate-facit.mts
```

Senast kört 2026-07-03: **28/28 hittade** — B fångar hela facit, inkl. PDF-vägen.

Den hämtar varje käll-URL live via samma `fetchPage` som pipelinen och
kontrollerar för varje facit-löfte om citatet finns ordagrant i den hämtade
texten (samma verbatim-regel som G3). Rapporterar `HITTAD` / `SAKNAS` per löfte.
Det verifierar *fångbarheten* — att texten är nåbar och passerar G3. Om LLM-A
sedan faktiskt plockar löftet är ett mjukare steg som avgörs i skarp körning.

Facit uppdateras bara när vi medvetet lägger till en ny manuell fyndighet — inte
automatiskt av pipelinen.
