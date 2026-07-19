import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avvisaForslag,
  byggIssueBody,
  byggIssueTitel,
  findIndexByKopplingId,
  godkannForslag,
  GranskningsFel,
  kopplingId,
  nastaKopplingsId,
  parseGranskningsKommando,
  type KopplingPost,
  type KoPost,
} from "../src/granskning.ts";
import type { Handling } from "../src/handlingar.ts";

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

function koPost(over: Partial<KoPost> = {}): KoPost {
  return {
    promise_id: "p-2026-0042",
    handling_id: "h-2026-0001",
    riktning: "stodjer",
    bevis: { citat: "taket i arbetslöshetsförsäkringen bör höjas" },
    motionstyp: "kommitte",
    method_note: "Motionen kräver samma takhöjning som löftet.",
    confidence: 0.85,
    skapad: "2026-07-19T12:00:00.000Z",
    extraction: { model: "test-modell", verified_by: null, run_id: "foreslag-2026-07-19" },
    ...over,
  };
}

test("kopplingId: stabilt, 12 hex, och issue-uppslag träffar rätt post", () => {
  const id = kopplingId(koPost());
  assert.match(id, /^[0-9a-f]{12}$/u);
  assert.equal(id, kopplingId(koPost({ confidence: 0.1 }))); // bara mål+handling räknas
  const items = [koPost({ handling_id: "h-2026-0009" }), koPost()];
  assert.equal(findIndexByKopplingId(items, id), 1);
  assert.equal(findIndexByKopplingId(items, "ffffffffffff"), -1);
});

test("parseGranskningsKommando: godkänn, motionstyp, avvisa, alias, grumligt", () => {
  assert.deepEqual(parseGranskningsKommando("/godkänn"), { action: "approve" });
  assert.deepEqual(parseGranskningsKommando("/godkann\nfritext under"), { action: "approve" });
  assert.deepEqual(parseGranskningsKommando("/approve"), { action: "approve" });
  assert.deepEqual(parseGranskningsKommando("/godkänn --motionstyp parti"), { action: "approve", motionstyp: "parti" });
  assert.deepEqual(parseGranskningsKommando("/godkänn --motionstyp=kommitté"), { action: "approve", motionstyp: "kommitte" });
  assert.deepEqual(parseGranskningsKommando("/avvisa fel sakfråga"), { action: "reject", reason: "fel sakfråga" });
  assert.deepEqual(parseGranskningsKommando("/reject"), { action: "reject", reason: "avvisad via koppling-issue" });
  assert.equal(parseGranskningsKommando("/godkänn gärna"), null);
  assert.equal(parseGranskningsKommando("/godkänn --motionstyp partibok"), null);
  assert.equal(parseGranskningsKommando("ser bra ut!"), null);
});

test("nastaKopplingsId räknar vidare från högsta", () => {
  assert.equal(nastaKopplingsId([], 2026), "k-2026-0001");
  assert.equal(nastaKopplingsId([{ id: "k-2026-0007" }, { id: "k-2026-0002" }], 2026), "k-2026-0008");
});

test("godkannForslag: posten flyttas ur kön, kopplingen aktiv med verified_by owner", () => {
  const ko = [koPost()];
  const res = godkannForslag(ko, 0, [], [handling()], { year: 2026 });
  assert.equal(res.ko.length, 0);
  assert.equal(res.kopplingar.length, 1);
  const k = res.koppling;
  assert.equal(k.id, "k-2026-0001");
  assert.equal(k.status, "aktiv");
  assert.equal(k.extraction.verified_by, "owner");
  assert.equal(k.motionstyp, "kommitte");
  assert.ok(!("skapad" in k)); // kö-fältet följer inte med in i kopplingar.json
});

test("godkannForslag: granskarens motionstyp vinner (b-0007)", () => {
  const res = godkannForslag([koPost()], 0, [], [handling()], { motionstyp: "parti", year: 2026 });
  assert.equal(res.koppling.motionstyp, "parti");
});

test("godkannForslag: motion utan motionstyp stoppas", () => {
  const utanTyp = koPost();
  delete utanTyp.motionstyp;
  assert.throws(() => godkannForslag([utanTyp], 0, [], [handling()], { year: 2026 }), GranskningsFel);
});

test("godkannForslag: motionstyp på icke-motion stoppas", () => {
  const vot = handling({ id: "h-2026-0005", kind: "votering" });
  const post = koPost({ handling_id: "h-2026-0005" });
  delete post.motionstyp;
  assert.throws(
    () => godkannForslag([post], 0, [], [vot], { motionstyp: "parti", year: 2026 }),
    GranskningsFel,
  );
  const res = godkannForslag([post], 0, [], [vot], { year: 2026 });
  assert.equal(res.koppling.motionstyp, undefined); // voteringar har aldrig motionstyp
});

test("godkannForslag: okänd handling, kort citat och tom motivering stoppas", () => {
  assert.throws(() => godkannForslag([koPost({ handling_id: "h-9999-0001" })], 0, [], [handling()], {}), GranskningsFel);
  assert.throws(() => godkannForslag([koPost({ bevis: { citat: "för kort" } })], 0, [], [handling()], {}), GranskningsFel);
  assert.throws(() => godkannForslag([koPost({ method_note: "  " })], 0, [], [handling()], {}), GranskningsFel);
  assert.throws(() => godkannForslag([], 3, [], [handling()], {}), GranskningsFel);
});

test("godkannForslag: bevisets kalla_dok_id (betänkandet) följer med", () => {
  const vot = handling({ id: "h-2026-0005", kind: "votering" });
  const post = koPost({
    handling_id: "h-2026-0005",
    bevis: { citat: "taket i arbetslöshetsförsäkringen bör höjas", kalla_dok_id: "HA01AU10" },
  });
  delete post.motionstyp;
  const res = godkannForslag([post], 0, [], [vot], { year: 2026 });
  assert.equal(res.koppling.bevis.kalla_dok_id, "HA01AU10");
});

test("avvisaForslag lyfter posten ur kön", () => {
  const ko = [koPost(), koPost({ handling_id: "h-2026-0002" })];
  const res = avvisaForslag(ko, 0);
  assert.equal(res.ko.length, 1);
  assert.equal(res.post.handling_id, "h-2026-0001");
  assert.throws(() => avvisaForslag([], 0), GranskningsFel);
});

test("byggIssueTitel bär koppling-id, mål, handling och typ", () => {
  const t = byggIssueTitel(koPost(), "abc123def456", handling());
  assert.equal(t, "[koppling abc123def456] p-2026-0042 ↔ h-2026-0001 (motion)");
});

test("byggIssueBody: motion visar motionstyp-raden och beslutstabellen", () => {
  const b = byggIssueBody(koPost(), "abc123def456", handling(), {
    id: "p-2026-0042",
    title: "Höj taket i a-kassan",
    quote: "Vi vill höja taket.",
    parties: ["v"],
  });
  assert.ok(b.includes("Höj taket i a-kassan"));
  assert.ok(b.includes("/godkänn --motionstyp parti"));
  assert.ok(b.includes("b-0007"));
  assert.ok(b.includes("/avvisa <skäl>"));
  assert.ok(b.includes("koppling-id `abc123def456`"));
});

test("byggIssueBody: votering förklarar riktningen och länkar betänkandet", () => {
  const vot = handling({ id: "h-2026-0005", kind: "votering", utfall: "avslag" });
  const post = koPost({
    handling_id: "h-2026-0005",
    bevis: { citat: "taket i arbetslöshetsförsäkringen bör höjas", kalla_dok_id: "HA01AU10" },
  });
  delete post.motionstyp;
  const b = byggIssueBody(post, "abc123def456", vot);
  assert.ok(b.includes("bifall (Ja)"));
  assert.ok(b.includes("https://data.riksdagen.se/dokument/HA01AU10"));
  assert.ok(!b.includes("--motionstyp")); // bara motioner erbjuder motionstyp-beslutet
});

test("byggIssueBody utan löftestext och utan handling degraderar ärligt", () => {
  const b = byggIssueBody(koPost({ handling_id: "h-9999-0001" }), "abc123def456");
  assert.ok(b.includes("p-2026-0042"));
  assert.ok(b.includes("SAKNAS i handlingar.json"));
});

test("kopplingar sorteras på id vid godkännande", () => {
  const befintliga: KopplingPost[] = [
    {
      id: "k-2026-0002",
      promise_id: "p-2026-0001",
      handling_id: "h-2026-0002",
      riktning: "motverkar",
      bevis: { citat: "ett tillräckligt långt citat härifrån" },
      method_note: "x",
      confidence: 0.5,
      extraction: { model: "m", verified_by: "owner", run_id: "r" },
      status: "aktiv",
    },
  ];
  const res = godkannForslag([koPost()], 0, befintliga, [handling()], { year: 2026 });
  assert.deepEqual(res.kopplingar.map((k) => k.id), ["k-2026-0002", "k-2026-0003"]);
});
