import { test } from "node:test";
import assert from "node:assert/strict";
import {
  partyCodeFromName,
  parsePerson,
  deriveTitle,
  mapCategory,
  costFromVallen,
  vallenToCandidate,
  importVallen,
  youtubeVideoId,
  gateTranscript,
  type VallenRecord,
  type CategoryMap,
} from "../src/import-vallen.ts";
import type { PipelinePromise } from "../src/publish.ts";

const MAP: CategoryMap = {
  "Brottslighet/trygghet/rättsväsende": { enum: "rättsväsende" },
  "Ekonomi/Skatt": { enum: "skatter" },
  "Bostadspolitik/hyresrätter": { enum: "välfärd" },
  "Hittas-ej": { enum: "hittasinte" }, // ogiltigt enum → ska falla till övrigt
};

const NOW = new Date("2026-06-29T00:00:00Z");
const ALLOW = ["moderaterna.se", "vansterpartiet.se", "sd.se"] as const;

/* ── rena hjälpare ── */

test("partyCodeFromName: kod ur parentes, validering", () => {
  assert.equal(partyCodeFromName("Socialdemokraterna (S)"), "s");
  assert.equal(partyCodeFromName("Sverigedemokraterna (SD)"), "sd");
  assert.equal(partyCodeFromName("m"), "m");
  assert.equal(partyCodeFromName("Piratpartiet (PP)"), null);
  assert.equal(partyCodeFromName("Något helt annat"), null);
});

test("parsePerson: partinamn → null, namngiven företrädare → {name,role}", () => {
  assert.equal(parsePerson("Socialdemokraterna (S)", "parti"), null);
  assert.equal(parsePerson("", "parti"), null);
  assert.deepEqual(parsePerson("Ulf Kristersson (statsminister)", "partiledare"), {
    name: "Ulf Kristersson",
    role: "statsminister",
  });
  assert.deepEqual(parsePerson("Jimmie Åkesson", "partiledare"), {
    name: "Jimmie Åkesson",
    role: "partiledare",
  });
  // "X / Y" → första personen
  assert.deepEqual(parsePerson("Elisabeth Thand Ringqvist (och Martin Ådahl)", "partiledare"), {
    name: "Elisabeth Thand Ringqvist",
    role: "partiledare",
  });
});

test("deriveTitle: första meningen, kapad, utan slutskiljetecken, 5–160 tecken", () => {
  const t = deriveTitle("Vi vill sänka skatten. Och mer därtill.");
  assert.equal(t, "Vi vill sänka skatten");
  const long = "x".repeat(300);
  assert.ok(deriveTitle(long).length <= 160);
  assert.ok(deriveTitle("Höjd a-kassa").length >= 5);
});

test("mapCategory: giltigt enum, fallback till övrigt", () => {
  assert.equal(mapCategory("Brottslighet/trygghet/rättsväsende", MAP), "rättsväsende");
  assert.equal(mapCategory("Hittas-ej", MAP), "övrigt"); // ogiltigt enum
  assert.equal(mapCategory("Finns inte i kartan", MAP), "övrigt");
});

test("costFromVallen: spann, R2, neutral→0, method_note=uträkning", () => {
  // estimerat/hög → brett band, llm_estimat
  const est = costFromVallen({
    parti: "Moderaterna (M)", lovtext: "x", kategori: "Ekonomi/Skatt", kalla: "https://moderaterna.se/x", datum: "2026-06-01",
    kostnad_typ: "estimerat", kostnad_kr_ar: 10_000_000_000, kostnad_osakerhet: "hög",
    kostnad_utrakning: "Estimat: ~10 mdr/år.", riktning: "utgift",
  });
  assert.equal(est.basis, "llm_estimat");
  assert.equal(est.msek_base, 10_000);
  assert.ok(est.msek_high >= est.msek_low * 1.5, "R2: high ≥ 1,5×low");
  assert.equal(est.method_note, "Estimat: ~10 mdr/år.");
  assert.equal(est.type, "utgift");

  // exakt → smalt band, basis parti
  const exact = costFromVallen({
    parti: "M (M)", lovtext: "x", kategori: "x", kalla: "https://x", datum: "2026-01-01",
    kostnad_typ: "exakt", kostnad_kr_ar: 500_000_000, kostnad_osakerhet: "låg", riktning: "utgift",
  });
  assert.equal(exact.basis, "parti");
  assert.equal(exact.msek_base, 500);

  // intäktsminskning
  const intakt = costFromVallen({
    parti: "x (M)", lovtext: "x", kategori: "x", kalla: "https://x", datum: "2026-01-01",
    kostnad_typ: "estimerat", kostnad_kr_ar: 2_000_000_000, riktning: "intakt",
  });
  assert.equal(intakt.type, "intäktsminskning");

  // neutral/princip → 0 kr, men giltig method_note
  const neutral = costFromVallen({
    parti: "x (M)", lovtext: "x", kategori: "x", kalla: "https://x", datum: "2026-01-01",
    kostnad_typ: "princip", kostnad_kr_ar: 0, riktning: "neutral",
  });
  assert.equal(neutral.msek_base, 0);
  assert.ok(neutral.method_note.length >= 1);
});

/* ── end-to-end import ── */

function rec(over: Partial<VallenRecord>): VallenRecord {
  return {
    parti: "Moderaterna (M)",
    politiker: "",
    lovtext: "Vi lovar att sanningen ska segra i alla lägen framöver helt klart.",
    kategori: "Ekonomi/Skatt",
    kalla: "https://moderaterna.se/nyhet/x",
    datum: "2026-06-01",
    kostnad_typ: "estimerat",
    kostnad_kr_ar: 1_000_000_000,
    kostnad_osakerhet: "medel",
    kostnad_utrakning: "Estimat.",
    riktning: "utgift",
    fas: 1,
    niva: "parti",
    ...over,
  };
}

test("importVallen: G3-träff i snapshot → publicerbar; ej träff → review", () => {
  const quote = "Vi lovar att sanningen ska segra i alla lägen framöver helt klart.";
  const snapIndex = new Map<string, string>([
    ["moderaterna.se", `Massa text ... ${quote} ... mer text.`],
  ]);
  const records = [
    rec({}), // citatet finns i snapshot → publicerbar
    rec({ lovtext: "Detta citat finns inte alls i någon sparad snapshot text." }), // G3-miss
  ];
  const res = importVallen({
    records, categoryMap: MAP, snapshotIndex: snapIndex,
    existingPromises: [], allowlist: ALLOW, now: NOW,
  });
  assert.equal(res.stats.publishable, 1);
  assert.equal(res.processedCandidates[0]!.candidate.category, "skatter");
  assert.ok(res.reviewItems.some((r) => r.failures.some((f) => f.gate === "G3")));
});

test("importVallen: domän utanför allowlist → G2 → review", () => {
  const snapIndex = new Map<string, string>();
  const records = [rec({ kalla: "https://example.com/x" })];
  const res = importVallen({
    records, categoryMap: MAP, snapshotIndex: snapIndex,
    existingPromises: [], allowlist: ALLOW, now: NOW,
  });
  assert.equal(res.stats.publishable, 0);
  assert.ok(res.reviewItems[0]!.failures.some((f) => f.gate === "G2"));
});

test("importVallen: identiskt citat över två partier → delad group_id", () => {
  const quote = "Vi vill bygga ett tryggare land med fler poliser och hårdare tag mot brott.";
  const snapIndex = new Map<string, string>([
    ["moderaterna.se", quote],
    ["sd.se", quote],
  ]);
  const records = [
    rec({ parti: "Moderaterna (M)", kalla: "https://moderaterna.se/a", lovtext: quote, kategori: "Brottslighet/trygghet/rättsväsende" }),
    rec({ parti: "Sverigedemokraterna (SD)", kalla: "https://sd.se/b", lovtext: quote, kategori: "Brottslighet/trygghet/rättsväsende" }),
  ];
  const res = importVallen({
    records, categoryMap: MAP, snapshotIndex: snapIndex,
    existingPromises: [], allowlist: ALLOW, now: NOW,
  });
  assert.equal(res.stats.publishable, 2);
  assert.equal(res.stats.groupsLinked, 1);
  const gids = res.processedCandidates.map((p) => p.groupId);
  assert.ok(gids[0] && gids[0] === gids[1], "samma group_id för båda");
  assert.match(gids[0]!, /^g-[a-z0-9-]+$/);
});

/* ── transkript-källtyp ── */

test("youtubeVideoId: watch?v=, youtu.be, icke-youtube", () => {
  assert.equal(youtubeVideoId("https://youtube.com/watch?v=abc123"), "abc123");
  assert.equal(youtubeVideoId("https://www.youtube.com/watch?v=xY-z_9&t=10"), "xY-z_9");
  assert.equal(youtubeVideoId("https://youtu.be/QQ99"), "QQ99");
  assert.equal(youtubeVideoId("https://moderaterna.se/x"), null);
});

test("gateTranscript: uppmjukad verbatim (skiftläge/skiljetecken), saknat transkript, längd", () => {
  const transcript = "ja och därför säger jag att vi vill sänka skatten för vanligt folk redan nästa år sa hon";
  const ok = vallenToCandidate(
    { parti: "M (M)", lovtext: "Vi vill sänka skatten för vanligt folk redan nästa år.", kategori: "x",
      kalla: "https://youtube.com/watch?v=z", datum: "2026-06-20" },
    {}, transcript,
  )!;
  assert.equal(gateTranscript(ok.candidate, transcript, NOW, "2026-06-20").length, 0, "matchar trots skiftläge/punkt");

  // citat ej i transkript → G3
  const bad = vallenToCandidate(
    { parti: "M (M)", lovtext: "Detta sa ingen någonsin i hela talet faktiskt inte.", kategori: "x",
      kalla: "https://youtube.com/watch?v=z", datum: "2026-06-20" },
    {}, transcript,
  )!;
  assert.ok(gateTranscript(bad.candidate, transcript, NOW, "2026-06-20").some((f) => f.gate === "G3"));

  // saknat transkript → G3
  assert.ok(gateTranscript(ok.candidate, "", NOW, "2026-06-20").some((f) => f.gate === "G3"));
});

test("importVallen: youtube-källa verifieras mot transkriptindex → publicerbar (förbi G2)", () => {
  const transcript = "vi lovar att bygga ut tunnelbanan i hela storstockholm under nästa mandatperiod helt klart";
  const records = [rec({
    parti: "Vänsterpartiet (V)",
    kalla: "https://youtube.com/watch?v=VID123",
    lovtext: "Vi lovar att bygga ut tunnelbanan i hela Storstockholm under nästa mandatperiod.",
    kategori: "Bostadspolitik/hyresrätter",
  })];
  const res = importVallen({
    records, categoryMap: MAP, snapshotIndex: new Map(),
    transcriptIndex: new Map([["VID123", transcript]]),
    existingPromises: [], allowlist: ALLOW, now: NOW,
  });
  assert.equal(res.stats.publishable, 1, JSON.stringify(res.stats));
  assert.match(res.processedCandidates[0]!.verifyResult.reason, /transkript/);
  assert.equal(res.processedCandidates[0]!.article.domain, "youtube.com");
});

test("importVallen: youtube-källa UTAN transkript → review (G3)", () => {
  const records = [rec({ parti: "Centerpartiet (C)", kalla: "https://youtube.com/watch?v=NOPE", lovtext: "Något som sagts i ett tal men ej sparat någonstans alls." })];
  const res = importVallen({
    records, categoryMap: MAP, snapshotIndex: new Map(),
    transcriptIndex: new Map(),
    existingPromises: [], allowlist: ALLOW, now: NOW,
  });
  assert.equal(res.stats.publishable, 0);
  assert.ok(res.reviewItems[0]!.failures.some((f) => f.gate === "G3"));
});

test("importVallen: luddig dubbel mot befintligt publicerat → review med duplicateOf", () => {
  const quote = "Vi vill sänka skatten för alla som arbetar och har arbetat ett helt liv.";
  const snapIndex = new Map<string, string>([["moderaterna.se", quote]]);
  const existing: PipelinePromise[] = [{
    id: "p-2026-0001", group_id: null,
    title: "Sänka skatten för alla som arbetar och har arbetat",
    slug: "x", parties: ["m"], person: null, quote, date_stated: "2026-05-01",
    source: { url: "https://moderaterna.se/y", domain: "moderaterna.se", archive_url: null, fetched_at: "" },
    category: "skatter",
    cost: { type: "utgift", period: "per_ar", msek_low: 1, msek_base: 1, msek_high: 1, basis: "parti", basis_url: null, method_note: "x", confidence: 0.5 },
    financing_claimed: { described: false, summary: null, msek: null },
    comparisons: [], quip: "", status: "aktiv", history: [],
    extraction: { model: "x", verified_by: "x", run_id: "x" },
  }];
  const records = [rec({ lovtext: quote, kategori: "Ekonomi/Skatt" })];
  const res = importVallen({
    records, categoryMap: MAP, snapshotIndex: snapIndex,
    existingPromises: existing, allowlist: ALLOW, now: NOW,
  });
  assert.equal(res.stats.publishable, 0);
  assert.equal(res.reviewItems[0]!.duplicateOf, "p-2026-0001");
});
