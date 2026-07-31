# Handlingsvågens sajt (HV4)

Statisk Astro-sajt som ligger på **sökvägen `utlovat.se/handlingsvagen`**
(b-0025, ersätter b-0021:s subdomän och återgår till b-0017:s sökväg).
Serveras av GitHub Pages bakom Cloudflares proxy, i samma bygge och på samma
domän som Fläskvågen — vilket betyder att sajten blir live först när repona
slås ihop (`SAMMANSLAGNING.md`). Privat tills dess.

## Bygg och testa

```sh
# 1. Vendora in ett slimmat utdrag ur valflask + räkna om domarna (från pipeline/)
cd ../pipeline
npm run vendor -- --promises ../../valflask/data/promises.json --parties ../../valflask/data/parties.json
npm run domar  -- --promises ../../valflask/data/promises.json

# 2. Bygg sajten (från site/)
cd ../site
npm install
npm test      # budget- och strukturgrindar
npm run build # → dist/ (skivade api/hv/*)
```

## Så är den byggd

- **Rutnätet (Vy 1)** — `src/pages/index.astro` renderar löfte × parti
  server-side; `public/hv-rutnat.js` lägger detaljpanel och filter ovanpå
  (CSP `script-src 'self'`, ingen inline-JS, inga CDN-skript).
- **Partisidan (Vy 2)** — `src/pages/parti/[kod].astro`: partiets löften med
  status + handlingar som gett utslag. **Ledamotssidan (Vy 3)** —
  `src/pages/ledamot/[id].astro` (425 sittande): meriter per löfte, frånvaro
  med kvittningsnot, avvikelse mot partilinjen. Index: `partier`, `ledamoter`.
- **Global sök (F3)** i sidhuvudet på alla sidor (`public/hv-sok.js`), eget
  index över löften, kategorier, partier och ledamöter — laddas vid fokus.
- **Filter (SKISS §3)** på rutnätet — parti, kategori, status, dokumenttyp,
  motionstyp, riksmöte — som URL-parametrar (`?parti=s&status=emot`), så varje
  urval är länkbart. Fasetterna ligger i `summary.json`; `public/hv-rutnat.js`
  speglar filtren mot URL:en. Partisidan har ett statusfilter
  (`public/hv-listfilter.js`).
- **Byggtidsskivning** — `src/pages/api/hv/*` skiver den incheckade datan
  till små JSON-filer; råfilerna (17 MB) skeppas aldrig. `src/lib/rutnat.ts`
  bygger modellen ur `data/domar.json`, `data/kopplingar.json`,
  `data/handlingar.json`, `data/loften-index.json` och `data/parties.json`.
- **Statusarna** skiljs på form, aldrig grön/röd, och ordet står alltid
  utskrivet (b-0018 F2). Tomma celler är ärliga och syns (F1).
- **Eget sökindex** (F3), inga beroenden, laddas först när fältet fokuseras.

Sajten byggs med basstigen `/handlingsvagen` (b-0025). Alla interna länkar,
sökets API-bas och favikonen byggs ur `import.meta.env.BASE_URL`, så adressen
finns på ett ställe — i `astro.config.mjs`. `dist/` är platt; innehållet läggs
under `/handlingsvagen` hos värden, inte i en katalog med det namnet i `dist`.
