/**
 * Diagnostiken över insamlingens förlustpunkter.
 *
 * Kedjan är källa → artikel → kandidat → kö → publicerat löfte, och två steg
 * mättes inte. Ett flöde som FÖLL skrev samma nolla i `stats` som ett flöde
 * som svarade utan nyheter — skillnaden stod bara i loggen, och en mätning som
 * läser resultatet kan inte skilja saknade data från noll. Och `bySource`
 * stannade vid `succeeded`: en källa som lästes varje körning utan att någonsin
 * lämna en kandidat räknades som en källa som fungerade.
 *
 * Proven nedan mäter båda stegen mot den riktiga koden, inte mot en fixtur
 * skriven ur samma antagande: `LiveSource` körs med mockad HTTP, och
 * kandidaträkningen mäts genom `runPipeline` på den fixtur som redan bär en
 * verklig kandidat.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { LiveSource, MemorySource, type HttpFetchFn } from "../src/fetch.ts";
import { mockArchive } from "../src/archive.ts";
import { runPipeline, type PipelineContext } from "../src/index.ts";
import type { LlmClient, LlmOptions } from "../src/llm.ts";
import type { NormalizedArticle } from "../src/gates.ts";

const RSS_TOMT =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>Tomt</title></channel></rss>';

describe("flödenas utfall skiljer ett fel från en nolla", () => {
  // FÄLLS AV: att skriva `{ hamtade: 0, fel: null }` i catch-grenen. Då är de
  // två raderna nedan identiska och provet kan inte se vilket flöde som föll.
  test("ett flöde som faller bär felet, ett tomt flöde bär ingen", async () => {
    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url.includes("spärrat.example")) throw new Error("HTTP 403 från spärrad källa");
      return new Response(RSS_TOMT, { status: 200, headers: { "content-type": "application/xml" } });
    };

    const source = new LiveSource({
      feeds: [
        { id: "sparrat", type: "rss", url: "https://spärrat.example/feed/" },
        { id: "tomt", type: "rss", url: "https://tomt.example/feed/" },
      ],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    await source.fetch();
    const utfall = source.getFlodesutfall();

    assert.equal(utfall.size, 2, "båda flödena ska finnas i utfallet");
    assert.match(utfall.get("sparrat")!.fel ?? "", /403/u, "det fallna flödet bär felet");
    assert.equal(utfall.get("sparrat")!.hamtade, 0);
    assert.equal(utfall.get("tomt")!.fel, null, "ett tomt svar är inget fel");
    assert.equal(utfall.get("tomt")!.hamtade, 0);
    // Den gamla mätaren kan inte skilja dem åt — det är hela skälet till fältet.
    assert.equal(source.getStats().get("sparrat"), source.getStats().get("tomt"));
  });

  // FÄLLS AV: att inte skriva utfallet i den LYCKADE grenen. Då står felet
  // från den fallna körningen kvar och beskriver ett läge som är över.
  //
  // `this.flodesutfall.clear()` i `fetch` mäts INTE av det här provet: varje
  // flöde får en ny rad i varje körning, så nollställningen syns bara om
  // flödeslistan krymper mellan två körningar, och den sätts i konstruktorn.
  // Raden står kvar som ett försvar, inte som en mätt regel.
  test("ett återförsök som lyckas lämnar inget fel kvar", async () => {
    let forsta = true;
    const rssMedPost =
      '<?xml version="1.0"?><rss version="2.0"><channel><item>' +
      "<title>Ett löfte</title><link>https://vackligt.example/artikel/</link>" +
      `<description>${"Vi lovar mer av det goda. ".repeat(6)}</description>` +
      "</item></channel></rss>";
    const mockFetch: HttpFetchFn = async (url) => {
      if (url.includes("robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (forsta) throw new Error("tillfälligt nätfel");
      return new Response(rssMedPost, { status: 200, headers: { "content-type": "application/xml" } });
    };

    const source = new LiveSource({
      feeds: [{ id: "vackligt", type: "rss", url: "https://vackligt.example/feed/" }],
      limits: { max_articles_per_run: 50, min_chars: 10 },
      httpFetch: mockFetch,
    });

    await source.fetch();
    assert.match(source.getFlodesutfall().get("vackligt")!.fel ?? "", /nätfel/u);

    forsta = false;
    const artiklar = await source.fetch();
    assert.equal(source.getFlodesutfall().get("vackligt")!.fel, null, "återförsöket lyckades");
    assert.ok(artiklar.length > 0, "och gav artiklar");
    assert.equal(source.getFlodesutfall().get("vackligt")!.hamtade, artiklar.length);
  });
});

describe("kandidaträkningen per källa", () => {
  interface Fixtur {
    article: NormalizedArticle;
    extractResponse: string;
    verifyResponse: string;
    quipResponse: string;
  }
  const f = JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "fixtures", "normal-1.json"), "utf8"),
  ) as Fixtur;

  class MockLlm implements LlmClient {
    async complete(_prompt: string, opts?: LlmOptions): Promise<string> {
      const sys = opts?.systemPrompt ?? "";
      if (sys.includes("extraktionsmotor")) return f.extractResponse;
      if (sys.includes("oberoende granskare")) return f.verifyResponse;
      if (sys.includes("stenograf")) return f.quipResponse;
      return '{"error":"okänd anropstyp"}';
    }
  }

  async function kor(artiklar: NormalizedArticle[], opts?: { allowlist?: string[] }) {
    const dir = mkdtempSync(join(tmpdir(), "insamlingsdiagnostik-"));
    writeFileSync(join(dir, "promises.json"), "[]\n");
    const ctx: PipelineContext = {
      now: new Date("2026-06-12T06:00:00Z"),
      runId: "diagnostikprov",
      llm: new MockLlm(),
      articleSource: new MemorySource(artiklar),
      outputDir: dir,
      dataDir: dir,
      allowlist: opts?.allowlist ?? ["dn.se"],
      mode: "review",
      archiveFn: mockArchive,
      samtidigaArtiklar: 1,
      models: { extract: "mock", verify: "mock", copy: "mock", kostnad: "mock" },
    };
    try {
      return await runPipeline(ctx);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // FÄLLS AV: att räkna noll i stället för postens antal.
  test("en källa som lämnar poster räknas, och summan är körningens kö", async () => {
    const r = await kor([f.article]);
    const rader = Object.values(r.runStats.bySource);
    assert.equal(rader.length, 1);
    assert.equal(rader[0]!.attempted, 1);
    assert.equal(rader[0]!.succeeded, 1);
    assert.ok(rader[0]!.kandidater > 0, `källan lämnade poster: ${rader[0]!.kandidater}`);
    assert.equal(
      rader.reduce((s, m) => s + m.kandidater, 0),
      r.runStats.kandidater,
      "källornas poster summerar till körningens",
    );
  });

  // FÄLLS AV: att räkna bara `ut.kandidater` och hoppa över `ut.gateReview`.
  // Källan nedan ger INGEN kandidat — den ger ett grindavslag, och det är
  // skillnaden mellan en källa utan löften och en källa vi inte kan läsa.
  test("en källa som bara ger grindavslag räknas också", async () => {
    const r = await kor([f.article], { allowlist: ["ingen-sadan-doman.example"] });
    const rader = Object.values(r.runStats.bySource);
    assert.equal(rader.length, 1);
    assert.equal(rader[0]!.succeeded, 1, "artikeln lästes utan fel");
    assert.equal(r.runStats.reviewCandidates, 1, "posten är ett grindavslag");
    assert.equal(rader[0]!.kandidater, 1, "och räknas på källan");
  });

  // FÄLLS AV: att fylla `floden` med nollor när källan inte kan svara. Då ser
  // ett omätt läge ut som en mätning där ingenting hände.
  test("en källa som inte kan mäta flöden rapporterar inte noll", async () => {
    const r = await kor([f.article]);
    assert.equal(r.runStats.floden, undefined, "MemorySource har inga flöden att rapportera");
  });
});
