import { test } from "node:test";
import assert from "node:assert/strict";
import { bytBevis, bytesnot, provaByte, rattelsePost, type Byte } from "../src/bevisbyte.ts";
import type { KopplingPost } from "../src/granskning.ts";

const YRKANDE =
  "Riksdagen ställer sig bakom det som anförs i motionen om att höja taket i " +
  "arbetslöshetsförsäkringen och tillkännager detta för regeringen.";
const BRODTEXT =
  "Arbetslöshetsförsäkringen har urholkats under lång tid och taket har inte följt löneutvecklingen. " +
  `Vi menar därför att taket måste höjas. ${YRKANDE}`;

const YRKANDEN = { sort: "yrkanden" as const, delar: [YRKANDE] };

/** Kopplingens citat innan bytet — brödtext, som de flesta som ska bytas. */
const NUVARANDE = "Arbetslöshetsförsäkringen har urholkats under lång tid och taket har inte följt löneutvecklingen.";

function koppling(over: Partial<KopplingPost> = {}): KopplingPost {
  return {
    id: "k-2026-0019",
    promise_id: "p-2026-0021",
    handling_id: "h-2026-6887",
    riktning: "stodjer",
    bevis: { citat: "Vi menar därför att taket måste höjas." },
    method_note: "Motionen driver löftets sak.",
    confidence: 0.8,
    extraction: { model: "x", verified_by: "owner", run_id: "r" },
    status: "aktiv",
    ...over,
  };
}

function byte(over: Partial<Byte> = {}): Byte {
  return { id: "k-2026-0019", citat: YRKANDE, ...over };
}

// ── Ordagrannheten ────────────────────────────────────────────────────

test("ett citat ur handlingens egen lydelse går igenom", () => {
  const p = provaByte(byte(), NUVARANDE, BRODTEXT, YRKANDEN);
  assert.equal(p.ok, true);
  assert.equal(p.iHandlingen, true);
  assert.equal(p.paUndantag, false);
});

// Citatgrindarna lossas aldrig. Ett citat som inte står i dokumentet är fel
// citat, oavsett hur rätt det låter.
test("ett citat som inte står ordagrant i källan faller", () => {
  const p = provaByte(byte({ citat: "Riksdagen ställer sig bakom att sänka taket i försäkringen." }), NUVARANDE, BRODTEXT, YRKANDEN);
  assert.equal(p.ok, false);
  assert.match(p.skal.join(" "), /ordagrant/);
});

test("ett citat under teckengolvet faller", () => {
  const p = provaByte(byte({ citat: "Taket höjs" }), NUVARANDE, BRODTEXT, YRKANDEN);
  assert.equal(p.ok, false);
  assert.match(p.skal.join(" "), /tecken/);
});

// Typografi neutraliseras på båda sidor — men innehåll aldrig. Ett citat som
// klipps ur riksdagens strukturerade lista har ofta andra radbrytningar än
// dokumenttexten.
test("radbrytningar och dubbla mellanslag hindrar inte ett byte", () => {
  const p = provaByte(byte({ citat: YRKANDE.replace(" om att", "\n  om  att") }), NUVARANDE, BRODTEXT, YRKANDEN);
  assert.equal(p.ok, true);
});

// ── Att citatet ska stå i handlingens egen del ────────────────────────

test("brödtext utan skäl faller, och beskedet säger hur den tas in ändå", () => {
  const p = provaByte(byte({ citat: "Vi menar därför att taket måste höjas." }), NUVARANDE, BRODTEXT, YRKANDEN);
  assert.equal(p.ok, false);
  assert.equal(p.iHandlingen, false);
  assert.match(p.skal.join(" "), /yrkanden/);
  assert.match(p.skal.join(" "), /skälet/);
});

// Elva kopplingar gick in på just det undantaget 2026-08-06: yrkandet anvisar
// bara medel enligt en tabell och visar mindre än brödtexten gör.
test("brödtext MED utskrivet skäl går igenom, men märks som undantag", () => {
  const p = provaByte(
    byte({
      citat: "Vi menar därför att taket måste höjas.",
      brodtextSkal: "yrkandet anvisar bara medel enligt en tabell",
    }),
    NUVARANDE,
    BRODTEXT,
    YRKANDEN,
  );
  assert.equal(p.ok, true);
  assert.equal(p.paUndantag, true);
  assert.equal(p.iHandlingen, false);
});

// En fråga eller interpellation har ingen yrkandeform, och ska aldrig fällas
// för att den saknar en.
test("saknas handlingens lydelser prövas bara det ordagranna", () => {
  const p = provaByte(byte({ citat: "Vi menar därför att taket måste höjas." }), NUVARANDE, BRODTEXT, undefined);
  assert.equal(p.ok, true);
  assert.equal(p.iHandlingen, undefined);
});

// ── Spåret bytet lämnar ───────────────────────────────────────────────

test("bytet rör citatet och motiveringen — ingenting annat", () => {
  const fore = koppling();
  const efter = bytBevis(fore, byte(), "2026-08-07");
  assert.equal(efter.bevis.citat, YRKANDE);
  assert.match(efter.method_note, /Motionen driver löftets sak\./);
  assert.match(efter.method_note, /byttes 2026-08-07/);
  // Samma dom, buret av ett annat stycke: målet, handlingen och riktningen
  // står stilla, och därför behöver domarna inte räknas om.
  assert.equal(efter.promise_id, fore.promise_id);
  assert.equal(efter.handling_id, fore.handling_id);
  assert.equal(efter.riktning, fore.riktning);
  assert.equal(efter.status, fore.status);
});

test("ett byte på undantag bär skälet i motiveringen", () => {
  const not = bytesnot(byte({ brodtextSkal: "yrkandet är en anslagstabell" }), "2026-08-07");
  assert.match(not, /mänskligt beslut/);
  assert.match(not, /anslagstabell/);
});

// ── Rättelseposten ────────────────────────────────────────────────────

// Rättelsenoten på en löftessida väljs genom att söka löftets id i `affects`.
// Namnges löftet inte där syns rättelsen aldrig på sidan den gäller — och en
// rättelse ingen ser är en tyst rättelse.
test("rättelseposten namnger varje berört löfte i affects", () => {
  const post = rattelsePost(
    [
      { koppling: koppling(), byte: byte() },
      { koppling: koppling({ id: "k-2026-0020", promise_id: "p-2026-0126" }), byte: byte({ id: "k-2026-0020" }) },
    ],
    "2026-08-07",
  );
  assert.match(post.affects, /p-2026-0021/);
  assert.match(post.affects, /p-2026-0126/);
  assert.equal(post.date, "2026-08-07");
  assert.equal(post.commit, "0000000", "backfillas i en andra commit");
});

test("rättelseposten räknar undantagen när det finns några", () => {
  const medUndantag = rattelsePost(
    [{ koppling: koppling(), byte: byte({ brodtextSkal: "anslagstabell" }) }],
    "2026-08-07",
  );
  assert.match(medUndantag.what, /1 av dem/);
  const utan = rattelsePost([{ koppling: koppling(), byte: byte() }], "2026-08-07");
  assert.doesNotMatch(utan.what, /mänskligt beslut/);
});

// Samma löfte kan bära flera utbytta kopplingar. Står id:t två gånger blir
// affects-texten fel, och en läsare tror att fler löften rörts än som gjort det.
test("samma löfte namnges en gång även med flera kopplingar", () => {
  const post = rattelsePost(
    [
      { koppling: koppling(), byte: byte() },
      { koppling: koppling({ id: "k-2026-0020" }), byte: byte({ id: "k-2026-0020" }) },
    ],
    "2026-08-07",
  );
  assert.equal(post.affects.match(/p-2026-0021/g)?.length, 1);
});

// En "rättelse" som inte rättar något skriver ändå en post i rättelseloggen
// och en not i motiveringen. En logg full av sådana är svårare att lita på
// än en kort. Fyndet kom ur en skarp körning mot riktigt data.
// Genomgången 2026-08-07 fann tolv publicerade citat som INTE stod ord för ord
// i sin källa: textutvinningen hade skjutit in mellanrum mitt i avstavade ord.
// Bytet är då en reparation av avskriften, och rättelseposten får inte påstå
// att det gamla citatet stod ordagrant i dokumentet — det gjorde det inte.
test("en reparerad avskrift beskrivs som trasig, inte som flyttad", () => {
  const post = rattelsePost(
    [{ koppling: koppling(), byte: byte(), gammaltCitatSaknasIKallan: true }],
    "2026-08-07",
  );
  assert.doesNotMatch(post.what, /stod ordagrant i dokumentet/);
  assert.match(post.what, /trasig/);
  assert.match(post.what, /mellanrum/);
  assert.match(post.why, /inte går att hitta i sin källa/);
});

test("en genomgång med båda sorterna beskriver dem var för sig", () => {
  const post = rattelsePost(
    [
      { koppling: koppling(), byte: byte() },
      { koppling: koppling({ id: "k-2026-0020" }), byte: byte({ id: "k-2026-0020" }), gammaltCitatSaknasIKallan: true },
    ],
    "2026-08-07",
  );
  assert.match(post.what, /belägg för 1 koppling mellan/);
  assert.match(post.what, /För 1 koppling var den sparade citattexten trasig/);
  assert.match(post.affects, /2 bevis utbytta/);
});

test("ett byte till samma citat faller", () => {
  const p = provaByte(byte({ citat: YRKANDE }), YRKANDE, BRODTEXT, YRKANDEN);
  assert.equal(p.ok, false);
  assert.match(p.skal.join(" "), /ingenting att rätta/);
});

test("skillnad bara i typografi räknas också som samma citat", () => {
  const p = provaByte(byte({ citat: YRKANDE }), YRKANDE.replace(" om att", "  om\natt"), BRODTEXT, YRKANDEN);
  assert.equal(p.ok, false);
  assert.match(p.skal.join(" "), /ingenting att rätta/);
});
