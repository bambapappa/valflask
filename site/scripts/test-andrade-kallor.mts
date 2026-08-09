/*
 * Provar grinden framför `/andrade-kallor`.
 *
 * Sidan lägger fram ett påstående om att någon annan ändrat sin text. Det är
 * den mest laddade sak sajten säger, och det enda som skiljer den från ett
 * rykte är beläggen: en arkivkopia som bär citatet, och en människa som öppnat
 * båda länkarna. Grinden är därför det som faktiskt behöver ett prov — inte
 * hur posterna ser ut.
 *
 * Körs med `node --experimental-strip-types --test`, som sajtens övriga grindar.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { farLaggasFram, raknaPerSlag, SLAG_FORKLARING, SLAG_RUBRIK } from "../src/lib/andrade-kallor.ts";
import type { Kallandring } from "../src/lib/source-link.ts";
import type { AndradKalla } from "../src/lib/andrade-kallor.ts";

const ARKIV = "https://web.archive.org/web/20260718054004/https://exempel.se";

const andring = (extra: Partial<Kallandring> = {}): Kallandring => ({
  kind: "ordalydelse",
  observed_at: "2026-08-09",
  now_reads: "Det som står där i dag.",
  ...extra,
});

describe("grinden framför ändrade källor", () => {
  it("släpper fram ett fall med både arkivkopia och mänsklig granskning", () => {
    assert.equal(farLaggasFram(andring({ reviewed_at: "2026-08-09" }), ARKIV), true);
  });

  it("stoppar ett fall utan arkivkopia", () => {
    // Utan kopia finns inget "förut" att ställa mot "nu" — bara vårt ord om
    // vad som stod. Det är inte ett belägg, det är ett påstående.
    assert.equal(farLaggasFram(andring({ reviewed_at: "2026-08-09" }), null), false);
  });

  it("stoppar ett fall som ingen människa har granskat", () => {
    // En samtyckesruta, en javascriptritad sida eller en betalvägg ser ut
    // precis som en utbytt sida för kontrollen. Mätningen räcker inte.
    assert.equal(farLaggasFram(andring(), ARKIV), false);
  });

  it("stoppar en källa som aldrig flaggats", () => {
    assert.equal(farLaggasFram(undefined, ARKIV), false);
  });

  it("ett tomt granskningsdatum är inget godkännande", () => {
    assert.equal(farLaggasFram(andring({ reviewed_at: "" }), ARKIV), false);
  });
});

describe("slagen hålls isär", () => {
  it("varje slag har både rubrik och förklaring", () => {
    // Ett slag utan förklaring skulle nå läsaren som en naken stämpel, och en
    // naken stämpel är den anklagelse sidan uttryckligen inte gör.
    for (const slag of ["ordalydelse", "sidan-utbytt", "sidan-borttagen"] as const) {
      assert.ok(SLAG_RUBRIK[slag], `rubrik saknas för ${slag}`);
      assert.ok(SLAG_FORKLARING[slag], `förklaring saknas för ${slag}`);
    }
  });

  it("ingen förklaring påstår något om avsikt", () => {
    // Tonregeln, mätt: sidan säger vad som står, aldrig varför.
    const laddade = ["dölj", "smyg", "svek", "ljug", "bortförklar", "medveten"];
    for (const [slag, text] of Object.entries(SLAG_FORKLARING)) {
      for (const ord of laddade) {
        assert.ok(!text.toLowerCase().includes(ord), `${slag} antyder avsikt: "${text}"`);
      }
    }
  });
});

describe("räkningen per slag", () => {
  it("räknar varje slag för sig och summerar till antalet fall", () => {
    const fall = [
      { andring: andring() },
      { andring: andring() },
      { andring: andring({ kind: "sidan-utbytt", now_reads: undefined }) },
    ] as AndradKalla[];
    const per = raknaPerSlag(fall);
    assert.equal(per.ordalydelse, 2);
    assert.equal(per["sidan-utbytt"], 1);
    assert.equal(per["sidan-borttagen"], 0);
    assert.equal(per.ordalydelse + per["sidan-utbytt"] + per["sidan-borttagen"], fall.length);
  });

  it("en tom lista ger nollor, inte tomma fält", () => {
    const per = raknaPerSlag([]);
    assert.deepEqual(per, { ordalydelse: 0, "sidan-utbytt": 0, "sidan-borttagen": 0 });
  });
});
