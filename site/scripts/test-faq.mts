/**
 * test-faq.mts — FAQ-sidorna för agenter: varje svar bär sitt belägg.
 *
 * FAQ-sidorna (/faq/<slug>/ + /api/v1/faq/<slug>.json) är byggda för att en
 * AI-agent ska kunna citera utlovat.se med källa och datum. Därmed är de också
 * en yta där en generator kan hitta på: ett svar utan arkivlänk, ett tal som
 * inte står i datat, en partiposition som inget citat bär. Den här grinden
 * vänder citatgrindarna mot den egna generatorn:
 *
 *   1. CITATEN STÅR I UNDERLAGET. Varje citat i ett FAQ-svar finns ordagrant
 *      i data/stances.json (delfrågor) eller data/promises.json
 *      (kostnadsfrågor) — riktiga filer, inte fixture.
 *   2. TALEN RÄKNAS FRAM. Svarets summor räknas om här med samma funktioner
 *      som partisidorna och jämförs med det som står i svaret.
 *   3. VARJE SVAR BÄR BELÄGG. Minst en källa med url OCH arkivlänk,
 *      updated_at (underlagets senaste datum, inte byggdag), licens,
 *      data_hash.
 *   4. BYGGD SAJT. Varje svar har en sida i dist/faq/ med FAQPage-markup
 *      med samma fråga, och ett JSON-svar i dist/api/v1/faq/ med samma
 *      data_hash som modulen ger.
 *   5. GRINDEN BITER. Hela sviten körs en gång till mot ett blänkt
 *      underlag (tomma datafiler, tomma dist-filer) och måste falla —
 *      samma krav som prosagrinden ställer om sina ankare.
 *
 * Determinism: faqFragor() anropas två gånger och resultaten måste vara
 * identiska — en generator som läcker in byggdagen i svaret ser inte likadan
 * ut mellan två körningar.
 *
 * Fallprov (provade mot införda fel, utskrifter i PR-texten):
 *   - `--fallprov-citat`: varje citat omskrivs en aning → check 1 faller
 *     (71 fel vid beviset).
 *   - Generatorn tappar arkivlänkarna (archive_url: null i delfrågornas
 *     källor) → check 3 faller (36 fel vid beviset).
 *   - Blänkt underlag → 0 svar, inbyggt i körningen nedan.
 *
 * Offline. Inget nät. Körs i sajtens teststil:
 *
 *   node --experimental-strip-types scripts/test-faq.mts
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { faqFragor, faqEfterSlug, blankaFaq, type FaqSvar } from "../src/lib/faq.ts";
import { getPromises, getParties, getChangelog } from "../src/lib/data.ts";
import { getIssuesFile, getStances } from "../src/lib/stances.ts";
import { partyTotalMsek, partyFinancingClaimedMsek, partyFinancingGapMsek } from "../src/lib/aggregates.ts";
import { formatMsek } from "../src/lib/calc.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROT = resolve(__dirname, "../..");
const DIST = resolve(ROT, "site/dist");

let fel = 0;
function check(etikett: string, villkor: boolean, varfor?: string): void {
  if (villkor) console.log(`  OK: ${etikett}`);
  else {
    console.error(`FAIL: ${etikett}${varfor ? ` — ${varfor}` : ""}`);
    fel++;
  }
}

const fallprovCitat = process.argv.includes("--fallprov-citat");

console.log("--- FAQ: urval och fält ---");

const svar = faqFragor();
check("minst 10 FAQ-frågor", svar.length >= 10, `fick ${svar.length}`);
const slugs = new Set(svar.map((s) => s.slug));
check("slugs unika", slugs.size === svar.length);

for (const s of svar) {
  check(`${s.slug}: slugform`, /^[a-z0-9-]+$/.test(s.slug), s.slug);
  check(`${s.slug}: fråga finns`, s.question.trim().length > 0);
  check(`${s.slug}: kort svar finns`, s.answer_short.trim().length > 0);
  check(`${s.slug}: updated_at är ett underlagsdatum`, /^\d{4}-\d{2}-\d{2}$/.test(s.updated_at), s.updated_at);
  check(`${s.slug}: licens CC-BY-4.0`, s.license === "CC-BY-4.0");
  check(`${s.slug}: data_hash är sha256`, /^[0-9a-f]{64}$/.test(s.data_hash));
  const medArkiv = s.sources.filter((k) => k.url.startsWith("http") && (k.archive_url ?? "").startsWith("http"));
  check(`${s.slug}: minst en källa med url och arkivlänk`, medArkiv.length >= 1,
    `${s.sources.length} källor, 0 med arkiv`);
}

console.log("\n--- Citaten står i underlaget (riktiga filer, inte fixture) ---");

const stancesRatext = readFileSync(resolve(ROT, "data/stances.json"), "utf8");
const promisesRatext = readFileSync(resolve(ROT, "data/promises.json"), "utf8");

for (const s of svar) {
  for (const k of s.sources) {
    if (k.quote === null) continue;
    let citat = k.quote;
    if (fallprovCitat && citat.length > 20) citat = citat.slice(0, 10) + " (omskrivet av fallprovet) " + citat.slice(-10);
    const finns = s.typ === "delfraga"
      ? stancesRatext.includes(JSON.stringify(citat).slice(1, -1))
      : promisesRatext.includes(JSON.stringify(citat).slice(1, -1));
    check(`${s.slug}: citatet står ordagrant i ${s.typ === "delfraga" ? "stances.json" : "promises.json"}`, finns,
      citat.slice(0, 50));
  }
}

console.log("\n--- Talen räknas fram ur samma data ---");

const promises = getPromises();
const parties = getParties();
const changelog = getChangelog();
const stances = getStances();
const issues = getIssuesFile().issues;

const senasteUnderlag = changelog
  .map((c) => (typeof c.timestamp === "string" ? c.timestamp.slice(0, 10) : ""))
  .filter(Boolean)
  .sort()
  .at(-1) ?? "";

for (const s of svar) {
  if (s.typ === "partikostnad") {
    const parti = parties.find((p) => p.code === (s.data as { parti_kod?: string }).parti_kod);
    assert.ok(parti, `parti saknas för ${s.slug}`);
    const total = partyTotalMsek(promises, parti.code);
    const fin = partyFinancingClaimedMsek(promises, parti.code);
    const gap = partyFinancingGapMsek(promises, parti.code);
    const d = s.data as { total_msek: number; finansiering_msek: number; gap_msek: number };
    check(`${s.slug}: totalen är partiets räkning`, d.total_msek === total, `${d.total_msek} != ${total}`);
    check(`${s.slug}: finansieringen är partiets räkning`, d.finansiering_msek === fin, `${d.finansiering_msek} != ${fin}`);
    check(`${s.slug}: gapet är partiets räkning`, d.gap_msek === gap, `${d.gap_msek} != ${gap}`);
    check(`${s.slug}: beloppet står i korta svaret`, s.answer_short.includes(formatMsek(total)));
    const antal = (s.data as { antal_loften: number }).antal_loften;
    check(`${s.slug}: antal löften står i korta svaret`, s.answer_short.includes(String(antal)));
  }
  if (s.typ === "delfraga") {
    const sqId = (s.data as { subquestion_id: string }).subquestion_id;
    const celler = stances.filter((c) => c.subquestion_id === sqId);
    const medBesked = celler.filter((c) => c.current.statement_id !== null);
    const d = s.data as { parti_besked: Array<{ parti_kod: string; position: string }> };
    check(`${s.slug}: partilistan täcker alla 8 partier`, d.parti_besked.length === parties.length);
    check(`${s.slug}: antal givna besked stämmer`, d.parti_besked.filter((pb) => pb.position !== "inget_tydligt_besked").length === medBesked.length,
      `${d.parti_besked.filter((pb) => pb.position !== "inget_tydligt_besked").length} != ${medBesked.length}`);
    for (const pb of d.parti_besked) {
      const cell = celler.find((c) => c.party === pb.parti_kod);
      check(`${s.slug}: ${pb.parti_kod} position ur datat`,
        pb.position === (cell?.current.position ?? "inget_tydligt_besked"));
    }
    // updated_at får inte vara äldre än underlagets senaste kontroll av cellerna
    const senastSokt = celler.map((c) => c.last_searched ?? "").sort().at(-1) ?? "";
    check(`${s.slug}: updated_at följer senaste sökningen`, s.updated_at >= senastSokt, `${s.updated_at} < ${senastSokt}`);
  }
  check(`${s.slug}: updated_at följer senaste ändringen i löftesunderlaget`, s.updated_at >= senasteUnderlag || s.typ === "delfraga",
    `${s.updated_at} < ${senasteUnderlag}`);
}

console.log("\n--- Tomma celler är ärliga ---");

for (const s of svar.filter((x) => x.typ === "delfraga")) {
  const d = s.data as { parti_besked: Array<{ parti_kod: string; position: string }> };
  const utan = d.parti_besked.filter((pb) => pb.position === "inget_tydligt_besked");
  if (utan.length > 0) {
    check(`${s.slug}: korta svaret säger att besked saknas`, /inget tydligt besked/i.test(s.answer_short));
  }
}

console.log("\n--- Determinism ---");

const svar2 = faqFragor();
check("faqFragor() ger identiskt svar vid två anrop", JSON.stringify(svar) === JSON.stringify(svar2));

console.log("\n--- Byggd sajt: sidor och JSON-svar ---");

if (!existsSync(resolve(DIST, "faq"))) {
  check("dist/faq finns (kör pnpm build först)", false);
} else {
  for (const s of svar) {
    const sida = resolve(DIST, `faq/${s.slug}/index.html`);
    if (!existsSync(sida)) {
      check(`dist/faq/${s.slug}/index.html finns`, false);
      continue;
    }
    const html = readFileSync(sida, "utf8");
    check(`faq/${s.slug}: FAQPage-markup`, html.includes('"@type": "FAQPage"') || html.includes('"@type":"FAQPage"'));
    const m = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g) ?? [];
    const faqPage = m.map((blk) => blk.replace(/<\/?script[^>]*>/g, "")).find((blk) => blk.includes("FAQPage"));
    check(`faq/${s.slug}: FAQPage bär frågan`, faqPage !== undefined && faqPage.includes(JSON.stringify(s.question).slice(1, -1).slice(0, 40)));
    check(`faq/${s.slug}: korta svaret syns på sidan`, html.includes(s.answer_short.slice(0, 40)));

    const jsonSokvag = resolve(DIST, `api/v1/faq/${s.slug}.json`);
    if (!existsSync(jsonSokvag)) {
      check(`dist/api/v1/faq/${s.slug}.json finns`, false);
      continue;
    }
    const js = JSON.parse(readFileSync(jsonSokvag, "utf8"));
    check(`api faq/${s.slug}: samma data_hash som modulen`, js.data_hash === s.data_hash, `${js.data_hash} != ${s.data_hash}`);
    check(`api faq/${s.slug}: licens och updated_at`, js.license === "CC-BY-4.0" && js.updated_at === s.updated_at);
  }
  const indexJson = resolve(DIST, "api/v1/faq.json");
  check("dist/api/v1/faq.json finns (index)", existsSync(indexJson));
  if (existsSync(indexJson)) {
    const ix = JSON.parse(readFileSync(indexJson, "utf8"));
    check("faq-index listar alla slugs", ix.faq.length === svar.length, `${ix.faq.length} != ${svar.length}`);
    check("faq-index länkar sida och api per fråga", ix.faq.every((f: { page_url?: string; api_url?: string }) => (f.page_url ?? "").startsWith("https://utlovat.se/faq/") && (f.api_url ?? "").startsWith("https://utlovat.se/api/v1/faq/")));
  }
}

console.log("\n--- Uppslagning ---");

const forsta = svar[0]!;
const uppslag = faqEfterSlug(forsta.slug);
check("faqEfterSlug hittar", uppslag !== undefined && uppslag.data_hash === forsta.data_hash && uppslag.question === forsta.question);
check("faqEfterSlug tackar nej till okänd slug", faqEfterSlug("finns-inte") === undefined);

console.log("\n--- Biter grinden? Hela sviten mot ett blänkt underlag ---");

blankaFaq(true);
const blankaSvar = faqFragor();
const blankaUppslag = faqEfterSlug(svar[0]!.slug);
blankaFaq(false);
check("blänkt underlag ger inga FAQ-svar", blankaSvar.length === 0, `fick ${blankaSvar.length}`);
check("blänkt underlag ger inget uppslag", blankaUppslag === undefined);

console.log(fel === 0 ? "\nFAQ-grinden: grön." : `\nFAQ-grinden: ${fel} fel.`);
process.exit(fel > 0 ? 1 : 0);
