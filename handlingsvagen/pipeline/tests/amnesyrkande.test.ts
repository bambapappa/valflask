/**
 * Grinden mot yrkanden som bara namnger ett ämne. Regeln står i
 * `src/amnesyrkande.ts`, och den prövas i H5.
 *
 * Provet mäter tre saker:
 *
 * 1. att de fyra lydelser som genomgången 2026-09-06 pekade ut för hand fälls,
 * 2. att de lydelser som bär sin riktning i den korta formen släpps igenom —
 *    det är den halvan som kostar något om den går sönder, för ett felaktigt
 *    fällt yrkande är en verklig handling som aldrig når kön,
 * 3. att grinden faktiskt sitter i H5 och inte bara i modulen.
 *
 * **Fallprovet:** tas något av de fyra villkoren bort ska provet falla. Utan
 * ordgränsen släpper «om stärkt sydsvenskt försvar» inte längre igenom; utan
 * prepositionsvillkoret faller «om språkkrav inom äldreomsorgen»; utan
 * infinitivvillkoret faller «om att avskaffa karensavdraget»; utan artikeln
 * faller «om ett landsbygdslån». Varje rad nedan har en motsvarighet i
 * beståndet — ingen är hittepå.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  amnesyrkandetsSkal,
  friarAmnet,
  riktningslostAmnesyrkande,
  yrkandetsAmne,
} from "../src/amnesyrkande.ts";
import { provaGrindarna, type KopplingsForslag } from "../src/grindar.ts";

/** Yrkandet i sin fulla lydelse, som det står hos riksdagen. */
const yrkande = (amne: string) =>
  `Riksdagen ställer sig bakom det som anförs i motionen om ${amne} och tillkännager detta för regeringen.`;

/** De fyra som genomgången 2026-09-06 pekade ut i kön, ord för ord. */
const KONS_FYRA = ["språkkrav", "kärnkraft", "public service"];

/** Lydelser ur beståndet som bär sin riktning trots att de är korta. */
const BAR_RIKTNING = [
  "att avskaffa karensavdraget",
  "att grundlagsskydda aborträtten",
  "rätten att reparera",
  "krav på heltid",
  "utbyggnad av civilplikt",
  "gruppförbud för PFAS",
  "språkkrav inom äldreomsorgen",
  "en skärpt vårdgaranti",
  "ett landsbygdslån",
  "stärkt sydsvenskt försvar",
  "regional fysisk planering",
];

describe("riktningslostAmnesyrkande", () => {
  it("fäller de fyra ämnesyrkanden genomgången pekade ut", () => {
    for (const amne of KONS_FYRA) {
      assert.ok(riktningslostAmnesyrkande(yrkande(amne)), `«om ${amne}» skulle ha fällts`);
    }
  });

  it("släpper igenom korta lydelser som ändå säger vad som ska göras", () => {
    for (const amne of BAR_RIKTNING) {
      assert.ok(!riktningslostAmnesyrkande(yrkande(amne)), `«om ${amne}» skulle ha släppts igenom`);
    }
  });

  it("rör bara tillkännagivandeyrkandet — andra yrkanden bär sin riktning på andra sätt", () => {
    const andra = [
      "Riksdagen anvisar anslagen för 2024 inom utgiftsområde 20 Klimat, miljö och natur enligt förslaget i tabell 1 i motionen.",
      "Riksdagen avslår regeringens förslag om kärnkraft.",
      "Riksdagen antar regeringens förslag till lag om ändring i lagen (1991:1047) om sjuklön.",
    ];
    for (const citat of andra) {
      assert.equal(yrkandetsAmne(citat), null, citat);
      assert.ok(!riktningslostAmnesyrkande(citat), citat);
    }
  });

  it("tar med den andra slutledsformen som beståndet skriver", () => {
    assert.ok(
      riktningslostAmnesyrkande(
        "Riksdagen ställer sig bakom det som anförs i motionen om kärnkraft, och detta tillkännager riksdagen för regeringen.",
      ),
    );
  });

  // Ordgränsen fångar i dagens bestånd samma rader som de tre andra villkoren,
  // och slutsatsen ensam kan därför inte skilja dem åt. De prövas var för sig,
  // med ämnen ur beståndet, så att varje villkor bär sin egen vikt.
  it("friar varje ämne av det skäl regeln säger, inte av ordgränsen", () => {
    assert.equal(friarAmnet("att avskaffa karensavdraget"), "infinitivmarket");
    assert.equal(friarAmnet("rätten att reparera"), "infinitivmarket");
    assert.equal(friarAmnet("krav på heltid"), "preposition");
    assert.equal(friarAmnet("språkkrav inom äldreomsorgen"), "preposition");
    assert.equal(friarAmnet("gruppförbud för PFAS"), "preposition");
    assert.equal(friarAmnet("en skärpt vårdgaranti"), "obestamd artikel");
    assert.equal(friarAmnet("ett landsbygdslån"), "obestamd artikel");
    assert.equal(friarAmnet("stärkt sydsvenskt försvar"), "langre an tva ord");
    assert.equal(friarAmnet("regional fysisk planering"), "langre an tva ord");
    assert.equal(friarAmnet("kärnkraft"), null);
    assert.equal(friarAmnet("public service"), null);
  });

  it("skriver ut ämnet i skälet, så att den som läser ser vad som fattas", () => {
    assert.match(amnesyrkandetsSkal(yrkande("public service")), /«om public service»/u);
  });
});

describe("H5 fäller ämnesyrkandet", () => {
  const forslag = (citat: string): KopplingsForslag => ({
    promise_id: "p-2026-1822",
    handling_id: "h-2026-20344",
    riktning: "stodjer",
    bevis: { citat },
    motionstyp: "kommitte",
    method_note: "Yrkandet gäller kärnkraft.",
    confidence: 0.8,
  });
  const kontext = (citat: string) => ({
    handling: {
      id: "h-2026-20344",
      kind: "motion" as const,
      dok_id: "HD023594",
      datum: "2025-10-07",
      parties: ["s"],
      titel: "Utgiftsområde 21 Energi",
      url: "https://data.riksdagen.se/dokument/HD023594",
      archive_url: null,
      persons: [],
    },
    kalltext: citat,
    malPartier: ["s"],
    fonster: { fran: "2022-09-11", till: "2026-09-13" },
    handlingstext: { sort: "yrkanden" as const, delar: [citat] },
  });

  it("fäller «om kärnkraft» på H5, inte på H2", () => {
    const citat = yrkande("kärnkraft");
    const fel = provaGrindarna(forslag(citat), kontext(citat));
    assert.equal(fel.length, 1);
    assert.equal(fel[0]!.grind, "H5");
    assert.match(fel[0]!.reason, /«om kärnkraft»/u);
  });

  it("släpper igenom samma yrkande med riktningen utskriven", () => {
    const citat = yrkande("att tillåta ny kärnkraft på befintliga kärnkraftsområden");
    assert.deepEqual(provaGrindarna(forslag(citat), kontext(citat)), []);
  });
});

describe("mätningen mot beståndet", () => {
  const las = (f: string) =>
    JSON.parse(readFileSync(resolve(import.meta.dirname, "../..", f), "utf8")) as Array<{
      bevis?: { citat?: string };
    }>;

  it("lämnar inget ämnesyrkande kvar i kön", () => {
    // De fyra som låg i kön 2026-09-06 är avvisade, och grinden hindrar nya
    // från att skrivas dit. Det är den invarianten som ska hålla framåt —
    // kön får aldrig innehålla ett yrkande som inte bär någon riktning.
    const ko = las("data/kopplingsforslag.json").filter((k) =>
      riktningslostAmnesyrkande(k.bevis?.citat ?? ""),
    );
    assert.deepEqual(ko.map((k) => yrkandetsAmne(k.bevis!.citat!)), []);
  });

  it("visar de åtta som redan står publicerade", () => {
    // De åtta rörs inte av grinden — att byta eller dra in en publicerad
    // koppling är en rättelse och ett mänskligt beslut. Talet står här för att
    // en tyst förändring av beståndet ska fälla provet, åt båda hållen: betas
    // de av ska talet sänkas i samma körning.
    const publicerat = las("data/kopplingar.json").filter(
      (k) => (k as { status?: string }).status === "aktiv" && riktningslostAmnesyrkande(k.bevis?.citat ?? ""),
    );
    assert.equal(publicerat.length, 8);
  });
});
