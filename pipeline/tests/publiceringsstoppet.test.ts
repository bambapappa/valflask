/**
 * Fyra ändringar efter ett exakt godkännande — vilka stoppar publiceringen?
 *
 * Ett godkännande gäller EN version. Provprotokollet prövar därför fyra
 * ändringar var för sig — period, ankare, partitillhörighet och ett beroende —
 * och kräver att var och en gör det godkända paketet ogiltigt. Ett oförändrat
 * paket ska gå vidare, annars vaktar kontrollen ingenting: en jämförelse som
 * alltid säger nej är lika värdelös som en som alltid säger ja.
 *
 * De två skydden mäts var för sig, för de täcker olika saker:
 *
 *   `sammaUnderlag()`   paketets identitet — hela den lagrade posten och
 *                       beroendegrafen
 *   `provningsGrind()`  godkännandevägens grind — bara de fält `kanon()` läser
 *
 * Skillnaden är hela poängen med provet. Ankaret stoppas av det ena men inte
 * av det andra, och partiernas egen metadata stoppas av inget av dem.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { byggUnderlagsregister, type PubliceratUnderlag } from "../src/underlagsregister.ts";
import { bindUnderlag, sammaUnderlag } from "../src/underlagsversion.ts";
import { kanon, provningsGrind, type Provning } from "../src/provningar.ts";

/** Ett litet publicerat underlag: två löften i grupp, ett ankare, en koppling. */
function underlag(): PubliceratUnderlag {
  const lofte = (id: string, extra: Record<string, unknown> = {}) => ({
    id, title: `Löfte ${id}`, quote: `Vi lovar ${id}.`, parties: ["s"], person: null,
    status: "aktiv", group_id: "g-provgrupp", loftestyp: "reform",
    source: { url: `https://example.test/${id}/` },
    financing_claimed: { described: false, summary: null, msek: null },
    cost: {
      type: "utgift", period: "per_ar", msek_low: 1, msek_base: 2, msek_high: 3,
      basis: "granskare", calculation: "en uträkning", anchor_ids: [] as string[],
    },
    ...extra,
  });
  const ankare = lofte("p-2026-9003", { group_id: null });
  const forst = lofte("p-2026-9001");
  (forst.cost as Record<string, unknown>)["anchor_ids"] = ["p-2026-9003"];
  return {
    loften: [forst, lofte("p-2026-9002"), ankare],
    handlingar: [{ id: "h-2026-9001", dok_id: "HX00001", titel: "En motion" }],
    standpunkter: [],
    kopplingar: [{
      id: "k-2026-9001", promise_id: "p-2026-9001", handling_id: "h-2026-9001",
      riktning: "stodjer", status: "aktiv", bevis: { citat: "Riksdagen ställer sig bakom." },
    }],
  };
}

const ROT = "lofte:p-2026-9001";

/** Det godkända paketet: roten bunden med sina beroenden. */
function bundet(data: PubliceratUnderlag) {
  return bindUnderlag(ROT, byggUnderlagsregister(data));
}

/** Löftet som är rot, ur ett underlag. */
function roten(data: PubliceratUnderlag): Record<string, unknown> {
  return data.loften.find((p) => p["id"] === "p-2026-9001") as Record<string, unknown>;
}

function provningFor(data: PubliceratUnderlag): Map<string, Provning> {
  return new Map([[
    "p-2026-9001",
    { id: "p-2026-9001", slag: "lofte", datum: "2026-09-01", utfall: "haller",
      underlag_hash: kanon("lofte", roten(data)) },
  ]]);
}

describe("ett oförändrat godkänt paket går vidare", () => {
  test("samma underlag ger samma paket och en aktuell prövning", () => {
    const godkant = bundet(underlag());
    const nu = bundet(underlag());
    assert.equal(sammaUnderlag(godkant, nu), true);
    assert.equal(provningsGrind(provningFor(underlag()), ["p-2026-9001"], "lofte", roten(underlag())).ok, true);
  });
});

describe("fyra ändringar efter godkännandet", () => {
  const fall: ReadonlyArray<{
    namn: string;
    andra: (d: PubliceratUnderlag) => void;
    stoppasAvPaketet: boolean;
    stoppasAvGrinden: boolean;
  }> = [
    {
      namn: "perioden byts",
      andra: (d) => { ((roten(d)["cost"]) as Record<string, unknown>)["period"] = "engang"; },
      stoppasAvPaketet: true, stoppasAvGrinden: true,
    },
    {
      namn: "ankaret byts",
      andra: (d) => { ((roten(d)["cost"]) as Record<string, unknown>)["anchor_ids"] = ["p-2026-9002"]; },
      stoppasAvPaketet: true, stoppasAvGrinden: false,
    },
    {
      namn: "partitillhörigheten byts",
      andra: (d) => { roten(d)["parties"] = ["m"]; },
      stoppasAvPaketet: true, stoppasAvGrinden: true,
    },
    {
      namn: "ett beroende ändras — ankarlöftets belopp",
      andra: (d) => {
        const a = d.loften.find((p) => p["id"] === "p-2026-9003") as Record<string, unknown>;
        (a["cost"] as Record<string, unknown>)["msek_base"] = 999;
      },
      stoppasAvPaketet: true, stoppasAvGrinden: false,
    },
  ];

  for (const f of fall) {
    test(`${f.namn}: paketet ${f.stoppasAvPaketet ? "stoppar" : "stoppar INTE"}, grinden ${f.stoppasAvGrinden ? "stoppar" : "stoppar INTE"}`, () => {
      const godkant = bundet(underlag());
      const provningar = provningFor(underlag());
      const efter = underlag();
      f.andra(efter);
      assert.notDeepEqual(efter, underlag(), "ändringen ska vara verklig");

      assert.equal(sammaUnderlag(godkant, bundet(efter)), !f.stoppasAvPaketet,
        `paketets identitet: ${f.namn}`);
      assert.equal(provningsGrind(provningar, ["p-2026-9001"], "lofte", roten(efter)).ok,
        !f.stoppasAvGrinden, `prövningens hash: ${f.namn}`);
    });
  }

  // Femte fallet, utanför uppgiftens fyra: partiernas EGEN metadata.
  // Mandattal och manifeststatus visas på partisidan men ligger varken i
  // paketet eller i prövningens hash — inget av skydden ser en ändring där.
  test("partiernas egen metadata ligger utanför båda skydden", () => {
    const register = byggUnderlagsregister(underlag());
    const text = JSON.stringify(register);
    assert.equal(text.includes("mandate_2022"), false, "paketet bär ingen partimetadata");
    assert.equal(text.includes("manifest_2026"), false);
    // Prövningens hash läser bara löftets partikoder, inte partiets uppgifter.
    const med = roten(underlag());
    assert.equal(kanon("lofte", med), kanon("lofte", { ...med, parties: ["s"] }));
  });
});
