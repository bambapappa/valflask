import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseAmountsMsek,
  statedBaseMsek,
  findAmountMismatches,
  findZeroWithCalculatedSum,
  findUngroupedTwins,
  looksLikeCompletedPolicy,
  findCompletedPolicyQuotes,
  contentWords,
  type ScanPromise,
} from "../src/quality-scan.ts";

function p(over: Partial<ScanPromise> & { id: string }): ScanPromise {
  return {
    title: "Ett löfte",
    quote: "Vi vill göra något",
    parties: ["s"],
    category: "välfärd",
    status: "aktiv",
    group_id: null,
    cost: { msek_base: 1000, period: "per_ar", basis: "llm_estimat" },
    ...over,
  };
}

describe("parseAmountsMsek — kräver penningenhet", () => {
  it("läser miljoner och miljarder till samma enhet", () => {
    assert.deepEqual(parseAmountsMsek("ger 1 620 miljoner kronor"), [1620]);
    assert.deepEqual(parseAmountsMsek("bas 1,5 miljarder kronor"), [1500]);
    assert.deepEqual(parseAmountsMsek("omkring 2,65 miljarder kronor"), [2650]);
  });

  /**
   * Förkortningarna datat faktiskt använder. Saknades de i enhetslistan lästes
   * en riktig uträkning som att den inte namngav något belopp, och svepet
   * 2026-08-08 gav tre falsklarm av just det skälet.
   */
  it("läser förkortningarna uträkningarna skriver: mnkr, mn kr, msek, mkr, mdkr", () => {
    // Bara talet som bär enheten räknas: i "16 - 8 = 8 mnkr" är det svaret.
    assert.deepEqual(parseAmountsMsek("Ökning = 16 - 8 = 8 mnkr/år"), [8]);
    assert.deepEqual(
      parseAmountsMsek("Nuvarande anslag: 8 mnkr/år, föreslagen nivå: 16 mnkr/år."),
      [8, 16],
    );
    assert.deepEqual(parseAmountsMsek("≈ 1 375 mn kr/år"), [1375]);
    assert.deepEqual(parseAmountsMsek("anger 13 000 msek/år"), [13000]);
    assert.deepEqual(parseAmountsMsek("grovt 0–5 mkr"), [5]);
    assert.deepEqual(parseAmountsMsek("2,5 mdkr"), [2500]);
  });

  it("tar INTE tal utan penningenhet — det var den gamla sökningens fel", () => {
    // "Bas 2 500 kr per förlossning" lästes förut som basbeloppet 2 500.
    assert.deepEqual(parseAmountsMsek("Bas 2 500 kr per förlossning"), []);
    // "1,9 miljoner barn" är ett antal, inte pengar.
    assert.deepEqual(parseAmountsMsek("omkring 1,9 miljoner barn"), []);
    assert.deepEqual(parseAmountsMsek("50 000 kronor per bil"), []);
  });

  it("'miljarder' utan 'kronor' räknas inte som pengar", () => {
    assert.deepEqual(parseAmountsMsek("2 miljarder passagerare"), []);
  });
});

describe("statedBaseMsek — vad uträkningen själv landar på", () => {
  it("läser naket basbelopp och ärver meningens enhet", () => {
    // Miljöpartiets ungdomshem: uträkningen räknade fram ~500, fältet stod på 1 500.
    assert.equal(
      statedBaseMsek("Bas: ~700 platser * 2000 kr/dygn ökning * 365 dagar ≈ 511 miljoner kronor."),
      511,
    );
    assert.equal(
      statedBaseMsek("Sammantaget 2 000–12 000 miljoner kronor per år med 5 000 som basbelopp."),
      5000,
    );
    assert.equal(
      statedBaseMsek("Avrundat till 300–1 000 miljoner kronor per år, med 650 som basbelopp."),
      650,
    );
  });

  it("skalar naket tal i en miljardmening", () => {
    assert.equal(statedBaseMsek("Summan blir 1–10 miljarder kronor, med bas 3."), 3000);
  });

  it("tar sista slutsatsen när flera finns", () => {
    const calc =
      "Delarna ger 220–1 100 miljoner kronor. Sjuksköterskor ger 300–1 200 miljoner kronor. " +
      "Sammantaget 1 020–4 800 miljoner kronor per år, med 2 300 som basbelopp.";
    assert.equal(statedBaseMsek(calc), 2300);
  });

  it("läser fyrsiffriga tal helt — '1000' är inte 100", () => {
    // Tusentalsmönstret var girigt och läste bara de tre första siffrorna.
    assert.equal(
      statedBaseMsek("Här antas 500–2 000 miljoner kronor per år, med basfall 1000 miljoner kronor."),
      1000,
    );
    assert.deepEqual(parseAmountsMsek("3000 miljoner kronor"), [3000]);
  });

  it("ett spann skrivet '5–10 miljarder kronor' är inte ett entydigt basbelopp", () => {
    // Bara det andra talet bär enheten, så spannet såg ut som ett enda belopp.
    assert.equal(
      statedBaseMsek("Bidragen kostar sammanlagt 5–10 miljarder kronor per år."),
      null,
    );
  });

  it("smalt hårt mellanslag (U+202F) är tusentalsavskiljare i datat", () => {
    // Datat använder U+202F, inte vanligt mellanslag. Utan det i teckenklassen
    // lästes "bas 1 000 miljoner kronor" som talet 1.
    assert.equal(
      statedBaseMsek("6) Samlat intervall: 500–2 000 miljoner kronor per år, bas 1 000 miljoner kronor."),
      1000,
    );
  });

  it("styckpris är inget basbelopp", () => {
    assert.equal(
      statedBaseMsek("~100 000 förlossningar per år ger 100–500 miljoner kronor. Bas 2 500 kr/förlossning."),
      null,
    );
  });

  it("ett förkastat belopp läses inte som basbelopp", () => {
    const calc =
      "4 500 × 0,7 miljoner kronor ≈ 3 150 miljoner kronor per år. " +
      "En efterhandsberäkning på 1 125 miljoner kronor avvisades — summan räcker inte till lönen.";
    assert.notEqual(statedBaseMsek(calc), 1125);
  });

  it("returnerar null när uträkningen inte drar någon slutsats", () => {
    assert.equal(statedBaseMsek("Löftet är svårt att prissätta."), null);
    assert.equal(statedBaseMsek("Baseras på jämförbara statliga skolsatsningar."), null);
  });
});

describe("findAmountMismatches — åt båda hållen", () => {
  it("hittar belopp som är för HÖGT mot sin egen uträkning", () => {
    const found = findAmountMismatches([
      p({
        id: "p-1",
        cost: {
          msek_base: 1500,
          period: "per_ar",
          basis: "llm_estimat",
          calculation: "Bas: ~700 platser ≈ 511 miljoner kronor per år.",
        },
      }),
    ]);
    assert.equal(found.length, 1);
    const f = found[0];
    assert.ok(f);
    assert.equal(f.direction, "för högt");
    assert.equal(f.stated, 511);
  });

  it("hittar belopp som är för LÅGT — hälften av felen i omräkningen", () => {
    const found = findAmountMismatches([
      p({
        id: "p-2",
        cost: {
          msek_base: 1200,
          period: "per_ar",
          basis: "llm_estimat",
          calculation: "Sammantaget 1 020–4 800 miljoner kronor per år, med 2 300 som basbelopp.",
        },
      }),
    ]);
    assert.equal(found.length, 1);
    const f = found[0];
    assert.ok(f);
    assert.equal(f.direction, "för lågt");
  });

  it("flaggar inte när beloppet stämmer", () => {
    const found = findAmountMismatches([
      p({
        id: "p-3",
        cost: {
          msek_base: 650,
          period: "per_ar",
          basis: "llm_estimat",
          calculation: "Avrundat till 300–1 000 miljoner kronor per år, med 650 som basbelopp.",
        },
      }),
    ]);
    assert.deepEqual(found, []);
  });

  it("nollade löften är beslut, inte räknefel", () => {
    const found = findAmountMismatches([
      p({
        id: "p-4",
        cost: {
          msek_base: 0,
          period: "per_ar",
          basis: "llm_estimat",
          calculation: "Ett brett löfte prissätts inte. Sammantaget 0 miljoner kronor.",
        },
      }),
    ]);
    assert.deepEqual(found, []);
  });

  it("tillbakadragna löften skannas inte", () => {
    const found = findAmountMismatches([
      p({
        id: "p-5",
        status: "tillbakadragen",
        cost: {
          msek_base: 9000,
          period: "per_ar",
          basis: "llm_estimat",
          calculation: "Bas 100 miljoner kronor.",
        },
      }),
    ]);
    assert.deepEqual(found, []);
  });
});

describe("findZeroWithCalculatedSum — nollan stämmer, men inte texten bredvid", () => {
  // Den verkliga texten från p-2026-0062. Beloppet nollades 2026-07-28 eftersom
  // betygsreformen redan var beslutad, men uträkningen skrevs aldrig om och
  // räknade vidare fram 285–950 miljoner kronor — publikt, under en nolla.
  const GAMLA_TEXTEN =
    "Ungefär 150 000 lärare berörs. Statsbidrag till skolhuvudmännen för fortbildning av " +
    "80 000–120 000 lärare à 3 000–7 000 kronor ger 240–840 miljoner kronor. Skolverkets " +
    "arbete med att ta fram systemet läggs till med 30–80 miljoner och material och it-stöd " +
    "med 15–30 miljoner. Summan blir 285–950 miljoner kronor som en engångskostnad vid " +
    "införandet.";

  it("fångar en nolla vars uträkning räknar fram en summa", () => {
    const found = findZeroWithCalculatedSum([
      p({
        id: "p-1",
        cost: { msek_base: 0, period: "engang", basis: "llm_estimat", calculation: GAMLA_TEXTEN },
      }),
    ]);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.equal(found[0]!.id, "p-1");
    assert.ok(found[0]!.stated > 0);
  });

  it("tiger när uträkningen förklarar nollan", () => {
    // Den omskrivna texten på samma löfte. Beloppet är fortfarande noll och
    // texten nämner fortfarande kostnader — men den säger varför nollan står där.
    const nya =
      "Beloppet är noll, för reformen är redan beslutad. Införandet kostar förstås pengar — " +
      "fortbildning av lärare och material — men den kostnaden är inte ny.";
    assert.deepEqual(
      findZeroWithCalculatedSum([
        p({ id: "p-1", cost: { msek_base: 0, period: "engang", basis: "llm_estimat", calculation: nya } }),
      ]),
      [],
    );
  });

  it("tiger när texten själv namnger basbeloppet som noll", () => {
    // Verklig text från p-2026-0354. Uträkningen räknar upp delar på vägen,
    // men landar uttryckligen på noll — nollan ÄR förklarad.
    const calc =
      "Tillsyn: 1–3 extra tjänster à ~0,8–1,2 miljoner kronor per år ≈ 1–4 miljoner kronor per år. " +
      "Totalt 2–5 miljoner kronor per år om nya medel tillförs; basfall 0 miljoner kronor " +
      "(inryms i befintlig verksamhet).";
    assert.deepEqual(
      findZeroWithCalculatedSum([
        p({ id: "p-1", cost: { msek_base: 0, period: "per_ar", basis: "llm_estimat", calculation: calc } }),
      ]),
      [],
    );
  });

  it("rör inte löften som faktiskt bär ett belopp", () => {
    assert.deepEqual(
      findZeroWithCalculatedSum([
        p({
          id: "p-1",
          cost: { msek_base: 500, period: "per_ar", basis: "llm_estimat", calculation: "Summan blir 500 miljoner kronor." },
        }),
      ]),
      [],
    );
  });

  it("tiger när uträkningen inte når någon summa", () => {
    assert.deepEqual(
      findZeroWithCalculatedSum([
        p({
          id: "p-1",
          cost: { msek_base: 0, period: "per_ar", basis: "llm_estimat", calculation: "Löftet anger ingen nivå." },
        }),
      ]),
      [],
    );
  });
});

describe("findUngroupedTwins — löftet hör hemma i en grupp men ligger utanför", () => {
  it("hittar polisfallet: samma åtgärd, utanför gruppen", () => {
    const promises = [
      p({
        id: "p-m",
        group_id: "g-fler-poliser",
        parties: ["m"],
        title: "Förstärka polisens resurser och öka polistillväxten",
        quote: "Förstärka polisens resurser och öka polistillväxten.",
      }),
      p({
        id: "p-sd",
        group_id: "g-fler-poliser",
        parties: ["sd"],
        title: "Öka antalet poliser genom ökade resurser",
        quote: "Vi fortsätter att öka antalet poliser genom ökade resurser och polisutbildning.",
      }),
      p({
        id: "p-l",
        group_id: null,
        parties: ["l"],
        title: "Statlig storsatsning på synliga poliser",
        quote: "Vi vill se en statlig storsatsning på synliga poliser med ökade resurser i hela Sverige.",
      }),
    ];
    const found = findUngroupedTwins(promises, 2);
    assert.ok(
      found.some((f) => f.id === "p-l" && f.groupId === "g-fler-poliser"),
      "Liberalernas polislöfte ska föreslås till polisgruppen",
    );
  });

  it("föreslår inte ett löfte till gruppen det redan ligger i", () => {
    const promises = [
      p({ id: "a", group_id: "g", title: "mindre klasser i grundskolan", quote: "mindre klasser i grundskolan" }),
      p({ id: "b", group_id: "g", title: "mindre klasser i grundskolan", quote: "mindre klasser i grundskolan" }),
    ];
    const found = findUngroupedTwins(promises, 2);
    assert.deepEqual(found.filter((f) => f.groupId === "g" && (f.id === "a" || f.id === "b")), []);
  });

  it("grupper med en enda medlem ger ingen signatur", () => {
    const promises = [
      p({ id: "a", group_id: "g", title: "kärnkraft och reaktorer", quote: "kärnkraft och reaktorer byggs" }),
      p({ id: "b", group_id: null, title: "kärnkraft och reaktorer", quote: "kärnkraft och reaktorer byggs" }),
    ];
    assert.deepEqual(findUngroupedTwins(promises, 2), []);
  });
});

describe("contentWords", () => {
  it("plockar bort stoppord och korta ord, och behåller ordet bakom stammen", () => {
    const w = contentWords("Vi vill att alla ska få en fast läkarkontakt i hela landet");
    assert.equal(w.get("läkar"), "läkarkontakt");
    assert.ok(!w.has("vill"));
    assert.ok(!w.has("alla"));
    assert.ok(!w.has("lande"));
  });

  it("stammen möter böjningar — annars missas hela poängen", () => {
    const a = contentWords("polisens resurser");
    const b = contentWords("fler poliser och polisutbildning");
    assert.ok([...a.keys()].some((s) => b.has(s)), "polisens och poliser ska mötas");
  });
});

describe("looksLikeCompletedPolicy — löfte eller skryt", () => {
  it("känner igen de citat som faktiskt drogs tillbaka", () => {
    // Alla sex är riktiga citat som drogs tillbaka manuellt under omräkningen.
    assert.ok(looksLikeCompletedPolicy("När matmomsen halverades fick barnfamiljerna mer kvar i plånboken."));
    assert.ok(looksLikeCompletedPolicy("Vi har sänkt skatten på arbete och pension."));
    assert.ok(looksLikeCompletedPolicy("Pensionsspararna har mer pengar på kontot än någonsin."));
    assert.ok(looksLikeCompletedPolicy("Med oss har polisen fått nya verktyg."));
    assert.ok(looksLikeCompletedPolicy("Sedan vi tillträdde har en jobbpremie införts."));
    assert.ok(
      looksLikeCompletedPolicy(
        "Den moderatledda regeringen avsätter medel i vårbudgeten 2026 för en dubblering av antalet subventionerade försök.",
      ),
    );
  });

  it("flaggar INTE ett äkta löfte om framtiden", () => {
    assert.equal(looksLikeCompletedPolicy("Vi vill höja barnbidraget rejält."), false);
    assert.equal(looksLikeCompletedPolicy("Barnbidraget ska höjas till 2 000 kronor i månaden."), false);
    assert.equal(
      looksLikeCompletedPolicy("Vi kommer att bygga ny kärnkraft under nästa mandatperiod."),
      false,
    );
  });

  it("«återinföra» räddar ett citat med supinum — mönstret var dött före 2026-08-18", () => {
    // `\b` biter inte före å/ä/ö i JavaScript, så `\båterinföra\b` matchade
    // aldrig « återinföra» men däremot «Xåterinföra». Mönstret var alltså
    // levande åt precis fel håll. Tre riktiga köposter föll på det.
    assert.equal(
      looksLikeCompletedPolicy(
        "Samtidigt behöver Sverige återinföra registrering för den som har vistats i landet längre än tre månader.",
      ),
      false,
    );
    assert.equal(looksLikeCompletedPolicy("Vi har avskaffat den, och vill återinföra den."), false);
    assert.equal(looksLikeCompletedPolicy("Anslaget som togs bort ska återställas."), false);
    // Och det får inte fastna inuti ett annat ord: «Xåterinföra» är inget ord.
    assert.ok(looksLikeCompletedPolicy("Vi har sänkt skatten och kallar det Xåterinföra."));
  });

  it("dåtid PLUS åtagande om framtiden är ett löfte, inte skryt", () => {
    assert.equal(
      looksLikeCompletedPolicy("Vi har sänkt skatten, och vi vill fortsätta sänka den nästa mandatperiod."),
      false,
    );
  });

  it("hoppar över redan tillbakadragna löften", () => {
    const found = findCompletedPolicyQuotes([
      p({ id: "x", status: "tillbakadragen", quote: "Vi har sänkt skatten på arbete." }),
    ]);
    assert.deepEqual(found, []);
  });
});

describe("statedBaseMsek — regressioner från första skarpa körningen", () => {
  it("basbeloppets EGEN enhet gäller, inte sista beloppet i meningen", () => {
    // "låg 500, bas 1 500, hög 5 000" lästes som att basbeloppet vore 5 000,
    // så sökningen larmade på ett löfte som var rätt räknat.
    assert.equal(
      statedBaseMsek(
        "Ökning: låg 500 miljoner kronor (något fler), bas 1 500 miljoner kronor (fördubbling), hög 5 000 miljoner kronor (tredubbling).",
      ),
      1500,
    );
  });

  it("ett spann med ord mellan talen är fortfarande ett spann", () => {
    assert.equal(statedBaseMsek("Totalkostnad 0–ca 5 miljoner kronor."), null);
  });
});

describe("statedBaseMsek — summering utan ordet kronor", () => {
  it("läser 'sammanlagt 8 miljoner per år' som slutsatsen", () => {
    const calc =
      "Samordning kostar omkring 4 miljoner kronor per år, utvärdering 3 miljoner " +
      "och resor 1 miljon — sammanlagt 8 miljoner per år.";
    assert.equal(statedBaseMsek(calc), 8);
  });
});

describe("statedBaseMsek — bestämd form och blandade enheter", () => {
  it("'Basbeloppet är 150 miljoner kronor' läses, inte bara 'bas 150'", () => {
    // Meningen innehåller både miljoner och miljarder; enheten intill
    // basbeloppet gäller, inte den som råkar stå sist.
    assert.equal(
      statedBaseMsek(
        "Basbeloppet är 150 miljoner kronor per år, vilket motsvarar ett tioårigt program på sammanlagt 1,5 miljarder.",
      ),
      150,
    );
  });
});

describe("statedBaseMsek — talet efter 'Bas:' kan vara en operand", () => {
  it("'Bas: 1 000 studenter à 50 000 kronor = 50 miljoner' ger 50, inte 1 000", () => {
    assert.equal(
      statedBaseMsek("Bas: 1 000 studenter à 50 000 kronor = 50 miljoner kronor per år."),
      50,
    );
  });

  it("'Bas: 10 000 * 10 000 = 100 miljoner kronor' ger 100", () => {
    assert.equal(statedBaseMsek("Bas: 10 000 * 10 000 = 100 miljoner kronor."), 100);
  });
});

describe("statedBaseMsek — operandkollen gäller vid träffen", () => {
  it("samma tal tidigare i meningen gör inte basbeloppet till en operand", () => {
    // "(3 000–11 000) à 550 000 kronor → 1 500–6 000 miljoner, bas 3 000":
    // talet 3 000 står tidigare som operand, men basbeloppet är ändå 3 000.
    assert.equal(
      statedBaseMsek(
        "Antag 3–11 % fler anställda (3 000–11 000) à ~550 000 kronor per år → ~1 500–6 000 miljoner kronor per år, bas 3 000.",
      ),
      3000,
    );
  });
});
