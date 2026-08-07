/**
 * Grind: varje körning som ingen tittar på måste larma när den faller.
 *
 * Luckan den stänger är mätt två gånger i drift. Sex schemalagda
 * pipelinekörningar i rad föll på pushen 31 juli–2 augusti 2026 utan att något
 * sa ifrån, och 2026-08-03 stoppade ett rött test hela driftsättningen medan
 * main tog emot 62 beslut som vanligt. I båda fallen såg allt normalt ut.
 *
 * Grinden prövar tre saker, och den tredje är den som håller över tid:
 *   1. Varje körning som startas av ett schema (eller av en push till main)
 *      har ett larmjobb.
 *   2. Larmjobbet väntar på ALLA jobb som kan fälla körningen, så att ingen
 *      väg förbi larmet öppnas när ett jobb läggs till.
 *   3. Larmet finns i EN implementation. En workflow som skriver sitt eget
 *      larm faller här — en kopia ärver inte buggfixar, den ärver bara det
 *      den kopierades från.
 */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const WORKFLOWS = resolve(import.meta.dirname, "../../.github/workflows");
const LARM_FIL = "larm.yml";
const LARM_SOKVAG = "./.github/workflows/larm.yml";

type Jobb = {
  uses?: string;
  if?: string;
  needs?: string | string[];
  "continue-on-error"?: boolean;
  with?: Record<string, unknown>;
  steps?: { uses?: string; if?: string }[];
};
type Workflow = { on: unknown; jobs: Record<string, Jobb> | undefined };

function las(fil: string): Workflow {
  const doc = parse(readFileSync(join(WORKFLOWS, fil), "utf8")) as Record<string, unknown>;
  // `on` är ett nyckelord i YAML 1.1 och kan tolkas som booleskt true. Vilken
  // tolkning parsern gör ska inte avgöra om grinden fungerar.
  const trigger = doc["on"] ?? doc[true as unknown as string];
  return { on: trigger, jobs: doc["jobs"] as Record<string, Jobb> | undefined };
}

const filer = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));

/** Körningar som startas utan att någon sitter och tittar. */
function utanUppsikt(w: Workflow): boolean {
  const t = w.on;
  if (!t || typeof t !== "object") return false;
  const nycklar = Object.keys(t as Record<string, unknown>);
  return nycklar.includes("schedule") || nycklar.includes("push");
}

function larmjobb(w: Workflow): [string, Jobb] | undefined {
  return Object.entries(w.jobs ?? {}).find(([, j]) => j.uses === LARM_SOKVAG);
}

test("varje körning utan uppsikt larmar när den faller", () => {
  const saknar: string[] = [];
  for (const fil of filer) {
    if (fil === LARM_FIL) continue;
    const w = las(fil);
    if (!utanUppsikt(w)) continue;
    if (!larmjobb(w)) saknar.push(fil);
  }
  assert.deepEqual(
    saknar,
    [],
    `Dessa körningar startas av schema eller push men larmar inte om de faller: ${saknar.join(", ")}. ` +
      `Lägg ett jobb som anropar ${LARM_SOKVAG} — skriv inget eget larm.`,
  );
});

test("larmjobbet väntar på alla jobb som kan fälla körningen", () => {
  const brister: string[] = [];
  for (const fil of filer) {
    if (fil === LARM_FIL) continue;
    const w = las(fil);
    const funnet = larmjobb(w);
    if (!funnet) continue;
    const [larmNamn, larm] = funnet;

    const needs = new Set(
      Array.isArray(larm.needs) ? larm.needs : larm.needs ? [larm.needs] : [],
    );
    // Ett jobb som får falla utan att körningen räknas som fallen (
    // continue-on-error) ska inte larma — allt annat ska.
    const maste = Object.entries(w.jobs ?? {})
      .filter(([namn, j]) => namn !== larmNamn && j["continue-on-error"] !== true)
      .map(([namn]) => namn);

    const glomda = maste.filter((n) => !needs.has(n));
    if (glomda.length > 0) brister.push(`${fil}: larmet väntar inte på ${glomda.join(", ")}`);

    if (!(larm.if ?? "").includes("failure()")) {
      brister.push(`${fil}: larmjobbet saknar villkoret failure()`);
    }
  }
  assert.deepEqual(brister, [], brister.join("\n"));
});

test("larmet finns i en implementation, inte en kopia per workflow", () => {
  const egnaLarm: string[] = [];
  for (const fil of filer) {
    if (fil === LARM_FIL) continue;
    const w = las(fil);
    for (const [namn, jobb] of Object.entries(w.jobs ?? {})) {
      for (const steg of jobb.steps ?? []) {
        const villkor = steg.if ?? "";
        const anvander = steg.uses ?? "";
        if (villkor.includes("failure()") && anvander.includes("actions/github-script")) {
          egnaLarm.push(`${fil}:${namn}`);
        }
      }
    }
  }
  assert.deepEqual(
    egnaLarm,
    [],
    `Egen larmkod i stället för den delade: ${egnaLarm.join(", ")}. Anropa ${LARM_SOKVAG}.`,
  );
});

test("larmet tar emot exakt de uppgifter anroparna skickar", () => {
  const larmDoc = parse(readFileSync(join(WORKFLOWS, LARM_FIL), "utf8")) as Record<string, unknown>;
  const trigger = (larmDoc["on"] ?? larmDoc[true as unknown as string]) as Record<string, unknown>;
  const call = trigger["workflow_call"] as { inputs?: Record<string, { required?: boolean }> };
  const definierade = new Set(Object.keys(call.inputs ?? {}));
  assert.ok(definierade.size > 0, "larm.yml tar inte emot några uppgifter alls");

  const kravda = Object.entries(call.inputs ?? {})
    .filter(([, v]) => v.required)
    .map(([k]) => k);

  for (const fil of filer) {
    if (fil === LARM_FIL) continue;
    const funnet = larmjobb(las(fil));
    if (!funnet) continue;
    const skickat = Object.keys(funnet[1].with ?? {});
    for (const n of skickat) {
      assert.ok(definierade.has(n), `${fil} skickar "${n}" som larm.yml inte tar emot`);
    }
    for (const n of kravda) {
      assert.ok(skickat.includes(n), `${fil} skickar inte den krävda uppgiften "${n}"`);
    }
  }
});
