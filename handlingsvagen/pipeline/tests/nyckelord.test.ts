import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dokumentfrekvenser,
  inverteraIndex,
  ordvikt,
  raknaTermer,
  betankandeNyckel,
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

test("taOrd: förkortningar i versaler kommer med, gemena småord gör det inte", () => {
  const ord = taOrd("Elever med NPF och insatser enligt LSS. Ersättning från CSN.");
  for (const f of ["npf", "lss", "csn"]) {
    assert.ok(ord.includes(f), `${f} ska indexeras`);
  }
  // Samma bokstavslängd, men gemena — de ska fortfarande falla på
  // längdregeln. (Längre stoppord som "från" släpps igenom här och rensas
  // först av stopporden i `raknaTermerMedFormer` — annan grind, annat steg.)
  assert.ok(!ord.includes("och"), "gemena småord passerar inte");
  assert.ok(!ord.includes("med"));
});

test("taOrd: bara ord skrivna helt i versaler räknas som förkortning", () => {
  assert.ok(!taOrd("Han bor i en by").includes("bor"));
  assert.ok(!taOrd("Npf är vanligt").includes("npf"), "inledande versal räcker inte");
  assert.ok(taOrd("NPF är vanligt").includes("npf"));
});

test("taOrd: partikoder hålls utanför även i versaler", () => {
  // Ett parti är nästan ensamt om att skriva ut sin egen kod, så koden blir
  // partiets mest "utmärkande ord" — vilket bara säger vem som skrivit
  // dokumentet. Samma skäl som partinamnen rensas av.
  const ord = taOrd("Motion av SD och KD om MP:s politik gällande NPF");
  for (const kod of ["sd", "kd", "mp"]) {
    assert.ok(!ord.includes(kod), `${kod} är ett filter, inte ett sökord`);
  }
  assert.ok(ord.includes("npf"), "riktiga förkortningar påverkas inte");
});

test("taOrd: versala småord ur rubriker slinker inte igenom", () => {
  const ord = taOrd("UR DEBATTEN OM VÅRD OCH SÅ VIDARE");
  for (const w of ["ur", "om", "och", "så"]) {
    assert.ok(!ord.includes(w), `${w} är inget ämnesord`);
  }
  assert.ok(ord.includes("debatten"));
  assert.ok(ord.includes("vård"));
});

test("taOrd: bindestreck i kanten skalas av så EU- möter EU", () => {
  const ord = taOrd("EU- och utrikespolitiken samt EU:s budget");
  assert.equal(ord.filter((w) => w === "eu").length, 2);
});

test("taOrd: rena tal räknas inte som förkortning", () => {
  const ord = taOrd("Under 20 år, se avsnitt 4.2");
  assert.ok(!ord.includes("20"));
  assert.ok(!ord.includes("4"));
});

test("stamma lämnar förkortningar orörda", () => {
  // Vore stammaren aktiv på så korta ord skulle den kunna stympa dem —
  // "LSS" till "ls" — och då vore de omöjliga att söka fram ändå.
  for (const f of ["npf", "lss", "sfi", "csn", "bnp", "vab", "hvb", "lvu", "ivo", "eu"]) {
    assert.equal(stamma(f), f, `${f} ska överleva stamningen`);
  }
});

test("sokStammar når förkortningar från två tecken", () => {
  assert.ok(sokStammar("eu").includes("eu"));
  assert.ok(sokStammar("npf").includes("npf"));
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

test("utvinnTermer: ord utan sakinnehåll blir inte termer", () => {
  // Fulltexterna gjorde alla partier lika: de vanligaste termerna i hela
  // materialet var "anledning", "avser", "viktig", "använda". Ett
  // ämnesregister ska svara på vad partierna sagt om skolan — inte visa
  // att alla tycker att saker är viktiga.
  const text = `
    Med anledning av att det är viktigt att använda dagens möjligheter
    avser vi att bidra. Sammantaget avstyrker utskottet förslaget.
    Skolan och tandvården behöver fler platser.
  `;
  const { t } = utvinnTermer(text, 20);
  for (const tom of ["anledning", "viktigt", "använda", "avser", "sammantaget", "avstyrker"]) {
    assert.ok(!t.includes(stamma(tom)), `${tom} skulle rensats`);
  }
  assert.ok(t.includes(stamma("skolan")), "sakordet skolan ska finnas kvar");
  assert.ok(t.includes(stamma("tandvården")), "sakordet tandvården ska finnas kvar");
});

test("utvinnTermer: substantivet vikt överlever adjektivet viktig", () => {
  // Stammen är gemensam, så filtret måste sålla på ordformen. Annars tystas
  // ett sakord för att ett omdömesord råkar dela stam med det.
  const { t } = utvinnTermer("Vikten av tandvård är viktig. Vikten mäts i kilo.", 20);
  assert.ok(t.includes(stamma("vikten")), "substantivet vikt ska finnas kvar");
});

test("utvinnTermer: partinamn blir inte söktermer", () => {
  // Ett parti nämner sig självt i sina egna dokument och nästan ingen annan
  // gör det, så namnet blev partiets mest "utmärkande ord". Att söka fram
  // ett visst partis handlingar är ett filter på parti, inte ett sökord.
  const text = "Vänsterpartiet och Miljöpartiet vill se fler vårdplatser i vården.";
  const { t } = utvinnTermer(text, 20);
  assert.ok(!t.includes(stamma("vänsterpartiet")));
  assert.ok(!t.includes(stamma("miljöpartiet")));
  assert.ok(t.includes(stamma("vårdplatser")), "sakordet ska finnas kvar");
});

test("skarvaFor: betänkanden hamnar i egen skärva", () => {
  assert.equal(skarvaFor("202223:SkU2"), "bet");
  assert.equal(skarvaFor("202526:JuU22"), "bet");
  assert.equal(skarvaFor("h-2026-12469"), "12");
  assert.equal(betankandeNyckel("2022/23", "SkU2"), "202223:SkU2");
});
