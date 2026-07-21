import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlTillText } from "../src/riksdagen.ts";
import {
  byggPrompt,
  motionstypAvHandling,
  nyckelord,
  parseForslagSvar,
  rankaKandidater,
  rankaVoteringsKandidater,
  skapaForslag,
  type Lofte,
} from "../src/foreslag.ts";
import type { Betankande } from "../src/betankanden.ts";
import { LAGE_A_FONSTER } from "../src/grindar.ts";
import type { Handling } from "../src/handlingar.ts";
import type { LlmClient } from "../src/llm.ts";

const lofte: Lofte = {
  id: "p-2026-0042",
  title: "Höj taket i a-kassan",
  quote: "Vi vill höja taket i arbetslöshetsförsäkringen.",
  parties: ["v"],
  category: "arbetsmarknad",
};

function handling(over: Partial<Handling> = {}): Handling {
  return {
    id: "h-2026-0001",
    kind: "motion",
    dok_id: "HD021234",
    datum: "2024-10-03",
    parties: ["v"],
    persons: [
      { name: "A", party: "v", riksdagen_id: "1" },
      { name: "B", party: "v", riksdagen_id: "2" },
    ],
    titel: "Höja taket i arbetslöshetsförsäkringen",
    url: "https://data.riksdagen.se/dokument/HD021234",
    archive_url: null,
    ...over,
  };
}

const kalltext =
  "Riksdagen ställer sig bakom det som anförs i motionen om att taket i " +
  "arbetslöshetsförsäkringen bör höjas och tillkännager detta för regeringen.";

test("htmlTillText: taggar bort, entiteter avkodade, whitespace utjämnat", () => {
  const html = "<style>p{}</style><p>Taket &amp; golvet\n bör  h&ouml;jas &#8211; nu &#x2013; s&auml;ger vi.</p>";
  assert.equal(htmlTillText(html), "Taket & golvet bör höjas – nu – säger vi.");
});

test("nyckelord: gemener, stoppord bort, korta ord bort", () => {
  const ord = nyckelord("Vi vill höja taket i arbetslöshetsförsäkringen");
  assert.ok(ord.has("taket") && ord.has("höja") && ord.has("arbetslöshetsförsäkringen"));
  assert.ok(!ord.has("vi")); // för kort
  assert.ok(!nyckelord("att och det som").size); // bara stoppord
});

test("rankaKandidater: ordöverlapp, voteringar och fel parti utelämnas", () => {
  const bra = handling();
  const votering = handling({ id: "h-2026-0002", kind: "votering", titel: "Votering AU10 punkt 3", dok_id: "202425:AU10" });
  const felParti = handling({ id: "h-2026-0003", parties: ["sd"], persons: [] });
  const orelaterad = handling({ id: "h-2026-0004", titel: "Fler poliser i hela landet" });
  const kandidater = rankaKandidater(lofte, [orelaterad, felParti, votering, bra], 5);
  assert.deepEqual(kandidater.map((k) => k.handling.id), ["h-2026-0001"]);
  assert.ok(kandidater[0]!.poang >= 2);
});

test("motionstypAvHandling: riksdagens klassning vinner, annars gissning ur antal namn", () => {
  assert.equal(motionstypAvHandling(handling({ motionstyp: "parti" })), "parti"); // riksdagens facit
  assert.equal(motionstypAvHandling(handling({ motionstyp: "enskild" })), "enskild"); // även om två namn
  assert.equal(motionstypAvHandling(handling()), "kommitte"); // ingen klassning → gissa ur >1 namn
  assert.equal(motionstypAvHandling(handling({ persons: [{ name: "A", party: "v" }] })), "enskild");
  assert.equal(motionstypAvHandling(handling({ kind: "proposition" })), undefined);
});

test("parseForslagSvar: null-svar, giltigt svar, kodstaket, trasigt svar", () => {
  assert.equal(parseForslagSvar('{"koppling": null}'), null);
  const svar = parseForslagSvar(
    '```json\n{"koppling":{"riktning":"stodjer","citat":"taket i arbetslöshetsförsäkringen bör höjas","motivering":"Samma takhöjning.","confidence":0.8}}\n```',
  );
  assert.equal(svar?.riktning, "stodjer");
  assert.throws(() => parseForslagSvar("inte json"));
  assert.throws(() => parseForslagSvar('{"koppling":{"riktning":"kanske","citat":"x","motivering":"y"}}'));
});

function fakeLlm(svar: string): LlmClient {
  return { complete: async () => svar };
}

test("skapaForslag: rent förslag passerar grindarna och bär metadata", async () => {
  const svar =
    '{"koppling":{"riktning":"stodjer","citat":"taket i arbetslöshetsförsäkringen bör höjas","motivering":"Motionen kräver samma takhöjning som löftet.","confidence":0.85}}';
  const res = await skapaForslag(fakeLlm(svar), "system", "modell", lofte, handling(), kalltext, LAGE_A_FONSTER);
  assert.deepEqual(res.grindfel, []);
  assert.equal(res.forslag?.promise_id, "p-2026-0042");
  assert.equal(res.forslag?.motionstyp, "kommitte");
});

test("skapaForslag: påhittat citat fälls av H2 — modellen kan inte smita förbi", async () => {
  const svar =
    '{"koppling":{"riktning":"stodjer","citat":"taket bör höjas till minst 2 000 kronor per dag","motivering":"Låter rimligt.","confidence":0.9}}';
  const res = await skapaForslag(fakeLlm(svar), "system", "modell", lofte, handling(), kalltext, LAGE_A_FONSTER);
  assert.ok(res.grindfel.some((f) => f.grind === "H2"));
});

test("skapaForslag: null från modellen ger inget förslag och inga fel", async () => {
  const res = await skapaForslag(fakeLlm('{"koppling":null}'), "system", "modell", lofte, handling(), kalltext, LAGE_A_FONSTER);
  assert.equal(res.forslag, null);
  assert.deepEqual(res.grindfel, []);
});

test("byggPrompt innehåller löfte, handling och källtext", () => {
  const p = byggPrompt(lofte, handling(), kalltext);
  assert.ok(p.includes("Höj taket i a-kassan") && p.includes("DOKUMENTTEXT"));
});

// --- Voteringar kopplas via betänkandet ---

const betankande: Betankande = {
  dok_id: "HA01AU10",
  rm: "2022/23",
  beteckning: "AU10",
  datum: "2023-05-10",
  titel: "Taket i arbetslöshetsförsäkringen",
  organ: "AU",
};

function votering(over: Partial<Handling> = {}): Handling {
  return handling({
    id: "h-2026-0005",
    kind: "votering",
    dok_id: "202223:AU10",
    votering_id: "008484EA",
    punkt: 3,
    datum: "2023-05-10",
    titel: "Votering AU10 punkt 3 (2022/23)",
    url: "https://data.riksdagen.se/votering/008484EA",
    persons: [],
    parties: ["s", "v", "m"],
    utfall: "avslag",
    rostfordelning: {
      v: { ja: 20, nej: 0, avstar: 0, franvarande: 4 },
      m: { ja: 0, nej: 60, avstar: 0, franvarande: 8 },
    },
    ...over,
  });
}

test("rankaVoteringsKandidater: matchar via betänkandets titel, kräver betänkande i indexet", () => {
  const utanBet = votering({ id: "h-2026-0006", dok_id: "202223:UU15" });
  const kandidater = rankaVoteringsKandidater(lofte, [votering(), utanBet, handling()], [betankande], 5);
  assert.deepEqual(kandidater.map((k) => k.handling.id), ["h-2026-0005"]);
  assert.equal(kandidater[0]!.betankande.dok_id, "HA01AU10");
  assert.ok(kandidater[0]!.poang >= 2);
});

test("rankaVoteringsKandidater: löftespartiet måste finnas i röstfördelningen", () => {
  const utanLoftesParti = votering({
    rostfordelning: { m: { ja: 0, nej: 60, avstar: 0, franvarande: 8 } },
  });
  assert.deepEqual(rankaVoteringsKandidater(lofte, [utanLoftesParti], [betankande], 5), []);
});

test("byggPrompt för votering pekar ut betänkandet och punkten", () => {
  const p = byggPrompt(lofte, votering(), "text", betankande);
  assert.ok(p.includes("punkt 3") && p.includes("2022/23:AU10") && p.includes("betänkandet"));
});

test("skapaForslag för votering: citat ur betänkandetexten, beviset bär betänkandets dok_id", async () => {
  const betText =
    "Utskottet föreslår att riksdagen avslår motionsyrkanden om att taket i " +
    "arbetslöshetsförsäkringen bör höjas med hänvisning till pågående beredning.";
  const svar =
    '{"koppling":{"riktning":"stodjer","citat":"taket i arbetslöshetsförsäkringen bör höjas","motivering":"Punkten gäller samma takhöjning som löftet.","confidence":0.7}}';
  const res = await skapaForslag(fakeLlm(svar), "system", "modell", lofte, votering(), betText, LAGE_A_FONSTER, betankande);
  assert.deepEqual(res.grindfel, []);
  assert.equal(res.forslag?.bevis.kalla_dok_id, "HA01AU10");
  assert.equal(res.forslag?.motionstyp, undefined);
});

test("skapaForslag för votering: citat som bara finns i motionen fälls av H2 mot betänkandetexten", async () => {
  const svar =
    '{"koppling":{"riktning":"stodjer","citat":"' +
    "taket i arbetslöshetsförsäkringen bör höjas kraftigt och omedelbart" +
    '","motivering":"x","confidence":0.7}}';
  const res = await skapaForslag(fakeLlm(svar), "system", "modell", lofte, votering(), "Utskottets korta text om annat.", LAGE_A_FONSTER, betankande);
  assert.ok(res.grindfel.some((f) => f.grind === "H2"));
});
