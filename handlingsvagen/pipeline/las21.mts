import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const rot = resolve(import.meta.dirname, "..");
const m = JSON.parse(readFileSync(process.argv[2]!, "utf8")) as any[];
const u = JSON.parse(readFileSync(process.argv[3]!, "utf8")) as any[];
const kop = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8")) as any[];
const h = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8")) as any[];
const pr = JSON.parse(readFileSync(resolve(rot, "../data/promises.json"), "utf8")) as any[];
const bara = process.argv.slice(4);
for (const r of u.filter((x) => x.atgard === "las-tabellen")) {
  if (bara.length && !bara.includes(r.koppling)) continue;
  const mm = m.find((x) => x.koppling === r.koppling)!;
  const k = kop.find((x) => x.id === r.koppling)!;
  const hh = h.find((x) => x.id === k.handling_id);
  const p = pr.find((x) => x.id === r.promise_id);
  console.log("\n" + "═".repeat(90));
  console.log(`${r.koppling}  ${r.promise_id}  [${(p?.parties ?? []).join(",")}]  ${r.utfall}  · ${hh?.dok_id} ${(hh?.titel ?? "").slice(0,45)}`);
  console.log(`  LÖFTE: ${p?.quote ?? ""}`);
  console.log(`  kostnad: ${p?.cost?.type} ${p?.cost?.msek_base} · ${(p?.cost?.calculation ?? "").slice(0, 220)}`);
  console.log(`  BEVIS: ${(k.bevis?.citat ?? "").slice(0, 300)}`);
  console.log(`  MOTIVERING: ${(k.method_note ?? "").slice(0, 250)}`);
  console.log(`  träffar: ${mm.traffar.map((t: any) => `${t.rad.anslag} ${t.rad.namn} ${t.rad.avvikelse} (${t.poang})`).join(" | ") || "—"}`);
  const rader: any[] = mm.rader ?? [];
  console.log(`  tabellen: ${mm.tabellrader} rader`);
}
