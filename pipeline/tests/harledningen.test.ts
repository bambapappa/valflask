/**
 * Härledningen: fem falltyper, och de två fel dagens form inte kan uttrycka.
 *
 * Fallen är hämtade ur det publicerade beståndet och står namngivna i proven, så
 * att den som läser kan slå upp dem. Ingenting här ändrar publicerat data:
 * härledningarna är FÖRSLAG som prövas mot modulen, inte poster i
 * `promises.json`.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { harledningsvy, provaHarledning, type Harledning, type Kalkyl } from "../src/harledningen.ts";

const REPO = join(import.meta.dirname, "../..");
const promises = JSON.parse(
  readFileSync(join(REPO, "data/promises.json"), "utf8"),
) as Array<{ id: string; status: string; cost: Record<string, unknown> }>;

function kalkyl(id: string): Kalkyl {
  const p = promises.find((q) => q.id === id);
  assert.ok(p, `provet behöver det publicerade löftet ${id}`);
  return p.cost as Kalkyl;
}

describe("de två fel dagens form inte kan uttrycka", () => {
  // FALL 1 — redan beslutad planram. p-2026-2926 (M) bär hela ramen 210 000 mkr
  // som engångskostnad; ramen är beslutad i nationell plan 2026–2037.
  test("en redan beslutad basnivå som summeras är ett fynd", () => {
    const bas = kalkyl("p-2026-2926");
    const harledning: Harledning = {
      version: "harledning/1",
      summeras: true,
      arsprofil: { status: "okand", skal: "källan anger perioden 2026–2037 utan årsfördelning" },
      led: [
        {
          roll: "redan-beslutad-basniva",
          text: "vidmakthållande av statliga järnvägar 2026–2037 enligt nationell plan",
          tal: 210000, enhet: "mkr", ar: 2026,
          kalla: "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/regeringens-skrivelse/nationell-planering-for-transportinfrastrukturen_hd03259/html/",
          ingar_i_summan: true, // fel med flit
        },
      ],
    };
    const fynd = provaHarledning({ ...bas, harledning });
    assert.ok(fynd.some((f) => f.sort === "dubbelraknad-basniva"), JSON.stringify(fynd));

    // Samma härledning med basnivån utanför summan ger inget sådant fynd.
    const rattad: Harledning = {
      ...harledning,
      summeras: false,
      led: [{ ...harledning.led[0]!, ingar_i_summan: false }],
    };
    assert.equal(
      provaHarledning({ ...bas, harledning: rattad }).some((f) => f.sort === "dubbelraknad-basniva"),
      false,
    );

    // FÖRVALET är det som bär regeln: ett basnivåled UTAN `ingar_i_summan`
    // summeras inte. Utan den raden i `ledSummeras` skulle varje basnivå
    // räknas med så snart någon glömmer flaggan — och då är fyndet en
    // påminnelse i stället för en grind.
    const utanFlagga: Harledning = {
      ...harledning,
      summeras: true,
      led: [{
        roll: "redan-beslutad-basniva",
        text: "vidmakthållande av statliga järnvägar 2026–2037 enligt nationell plan",
        tal: 210000, enhet: "mkr", ar: 2026,
      }],
    };
    assert.deepEqual(
      provaHarledning({ ...bas, harledning: utanFlagga }).filter((f) => f.sort === "dubbelraknad-basniva"),
      [],
      "ett basnivåled utan flagga ska inte summeras",
    );
  });

  // FALL 2 — belopp som inte kan fastställas. p-2026-3486 har två delar som drar
  // åt olika håll och står i dag på 0, alltså samma tal som en metodnolla.
  test("ett obestämbart belopp visas som obestämbart, inte som noll kronor", () => {
    const bas = kalkyl("p-2026-3486");
    assert.equal(bas.msek_base, 0, "löftet står på noll i dag");
    const harledning: Harledning = {
      version: "harledning/1",
      belopp_okant: { skal: "delarna drar åt olika håll och nettot går inte att fastställa" },
      arsprofil: { status: "okand", skal: "beloppet är obestämbart, alltså även dess fördelning" },
      led: [
        { roll: "egen-berakning", text: "slopade straffrabatter ökar kriminalvårdens kostnader", tal: null, ar: 2026 },
        { roll: "egen-berakning", text: "fler utvisningar minskar dem", tal: null, ar: 2026 },
      ],
    };
    const vy = harledningsvy({ ...bas, harledning });
    assert.match(vy.belopp, /Kan inte fastställas/u);
    assert.doesNotMatch(vy.belopp, /^0 mkr/u, "nollan får inte presenteras som ett svar");
    assert.equal(provaHarledning({ ...bas, harledning }).length, 0);

    // FALL 3 — metodnolla. p-2026-3104: nollan ÄR svaret, och ska visas som noll.
    const nolla = kalkyl("p-2026-3104");
    assert.equal(nolla.msek_base, 0);
    const metodnolla: Harledning = {
      version: "harledning/1",
      summeras: true,
      arsprofil: { status: "kand", ar: [{ ar: 2027, msek: 0 }] },
      led: [{
        roll: "egen-berakning",
        text: "utrednings- och planlöften prissätts till noll: beredningsarbetet är försumbart",
        tal: 0, enhet: "mkr", ar: 2027,
      }],
    };
    const nollvy = harledningsvy({ ...nolla, harledning: metodnolla });
    assert.match(nollvy.belopp, /^0 mkr/u, "metodnollan är ett svar och visas som noll");
    assert.doesNotMatch(nollvy.belopp, /Kan inte fastställas/u);
    assert.equal(provaHarledning({ ...nolla, harledning: metodnolla }).length, 0);
  });

  test("ett obestämbart belopp som ändå bär tal är ett fynd", () => {
    const bas = { ...kalkyl("p-2026-3486"), msek_base: 500, msek_high: 900 };
    const harledning: Harledning = {
      version: "harledning/1",
      belopp_okant: { skal: "nettot går inte att fastställa" },
      arsprofil: { status: "okand", skal: "obestämbart" },
      led: [{ roll: "antagande", text: "en gissning", tal: 500, enhet: "mkr", ar: 2027 }],
    };
    assert.ok(provaHarledning({ ...bas, harledning }).some((f) => f.sort === "okant-belopp-som-noll"));
  });
});

describe("fem falltyper utan att osäkerheten tappas", () => {
  // FALL 4 — flerårigt mål. p-2026-2450 (C): underhållsskulden borta 2035,
  // 70 000 mkr som engångsbelopp utan årsprofil i källan.
  test("ett flerårigt mål behåller sin okända årsprofil", () => {
    const bas = kalkyl("p-2026-2450");
    const harledning: Harledning = {
      version: "harledning/1",
      summeras: false,
      arsprofil: { status: "okand", skal: "partiets källa anger målåret 2035 men ingen årsfördelning" },
      led: [
        { roll: "partiets-uppgift", text: "underhållsskulden ska vara helt borta senast 2035", tal: null, ar: 2026,
          kalla: "https://www.centerpartiet.se/centerpartiets-politik/centerpartiets-politik-a-o/infrastruktur-och-transporter/jarnvag" },
        { roll: "extern-kalla", text: "eftersatt underhåll järnväg enligt Trafikverket", tal: 46000, enhet: "mkr", ar: 2020 },
        { roll: "antagande", text: "basantagande i spannet 50 000–150 000 mkr", tal: 70000, enhet: "mkr", ar: 2026 },
      ],
    };
    const vy = harledningsvy({ ...bas, harledning });
    assert.match(vy.arsprofil, /^Okänd/u, "okänd profil ska förbli okänd");
    assert.equal(vy.rader.length, 3);
    assert.match(vy.rader[0]!.text, /Partiets egen uppgift/u);
    assert.match(vy.rader[1]!.text, /Extern källa/u);
    assert.match(vy.rader[2]!.text, /Vårt antagande/u);
    assert.equal(vy.rader[1]!.ar, "2020", "externa tal bär sitt eget år");
    // Inget fynd: profilen är okänd och leden summeras inte.
    assert.deepEqual(provaHarledning({ ...bas, harledning }), []);
  });

  // FALL 5 — inriktningsspann. p-2026-3086 (C): 10 000 / 20 000 / 40 000 mkr.
  test("ett spann kan följas från källans tal till visat belopp", () => {
    const bas = kalkyl("p-2026-3086");
    assert.equal(bas.msek_low, 10000);
    assert.equal(bas.msek_high, 40000);
    const harledning: Harledning = {
      version: "harledning/1",
      summeras: true,
      arsprofil: { status: "okand", skal: "målåret är 2030; takten är inte angiven" },
      led: [
        { roll: "partiets-uppgift", text: "mål om 150 000 offentliga laddpunkter till 2030", tal: 150000, enhet: "laddpunkter", ar: 2026,
          kalla: "https://www.centerpartiet.se/centerpartiets-politik/centerpartiets-politik-a-o/klimat/klimatpolitik-som-gynnar-din-planbok" },
        { roll: "extern-kalla", text: "publika laddpunkter i februari 2026 enligt Mobility Sweden", tal: 66566, enhet: "laddpunkter", ar: 2026 },
        { roll: "antagande", text: "statlig andel av investeringen", tal: 50, enhet: "procent", ar: 2026 },
        { roll: "egen-berakning", text: "återstående punkter × kostnad per punkt × statlig andel", tal: 20000, enhet: "mkr", ar: 2026 },
      ],
    };
    const vy = harledningsvy({ ...bas, harledning });
    assert.equal(vy.strukturerad, true);
    assert.equal(vy.rader.length, 4);
    // Källans exakta tal går att följa hela vägen till det visade beloppet.
    assert.ok(vy.rader.some((r) => r.tal === "66566 laddpunkter" && r.ar === "2026"));
    assert.match(vy.belopp, /20000 mkr/u);
    // Summeringsprovet biter inte här: leden mäter olika enheter, och bara det
    // sista ledet bär mkr. Summan prövas därför inte — och det säger vyn inte
    // att den gör.
  });

  test("en kalkyl utan härledning ser ostrukturerad ut, inte strukturerad", () => {
    const bas = kalkyl("p-2026-2450");
    const vy = harledningsvy({ ...bas, harledning: null });
    assert.equal(vy.strukturerad, false);
    assert.match(vy.arsprofil, /Okänd/u);
    assert.equal(vy.rader.length, 1, "den fria texten blir en rad, inte en härledning");
    assert.deepEqual(vy.fynd, []);
  });
});

describe("invarianterna biter på det de mäter", () => {
  test("en summa som inte stämmer med basbeloppet är ett fynd", () => {
    const harledning: Harledning = {
      version: "harledning/1",
      summeras: true,
      arsprofil: { status: "okand", skal: "prov" },
      led: [
        { roll: "egen-berakning", text: "en del", tal: 100, enhet: "mkr", ar: 2027 },
        { roll: "egen-berakning", text: "en annan del", tal: 100, enhet: "mkr", ar: 2027 },
      ],
    };
    const fynd = provaHarledning({ msek_base: 500, harledning });
    assert.ok(fynd.some((f) => f.sort === "summan-stammer-inte"));
    assert.deepEqual(provaHarledning({ msek_base: 200, harledning }), []);
  });

  test("en årsprofil som inte summerar till basbeloppet är ett fynd", () => {
    const harledning: Harledning = {
      version: "harledning/1",
      arsprofil: { status: "kand", ar: [{ ar: 2027, msek: 100 }, { ar: 2028, msek: 100 }] },
      led: [{ roll: "partiets-uppgift", text: "partiets tal", tal: 500, enhet: "mkr", ar: 2026 }],
    };
    const fynd = provaHarledning({ msek_base: 500, harledning });
    assert.ok(fynd.some((f) => f.sort === "arsprofil-stammer-inte"));
  });

  test("ett tal utan årtal är ett fynd", () => {
    const harledning: Harledning = {
      version: "harledning/1",
      arsprofil: { status: "okand", skal: "prov" },
      led: [{ roll: "extern-kalla", text: "ett tal ur en rapport", tal: 46000, enhet: "mkr" }],
    };
    assert.ok(provaHarledning({ msek_base: 46000, harledning }).some((f) => f.sort === "tal-utan-ar"));
  });
});
