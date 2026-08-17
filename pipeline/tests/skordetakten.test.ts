/**
 * Skördetakten: en höjning har en klocka, och klockan ringer i bygget.
 *
 * Två halvor. Först regeln, prövad mot påhittade datum — annars går grinden
 * inte att pröva förrän i övermorgon, och en oprövad grind är ingen grind.
 * Sedan verkligheten: att filen och de två ställena takten faktiskt står
 * säger samma sak just nu.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  cronUrWorkflow,
  korningarPerDygn,
  provaTakten,
  sidorUrSources,
  type Skordetakten,
} from "../src/skordetakten.ts";

const ROT = resolve(import.meta.dirname, "../..");
const las = (p: string): string => readFileSync(resolve(ROT, p), "utf8");

/* ─────────────────────────── Cron-läsningen ─────────────────────────── */

test("körningar per dygn ur en lista av timmar", () => {
  assert.equal(korningarPerDygn("10 0,4,8,12,16,20 * * *"), 6);
  assert.equal(korningarPerDygn("10 3,9,15 * * *"), 3);
  assert.equal(korningarPerDygn("0 5 * * 1"), 1);
});

test("körningar per dygn ur ett intervall", () => {
  assert.equal(korningarPerDygn("10 */4 * * *"), 6);
  assert.equal(korningarPerDygn("10 */6 * * *"), 4);
  assert.equal(korningarPerDygn("10 * * * *"), 24);
});

test("dubbletter i timlistan räknas en gång", () => {
  assert.equal(korningarPerDygn("10 3,3,9 * * *"), 2);
});

test("en oläsbar cron ger null — aldrig ett antaget lugnt läge", () => {
  // Det farliga svaret vore att gissa. En grind som tolkar skräp som «nog
  // lugnt» faller aldrig, och då vaktar den ingenting.
  assert.equal(korningarPerDygn("nonsens"), null);
  assert.equal(korningarPerDygn("10 25 * * *"), null);
  assert.equal(korningarPerDygn("10 a,b * * *"), null);
  assert.equal(korningarPerDygn("10 */0 * * *"), null);
});

test("cron och sidtak plockas ur filerna", () => {
  assert.equal(cronUrWorkflow('on:\n  schedule:\n    - cron: "10 3,9 * * *"\n'), "10 3,9 * * *");
  assert.equal(cronUrWorkflow("inget schema här"), null);
  assert.equal(sidorUrSources("limits:\n  max_articles_per_run: 45\n  min_chars: 400\n"), 45);
  assert.equal(sidorUrSources("limits:\n  min_chars: 400\n"), null);
});

/* ─────────────────────────── Regeln ─────────────────────────────────── */

const NORMAL = { korningar_per_dygn: 3, sidor_per_korning: 20 };
const HOJD = {
  sedan: "2026-08-17",
  till_och_med: "2026-08-21",
  korningar_per_dygn: 6,
  sidor_per_korning: 45,
  skal: "ikappkörning",
};
const fil: Skordetakten = { normal: NORMAL, hojd: HOJD };

test("normal takt godtas alltid, oavsett datum", () => {
  const besked = provaTakten({ normal: NORMAL, hojd: HOJD }, NORMAL, "2027-01-01");
  assert.equal(besked.godtas, true);
  assert.equal(besked.utfall, "normal");
});

test("höjd takt godtas inom fristen", () => {
  const besked = provaTakten(fil, HOJD, "2026-08-19");
  assert.equal(besked.godtas, true);
  assert.equal(besked.utfall, "hojd_inom_fristen");
  assert.equal(besked.dygnKvar, 2);
});

test("sista dagen räknas in — till OCH MED betyder till och med", () => {
  const besked = provaTakten(fil, HOJD, "2026-08-21");
  assert.equal(besked.godtas, true, "grinden får inte falla på sin egen sista dag");
  assert.equal(besked.dygnKvar, 0);
});

test("DET GRINDEN FINNS FÖR: dagen efter fristen faller den", () => {
  const besked = provaTakten(fil, HOJD, "2026-08-22");
  assert.equal(besked.godtas, false);
  assert.equal(besked.utfall, "fristen_har_gatt_ut");
  assert.equal(besked.dygnKvar, -1);
  assert.match(besked.forklaring, /BÅDA ställena/u, "meddelandet ska säga vad som ska göras");
});

test("en tyst höjning faller direkt, utan att någon frist behöver gå ut", () => {
  // Det här är den andra halvan av värdet: att höja takten utan att skriva
  // ner det är precis hur den förra snedfördelningen kunde växa i tysthet.
  const besked = provaTakten({ normal: NORMAL }, HOJD, "2026-08-18");
  assert.equal(besked.godtas, false);
  assert.equal(besked.utfall, "hojd_utan_deklaration");
});

test("en deklaration som inte stämmer med verkligheten faller", () => {
  const faktisk = { korningar_per_dygn: 12, sidor_per_korning: 45 };
  const besked = provaTakten(fil, faktisk, "2026-08-18");
  assert.equal(besked.godtas, false);
  assert.equal(besked.utfall, "deklarationen_stammer_inte");
});

test("att flytta fram datumet är vägen ut — och den syns i filen", () => {
  const forlangd = { ...fil, hojd: { ...HOJD, till_och_med: "2026-08-28" } };
  assert.equal(provaTakten(forlangd, HOJD, "2026-08-22").godtas, true);
});

/* ─────────────────────────── Verkligheten just nu ───────────────────── */

test("filen och de två ställena takten står säger samma sak", () => {
  const takten = JSON.parse(las("data/skordetakten.json")) as Skordetakten;
  const cron = cronUrWorkflow(las(".github/workflows/pipeline.yml"));
  assert.ok(cron, "pipeline.yml saknar cron-rad");
  const korningar = korningarPerDygn(cron);
  assert.ok(korningar !== null, `cron-raden gick inte att läsa: ${cron}`);
  const sidor = sidorUrSources(las("data/sources.yaml"));
  assert.ok(sidor !== null, "sources.yaml saknar max_articles_per_run");

  const besked = provaTakten(
    takten,
    { korningar_per_dygn: korningar, sidor_per_korning: sidor },
    new Date().toISOString(),
  );
  assert.equal(besked.godtas, true, besked.forklaring);
  console.log(`  skördetakten: ${korningar} × ${sidor} — ${besked.forklaring}`);
});

test("en höjning i filen bär alltid ett skäl och ett datum", () => {
  const takten = JSON.parse(las("data/skordetakten.json")) as Skordetakten;
  if (!takten.hojd) return;
  assert.ok(
    takten.hojd.skal.trim().length > 20,
    "en höjning utan skäl är en höjning ingen kan ompröva",
  );
  assert.match(takten.hojd.till_och_med, /^\d{4}-\d{2}-\d{2}$/u);
  assert.ok(
    Date.parse(takten.hojd.till_och_med) >= Date.parse(takten.hojd.sedan),
    "fristen får inte gå ut innan höjningen börjat",
  );
});
