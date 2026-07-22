# Handlingsvågens sajt (HV4)

Egen statisk Astro-sajt bakom Cloudflare på `drygast.nu/handlingsvagen`
(b-0017) — inte inbyggd i Fläskvågen. Privat tills lanseringsgrinden HV5.

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

`base: '/handlingsvagen'` gör att alla länkar och hämtningar ligger under
den stigen; `dist/` är platt och serveras under stigen av värden.
