/**
 * Grind: varje körning som ingen tittar på måste larma när den faller.
 *
 * Luckan den stänger är mätt två gånger i drift. Sex schemalagda
 * pipelinekörningar i rad föll på pushen 31 juli–2 augusti 2026 utan att något
 * sa ifrån, och 2026-08-03 stoppade ett rött test hela driftsättningen medan
 * main tog emot 62 beslut som vanligt. I båda fallen såg allt normalt ut.
 *
 * Grinden prövar fyra saker, och de två sista är de som håller över tid:
 *   1. Varje körning som startas av ett schema (eller av en push till main)
 *      har ett larmjobb.
 *   2. Larmjobbet väntar på ALLA jobb som kan fälla körningen, så att ingen
 *      väg förbi larmet öppnas när ett jobb läggs till.
 *   3. Larmet finns i EN implementation. En workflow som skriver sitt eget
 *      larm faller här — en kopia ärver inte buggfixar, den ärver bara det
 *      den kopierades från.
 *   4. Varje körning som kan öppna ett larm bevakas också av avblåsningen,
 *      `larm-av.yml`, som stänger ärendet när körningen gått igenom igen.
 *
 * Fyran tillkom 2026-08-15 och har sitt eget pris mätt. Ett öppet larmärende
 * gör larmet tyst för just den körningen — det står i larmets egen text, och
 * det är avsiktligt, annars begraver en trasig körning larmet i sitt eget brus.
 * Men fram till dess fanns ingenting som stängde ärendet när körningen gått
 * grön. Av sju öppna larm hade fyra återhämtat sig, ett av dem fem dygn
 * tidigare, och bygglarmet hade under tiden samlat arton kommentarer ingen såg.
 * Avblåsningen lyssnar med `workflow_run`, som inte tar jokertecken: varje
 * bevakad körning står uppräknad vid namn, och en ny larmanropare som glöms i
 * listan får ett larm som ingenting stänger.
 */
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const WORKFLOWS = resolve(import.meta.dirname, "../../.github/workflows");
const LARM_FIL = "larm.yml";
const AVBLASNING_FIL = "larm-av.yml";
const LARM_SOKVAG = "./.github/workflows/larm.yml";

type Jobb = {
  uses?: string;
  if?: string;
  needs?: string | string[];
  "continue-on-error"?: boolean;
  with?: Record<string, unknown>;
  steps?: { uses?: string; if?: string }[];
};
type Workflow = { namn: string | undefined; on: unknown; jobs: Record<string, Jobb> | undefined };

function tolka(text: string): Workflow {
  const doc = parse(text) as Record<string, unknown>;
  // `on` är ett nyckelord i YAML 1.1 och kan tolkas som booleskt true. Vilken
  // tolkning parsern gör ska inte avgöra om grinden fungerar.
  const trigger = doc["on"] ?? doc[true as unknown as string];
  return {
    namn: doc["name"] as string | undefined,
    on: trigger,
    jobs: doc["jobs"] as Record<string, Jobb> | undefined,
  };
}

function text(fil: string): string {
  return readFileSync(join(WORKFLOWS, fil), "utf8");
}

function las(fil: string): Workflow {
  return tolka(text(fil));
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

/**
 * Namnen `workflow_run` i avblåsningen bevakar.
 *
 * Det är workflowarnas `name:`-fält, inte deras filnamn — de skiljer sig inte i
 * dag, men det är namnet GitHub matchar på.
 */
function bevakade(w: Workflow): string[] {
  const t = (w.on ?? {}) as Record<string, unknown>;
  const kor = (t["workflow_run"] ?? {}) as { workflows?: unknown };
  return Array.isArray(kor.workflows) ? (kor.workflows as string[]) : [];
}

/** Namnen på de körningar som kan öppna ett larm. */
function larmanropare(): string[] {
  const namn: string[] = [];
  for (const fil of filer) {
    if (fil === LARM_FIL) continue;
    const w = las(fil);
    if (!larmjobb(w)) continue;
    assert.ok(w.namn, `${fil} anropar larmet men saknar ett \`name:\` att bevaka den på.`);
    namn.push(w.namn);
  }
  return namn;
}

test("varje körning som kan öppna ett larm bevakas av avblåsningen", () => {
  const listan = bevakade(las(AVBLASNING_FIL));
  assert.ok(listan.length > 0, `${AVBLASNING_FIL} räknar inte upp någon körning alls.`);

  const saknas = larmanropare().filter((n) => !listan.includes(n));
  assert.deepEqual(
    saknas,
    [],
    `Dessa kan öppna ett larm som ingenting stänger: ${saknas.join(", ")}. ` +
      `Lägg till namnet under \`workflows:\` i .github/workflows/${AVBLASNING_FIL}.`,
  );
});

test("avblåsningen bevakar bara körningar som faktiskt kan larma", () => {
  // Åt andra hållet: ett namn som blivit kvar sedan en körning bytt namn eller
  // slutat larma gör ingen skada i drift, men det är en osann rad — och en
  // osann rad lär läsaren att listan inte behöver stämma.
  const kanLarma = new Set(larmanropare());
  const overflodiga = bevakade(las(AVBLASNING_FIL)).filter((n) => !kanLarma.has(n));
  assert.deepEqual(overflodiga, [], `Bevakas men anropar inte larmet: ${overflodiga.join(", ")}`);
});

test("avblåsningen bevakar inte sig själv", () => {
  const w = las(AVBLASNING_FIL);
  assert.ok(w.namn, `${AVBLASNING_FIL} saknar \`name:\`.`);
  assert.ok(
    !bevakade(w).includes(w.namn),
    `${AVBLASNING_FIL} står i sin egen bevakningslista — varje grön körning skulle starta en ny.`,
  );
});

test("grinden känner igen den glömda raden den finns för", () => {
  // Ett prov som aldrig setts falla är en gissning. Den här stryker en rad ur
  // listan i en kopia av texten, tolkar om den, och kräver att kontrollen
  // fäller det som blev kvar. Att mutera texten och inte den färdiga listan är
  // med flit: då prövas hela vägen från fil till jämförelse.
  const lagad = text(AVBLASNING_FIL);
  assert.ok(bevakade(tolka(lagad)).includes("arkiv"), "arkiv ska bevakas för att provet ska mäta något");
  assert.ok(larmanropare().includes("arkiv"), "arkiv ska anropa larmet, annars är strykningen inget fel");

  const trasig = tolka(lagad.replace(/\n[ \t]*-[ \t]+arkiv(?=\n)/u, ""));
  assert.ok(!bevakade(trasig).includes("arkiv"), "strykningen ska ha tagit bort raden");
  assert.ok(
    larmanropare().some((n) => !bevakade(trasig).includes(n)),
    "utan raden ska grinden se en larmanropare som ingen avblåsning bevakar",
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
