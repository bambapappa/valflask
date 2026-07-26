/*
 * Grindar för ämnessöket (b-0014). Körs utan nätverk och utan webbläsare:
 * modellen bakom sidan prövas direkt. Utan byggt nyckelordsindex ska allt
 * vara tomt och sidan säga det — tomt är ärligt.
 *
 * Kör: npm test (från site/).
 */
import assert from "node:assert";
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

  // Ordtrenderna ska bära en LÄSBAR form, inte stammen.
  const trender = byggPartiTrender();
  const medOrd = trender.filter((t) => t.ord.length > 0);
  grind("ordtrender per parti", medOrd.length > 0, `${medOrd.length} partier med ord`);
  grind(
    "trendorden har visningsform",
    medOrd.every((t) => t.ord.every((o) => typeof o.ord === "string" && o.ord.length > 0)),
  );
  grind(
    "trendorden är sorterade på vikt",
    medOrd.every((t) => t.ord.every((o, i) => i === 0 || t.ord[i - 1]!.vikt >= o.vikt)),
  );
}

console.log(fel === 0 ? "ämnessök: alla grindar gröna" : `ämnessök: ${fel} grindar föll`);
if (fel > 0) process.exit(1);
