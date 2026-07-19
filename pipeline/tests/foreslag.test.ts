import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlTillText } from "../src/riksdagen.ts";
import {
  byggPrompt,
  motionstypAvHandling,
  nyckelord,
  parseForslagSvar,
  rankaKandidater,
  skapaForslag,
  type Lofte,
} from "../src/foreslag.ts";
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

test("motionstypAvHandling: flera undertecknare → kommitté, en → enskild, aldrig parti", () => {
  assert.equal(motionstypAvHandling(handling()), "kommitte");
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
