/**
 * test-grupplista.mts — enhetstest för att LISTOR och SUMMOR aldrig får säga
 * olika saker om samma grupp.
 *
 * Bakgrunden: topplistan sorterade alla löften rakt av. Samma politik med tre
 * formuleringar tog då tre platser med samma belopp tre gånger — sex av tio
 * platser gick till två politikförslag (mätt 2026-08-03). Summorna räknade
 * redan gruppen en gång, så listan och totalen sa olika saker om samma data.
 * Partisidan bar samma fel tydligare: rubriken visade gruppen en gång medan
 * tabellen under upprepade beloppet på varje medlem.
 *
 * Grindarna nedan prövas mot både påhittade fall och det verkliga datat.
 * Körs i sajtens teststil (node --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import {
  dedupeByGroup,
  groupBearersForParty,
  groupedPromises,
  arPartiegenKalla,
  partyCoverage,
  partyTotalMsek,
  totalFinancingClaimed,
  financingClaimedMsek,
  financingGap,
  totalFlasket,
  totalBesparingar,
  coalitionAggregates,
  promiseNetMsek,
  promiseTotalMsek,
} from "../src/lib/aggregates.ts";
import { getPromises, getParties } from "../src/lib/data.ts";
import type { PromisePost } from "../src/lib/data";

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

function p(
  id: string,
  base: number,
  parties: string[],
  group_id: string | null = null,
  status = "aktiv",
): PromisePost {
  return {
    id,
    slug: id,
    title: id,
    parties,
    group_id,
    status,
    category: "övrigt",
    cost: {
      type: "utgift",
      period: "per_ar",
      msek_low: base,
      msek_base: base,
      msek_high: base,
      basis: "llm_estimat",
      basis_url: null,
      method_note: "x",
      confidence: 0.4,
    },
  } as unknown as PromisePost;
}

console.log("=== Grupperade listor ===");

// ── Påhittade fall ────────────────────────────────────────────────────────
{
  const data = [
    p("p-1", 100, ["c"], "g-delad"),
    p("p-2", 100, ["l"], "g-delad"),
    p("p-3", 100, ["m"], "g-delad"),
    p("p-4", 90, ["s"]),
  ];
  const lista = groupedPromises(data);
  check("gruppen tar en plats, inte tre", lista.length === 2, `fick ${lista.length}`);

  const delad = lista.find((g) => g.promise.group_id === "g-delad")!;
  check(
    "raden bär hela gruppens partier",
    delad.parties.join(",") === "c,l,m",
    delad.parties.join(","),
  );
  check("raden vet hur många formuleringar som finns", delad.memberIds.length === 3);
  check("delad markeras som delad", delad.shared === true);
  check("ogrupperat löfte markeras inte som delat", lista.find((g) => g.promise.id === "p-4")!.shared === false);

  // Bäraren måste vara densamma som summorna använder, annars kan en lista
  // visa ett annat belopp än totalen räknat med.
  check(
    "bäraren är densamma som i dedupeByGroup",
    delad.promise.id === dedupeByGroup(data).find((x) => x.group_id === "g-delad")!.id,
  );
}

{
  // Ett tillbakadraget löfte får varken ta plats eller dra med sig gruppen.
  const data = [
    p("p-1", 100, ["c"], "g-x", "tillbakadragen"),
    p("p-2", 40, ["c"], "g-x"),
  ];
  const lista = groupedPromises(data);
  check("tillbakadraget löfte listas inte", lista.length === 1 && lista[0]!.promise.id === "p-2");
  check(
    "tillbakadraget räknas inte som en formulering",
    lista[0]!.memberIds.join(",") === "p-2",
    lista[0]!.memberIds.join(","),
  );
}

{
  // Tvärpartigrupp: partiets summa behåller partiets EGEN medlem, så partisidans
  // bärare måste räknas fram efter partifiltret — inte globalt.
  const data = [
    p("p-1", 100, ["m"], "g-tvar"),
    p("p-2", 60, ["c"], "g-tvar"),
  ];
  check(
    "partiets bärare är partiets egen medlem",
    groupBearersForParty(data, "c").get("g-tvar") === "p-2",
  );
  check(
    "det andra partiet bär sin egen",
    groupBearersForParty(data, "m").get("g-tvar") === "p-1",
  );
}

// ── Mot verkliga datat ────────────────────────────────────────────────────
const alla = getPromises();

{
  // Ingen grupp får ta två platser i en rangordnad lista.
  const grupper = groupedPromises(alla).map((g) => g.promise.group_id).filter(Boolean);
  check(
    "ingen grupp tar mer än en plats i listan",
    new Set(grupper).size === grupper.length,
    `${grupper.length} rader, ${new Set(grupper).size} grupper`,
  );
}

{
  // Kärnan: partisidans lista måste addera till partisidans rubrik. Beloppet
  // visas bara på bäraren, alltså är summan av de visade beloppen = totalen.
  for (const kod of ["s", "m", "sd", "c", "v", "kd", "l", "mp"]) {
    const bearers = groupBearersForParty(alla, kod);
    const listade = alla.filter((x) => x.status !== "tillbakadragen" && x.parties.includes(kod));
    const visad = listade
      .filter((x) => !x.group_id || bearers.get(x.group_id) === x.id)
      .reduce((s, x) => s + promiseNetMsek(x), 0);
    const rubrik = partyTotalMsek(alla, kod);
    check(
      `${kod}: listans visade belopp summerar till rubrikens total`,
      Math.abs(visad - rubrik) < 1e-6,
      `lista ${Math.round(visad)} mot rubrik ${Math.round(rubrik)}`,
    );
  }
}

{
  // Listan ska vara sorterbar på belopp utan att en grupp smyger in ett
  // annat belopp än det summorna räknade med.
  const fel = groupedPromises(alla).filter((g) => {
    if (!g.promise.group_id) return false;
    const medlemmar = alla.filter(
      (x) => x.status !== "tillbakadragen" && x.group_id === g.promise.group_id,
    );
    return medlemmar.some((m) => promiseTotalMsek(m) > promiseTotalMsek(g.promise));
  });
  check("raden bär gruppens högsta belopp", fel.length === 0, fel.map((g) => g.promise.id).join(" "));
}

{
  // Grindarna ovan låser vad hjälpfunktionerna gör. De säger ingenting om att
  // sidorna faktiskt ANVÄNDER dem — och det var just sidorna som räknade fel.
  // Därför läses de två mallarna som text: en rangordnad lista får inte gå
  // rakt på löftena, och partisidans belopp måste stå bakom bärarprövningen.
  const läs = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

  const topp = läs("../src/pages/topplistor.astro");
  check(
    "topplistan bygger på grupperade löften",
    /groupedPromises\(/.test(topp),
    "hittade inget anrop till groupedPromises",
  );
  check(
    "topplistan sorterar inte löftena rakt av",
    !/\[\.\.\.active\]\.sort/.test(topp),
    "listan sorterar active direkt igen",
  );

  const parti = läs("../src/pages/parti/[kod].astro");
  check(
    "partisidan räknar fram vilka löften som bär beloppet",
    /groupBearersForParty\(/.test(parti),
    "hittade inget anrop till groupBearersForParty",
  );
  check(
    "partisidans belopp står bakom bärarprövningen",
    /bearerId\s*&&\s*bearerId\s*!==\s*p\.id/.test(parti) && /bearer\s*$|bearer\s*\n\s*\?/m.test(parti),
    "beloppet ser ut att visas på varje medlem igen",
  );
}

// ── Besparingar ska synas som besparingar ─────────────────────────────────
{
  // En besparing drar ner ett partis summa. Visas den utan tecken under en
  // kolumn som heter "Kostnad" ser den ut att kosta lika mycket som den
  // sparar — p-2026-0349 (600 mkr besparing) stod så.
  const besparing = p("p-b", 150, ["c"]);
  (besparing as unknown as { cost: { type: string } }).cost.type = "besparing";
  check(
    "en besparing räknas med minustecken",
    promiseNetMsek(besparing) === -600,
    `fick ${promiseNetMsek(besparing)}`,
  );
  // formatMsek sätter minustecknet framför beloppet; grinden här håller sig
  // till talet, för det är tecknet som avgör vad läsaren ser.
  check(
    "beloppet som visas är negativt, inte magnituden",
    promiseNetMsek(besparing) < 0 && promiseTotalMsek(besparing) > 0,
  );

  // Partiets summa ska vara kostnader MINUS besparingar.
  const data = [p("p-1", 1000, ["c"]), besparing];
  check(
    "partiets summa är kostnader minus besparingar",
    partyTotalMsek(data, "c") === 4000 - 600,
    `fick ${partyTotalMsek(data, "c")}`,
  );

  // Och mot verkliga datat: minst en besparing finns, annars vaktar grinden
  // ingenting och skulle tyst bli meningslös.
  const verkliga = alla.filter(
    (x) => x.status !== "tillbakadragen" && (x.cost.type === "besparing" || x.cost.type === "intäktsökning") && x.cost.msek_base > 0,
  );
  check("registret bär besparingar att visa tecken för", verkliga.length > 0, `${verkliga.length} st`);
  check(
    "varje besparing i datat får negativt visat belopp",
    verkliga.every((x) => promiseNetMsek(x) < 0),
  );
}

{
  // Ett belopp som visas utan att typen står bredvid måste bära tecken.
  // Löftessidan är undantagen: där står "besparing" i egen kolumn intill.
  const läs = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const utanTecken: string[] = [];
  for (const rel of [
    "../src/pages/index.astro",
    "../src/pages/topplistor.astro",
    "../src/pages/parti/[kod].astro",
    "../src/pages/ledamot/[slug].astro",
    "../src/pages/fraga/[slug].astro",
    "../src/pages/rss.xml.ts",
    "../src/pages/llms-full.txt.ts",
  ]) {
    if (/promiseTotalMsek/.test(läs(rel))) utanTecken.push(rel.replace("../src/pages/", ""));
  }
  check(
    "inget belopp visas utan tecken där typen inte står bredvid",
    utanTecken.length === 0,
    utanTecken.join(", "),
  );

  // Startsidans lista hade samma gruppfel som topplistan: de tre
  // formuleringarna av grundlönen tog tre av fem platser.
  check(
    "startsidans dyraste-lista grupperar löftena",
    /groupedPromises\(/.test(läs("../src/pages/index.astro")),
    "hittade inget anrop till groupedPromises",
  );
}


// ── Underlaget bakom partiets siffra ──────────────────────────────────────
{
  // Talen på sajten säger vad ett parti lovar, inte hur brett underlaget är —
  // och det skiljer sig kraftigt. Mätt 2026-08-04 kom 21 % av KD:s löften från
  // partiets egen kanal mot 100 % för M och L, och hos KD bar tre löften 91 %
  // av summan. Grindarna nedan låser både räkningen och att den syns.
  const partiEgen = "https://kristdemokraterna.se/var-politik/nagot";
  const media = "https://www.svt.se/nyheter/inrikes/nagot";

  const data = [
    { ...p("p-1", 1000, ["kd"]), source: { url: partiEgen }, date_stated: "2026-07-01" },
    { ...p("p-2", 10, ["kd"]), source: { url: media }, date_stated: "2026-08-01" },
    { ...p("p-3", 10, ["kd"]), source: { url: media }, date_stated: "2026-06-01" },
  ] as unknown as PromisePost[];

  const t = partyCoverage(data, "kd");
  check("täckningen räknar partiets egna källor", t.egna === 1 && t.antal === 3, `${t.egna}/${t.antal}`);
  check("täckningen räknar skilda källadresser", t.kallor === 2, String(t.kallor));
  check("täckningen tar senaste datumet", t.senaste === "2026-08-01", String(t.senaste));
  // 1000+10+10 = 1020 av 1020 → hela summan ligger i topp tre.
  check("koncentrationen mäts mot rubrikens total", Math.abs(t.topp3Andel - 1) < 1e-9, String(t.topp3Andel));
  check(
    "största löftets andel räknas för sig",
    Math.abs(t.storstaAndel - 1000 / 1020) < 1e-9,
    String(t.storstaAndel),
  );

  // Underdomäner hör till partiet; pressrummet är partiets eget rum.
  check("pressrummet räknas som partiets egen kanal", arPartiegenKalla("https://press.kristdemokraterna.se/x"));
  check("ett medium räknas inte som partiets egen kanal", !arPartiegenKalla("https://www.svt.se/x"));
  check("en video räknas inte som partiets egen kanal", !arPartiegenKalla("https://youtube.com/watch?v=1"));
  check("en tom adress räknas aldrig som partiets", !arPartiegenKalla(""));

  // Ett tillbakadraget löfte hör inte till underlaget.
  const medDraget = [
    ...data,
    { ...p("p-4", 500, ["kd"], null, "tillbakadragen"), source: { url: partiEgen }, date_stated: "2026-09-01" },
  ] as unknown as PromisePost[];
  check("tillbakadraget löfte räknas inte in i underlaget", partyCoverage(medDraget, "kd").antal === 3);

  // Och mot mallen: räkningen ska faktiskt visas.
  const parti = readFileSync(new URL("../src/pages/parti/[kod].astro", import.meta.url), "utf8");
  check("partisidan visar vad siffran vilar på", /partyCoverage\(/.test(parti) && /Vad siffran vilar på/.test(parti));
  check(
    "koncentrationen skrivs ut när tre löften bär över sjuttio procent",
    /topp3Andel\s*>=\s*0\.7/.test(parti),
  );
}


// ── Finansieringsgapet: tre termer, en population ─────────────────────────
{
  // `financingGap` drar tre tal från varandra. Räknas de på olika populationer
  // blir gapet fel utan att någon enskild siffra ser konstig ut — och det var
  // precis vad som hände: finansieringen summerades rakt av medan kostnaderna
  // gruppdedupades. Centerpartiets skattefria grundlön är sex formuleringar av
  // samma reform, och partiets uppgift om 45 000 räknades sex gånger.
  const g = "g-fin";
  const data = [
    p("p-1", 1000, ["c"], g),
    p("p-2", 900, ["c"], g),
    p("p-3", 100, ["s"]),
  ] as unknown as PromisePost[];
  for (const x of data.slice(0, 2)) {
    (x as unknown as { financing_claimed: unknown }).financing_claimed = {
      described: true,
      summary: "Partiet uppger 500 miljoner kronor per år",
      msek: 500,
      period: "per_ar",
    };
  }
  (data[2] as unknown as { financing_claimed: unknown }).financing_claimed = {
    described: false,
    summary: null,
    msek: null,
  };

  check(
    "gruppens finansiering räknas en gång, inte en gång per medlem",
    totalFinancingClaimed(data) === 2000,
    `fick ${totalFinancingClaimed(data)}`,
  );
  check(
    "finansiering per år räknas upp till mandatperioden",
    financingClaimedMsek(data[0]!) === 2000,
    `fick ${financingClaimedMsek(data[0]!)}`,
  );

  const engang = p("p-4", 10, ["v"]) as unknown as PromisePost;
  (engang as unknown as { financing_claimed: unknown }).financing_claimed = {
    described: true,
    summary: "Engångsintäkt",
    msek: 300,
    period: "engang",
  };
  check("engångsfinansiering räknas en gång", financingClaimedMsek(engang) === 300);

  const draget = p("p-5", 10, ["v"], null, "tillbakadragen") as unknown as PromisePost;
  (draget as unknown as { financing_claimed: unknown }).financing_claimed = {
    described: true,
    summary: "x",
    msek: 999,
    period: "per_ar",
  };
  check(
    "tillbakadraget löftes finansiering räknas inte",
    totalFinancingClaimed([...data, draget]) === 2000,
    `fick ${totalFinancingClaimed([...data, draget])}`,
  );

  // Kärnan: de tre termerna i gapet ska vila på SAMMA population. Mot verkliga
  // datat betyder det att koalitionsvyn över alla åtta partier måste ge exakt
  // samma tal som startsidan — den räknade förut i en egen loop.
  const parties = getParties();
  const koalition = coalitionAggregates(alla, parties, parties.map((x) => x.code));
  for (const [namn, a, b] of [
    ["flasket", totalFlasket(alla), koalition.totalFlasket],
    ["besparingarna", totalBesparingar(alla), koalition.totalBesparingar],
    ["finansieringen", totalFinancingClaimed(alla), koalition.totalFinancingClaimed],
    ["gapet", financingGap(alla), koalition.financingGap],
  ] as [string, number, number][]) {
    check(
      `koalitionsvyn och startsidan räknar ${namn} lika`,
      Math.abs(a - b) < 1e-6,
      `${Math.round(a)} mot ${Math.round(b)}`,
    );
  }

  // Och i datat: ett belopp i finansieringsfältet utan beskriven finansiering
  // är motsägelsefullt. Tre löften bar en siffra ur sitt eget citat där.
  const osammanhangande = alla.filter(
    (x) => x.financing_claimed?.described === false && typeof x.financing_claimed.msek === "number",
  );
  check(
    "inget löfte bär ett finansieringsbelopp utan beskriven finansiering",
    osammanhangande.length === 0,
    osammanhangande.map((x) => x.id).join(" "),
  );
  const utanPeriod = alla.filter(
    (x) => typeof x.financing_claimed?.msek === "number" && !x.financing_claimed.period,
  );
  check(
    "varje finansieringsbelopp bär en period",
    utanPeriod.length === 0,
    utanPeriod.map((x) => x.id).join(" "),
  );
}

console.log(errors === 0 ? "grupplista: alla grindar gröna" : `grupplista: ${errors} grindar föll`);
if (errors > 0) process.exit(1);
