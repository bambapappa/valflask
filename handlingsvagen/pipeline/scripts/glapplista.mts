/**
 * Skriver ut läslistan över motiveringar som inte talar om sitt eget citat,
 * med allt en läsning behöver: löftet, citatet och motiveringen.
 *
 *   pnpm glapplista            # utslagsgivande först
 *   pnpm glapplista -- --max 20
 *
 * LÄSER BARA. Rättelsen görs med `pnpm motivering`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { laslistan, tackning } from "../src/motiveringsglappet.ts";
import type { KopplingPost } from "../src/granskning.ts";

const ROT = join(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const max = argv.includes("--max") ? Number(argv[argv.indexOf("--max") + 1]) : Infinity;
const hoppa = argv.includes("--hoppa") ? Number(argv[argv.indexOf("--hoppa") + 1]) : 0;

const K: KopplingPost[] = JSON.parse(readFileSync(join(ROT, "data/kopplingar.json"), "utf8"));
const H = new Map<string, Record<string, unknown>>(
  (JSON.parse(readFileSync(join(ROT, "data/handlingar.json"), "utf8")) as Record<string, unknown>[]).map((h) => [
    String(h["id"]),
    h,
  ]),
);
const P = new Map<string, Record<string, unknown>>(
  (JSON.parse(readFileSync(join(ROT, "../data/promises.json"), "utf8")) as Record<string, unknown>[]).map((p) => [
    String(p["id"]),
    p,
  ]),
);
const D = JSON.parse(readFileSync(join(ROT, "data/domar.json"), "utf8"));
const ut = new Set<string>();
for (const d of D.partidomar) {
  for (const i of d.i_linje) ut.add(i);
  for (const i of d.emot) ut.add(i);
}

const perId = new Map(K.map((k) => [k.id, k]));
const lista = laslistan(K)
  .map((id) => perId.get(id)!)
  .sort((a, b) => Number(ut.has(b.id)) - Number(ut.has(a.id)) || (tackning(a) ?? 0) - (tackning(b) ?? 0));

const n = (s: unknown) => String(s ?? "").replace(/\s+/gu, " ").trim();
console.log(`# ${lista.length} kopplingar på läslistan, ${lista.filter((k) => ut.has(k.id)).length} utslagsgivande\n`);
for (const k of lista.slice(hoppa, hoppa + max)) {
  const h = H.get(k.handling_id);
  const p = P.get(k.promise_id ?? "");
  console.log(`### ${k.id} ${ut.has(k.id) ? "✓utslag" : "·"} täck=${(tackning(k) ?? 0).toFixed(2)} ${k.riktning} [${((p?.["parties"] as string[]) ?? []).join("/")}] ${h?.["kind"]}/${k.motionstyp ?? "-"}`);
  console.log(`  LÖFTE: ${n(p?.["title"])}`);
  console.log(`     ${n(p?.["quote"]).slice(0, 200)}`);
  console.log(`  HANDLING: ${n(h?.["titel"]).slice(0, 90)}`);
  console.log(`  CITAT: ${n(k.bevis?.citat).slice(0, 260)}`);
  console.log(`  MOTIV: ${n(k.method_note).slice(0, 260)}\n`);
}
