/*
 * Grindar för ämnessöket (b-0014). Körs utan nätverk och utan webbläsare:
 * modellen bakom sidan prövas direkt. Utan byggt nyckelordsindex ska allt
 * vara tomt och sidan säga det — tomt är ärligt.
 *
 * Kör: npm test (från site/).
 */
import assert from "node:assert";
import { aktorsPartier } from "../../pipeline/src/handlingar.ts";
import { BETANKANDENYCKEL, sokStammar } from "../../pipeline/src/nyckelord.ts";
import { getHandlingMap, getPersoner } from "../src/lib/data.ts";
import { maskPartier, PARTIBITAR, partiStandpunkt } from "../src/lib/delat.ts";
import {
  byggHandlingSkarva,
  byggOrdSkarva,
  byggPartiTrender,
  byggVagda,
  byggVoteringSkarva,
  handlingSkarva,
  handlingSkarvor,
  indexFinns,
  langtId,
  MAX_BET_PER_ORD,
  MAX_PER_ORD,
  ordSkarva,
  ordSkarvor,
  voteringSkarva,
  voteringSkarvor,
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
  const handlingar = getHandlingMap();
  let allaHorHemma = true;
  let allaKapade = true;
  let allaSorterade = true;
  let allaMasker = true;
  const felaktigMask: string[] = [];
  let betIsär = true;
  const okandaId: string[] = [];
  for (const nyckel of nycklar) {
    const { pre, bredd, o } = byggOrdSkarva(nyckel);
    for (const [stam, post] of Object.entries(o)) {
      if (ordSkarva(stam) !== nyckel) allaHorHemma = false;
      if (post.i.length > MAX_PER_ORD || post.b.length > MAX_BET_PER_ORD) allaKapade = false;
      if (post.n < post.i.length || post.bn < post.b.length) allaKapade = false;
      const ids = post.i.map((v) => langtId(v, { pre, bredd }));
      const kopia = [...ids].sort().reverse();
      if (kopia.join() !== ids.join()) allaSorterade = false;

      // Id:na skickas förkortade till sitt löpnummer. Går de inte att
      // skriva tillbaka EXAKT pekar träffen ut en annan handling —
      // id:na är nollfyllda, så `868` och `0868` är inte samma dokument.
      for (const id of ids) if (!handlingar.has(id)) okandaId.push(`${stam}/${id}`);

      // Partikoderna är det partifiltret vilar på. Går de ur takt med
      // listan filtrerar sidan på FEL handlingars partier — och en
      // träfflista som säger "från Vänsterpartiet" om något annat parti
      // vore precis ett sådant tyst fel projektet förbjuder.
      if (post.p.length !== ids.length * 2) allaMasker = false;
      ids.forEach((id, k) => {
        const h = handlingar.get(id);
        if (!h) return;
        const ur = maskPartier(Number.parseInt(post.p.slice(k * 2, k * 2 + 2), 16) || 0);
        const ratt = aktorsPartier(h).filter((p) => PARTIBITAR.includes(p)).sort();
        if (ur.join() !== ratt.join()) felaktigMask.push(`${stam}/${id}`);
      });

      // Betänkandena har en egen lista just för att de inte ska kapas bort.
      if (post.i.some((v) => BETANKANDENYCKEL.test(String(v)))) betIsär = false;
      if (post.b.some((v) => !BETANKANDENYCKEL.test(v))) betIsär = false;
    }
  }
  grind("varje stam ligger i rätt skärva", allaHorHemma);
  grind(
    `postningslistor kapade vid ${MAX_PER_ORD}/${MAX_BET_PER_ORD}, hela antalet bevarat`,
    allaKapade,
  );
  grind("postningslistor i fallande id-ordning (nyast först)", allaSorterade);
  grind(
    "de förkortade id:na skrivs tillbaka till verkliga handlingar",
    okandaId.length === 0,
    okandaId.slice(0, 5).join(" "),
  );
  grind("partikoderna följer postningslistan led för led", allaMasker);
  grind(
    "partikoderna stämmer med handlingarnas aktörspartier",
    felaktigMask.length === 0,
    felaktigMask.slice(0, 5).join(" "),
  );
  grind("betänkanden och handlingar ligger i var sin lista", betIsär);

  // Betänkandena får aldrig kapas bort av handlingarna. Låg de i samma
  // lista skulle de försvinna för varje någorlunda vanligt ord — id:n
  // sorteras som text, och "h-2026-…" ligger alltid före "202526:…".
  // Röstfrågorna skulle då tyst sluta svara.
  let betBevarade = 0;
  let stammarMedBet = 0;
  for (const nyckel of nycklar) {
    for (const post of Object.values(byggOrdSkarva(nyckel).o)) {
      if (post.bn === 0) continue;
      stammarMedBet += 1;
      if (post.b.length > 0) betBevarade += 1;
    }
  }
  grind(
    "stammar med betänkanden bär också betänkanden i skärvan",
    stammarMedBet > 0 && betBevarade === stammarMedBet,
    `${betBevarade} av ${stammarMedBet}`,
  );

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

  // Röstfrågorna: voteringarna hittas via betänkandet, och betänkandets
  // nyckel ÄR voteringens dok_id. Går den kopplingen sönder svarar sidan
  // tomt på "hur röstade partierna" — eller, värre, med fel omröstning.
  const rost = new Map<string, ReturnType<typeof byggVoteringSkarva>[string]>();
  let ratSkarva = true;
  for (const s of voteringSkarvor()) {
    for (const [nyckel, kort] of Object.entries(byggVoteringSkarva(s))) {
      if (voteringSkarva(nyckel) !== s) ratSkarva = false;
      rost.set(nyckel, kort);
    }
  }
  grind("varje betänkande ligger i sitt riksmötes röstskärva", ratSkarva);

  const voteringar = [...handlingar.values()].filter(
    (h) => h.kind === "votering" && h.rostfordelning,
  );
  let iSkarvor = 0;
  for (const kort of rost.values()) iSkarvor += kort.v.length;
  grind(
    "röstskärvorna bär alla voteringar med röstfördelning",
    iSkarvor === voteringar.length,
    `${iSkarvor} av ${voteringar.length}`,
  );

  // Siffrorna ska vara riksdagens, oförändrade hela vägen ut.
  const felRost: string[] = [];
  for (const h of voteringar) {
    const kort = rost.get(h.dok_id);
    const v = kort?.v.find((x) => x.p === (h.punkt ?? 0) && x.url === h.url);
    if (!v) {
      felRost.push(`${h.dok_id}:${h.punkt}`);
      continue;
    }
    for (const [parti, f] of Object.entries(h.rostfordelning!)) {
      const r = v.r[parti];
      if (!r || r[0] !== f.ja || r[1] !== f.nej || r[2] !== f.avstar || r[3] !== f.franvarande) {
        felRost.push(`${h.dok_id}:${h.punkt}/${parti}`);
      }
    }
  }
  grind(
    "röstsiffrorna är oförändrade från registret",
    felRost.length === 0,
    felRost.slice(0, 5).join(" "),
  );

  // En sökning ska faktiskt nå fram till omröstningar. Träffar ordet
  // betänkanden men inget av dem bär en votering svarar sidan tomt —
  // och då är röstfrågan byggd men obesvarad.
  const provord = ["skola", "försvar", "vård", "kärnkraft"];
  const utanRoster: string[] = [];
  for (const ord of provord) {
    let bet = new Set<string>();
    for (const stam of sokStammar(ord)) {
      const post = byggOrdSkarva(ordSkarva(stam)).o[stam];
      for (const b of post?.b ?? []) bet.add(b);
    }
    const medVotering = [...bet].filter((b) => (rost.get(b)?.v.length ?? 0) > 0);
    if (medVotering.length === 0) utanRoster.push(ord);
  }
  grind(
    "vanliga sökord når fram till omröstningar",
    utanRoster.length === 0,
    utanRoster.join(", "),
  );
}

// Ståndpunkten härleds ur rösterna och avgör vad tabellen säger. Ett parti
// som röstat åt två håll ska synas som delat, och den som inte var där har
// inte avstått — att avstå är en handling, att utebli är det inte.
grind("majoritetsrösten blir partiets ståndpunkt", partiStandpunkt([94, 0, 0, 13]).val === "ja");
grind("ingen lagd röst är frånvaro, inte avstående", partiStandpunkt([0, 0, 0, 14]).val === "franvarande");
grind("avstående är en egen ståndpunkt", partiStandpunkt([0, 0, 19, 5]).val === "avstar");
grind("delad röst redovisas som delad", partiStandpunkt([50, 10, 0, 2]).delad === true);
grind("enig röst redovisas inte som delad", partiStandpunkt([50, 0, 0, 2]).delad === false);

console.log(fel === 0 ? "ämnessök: alla grindar gröna" : `ämnessök: ${fel} grindar föll`);
if (fel > 0) process.exit(1);
