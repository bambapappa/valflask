/**
 * Mätningen av hur många kopplingar som går EMOT löftet. Regeln står i
 * `src/riktningsfordelningen.ts`.
 *
 * Provet mäter det som gör mätningen värd att ha: att modellens ja räknas
 * även när grindarna fäller det (annars mäter kvoten grindarna och inte
 * frågan), att en omstartad körning räknas en gång, och att serien säger hur
 * många körningar i rad som inte hittat en enda handling som går emot.
 *
 * **Fallprovet:** räknas bara det som nådde kön faller det första provet;
 * dubbleras en omkörning faller det andra; nollställs räknaren för körningar
 * i rad vid fel ände faller det tredje.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  andelMotverkar,
  korningensRad,
  laggTill,
  raknaKorningen,
  serienssammanfattning,
  type Riktningslogg,
} from "../src/riktningsfordelningen.ts";

describe("raknaKorningen", () => {
  it("räknar modellens ja även när grinden fällde det", () => {
    const post = raknaKorningen("foreslag-2026-09-07", "2026-09-07", [
      { riktning: "stodjer", iKon: true },
      { riktning: "stodjer", iKon: false },
      { riktning: "motverkar", iKon: false },
    ]);
    assert.deepEqual(post.foreslagna, { stodjer: 2, motverkar: 1 });
    assert.deepEqual(post.i_kon, { stodjer: 1, motverkar: 0 });
    // Kvoten mäter frågan vi ställer, inte vad som tog sig genom grindarna.
    assert.equal(andelMotverkar(post), 1 / 3);
  });

  it("säger ifrån i stället för att dela med noll när körningen är tom", () => {
    const post = raknaKorningen("foreslag-2026-09-07", "2026-09-07", []);
    assert.equal(andelMotverkar(post), null);
    assert.match(korningensRad(post), /ingen koppling/u);
  });
});

describe("laggTill", () => {
  it("räknar en omstartad körning en gång", () => {
    let logg: Riktningslogg = [];
    logg = laggTill(logg, raknaKorningen("a", "2026-09-07", [{ riktning: "stodjer", iKon: true }]));
    logg = laggTill(
      logg,
      raknaKorningen("a", "2026-09-07", [
        { riktning: "stodjer", iKon: true },
        { riktning: "motverkar", iKon: true },
      ]),
    );
    assert.equal(logg.length, 1);
    assert.deepEqual(logg[0]!.foreslagna, { stodjer: 1, motverkar: 1 });
  });
});

describe("serienssammanfattning", () => {
  it("räknar körningarna i rad utan en enda handling som går emot", () => {
    const logg: Riktningslogg = [
      raknaKorningen("a", "2026-09-01", [{ riktning: "motverkar", iKon: true }]),
      raknaKorningen("b", "2026-09-02", [{ riktning: "stodjer", iKon: true }]),
      raknaKorningen("c", "2026-09-03", [{ riktning: "stodjer", iKon: true }]),
    ];
    assert.match(serienssammanfattning(logg), /2 körning\(ar\) i rad/u);
  });

  it("skriver ut att en efterhandsmätt rad är ett golv", () => {
    const logg: Riktningslogg = [
      { ...raknaKorningen("a", "2026-09-06", [{ riktning: "stodjer", iKon: true }]), efterhandsmatt: true },
    ];
    assert.match(serienssammanfattning(logg), /golv/u);
  });
});

describe("loggen i datat", () => {
  it("bär körningen 2026-09-06 med sin kvot", () => {
    const logg: Riktningslogg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../data/riktningsfordelningen.json"), "utf8"),
    );
    const forsta = logg[0]!;
    assert.equal(forsta.run_id, "foreslag-2026-09-06");
    assert.equal(forsta.efterhandsmatt, true);
    // 135 stödjer och ett enda motverkar — talet genomgången pekade ut.
    assert.equal(forsta.foreslagna.motverkar, 1);
    assert.equal(forsta.foreslagna.stodjer, 135);
  });
});
