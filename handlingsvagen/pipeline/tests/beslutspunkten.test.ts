import { test } from "node:test";
import assert from "node:assert/strict";
import { punktenAntarNagot, sammanfattning, punktensEgnaOrd } from "../src/beslutspunkten.ts";

/** Lydelserna nedan står ordagrant i riksdagens utskottsförslag. */

const ANTAR_PUNKT = {
  rubrik: "Ändrad åldersgräns för avgiftsfri tandvård",
  forslag:
    "Riksdagen antar regeringens förslag till 1. lag om ändring i tandvårdslagen (1985:125), " +
    "2. lag om ändring i lagen (2008:145) om statligt tandvårdsstöd. Därmed bifaller riksdagen " +
    "proposition 2023/24:158 punkterna 1 och 2 samt avslår motionerna 2024/25:43 av Karin Rågsjö m.fl. (V).",
};

const BARA_AVSLAG_PUNKT = {
  rubrik: "Kärnvapenanvändning",
  forslag: "Riksdagen avslår motionerna 2024/25:12 av Håkan Svenneling m.fl. (V) yrkande 3.",
};

const BETANKANDE =
  "Utskottets betänkande 2024/25:SoU4 Sammanfattning Utskottet ställer sig bakom regeringens " +
  "förslag till ändring i tandvårdslagen och lagen om statligt tandvårdsstöd. Regeringens " +
  "lagförslag innebär att åldersgränsen för den avgiftsfria barn- och ungdomstandvården ska " +
  "sänkas från 23 till 19 år. Utskottets förslag till riksdagsbeslut 1. Ändrad åldersgräns …";

test("en punkt som antar något har en sak att sammanfatta", () => {
  assert.equal(punktenAntarNagot(ANTAR_PUNKT.forslag), true);
});

/**
 * Regeln som gör skillnaden. Avslår punkten bara motioner beskriver
 * sammanfattningen en ANNAN punkts sak, och då duger den inte som bevis för den
 * här — mänskligt beslut 2026-08-06.
 */
test("en punkt som bara avslår motioner har ingen egen sammanfattning", () => {
  assert.equal(punktenAntarNagot(BARA_AVSLAG_PUNKT.forslag), false);
});

test("sammanfattningen läses mellan rubrikerna", () => {
  const s = sammanfattning(BETANKANDE);
  assert.ok(s?.startsWith("Utskottet ställer sig bakom"));
  assert.ok(!s?.includes("Utskottets förslag till riksdagsbeslut"));
});

test("ett betänkande utan sammanfattningsrubrik ger null, inte tom sträng", () => {
  assert.equal(sammanfattning("Bara löpande text utan rubriker."), null);
});

/**
 * Regressionen. Svepet över hela beståndet sa 2026-08-08 att 20 av 31
 * voteringskopplingar citerade fel del, medan `handlingens-egna-ord`-skillen sa
 * att de citerade beslutspunkten. Skillnaden var just den här regeln, och
 * skillen hade rätt: alla 31 citerar handlingen själv.
 */
test("sammanfattningen räknas med för en punkt som antar — det var de 20 falska", () => {
  const lydelser = punktensEgnaOrd(ANTAR_PUNKT, BETANKANDE);
  assert.equal(lydelser.length, 2);
  assert.ok(
    lydelser.some((l) => l.includes("sänkas från 23 till 19 år")),
    "riktningen står i sammanfattningen, inte i beslutstexten",
  );
});

test("sammanfattningen räknas INTE med för en punkt som bara avslår", () => {
  const lydelser = punktensEgnaOrd(BARA_AVSLAG_PUNKT, BETANKANDE);
  assert.equal(lydelser.length, 1);
  assert.ok(!lydelser[0]!.includes("sänkas från 23 till 19 år"));
});
