/**
 * Ordöverlappet mellan ett löfte och en tabellrad.
 *
 * Delas av anslagstabellen (vad staten betalar ut) och inkomstberäkningen (vad
 * staten tar in). Båda ställer samma fråga — har tabellen en rad för just den
 * sak löftet gäller? — och den frågan får inte besvaras på två sätt beroende på
 * vilken tabell som råkar läsas. Repot har mätt tre gånger vad kopior kostar.
 *
 * **Överlappet är en läshjälp, inte ett svar.** Ett enda gemensamt ordled är
 * ofta ett sammanträffande i svenskans sammansättningar; talet finns just för
 * att den som väljer rad ska kunna se hur starkt överlappet är.
 */

/**
 * Hur många av löftets sakord som återkommer i radens namn.
 *
 * Svenska både sätter samman och böjer, så samma sak stavas olika: löftet säger
 * "idrottsanläggningar", ett anslag heter "Stöd till plats för idrott" och ett
 * annat "Stöd till idrotten". Ingen av dem är en delsträng av de andra —
 * "idrotten" ryms inte i "idrottsanläggningar" på grund av ändelsen. Därför
 * jämförs orden på sin **gemensamma början**: delar två ord sina första fem
 * tecken räknas de som samma sak.
 *
 * Mätt: utan det missade rangordningen anslaget med 225 miljoner kronor för
 * idrotten och föreslog indragning på ett löfte om idrottsanläggningar.
 */
export function delarSakord(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) {
    for (const y of b) {
      if (gemensamBorjan(x, y) >= 5) {
        n++;
        break;
      }
    }
  }
  return n;
}

/** Antalet tecken två ord delar från början. */
function gemensamBorjan(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Ord värda att matcha på: gemena, minst fyra tecken, utan de vanligaste fyllnadsorden. */
export function nyckelord(text: string): Set<string> {
  const stopp = new Set([
    "till", "vissa", "övrigt", "andra", "samt", "inom", "statens", "genom",
    "detta", "eller", "kronor", "miljoner", "miljarder", "anslag", "hela",
    "landet", "särskilt", "nationell", "verksamhet", "insatser", "åtgärder",
  ]);
  return new Set(
    (text.toLowerCase().match(/[a-zåäöéü]{4,}/g) ?? []).filter((o) => !stopp.has(o)),
  );
}

/** Hur många av löftets sakord radens namn delar. */
export function overlapp(radnamn: string, loftetext: string): number {
  return delarSakord(nyckelord(radnamn), nyckelord(loftetext));
}
