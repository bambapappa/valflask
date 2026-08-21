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
    cost: { type: "utgift", period: "per_ar", msek_low: 100, msek_base: 200, msek_high: 300, basis: "llm_estimat", basis_url: null, method_note: "note", calculation: "200 000 mottagare × 1 000 kronor = 200 miljoner kronor per år.", confidence: 0.5 },
  };

  /**
   * Samma kö-post, fast med kostnadsstegets haveri: siffror finns,
   * uträkningen saknas, och noten bär maskinens felmeddelande. Det är i den
   * formen posterna faktiskt ligger i kön — 39 av 110 den 2026-08-14.
   */
  const havereradKopost: ReviewCandidate = {
    ...queueItem,
    cost: {
      type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0,
      basis: "llm_estimat", basis_url: null, confidence: 0.1,
      method_note: "LLM-kostnadssvar saknade giltiga tal — belopp MÅSTE sättas manuellt.",
    },
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

  /**
   * Källnivån ska beskriva det belopp som står bredvid den — inte det belopp
   * kö-posten råkade bära.
   *
   * Mätt 2026-08-15: kö-postens `basis` ärvdes rakt av när granskaren satte ett
   * eget belopp, så en handsatt siffra publicerades som `llm_estimat`. Följden
   * syns i beståndet: 345 av 425 granskade löften bar den etiketten, och **noll
   * av 134 kö-poster** vilade på partiets egen siffra — regeln att partiets
   * egen siffra gäller gick helt enkelt inte att uttrycka i verktyget.
   */
  // Notera hur provet FALLER: `approve()` avslutar processen när grinden
  // stoppar, så ett infört fel dödar hela filen i stället för att ge ett
  // enskilt «not ok». Utfallskoden blir ändå 1 — bevisat mot två införda fel:
  // att ärva kö-postens basis igen, och att sluta ta emot --basis.
  it("källnivån följer beloppet, inte kö-posten", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-basis-"));
    try {
      /** Baddar om katalogen och prövar den FÖRESLAGNA formen, som grinden kräver. */
      const badda = (cost: Record<string, unknown>) => {
        writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
        writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
        writeFileSync(join(dir, "changelog.json"), JSON.stringify([
          { run_id: "seed", added: [], updated: [], retracted: [], data_hash: "old", timestamp: "2026-01-01T00:00:00Z" },
        ]));
        const somPublicerat = {
          quote: queueItem.candidate!.quote,
          title: queueItem.candidate!.title,
          parties: queueItem.candidate!.parties,
          status: "aktiv",
          group_id: null,
          source: { url: queueItem.articleUrl },
          cost,
        };
        writeFileSync(join(dir, "provningar.json"), JSON.stringify({
          poster: [{
            id: konyckel(queueItem.articleUrl, queueItem.candidate!.quote),
            slag: "lofte", datum: "2026-08-15", utfall: "haller",
            underlag_hash: kanon("lofte", somPublicerat),
          }],
        }));
      };

      // Utan --basis: en människa satte beloppet, och då säger fältet det.
      // Kö-postens `llm_estimat` får INTE följa med — modellen står inte bakom
      // siffran längre.
      badda({ type: "utgift", period: "per_ar", msek_low: 50, msek_base: 60, msek_high: 70,
              basis: "granskare", calculation: "60 mkr enligt regeln." });
      approve(["0", "50", "60", "70", "--calc", "60 mkr enligt regeln."], dir);
      let p = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")) as Array<{ cost: { basis: string; basis_url: string | null; msek_base: number } }>;
      assert.equal(p.find((x) => x.cost.msek_base === 60)!.cost.basis, "granskare",
        "handsatt belopp märks som granskarens, inte som modellens");

      // Med --basis parti: partiets egen siffra går att märka som partiets, och
      // adressen till där den står följer med.
      badda({ type: "utgift", period: "per_ar", msek_low: 7000, msek_base: 7000, msek_high: 7000,
              basis: "parti", calculation: "Partiets egen siffra." });
      approve(["0", "7000", "7000", "7000", "--calc", "Partiets egen siffra.",
               "--basis", "parti", "--basis-url", "https://parti.se/loftet"], dir);
      p = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")) as Array<{ cost: { basis: string; basis_url: string | null; msek_base: number } }>;
      const partipost = p.find((x) => x.cost.msek_base === 7000)!;
      assert.equal(partipost.cost.basis, "parti");
      assert.equal(partipost.cost.basis_url, "https://parti.se/loftet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Perioden ska beskriva det belopp som står bredvid den.
   *
   * Ett parti som anger en summa över tio eller femton år levererar en kö-post
   * med `period: "engang"`. Ärvs den rakt av bokförs hela summan i det
   * fyraåriga fönstret: Vänsterpartiets 700 miljarder över tio år och
   * Miljöpartiets 150 miljarder över femton–tjugo år stod bägge så, alltså 536
   * miljarder som aldrig hörde hemma i mandatperioden. Att räkna om till en
   * årstakt kräver att perioden byts i SAMMA steg som beloppet.
   */
  it("perioden följer beloppet — en tioårssumma blir en årstakt, inte ett engångsbelopp", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-period-"));
    try {
      // Kö-posten som partiet levererar den: hela tioårssumman, som en gång.
      const tioarssumma: ReviewCandidate = {
        ...queueItem,
        cost: { ...queueItem.cost!, period: "engang", msek_low: 525_000, msek_base: 700_000, msek_high: 945_000 },
      };
      const badda = (cost: Record<string, unknown>) => {
        writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
        writeFileSync(join(dir, "needs_review.json"), JSON.stringify([tioarssumma]));
        writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
        writeFileSync(join(dir, "provningar.json"), JSON.stringify({
          poster: [{
            id: konyckel(tioarssumma.articleUrl, tioarssumma.candidate!.quote),
            slag: "lofte", datum: "2026-08-21", utfall: "haller",
            underlag_hash: kanon("lofte", {
              quote: tioarssumma.candidate!.quote, title: tioarssumma.candidate!.title,
              parties: tioarssumma.candidate!.parties, status: "aktiv", group_id: null,
              source: { url: tioarssumma.articleUrl }, cost,
            }),
          }],
        }));
      };
      const calc = "700 miljarder över tio år ger 70 000 miljoner kronor per år.";
      badda({ type: "utgift", period: "per_ar", msek_low: 52_500, msek_base: 70_000, msek_high: 94_500,
              basis: "granskare", calculation: calc });

      approve(["0", "52500", "70000", "94500", "--period", "per_ar", "--calc", calc], dir);

      const promises = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")) as Array<{ cost: { period: string; msek_base: number } }>;
      const publicerat = promises.find((x) => x.cost.msek_base === 70_000)!;
      assert.equal(publicerat.cost.period, "per_ar",
        "perioden är den granskaren angav, inte kö-postens engang");
      // Det är summan över mandatperioden som felet handlade om: 280 miljarder,
      // inte 700. Utan flaggan blir talet 700 000 gånger ett.
      assert.equal(publicerat.cost.msek_base * 4, 280_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("en okänd period stoppar godkännandet i stället för att tyst ärva kö-postens", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-period-fel-"));
    try {
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
      writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [] }));
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", "-e",
         `import {approve} from ${JSON.stringify(join(import.meta.dirname, "../src/review.ts"))};` +
         `approve(["0","1","1","1","--calc","x","--period","per_år"], ${JSON.stringify(dir)});`],
        { encoding: "utf8" },
      );
      assert.notEqual(r.status, 0, "okänd period ska stoppa godkännandet");
      assert.match((r.stdout ?? "") + (r.stderr ?? ""), /Okänd period/u);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Ett löfte är partiets eget ord ur partiets egen källa.
   *
   * Kö-posten «Socialdemokraterna lovar att införa bolåneskatt» låg på
   * moderaterna.se — Moderaternas kampanjsida OM Socialdemokraterna. Citatet är
   * motståndarens beskrivning, och posten var på väg att publiceras som ett
   * socialdemokratiskt löfte på 9 000 miljoner kronor per år. `failures` var tom:
   * ingen grind tittade på vems sajt källan låg på.
   */
  it("vägrar publicera ett löfte vars källa ligger på ett annat partis sajt", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-motpart-"));
    try {
      const motpartskalla: ReviewCandidate = {
        ...queueItem,
        articleUrl: "https://moderaterna.se/var-politik/bolaneskatt/",
        articleTitle: "Bolåneskatt | Moderaterna",
        candidate: { ...queueItem.candidate!, parties: ["s"], title: "Socialdemokraterna lovar att införa bolåneskatt" },
      };
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([motpartskalla]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
      writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [] }));
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", "-e",
         `import {approve} from ${JSON.stringify(join(import.meta.dirname, "../src/review.ts"))};` +
         `approve(["0"], ${JSON.stringify(dir)});`],
        { encoding: "utf8" },
      );
      assert.notEqual(r.status, 0, "motpartens sajt får inte bli partiets löfte");
      assert.match((r.stdout ?? "") + (r.stderr ?? ""), /Källan tillhör ett annat parti/u);
      const kvar = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
      assert.equal(kvar.length, 1, "inget publicerades");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Motsatsen måste också hålla: partiets egen sajt stoppas INTE, och en källa
  // som inte är någon partisajt alls (riksdagen, en tidning) rörs inte heller.
  it("partiets egen sajt och icke-partisajter passerar grinden", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-egen-kalla-"));
    try {
      const badda = (post: ReviewCandidate) => {
        writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
        writeFileSync(join(dir, "needs_review.json"), JSON.stringify([post]));
        writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
        writeFileSync(join(dir, "provningar.json"), JSON.stringify({
          poster: [{
            id: konyckel(post.articleUrl, post.candidate!.quote),
            slag: "lofte", datum: "2026-08-21", utfall: "haller",
            underlag_hash: kanon("lofte", {
              quote: post.candidate!.quote, title: post.candidate!.title,
              parties: post.candidate!.parties, status: "aktiv", group_id: null,
              source: { url: post.articleUrl }, cost: post.cost,
            }),
          }],
        }));
      };
      const egen: ReviewCandidate = {
        ...queueItem, articleUrl: "https://moderaterna.se/var-politik/skatter/",
        candidate: { ...queueItem.candidate!, parties: ["m"] },
      };
      badda(egen);
      approve(["0"], dir);
      assert.equal(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).length, 2,
        "partiets egen sajt passerar");

      const media: ReviewCandidate = {
        ...queueItem, articleUrl: "https://www.svt.se/nyheter/valet-2026",
        candidate: { ...queueItem.candidate!, parties: ["m"] },
      };
      badda(media);
      approve(["0"], dir);
      assert.equal(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).length, 2,
        "en källa som inte är någon partisajt rörs inte av regeln");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Noten beskriver hur beloppet kommit till, och måste beskriva DET belopp som
   * står bredvid.
   *
   * Regeln fanns för uträkningen men inte för noten, så kö-postens beskrivning
   * följde med ett nytt belopp. Sju löften som sattes till noll 2026-08-21 bar
   * noter som «prissatt som statens stödandel …» intill en nolla.
   */
  it("noten följer beloppet — kö-postens beskrivning följer inte med ett nytt", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-note-"));
    try {
      const badda = (cost: Record<string, unknown>) => {
        writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
        writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
        writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
        writeFileSync(join(dir, "provningar.json"), JSON.stringify({
          poster: [{
            id: konyckel(queueItem.articleUrl, queueItem.candidate!.quote),
            slag: "lofte", datum: "2026-08-21", utfall: "haller",
            underlag_hash: kanon("lofte", {
              quote: queueItem.candidate!.quote, title: queueItem.candidate!.title,
              parties: queueItem.candidate!.parties, status: "aktiv", group_id: null,
              source: { url: queueItem.articleUrl }, cost,
            }),
          }],
        }));
      };
      const calc = "Delarna prissätts på sina egna löften, så posten bär inget belopp.";
      badda({ type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0,
              basis: "granskare", calculation: calc });

      approve(["0", "0", "0", "0", "--calc", calc], dir);
      let p = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")) as Array<{ cost: { method_note: string; msek_base: number } }>;
      const nollad = p.find((x) => x.cost.msek_base === 0 && x.cost.method_note !== undefined)!;
      assert.equal(nollad.cost.method_note, "(belopp satt av granskare)",
        "kö-postens note om ett annat belopp följer inte med");
      assert.ok(!nollad.cost.method_note.includes("note"), "den ärvda texten är borta");

      // Och granskaren kan skriva en egen som beskriver det belopp som står där.
      badda({ type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0,
              basis: "granskare", calculation: calc });
      approve(["0", "0", "0", "0", "--calc", calc, "--note", "Delarna bär priset på sina egna löften."], dir);
      p = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
      const egen = p.filter((x) => x.cost.msek_base === 0).at(-1)!;
      assert.equal(egen.cost.method_note, "Delarna bär priset på sina egna löften. (belopp satt av granskare)");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Taket på uträkningen gällde bara `--calc`. En ÄRVD uträkning gick förbi:
   * p-2026-2209 publicerades med 803 tecken och fälldes först av schemaprovet,
   * efter att löftet redan låg i promises.json.
   */
  it("stoppar en ärvd uträkning som är längre än schemat tillåter", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-lang-calc-"));
    try {
      const langCalc = "A".repeat(801);
      const lang: ReviewCandidate = {
        ...queueItem,
        cost: { ...queueItem.cost!, calculation: langCalc },
      };
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([lang]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
      writeFileSync(join(dir, "provningar.json"), JSON.stringify({
        poster: [{
          id: konyckel(lang.articleUrl, lang.candidate!.quote),
          slag: "lofte", datum: "2026-08-21", utfall: "haller",
          underlag_hash: kanon("lofte", {
            quote: lang.candidate!.quote, title: lang.candidate!.title,
            parties: lang.candidate!.parties, status: "aktiv", group_id: null,
            source: { url: lang.articleUrl }, cost: lang.cost,
          }),
        }],
      }));
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", "-e",
         `import {approve} from ${JSON.stringify(join(import.meta.dirname, "../src/review.ts"))};` +
         `approve(["0"], ${JSON.stringify(dir)});`],
        { encoding: "utf8" },
      );
      assert.notEqual(r.status, 0, "för lång uträkning ska stoppa godkännandet");
      assert.match((r.stdout ?? "") + (r.stderr ?? ""), /801 tecken; taket är 800/u);
      assert.equal(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).length, 1,
        "inget publicerades");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * Interna beteckningar hör inte hemma i text som möter läsaren, och regeln
   * måste gälla FÖRE publiceringen.
   *
   * Den låg bara i provsviten. `p-2026-2250` godkändes 2026-08-21 med
   * «p-2026-1212» i både uträkning och not, och fälldes först av sviten — när
   * löftet redan låg i promises.json och grenen var röd.
   */
  it("vägrar publicera en uträkning som bär ett internt löftesnummer", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-internt-id-"));
    try {
      const calc = "Bas 5 msek/år ankrat i jämförbart löfte om trålförbud (p-2026-1212 ≈ 5 msek/år).";
      const medId: ReviewCandidate = {
        ...queueItem,
        cost: { ...queueItem.cost!, calculation: calc },
      };
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([medId]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
      writeFileSync(join(dir, "provningar.json"), JSON.stringify({
        poster: [{
          id: konyckel(medId.articleUrl, medId.candidate!.quote),
          slag: "lofte", datum: "2026-08-21", utfall: "haller",
          underlag_hash: kanon("lofte", {
            quote: medId.candidate!.quote, title: medId.candidate!.title,
            parties: medId.candidate!.parties, status: "aktiv", group_id: null,
            source: { url: medId.articleUrl }, cost: medId.cost,
          }),
        }],
      }));
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", "-e",
         `import {approve} from ${JSON.stringify(join(import.meta.dirname, "../src/review.ts"))};` +
         `approve(["0"], ${JSON.stringify(dir)});`],
        { encoding: "utf8" },
      );
      assert.notEqual(r.status, 0, "ett internt nummer i publik text ska stoppa godkännandet");
      assert.match((r.stdout ?? "") + (r.stderr ?? ""), /intern beteckning/u);
      assert.match((r.stdout ?? "") + (r.stderr ?? ""), /p-2026-1212/u, "säger vilket nummer det gäller");
      assert.equal(JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).length, 1,
        "inget publicerades");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("en okänd källnivå stoppar godkännandet i stället för att tyst bli något annat", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-basis-fel-"));
    try {
      writeFileSync(join(dir, "promises.json"), JSON.stringify([pub]));
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([queueItem]));
      writeFileSync(join(dir, "changelog.json"), JSON.stringify([]));
      writeFileSync(join(dir, "provningar.json"), JSON.stringify({ poster: [] }));
      const r = spawnSync(
        process.execPath,
        ["--import", "tsx/esm", "-e",
         `import {approve} from ${JSON.stringify(join(import.meta.dirname, "../src/review.ts"))};` +
         `approve(["0","1","1","1","--calc","x","--basis","hittepa"], ${JSON.stringify(dir)});`],
        { encoding: "utf8" },
      );
      assert.notEqual(r.status, 0, "okänd källnivå ska stoppa godkännandet");
      assert.match((r.stdout ?? "") + (r.stderr ?? ""), /Okänd källnivå/u);
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

  /**
   * Uträkningen är offentlig, och det måste gälla vid publiceringspunkten.
   * Kontrollen låg tidigare som en varning i den gren som körs när granskaren
   * sätter ett NYTT belopp — men de havererade posterna godkänns oftast som de
   * står, och den vägen fanns ingen kontroll alls. Tre löften publicerades så.
   */
  it("vägrar godkänna en post vars uträkning saknas", () => {
    const dir = baddat();
    try {
      writeFileSync(join(dir, "needs_review.json"), JSON.stringify([havereradKopost]));
      const { kod, ut } = godkannIEgenProcess(dir);
      assert.notEqual(kod, 0, "godkännandet ska falla");
      assert.match(ut, /Uträkningen saknas/);
      assert.equal(
        JSON.parse(readFileSync(join(dir, "promises.json"), "utf8")).length,
        1,
        "ingenting fick publiceras",
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
