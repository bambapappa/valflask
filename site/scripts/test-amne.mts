/*
 * Grindar för ämnessöket (b-0014). Körs utan nätverk och utan webbläsare:
 * modellen bakom sidan prövas direkt. Utan byggt nyckelordsindex ska allt
 * vara tomt och sidan säga det — tomt är ärligt.
 *
 * Kör: npm test (från site/).
 */
import assert from "node:assert";
import { sokStammar } from "../../pipeline/src/nyckelord.ts";
import { getPersoner } from "../src/lib/data.ts";
import {
  byggHandlingSkarva,
  byggOrdSkarva,
  byggPartiTrender,
  byggVagda,
  handlingSkarva,
  handlingSkarvor,
  indexFinns,
  MAX_PER_ORD,
  ordSkarva,
  ordSkarvor,
  getTermIndex,
} from "../src/lib/amne.ts";

let fel = 0;
function grind(namn: string, ok: boolean, detalj = "") {
  console.log(`${ok ? "✓" : "✗"} ${namn}${detalj ? `: ${detalj}` : ""}`);
  if (!ok) fel += 1;
}

// Skärvnycklarna måste vara stabila — de är webbadresser.
grind("ordskärva av stam", ordSkarva("kärnkraft") === "kä", ordSkarva("kärnkraft"));
grind("handlingsskärva av id", handlingSkarva("h-2026-12469") === "12", handlingSkarva("h-2026-12469"));
grind("okänt id hamnar i ovrigt", handlingSkarva("x") === "ovrigt");

// Vägda utslag ska bara omfatta granskade kopplingar — aldrig härledas ur
// att ett ord råkar stå i en text.
const vagda = byggVagda();
grind(
  "vägda bär bara riktning ur godkända kopplingar",
  Object.values(vagda).every((v) => v.riktning === "stodjer" || v.riktning === "motverkar"),
  `${Object.keys(vagda).length} handlingar`,
);

if (!indexFinns()) {
  // Utan index ska modellen vara tom, inte gissa.
  grind("utan index: inga ordskärvor", ordSkarvor().length === 0);
  grind("utan index: inga handlingsskärvor", handlingSkarvor().length === 0);
  grind("utan index: inga ordtrender", byggPartiTrender().every((t) => t.ord.length === 0));
  console.log("— nyckelordsindexet inte byggt: djupare grindar hoppas över");
} else {
  const nycklar = ordSkarvor();
  grind("ordskärvor finns", nycklar.length > 0, `${nycklar.length} skärvor`);

  // Varje ordskärva innehåller BARA stammar som hör till dess nyckel, och
  // postningslistorna är kapade — annars spränger ett vanligt ord nyttolasten.
  let allaHorHemma = true;
  let allaKapade = true;
  let allaSorterade = true;
  for (const nyckel of nycklar) {
    const skarva = byggOrdSkarva(nyckel);
    for (const [stam, post] of Object.entries(skarva)) {
      if (ordSkarva(stam) !== nyckel) allaHorHemma = false;
      if (post.i.length > MAX_PER_ORD) allaKapade = false;
      if (post.n < post.i.length) allaKapade = false;
      const kopia = [...post.i].sort().reverse();
      if (kopia.join() !== post.i.join()) allaSorterade = false;
    }
  }
  grind("varje stam ligger i rätt skärva", allaHorHemma);
  grind(`postningslistor kapade vid ${MAX_PER_ORD}, hela antalet bevarat`, allaKapade);
  grind("postningslistor i fallande id-ordning (nyast först)", allaSorterade);

  // Handlingsskärvorna ska täcka exakt de handlingar indexet känner till.
  let kort = 0;
  for (const nyckel of handlingSkarvor()) kort += Object.keys(byggHandlingSkarva(nyckel)).length;
  grind("handlingsskärvor täcker indexet", kort > 0, `${kort} handlingar`);

  // Indexet ska självt bära visningsformen. Faller den bort visar sidan
  // stammar ("bost", "vårdplat") — och eftersom modellen tyst faller
  // tillbaka på stammen måste grinden titta i indexet, inte på utfallet.
  let medForm = 0;
  for (const { y } of getTermIndex().values()) if (y && y.length > 0) medForm += 1;
  grind(
    "indexet bär visningsform per term",
    medForm === getTermIndex().size,
    `${medForm} av ${getTermIndex().size} handlingar`,
  );

  // Ordtrenderna ska bära en LÄSBAR form, inte stammen.
  const trender = byggPartiTrender();
  const medOrd = trender.filter((t) => t.ord.length > 0);
  grind("ordtrender per parti", medOrd.length > 0, `${medOrd.length} partier med ord`);
  // Ingen grind på "ordet är en icke-tom sträng" här: modellen faller tyst
  // tillbaka på stammen, så en sådan grind blir grön även när formen saknas.
  // Egenskapen prövas i indexgrinden ovan i stället — vid källan.
  grind(
    "trendorden är sorterade på vikt",
    medOrd.every((t) => t.ord.every((o, i) => i === 0 || t.ord[i - 1]!.vikt >= o.vikt)),
  );

  // Ordtrenderna ska visa POLITIK, inte personer. Ett dokuments
  // undertecknare står i varje dokument den ledamoten skrivit under och i
  // nästan inga andra — alltså precis det mönster ordvikten belönar högst.
  // Slinker namnen igenom blir partiets "utmärkande ord" dess egna
  // ledamöters efternamn, vilket inte säger en läsare någonting.
  const namnord = new Set<string>();
  for (const p of getPersoner()) {
    for (const del of p.namn.toLowerCase().split(/[^a-zåäöéü-]+/u)) {
      if (del.length >= 4) namnord.add(del);
    }
  }
  const namnITrend: string[] = [];
  for (const t of trender) {
    for (const o of t.ord) {
      if (namnord.has(o.ord.toLowerCase()) || namnord.has(o.stam)) {
        namnITrend.push(`${t.kod}:${o.ord}`);
      }
    }
  }
  grind(
    "ordtrenderna bär inga ledamotsnamn",
    namnITrend.length === 0,
    namnITrend.slice(0, 8).join(" "),
  );

  // Formen läsaren råkar skriva får inte avgöra träffen. "skolan" och
  // "skola" ska ge samma handlingar — det är hela poängen med att söka på
  // ordets alla former i stället för bara stammen.
  const inverterat = new Map<string, Set<string>>();
  for (const [id, { t }] of getTermIndex()) {
    for (const stam of new Set(t)) {
      const lista = inverterat.get(stam) ?? new Set<string>();
      lista.add(id);
      inverterat.set(stam, lista);
    }
  }
  function traffar(ord: string): Set<string> {
    const ut = new Set<string>();
    for (const stam of sokStammar(ord)) for (const id of inverterat.get(stam) ?? []) ut.add(id);
    return ut;
  }
  const PAR: [string, string][] = [
    ["skola", "skolan"],
    ["försvar", "försvaret"],
    ["vård", "vården"],
    ["kommun", "kommunen"],
  ];
  let allaLika = true;
  const avvikelser: string[] = [];
  for (const [grund, bestamd] of PAR) {
    const a = traffar(grund);
    const b = traffar(bestamd);
    if (a.size !== b.size || [...a].some((id) => !b.has(id))) {
      allaLika = false;
      avvikelser.push(`${grund}=${a.size} ≠ ${bestamd}=${b.size}`);
    }
  }
  grind("bestämd och obestämd form ger samma träffar", allaLika, avvikelser.join(", "));
}

console.log(fel === 0 ? "ämnessök: alla grindar gröna" : `ämnessök: ${fel} grindar föll`);
if (fel > 0) process.exit(1);
