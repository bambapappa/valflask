/**
 * Vaktar att läslistan över motiveringar som inte talar om sitt eget citat
 * bara krymper.
 *
 * Bevisbytet 7–8 augusti 2026 bytte citatet men inte förklaringen. Skulden
 * mättes 2026-08-22 och betas av i pass; taket finns för att den ska krympa
 * och inte växa tyst när nya kopplingar godkänns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  arProcedurcitat,
  egnaOrd,
  fingeravtryck,
  kvittensenGaller,
  laslistan,
  tackning,
  GLAPPTROSKEL,
  type Glappkvittens,
} from "../src/motiveringsglappet.ts";
import type { KopplingPost } from "../src/granskning.ts";

const ROT = resolve(import.meta.dirname, "../..");

const koppling = (method_note: string, citat: string): KopplingPost =>
  ({ id: "k-1", status: "aktiv", method_note, bevis: { citat } }) as KopplingPost;

test("verktygens egna noter räknas inte som motiveringens ord", () => {
  assert.equal(egnaOrd("Motionen yrkar på saken. Beviset byttes 2026-08-07 mot handlingens egen lydelse.").trim(), "Motionen yrkar på saken.");
  assert.equal(egnaOrd("Motionen yrkar. Motionens anslagsyrkande anvisar anslagen enligt tabellen.").trim(), "Motionen yrkar.");
  assert.equal(egnaOrd(undefined), "");
});

test("böjningsformer räknas som samma ord", () => {
  // Den första mätningen saknade stamning och räknade «punktmarkering» och
  // «punktmarkera» som skilda ord. Måttet ska följa registrets egna regler.
  const t = tackning(
    koppling(
      "Motionen föreslår punktmarkering av unga som riskerar kriminalitet.",
      "Riksdagen ställer sig bakom det som anförs i motionen om att punktmarkera unga på väg in i kriminalitet.",
    ),
  );
  assert.ok(t !== null && t >= GLAPPTROSKEL, `täckningen blev ${t} — böjningen slår igenom`);
});

test("en motivering som talar om något annat hamnar på listan", () => {
  const t = tackning(
    koppling(
      "Motionen föreslår grundlagsskydd för public service.",
      "Riksdagen ställer sig bakom det som anförs i motionen om ett nytt säkerhetspolitiskt läge och behovet av tryggad finansiering.",
    ),
  );
  assert.ok(t !== null && t < GLAPPTROSKEL, `täckningen blev ${t}`);
});

test("en för kort motivering mäts inte i stället för att mätas fel", () => {
  assert.equal(tackning(koppling("Samma sak.", "Ett citat om något helt annat och längre.")), null);
});

test("läslistan växer inte", () => {
  const tak = JSON.parse(readFileSync(resolve(ROT, "data/motiveringsglappet.json"), "utf8"));
  const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(ROT, "data/kopplingar.json"), "utf8"));
  const kvittenser = JSON.parse(
    readFileSync(resolve(ROT, "data/glappkvittenser.json"), "utf8"),
  ).kvittenser as Glappkvittens[];
  const nu = laslistan(kopplingar, { kvittenser });
  assert.ok(
    nu.length <= tak.laslistan,
    `${nu.length} motiveringar talar inte om sitt eget citat — taket är ${tak.laslistan}, mätt ` +
      `${tak.matt}. Betas listan av med \`npm run motivering\` ska taket sänkas i samma körning; ` +
      "växer den ska den nya posten läsas om, inte taket höjas.",
  );
  // Blankprovet: en tom lista över ett tomt register intygar ingenting.
  assert.ok(
    kopplingar.filter((k) => k.status === "aktiv").length > 500,
    "för få aktiva kopplingar lästa — provet mäter då ingenting",
  );
});

test("procedurcitaten är flyttade, inte avfärdade", () => {
  // Sänkningen 155 → 57 kom av en skärpt definition och inte av utfört arbete.
  // Utan det här provet ser en framtida läsare bara ett tak som föll, och kan
  // dra slutsatsen att listan betats av. De 95 finns kvar, i G5:s fråga.
  const tak = JSON.parse(readFileSync(resolve(ROT, "data/motiveringsglappet.json"), "utf8"));
  const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(ROT, "data/kopplingar.json"), "utf8"));
  const alla = laslistan(kopplingar, { medProcedurcitat: true });
  const skarpt = laslistan(kopplingar);
  assert.equal(
    alla.length - skarpt.length,
    tak.procedurcitat_flyttade,
    `${alla.length - skarpt.length} rader bär ett procedurcitat, taket säger ${tak.procedurcitat_flyttade}. ` +
      "Talet får sjunka när någon läser dem — det får inte tystna.",
  );
});

test("ett procedurcitat känns igen på formeln, inte på längden", () => {
  assert.ok(arProcedurcitat("Riksdagen avslår regeringens proposition."));
  assert.ok(arProcedurcitat("Utskottet ställer sig bakom regeringens förslag till extra ändringsbudget"));
  assert.equal(arProcedurcitat("Stödet till folkbildningen värnas."), false);
  assert.equal(
    arProcedurcitat("Vi står fast vid att biståndet ska vara 1 % av BNI och vill på sikt höja det."),
    false,
  );
});

test("en kvittens tar bort raden, men bara så länge motiveringen står still", () => {
  const k = koppling(
    "En motivering med helt andra ord än citatet bär, tillräckligt lång för att mätas.",
    "Ett citat om något annat.",
  ) as KopplingPost;
  k.id = "k-2026-9999";
  k.status = "aktiv";
  const kv: Glappkvittens = {
    id: "k-2026-9999",
    las: "2026-08-23",
    skal: "läst, motiveringen förklarar citatet riktigt med andra ord",
    motiveringens_fingeravtryck: fingeravtryck(k.method_note),
  };
  assert.deepEqual(laslistan([k], { kvittenser: [kv] }), [], "kvitterad rad ska försvinna");
  assert.deepEqual(laslistan([k]), ["k-2026-9999"], "utan kvittens ska den stå kvar");

  // Det avgörande ledet: en omskriven motivering får inte ärva kvittensen.
  const omskriven = { ...k, method_note: "En helt annan text som ingen har läst." };
  assert.equal(kvittensenGaller(kv, omskriven), false);
  assert.deepEqual(laslistan([omskriven], { kvittenser: [kv] }), ["k-2026-9999"]);
});

test("fingeravtrycket skiljer texter och är stabilt", () => {
  assert.equal(fingeravtryck("abc"), fingeravtryck("abc"));
  assert.notEqual(fingeravtryck("abc"), fingeravtryck("abd"));
  assert.equal(fingeravtryck(undefined), fingeravtryck(""));
  assert.match(fingeravtryck("något"), /^[0-9a-f]{8}$/u);
});
