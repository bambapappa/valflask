/**
 * Takten får inte ändra utfallet.
 *
 * Körningen bearbetar artiklar samtidigt sedan 2026-08-18. Vinsten är hela
 * skälet — körningarna tog 201–325 minuter och nästan allt var väntan — men
 * priset om det görs slarvigt är att kön hamnar i den ordning svaren råkade
 * komma i stället för den ordning artiklarna låg i. Då blir två körningar på
 * samma indata olika, dubblettkollen inom en körning pekar ut fel post som
 * originalet, och snapshot-provet fäller på slumpen.
 *
 * Provet mäter det undantaget: LLM-attrappen svarar LÅNGSAMMAST på den första
 * artikeln och snabbast på den sista, så att den ordning svaren kommer i är
 * den omvända mot indata. Skrivs resultaten ner när de blir klara faller
 * jämförelsen nedan. Skrivs de ner i indataordning håller den.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import type { LlmClient, LlmOptions } from "../src/llm.ts";
import type { NormalizedArticle } from "../src/gates.ts";
import { MemorySource } from "../src/fetch.ts";
import { mockArchive } from "../src/archive.ts";
import { runPipeline, type PipelineContext } from "../src/index.ts";
import { kartaSamtidigt } from "../src/samtidigt.ts";

interface FixtureData {
  article: NormalizedArticle;
  extractResponse: string;
  verifyResponse: string;
  quipResponse: string;
}

const NOW = new Date("2026-06-12T06:00:00Z");
const ALLOWLIST = ["dn.se", "svt.se", "svd.se", "gp.se", "di.se"];

function loadFixture(name: string): FixtureData {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8"),
  ) as FixtureData;
}

/** Grundadressen bakom en klonad artikel — attrappen slår upp fixturen på den. */
function grundUrl(url: string): string {
  return url.replace(/\?k=\d+$/u, "");
}

/**
 * Attrapp som svarar i OMVÄND ordning mot indata: artikel 0 väntar längst.
 * Utan den skulle samtidigheten aldrig hinna byta plats på något, och provet
 * hade mätt ingenting.
 */
class TrogMockLlm implements LlmClient {
  private byUrl: Map<string, FixtureData>;
  private ordning: Map<string, number>;
  /** Högsta antal samtidiga anrop provet fick se — mäter att taket biter. */
  public toppSamtidiga = 0;
  private pagaende = 0;

  constructor(fixtures: FixtureData[], artiklar: NormalizedArticle[]) {
    this.byUrl = new Map(fixtures.map((f) => [f.article.url, f]));
    this.ordning = new Map(artiklar.map((a, i) => [a.url, artiklar.length - i]));
  }

  async complete(prompt: string, opts?: LlmOptions): Promise<string> {
    this.pagaende += 1;
    this.toppSamtidiga = Math.max(this.toppSamtidiga, this.pagaende);
    const url = prompt.match(/url="([^"]+)"/)?.[1] ?? "";
    await new Promise((r) => setTimeout(r, (this.ordning.get(url) ?? 1) * 4));
    this.pagaende -= 1;

    const f = this.byUrl.get(grundUrl(url));
    const sys = opts?.systemPrompt ?? "";
    if (sys.includes("extraktionsmotor")) return f?.extractResponse ?? '{"promises":[]}';
    if (sys.includes("oberoende granskare")) {
      return (
        f?.verifyResponse ??
        '{"is_promise":true,"party_correct":true,"amount_in_text":null,"verdict":"publish","reason":"mock"}'
      );
    }
    if (sys.includes("stenograf")) return f?.quipResponse ?? "En torr kommentar.";
    return '{"error":"unknown call type"}';
  }
}

/**
 * Nio artiklar ur tre fixturer: varje löfte skördas tre gånger på olika
 * adresser. Det är med flit — klonerna bär samma löfte, så dubblettkollen
 * INOM körningen måste peka ut den första i indataordning som originalet.
 * Just den kollen är den enda plats där en artikel läser vad en annan artikel
 * lämnat efter sig, och alltså den som går sönder först om ordningen tappas.
 */
function byggArtiklar(fixtures: FixtureData[]): NormalizedArticle[] {
  const ut: NormalizedArticle[] = [];
  for (let k = 1; k <= 3; k += 1) {
    for (const f of fixtures) {
      ut.push({ ...f.article, url: `${f.article.url}?k=${k}` });
    }
  }
  return ut;
}

function makeTmp(): string {
  const d = mkdtempSync(join(tmpdir(), "samtidighet-"));
  writeFileSync(join(d, "promises.json"), "[]\n");
  return d;
}

function makeContext(
  fixtures: FixtureData[],
  artiklar: NormalizedArticle[],
  tmpDir: string,
  samtidigaArtiklar: number,
): { ctx: PipelineContext; llm: TrogMockLlm } {
  const llm = new TrogMockLlm(fixtures, artiklar);
  return {
    llm,
    ctx: {
      now: NOW,
      runId: "2026-06-12T06",
      llm,
      articleSource: new MemorySource(artiklar),
      outputDir: tmpDir,
      dataDir: tmpDir,
      allowlist: ALLOWLIST,
      mode: "review",
      archiveFn: mockArchive,
      samtidigaArtiklar,
      models: { extract: "mock-extract", verify: "mock-verify", copy: "mock-copy" },
    },
  };
}

describe("samtidigheten ändrar takten, aldrig utfallet", () => {
  test("tak 1 och tak 6 ger samma kö, post för post", async () => {
    const fixtures = ["normal-1.json", "normal-2.json", "normal-3.json"].map(loadFixture);
    const artiklar = byggArtiklar(fixtures);

    const en = makeContext(fixtures, artiklar, makeTmp(), 1);
    const sex = makeContext(fixtures, artiklar, makeTmp(), 6);

    const sekventiellt = await runPipeline(en.ctx);
    const samtidigt = await runPipeline(sex.ctx);

    // Attrappen svarar omvänt mot indata, så om kön skrevs i svarsordning
    // skulle de två listorna inte kunna vara lika.
    assert.deepEqual(
      samtidigt.needsReview,
      sekventiellt.needsReview,
      "granskningskön måste ligga i indataordning oavsett takt",
    );
    // Jämförelsen ovan mäter det som är TIDSBEROENDE: skrivs kön i den ordning
    // svaren kom blir de två listorna olika, eftersom attrappen svarar omvänt.
    // Den mäter däremot inte om posterna FLÄTAS ihop mellan artiklar, för det
    // felet drabbar båda körningarna lika. Därför mäts också att varje artikels
    // poster ligger i en följd: sammanfogningen tar en artikel i taget.
    // (Ordningen mellan artiklar sätts av skördeordningen, inte av listan här,
    // så den kan inte jämföras mot indata rakt av.)
    const sedda = new Set<string>();
    let foregaende = "";
    for (const r of samtidigt.needsReview) {
      if (r.articleUrl !== foregaende) {
        assert.ok(
          !sedda.has(r.articleUrl),
          `posterna för ${r.articleUrl} ligger inte i en följd — kön är flätad`,
        );
        sedda.add(r.articleUrl);
        foregaende = r.articleUrl;
      }
    }

    assert.deepEqual(samtidigt.errors, sekventiellt.errors);
    assert.equal(samtidigt.dataHash, sekventiellt.dataHash);
    assert.equal(samtidigt.promises.length, 0, "en körning publicerar aldrig");

    // Provet mäter ingenting om samtidigheten inte inträffade.
    assert.equal(en.llm.toppSamtidiga, 1, "tak 1 ska vara ett anrop i taget");
    assert.ok(
      sex.llm.toppSamtidiga > 1,
      `tak 6 ska ge samtidiga anrop, såg ${sex.llm.toppSamtidiga}`,
    );

    // Dubbletterna inom körningen ska pekas ut, annars har provet inte rört
    // den ordningskänsliga vägen alls.
    const dubbletter = sekventiellt.needsReview.filter((r) => r.duplicateOf);
    assert.ok(dubbletter.length > 0, "klonerna ska falla ut som dubbletter");
  });
});

describe("kartaSamtidigt", () => {
  test("resultatet ligger i indataordning, inte i den ordning arbetena blev klara", async () => {
    const ut = await kartaSamtidigt([5, 4, 3, 2, 1, 0], 6, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5));
      return n;
    });
    assert.deepEqual(ut, [5, 4, 3, 2, 1, 0]);
  });

  test("taket biter", async () => {
    let pagaende = 0;
    let topp = 0;
    await kartaSamtidigt(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      pagaende += 1;
      topp = Math.max(topp, pagaende);
      await new Promise((r) => setTimeout(r, 2));
      pagaende -= 1;
    });
    assert.equal(topp, 3);
  });

  test("tak under 1 blir sekventiellt i stället för att inte köra alls", async () => {
    let topp = 0;
    let pagaende = 0;
    const ut = await kartaSamtidigt([1, 2, 3], 0, async (n) => {
      pagaende += 1;
      topp = Math.max(topp, pagaende);
      await new Promise((r) => setTimeout(r, 1));
      pagaende -= 1;
      return n * 2;
    });
    assert.deepEqual(ut, [2, 4, 6]);
    assert.equal(topp, 1);
  });

  test("felet som kastas är det första i indataordning, inte det snabbaste", async () => {
    await assert.rejects(
      kartaSamtidigt([0, 1, 2, 3], 4, async (n) => {
        // Post 3 hinner falla först i tid; post 1 är först i ordningen.
        if (n === 3) throw new Error("sist i ordningen, först i tid");
        if (n === 1) {
          await new Promise((r) => setTimeout(r, 20));
          throw new Error("först i ordningen");
        }
        return n;
      }),
      /först i ordningen$/u,
    );
  });
});
