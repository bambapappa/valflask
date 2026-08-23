/**
 * Spärrhaken för prövningsskulden. Regeln och skälen står i
 * `src/provningsskulden.ts`.
 *
 * Provet mäter två saker: att ingen NY publicerad sak får en prövning som
 * beskriver en annan version, och att den frysta skulden bara krymper. Det
 * andra är poängen — utan den raden kan någon "lösa" ett rött prov genom att
 * lägga till id:t i facit, och då är grinden en påminnelse igen.
 *
 * Skillnaden mot `provningsGrind()` är var den sitter. Grinden fäller samma
 * sak, men bara i godkännandevägen: det som redan är publicerat och sedan
 * glider isär från sin prövning möter den aldrig. Det var luckan, och den var
 * mätbar — 390 saker den 23 augusti, 367 av dem löften.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { lasProvningar } from "../src/provningar.ts";
import {
  domSkulden,
  kopplingsSaker,
  loftesSaker,
  rakna,
  standpunktsSaker,
  type Skuldfacit,
} from "../src/provningsskulden.ts";

const DATA = resolve(import.meta.dirname, "../../data");
const HV_DATA = resolve(import.meta.dirname, "../../handlingsvagen/data");
const FACIT = resolve(import.meta.dirname, "../facit/provningsskulden.json");

const las = (p: string): Record<string, unknown>[] =>
  existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>[]) : [];

describe("prövningsskulden", () => {
  const provningar = lasProvningar(DATA);
  const gamla = [
    ...rakna(loftesSaker(las(resolve(DATA, "promises.json"))), provningar).gamla,
    ...rakna(kopplingsSaker(las(resolve(HV_DATA, "kopplingar.json"))), provningar).gamla,
    ...rakna(standpunktsSaker(las(resolve(DATA, "stances.json"))), provningar).gamla,
  ];
  const facit = JSON.parse(readFileSync(FACIT, "utf8")) as Skuldfacit;
  const dom = domSkulden(gamla, facit);

  it("facit säger samma antal som det listar", () => {
    assert.equal(
      facit.ids.length,
      facit.count,
      `facit/provningsskulden.json säger count ${facit.count} men listar ${facit.ids.length} id.`,
    );
  });

  it("ingen ny sak får en prövning som beskriver en annan version", () => {
    assert.deepEqual(
      dom.nya,
      [],
      "En prövning som beskriver en äldre version är ingen prövning av det som står\n" +
        "publicerat. Pröva om saken med haller-det — lägg den INTE i facit.\n" +
        `Nya: ${dom.nya.join(", ")}`,
    );
  });

  it("den frysta skulden krymper, den växer aldrig", () => {
    assert.deepEqual(
      dom.rattade,
      [],
      "Dessa är prövade på nytt och ska strykas ur facit/provningsskulden.json,\n" +
        "annars döljer listan hur långt arbetet kommit:\n" +
        `${dom.rattade.join(", ")}`,
    );
  });
});

describe("domSkulden biter åt båda hållen", () => {
  // Utan det här provet mäter de tre ovan ingenting den dag skulden är noll:
  // en tom lista mot en tom lista är grön oavsett hur domen är skriven.
  const facit: Skuldfacit = { count: 2, ids: ["lofte:p-2026-0001", "koppling:k-2026-0002"] };

  it("en gammal prövning utanför facit fälls", () => {
    const dom = domSkulden(["lofte:p-2026-0001", "koppling:k-2026-0002", "lofte:p-2026-0003"], facit);
    assert.deepEqual(dom.nya, ["lofte:p-2026-0003"]);
    assert.deepEqual(dom.rattade, []);
  });

  it("en rättad post i facit pekas ut", () => {
    const dom = domSkulden(["lofte:p-2026-0001"], facit);
    assert.deepEqual(dom.nya, []);
    assert.deepEqual(dom.rattade, ["koppling:k-2026-0002"]);
  });

  it("slaget skiljer två saker med samma id-form", () => {
    // `lofte:x` och `koppling:x` är olika skulder. Räknades bara id:t skulle
    // en rättad koppling kunna kvitta ett nytt löftesbrott.
    const dom = domSkulden(["koppling:p-2026-0001"], { count: 1, ids: ["lofte:p-2026-0001"] });
    assert.deepEqual(dom.nya, ["koppling:p-2026-0001"]);
    assert.deepEqual(dom.rattade, ["lofte:p-2026-0001"]);
  });
});
