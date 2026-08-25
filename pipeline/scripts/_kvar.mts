import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { konyckel, lasProvningar } from "../src/provningar.ts";
import { senaste, type Beslut } from "../src/reviewbeslut.ts";

const DATA = join(import.meta.dirname, "../../data");
const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as ReviewCandidate[];
const beslut = new Set(
  senaste(
    readFileSync("/Users/bambapappa/Dev/avgorandet/projekt/utlovat/avgorandet/beslut-review.jsonl", "utf8")
      .split("\n").filter((r) => r.trim()).map((r) => JSON.parse(r) as Beslut),
  ).map((b) => b.id),
);
const provningar = lasProvningar(DATA);
const kvar = ko.filter((p) => !beslut.has(reviewId(p)));

const perParti = new Map<string, number>();
const perUtfall = new Map<string, number>();
const rader: any[] = [];
for (const p of kvar) {
  const id = reviewId(p);
  const parti = (p.candidate?.parties ?? [])[0] ?? "?";
  perParti.set(parti, (perParti.get(parti) ?? 0) + 1);
  const t = [`ko:${id}`, konyckel(p.articleUrl, p.candidate?.quote ?? "")]
    .map((n) => provningar.get(n)).find((x) => x !== undefined);
  const u = t?.utfall ?? "OPRÖVAD";
  perUtfall.set(u, (perUtfall.get(u) ?? 0) + 1);
  const c = (p.cost ?? {}) as any;
  rader.push({ id, parti, titel: p.candidate?.title ?? "", citat: p.candidate?.quote ?? "",
    bas: c.msek_base ?? null, period: c.period ?? null, utfall: u,
    url: p.articleUrl, dubblettAv: (p as any).duplicateOf ?? null, utr: c.calculation ?? "" });
}
console.log(`${kvar.length} kö-poster utan beslut\n`);
console.log("per parti:", [...perParti].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join("  "));
console.log("per utfall:", [...perUtfall].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join("  "));
const utanBelopp = rader.filter((r) => r.bas === null).length;
const nollor = rader.filter((r) => r.bas === 0).length;
console.log(`utan belopp: ${utanBelopp}, nollade: ${nollor}, med belopp: ${rader.length - utanBelopp - nollor}`);
writeFileSync("/tmp/kvar140.json", JSON.stringify(rader, null, 2));
