import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * Ett arbetsflöde som ger pipelinen en LLM-nyckel måste ge hela ledet.
 *
 * `byggLed` i cli-run.ts bygger anropskedjan av tre led, vart och ett med sin
 * egen adress, sin egen nyckel och sina egna modellnamn. Regeln där är sträng
 * med flit: sätts NÅGON del av ett led men inte alla kastar körningen direkt,
 * så att ingen tror att kedjan är längre än den är.
 *
 * Det hände: `kostnad-omkorning.yml` skickade `LLM_API_KEY` och `MODEL_EXTRACT`
 * men inte `LLM_BASE_URL`. Körning 31946138758 dog i första sekunden av
 * modellsteget — efter att install, checkout och tokenmintning gått igenom, och
 * efter att skriptet hunnit lista de nitton fallna posterna. Det ser ut som ett
 * fel i koden och är ett fel i env-blocket.
 *
 * Grinden mäter samma villkor som `byggLed` kastar på, men statiskt: **rör ett
 * env-block ett led alls, måste både adressen och nyckeln finnas där.** Ett led
 * med adress och nyckel men utan modellnamn fälls INTE — det är det tillåtna
 * mellanläget (`calculation-backfill.yml` och `stances-backfill.yml` står så i
 * dag, och koden hoppar över ledet med en rad i loggen).
 */

const ROT = resolve(import.meta.dirname, "../..");
const WORKFLOWS = join(ROT, ".github/workflows");

/** Samma tre led som LED_ORDNING i cli-run.ts, i samma ordning. */
const LED = [
  { namn: "primär", url: "LLM_BASE_URL", key: "LLM_API_KEY", suffix: "" },
  { namn: "sekundär", url: "LLM_FALLBACK_BASE_URL", key: "LLM_FALLBACK_API_KEY", suffix: "_FALLBACK" },
  { namn: "extra", url: "LLM_ZAI_BASE_URL", key: "LLM_ZAI_API_KEY", suffix: "_ZAI" },
] as const;

/** Alla env-block i ett arbetsflöde, oavsett hur djupt de ligger. */
export function envBlock(dok: unknown): Record<string, unknown>[] {
  const ut: Record<string, unknown>[] = [];
  const ga = (nod: unknown): void => {
    if (Array.isArray(nod)) { for (const n of nod) ga(n); return; }
    if (!nod || typeof nod !== "object") return;
    for (const [k, v] of Object.entries(nod as Record<string, unknown>)) {
      if (k === "env" && v && typeof v === "object" && !Array.isArray(v)) {
        ut.push(v as Record<string, unknown>);
      }
      ga(v);
    }
  };
  ga(dok);
  return ut;
}

/**
 * Vilket led ett `MODEL_*`-namn hör till — längsta suffixet vinner, annars
 * skulle `MODEL_EXTRACT_FALLBACK` räknas till primären.
 */
function modellensLed(namn: string): string {
  if (!namn.startsWith("MODEL_")) return "";
  for (const l of [...LED].sort((a, b) => b.suffix.length - a.suffix.length)) {
    if (l.suffix !== "" && namn.endsWith(l.suffix)) return l.suffix;
  }
  return "";
}

/** Halvt konfigurerade led i ett env-block, i klartext. */
export function halvaLed(env: Record<string, unknown>): string[] {
  const satta = new Set(
    Object.entries(env)
      .filter(([, v]) => v !== null && String(v).trim() !== "")
      .map(([k]) => k),
  );
  const fel: string[] = [];
  for (const l of LED) {
    const harUrl = satta.has(l.url);
    // OPENROUTER_API_KEY är primärens nyckel under ett annat namn; koden läser
    // den som reserv, så ett block som bär den räknas som att ha nyckeln.
    const harKey = satta.has(l.key) || (l.suffix === "" && satta.has("OPENROUTER_API_KEY"));
    const harModell = [...satta].some((n) => n.startsWith("MODEL_") && modellensLed(n) === l.suffix);
    if (!harUrl && !harKey && !harModell) continue; // ledet är bortvalt — tyst
    const saknas: string[] = [];
    if (!harUrl) saknas.push(l.url);
    if (!harKey) saknas.push(l.key);
    if (saknas.length > 0) fel.push(`ledet "${l.namn}" saknar ${saknas.join(", ")}`);
  }
  return fel;
}

test("rör ett arbetsflöde ett led i LLM-kedjan bär det ledets adress och nyckel", () => {
  const filer = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(filer.length > 0, "hittade inga arbetsflöden — grinden mäter ingenting");

  const fel: string[] = [];
  let prövade = 0;

  for (const f of filer) {
    const dok = parseYaml(readFileSync(join(WORKFLOWS, f), "utf8")) as unknown;
    for (const env of envBlock(dok)) {
      const brister = halvaLed(env);
      if (Object.keys(env).some((k) => k.startsWith("LLM_") || k.startsWith("MODEL_"))) prövade++;
      for (const b of brister) fel.push(`${f}: ${b}`);
    }
  }

  assert.ok(prövade > 0, "inga env-block med LLM-variabler lästes — läsaren är trasig, inte repot");
  assert.deepEqual(fel, [], `Halvt konfigurerade led:\n  ${fel.join("\n  ")}`);
});

test("grinden fäller det env-block som faktiskt föll — körning 31946138758", () => {
  // Ordagrant det block körningen dog på: nyckel och modell, men ingen adress.
  const foll = {
    LLM_API_KEY: "${{ secrets.LLM_API_KEY }}",
    OPENROUTER_API_KEY: "${{ secrets.OPENROUTER_API_KEY }}",
    LLM_FALLBACK_BASE_URL: "${{ vars.LLM_FALLBACK_BASE_URL }}",
    LLM_FALLBACK_API_KEY: "${{ secrets.LLM_FALLBACK_API_KEY }}",
    MODEL_EXTRACT: "${{ vars.MODEL_EXTRACT }}",
  };
  assert.deepEqual(halvaLed(foll), ['ledet "primär" saknar LLM_BASE_URL']);
});

test("ett led med adress och nyckel men utan modellnamn är tillåtet", () => {
  // Mellanläget: koden hoppar över ledet med en rad i loggen i stället för att
  // kasta. `calculation-backfill.yml` står så, och den körningen är grön.
  const utanModell = {
    LLM_BASE_URL: "a",
    LLM_API_KEY: "b",
    LLM_FALLBACK_BASE_URL: "c",
    LLM_FALLBACK_API_KEY: "d",
    MODEL_EXTRACT: "e",
  };
  assert.deepEqual(halvaLed(utanModell), []);
});

test("ett modellnamn utan sitt led fälls, och suffixet avgör vilket led", () => {
  assert.deepEqual(halvaLed({ MODEL_EXTRACT_FALLBACK: "x" }), [
    'ledet "sekundär" saknar LLM_FALLBACK_BASE_URL, LLM_FALLBACK_API_KEY',
  ]);
  // Utan längsta-suffix-regeln hade raden ovan bokförts på primären.
  assert.deepEqual(halvaLed({ MODEL_KOPPLING_ZAI: "x", LLM_ZAI_BASE_URL: "u", LLM_ZAI_API_KEY: "k" }), []);
});

test("läsaren hittar env-block hur djupt de än ligger", () => {
  const dok = parseYaml(
    ["jobs:", "  a:", "    steps:", "      - run: x", "        env:", "          LLM_BASE_URL: u"].join("\n"),
  );
  const block = envBlock(dok);
  assert.equal(block.length, 1);
  assert.equal(block[0]!.LLM_BASE_URL, "u");
});
