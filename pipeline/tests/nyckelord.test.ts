import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dokumentfrekvenser,
  inverteraIndex,
  ordvikt,
  raknaTermer,
  skarvaFor,
  slaIhopSkarvor,
  taOrd,
  termPoang,
  namnOrd,
  utvinnTermer,
  visningsForm,
  sokStammar,
  type DokumentTermer,
  type Skarva,
} from "../src/nyckelord.ts";
import { stamma } from "../src/stam.ts";

test("taOrd: gemener, korta ord bort, svenska tecken behålls", () => {
  const ord = taOrd("Höjt TAK i a-kassan, år 2026!");
  assert.ok(ord.includes("höjt"));
  assert.ok(ord.includes("a-kassan"));
  assert.ok(!ord.includes("i")); // för kort
  assert.ok(ord.includes("2026"));
});

test("raknaTermer: riksdagens formelspråk rensas bort", () => {
  const formel =
    "Riksdagen ställer sig bakom det som anförs i motionen och tillkännager detta för regeringen.";
  assert.equal(raknaTermer(formel).size, 0, "en ren formelmening ska inte ge några termer");

  // Termerna lagras som stammar.
  const sak = raknaTermer(formel + " Taket i arbetslöshetsförsäkringen bör höjas.");
  assert.ok(sak.has("arbetslöshetsförsäkring"));
  assert.ok(sak.has("tak"));
  assert.ok(sak.has("höj"), "höjas ska ge samma stam som höja");
  assert.ok(!sak.has("riksdagen"), "formelord ska inte överleva rensningen");
});

test("raknaTermer: rena tal räknas inte som termer", () => {
  assert.ok(!raknaTermer("1234 5678").has("1234"));
});

test("utvinnTermer: frekvens styr, sorteringen är deterministisk", () => {
  const text = "vårdplatser vårdplatser vårdplatser köerna köerna sjukhus";
  const { t, n } = utvinnTermer(text, 2);
  assert.deepEqual(t, ["vårdplats", "köern"]); // stammar

  assert.equal(n, 6);
  // Samma text ska ge exakt samma lista, varje gång.
  assert.deepEqual(utvinnTermer(text, 2).t, t);
});

test("utvinnTermer: lika frekvens bryts i bokstavsordning", () => {
  const { t } = utvinnTermer("bravo alfa", 2);
  assert.deepEqual(t, ["alf", "bravo"]); // stammar, i bokstavsordning
});

test("skarvaFor: tusental ger stabila skärvnamn", () => {
  assert.equal(skarvaFor("h-2026-0001"), "00");
  assert.equal(skarvaFor("h-2026-12469"), "12");
  assert.equal(skarvaFor("something-else"), "ovrigt");
});

test("ordvikt: vanlig term väger lätt, ovanlig tungt", () => {
  const vanlig = ordvikt(1000, 1000);
  const ovanlig = ordvikt(2, 1000);
  assert.equal(vanlig, 0, "term i varje dokument skiljer ingenting");
  assert.ok(ovanlig > vanlig);
});

test("termPoang: ovanliga gemensamma ord väger tyngre än vanliga", () => {
  const index = new Map<string, DokumentTermer>([
    ["h-1", { t: ["krigssjukvård", "försvar"], n: 100 }],
    ["h-2", { t: ["försvar"], n: 100 }],
    ["h-3", { t: ["försvar"], n: 100 }],
  ]);
  const df = dokumentfrekvenser(index);
  assert.equal(df.get("försvar"), 3);
  assert.equal(df.get("krigssjukvård"), 1);

  const mal = new Set(["krigssjukvård", "försvar"]);
  const bada = termPoang(mal, index.get("h-1")!, df, index.size);
  const baraVanlig = termPoang(mal, index.get("h-2")!, df, index.size);
  assert.ok(bada > baraVanlig, "dokumentet med det ovanliga ordet ska väga tyngre");
});

test("termPoang: termer utanför målet ger inget utslag", () => {
  const index = new Map<string, DokumentTermer>([["h-1", { t: ["kultur"], n: 10 }]]);
  const df = dokumentfrekvenser(index);
  assert.equal(termPoang(new Set(["försvar"]), index.get("h-1")!, df, 1), 0);
});

test("slaIhopSkarvor: skärvor blir ett uppslagsverk", () => {
  const a: Skarva = { version: 1, handlingar: { "h-1": { t: ["x"], n: 1 } } };
  const b: Skarva = { version: 1, handlingar: { "h-2": { t: ["y"], n: 2 } } };
  const index = slaIhopSkarvor([a, b]);
  assert.equal(index.size, 2);
  assert.deepEqual(index.get("h-2"), { t: ["y"], n: 2 });
});

test("inverteraIndex: term → handlingar, sorterat", () => {
  const index = new Map<string, DokumentTermer>([
    ["h-2", { t: ["försvar"], n: 1 }],
    ["h-1", { t: ["försvar", "kultur"], n: 1 }],
  ]);
  const inv = inverteraIndex(index);
  assert.deepEqual(inv.get("försvar"), ["h-1", "h-2"]);
  assert.deepEqual(inv.get("kultur"), ["h-1"]);
});

test("utvinnTermer: bär en läsbar visningsform per stam", () => {
  // Stammen matchar, visningsformen läses: sajten ska visa "vårdplatser",
  // inte stammen "vårdplats".
  const { t, y } = utvinnTermer("vårdplatser vårdplatser sjukhus", 5);
  const i = t.indexOf(stamma("vårdplatser"));
  assert.ok(i >= 0, "stammen skulle finnas");
  assert.equal(y?.[i], "vårdplatser", "vanligaste formen visas");
  assert.notEqual(y?.[i], t[i], "visningsformen skiljer sig från stammen");
});

test("visningsForm: vanligast vinner, annars kortast", () => {
  assert.equal(visningsForm(new Map([["skolor", 3], ["skolorna", 9]])), "skolorna");
  assert.equal(visningsForm(new Map([["skolor", 2], ["skolorna", 2]])), "skolor");
});

test("sokStammar: bestämd form av a-ord hittar grundformens stam", () => {
  // Snowball lämnar "skolan" orört men ger "skol" för "skola"/"skolor".
  // Läsaren ska hitta samma sak oavsett vilken form hen skriver.
  assert.ok(sokStammar("skolan").includes(stamma("skola")), "skolan → skol");
  assert.ok(sokStammar("skola").includes(stamma("skola")));
  // Och det som indexerats från "skolan" ska nås när man skriver "skola".
  assert.ok(sokStammar("skola").includes(stamma("skolan")), "skola → skolan");
});

test("sokStammar: övertolkad grundform möter sin bestämda form", () => {
  // "försvar" ger "försv" men "försvaret" ger "försvar" — båda ska nås.
  const fran = sokStammar("försvar");
  assert.ok(fran.includes(stamma("försvar")), "egen stam med");
  assert.ok(fran.includes(stamma("försvaret")), "även den bestämda formens stam");
  assert.ok(sokStammar("försvaret").includes(stamma("försvar")));
});

test("sokStammar: vanliga ord får med sin egen stam", () => {
  for (const ord of ["kärnkraft", "vårdplatser", "tandvård", "klimat"]) {
    assert.ok(sokStammar(ord).includes(stamma(ord)), `${ord} saknar sin egen stam`);
  }
});

test("sokStammar: är deterministisk och utan dubbletter", () => {
  const a = sokStammar("skolan");
  assert.deepEqual(a, sokStammar("skolan"));
  assert.equal(new Set(a).size, a.length);
});

test("sokStammar: bestämd och obestämd form ger samma stammar", () => {
  // Kärnegenskapen: den form läsaren råkar skriva får inte avgöra träffen.
  const par: [string, string][] = [
    ["skola", "skolan"],
    ["försvar", "försvaret"],
    ["vård", "vården"],
    ["kommun", "kommunen"],
    ["bil", "bilen"],
    ["stöd", "stödet"],
    ["region", "regionen"],
  ];
  for (const [grund, bestamd] of par) {
    assert.deepEqual(
      sokStammar(grund),
      sokStammar(bestamd),
      `${grund} och ${bestamd} ska ge samma stammar`,
    );
  }
});

test("sokStammar: staplar aldrig bestämda ändelser", () => {
  // "kommunen" + "et" blir "kommunenet", vars stam är "kommunen" — en
  // påhittad stam som krockade med indexet och gjorde sökningen osymmetrisk.
  for (const ord of ["kommunen", "skolan", "försvaret", "vården"]) {
    for (const stam of sokStammar(ord)) {
      assert.ok(
        !/(?:anen|enen|enet|etet|anet)/u.test(stam),
        `${ord} gav den staplade stammen ${stam}`,
      );
    }
  }
});

test("namnOrd: plockar ut namndelarna, gemena och ≥ 4 tecken", () => {
  const ord = namnOrd([{ name: "Magnus Jacobsson" }, { name: "Kjell-Arne Ottosson" }]);
  assert.ok(ord.has("magnus"));
  assert.ok(ord.has("jacobsson"));
  assert.ok(ord.has("ottosson"));
  // "Kjell-Arne" delas på bindestreck av ordindelningen; korta delar faller
  // på längdregeln som alla andra ord.
  assert.ok(!ord.has("Magnus"), "namnorden ska vara gemena");
});

test("utvinnTermer: dokumentets undertecknare blir inte termer", () => {
  // Undertecknarlistan står i varje dokument ledamoten skrivit under och i
  // nästan inga andra — utan filtret blir efternamnet partiets mest
  // utmärkande "ämnesord".
  const text = `
    Riksdagen bör besluta om fler vårdplatser i den nära vården.
    Vårdplatser behövs i hela landet. Vårdplatser räddar liv.
    Magnus Jacobsson (KD) Kjell-Arne Ottosson (KD)
  `;
  const utan = utvinnTermer(text, 10);
  assert.ok(utan.t.includes(stamma("vårdplatser")));
  assert.ok(utan.t.includes(stamma("jacobsson")), "utan filter slinker namnet in");

  const med = utvinnTermer(text, 10, namnOrd([
    { name: "Magnus Jacobsson" },
    { name: "Kjell-Arne Ottosson" },
  ]));
  assert.ok(med.t.includes(stamma("vårdplatser")), "sakordet ska finnas kvar");
  for (const namn of ["magnus", "jacobsson", "ottosson"]) {
    assert.ok(!med.t.includes(stamma(namn)), `${namn} skulle filtrerats bort`);
  }
});

test("utvinnTermer: namnfiltret tar ordet, inte ordfamiljen", () => {
  // Namn som också är sakord ("Strand", "Berg") får inte tysta sakinnehållet.
  // Filtret matchar den exakta ordformen, så undertecknarradens "Strand"
  // faller medan "stranden" och "strandskyddet" står kvar — och bara i det
  // dokument där personen skrivit under, aldrig globalt.
  const text =
    "Strandskyddet vid stranden och berget måste värnas i hela strandzonen. Anna Strand";
  const utan = utvinnTermer(text, 10);
  assert.ok(utan.t.includes(stamma("anna")), "utan filter slinker förnamnet in");

  const med = utvinnTermer(text, 10, namnOrd([{ name: "Anna Strand" }]));
  assert.ok(!med.t.includes(stamma("anna")), "namnordet skulle filtrerats");
  assert.ok(med.t.includes(stamma("stranden")), "böjt sakord står kvar");
  assert.ok(med.t.includes(stamma("strandzonen")), "sammansatt sakord står kvar");
  assert.ok(med.t.includes(stamma("berget")), "andra sakord är orörda");
});
