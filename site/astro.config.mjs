import { defineConfig } from 'astro/config';

// Handlingsvågen är en EGEN Pages-sajt bakom Cloudflare på
// drygast.nu/handlingsvagen (b-0017) — därav basstigen. Statisk, inga
// inline-skript (CSP script-src 'self': klientkod ligger i public/).
export default defineConfig({
  site: 'https://drygast.nu',
  base: '/handlingsvagen',
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
});
