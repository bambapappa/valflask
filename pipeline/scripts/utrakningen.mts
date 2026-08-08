/**
 * Uträkningen mot citatet, över hela beståndet.
 *
 *   pnpm utrakningen                      # summering per kontroll
 *   pnpm utrakningen -- --kontroll nollan_utan_skal
 *   pnpm utrakningen -- --id p-2026-0428  # en post, allt som mätts
 *   pnpm utrakningen -- --json fil.json   # underlag för prövningar
 *
 * Svepet ersätter ingen läsning. Det lägger fram vad som är mätt per post, så
 * att en prövning i filtret kan skrivas ur postens egna data i stället för ur
 * ett intryck av citatet — vilket är felet det finns för att hindra.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  provaUtrakningen,
  anmarkningar,
  type UtrakningsLofte,
  type Invandning,
} from "../src/utrakningen.ts";
import { statedBaseMsek } from "../src/quality-scan.ts";

const rot = resolve(import.meta.dirname, "../..");
const loften: UtrakningsLofte[] = JSON.parse(readFileSync(resolve(rot, "data/promises.json"), "utf8"));
const aktiva = loften.filter((p) => p.status === "aktiv");

const argv = process.argv.slice(2);
const arg = (namn: string): string | undefined => {
  const i = argv.indexOf(namn);
  return i === -1 ? undefined : argv[i + 1];
};
const baraKontroll = arg("--kontroll");
const baraId = arg("--id");
const jsonUt = arg("--json");

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
}

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

  console.log(`\n${rader.length} aktiva löften prövade mot sin egen uträkning.\n`);
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
