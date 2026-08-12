/**
 * Uträkningen mot citatet, över hela beståndet.
 *
 *   pnpm utrakningen                      # summering per kontroll
 *   pnpm utrakningen -- --kontroll nollan_utan_skal
 *   pnpm utrakningen -- --id p-2026-0428  # en post, allt som mätts
 *   pnpm utrakningen -- --json fil.json   # underlag för prövningar
 *   pnpm utrakningen -- --ko              # mät granskningskön i stället
 *
 * Svepet ersätter ingen läsning. Det lägger fram vad som är mätt per post, så
 * att en prövning i filtret kan skrivas ur postens egna data i stället för ur
 * ett intryck av citatet — vilket är felet det finns för att hindra.
 *
 * **`--ko` mäter kön, och det är hela skälet till att flaggan finns.**
 * Godkännandet vägrar sedan 2026-08-07 släppa igenom en post utan aktuell
 * prövning, men mätningarna som en prövning skrivs ur lästes bara ur
 * `promises.json` — alltså först efter godkännandet. Ordningen gick inte ihop:
 * filtret ligger före beslutet, mätningen låg efter. Kontrollerna är rena
 * funktioner över löftesformen, så kö-posten läses i den form den kommer att
 * publiceras (samma fält som `review.ts` sätter) och mäts med exakt samma
 * kontroller. Id:t blir kö-nyckeln `ko:<review-id>`, den prövningen skrivs mot.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  provaUtrakningen,
  anmarkningar,
  type UtrakningsLofte,
  type Invandning,
} from "../src/utrakningen.ts";
import {
  statedBaseMsek,
  findAmountMismatches,
  findUngroupedTwins,
  findCompletedPolicyQuotes,
} from "../src/quality-scan.ts";
import { reviewNyckel } from "../src/provningar.ts";

const rot = resolve(import.meta.dirname, "../..");
const loften: UtrakningsLofte[] = JSON.parse(readFileSync(resolve(rot, "data/promises.json"), "utf8"));
const publicerade = loften.filter((p) => p.status === "aktiv");

const argv = process.argv.slice(2);
const arg = (namn: string): string | undefined => {
  const i = argv.indexOf(namn);
  return i === -1 ? undefined : argv[i + 1];
};
const baraKontroll = arg("--kontroll");
const baraId = arg("--id");
const jsonUt = arg("--json");
const koLage = argv.includes("--ko");

/**
 * Kö-posten läst i den form den kommer att publiceras.
 *
 * Speglar `kopost_som_lofte()` i `logg.py` och de fält `review.ts` faktiskt
 * sätter vid ett godkännande. Läses kö-posten i någon annan form mäter svepet
 * något annat än det som publiceras, och prövningen skriven ur mätningen blir
 * gammal i samma stund beslutet verkställs.
 */
function koSomLofte(item: {
  candidate?: Record<string, unknown> | null;
  articleUrl?: string | null;
  articleTitle?: string | null;
  cost?: UtrakningsLofte["cost"] | null;
}): UtrakningsLofte {
  const cand = (item.candidate ?? {}) as Record<string, unknown>;
  const title = (cand["title"] as string) ?? item.articleTitle ?? "Okänt löfte";
  return {
    id: reviewNyckel(item.articleUrl, title),
    title,
    quote: (cand["quote"] as string) ?? "",
    parties: (cand["parties"] as string[]) ?? [],
    category: (cand["category"] as string) ?? "övrigt",
    status: "aktiv",
    group_id: null,
    cost: (item.cost ?? {}) as UtrakningsLofte["cost"],
  };
}

const koposter: UtrakningsLofte[] = koLage
  ? (
      JSON.parse(readFileSync(resolve(rot, "data/needs_review.json"), "utf8")) as Parameters<
        typeof koSomLofte
      >[0][]
    )
      // En post utan kostnad kan inte publiceras och kan inte mätas mot sin egen
      // uträkning. Den ska synas som en lucka, inte tyst falla bort.
      .map(koSomLofte)
  : [];

// Kontrollerna som jämför poster mot varandra — dubbletter, tvillinggrupper —
// ska se HELA beståndet, annars kan en kö-post aldrig matcha ett publicerat
// löfte. Raderna filtreras efteråt till det som faktiskt mäts.
const bestand = koLage ? [...loften, ...koposter] : loften;
const aktiva = koLage ? koposter : publicerade;

interface Rad {
  id: string;
  parties: string[];
  title: string;
  quote: string;
  cost: UtrakningsLofte["cost"];
  /** Beloppet som uträkningen själv drar som slutsats, eller null. */
  angivet_belopp: number | null;
  group_id?: string | null;
  invandningar: Invandning[];
  anmarkningar: ReturnType<typeof anmarkningar>;
  /**
   * Utfallet ur `quality-scan`, per post. Svepen har hittills körts var för sig
   * och lästs som text, vilket gör att en prövning måste slå upp tre utskrifter
   * för en enda post. Här ligger de bredvid varandra.
   */
  kvalitetssok: {
    /** Beloppsfältet mot uträkningens egen slutsumma, när de går isär. */
    belopp_avviker?: { angivet: number; riktning: string; detalj: string };
    /** Grupp posten kan höra hemma i, med hur starkt ordöverlappet är. */
    grupp_kandidat?: { group_id: string; poang: number; delar: string[] };
    /** Citatet ser ut att beskriva genomförd politik utan åtagande framåt. */
    genomford_politik?: boolean;
  };
}

const avvikelser = new Map(findAmountMismatches(bestand).map((f) => [f.id, f]));
const tvillingar = new Map(
  findUngroupedTwins(bestand)
    .filter((f) => f.score >= 0.25)
    .map((f) => [f.id, f]),
);
const genomford = new Set(findCompletedPolicyQuotes(bestand).map((f) => f.id));

const rader: Rad[] = aktiva
  .filter((p) => baraId === undefined || p.id === baraId)
  .map((p) => ({
    id: p.id,
    parties: p.parties,
    title: p.title,
    quote: p.quote,
    cost: p.cost,
    angivet_belopp: statedBaseMsek(p.cost.calculation ?? ""),
    group_id: p.group_id ?? null,
    invandningar: provaUtrakningen(p),
    anmarkningar: anmarkningar(p),
    kvalitetssok: {
      ...(avvikelser.has(p.id)
        ? {
            belopp_avviker: {
              angivet: avvikelser.get(p.id)!.stated,
              riktning: avvikelser.get(p.id)!.direction,
              detalj: avvikelser.get(p.id)!.detail,
            },
          }
        : {}),
      ...(tvillingar.has(p.id)
        ? {
            grupp_kandidat: {
              group_id: tvillingar.get(p.id)!.groupId,
              poang: tvillingar.get(p.id)!.score,
              delar: tvillingar.get(p.id)!.overlap,
            },
          }
        : {}),
      ...(genomford.has(p.id) ? { genomford_politik: true } : {}),
    },
  }));

// ─────────────────────────────────────────────────────────────── utskrift ──

if (baraId !== undefined) {
  for (const r of rader) {
    console.log(`\n${r.id} (${r.parties.join(",")})  ${r.title}`);
    console.log(`  citat  ${r.quote.slice(0, 200)}`);
    console.log(
      `  belopp ${r.cost.msek_base} mkr ${r.cost.period}, typ ${r.cost.type ?? "?"}, ` +
        `basis ${r.cost.basis}, spann ${r.cost.msek_low ?? "?"}–${r.cost.msek_high ?? "?"}`,
    );
    console.log(`  uträkning\n    ${(r.cost.calculation ?? "").replace(/(.{88})/g, "$1\n    ")}`);
    if (r.invandningar.length === 0) {
      console.log("\n  Ingen kontroll gav en invändning. Det är ett mätt utfall, inte ett godkännande —");
      console.log("  citatet mot källan och arkivkopian prövas inte här.");
    }
    for (const i of r.invandningar) {
      console.log(`\n  ⚑ ${i.kontroll} (${i.roll})`);
      console.log(`    invändning: ${i.invandning}`);
      console.log(`    mätt:       ${i.matt}`);
    }
    for (const a of r.anmarkningar) console.log(`\n  · ${a.kontroll}: ${a.text}`);
  }
} else {
  const perKontroll = new Map<string, Rad[]>();
  for (const r of rader) {
    for (const i of r.invandningar) {
      if (baraKontroll !== undefined && i.kontroll !== baraKontroll) continue;
      perKontroll.set(i.kontroll, [...(perKontroll.get(i.kontroll) ?? []), r]);
    }
  }

  console.log(
    `\n${rader.length} ${koLage ? "kö-poster" : "aktiva löften"} prövade mot sin egen uträkning.\n`,
  );
  const utan = rader.filter((r) => r.invandningar.length === 0).length;
  console.log(`${utan} gav ingen invändning i någon kontroll.`);
  console.log(`${rader.length - utan} gav minst en.\n`);

  for (const [kontroll, poster] of [...perKontroll].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(poster.length).padStart(4)}  ${kontroll}`);
    if (baraKontroll !== undefined) {
      for (const p of poster) {
        console.log(`        ${p.id} (${p.parties.join(",")}) ${p.cost.msek_base} mkr — ${p.title.slice(0, 58)}`);
        for (const i of p.invandningar.filter((x) => x.kontroll === kontroll)) {
          console.log(`          mätt: ${i.matt}`);
        }
      }
    }
  }

  const rek = rader.filter((r) => r.anmarkningar.length > 0).length;
  console.log(`\n${rek} löften bär en uträkning som säger sig vara återskapad i efterhand.`);
  console.log("\nIngen av raderna är ett fynd. Varje post ska läsas innan något påstås om den.");
}

if (jsonUt !== undefined) {
  writeFileSync(jsonUt, JSON.stringify(rader, null, 1) + "\n");
  console.log(`\nSkrivet: ${jsonUt} (${rader.length} poster)`);
}
