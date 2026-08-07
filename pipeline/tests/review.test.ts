import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseReviewCommand,
  reviewId,
  findIndexByReviewId,
  approve,
  type ReviewCandidate,
} from "../src/review.ts";
import { computeDataHash } from "../src/publish.ts";
import { kanon, konyckel, type Provning } from "../src/provningar.ts";

describe("parseReviewCommand — issue-kommentar till beslut", () => {
  it("/godkänn utan argument", () => {
    assert.deepEqual(parseReviewCommand("/godkänn"), { action: "approve" });
    assert.deepEqual(parseReviewCommand("/approve"), { action: "approve" });
    assert.deepEqual(parseReviewCommand("/GODKÄNN  \nmed en radbrytning efter"), { action: "approve" });
  });

  it("/godkänn med tre belopp (ja med ändringarna)", () => {
    assert.deepEqual(parseReviewCommand("/godkänn 500 1000 2000"), {
      action: "approve",
      amounts: [500, 1000, 2000],
    });
  });

  it("en rad som börjar 'Uträkning:' blir uträkningen bakom beloppet", () => {
    assert.deepEqual(
      parseReviewCommand("/godkänn 500 1000 2000\nUträkning: 50 000 personer × 20 000 kr = 1 000 mkr"),
      {
        action: "approve",
        amounts: [500, 1000, 2000],
        calculation: "50 000 personer × 20 000 kr = 1 000 mkr",
      },
    );
  });

  it("omärkt fritext under kommandot publiceras ALDRIG som uträkning", () => {
    // Skyddet mot att en kommentar av misstag hamnar på den publika löftessidan.
    assert.deepEqual(parseReviewCommand("/godkänn 500 1000 2000\ntack, ser bra ut!"), {
      action: "approve",
      amounts: [500, 1000, 2000],
    });
  });

  it("en signatur under en vågrät linje följer inte med ut på löftessidan", () => {
    // Det som faktiskt hände: kommentaren bar en automatisk signatur under en
    // rad med tre bindestreck, och hela signaturen hamnade i den publicerade
    // uträkningen för p-2026-0580.
    const cmd = parseReviewCommand(
      "/godkänn 0 0 0\nUträkning: Löftet pekar varken ut en åtgärd eller en nivå.\n\n---\n_Genererad av något verktyg_",
    );
    assert.deepEqual(cmd, {
      action: "approve",
      amounts: [0, 0, 0],
      calculation: "Löftet pekar varken ut en åtgärd eller en nivå.",
    });
  });

  it("understreck och asterisker som vågrät linje kapar också", () => {
    for (const linje of ["___", "***", "-----"]) {
      const cmd = parseReviewCommand(`/godkänn\nUträkning: Beloppet är noll.\n${linje}\nsignatur`);
      assert.equal(
        (cmd as { calculation?: string }).calculation,
        "Beloppet är noll.",
        `föll på ${linje}`,
      );
    }
  });

  it("bindestreck mitt i en mening kapar inte", () => {
    const cmd = parseReviewCommand(
      "/godkänn\nUträkning: Anslaget höjs från 8 till 16 mkr — en ökning på 8 mkr per år.",
    );
    assert.equal(
      (cmd as { calculation?: string }).calculation,
      "Anslaget höjs från 8 till 16 mkr — en ökning på 8 mkr per år.",
    );
  });

  it("uträkningen kapas till schemats gräns på 800 tecken", () => {
    const cmd = parseReviewCommand("/godkänn\nUträkning: " + "x".repeat(1200));
    assert.equal(cmd?.action, "approve");
    assert.equal((cmd as { calculation?: string }).calculation?.length, 800);
  });

  it("/godkänn med --group (dublettlänkning)", () => {
    assert.deepEqual(parseReviewCommand("/godkänn --group p-2026-0318"), {
      action: "approve",
      group: "p-2026-0318",
    });
    assert.deepEqual(parseReviewCommand("/godkänn 1 2 3 --group p-2026-0001"), {
      action: "approve",
      amounts: [1, 2, 3],
      group: "p-2026-0001",
    });
  });

  // En kö-post utan färdig kostnad hade ingen kostnadstyp att ärva och föll
  // tillbaka på "utgift". Två skattesänkningar publicerades därför som utgifter
  // (p-2026-0592, p-2026-0593). Typen ska kunna anges i samma kommando.
  it("/godkänn med --typ (kostnadstyp när posten saknar egen)", () => {
    assert.deepEqual(parseReviewCommand("/godkänn 2000 4500 9000 --typ intäktsminskning"), {
      action: "approve",
      amounts: [2000, 4500, 9000],
      costType: "intäktsminskning",
    });
    assert.deepEqual(parseReviewCommand("/godkänn 1 2 3 --typ=besparing --group p-2026-0001"), {
      action: "approve",
      amounts: [1, 2, 3],
      group: "p-2026-0001",
      costType: "besparing",
    });
  });

  it("okänd kostnadstyp ⇒ null (blir aldrig tyst en utgift)", () => {
    assert.equal(parseReviewCommand("/godkänn 1 2 3 --typ intaktsminskning"), null);
    assert.equal(parseReviewCommand("/godkänn 1 2 3 --typ skattesänkning"), null);
  });

  it("fel antal belopp ⇒ null (be om förtydligande, gissa aldrig)", () => {
    assert.equal(parseReviewCommand("/godkänn 500 1000"), null);
    assert.equal(parseReviewCommand("/godkänn femhundra"), null);
  });

  it("/avvisa med och utan skäl", () => {
    assert.deepEqual(parseReviewCommand("/avvisa slogan, inget löfte"), {
      action: "reject",
      reason: "slogan, inget löfte",
    });
    assert.deepEqual(parseReviewCommand("/avvisa"), {
      action: "reject",
      reason: "avvisad via review-issue",
    });
  });

  it("icke-kommandon ⇒ null (vanliga kommentarer exekverar aldrig något)", () => {
    assert.equal(parseReviewCommand("ser rimligt ut, tar det imorgon"), null);
    assert.equal(parseReviewCommand("godkänn"), null);
    assert.equal(parseReviewCommand("/publicera"), null);
  });
});

describe("reviewId — stabil nyckel för issue ↔ kö-post", () => {
  const entry = (url: string, title: string): ReviewCandidate =>
    ({ candidate: { title }, failures: [], articleUrl: url, articleTitle: title }) as ReviewCandidate;

  it("deterministiskt och 12 hex-tecken", () => {
    const a = reviewId(entry("https://x.se/a", "Löfte A"));
    assert.match(a, /^[0-9a-f]{12}$/);
    assert.equal(a, reviewId(entry("https://x.se/a", "Löfte A")));
    assert.notEqual(a, reviewId(entry("https://x.se/a", "Löfte B")));
  });

  it("findIndexByReviewId överlever att kön förskjuts", () => {
    const items = [entry("https://x.se/a", "A"), entry("https://x.se/b", "B"), entry("https://x.se/c", "C")];
    const idB = reviewId(items[1]!);
    assert.equal(findIndexByReviewId(items, idB), 1);
    items.splice(0, 1); // posten före tas bort — index förskjuts
    assert.equal(findIndexByReviewId(items, idB), 0);
    assert.equal(findIndexByReviewId(items, "ffffffffffff"), -1);
  });
});

describe("approve — synkar changelog + data_hash vid godkännande", () => {
  const pub = {
    id: "p-2026-0001", group_id: null, title: "Befintligt", slug: "befintligt",
    parties: ["s"], person: null, quote: "q", date_stated: "2026-01-01",
    source: { url: "https://x.se", domain: "x.se", archive_url: null, fetched_at: "2026-01-01T00:00:00Z" },
    category: "övrigt",
    cost: { type: "utgift", period: "per_ar", msek_low: 1, msek_base: 2, msek_high: 3, basis: "media", basis_url: null, method_note: "", confidence: 0.9 },
    financing_claimed: { described: false, summary: null, msek: null },
    comparisons: [], quip: null, status: "aktiv", history: [],
    extraction: { model: "x", verified_by: "y", run_id: "r" },
  };
  const queueItem: ReviewCandidate = {
    candidate: { title: "Nytt löfte", parties: ["m"], quote: "Vi vill X.", category: "skatter", person: null, amount_in_text_msek: null },
    failures: [], articleUrl: "https://y.se/a", articleTitle: "A",
    cost: { type: "utgift", period: "per_ar", msek_low: 100, msek_base: 200, msek_high: 300, basis: "llm_estimat", basis_url: null, method_note: "note", confidence: 0.5 },
  };

  /**
   * Kö-posten prövad, med hashen räknad på löftet som faktiskt publiceras.
   *
   * `approve()` sätter `basis: "llm_estimat"` från kö-posten, `status: "aktiv"`
   * och `group_id: null` — samma form som `kopost_som_lofte()` i `logg.py`
   * bygger. Räknas hashen på något annat blir prövningen gammal i samma stund
   * beslutet verkställs.
   */
  function skrivProvning(dir: string, over: Partial<Provning> = {}): void {
    const somPublicerat = {
      quote: queueItem.candidate!.quote,
      title: queueItem.candidate!.title,
      parties: queueItem.candidate!.parties,
      status: "aktiv",
      group_id: null,
      source: { url: queueItem.articleUrl },
      cost: queueItem.cost,
    };
    const post: Provning = {
      id: konyckel(queueItem.articleUrl, queueItem.candidate!.quote),
      slag: "lofte",
      datum: "2026-08-07",
      utfall: "haller",
      underlag_hash: kanon("lofte", somPublicerat),
      ...over,
    };
    writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [post] }));
  }

  it("appendar en changelog-post vars data_hash matchar de faktiska löftena", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-approve-"));
    try {
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([
        { run_id: "seed", added: [], updated: [], retracted: [], data_hash: "old", timestamp: "2026-01-01T00:00:00Z" },
      ]));
      skrivProvning(dir);

      const res = approve(["0"], dir);

      const promises = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
      const queueAfter = JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8"));
      const changelog = JSON.parse(readFileSync(join(dir, "changelog.json"), "utf8"));
      const last = changelog[changelog.length - 1];

      assert.equal(promises.length, 2, "nytt löfte publicerat");
      assert.equal(queueAfter.length, 0, "kö-posten borttagen");
      assert.equal(changelog.length, 2, "changelog appenderad, ej överskriven");
      assert.deepEqual(last.added, [res.id]);
      assert.deepEqual(last.updated, []);
      assert.deepEqual(last.retracted, []);
      assert.equal(last.data_hash, computeDataHash(promises), "hashen matchar promises.json");
      assert.match(last.run_id, /^review-p-2026-\d{4}$/);
      assert.ok(last.timestamp, "timestamp satt (matar 'senast uppdaterad')");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Grinden måste sitta i själva godkännandevägen. Att `provningsGrind` svarar
  // rätt för sig (provningar.test.ts) säger ingenting om att någon frågar den.
  function godkannIEgenProcess(dir: string): { kod: number | null; ut: string } {
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx/esm", join(import.meta.dirname, "fixtures/godkann-en.mts"), dir],
      { encoding: "utf8" },
    );
    return { kod: r.status, ut: (r.stdout ?? "") + (r.stderr ?? "") };
  }

  function baddat(over?: Partial<Provning> | null): string {
    const dir = mkdtempSync(join(tmpdir(), "review-grind-"));
    writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
    writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
    writeFileSync(join(dir, "changelog.json"), JSON.stringify([
      { run_id: "seed", added: [], updated: [], retracted: [], data_hash: "old", timestamp: "2026-01-01T00:00:00Z" },
    ]));
    if (over !== null) skrivProvning(dir, over ?? {});
    return dir;
  }

  it("vägrar godkänna en kö-post som inte gått genom kvalitetsfiltret", () => {
    const dir = baddat(null);
    try {
      const { kod, ut } = godkannIEgenProcess(dir);
      assert.notEqual(kod, 0, "godkännandet ska falla");
      assert.match(ut, /kvalitetsfiltret/);
      const promises = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
      assert.equal(promises.length, 1, "ingenting fick skrivas");
      assert.equal(
        JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")).length,
        1,
        "kö-posten ligger kvar",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("vägrar godkänna en post vars prövning slutade att den inte höll", () => {
    const dir = baddat({ utfall: "haller-inte" });
    try {
      const { kod, ut } = godkannIEgenProcess(dir);
      assert.notEqual(kod, 0);
      assert.match(ut, /höll inte/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Sätts beloppet för hand vid godkännandet är det inte längre den sak som
  // prövades. Att släppa igenom det hade gjort grinden till en formalitet:
  // pröva nollposten, godkänn med tjugo miljarder.
  it("vägrar godkänna med ett annat belopp än det prövade", () => {
    const dir = baddat();
    try {
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", join(import.meta.dirname, "fixtures/godkann-en.mts"), dir],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 0, "det prövade beloppet går igenom");

      const dir2 = baddat({ underlag_hash: "0000000000000000" });
      try {
        const { kod, ut } = godkannIEgenProcess(dir2);
        assert.notEqual(kod, 0);
        assert.match(ut, /ändrats/);
      } finally {
        rmSync(dir2, { recursive: true, force: true });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("släpper igenom ett löfte som håller med förbehåll", () => {
    const dir = baddat({ utfall: "haller-med-forbehall" });
    try {
      const { kod } = godkannIEgenProcess(dir);
      assert.equal(kod, 0, "förbehåll är inget hinder — det skrivs ut, inte stoppas");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
