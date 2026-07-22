import { defineConfig } from 'astro/config';

// Handlingsvågen är en EGEN Pages-sajt bakom Cloudflare på subdomänen
// handlingsvagen.drygast.nu (b-0021, ersätter b-0017:s sökväg) — serveras från
// roten, ingen basstig, ingen Worker. Statisk, inga inline-skript
// (CSP script-src 'self': klientkod ligger i public/).
export default defineConfig({
  site: 'https://handlingsvagen.drygast.nu',
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
});
