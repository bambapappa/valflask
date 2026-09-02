/**
 * Regeln som ingen anropar städar ingenting.
 *
 * `prtexten.ts` kan vara grön för sig själv medan arbetsflödet aldrig kör
 * den — och då står sidfoten kvar i varje PR utan att något säger ifrån.
 * Det är samma lucka som en gång kostade repot en modul som var byggd,
 * provad och aldrig anropad.
 *
 * Provet läser steget, inte filen som helhet. Ett prov som söker efter en
 * sträng någonstans i YAML:en passerar när villkoret flyttas eller tas bort
 * ur just det steg där det betyder något — det hände i det här repot en
 * gång, och fallprovet gick igenom fast grinden var borta.
 *
 * FÄLLS AV: att ta bort steget som kör skriptet, att sluta lyssna på
 * `opened`, eller att ta bort skrivbehörigheten på pull requests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const WORKFLOW = join(import.meta.dirname, "..", "..", ".github", "workflows", "pr-sidfot.yml");

interface Flode {
  on: { pull_request?: { types?: string[] } };
  permissions?: Record<string, string>;
  jobs: Record<string, { steps?: Array<{ name?: string; run?: string; env?: Record<string, string> }> }>;
}

const flodet = (): Flode => parse(readFileSync(WORKFLOW, "utf8")) as Flode;

test("arbetsflödet kör skriptet som tillämpar regeln", () => {
  const steg = Object.values(flodet().jobs).flatMap((j) => j.steps ?? []);
  const kor = steg.find((s) => (s.run ?? "").includes("pr-sidfot.mts"));
  assert.ok(kor, "inget steg kör scripts/pr-sidfot.mts — regeln anropas inte");
  // Skriptet vägrar utan de här, så ett saknat värde blir en röd körning i
  // stället för en tyst nolla. Provet fångar det innan det går ut.
  assert.ok(kor.env?.["PR"], "steget skickar inte PR-numret");
  assert.ok(kor.env?.["GITHUB_TOKEN"], "steget skickar ingen token");
});

test("det lyssnar på att en PR öppnas", () => {
  // `opened` är det som betyder något: sidfoten läggs på vid skapandet.
  // Utan den händelsen städas bara PR:er som råkar redigeras efteråt.
  const typer = flodet().on.pull_request?.types ?? [];
  assert.ok(typer.includes("opened"), `lyssnar inte på opened — bara ${typer.join(", ")}`);
});

test("det får skriva på pull requests", () => {
  // Utan behörigheten hämtar skriptet beskrivningen, räknar ut rätt svar och
  // faller på skrivningen. Det är en röd körning per PR, i onödan.
  assert.equal(flodet().permissions?.["pull-requests"], "write");
});
