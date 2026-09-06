/**
 * adressen.ts — adressens jämförbara form.
 *
 * En adress används till två skilda saker, och de ska inte blandas ihop. Den
 * ena är att HÄMTA en sida: då gäller adressen precis som källan skrev den.
 * Den andra är att avgöra om två adresser pekar på SAMMA sida. Det här är den
 * andra. Formen hämtas aldrig och publiceras aldrig — det som står i ett löfte
 * eller i sedd-registret är källans egen adress, oförändrad.
 *
 * BAKGRUNDEN (2026-09-06). `sd.se` och `www.sd.se` är två adresser till samma
 * sidor: `https://sd.se/sitemap.xml` svarar 301 och landar på `www.sd.se`,
 * medan partiets egna delkartor skriver ut `www`. Sedd-registret hashade
 * adressen tecken för tecken, så samma sida under två stavningar var två sidor
 * för oss — den ena läst, den andra oläst.
 *
 * Mätt i `data/seen.json` samma dag: 199 adresser på `www.sd.se`, 11 på
 * `sd.se`, och EN sida läst under båda stavningarna. Det var litet därför att
 * A–Ö:t var stängt — vi läste sex sidor hos SD. Med de 245 sidorna öppnade blir
 * ytan fyrtio gånger större, och två stavningar av samma sida betyder då två
 * skördar av samma politik: en gång LLM-arbete i onödan, och en kandidat till
 * som en människa ska läsa och känna igen som en dubblett.
 *
 * REGELN GÄLLDE REDAN PÅ ETT STÄLLE. `partiForUrl` i `skordeordning.ts` har
 * räknat täckning utan `www.` sedan täckningsordningen skrevs — annars hade
 * `sd.se` och `www.sd.se` varit två olika partier. Att den formen bara fanns
 * där gjorde den inte mindre sann på de andra ställena; den var bara oskriven.
 * Här är den skriven en gång, och används överallt där en adress är en
 * identitet.
 *
 * VAD SOM UTJÄMNAS, OCH INGET MER:
 *
 *  • `www.` ur värdnamnet. Alla åtta partisajter svarar på båda stavningarna.
 *  • Avslutande snedstreck. Katalogen och våra egna listor är oense om det —
 *    samma sida skrivs `…/politik/jakt` på ett ställe och `…/politik/jakt/` på
 *    ett annat. Utan utjämningen missar ett riktat urval sidan det pekar på,
 *    tyst.
 *  • Versaler i schema och värdnamn, som `URL` gör av sig själv.
 *
 * Frågesträng och sidankare står kvar. Ankaret bär betydelse hos oss: en PDF
 * som delas i bitar får en artikel per `#page`, och de är olika sidor.
 */

/**
 * Adressens jämförbara form. Går adressen inte att tolka returneras den trimmad
 * och utan avslutande snedstreck — en obegriplig adress ska inte kasta här,
 * för då faller en hel körning på en trasig länk i en delkarta.
 */
export function kanoniskAdress(url: string): string {
  const trimmad = url.trim();
  let u: URL;
  try {
    u = new URL(trimmad);
  } catch {
    return trimmad.replace(/\/+$/u, "");
  }
  u.hostname = u.hostname.replace(/^www\./u, "");
  u.pathname = u.pathname.replace(/\/+$/u, "");
  return u.toString();
}
