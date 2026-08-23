/**
 * Ankarsättningen. Regeln står i `src/ankarsattning.ts`.
 *
 * **Modulen hade inget prov alls fram till 2026-08-23**, trots att den sätter
 * belopp på publicerade löften och trots att den ändrades samma dag. Den
 * upptäckten är själva skälet till att provet finns: verktyget lyfte ett löfte
 * från noll till 4 000 miljoner kronor per år, och ingenting hade fällt en
 * spärr som slutat fungera.
 *
 * Spärrarna är verktygets hela värde. Utan dem är det en textersättare som
 * flyttar pengar. Varje spärr har därför ett eget led här, och varje led prövar
 * BÅDE att den fäller det den ska och att den släpper det den ska.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paverkan, provaAnkarrad, satt, type Ankarrad, type Lofte } from "../src/ankarsattning.ts";

const kostnad = (o: Partial<Lofte["cost"]> = {}): Lofte["cost"] => ({
  type: "utgift", period: "per_ar", msek_low: 0, msek_base: 0, msek_high: 0, calculation: "", ...o,
});
const lofte = (o: Partial<Lofte> = {}): Lofte => ({
  id: "p-2026-0001", status: "aktiv", loftestyp: "inriktning", cost: kostnad(), ...o,
} as Lofte);
const ankare = (o: Partial<Lofte> = {}): Lofte => ({
  id: "p-2026-0002", status: "aktiv", loftestyp: "reform",
  cost: kostnad({ msek_low: 2000, msek_base: 4000, msek_high: 8000, calculation: "Egen aritmetik." }),
  ...o,
} as Lofte);
const rad = (o: Partial<Ankarrad> = {}): Ankarrad => ({
  id: "p-2026-0001", ankare: "p-2026-0002",
  utrakning:
    "Löftet pekar ut en bestämd åtgärd utan att ange en nivå. Beloppet är därför lånat från ett " +
    "jämförbart löfte om samma sak, som räknar fram sin siffra ur antalet berörda.",
  skal: "enda prissatta löftet i beståndet om samma åtgärd, och samma politik ska kosta lika",
  ...o,
});

describe("ankarsättningens spärrar", () => {
  it("godtar en rad där allt stämmer", () => {
    assert.deepEqual(provaAnkarrad(lofte(), ankare(), rad()), { ok: true, fel: [] });
  });

  it("fäller när posten eller ankaret inte finns", () => {
    assert.equal(provaAnkarrad(undefined, ankare(), rad()).ok, false);
    assert.equal(provaAnkarrad(lofte(), undefined, rad()).ok, false);
  });

  it("fäller ett tillbakadraget löfte och ett tillbakadraget ankare", () => {
    assert.equal(provaAnkarrad(lofte({ status: "tillbakadragen" }), ankare(), rad()).ok, false);
    assert.equal(provaAnkarrad(lofte(), ankare({ status: "tillbakadragen" }), rad()).ok, false);
  });

  it("fäller ett ankare som är posten själv", () => {
    const { ok, fel } = provaAnkarrad(lofte(), ankare({ id: "p-2026-0001" }), rad({ ankare: "p-2026-0001" }));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /sitt eget ankare/u);
  });

  it("fäller ett ömsesidigt lån", () => {
    // Två poster som lånar av varandra håller upp varandra utan grund i botten.
    const a = ankare({ cost: kostnad({ msek_base: 4000, anchor_ids: ["p-2026-0001"] }) });
    const { ok, fel } = provaAnkarrad(lofte(), a, rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /pekar tillbaka/u);
  });

  it("fäller ett ankare utan belopp att låna ut", () => {
    const { ok, fel } = provaAnkarrad(lofte(), ankare({ cost: kostnad({ msek_base: 0 }) }), rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /inget belopp att låna ut/u);
  });

  it("fäller en post som redan bär ett belopp", () => {
    // Verktyget sätter ett belopp på en NOLLA. Att ändra ett befintligt är en
    // annan sak och kräver en annan läsning.
    const { ok, fel } = provaAnkarrad(lofte({ cost: kostnad({ msek_base: 500 }) }), ankare(), rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /står redan på 500/u);
  });

  it("fäller olika period — ett engångsbelopp är inte ett årligt", () => {
    const { ok, fel } = provaAnkarrad(lofte(), ankare({ cost: kostnad({ msek_base: 4000, period: "engang" }) }), rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /perioden skiljer/u);
  });

  it("fäller olika kostnadstyp — en utgift och en besparing räknas åt olika håll", () => {
    const { ok, fel } = provaAnkarrad(lofte(), ankare({ cost: kostnad({ msek_base: 4000, type: "besparing" }) }), rad());
    assert.equal(ok, false);
    assert.match(fel.join(" "), /kostnadstypen skiljer/u);
  });

  it("fäller en uträkning som inte säger att beloppet är lånat", () => {
    const { ok, fel } = provaAnkarrad(lofte(), ankare(), rad({
      utrakning: "Antal berörda ungefär 100 000 personer gånger 5 000 kronor ger 500 miljoner kronor per år.",
    }));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /säger inte att beloppet är lånat/u);
  });

  it("fäller en intern beteckning i uträkningen", () => {
    const { ok, fel } = provaAnkarrad(lofte(), ankare(), rad({
      utrakning: "Beloppet är lånat från p-2026-0002, som räknar fram sin siffra ur antalet berörda personer.",
    }));
    assert.equal(ok, false);
    assert.match(fel.join(" "), /interna beteckningen p-2026-0002/u);
  });

  it("fäller ett för kort skäl", () => {
    assert.equal(provaAnkarrad(lofte(), ankare(), rad({ skal: "samma sak" })).ok, false);
  });
});

describe("ankarsättningens verkställighet", () => {
  it("tar hela spannet ur ankaret och skriver lånet i uträkningen", () => {
    const efter = satt(lofte(), ankare(), rad(), "2026-08-23");
    assert.equal(efter.cost.msek_low, 2000);
    assert.equal(efter.cost.msek_base, 4000);
    assert.equal(efter.cost.msek_high, 8000);
    assert.deepEqual(efter.cost.anchor_ids, ["p-2026-0002"]);
    assert.match(efter.cost.calculation ?? "", /lånat/u);
  });

  it("byter sort från inriktning till reform när nollan får ett belopp", () => {
    // Ett inriktningslöfte bär aldrig ett basbelopp, och `loftestyp.test.ts`
    // vaktar det. Ledet saknades till 2026-08-23 och nästa körning föll på en
    // grind som hade rätt.
    assert.equal(satt(lofte({ loftestyp: "inriktning" }), ankare(), rad(), "2026-08-23").loftestyp, "reform");
  });

  it("rör inte sorten på en post som redan är reform", () => {
    assert.equal(satt(lofte({ loftestyp: "reform" }), ankare(), rad(), "2026-08-23").loftestyp, "reform");
  });

  it("historiken säger vad som hände och bär en platshållare för commiten", () => {
    const h = satt(lofte(), ankare(), rad(), "2026-08-23").history ?? [];
    assert.equal(h[h.length - 1]?.commit, "0000000");
    // Svensk lokal skiljer tusental med HÅRT blanksteg (U+00A0), inte vanligt.
    assert.match(h[h.length - 1]?.change ?? "", /höjt från noll till 4\u00a0000 miljoner kronor per år/u);
  });

  it("paverkan räknar ett årligt ankare över mandatperioden", () => {
    assert.equal(paverkan(ankare()), 16000);
    assert.equal(paverkan(ankare({ cost: kostnad({ msek_base: 4000, period: "engang" }) })), 4000);
  });
});
