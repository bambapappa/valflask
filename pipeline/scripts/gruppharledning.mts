/**
 * Grupphärledningen över hela beståndet — löften och kopplingar.
 *
 *   pnpm gruppharledning                    # summering per kontroll
 *   pnpm gruppharledning -- --grupper       # varje grupp med sina medlemmar
 *   pnpm gruppharledning -- --domar         # domarna som fälls flera gånger
 *   pnpm gruppharledning -- --json fil.json # underlag för prövningar
 *
 * Frågan är inte «finns ett group_id» utan **vad gruppen gör med den siffra och
 * den dom läsaren ser**. Fläskvågen räknar gruppen en gång; Handlingsvågen
 * fäller en dom per löfte. Det är i skarven mellan de två som svaren går isär.
 *
 * **Verktyget avgör inget.** Att två citat lovar samma sak är en läsning, och
 * den gör en människa. Att flytta ett löfte in i eller ut ur en grupp ändrar
 * rikssumman och kräver rättelsenot.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  grupper,
  provaGruppen,
  totalForMandatperioden,
  domsdubbletter,
  type HarledningsLofte,
  type Partidom,
  type Gruppinvandning,
} from "../src/gruppharledning.ts";
import { findUngroupedTwins, type ScanPromise } from "../src/quality-scan.ts";

const rot = resolve(import.meta.dirname, "../..");
const loften: HarledningsLofte[] = JSON.parse(readFileSync(resolve(rot, "data/promises.json"), "utf8"));
const domar: Partidom[] =
  JSON.parse(readFileSync(resolve(rot, "handlingsvagen/data/domar.json"), "utf8")).partidomar ?? [];
const kopplingar: Array<{ id: string; promise_id?: string; status: string }> = JSON.parse(
  readFileSync(resolve(rot, "handlingsvagen/data/kopplingar.json"), "utf8"),
);

const argv = process.argv.slice(2);
const visaGrupper = argv.includes("--grupper");
const visaDomar = argv.includes("--domar");
const jsonUt = argv[argv.indexOf("--json") + 1];

const aktiva = loften.filter((p) => p.status === "aktiv");
const g = grupper(aktiva);
const dubbletter = domsdubbletter(domar, aktiva);
const tvillingar = findUngroupedTwins(loften as unknown as ScanPromise[]).filter((f) => f.score >= 0.25);

/** Invändningarna per löfte, så att en prövning kan skrivas ur dem. */
const perLofte = new Map<string, Gruppinvandning[]>();
const lagg = (id: string, i: Gruppinvandning) => perLofte.set(id, [...(perLofte.get(id) ?? []), i]);

for (const gr of g) {
  for (const i of provaGruppen(gr)) for (const m of gr.medlemmar) lagg(m.id, i);
}
for (const t of tvillingar) {
  lagg(t.id, {
    kontroll: "utanfor_en_grupp_som_passar",
    roll: "sakkunnig",
    invandning:
      "Löftet står utanför en grupp som beskriver samma politik. Räknas reformen två gånger?",
    matt: `Delar ${t.overlap.length} sakord med gruppen ${t.groupId} (${t.overlap.join(", ")}), poäng ${t.score}.`,
  });
}
for (const d of dubbletter) {
  for (const id of d.loften) {
    lagg(id, {
      kontroll: "domen_falls_flera_ganger",
      roll: "partiet",
      invandning:
        "Ni räknar vår reform en gång när ni prissätter den, och flera gånger när ni dömer oss. " +
        "Vilken av domarna gäller?",
      matt:
        `${d.parti} bär ${d.loften.length} avgjorda partidomar i gruppen ${d.group_id}: ` +
        `${d.loften.join(", ")}. Kostnadssidan räknar gruppen en gång.`,
    });
  }
}

/** Kopplingarna ärver sin grupps härledning genom löftet de påstår. */
const perKoppling = new Map<string, Gruppinvandning[]>();
for (const k of kopplingar) {
  if (k.status !== "aktiv" || k.promise_id === undefined) continue;
  const i = perLofte.get(k.promise_id);
  if (i !== undefined) perKoppling.set(k.id, i);
}

// ─────────────────────────────────────────────────────────────── utskrift ──

const aktivaKopplingar = kopplingar.filter((k) => k.status === "aktiv").length;
console.log(`\nGrupphärledningen över ${aktiva.length} löften och ${aktivaKopplingar} kopplingar.\n`);
console.log(`${g.length} grupper, ${g.reduce((s, x) => s + x.medlemmar.length, 0)} löften i grupp,`);
console.log(`${aktiva.length - g.reduce((s, x) => s + x.medlemmar.length, 0)} utan grupp.\n`);

const perKontroll = new Map<string, Set<string>>();
for (const [id, inv] of perLofte) {
  for (const i of inv) perKontroll.set(i.kontroll, (perKontroll.get(i.kontroll) ?? new Set()).add(id));
}
for (const [kontroll, idn] of [...perKontroll].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`${String(idn.size).padStart(4)} löften  ${kontroll}`);
}
console.log(`\n${perLofte.size} löften och ${perKoppling.size} kopplingar bär minst en invändning.`);
console.log(
  `${aktiva.length - perLofte.size} löften och ${aktivaKopplingar - perKoppling.size} kopplingar bär ingen.`,
);

if (visaGrupper) {
  console.log("\nGRUPPERNA, med den medlem som blir gruppens siffra:");
  for (const gr of [...g].sort((a, b) => b.publicerat - a.publicerat)) {
    const inv = provaGruppen(gr).map((i) => i.kontroll);
    console.log(`\n  ${gr.group_id}  →  ${gr.publicerat} mkr för mandatperioden${inv.length ? `  ⚑ ${inv.join(" ")}` : ""}`);
    for (const m of [...gr.medlemmar].sort((a, b) => totalForMandatperioden(b) - totalForMandatperioden(a))) {
      const mark = m.id === gr.representant.id ? " ← representant" : "";
      console.log(
        `      ${m.id} (${m.parties.join(",").padEnd(5)}) bas ${String(m.cost.msek_base).padStart(6)} ` +
          `${m.cost.period.padEnd(7)} total ${String(totalForMandatperioden(m)).padStart(6)}${mark}`,
      );
    }
  }
}

if (visaDomar) {
  console.log("\nDOMAR SOM FÄLLS FLERA GÅNGER FÖR SAMMA POLITIK:");
  for (const d of dubbletter) {
    console.log(`\n  ${d.group_id} / ${d.parti}: ${d.loften.length} avgjorda domar`);
    for (const id of d.loften) {
      const p = aktiva.find((x) => x.id === id);
      console.log(`      ${id}  ${(p?.title ?? "").slice(0, 66)}`);
    }
  }
}

console.log("\nIngen rad är ett fynd. Att två citat lovar samma sak är en läsning, inte en mätning.");

if (jsonUt !== undefined && !jsonUt.startsWith("--")) {
  writeFileSync(
    jsonUt,
    JSON.stringify(
      {
        loften: [...perLofte].map(([id, invandningar]) => ({ id, invandningar })),
        kopplingar: [...perKoppling].map(([id, invandningar]) => ({ id, invandningar })),
        grupper: g.map((gr) => ({
          group_id: gr.group_id,
          publicerat: gr.publicerat,
          representant: gr.representant.id,
          medlemmar: gr.medlemmar.map((m) => ({
            id: m.id,
            parties: m.parties,
            bas: m.cost.msek_base,
            period: m.cost.period,
            total: totalForMandatperioden(m),
          })),
        })),
        domsdubbletter: dubbletter,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`\nSkrivet: ${jsonUt}`);
}
