/**
 * Ankaret på en kö-post. Regeln står i `src/koankare.ts`.
 *
 * Provet som bär modulen är spärren: ett ankare godtas bara om ankarets
 * basbelopp faktiskt står i uträkningen. Utan den vore raden ett sätt att
 * hänga en godtycklig härkomst på ett tal, och en falsk härkomst är sämre än
 * ingen.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { beloppITexten, provaKoankarrad, sattAnkare } from "../src/koankare.ts";

const malen = new Map([
  ["p-2026-0357", { id: "p-2026-0357", msek_base: 3000, period: "per_ar", status: "aktiv" }],
  ["p-2026-0551", { id: "p-2026-0551", msek_base: 2000, period: "per_ar", status: "aktiv" }],
  ["p-2026-0820", { id: "p-2026-0820", msek_base: 2000, period: "per_ar", status: "aktiv" }],
  ["p-2026-0004", { id: "p-2026-0004", msek_base: 500, period: "engang", status: "aktiv" }],
  ["p-2026-0005", { id: "p-2026-0005", msek_base: 0, period: "per_ar", status: "aktiv" }],
  ["p-2026-0006", { id: "p-2026-0006", msek_base: 3000, period: "per_ar", status: "indraget" }],
]);

const post = {
  period: "per_ar", msek_base: 3000,
  calculation: "Bas: 3 000 mkr/år från jämförbart löfte. Spannet avspeglar osäkerhet.",
};
const skal = "Beloppet är hämtat ur det andra partiets löfte om samma sak.";

describe("talen i texten", () => {
  it("mdkr och mkr är samma skala", () => {
    const t = beloppITexten("ett jämförbart löfte anger 8 mdkr/år, alltså 8 000 mkr");
    assert.equal(t.has(8000), true);
    assert.equal(t.size, 1);
  });
  it("hårt blanksteg i tusentalen räknas bort", () => {
    assert.equal(beloppITexten("3 000 mkr").has(3000), true);
  });
});

describe("ankarraden", () => {
  it("släpper igenom ett ankare vars tal står i uträkningen", () => {
    const p = provaKoankarrad({ id: "a", ankare: "p-2026-0357", utrakning: "", skal }, post, malen);
    assert.deepEqual(p.fel, []);
    assert.equal(p.ok, true);
  });

  it("fäller ett ankare vars tal INTE står i uträkningen", () => {
    const p = provaKoankarrad({ id: "a", ankare: "p-2026-0004", utrakning: "", skal }, post, malen);
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /står på 500 mkr, och det talet finns inte/u);
  });

  it("tillåter flera ankare när meningen lånar av flera", () => {
    const p = provaKoankarrad(
      { id: "a", ankare: "p-2026-0551,p-2026-0820", utrakning: "", skal },
      { period: "per_ar", msek_base: 2000, calculation: "Jämförbara löften ligger på ~2 000 mkr/år." },
      malen,
    );
    assert.deepEqual(p.fel, []);
  });

  it("fäller en period som inte är postens", () => {
    const p = provaKoankarrad(
      { id: "a", ankare: "p-2026-0004", utrakning: "", skal },
      { period: "per_ar", msek_base: 500, calculation: "Jämförbart löfte ligger på 500 mkr." },
      malen,
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /räknas engang och posten per_ar/u);
  });

  it("fäller ett ankare utan belopp och ett indraget ankare", () => {
    const utan = provaKoankarrad({ id: "a", ankare: "p-2026-0005", utrakning: "", skal }, post, malen);
    assert.match(utan.fel.join(" "), /bär inget belopp/u);
    const dott = provaKoankarrad({ id: "a", ankare: "p-2026-0006", utrakning: "", skal }, post, malen);
    assert.match(dott.fel.join(" "), /indraget/u);
  });
});

describe("omskrivningsraden", () => {
  it("släpper igenom en text som inte längre påstår ett lån", () => {
    const p = provaKoankarrad(
      { id: "a", ankare: "", utrakning: "110 000 födslar per år à 400–600 kr ger 150–450 mkr per år.", skal },
      post,
      malen,
    );
    assert.deepEqual(p.fel, []);
  });

  it("fäller en omskrivning som lämnar lånepåståendet kvar", () => {
    const p = provaKoankarrad(
      { id: "a", ankare: "", utrakning: "Bas 3 000 mkr enligt jämförbara löften.", skal },
      post,
      malen,
    );
    assert.equal(p.ok, false);
    assert.match(p.fel.join(" "), /påstår fortfarande ett lån/u);
  });

  it("fäller en intern beteckning — uträkningen möter läsaren", () => {
    const p = provaKoankarrad(
      { id: "a", ankare: "", utrakning: "Samma belopp som p-2026-0357 bär.", skal },
      post,
      malen,
    );
    assert.match(p.fel.join(" "), /intern beteckning/u);
  });

  it("fäller ett skäl som är för kort för att säga någon annan något", () => {
    const p = provaKoankarrad({ id: "a", ankare: "p-2026-0357", utrakning: "", skal: "ok" }, post, malen);
    assert.match(p.fel.join(" "), /minst 25 krävs/u);
  });
});

describe("raden verkställd", () => {
  it("sätter ankaren och behåller uträkningen när raden inte skriver om den", () => {
    const ny = sattAnkare(post, { id: "a", ankare: "p-2026-0357", utrakning: "", skal });
    assert.deepEqual(ny.anchor_ids, ["p-2026-0357"]);
    assert.equal(ny.calculation, post.calculation);
  });

  it("skriver om uträkningen utan att uppfinna ett ankare", () => {
    const ny = sattAnkare(post, { id: "a", ankare: "", utrakning: "Egen aritmetik.", skal });
    assert.equal(ny.calculation, "Egen aritmetik.");
    assert.equal(ny.anchor_ids, undefined);
  });
});
