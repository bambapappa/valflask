import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  titleSimilarity,
  findQuoteDuplicate,
  findPossibleDuplicate,
  findCrossPartyDuplicate,
  findComparableCosts,
  looksLikeUmbrella,
  findSamePartyInCategory,
  type ExistingPromiseLite,
  type ComparablePromiseLite,
} from "../src/similarity.ts";

describe("titleSimilarity", () => {
  it("identiska titlar → 1", () => {
    assert.equal(titleSimilarity("höjd a-kassa till nittio procent", "höjd a-kassa till nittio procent"), 1);
  });
  it("helt olika → lågt", () => {
    assert.ok(titleSimilarity("sänkt skatt på sparande", "fri tandvård för alla barn") < 0.2);
  });
  it("samma löfte, olika formulering → en bit över tröskeln", () => {
    const s = titleSimilarity(
      "Höjd a-kassa till nittio procent av lönen",
      "S vill höja a-kassan till nittio procent av lönen",
    );
    assert.ok(s >= 0.3, `fick ${s}`);
  });
});

describe("findQuoteDuplicate — samma citat är samma yttrande", () => {
  // Det skarpa fallet, mätt 2026-08-03: citatet låg publicerat som p-2026-0321
  // med hela citatet som titel, och skördades om under en härledd, kortare
  // titel. Titelkollen missade det tre gånger.
  const sverigekortet =
    "Med vårt Sverigekort kan du resa fritt på all kollektivtrafik i hela landet till en billig penning. 499 kronor i månaden för vuxna.";
  const existing: ExistingPromiseLite[] = [
    {
      id: "p-2026-0321",
      title: sverigekortet,
      parties: ["mp"],
      category: "transport",
      group_id: null,
      quote: sverigekortet,
    },
  ];

  it("identiskt citat flaggas trots att titeln är en annan", () => {
    const d = findQuoteDuplicate({ quote: sverigekortet }, existing);
    assert.equal(d?.id, "p-2026-0321");
  });

  it("titelkollen hade missat samma fall — därför behövs den här", () => {
    const d = findPossibleDuplicate(
      { title: "Sverigekort för 499 kr/mån i kollektivtrafik", parties: ["mp"], category: "transport" },
      existing,
    );
    assert.equal(d, null);
  });

  it("skiljetecken, versaler och radbrott spelar ingen roll", () => {
    const d = findQuoteDuplicate(
      { quote: "MED VÅRT SVERIGEKORT KAN DU RESA FRITT\npå all kollektivtrafik i hela landet till en billig penning – 499 kronor i månaden för vuxna!" },
      existing,
    );
    assert.equal(d?.id, "p-2026-0321");
  });

  it("delmängd räknas åt båda håll — utvinningen kapar citatet olika långt", () => {
    const kortare = "Med vårt Sverigekort kan du resa fritt på all kollektivtrafik i hela landet";
    assert.equal(findQuoteDuplicate({ quote: kortare }, existing)?.id, "p-2026-0321");
    assert.equal(
      findQuoteDuplicate(
        { quote: sverigekortet },
        [{ ...existing[0]!, quote: kortare }],
      )?.id,
      "p-2026-0321",
    );
  });

  it("annan politik flaggas inte", () => {
    const d = findQuoteDuplicate(
      { quote: "Vi vill förbjuda religiösa friskolor i hela landet, utan undantag." },
      existing,
    );
    assert.equal(d, null);
  });

  it("för kort citat jämförs inte — två partier kan säga 'det ska bort'", () => {
    const kort: ExistingPromiseLite[] = [
      { id: "p-1", title: "t", parties: ["s"], category: "välfärd", group_id: null, quote: "Det ska bort." },
    ];
    assert.equal(findQuoteDuplicate({ quote: "Det ska bort." }, kort), null);
  });

  it("saknat citat på någon sida ger ingen träff i stället för en krasch", () => {
    assert.equal(findQuoteDuplicate({ quote: "" }, existing), null);
    assert.equal(
      findQuoteDuplicate({ quote: sverigekortet }, [{ ...existing[0]!, quote: "" }]),
      null,
    );
  });
});

describe("findPossibleDuplicate", () => {
  const existing: ExistingPromiseLite[] = [
    {
      id: "p-2026-0001",
      title: "Höjd a-kassa till nittio procent av lönen",
      parties: ["s"],
      category: "välfärd",
      group_id: null,
      quote: "Vi vill höja a-kassan till nittio procent av lönen.",
    },
  ];

  it("flaggar samma parti + kategori + lik titel", () => {
    const d = findPossibleDuplicate(
      { title: "S höjer a-kassan till nittio procent av lönen", parties: ["s"], category: "välfärd" },
      existing,
    );
    assert.equal(d?.id, "p-2026-0001");
  });

  it("inget partiöverlapp → ingen dublett", () => {
    const d = findPossibleDuplicate(
      { title: "Höjd a-kassa till nittio procent av lönen", parties: ["m"], category: "välfärd" },
      existing,
    );
    assert.equal(d, null);
  });

  it("annan kategori → ingen dublett", () => {
    const d = findPossibleDuplicate(
      { title: "Höjd a-kassa till nittio procent av lönen", parties: ["s"], category: "skatter" },
      existing,
    );
    assert.equal(d, null);
  });
});

describe("findCrossPartyDuplicate — samma politik hos annat parti (R3)", () => {
  const existing = [
    {
      id: "p-2026-0340",
      title: "Höj försvarsanslagen till 5 procent av BNP",
      parties: ["l"],
      category: "försvar",
      group_id: null,
      quote: "Liberalerna vill höja försvarsanslagen till fem procent av BNP.",
    },
    {
      id: "p-2026-0461",
      title: "Ta bort karensavdraget",
      parties: ["s"],
      category: "välfärd",
      group_id: null,
      quote: "Den orättvisan vill vi ta bort, karensavdraget ska avskaffas helt.",
    },
  ];

  it("annat partis 5%-BNP-löfte flaggas (L↔C-fallet)", () => {
    const d = findCrossPartyDuplicate(
      { title: "Upprustning av försvaret till fem procent av BNP", parties: ["c"], category: "försvar" },
      existing,
    );
    assert.equal(d?.id, "p-2026-0340");
  });

  it("SAMMA parti flaggas INTE här (intra-parti hanteras av findPossibleDuplicate)", () => {
    const d = findCrossPartyDuplicate(
      { title: "Höj försvarsanslagen till 5 procent av BNP", parties: ["l"], category: "försvar" },
      existing,
    );
    assert.equal(d, null);
  });

  it("annan kategori flaggas inte trots liknande titel", () => {
    const d = findCrossPartyDuplicate(
      { title: "Höj försvarsanslagen till 5 procent av BNP", parties: ["c"], category: "skatter" },
      existing,
    );
    assert.equal(d, null);
  });

  it("olik politik under tröskeln flaggas inte (högre tröskel än intra-parti)", () => {
    const d = findCrossPartyDuplicate(
      { title: "Slopa skatten på pension", parties: ["mp"], category: "välfärd" },
      existing,
    );
    assert.equal(d, null);
  });
});

describe("findComparableCosts — riktmärken för kostnadsankring", () => {
  const lite = (o: Partial<ComparablePromiseLite> & Pick<ComparablePromiseLite, "id" | "title" | "category">): ComparablePromiseLite => ({
    parties: ["m"],
    group_id: null,
    msek_base: 500,
    period: "per_ar",
    basis: "llm_estimat",
    status: "aktiv",
    ...o,
  });
  const existing: ComparablePromiseLite[] = [
    lite({ id: "p-2026-0462", title: "Slopad mängdrabatt och straffminst för de tre allvarligaste brotten", parties: ["l"], category: "rättsväsende", msek_base: 1500 }),
    lite({ id: "p-2026-0313", title: "Avskaffa mängdrabatten för brott", parties: ["m"], category: "rättsväsende", msek_base: 1500 }),
    lite({ id: "p-2026-0099", title: "Fri tandvård för alla barn", parties: ["v"], category: "välfärd", msek_base: 800 }),
  ];

  it("ger jämförbara löften i samma kategori, oavsett parti", () => {
    const cmp = findComparableCosts(
      { title: "Ta bort mängdrabatten vid flerfaldig brottslighet", category: "rättsväsende" },
      existing,
    );
    const ids = cmp.map((c) => c.id);
    assert.ok(ids.includes("p-2026-0462"), "cross-parti-grannen tas med");
    assert.ok(ids.includes("p-2026-0313"));
    assert.ok(!ids.includes("p-2026-0099"), "annan kategori utesluts");
    const l = cmp.find((c) => c.id === "p-2026-0462");
    assert.equal(l?.party, "l", "bär första partiet");
    assert.equal(l?.msek_base, 1500, "bär beloppet");
  });

  it("sorterar mest lika först", () => {
    const cmp = findComparableCosts(
      { title: "Avskaffa mängdrabatten för brott", category: "rättsväsende" },
      existing,
    );
    assert.equal(cmp[0]?.id, "p-2026-0313", "exakt titelträff överst");
  });

  it("utesluter tillbakadragna men behåller nollställda (belopp 0)", () => {
    const withZeroAndRetracted: ComparablePromiseLite[] = [
      lite({ id: "p-2026-0089", title: "Stoppa storskalig industritrålning i Östersjön", parties: ["m"], category: "klimat-miljö", msek_base: 0 }),
      lite({ id: "p-2026-0402", title: "Stoppa trålning nära kusterna", parties: ["l"], category: "klimat-miljö", msek_base: 300, status: "tillbakadragen" }),
    ];
    const cmp = findComparableCosts(
      { title: "Stoppa industritrålning i havet", category: "klimat-miljö" },
      withZeroAndRetracted,
    );
    const ids = cmp.map((c) => c.id);
    assert.ok(ids.includes("p-2026-0089"), "nollställt löfte är ett giltigt riktmärke");
    assert.ok(!ids.includes("p-2026-0402"), "tillbakadraget utesluts");
  });

  it("respekterar maxN", () => {
    const many: ComparablePromiseLite[] = Array.from({ length: 8 }, (_, i) =>
      lite({ id: `p-2026-10${i}`, title: "Skärpa straffen för grova brott rejält", category: "rättsväsende" }),
    );
    const cmp = findComparableCosts(
      { title: "Skärpa straffen för grova brott", category: "rättsväsende" },
      many,
      { maxN: 3 },
    );
    assert.equal(cmp.length, 3);
  });
});

describe("looksLikeUmbrella — breda uppräkningslöften", () => {
  // Riktiga fall ur genomgången 2026-07-24: alla fem prissattes och
  // dubbelräknade politik som redan låg på partiets egna löften.
  it("flaggar sammanfattningar av flera åtaganden", () => {
    assert.equal(
      looksLikeUmbrella(
        "Höja lönerna, höja barnbidragen, genomföra reformer för billigare mediciner, bättre pensioner, slopat karensavdrag",
        "Höja lönerna, höja barnbidragen, genomföra reformer för billigare mediciner, bättre pensioner, slopat karensavdrag.",
      ),
      true,
    );
    assert.equal(
      looksLikeUmbrella(
        "fler synliga poliser, fler lösta brott och en rättskedja som fungerar",
        "fler synliga poliser, fler lösta brott och en rättskedja som fungerar. Den kriminella ekonomin ska strypas, brottsoffer skyddas bättre och barn ska räddas från att dras in i kriminalitet",
      ),
      true,
    );
    assert.equal(
      looksLikeUmbrella(
        "bygga starkare allianser, stötta Ukraina, stärka totalförsvaret och göra samhället mer motståndskraftigt",
        "bygga starkare allianser, stötta Ukraina, stärka totalförsvaret och göra samhället mer motståndskraftigt",
      ),
      true,
    );
  });

  it("citatets bredd fångar löften där titeln är kort men löftet är en önskelista", () => {
    // p-2026-0344: titeln har bara två segment, uppräkningen sitter i citatet.
    assert.equal(
      looksLikeUmbrella(
        "Bättre studiero och stöd för att stoppa utslagningen i skolan",
        "Elevernas behov ska sättas i centrum och utslagningen av elever måste stoppas. Med bättre studiero, mindre klasser, rätt stöd, uppvärdering av yrkesutbildning och fler behöriga lärare kan fler elever få lyckas.",
      ),
      true,
    );
  });

  it("flaggar INTE konkreta enskilda åtaganden", () => {
    const konkreta: Array<[string, string]> = [
      ["Permanent snabbare lagföring i hela landet", "Arbetssättet med snabbare lagföring ska införas i hela landet med tydliga tidsatta mål."],
      ["Införa maxtak på 20 elever per klass", "Vi vill införa ett maxtak på tjugo elever per klass med början i lågstadiet."],
      ["Inför ett särskilt snabbspår för brott mot småföretagare", "Inför ett särskilt snabbspår för återkommande stölder, hot, bedrägerier och utpressning mot småföretagare och lokala verksamheter."],
      ["Avsätt minst en procent av BNI årligen till Ukraina", "Avsätt minst en procent av BNI årligen till Ukraina."],
      ["Hormonpreparat vid klimakteriet i högkostnadsskyddet", "Hormonpreparat för klimakteriebehandling ska ingå i högkostnadsskyddet."],
    ];
    for (const [title, quote] of konkreta) {
      assert.equal(looksLikeUmbrella(title, quote), false, `felaktigt flaggad: ${title}`);
    }
  });
});

describe("findSamePartyInCategory — underlag för överlappskontroll", () => {
  const lite = (o: Partial<ComparablePromiseLite> & Pick<ComparablePromiseLite, "id" | "title" | "category">): ComparablePromiseLite => ({
    parties: ["c"],
    group_id: null,
    msek_base: 500,
    period: "per_ar",
    basis: "llm_estimat",
    status: "aktiv",
    ...o,
  });
  const existing: ComparablePromiseLite[] = [
    lite({ id: "p-2026-0371", title: "Permanent snabbare lagföring", category: "rättsväsende", msek_base: 100 }),
    lite({ id: "p-2026-0376", title: "Ersätt Ekobrottsmyndigheten med Ekokrim", category: "rättsväsende", msek_base: 300 }),
    lite({ id: "p-2026-0999", title: "Annat partis löfte", parties: ["s"], category: "rättsväsende", msek_base: 9000 }),
    lite({ id: "p-2026-0888", title: "Eget löfte i annan kategori", category: "utbildning", msek_base: 8000 }),
    lite({ id: "p-2026-0777", title: "Tillbakadraget eget löfte", category: "rättsväsende", msek_base: 7000, status: "tillbakadragen" }),
  ];

  it("listar bara partiets egna, aktiva löften i samma kategori", () => {
    const own = findSamePartyInCategory({ parties: ["c"], category: "rättsväsende" }, existing);
    const ids = own.map((o) => o.id);
    assert.deepEqual(ids, ["p-2026-0376", "p-2026-0371"], "störst belopp först");
    assert.ok(!ids.includes("p-2026-0999"), "annat parti utesluts");
    assert.ok(!ids.includes("p-2026-0888"), "annan kategori utesluts");
    assert.ok(!ids.includes("p-2026-0777"), "tillbakadraget utesluts");
  });

  it("respekterar maxN", () => {
    assert.equal(findSamePartyInCategory({ parties: ["c"], category: "rättsväsende" }, existing, 1).length, 1);
  });
});
