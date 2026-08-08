import { test } from "node:test";
import assert from "node:assert/strict";
import {
  provaUtrakningen,
  anmarkningar,
  nollskal,
  forklararSkillnaden,
  type UtrakningsLofte,
} from "../src/utrakningen.ts";

type Overskrift = Partial<Omit<UtrakningsLofte, "cost">> & { cost?: Partial<UtrakningsLofte["cost"]> };

function lofte(over: Overskrift = {}): UtrakningsLofte {
  return {
    id: "p-test",
    title: "Test",
    quote: "Vi vill höja barnbidraget.",
    parties: ["s"],
    category: "övrigt",
    status: "aktiv",
    ...over,
    cost: {
      type: "utgift",
      period: "per_ar",
      msek_low: 500,
      msek_base: 1000,
      msek_high: 2000,
      basis: "llm_estimat",
      calculation: "1 miljon barn × 1 000 kronor = 1 000 miljoner kronor per år.",
      ...over.cost,
    },
  };
}

function kontroller(p: UtrakningsLofte): string[] {
  return provaUtrakningen(p).map((i) => i.kontroll);
}

test("ett löfte där allt går ihop ger ingen invändning", () => {
  assert.deepEqual(kontroller(lofte()), []);
});

test("en tom uträkning är en invändning, och de övriga kontrollerna tiger då", () => {
  const i = provaUtrakningen(lofte({ cost: { calculation: "" } }));
  assert.deepEqual(
    i.map((x) => x.kontroll),
    ["utrakningen_saknas"],
    "utan uträkning finns inget att pröva de andra kontrollerna mot",
  );
});

test("ett belopp som inte namns i uträkningen fastnar", () => {
  assert.ok(
    kontroller(lofte({ cost: { calculation: "Vi bedömer att det blir ganska dyrt." } })).includes(
      "beloppet_namns_inte",
    ),
  );
});

test("en nollning utan skäl fastnar — noll är också en publicerad siffra", () => {
  const nollad = lofte({
    cost: { msek_low: 0, msek_base: 0, msek_high: 0, calculation: "Beloppet sätts till noll." },
  });
  assert.ok(kontroller(nollad).includes("nollan_utan_skal"));
});

test("en nollning som bär sitt skäl går fri, oavsett vilka ord den valt", () => {
  for (const skal of [
    "Löftet hålls av lagändringen, vars direkta kostnad är försumbar.",
    "Löftet är att tillsätta en utredning; utredningen prissätts, inte politiken den kan leda till.",
    "Att staten tar över en utgift kommunerna redan betalar är omfördelning, inte ny kostnad.",
    "Löftet räknar upp flera politikområden utan konkret åtagande.",
    "Reformen prissätts en gång på ett annat löfte och får inte dubbelräknas.",
    "Löftet anger varken en åtgärd eller en nivå.",
  ]) {
    assert.notEqual(nollskal(skal), null, `skälet borde kännas igen: ${skal}`);
  }
});

test("ett spann som inte rymmer basbeloppet fastnar", () => {
  assert.ok(
    kontroller(lofte({ cost: { msek_low: 2000, msek_base: 1000, msek_high: 3000 } })).includes(
      "spannet_omsluter_inte_basen",
    ),
  );
});

test("ett spann som är en punkt fastnar när beloppet är vår egen uppskattning", () => {
  assert.ok(
    kontroller(lofte({ cost: { msek_low: 1000, msek_high: 1000 } })).includes(
      "spannet_bar_ingen_osakerhet",
    ),
  );
});

test("partiets egen siffra ska gå att hitta i uträkningen", () => {
  const p = lofte({
    quote: "Vi genomför ett familjepaket värt 16 miljarder kronor.",
    cost: { msek_base: 4000, calculation: "Vi räknar med 4 000 miljoner kronor per år." },
  });
  assert.ok(kontroller(p).includes("partiets_siffra_forbigadd"));
});

test("ett värdeord får aldrig bli partiets egen nivå", () => {
  const p = lofte({
    quote: "Vi vill se en rejäl höjning av garantipensionen.",
    cost: { basis: "parti", msek_base: 5000 },
  });
  assert.ok(kontroller(p).includes("vardeord_som_niva"));
});

test("en angiven nivå är ingen värdeordsinvändning, även med ett värdeord i citatet", () => {
  const p = lofte({
    quote: "Vi vill se en rejäl höjning av garantipensionen med 1 000 kronor i månaden.",
    cost: { basis: "parti", msek_base: 5000 },
  });
  assert.ok(!kontroller(p).includes("vardeord_som_niva"));
});

/**
 * Regressionen som modulen finns för.
 *
 * 2026-08-07 påstods `p-2026-0428` ha fel kostnadstyp och dra rikssumman
 * 16 000 miljoner kronor fel. Uträkningen säger rakt ut att avgiftsdelen kostar
 * noll — pengarna går in i och ut ur pensionssystemet, utanför statsbudgeten —
 * och att beloppet gäller höjt bostadstillägg. Kontrollen ska tiga här.
 */
test("uträkningen som förklarar skillnaden flaggas inte — fyndet som inte höll", () => {
  const p = lofte({
    id: "p-2026-0428",
    quote: "Vi vill höja pensionsavgiften för att höja den allmänna pensionen.",
    parties: ["mp"],
    cost: {
      type: "utgift",
      msek_low: 2000,
      msek_base: 4000,
      msek_high: 8000,
      calculation:
        "Löftet har två delar. Den höjda pensionsavgiften kostar staten noll: pengarna går in i " +
        "och ut ur pensionssystemet, som ligger utanför statsbudgeten. Beloppet 4 000 miljoner " +
        "kronor per år gäller höjt bostadstillägg och garantipension, vilket är en utgift.",
    },
  });
  assert.ok(forklararSkillnaden(p.cost.calculation ?? ""));
  assert.ok(
    !kontroller(p).includes("typen_mot_citatet"),
    "kontrollen ska läsa uträkningen, inte citatet — det var felet",
  );
});

/**
 * Den andra halvan av samma lärdom: en avgift som medborgare betalar är ingen
 * statlig skatt. Tas den bort betalar staten mer, inte mindre.
 */
test("en avgift medborgaren betalar är ingen skatt — avgiftsfrihet är en utgift", () => {
  const p = lofte({
    quote: "Miljöpartiet vill utöka avgiftsfri fritids och förskola för barn vars föräldrar inte arbetar.",
    parties: ["mp"],
    cost: { calculation: "Avgiftsbortfallet per barn är omkring 3 000 kronor per år, totalt 400 miljoner kronor." },
  });
  assert.ok(!kontroller(p).includes("typen_mot_citatet"));
});

test("en skatt som är brottets föremål är ingen skatteåtgärd", () => {
  const p = lofte({
    quote: "Arbetslivskriminaliteten ska bekämpas och fiffel med skatter måste stoppas.",
    cost: { calculation: "Fyra myndigheter får 100 miljoner kronor var för utökad tillsyn, 400 miljoner kronor." },
  });
  assert.ok(!kontroller(p).includes("typen_mot_citatet"));
});

test("ett skatteinstrument i citatet mot en utgiftstyp fastnar", () => {
  const p = lofte({
    quote: "Den som utbildar sig bör få rätt att göra skatteavdrag för sina utbildningskostnader.",
    cost: {
      calculation: "500 000 personer × 10 000 kronor avdrag × 30 procent marginalskatt = 1 500 miljoner kronor.",
      msek_base: 1500,
      msek_high: 4500,
    },
  });
  assert.ok(kontroller(p).includes("typen_mot_citatet"));
});

test("en återskapad uträkning är en anmärkning, inte en invändning", () => {
  const p = lofte({
    cost: {
      calculation:
        "Uträkningen är rekonstruerad i efterhand; det ursprungliga resonemanget sparades inte. " +
        "1 miljon barn × 1 000 kronor = 1 000 miljoner kronor per år.",
    },
  });
  assert.deepEqual(kontroller(p), []);
  assert.deepEqual(
    anmarkningar(p).map((a) => a.kontroll),
    ["rekonstruerad_utrakning"],
  );
});
