/**
 * Ett tillbakadraget löfte är inte publicerat.
 *
 * Dublettkollarnas pool var hela `promises.json`, indragna löften inkluderade,
 * och `ExistingPromiseLite` bar inte ens fältet `status` — så kollen kunde inte
 * uttrycka «målet är indraget» ens om den velat. Följden är mätt: av 78
 * dublettflaggor i kön 2026-08-31 pekade 13 på tillbakadragna löften. Sex av
 * dem hade en LEVANDE tvilling — p-2026-2949 och p-2026-2448 drogs själva in
 * som dubbletter av p-2026-2947 och p-2026-2922, som bär kalkylerna — och
 * kollen stannade vid den döda kopian.
 *
 * Skillnaden är inte kosmetisk. En flagga mot ett publicerat löfte betyder
 * «avvisa som dubblett»; en flagga mot ett indraget betyder «pröva som nytt
 * löfte», alltså raka motsatsen. Läses de likadant avvisas nya löften på en
 * grund som inte finns, och det var precis vad ett beslutsunderlag gjorde.
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

const NOW = new Date("2026-06-12T06:00:00Z");
const ALLOWLIST = ["dn.se"];

interface FixtureData {
  article: NormalizedArticle;
  extractResponse: string;
  verifyResponse: string;
  quipResponse: string;
}

function loadFixture(name: string): FixtureData {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, "..", "fixtures", name), "utf8"),
  ) as FixtureData;
}

class MockLlm implements LlmClient {
  constructor(private f: FixtureData) {}
  async complete(_prompt: string, opts?: LlmOptions): Promise<string> {
    const sys = opts?.systemPrompt ?? "";
    if (sys.includes("extraktionsmotor")) return this.f.extractResponse;
    if (sys.includes("oberoende granskare")) return this.f.verifyResponse;
    if (sys.includes("stenograf")) return this.f.quipResponse;
    return '{"error":"unknown call type"}';
  }
}

/** Ett publicerat löfte i beståndet — bara de fält kön och kollarna läser. */
function loftet(id: string, status: string, titel: string, citat: string) {
  return {
    id,
    group_id: null,
    title: titel,
    parties: ["s"],
    person: null,
    quote: citat,
    category: "välfärd",
    status,
    source: { url: "https://www.dn.se/gammal/", title: "Gammal", publisher: "dn.se", date: "2026-01-01" },
    date_stated: "2026-01-01",
    cost: {
      type: "utgift",
      period: "per_ar",
      msek_low: 0,
      msek_base: 0,
      msek_high: 0,
      basis: "granskare",
      basis_url: null,
      method_note: "prov",
      confidence: 1,
      calculation: "prov",
    },
    financing_claimed: false,
    extraction: { model: "prov", run_id: "prov" },
    comparisons: [],
    history: [],
    slug: id,
    title_slug: id,
  };
}

async function korMed(bestand: unknown[]): Promise<Record<string, unknown>[]> {
  const f = loadFixture("normal-1.json");
  const dir = mkdtempSync(join(tmpdir(), "dublett-status-"));
  writeFileSync(join(dir, "promises.json"), `${JSON.stringify(bestand)}\n`);
  const llm = new MockLlm(f);
  const ctx: PipelineContext = {
    now: NOW,
    runId: "2026-06-12T06",
    llm,
    articleSource: new MemorySource([f.article]),
    outputDir: dir,
    dataDir: dir,
    allowlist: ALLOWLIST,
    mode: "review",
    archiveFn: mockArchive,
    samtidigaArtiklar: 1,
    models: { extract: "mock-extract", verify: "mock-verify", copy: "mock-copy", kostnad: "mock-extract" },
  };
  await runPipeline(ctx);
  return JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")) as Record<string, unknown>[];
}

// Fixturens kandidat, ordagrant: samma citat gör citatkollen till en säker träff.
const CITAT =
  "Vi lovar att höja a-kassan till 90 procent av lönen från år 2027 för alla förvärvsarbetande.";
const TITEL = "Höjd a-kassa till 90 procent av lönen";

describe("dublettkollen skiljer levande löften från indragna", () => {
  // FÄLLS AV: att låta `hittaDublettMedStatus` söka i hela poolen på en gång
  // i stället för levande först. Då vinner den indragna kopian så snart den
  // ligger före i filen, och flaggan pekar på ett löfte som inte finns.
  test("den levande tvillingen vinner över den indragna kopian", async () => {
    const ko = await korMed([
      loftet("p-doda", "tillbakadragen", TITEL, CITAT),
      loftet("p-levande", "aktiv", TITEL, CITAT),
    ]);
    const post = ko.find((p) => p.duplicateOf !== undefined);
    assert.ok(post, "kandidaten ska flaggas som dubblett");
    assert.equal(post.duplicateOf, "p-levande", "flaggan ska peka på det publicerade löftet");
    assert.equal(post.duplicateWithdrawn, undefined, "en levande träff märks inte som indragen");
  });

  test("finns bara den indragna kopian märks flaggan som indragen", async () => {
    const ko = await korMed([loftet("p-doda", "tillbakadragen", TITEL, CITAT)]);
    const post = ko.find((p) => p.duplicateOf !== undefined);
    assert.ok(post, "träffen kastas inte — den varnar för att något indraget återinförs");
    assert.equal(post.duplicateOf, "p-doda");
    assert.equal(
      post.duplicateWithdrawn,
      true,
      "märkningen är hela skillnaden mellan «avvisa» och «pröva som nytt löfte»",
    );
  });
});
