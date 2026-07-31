import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlTillText } from "../src/riksdagen.ts";
import {
  byggPrompt,
  motionstypAvHandling,
  nyckelord,
  parseForslagSvar,
  lofteskallaDokId,
  rankaKandidater,
  rankaVoteringsKandidater,
  skapaForslag,
  type Lofte,
} from "../src/foreslag.ts";
import type { Betankande } from "../src/betankanden.ts";
import { LAGE_A_FONSTER } from "../src/grindar.ts";
import type { Handling } from "../src/handlingar.ts";
import { dokumentfrekvenser } from "../src/nyckelord.ts";
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

test("nyckelord: ordstammar, stoppord bort, korta ord bort", () => {
  const ord = nyckelord("Vi vill höja taket i arbetslöshetsförsäkringen");
  // Orden lagras som stammar, så böjningsformer möts.
  assert.ok(ord.has("tak") && ord.has("höj") && ord.has("arbetslöshetsförsäkring"));
  assert.ok(!ord.has("vi")); // för kort
  assert.ok(!nyckelord("att och det som").size); // bara stoppord
});

test("nyckelord: böjningsformer möts efter stamning", () => {
  // Poängen med stamningen: löftet säger en form, dokumentet en annan.
  const lofteOrd = nyckelord("Vi vill höja taket");
  const dokumentOrd = nyckelord("taket bör höjas");
  for (const w of ["höj", "tak"]) {
    assert.ok(lofteOrd.has(w) && dokumentOrd.has(w), `${w} skulle finnas i båda`);
  }
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

test("rankaKandidater: fråga räknas på frågeställarens parti, inte tillfrågad minister", () => {
  const mLofte: Lofte = { ...lofte, parties: ["m"] };
  // M-ledamot ställer frågan (till ett S-statsråd) → M är aktör: kandidat med.
  const fragaAvM = handling({
    id: "h-2026-0005",
    kind: "skriftlig_fraga",
    parties: ["m", "s"],
    persons: [
      { name: "Johan Forssell", party: "m", riksdagen_id: "9" },
      { name: "Statsrådet Ardalan Shekarabi", party: "s", riksdagen_id: "10" },
    ],
  });
  // S-ledamot ställer frågan till en M-minister → M finns bara som tillfrågad
  // minister, inte som aktör: utelämnas trots att handling.parties rymmer m.
  const fragaTillM = handling({
    id: "h-2026-0006",
    kind: "skriftlig_fraga",
    parties: ["s", "m"],
    persons: [
      { name: "Teresa Carvalho", party: "s", riksdagen_id: "11" },
      { name: "Justitieminister Gunnar Strömmer", party: "m", riksdagen_id: "12" },
    ],
  });
  const kandidater = rankaKandidater(mLofte, [fragaAvM, fragaTillM], 5);
  assert.deepEqual(kandidater.map((k) => k.handling.id), ["h-2026-0005"]);
});

test("rankaKandidater med nyckelordsindex: dokumentets text når löftet titeln missar", () => {
  // Fallet ur issue #174: motionens RUBRIK nämner Ukraina, men innehållet
  // gäller svensk försvarsförmåga. Mot ett försvarslöfte finns noll
  // titelöverlapp — utan index blir den aldrig kandidat.
  const forsvarsLofte: Lofte = {
    id: "p-2026-0040",
    title: "Sverige ska ha ett starkt försvar som avskräcker angripare",
    quote: "Sverige ska ha ett starkt försvar med förmåga att avskräcka potentiella angripare.",
    parties: ["m"],
  };
  const krigssjukvard = handling({
    id: "h-2026-18641",
    titel: "Snabbare uppbyggnad av krigssjukvård till stöd för Ukraina",
    parties: ["m"],
    persons: [{ name: "Magnus Resare", party: "m", riksdagen_id: "1" }],
  });

  // Utan index: ingen kandidat (rubriken delar inga ord med löftet).
  assert.deepEqual(rankaKandidater(forsvarsLofte, [krigssjukvard], 5), []);

  // Med index: dokumentets egna termer väger in. Korpusen görs realistiskt
  // stor — ordvikten bygger på hur SÄLLSYNT en term är, så en leksakskorpus
  // på en handfull dokument ger missvisande låga vikter.
  const termer = new Map<string, { t: string[]; n: number }>([
    // Stammar, precis som indexeraren lagrar dem (försv/avskräck/angrip/förmåg).
    ["h-2026-18641", { t: ["försv", "avskräck", "angrip", "förmåg"], n: 800 }],
  ]);
  for (let i = 0; i < 200; i += 1) {
    termer.set(`h-2026-9${String(i).padStart(3, "0")}`, { t: ["kultur"], n: 500 });
  }
  const index = {
    termer,
    df: dokumentfrekvenser(termer),
    antalDok: termer.size,
  };
  const medIndex = rankaKandidater(forsvarsLofte, [krigssjukvard], 5, index);
  assert.deepEqual(medIndex.map((k) => k.handling.id), ["h-2026-18641"]);
});

test("rankaKandidater: index ändrar inte utfallet när titeln redan räcker", () => {
  const bra = handling();
  const termer = new Map([["h-2026-0001", { t: ["tak"], n: 100 }]]);
  const index = { termer, df: dokumentfrekvenser(termer), antalDok: 1 };
  const utan = rankaKandidater(lofte, [bra], 5).map((k) => k.handling.id);
  const med = rankaKandidater(lofte, [bra], 5, index).map((k) => k.handling.id);
  assert.deepEqual(med, utan);
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

test("parseForslagSvar: svensk stavning av riktningen godtas", () => {
  // Prompten ber om "stodjer", men modellen stavar ibland ordet med prickar.
  // Samma svar, annan stavning — det får inte kosta ett par (föll skarpt i
  // förslagskörning 30159619034).
  for (const raw of ["stödjer", "Stödjer", " stödjer ", "STÖDJER"]) {
    const svar = parseForslagSvar(
      `{"koppling":{"riktning":${JSON.stringify(raw)},"citat":"x","motivering":"y","confidence":0.7}}`,
    );
    assert.equal(svar?.riktning, "stodjer", `stavningen ${raw} skulle tolkas som stodjer`);
  }
  const mot = parseForslagSvar('{"koppling":{"riktning":"Motverkar","citat":"x","motivering":"y","confidence":0.7}}');
  assert.equal(mot?.riktning, "motverkar");
  // Ett svar som betyder något annat ska fortfarande falla.
  assert.throws(() => parseForslagSvar('{"koppling":{"riktning":"stöder delvis","citat":"x","motivering":"y"}}'));
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

test("byggPrompt: punktens eget beslut skrivs ut när det är känt", () => {
  const p = byggPrompt(lofte, votering(), "text", betankande, {
    punkt: 3,
    rubrik: "Arbetslöshetsförsäkringen",
    forslag: "Riksdagen avslår motionerna 2022/23:1234 av Namn Namnsson (S) yrkande 2.",
  });
  assert.ok(p.includes("punkt 3: Arbetslöshetsförsäkringen"), "punktens rubrik ska stå i prompten");
  assert.ok(p.includes("Riksdagen avslår motionerna"), "punktens beslutstext ska stå i prompten");
  // Kärnan i b-fyndet: modellen ska varnas för att låna sammanfattningens
  // beskrivning av lagförslagen som bevis för ett rent motionsavslag.
  assert.ok(p.includes("Avslår punkten bara motioner"), "varningen om motionsavslag ska följa med");
});

test("byggPrompt: utan känd punkt byggs prompten som förr (inget stopp)", () => {
  const p = byggPrompt(lofte, votering(), "text", betankande, undefined);
  assert.ok(!p.includes("DEN HÄR PUNKTEN"), "ingen punktsektion när punkten är okänd");
  assert.ok(p.includes("punkt 3") && p.includes("DOKUMENTTEXT:"), "resten av prompten är oförändrad");
});

test("byggPrompt: lång beslutstext kapas så prompten inte sväller", () => {
  const langt = "Riksdagen antar regeringens förslag till ".repeat(200);
  const p = byggPrompt(lofte, votering(), "text", betankande, { punkt: 3, rubrik: "Lagförslagen", forslag: langt });
  assert.ok(p.includes("Punktens beslut: Riksdagen antar"));
  assert.ok(p.length < langt.length, "hela den långa texten ska inte följa med");
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

/**
 * Cirkelspärren: ungefär ett löfte av sju är hämtat ur ett riksdagsdokument.
 * Kopplas ett sådant löfte till just det dokumentet blir citatet ordagrant
 * identiskt med löftescitatet — grindarna passerar, men handlingen ÄR
 * löftet och säger ingenting om huruvida partiet agerat efter det.
 */
const lofteFranRiksdagen: Lofte = {
  ...lofte,
  source: { url: "https://data.riksdagen.se/dokument/HD021234" },
};

test("lofteskallaDokId: plockar dokument-id ur en riksdagskälla", () => {
  assert.equal(lofteskallaDokId(lofteFranRiksdagen), "HD021234");
});

test("lofteskallaDokId: partikälla ger null (inget att utesluta)", () => {
  assert.equal(lofteskallaDokId({ ...lofte, source: { url: "https://moderaterna.se/var-politik/" } }), null);
  assert.equal(lofteskallaDokId(lofte), null);
  assert.equal(lofteskallaDokId({ ...lofte, source: null }), null);
});

test("rankaKandidater: löftets EGET källdokument blir aldrig kandidat", () => {
  const egen = handling({ id: "h-2026-0100", dok_id: "HD021234", titel: "Höj taket i arbetslöshetsförsäkringen" });
  const annan = handling({ id: "h-2026-0101", dok_id: "HD029999", titel: "Höj taket i arbetslöshetsförsäkringen" });
  // Utan källa är båda kandidater — spärren får inte gallra av misstag.
  assert.deepEqual(
    rankaKandidater(lofte, [egen, annan], 5).map((k) => k.handling.id),
    ["h-2026-0100", "h-2026-0101"],
  );
  // Med källan kvar står bara den andra motionen.
  assert.deepEqual(
    rankaKandidater(lofteFranRiksdagen, [egen, annan], 5).map((k) => k.handling.id),
    ["h-2026-0101"],
  );
});

test("rankaVoteringsKandidater: votering vars betänkande ÄR löftets källa utesluts", () => {
  const v = votering();
  const franBetankandet: Lofte = { ...lofte, source: { url: "https://data.riksdagen.se/dokument/HA01AU10" } };
  assert.equal(rankaVoteringsKandidater(lofte, [v], [betankande], 5).length, 1);
  assert.deepEqual(rankaVoteringsKandidater(franBetankandet, [v], [betankande], 5), []);
});
