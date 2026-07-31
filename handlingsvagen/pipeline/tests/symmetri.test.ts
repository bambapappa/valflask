/**
 * Symmetritest (spec §7, HV3-milstolpen): domsmotorn behandlar båda blocken
 * exakt lika. Metoden körs mot spegelvända testfall — samma röst och samma
 * riktning ska ge samma utslag oavsett om partiet är rödgrönt eller borgerligt.
 * Motorn har ingen parti- eller blockberoende gren; det här beviset redovisas i
 * beslutsloggen (b-0020) inför lanseringsgrinden HV5.
 *
 * Utfallet skrivs ut som en liten tabell så att redovisningen kan citeras.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computePartiDomar, type Koppling } from "../src/domar.ts";
import type { Handling } from "../src/handlingar.ts";

const RODGRON = ["s", "v", "mp"] as const;
const BORGERLIG = ["m", "sd", "c", "kd", "l"] as const;

function k(id: string, riktning: Koppling["riktning"], motionstyp?: Koppling["motionstyp"]): Koppling {
  return { id, promise_id: "p-2026-0001", handling_id: "h", riktning, status: "aktiv", ...(motionstyp ? { motionstyp } : {}) };
}

/** Utslaget för ETT parti med en given röst i en votering (riktning stödjer om ej annat). */
function voteringStatus(parti: string, ford: { ja: number; nej: number; avstar: number }, riktning: Koppling["riktning"] = "stodjer") {
  const h: Handling = {
    id: "h", kind: "votering", dok_id: "202526:AU10", votering_id: "V-1", punkt: 1,
    datum: "2026-03-01", parties: [parti], persons: [], titel: "Votering",
    url: "https://data.riksdagen.se/votering/V-1", archive_url: null, utfall: "bifall",
    rostfordelning: { [parti]: { ...ford, franvarande: 7 } },
  };
  return computePartiDomar([k("k-1", riktning)], [h], { "p-2026-0001": [parti] })[0]!.status;
}

/** Utslaget för ETT parti som skrivit en partimotion (riktning stödjer). */
function motionStatus(parti: string, riktning: Koppling["riktning"] = "stodjer") {
  const h: Handling = {
    id: "h", kind: "motion", dok_id: "HD1", datum: "2026-02-01", parties: [parti],
    persons: [{ name: "Ledare", party: parti, riksdagen_id: "1" }], titel: "Partimotion",
    url: "https://data.riksdagen.se/dokument/HD1", archive_url: null,
  };
  return computePartiDomar([k("k-1", riktning, "parti")], [h], { "p-2026-0001": [parti] })[0]!.status;
}

const JA_MAJ = { ja: 80, nej: 3, avstar: 0 };
const NEJ_MAJ = { ja: 2, nej: 70, avstar: 0 };
const AVSTAR = { ja: 0, nej: 0, avstar: 40 };

test("symmetri — votering: samma röst ger samma utslag oavsett block", () => {
  const rader: string[] = [];
  for (const [namn, ford, forvantat] of [
    ["Ja-majoritet + stödjer", JA_MAJ, "agerat_i_linje"],
    ["Nej-majoritet + stödjer", NEJ_MAJ, "agerat_emot"],
    ["Avstår + stödjer", AVSTAR, "ingen_handling_annu"],
  ] as const) {
    const rg = RODGRON.map((p) => voteringStatus(p, ford));
    const bg = BORGERLIG.map((p) => voteringStatus(p, ford));
    const alla = [...rg, ...bg];
    // Alla partier i båda blocken får exakt samma, förväntade utslag.
    for (const s of alla) assert.equal(s, forvantat, `${namn}: ${s} ≠ ${forvantat}`);
    rader.push(`  ${namn.padEnd(26)} rödgröna=${rg[0]}  borgerliga=${bg[0]}`);
  }
  console.log("Symmetritest — votering (riktning stödjer):\n" + rader.join("\n"));
});

test("symmetri — riktning motverkar vänder utslaget lika för båda block", () => {
  for (const p of [...RODGRON, ...BORGERLIG]) {
    // Nej-majoritet mot ett bifall som MOTVERKAR löftet → i linje, oavsett block.
    assert.equal(voteringStatus(p, NEJ_MAJ, "motverkar"), "agerat_i_linje");
    assert.equal(voteringStatus(p, JA_MAJ, "motverkar"), "agerat_emot");
  }
});

test("symmetri — partimotion som stödjer ger 'i linje' för varje parti i båda block", () => {
  for (const p of [...RODGRON, ...BORGERLIG]) {
    assert.equal(motionStatus(p), "agerat_i_linje");
    assert.equal(motionStatus(p, "motverkar"), "agerat_emot");
  }
});

test("symmetri — rödgrönt och borgerligt är utbytbara: parvis identiska utslag", () => {
  // För varje (rödgrön, borgerlig)-par ger identisk röst identiskt utslag.
  for (const rg of RODGRON) {
    for (const bg of BORGERLIG) {
      for (const ford of [JA_MAJ, NEJ_MAJ, AVSTAR]) {
        assert.equal(voteringStatus(rg, ford), voteringStatus(bg, ford), `${rg} vs ${bg} skiljer sig`);
      }
    }
  }
});
