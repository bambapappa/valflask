/** Uppslaget varje «oklart»-anteckning ber om: vad partiet redan har publicerat. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { contentWords } from "../src/quality-scan.ts";
import { senaste, type Beslut } from "../src/reviewbeslut.ts";

const DATA = join(import.meta.dirname, "../../data");
const ko = JSON.parse(readFileSync(join(DATA, "needs_review.json"), "utf8")) as ReviewCandidate[];
const pr = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as any[];
const aktiva = pr.filter((p) => (p.status ?? "aktiv") === "aktiv");
const beslut = new Map(
  senaste(
    readFileSync("/Users/bambapappa/Dev/avgorandet/projekt/utlovat/avgorandet/beslut-review.jsonl", "utf8")
      .split("\n").filter((r) => r.trim()).map((r) => JSON.parse(r) as Beslut),
  ).map((b) => [b.id, b]),
);

const ordFor = (t: string) => new Set(contentWords(t).keys());
const publ = aktiva.map((p) => ({
  id: p.id, parti: (p.parties ?? [])[0] ?? "?", titel: p.title, citat: p.quote ?? "",
  bas: p.cost?.msek_base ?? null, period: p.cost?.period ?? null, grupp: p.group_id ?? null,
  ord: ordFor(`${p.title} ${p.quote ?? ""}`),
}));

const rader = ko.map((p) => {
  const id = reviewId(p);
  const parti = (p.candidate?.parties ?? [])[0] ?? "?";
  const ord = ordFor(`${p.candidate?.title ?? ""} ${p.candidate?.quote ?? ""}`);
  const poang = (a: Set<string>) => {
    const delade = [...ord].filter((w) => a.has(w)).length;
    return delade / Math.max(1, Math.min(ord.size, a.size));
  };
  const rank = publ
    .map((q) => ({ ...q, p: poang(q.ord) }))
    .filter((q) => q.p > 0.15)
    .sort((a, b) => b.p - a.p);
  const c = (p.cost ?? {}) as any;
  return {
    id, parti,
    titel: p.candidate?.title ?? "", citat: p.candidate?.quote ?? "",
    bas: c.msek_base ?? null, period: c.period ?? null, utr: c.calculation ?? "",
    not: beslut.get(id)?.not ?? "",
    egna: rank.filter((q) => q.parti === parti).slice(0, 3)
      .map((q) => ({ id: q.id, p: +q.p.toFixed(2), titel: q.titel, bas: q.bas, period: q.period, grupp: q.grupp, citat: q.citat })),
    andras: rank.filter((q) => q.parti !== parti).slice(0, 3)
      .map((q) => ({ id: q.id, parti: q.parti, p: +q.p.toFixed(2), titel: q.titel, bas: q.bas, period: q.period, grupp: q.grupp, citat: q.citat })),
  };
});
writeFileSync("/tmp/uppslag140.json", JSON.stringify(rader, null, 2));
const medEgen = rader.filter((r) => r.egna.length > 0).length;
const stark = rader.filter((r) => (r.egna[0]?.p ?? 0) >= 0.4).length;
console.log(`${rader.length} poster · ${medEgen} har en egen-parti-kandidat · ${stark} av dem över 0,40 i överlapp`);
console.log(`nollade ${rader.filter((r) => r.bas === 0).length} · utan belopp ${rader.filter((r) => r.bas === null).length} · med belopp ${rader.filter((r) => (r.bas ?? 0) > 0).length}`);
