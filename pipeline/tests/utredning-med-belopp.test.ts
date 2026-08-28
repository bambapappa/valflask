/**
 * Ankarregelns spegelbild: ett belopp som inte borde finnas.
 *
 * `nollan_utan_ankare` fäller en nolla vars citat pekar ut en åtgärd. Den här
 * fäller åt andra hållet — ett belopp på ett löfte som bara lovar en utredning.
 * C2 skrev ut att ledet saknades och vad som skulle hända utan det: *«ingen
 * kontroll mäter det ledet, så nästa skörd kan göra om det»*. Den gjorde det.
 * Regeln avgjordes 2026-08-13 mot ett bestånd om 690 löften och fällde fyra;
 * beståndet är 2 713 i dag och 28 löften bär ett belopp för en utredning.
 *
 * **Facit är A2:s egna undantag.** Tre löften fick behålla sitt belopp därför
 * att citatet lovar en åtgärd utöver utredningen. De tre måste passera, annars
 * mäter kontrollen inte regeln utan bara ordet «utred».
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { utredningUtanAtgard } from "../src/utrakningen.ts";

const LOFTEN = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../data/promises.json"), "utf8"),
) as { id: string; quote?: string; status?: string; cost?: { msek_base?: number } }[];

const aktiva = LOFTEN.filter((p) => p.status !== "tillbakadragen");
const citat = (id: string): string => aktiva.find((p) => p.id === id)?.quote ?? "";

describe("utredningUtanAtgard", () => {
  it("fäller ett citat som bara lovar en utredning", () => {
    assert.ok(utredningUtanAtgard("Ansvarsfullt utreda för- och nackdelar med euron i en ny och osäker värld."));
    assert.ok(utredningUtanAtgard("Därför vill vi tillsätta en kommission för kvinnohälsa."));
    assert.ok(utredningUtanAtgard("Genomföra en stor översyn av hela momssystemet."));
    assert.ok(utredningUtanAtgard("Vi vill ta fram en plan för utfasning av fossil gas."));
  });

  it("tiger när citatet lovar en åtgärd utöver utredningen", () => {
    assert.equal(utredningUtanAtgard("Se över reglerna och höja studiestödet."), null);
    assert.equal(utredningUtanAtgard("Utreda frågan och avskaffa avgiften."), null);
    assert.equal(utredningUtanAtgard("Kartlägga behoven och anställa fler."), null);
  });

  it("tiger när citatet inte nämner någon utredning alls", () => {
    assert.equal(utredningUtanAtgard("Höja barnbidraget med 200 kronor i månaden."), null);
    assert.equal(utredningUtanAtgard("Bygga ut kärnkraften."), null);
  });

  it("ser åtgärdsord som börjar på svensk bokstav", () => {
    // `\b` biter inte före å/ä/ö, så ett mönster med `\böka\b` hade fällt det
    // här citatet. Samma fälla var redan lagad i quality-scan.ts men levde
    // kvar i ATGARDSVERB — se kommentaren där.
    assert.equal(utredningUtanAtgard("Se över systemet så att anslaget ska öka."), null);
    assert.equal(utredningUtanAtgard("Utreda frågan och återinföra avdraget."), null);
  });
});

describe("A2:s facit — de tre som fick behålla sitt belopp", () => {
  // Mänskligt beslut 2026-08-13: «Tre löften med utredningsord bär belopp med
  // rätta — därför att citatet lovar en åtgärd utöver utredningen.» Fäller
  // kontrollen någon av dem prövar den om ett avgjort beslut.
  for (const id of ["p-2026-0048", "p-2026-0059", "p-2026-0708"]) {
    it(`${id} passerar`, () => {
      const q = citat(id);
      assert.notEqual(q, "", `${id} finns inte längre i beståndet — provet mäter ingenting`);
      assert.equal(
        utredningUtanAtgard(q),
        null,
        `${id} fälldes, men A2 avgjorde att den bär sitt belopp med rätta:\n  ${q.slice(0, 160)}`,
      );
    });
  }
});

describe("skulden i beståndet", () => {
  const traffar = aktiva
    .filter((p) => (p.cost?.msek_base ?? 0) > 0 && utredningUtanAtgard(p.quote ?? "") !== null)
    .map((p) => p.id)
    .sort();
  const facit = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../facit/utredningsskulden.json"), "utf8"),
  ) as { count: number; poster: { id: string; skal: string }[] };
  const frikanda = facit.poster.map((p) => p.id).sort();

  it("facit säger samma antal som det listar", () => {
    assert.equal(facit.poster.length, facit.count);
  });

  it("varje frikänd post bär ett skäl som går att pröva", () => {
    for (const post of facit.poster) {
      assert.ok(post.skal.length > 80, `${post.id}: skälet är för kort för att en läsare ska kunna pröva det`);
    }
  });

  it("inget nytt löfte bär ett belopp för en ren utredning", () => {
    // Svepet 2026-08-23 nollade 24 poster enligt regeln, däribland
    // euroutredningen som var kontrollens avgörande fall. De två som står kvar
    // är lästa och frikända: kontrollen ser dem, men läsningen gav dem rätt.
    const nya = traffar.filter((id) => !frikanda.includes(id));
    assert.deepEqual(
      nya,
      [],
      "Ett belopp för ett löfte som bara lovar en utredning bryter mot en fastställd regel.\n" +
        "Nolla det med `pnpm regelnollning`, eller läs det och lägg skälet i\n" +
        `facit/utredningsskulden.json om regeln inte gäller. Nya: ${nya.join(", ")}`,
    );
  });

  it("de frikända står kvar bara så länge kontrollen fäller dem", () => {
    // Ett facit som listar poster kontrollen inte längre ser växer av sig
    // självt. Rättas en av dem ska den strykas härifrån.
    const onodiga = frikanda.filter((id) => !traffar.includes(id));
    assert.deepEqual(onodiga, [], `Dessa fälls inte längre och ska strykas ur facit: ${onodiga.join(", ")}`);
  });
});

/**
 * Plural-utredningar är någon annans arbete, inte partiets löfte.
 *
 * Mönstret `utred\p{L}*` fångade också substantivet i plural, och det betyder
 * nästan alltid brottsutredningar eller myndighetsärenden som pågår — inte en
 * statlig utredning som partiet lovar att tillsätta.
 *
 * Fallet som avgjorde: Liberalernas löfte om «ett europeiskt FBI och en
 * europeisk åklagarmyndighet som kan jobba på riktigt med att samordna
 * utredningar av människohandel» flaggades som ett utredningslöfte. Följer man
 * flaggan nollas ett institutionslöfte på 50 miljoner kronor per år — för att
 * ett substantiv delar stam med ett verb.
 */
describe("utredningar i plural är inte ett utredningslöfte", () => {
  it("tiger om brottsutredningar någon annan ska samordna", () => {
    assert.equal(
      utredningUtanAtgard(
        "Vi vill ha ett europeiskt FBI och en europeisk åklagarmyndighet som kan jobba på riktigt med att samordna utredningar av människohandel.",
      ),
      null,
    );
  });

  it("tiger också om den bestämda pluralformen", () => {
    assert.equal(utredningUtanAtgard("Polisen ska få bättre verktyg i utredningarna."), null);
  });

  it("fångar fortfarande verbet — det är där löftet sitter", () => {
    assert.equal(utredningUtanAtgard("Vi vill utreda möjligheten att dela pensionsrätter."), "utreda");
    assert.equal(utredningUtanAtgard("Frågan ska utredas ordentligt."), "utredas");
  });

  it("fångar fortfarande singularformen, bestämd och obestämd", () => {
    assert.equal(utredningUtanAtgard("Utredningen ska lämna förslag före valet."), "Utredningen");
    assert.ok(utredningUtanAtgard("Vi vill tillsätta en statlig utredning."));
  });

  it("rör inte översyn och utvärdering", () => {
    assert.equal(utredningUtanAtgard("Se över bostadsbidraget."), "Se över");
    assert.equal(utredningUtanAtgard("Göra en översyn av mervärdesskattelagen."), "översyn");
  });
});
