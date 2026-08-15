import { describe, it } from "node:test";
import assert from "node:assert/strict";

/*
 * T8 prövar invarianterna R1, R3 och R4 — men fram till 2026-08-05 prövade den
 * dem mot EGNA kopior av sajtens summor, inte mot koden som körs.
 *
 * Vad det betydde, mätt: när `totalFinancingClaimed` gjordes trasig igen (dedup
 * och aktivfilter borttagna, alltså exakt felet som fanns i skarp drift fram
 * till 2026-08-04) gav den här filen 11 av 11 gröna. Kopiorna kände inte till
 * koden de skulle vakta. Mot verkliga data sa de dessutom något annat än
 * sajten: gapet 5 261 636 mot 3 320 376 miljoner kronor.
 *
 * Kopiorna hade också hunnit frysa in två rättade regler. Den ena påstod att en
 * grupp representeras av sin FÖRST påträffade medlem — det rättades 2026-07-27
 * till medlemmen med högst belopp. Den andra räknade finansieringen utan period,
 * fast fältet bär en sedan 2026-08-04. Ett test som ensamt säger vad regeln är
 * blir en andra sanning, och då är det inte längre ett test.
 *
 * Filen importerar nu sajtens riktiga funktioner. Fixturerna står kvar — de är
 * poängen med enhetstestet — men svaren kommer från koden som möter läsaren.
 *
 * Den flyttade samtidigt från `pipeline/tests/` hit. Invarianterna handlar om
 * `site/src/lib/aggregates.ts`, och ett prov hör hemma hos koden det mäter —
 * det var avståndet dit som gjorde kopiorna frestande. Pipelinen typkontrollerar
 * dessutom strängare än sajten, så importen därifrån drog in sajtens kod under
 * regler den aldrig skrivits för.
 *
 * Körs med `node --experimental-strip-types --test`, som sajtens övriga grindar.
 */
import {
  promiseTotalMsek,
  promiseNetMsek,
  partyTotalMsek,
  partyFinancingClaimedMsek,
  partyFinancingGapMsek,
  totalFlasket,
  totalBesparingar,
  totalFinancingClaimed,
  financingGap,
  coalitionAggregates,
  buildSummary,
  isActive,
} from "../src/lib/aggregates.ts";
import type { PromisePost, Party, Constants } from "../src/lib/data.ts";

type TestPromise = PromisePost;
type TestParty = Party;

/**
 * Fixturerna bär bara de fält summorna faktiskt läser. Resten av `PromisePost`
 * (citat, källa, arkivkopia) hör inte hemma i ett räknetest, därav casten.
 *
 * `financing_claimed` får en period som förval: fältet bär en sedan 2026-08-04,
 * schemat kräver den, och utan den räknas ett årligt belopp som ett engångs.
 */
function mkPromise(
  id: string,
  opts: {
    msek_base: number;
    parties: string[];
    group_id?: string | null;
    status?: string;
    financing_claimed?: { described: boolean; summary: string | null; msek: number | null; period?: string };
    cost?: Partial<TestPromise["cost"]>;
  }
): TestPromise {
  const fin = opts.financing_claimed ?? { described: false, summary: null, msek: null };
  return {
    id,
    group_id: opts.group_id ?? null,
    parties: opts.parties,
    cost: {
      type: opts.cost?.type ?? "utgift",
      period: opts.cost?.period ?? "per_ar",
      msek_low: opts.cost?.msek_low ?? opts.msek_base * 0.8,
      msek_base: opts.msek_base,
      msek_high: opts.cost?.msek_high ?? opts.msek_base * 1.2,
      basis: opts.cost?.basis ?? "rut",
    },
    financing_claimed:
      fin.msek === null ? fin : { ...fin, period: fin.period ?? "per_ar" },
    status: opts.status ?? "aktiv",
  } as unknown as TestPromise;
}

const PARTIES: TestParty[] = [
  { code: "a", name: "Parti A", color: "#111", color_text: "#111", mandate_2022: 30, votes_2022: 500000, block: "x", manifest_2026: "" },
  { code: "b", name: "Parti B", color: "#222", color_text: "#222", mandate_2022: 25, votes_2022: 400000, block: "y", manifest_2026: "" },
  { code: "c", name: "Parti C", color: "#333", color_text: "#333", mandate_2022: 20, votes_2022: 300000, block: "x", manifest_2026: "" },
  { code: "d", name: "Parti D", color: "#444", color_text: "#444", mandate_2022: 15, votes_2022: 200000, block: "y", manifest_2026: "" },
  { code: "e", name: "Parti E", color: "#555", color_text: "#555", mandate_2022: 10, votes_2022: 100000, block: "z", manifest_2026: "" },
  { code: "f", name: "Parti F", color: "#666", color_text: "#666", mandate_2022: 8, votes_2022: 80000, block: "z", manifest_2026: "" },
  { code: "g", name: "Parti G", color: "#777", color_text: "#777", mandate_2022: 5, votes_2022: 50000, block: "w", manifest_2026: "" },
  { code: "h", name: "Parti H", color: "#888", color_text: "#888", mandate_2022: 3, votes_2022: 30000, block: "w", manifest_2026: "" },
];

describe("T8: Invariant tests", () => {
  it("R1: per_ar ×4, engang ×1", () => {
    const p1 = mkPromise("t1", { msek_base: 1000, parties: ["a"], cost: { period: "per_ar", type: "utgift", msek_low: 800, msek_high: 1200, basis: "rut" } });
    const p2 = mkPromise("t2", { msek_base: 500, parties: ["a"], cost: { period: "engang", type: "utgift", msek_low: 400, msek_high: 600, basis: "rut" } });
    assert.equal(promiseTotalMsek(p1), 4000, "per_ar should ×4");
    assert.equal(promiseTotalMsek(p2), 500, "engang should ×1");
  });

  it("Σ(party totals) = Σ(promise totals) for single-party promises", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 2000, parties: ["b"] }),
      mkPromise("p3", { msek_base: 3000, parties: ["a"] }),
      mkPromise("p4", { msek_base: 500, parties: ["c"], cost: { type: "besparing", period: "per_ar", msek_low: 400, msek_high: 600, basis: "rut" } }),
    ];
    // Partisumman räknar NETTO: en besparing drar ned partiets summa i stället
    // för att lyfta den. Jämförelsen måste därför göras mot samma mått —
    // gjordes den mot bruttot såg p4 (en besparing) ut att fattas.
    const partyTotal = PARTIES.reduce((s, p) => s + partyTotalMsek(promises, p.code), 0);
    const allTotal = promises.filter(isActive).reduce((s, p) => s + promiseNetMsek(p), 0);
    assert.equal(partyTotal, allTotal, "party totals should equal sum of all promises");
  });

  it("R3: coalition with all 8 parties counts each group_id exactly once", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-shared" }),
      mkPromise("p2", { msek_base: 2000, parties: ["b"], group_id: "g-shared" }),
      mkPromise("p3", { msek_base: 3000, parties: ["c"] }),
      mkPromise("p4", { msek_base: 4000, parties: ["d"], group_id: "g-other" }),
      mkPromise("p5", { msek_base: 500, parties: ["e"], cost: { type: "intäktsminskning", period: "per_ar", msek_low: 400, msek_high: 600, basis: "rut" } }),
    ];
    const allCodes = PARTIES.map((p) => p.code);
    const result = coalitionAggregates(promises, PARTIES, allCodes);

    const groupIds = new Set<string>();
    const counted = new Set<string>();
    for (const p of promises.filter(isActive)) {
      const key = p.group_id ?? p.id;
      if (groupIds.has(key)) continue;
      groupIds.add(key);
      counted.add(key);
    }
    assert.equal(result.promisesCount, groupIds.size, "should count each group_id once");
    // Gruppen `g-shared` representeras av p2 (2000), inte av p1 (1000):
    // representanten är medlemmen med HÖGST belopp sedan 2026-07-27. Den här
    // raden sade tidigare 1000 och låste därmed in den rättade regeln.
    assert.equal(result.totalFlasket, 2000 * 4 + 3000 * 4 + 4000 * 4 + 500 * 4, "should sum unique items correctly");
  });

  it("R3: min–max interval when amounts differ in same group", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-diff" }),
      mkPromise("p2", { msek_base: 3000, parties: ["b"], group_id: "g-diff" }),
    ];
    const result = coalitionAggregates(promises, PARTIES, ["a", "b"]);
    assert.equal(result.groupNotes.length, 1, "should have one group note");
    const note = result.groupNotes[0]!;
    assert.equal(note.group_id, "g-diff");
    assert.equal(note.minMsek, 4000, "min should be 1000 × 4");
    assert.equal(note.maxMsek, 12000, "max should be 3000 × 4");
    assert.deepEqual(note.parties.sort(), ["a", "b"]);
  });

  it("R4: gap = flasket − besparingar − financing_claimed", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 10000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 3000, parties: ["a"], cost: { type: "besparing", period: "per_ar", msek_low: 2000, msek_high: 4000, basis: "rut" } }),
      mkPromise("p3", { msek_base: 5000, parties: ["a"], financing_claimed: { described: true, summary: "x", msek: 2000 } }),
    ];
    const flasket = totalFlasket(promises);
    const besparingar = totalBesparingar(promises);
    const financing = totalFinancingClaimed(promises);
    const gap = financingGap(promises);
    assert.equal(flasket, 60000, "flasket = (10000 + 5000) × 4");
    assert.equal(besparingar, 12000, "besparingar = 3000 × 4");
    // Finansieringen räknas upp till mandatperioden precis som kostnaderna:
    // 2000 per år blir 8000. Före 2026-08-04 saknade fältet period och drogs av
    // som ett enda år från kostnader räknade för fyra — de tre termerna i gapet
    // vilade då på olika tidsrymder.
    assert.equal(financing, 8000, "financing_claimed = 2000 × 4 år");
    assert.equal(gap, 40000, "gap = 60000 - 12000 - 8000");
  });

  it("R4: de tre termerna vilar på samma population", () => {
    // Den här prövar det R4 faktiskt handlar om, och den KAN falla: gruppen
    // nedan bär samma finansieringsuppgift på två medlemmar, och en
    // tillbakadragen post bär en tredje. Räknas finansieringen utan gruppdedup
    // eller utan aktivfilter — felet som stod i skarp drift till 2026-08-04 —
    // svarar den 12 000 eller 20 000 i stället för 4 000.
    //
    // Utan ett sådant fall är övriga R4-prov blinda: fixturer utan grupper och
    // utan tillbakadragna löften ger samma svar oavsett om filtren finns.
    const fin = (msek: number) => ({ described: true, summary: "x", msek, period: "per_ar" });
    const promises: TestPromise[] = [
      mkPromise("g1", { msek_base: 1000, parties: ["a"], group_id: "g-sam", financing_claimed: fin(1000) }),
      mkPromise("g2", { msek_base: 900, parties: ["a"], group_id: "g-sam", financing_claimed: fin(1000) }),
      mkPromise("g3", { msek_base: 500, parties: ["b"], status: "tillbakadragen", financing_claimed: fin(2000) }),
    ];

    assert.equal(
      totalFinancingClaimed(promises),
      4000,
      "gruppen räknas en gång (1000 × 4) och det tillbakadragna löftet inte alls",
    );
    assert.equal(
      totalFlasket(promises),
      4000,
      "kostnaderna räknas på exakt samma population som finansieringen",
    );
    assert.equal(financingGap(promises), 0, "gap = 4000 − 0 − 4000");
  });

  it("R4: intäktsökning (t.ex. ny skatt) räknas som besparing i gapet", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 10000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 3000, parties: ["a"], cost: { type: "intäktsökning", period: "per_ar", msek_low: 2000, msek_high: 4000, basis: "rut" } }),
    ];
    assert.equal(totalBesparingar(promises), 12000, "intäktsökning ska räknas i besparingspotten");
    assert.equal(financingGap(promises), 40000 - 12000, "gap = flasket - besparingar (intäktsökning inräknad)");
  });

  it("R4: negative gap = 'övertäckt'", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"] }),
      mkPromise("p2", { msek_base: 5000, parties: ["a"], cost: { type: "besparing", period: "per_ar", msek_low: 4000, msek_high: 6000, basis: "rut" } }),
      mkPromise("p3", { msek_base: 2000, parties: ["a"], financing_claimed: { described: true, summary: "x", msek: 8000 } }),
    ];
    const gap = financingGap(promises);
    assert.ok(gap < 0, "gap should be negative (övertäckt)");
  });

  it("tillbakadragen promises excluded from party totals", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], status: "aktiv" }),
      mkPromise("p2", { msek_base: 5000, parties: ["a"], status: "tillbakadragen" }),
    ];
    const total = partyTotalMsek(promises, "a");
    assert.equal(total, 4000, "should only count active promises");
  });

  it("R3: coalition dedup with mixed types", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-mix", cost: { type: "utgift", period: "per_ar", msek_low: 800, msek_high: 1200, basis: "rut" } }),
      mkPromise("p2", { msek_base: 2000, parties: ["b"], group_id: "g-mix", cost: { type: "intäktsminskning", period: "per_ar", msek_low: 1500, msek_high: 2500, basis: "rut" } }),
    ];
    const result = coalitionAggregates(promises, PARTIES, ["a", "b"]);
    assert.equal(result.promisesCount, 1, "group dedup: only 1 unique group");
    assert.equal(result.totalFlasket, 8000, "gruppens högsta belopp representerar den (2000×4)");
    assert.equal(result.groupNotes.length, 1, "amounts differ → group note");
  });

  it(" Coalition mandates sum correctly", () => {
    const result = coalitionAggregates([], PARTIES, ["a", "b", "c"]);
    assert.equal(result.mandatesSum, 30 + 25 + 20, "mandates should sum");
  });

  it("empty coalition returns zeros", () => {
    const result = coalitionAggregates([], PARTIES, []);
    assert.equal(result.totalFlasket, 0);
    assert.equal(result.financingGap, 0);
    assert.equal(result.promisesCount, 0);
    assert.equal(result.groupNotes.length, 0);
  });
});

/*
 * `buildSummary` bygger det som ligger på `api/v1/summary.json` — talen andra
 * läser och citerar. Fram till 2026-08-15 prövades den inte alls, och partiernas
 * rader räknade två fel i ett och samma uttryck: gapet summerades ur en
 * OGRUPPERAD lista fast `total_msek` på samma objekt grupperar, och partiets
 * egen finansieringsuppgift lästes utan sin period. Mätt mot skarpa data
 * överdrev det Centerpartiets gap med 595 200 miljoner kronor och
 * Socialdemokraternas med noll — ett fel som träffar partierna olika.
 */
const KONSTANTER: Constants = {
  generated_note: "",
  reformutrymme_msek_per_ar: { value: 100000, source_url: "https://exempel.test", source_date: "2026-01-01" },
  items: [],
};
const LOGG = [{ data_hash: "0".repeat(64) }];
const finansiering = (msek: number) => ({ described: true, summary: "x", msek, period: "per_ar" });

describe("Summorna i det publika svaret", () => {
  it("Ett publicerat belopp ändras inte av att samma politik sägs en gång till", () => {
    // Invarianten hela grupperingen vilar på: ett delat löfte är EN politik,
    // hur många formuleringar den än har. Sägs den en gång till ska varje
    // belopp stå still — på riksnivå och på partiets egen rad.
    const bas: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], group_id: "g-delad", financing_claimed: finansiering(400) }),
      mkPromise("p2", { msek_base: 900, parties: ["b"], group_id: "g-delad", financing_claimed: finansiering(400) }),
      mkPromise("p3", { msek_base: 700, parties: ["a"] }),
      mkPromise("p4", { msek_base: 300, parties: ["b"], cost: { type: "besparing", period: "per_ar", msek_low: 200, msek_high: 400, basis: "rut" } }),
    ];
    // Upprepningen får ett LÄGRE belopp än gruppens bärare. Annars byter
    // gruppen representant, och då ska talen röra sig — provet skulle mäta
    // fel sak och gå igenom av en slump.
    const medUpprepning: TestPromise[] = [
      ...bas,
      mkPromise("p5", { msek_base: 800, parties: ["a"], group_id: "g-delad", financing_claimed: finansiering(400) }),
    ];

    const fore = buildSummary(bas, PARTIES, KONSTANTER, LOGG);
    const efter = buildSummary(medUpprepning, PARTIES, KONSTANTER, LOGG);

    for (const falt of [
      "total_msek_flasket",
      "total_msek_besparingar",
      "total_financing_claimed_msek",
      "financing_gap_msek",
    ] as const) {
      assert.equal(efter[falt], fore[falt], `${falt} ändrades av en upprepning av samma politik`);
    }
    for (const [i, parti] of efter.parties.entries()) {
      const innan = fore.parties[i]!;
      assert.equal(parti.total_msek, innan.total_msek, `${parti.code}: total_msek ändrades av en upprepning`);
      assert.equal(parti.per_vote, innan.per_vote, `${parti.code}: per_vote ändrades av en upprepning`);
      assert.equal(
        parti.financing_gap_msek,
        innan.financing_gap_msek,
        `${parti.code}: finansieringsgapet ändrades av en upprepning — gapet räknas på en ` +
          "annan population än partisumman på samma rad",
      );
    }
    // ANTALEN är undantagna med flit: `promises_count` räknar löftesposter,
    // och en formulering till ÄR en post till. Den siffran svarar på en annan
    // fråga än beloppen och speglar det partisidan faktiskt listar.
    assert.ok(efter.total_promises > fore.total_promises, "antalet poster ska däremot öka");
  });

  it("Partiets gap vilar på samma population och samma period som partisumman", () => {
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], financing_claimed: finansiering(250) }),
    ];
    // Finansieringsuppgiften räknas upp till mandatperioden precis som
    // kostnaden: 250 per år är 1 000, inte 250. Läses den rått blir gapet
    // 3 750 — för stort, alltså till partiets nackdel.
    assert.equal(partyTotalMsek(promises, "a"), 4000, "1 000 per år = 4 000");
    assert.equal(partyFinancingClaimedMsek(promises, "a"), 1000, "250 per år = 1 000");
    assert.equal(partyFinancingGapMsek(promises, "a"), 3000, "gap = 4 000 − 1 000");
    assert.equal(
      buildSummary(promises, PARTIES, KONSTANTER, LOGG).parties.find((p) => p.code === "a")!.financing_gap_msek,
      3000,
      "det publicerade gapet ska vara samma tal som funktionen ger",
    );
  });

  it("Delas ingen politik mellan partier är rikets gap summan av partiernas", () => {
    // Binder ihop de två nivåerna. Räknar de på olika populationer glider de
    // isär utan att något enskilt tal ser fel ut.
    const promises: TestPromise[] = [
      mkPromise("p1", { msek_base: 1000, parties: ["a"], financing_claimed: finansiering(250) }),
      mkPromise("p2", { msek_base: 600, parties: ["b"] }),
      mkPromise("p3", { msek_base: 500, parties: ["b"], group_id: "g-egen" }),
      mkPromise("p4", { msek_base: 400, parties: ["b"], group_id: "g-egen" }),
      mkPromise("p5", { msek_base: 200, parties: ["c"], cost: { type: "intäktsökning", period: "per_ar", msek_low: 150, msek_high: 250, basis: "rut" } }),
      mkPromise("p6", { msek_base: 900, parties: ["d"], status: "tillbakadragen" }),
    ];
    const summa = PARTIES.reduce((s, p) => s + partyFinancingGapMsek(promises, p.code), 0);
    assert.equal(summa, financingGap(promises), "partiernas gap ska summera till rikets");
  });
});
