/**
 * Bygger nyckelordsindexet (b-0014, andra halvan).
 *
 * Hämtar varje handlings dokumenttext, utvinner termerna deterministiskt
 * och skriver dem skärvat till data/nyckelord/<NN>.json. **Fulltexterna
 * lagras aldrig** — bara de utvunna termerna, precis som b-0014 säger.
 *
 * Inga språkmodellanrop: termerna räknas fram i kod. Indexbygget kostar
 * alltså ingenting av modellkvoten.
 *
 * Återupptagbart: redan indexerade handlingar hoppas över, och varje
 * skärva sparas löpande. En avbruten körning fortsätter där den slutade.
 *
 * Voteringar har ingen egen dokumenttext — deras sak står i betänkandet som
 * röstningen gällde. Betänkandena indexeras därför i en egen skärva under
 * samma nyckel som voteringens dok_id ("202223:SkU2"), så en sökning på ett
 * ämne också kan svara på hur partierna RÖSTADE i frågan.
 *
 *   npm run nyckelord -- [--limit N] [--max-termer 40] [--om]
 *
 *   --limit N        indexera högst N handlingar denna körning
 *   --max-termer N   antal termer som sparas per dokument (default 40)
 *   --om             indexera om även det som redan finns
 *
 * Nätblockerat i sessionscontainern (data.riksdagen.se nekas) — körs som
 * Actions-workflow (nyckelord.yml) eller från en session med öppen väg.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import { fetchDokumentText } from "../src/riksdagen.ts";
import { politeFetch } from "./hamta.mts";
import {
  betankandeNyckel,
  namnOrd,
  skarvaFor,
  utvinnTermer,
  type DokumentTermer,
  type Skarva,
} from "../src/nyckelord.ts";

const ROT = resolve(import.meta.dirname, "../..");
const INDEXKATALOG = join(ROT, "data/nyckelord");

function parseArgs(argv: string[]) {
  let limit = Infinity;
  let maxTermer = 40;
  let om = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--limit") limit = Number(argv[++i]);
    else if (a === "--max-termer") maxTermer = Number(argv[++i]);
    else if (a === "--om") om = true;
  }
  return { limit, maxTermer, om };
}

/** Läser in alla skärvor som redan finns. */
function lasSkarvor(): Map<string, Skarva> {
  const skärvor = new Map<string, Skarva>();
  if (!existsSync(INDEXKATALOG)) return skärvor;
  for (const fil of readdirSync(INDEXKATALOG)) {
    if (!fil.endsWith(".json")) continue;
    const namn = fil.replace(/\.json$/u, "");
    skärvor.set(namn, JSON.parse(readFileSync(join(INDEXKATALOG, fil), "utf8")) as Skarva);
  }
  return skärvor;
}

function skrivSkarva(namn: string, skärva: Skarva): void {
  mkdirSync(INDEXKATALOG, { recursive: true });
  // Nycklarna sorteras så att diffen blir läsbar och ordningen stabil
  // mellan körningar — indexet ska gå att granska i git-historiken.
  const sorterat: Record<string, DokumentTermer> = {};
  for (const id of Object.keys(skärva.handlingar).sort()) {
    sorterat[id] = skärva.handlingar[id]!;
  }
  writeFileSync(
    join(INDEXKATALOG, `${namn}.json`),
    JSON.stringify({ version: 1, handlingar: sorterat }, null, 2) + "\n",
  );
}

async function main() {
  const { limit, maxTermer, om } = parseArgs(process.argv.slice(2));
  const handlingar: Handling[] = JSON.parse(
    readFileSync(join(ROT, "data/handlingar.json"), "utf8"),
  );
  const skärvor = lasSkarvor();

  const redanIndexerad = (id: string): boolean => {
    const s = skärvor.get(skarvaFor(id));
    return !!s && id in s.handlingar;
  };

  // Voteringar har ingen egen dokumenttext — deras sak står i betänkandet
  // som röstningen gällde. Betänkandena indexeras därför för sig, under
  // samma nyckel som voteringens dok_id, så en sökning på ett ämne också
  // kan svara på hur partierna RÖSTADE i frågan.
  const betankanden: { dok_id: string; rm: string; beteckning: string }[] = JSON.parse(
    readFileSync(join(ROT, "data/betankanden.json"), "utf8"),
  );
  const betAttGora = betankanden.filter(
    (b) => om || !redanIndexerad(betankandeNyckel(b.rm, b.beteckning)),
  );

  const attGora = handlingar.filter(
    (h) => h.kind !== "votering" && (om || !redanIndexerad(h.id)),
  );

  console.log(
    `handlingar: ${handlingar.length} | med dokumenttext: ${
      handlingar.filter((h) => h.kind !== "votering").length
    } | kvar att indexera: ${attGora.length}`,
  );
  console.log(
    `betänkanden: ${betankanden.length} (textkälla för ${
      handlingar.filter((h) => h.kind === "votering").length
    } voteringar) | kvar att indexera: ${betAttGora.length}`,
  );
  if (attGora.length === 0 && betAttGora.length === 0) {
    console.log("Indexet är komplett — inget att göra.");
    return;
  }

  let klara = 0;
  let fel = 0;
  const orörda = new Set<string>();

  for (const h of attGora) {
    if (klara + fel >= limit) break;
    try {
      const text = await fetchDokumentText(politeFetch, h.dok_id);
      // Dokumentets egna undertecknare hålls utanför termerna — annars blir
      // partiets mest utmärkande ord dess ledamöters efternamn.
      const termer = utvinnTermer(text, maxTermer, namnOrd(h.persons));
      const namn = skarvaFor(h.id);
      const skärva = skärvor.get(namn) ?? { version: 1 as const, handlingar: {} };
      skärva.handlingar[h.id] = termer;
      skärvor.set(namn, skärva);
      orörda.add(namn);
      klara += 1;
      // Delspara per skärva med jämna mellanrum: en avbruten körning ska
      // aldrig kasta bort hämtningar som redan gjorts.
      if (klara % 50 === 0) {
        for (const n of orörda) skrivSkarva(n, skärvor.get(n)!);
        orörda.clear();
        console.log(`  ${klara} indexerade (${fel} fel) — delsparat`);
      }
    } catch (e) {
      fel += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ${h.id} (${h.dok_id}): ${msg}`);
    }
  }

  // Betänkandena: samma utvinning, egen skärva. Ingen undertecknarlista att
  // filtrera — ett betänkande är utskottets text, inte en ledamots.
  let betKlara = 0;
  let betFel = 0;
  for (const b of betAttGora) {
    if (klara + fel + betKlara + betFel >= limit) break;
    try {
      const text = await fetchDokumentText(politeFetch, b.dok_id);
      const nyckel = betankandeNyckel(b.rm, b.beteckning);
      const namn = skarvaFor(nyckel);
      const skärva = skärvor.get(namn) ?? { version: 1 as const, handlingar: {} };
      skärva.handlingar[nyckel] = utvinnTermer(text, maxTermer);
      skärvor.set(namn, skärva);
      orörda.add(namn);
      betKlara += 1;
      if (betKlara % 50 === 0) {
        for (const n of orörda) skrivSkarva(n, skärvor.get(n)!);
        orörda.clear();
        console.log(`  ${betKlara} betänkanden indexerade (${betFel} fel) — delsparat`);
      }
    } catch (e) {
      betFel += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  betänkande ${b.rm}:${b.beteckning} (${b.dok_id}): ${msg}`);
    }
  }

  for (const n of orörda) skrivSkarva(n, skärvor.get(n)!);
  console.log(`betänkanden: ${betKlara} indexerade, ${betFel} fel`);

  const totalt = [...skärvor.values()].reduce(
    (s, skärva) => s + Object.keys(skärva.handlingar).length,
    0,
  );
  console.log(
    `klart: ${klara} indexerade, ${fel} fel — indexet omfattar nu ${totalt} handlingar i ${skärvor.size} skärvor`,
  );
  // Fel på enstaka dokument (borttagna, utan html) får inte fälla bygget:
  // det som hämtats är sparat och nästa körning tar resten.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
