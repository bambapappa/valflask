import test from "node:test";
import assert from "node:assert/strict";
import {
  arHelMening,
  bytCitat,
  bytesnot,
  meningenRuntCitatet,
  provaByte,
  rattelsePost,
} from "../src/citatbyte.ts";

/**
 * Källtexten är skriven som `stripHtml` lämnar den: en rad per stycke och per
 * punkt i en lista. Fallet är det som fällde två kö-poster 2026-08-15 —
 * fyra punkter under en inledande mening, där två av punkterna skördats som
 * egna löften.
 */
const KALLA = [
  "I veckan presenterade justitieministern och finansministern en plan för hur det ska genomföras.",
  "Snabba på utbyggnaden av Kriminalvården i Sverige,",
  "Fler fängelseplatser utomlands – som vi nu gör i Estland,",
  "Utökad användning av fotboja för ofarliga brottslingar.",
  "Vi vill höja taket i arbetslöshetsförsäkringen till 1 200 kronor per dag under det första halvåret.",
].join("\n");

const NUVARANDE = "Vi vill höja taket i arbetslöshetsförsäkringen.";

test("ett citat som bär hela meningen går igenom", () => {
  const r = provaByte(
    { id: "p-2026-0001", citat: "Vi vill höja taket i arbetslöshetsförsäkringen till 1 200 kronor per dag under det första halvåret." },
    NUVARANDE,
    KALLA,
    true,
  );
  assert.equal(r.ok, true, r.skal.join(" | "));
  assert.equal(r.helMening, true);
  assert.equal(r.paUndantag, false);
});

test("ordagrannheten lossas aldrig: ett citat som inte står i källan faller", () => {
  const r = provaByte(
    { id: "p-2026-0001", citat: "Vi vill höja taket i arbetslöshetsförsäkringen till 1 300 kronor per dag under det första halvåret." },
    NUVARANDE,
    KALLA,
    true,
  );
  assert.equal(r.ok, false);
  assert.ok(r.skal.some((s) => s.includes("står inte ordagrant i källan")), r.skal.join(" | "));
});

test("ett utplock ur en längre mening faller — och skälet namnger hela meningen", () => {
  const r = provaByte(
    { id: "p-2026-0001", citat: "höja taket i arbetslöshetsförsäkringen till 1 200 kronor per dag" },
    NUVARANDE,
    KALLA,
    true,
  );
  assert.equal(r.ok, false);
  assert.equal(r.helMening, false);
  assert.ok(r.skal.some((s) => s.includes("utplock ur en längre mening")), r.skal.join(" | "));
  assert.ok(r.skal.some((s) => s.includes("under det första halvåret")), "hela meningen ska stå i skälet");
});

test("samma utplock går igenom med skälet utskrivet, och utfallet säger att det var ett undantag", () => {
  const r = provaByte(
    {
      id: "p-2026-0001",
      citat: "höja taket i arbetslöshetsförsäkringen till 1 200 kronor per dag",
      fragmentSkal: "resten av meningen gäller en annan förmån och hör inte till åtagandet",
    },
    NUVARANDE,
    KALLA,
    true,
  );
  assert.equal(r.ok, true, r.skal.join(" | "));
  assert.equal(r.paUndantag, true);
  assert.equal(r.helMening, false);
});

test("en hel punkt i partiets egen lista är en hel mening, även med avslutande kommatecken", () => {
  assert.equal(arHelMening(KALLA, "Fler fängelseplatser utomlands – som vi nu gör i Estland,"), true);
  assert.equal(arHelMening(KALLA, "Fler fängelseplatser utomlands – som vi nu gör i Estland"), true);
});

test("en halv punkt är inte en hel mening", () => {
  assert.equal(arHelMening(KALLA, "Fler fängelseplatser utomlands"), false);
});

test("meningen runt citatet hittas radvis, så en punkt inte klistras ihop med den föregående", () => {
  assert.equal(
    meningenRuntCitatet(KALLA, "Utökad användning av fotboja"),
    "Utökad användning av fotboja för ofarliga brottslingar.",
  );
});

test("ett citat som inte finns i källan ger ingen mening och inget hel-mening-utfall", () => {
  assert.equal(meningenRuntCitatet(KALLA, "något som inte står här"), null);
  assert.equal(arHelMening(KALLA, "något som inte står här"), undefined);
});

test("ett byte till samma citat rättar ingenting och faller", () => {
  const r = provaByte({ id: "p-2026-0001", citat: NUVARANDE }, NUVARANDE, `${KALLA}\n${NUVARANDE}`, true);
  assert.equal(r.ok, false);
  assert.ok(r.skal.some((s) => s.includes("ingenting att rätta")), r.skal.join(" | "));
});

test("citatgolvet gäller: ett för kort citat faller när det inte är en egen punkt", () => {
  const kalla = "Vi lovar mycket och vi lovar det ofta till alla som lyssnar på oss i valrörelsen.";
  const r = provaByte({ id: "p-2026-0001", citat: "Vi lovar mycket" }, NUVARANDE, kalla, false);
  assert.equal(r.ok, false);
  assert.ok(r.skal.some((s) => s.includes("minst")), r.skal.join(" | "));
});

test("det lägre golvet gäller bara partiets egen sida — samma citat, olika utfall", () => {
  const kalla = "Avskaffa flygskatten,\nHöj reseavdraget för de som pendlar långt till sitt arbete.";
  const egen = provaByte({ id: "p-2026-0001", citat: "Avskaffa flygskatten," }, NUVARANDE, kalla, true);
  const annan = provaByte({ id: "p-2026-0001", citat: "Avskaffa flygskatten," }, NUVARANDE, kalla, false);
  assert.equal(egen.ok, true, egen.skal.join(" | "));
  assert.equal(annan.ok, false);
});

test("ett för långt citat faller", () => {
  const langt = Array.from({ length: 45 }, (_, i) => `ord${i}`).join(" ");
  const r = provaByte({ id: "p-2026-0001", citat: langt }, NUVARANDE, langt, true);
  assert.equal(r.ok, false);
  assert.ok(r.skal.some((s) => s.includes("max")), r.skal.join(" | "));
});

test("bytet skriver en historikpost med platshållaren, och rör inget annat i löftet", () => {
  const lofte = {
    id: "p-2026-0001",
    quote: NUVARANDE,
    cost: { msek_base: 400 },
    history: [{ date: "2026-08-01", commit: "abc1234", change: "Publicerat." }],
  };
  const nytt = bytCitat(lofte, { id: "p-2026-0001", citat: "Ny lydelse ur samma sida." }, "2026-08-15");
  assert.equal(nytt.quote, "Ny lydelse ur samma sida.");
  assert.deepEqual(nytt.cost, { msek_base: 400 }, "beloppet rörs inte av ett citatbyte");
  assert.equal(nytt.history.length, 2);
  assert.equal(nytt.history[1]!.commit, "0000000");
  assert.equal(lofte.history.length, 1, "originalet muteras inte");
});

test("historikposten säger att det var ett undantag när det var det", () => {
  const utan = bytesnot({ id: "p-2026-0001", citat: "x" }, "2026-08-15");
  const med = bytesnot({ id: "p-2026-0001", citat: "x", fragmentSkal: "resten gäller annat" }, "2026-08-15");
  assert.ok(!utan.includes("mänskligt beslut"));
  assert.ok(med.includes("mänskligt beslut"));
  assert.ok(med.includes("resten gäller annat"));
});

test("rättelseposten namnger varje berört löfte i affects — noten på löftessidan hittas så", () => {
  const post = rattelsePost(
    [
      { lofte: { id: "p-2026-0002", quote: "a" }, byte: { id: "p-2026-0002", citat: "b" } },
      { lofte: { id: "p-2026-0001", quote: "c" }, byte: { id: "p-2026-0001", citat: "d" } },
    ],
    "2026-08-15",
    "annat",
  );
  assert.ok(post.affects.includes("p-2026-0001"));
  assert.ok(post.affects.includes("p-2026-0002"));
  assert.equal(post.commit, "0000000");
});

test("rättelseposten skiljer en lagad avskrift från ett byte av mening", () => {
  const bara_flyttad = rattelsePost(
    [{ lofte: { id: "p-2026-0001", quote: "a" }, byte: { id: "p-2026-0001", citat: "b" } }],
    "2026-08-15",
    "annat",
  );
  const bara_reparerad = rattelsePost(
    [
      {
        lofte: { id: "p-2026-0001", quote: "a" },
        byte: { id: "p-2026-0001", citat: "b" },
        gammaltCitatSaknasIKallan: true,
      },
    ],
    "2026-08-15",
    "annat",
  );
  assert.ok(bara_flyttad.what.includes("annan mening"));
  assert.ok(!bara_flyttad.what.includes("avskriften"));
  assert.ok(bara_reparerad.what.includes("avskriften"));
  assert.ok(!bara_reparerad.what.includes("annan mening"));
});

test("rättelseposten räknar undantagen och säger att de togs på ett mänskligt beslut", () => {
  const post = rattelsePost(
    [
      {
        lofte: { id: "p-2026-0001", quote: "a" },
        byte: { id: "p-2026-0001", citat: "b", fragmentSkal: "skäl" },
      },
    ],
    "2026-08-15",
    "annat",
  );
  assert.ok(post.what.includes("1 av dem"));
  assert.ok(post.what.includes("mänskligt beslut"));
});

test("ett källbyte flyttar löftet till den nya sidan och nollar arkivkopian", () => {
  const lofte = {
    id: "p-2026-0001",
    quote: "Gammal lydelse.",
    history: [],
    source: {
      url: "https://www.exempelpartiet.se/politik/gammal",
      domain: "exempelpartiet.se",
      archive_url: "https://web.archive.org/web/2026/gammal",
      fetched_at: "2026-01-01T00:00:00.000Z",
    },
  };
  const nytt = bytCitat(
    lofte,
    { id: "p-2026-0001", citat: "Ny lydelse med nivån i.", kalla: "https://www.exempelpartiet.se/politik/ny" },
    "2026-09-05",
    "2026-09-05T10:00:00.000Z",
  );
  assert.equal(nytt.source.url, "https://www.exempelpartiet.se/politik/ny");
  assert.equal(nytt.source.domain, "exempelpartiet.se");
  // Den gamla ögonblicksbilden visar en annan sida och bevisar ingenting om den nya.
  assert.equal(nytt.source.archive_url, null);
  assert.equal(nytt.source.fetched_at, "2026-09-05T10:00:00.000Z");
  const not = (nytt.history.at(-1) as { change: string }).change;
  assert.match(not, /Citatet och källan byttes/u);
  assert.match(not, /Arkivkopian är nollställd/u);
  // Det gamla citatet står kvar i historiken via den gamla adressen.
  assert.match(not, /politik\/gammal/u);
});

test("ett vanligt citatbyte rör inte källan", () => {
  const lofte = {
    id: "p-2026-0002",
    quote: "Gammal lydelse.",
    history: [],
    source: {
      url: "https://www.exempelpartiet.se/politik/sidan",
      domain: "exempelpartiet.se",
      archive_url: "https://web.archive.org/web/2026/sidan",
      fetched_at: "2026-01-01T00:00:00.000Z",
    },
  };
  const nytt = bytCitat(lofte, { id: "p-2026-0002", citat: "Ny lydelse." }, "2026-09-05");
  assert.equal(nytt.source.archive_url, "https://web.archive.org/web/2026/sidan");
  assert.equal(nytt.source.fetched_at, "2026-01-01T00:00:00.000Z");
  assert.doesNotMatch((nytt.history.at(-1) as { change: string }).change, /källan byttes/u);
});

test("rättelseposten säger att källan bytts, och för hur många", () => {
  const post = rattelsePost(
    [
      {
        lofte: { id: "p-2026-0001", quote: "a" },
        byte: { id: "p-2026-0001", citat: "b", kalla: "https://www.exempelpartiet.se/ny" },
      },
      { lofte: { id: "p-2026-0002", quote: "c" }, byte: { id: "p-2026-0002", citat: "d" } },
    ],
    "2026-09-05",
    "läsmetod — dubblett i annan lydelse syns bara vid genomläsning",
  );
  assert.match(post.affects, /varav 1 med ny källa/u);
  assert.match(post.what, /en annan av partiets sidor/u);
  assert.match(post.what, /Arkivkopian är nollställd/u);
  assert.match(post.why, /belägget starkare/u);
});
