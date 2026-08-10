import { defineConfig } from 'astro/config';

// Handlingsvågen ligger på SÖKVÄGEN utlovat.se/handlingsvagen (b-0025, ersätter
// b-0021:s subdomän och återgår till b-0017:s ursprungliga topologi). Skälet
// b-0021 hade mot sökvägen — att den krävde en Cloudflare Worker som delar
// trafiken på path — gäller bara så länge vågarna bor i två repon. I ett repo
// är sökvägen bara en katalog i samma bygge.
//
// OBS: så länge repona ÄR två kan sajten inte serveras på sökvägen utan en
// Worker. Sammanslagningen måste därför ske vid eller före lanseringen — se
// SAMMANSLAGNING.md. Basstigen sätts redan nu så att alla interna länkar och
// alla grindar prövas mot den slutliga formen, långt före flytten.
//
// Statisk, inga inline-skript (CSP script-src 'self': klientkod ligger i
// public/). Alla interna länkar byggs ur import.meta.env.BASE_URL.
export default defineConfig({
  site: 'https://utlovat.se',
  base: '/handlingsvagen',
  output: 'static',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
});
