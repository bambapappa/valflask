/*
 * Grindar för det breda söket — riksdagens egen träfflista.
 *
 * Körs utan nätverk: modulen bygger adresser och tolkar svar, inget annat,
 * och svaren här är sparade utdrag ur riktiga svar från data.riksdagen.se
 * (hämtade 2026-08-10). Antalen som nämns i kommentarerna är mätta samma
 * dag mot samma tjänst.
 *
 * Kör: npm test (från site/).
 */
import assert from "node:assert";
import { sokStammar } from "../../pipeline/src/nyckelord.ts";
import {
  byggFraga,
  byggSoksidaAdress,
  MANDATPERIODENS_START,
  MINSTA_TRUNKERING,
  sokterm,
  tolkaSvar,
} from "../src/lib/riksdagssok.ts";

let fel = 0;
function grind(namn: string, ok: boolean, detalj = "") {
  console.log(`${ok ? "✓" : "✗"} ${namn}${detalj ? `: ${detalj}` : ""}`);
  if (!ok) fel += 1;
}

console.log("=== Grind: söktermen speglar vår egen stamning ===");

// Den kortaste stammen är den mest omfattande: "skol" når både "skola" och
// "skolor", "skolan" bara sig själv.
grind("kortaste stammen väljs", sokterm(sokStammar("skolan")) === "skol*", sokterm(sokStammar("skolan")));
grind("samma term oavsett skriven form", sokterm(sokStammar("skolor")) === sokterm(sokStammar("skolan")));
grind("sammansättning trunkeras", sokterm(sokStammar("vårdplatser")) === "vårdplats*");

// Korta ord trunkeras aldrig. Mätt: `eu` gav 2 387 motioner och `eu*` 3 356
// — tusen träffar på "euro" och "europeisk" som läsaren inte bad om.
grind("eu trunkeras inte", sokterm(sokStammar("eu")) === "eu", sokterm(sokStammar("eu")));
grind("npf trunkeras inte", sokterm(sokStammar("npf")) === "npf", sokterm(sokStammar("npf")));
grind("gränsen är fyra tecken", MINSTA_TRUNKERING === 4);
grind("tom stamlista ger tom term", sokterm([]) === "");

console.log("\n=== Grind: frågan bär mandatperioden och läsarens filter ===");

const enkel = byggFraga({ ord: [sokStammar("kärnkraft")], tom: "2026-08-10", sz: 20 });
const p = new URL(enkel).searchParams;
grind("fönstret börjar vid mandatperioden", p.get("from") === MANDATPERIODENS_START, p.get("from") ?? "");
grind("mandatperioden börjar 2022-09-26", MANDATPERIODENS_START === "2022-09-26");
grind("fönstret slutar där sidan säger", p.get("tom") === "2026-08-10");
grind("nyast först", p.get("sort") === "datum" && p.get("sortorder") === "desc");
grind("json som förval", p.get("utformat") === "json");
grind("inget partifilter utan kryss", !enkel.includes("parti="));

// Riksdagen snittar flera ord precis som vi: "kärnkraft" gav 190 motioner,
// "vårdplatser" 66, och de två tillsammans 9.
const tva = byggFraga({
  ord: [sokStammar("kärnkraft"), sokStammar("vårdplatser")],
  tom: "2026-08-10",
});
grind(
  "flera ord blir flera termer",
  new URL(tva).searchParams.get("sok") === "kärnkraft* vårdplats*",
  new URL(tva).searchParams.get("sok") ?? "",
);

const filtrerad = byggFraga({
  ord: [sokStammar("kärnkraft")],
  partier: ["s", "sd"],
  tom: "2026-08-10",
});
grind(
  "varje ikryssat parti följer med",
  new URL(filtrerad).searchParams.getAll("parti").join(",") === "s,sd",
);

grind(
  "läsarens länk ger samma träffmängd",
  (() => {
    const lank = new URL(byggSoksidaAdress({ ord: [sokStammar("kärnkraft")], tom: "2026-08-10" }));
    const data = new URL(enkel);
    return (
      lank.searchParams.get("utformat") === "html" &&
      lank.searchParams.get("sok") === data.searchParams.get("sok") &&
      lank.searchParams.get("from") === data.searchParams.get("from") &&
      lank.searchParams.get("tom") === data.searchParams.get("tom")
    );
  })(),
);

console.log("\n=== Grind: svaret tolkas utan att något hittas på ===");

// Utdrag ur ett riktigt svar. Två dokument: ett med intressenter och ett
// utan, för det senare är vad betänkanden och protokoll ser ut som.
const SVAR = {
  dokumentlista: {
    "@traffar": "1607",
    "@nasta_sida": "http://data.riksdagen.se/dokumentlista/?p=2&sok=k%C3%A4rnkraft",
    dokument: [
      {
        dok_id: "HD024041",
        doktyp: "mot",
        dokumentnamn: "Motion",
        rm: "2025/26",
        datum: "2026-04-01 00:00:00",
        titel: "med anledning av prop. 2025/26:193",
        organ: "UbU",
        dokintressent: {
          intressent: [
            { namn: "A", partibet: "S" },
            { namn: "B", partibet: "s" },
          ],
        },
      },
      {
        dok_id: "HEB343",
        doktyp: "sou",
        dokumentnamn: "Statens offentliga utredningar",
        datum: "2026-07-10",
        titel: "Åtgärder mot överskuldsättning",
        organ: "",
      },
    ],
  },
};

const tolkat = tolkaSvar(SVAR);
grind("hela antalet läses, inte radantalet", tolkat.traffar === 1607, String(tolkat.traffar));
grind("båda dokumenten kommer med", tolkat.dokument.length === 2);

const [motion, sou] = tolkat.dokument;
grind("riksdagens eget namn på sorten används", motion!.sort === "Motion");
grind("datum kapas till dagen", motion!.datum === "2026-04-01", motion!.datum);
grind("adressen pekar på dokumentet", motion!.url === "https://data.riksdagen.se/dokument/HD024041");
grind("partier blir gemena och unika", motion!.partier.join(",") === "s", motion!.partier.join(","));
grind("utskottet följer med", motion!.organ === "UbU");
grind("dokument utan intressent får tom partilista", sou!.partier.length === 0);
grind("tomt organ blir inget organ", sou!.organ === undefined);

// Fällan som redan kostat pipelinen tid: nästa sida kommer som http.
grind(
  "nästa sida tvingas till https",
  tolkat.nastaUrl === "https://data.riksdagen.se/dokumentlista/?p=2&sok=k%C3%A4rnkraft",
  tolkat.nastaUrl ?? "",
);

grind(
  "sista sidan har ingen nästa",
  tolkaSvar({ dokumentlista: { "@traffar": "0" } }).nastaUrl === null,
);
grind("tomt svar ger tom lista", tolkaSvar({ dokumentlista: {} }).dokument.length === 0);

// Ett dokument utan id går inte att länka till, och en träff som leder fel
// är värre än en träff som uteblir.
grind(
  "dokument utan id tas bort",
  tolkaSvar({ dokumentlista: { dokument: [{ doktyp: "mot" }] } }).dokument.length === 0,
);

// Ett svar som inte är en dokumentlista ska säga ifrån, inte tolkas tomt:
// en tyst tom lista skulle se ut som "inga träffar".
grind(
  "svar utan dokumentlista kastar",
  (() => {
    try {
      tolkaSvar({ nagot: "annat" });
      return false;
    } catch {
      return true;
    }
  })(),
);

// Ett enda dokument kommer som objekt, inte som lista — riksdagens json
// gör så, och pipelinen har samma skydd.
grind(
  "ensamt dokument tolkas som lista",
  tolkaSvar({
    dokumentlista: { dokument: { dok_id: "X1", doktyp: "mot", datum: "2026-01-01" } },
  }).dokument.length === 1,
);

// Utan dokumentnamn står riksdagens kod kvar. Vi hittar aldrig på ett namn
// för en sort vi inte känner.
grind(
  "okänd sort behåller sin kod",
  tolkaSvar({ dokumentlista: { dokument: { dok_id: "X1", doktyp: "nytt-slag" } } }).dokument[0]!
    .sort === "nytt-slag",
);

assert.strictEqual(fel, 0, `${fel} grind(ar) föll`);
console.log("\nriksdagssöket: alla grindar gröna");
