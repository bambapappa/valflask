/** Fryst, privat prövat beslut för den äldre ankarskuldens tre utfall. */
import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { ankarbrott } from "./ankarkravet.ts";
import { provaRad, tillampa, type Ankarrad, type Lofte } from "./ankarpasset.ts";
import { skapaAnkarskuldpaket, lasAnkarskuldslage, skrivAnkarskuldpaket, type Ankarskuldpaket } from "./ankarskuldtransaktion.ts";
import { ordnaSakreferenser, sakmomentensBeredskap, SAKMOMENT, type Sakbedomning, type Sakmoment, type Sakreferens } from "./sakmoment.ts";
import { ORSAKKODER, type Orsakkod } from "./orsakkoder.ts";
import { computeDataHash, type PipelinePromise } from "./publish.ts";
import { totalFlasket } from "./chronicle.ts";
import { svenskDag } from "./dagen.ts";

export interface Ankarpassindata { rader: Ankarrad[]; material: Record<string, Sakreferens[]>; varfor: string; orsak: Orsakkod }
export interface Ankarpassprovning { id: string; underlagHash: string; referenser: Sakreferens[]; bedomare: string | null; bedomningar: Sakbedomning[] }
export interface Ankarpasspaket { version: "ankarpasspaket/1"; tidpunkt: string; indata: Ankarpassindata; provningar: Ankarpassprovning[]; filer: Ankarskuldpaket }
const digest = (v: unknown) => createHash("sha256").update(kanoniskJson(v)).digest("hex");
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const lista = (text: string | null | undefined, namn: string): unknown[] => {
  if (typeof text !== "string") throw new Error(`Fil saknas: ${namn}`);
  const v: unknown = JSON.parse(text);
  if (!Array.isArray(v)) throw new Error(`Kräver lista: ${namn}`);
  return v;
};
export const ankarpasspakethash = (p: Ankarpasspaket) => digest(p);

/** Förbered slutformen utan mänskliga bedömningar och utan skrivning. */
export function forberedAnkarpasspaket(indata: Ankarpassindata, lage: ReturnType<typeof lasAnkarskuldslage>, nu: Date): Ankarpasspaket {
  const ids = indata.rader.map((r) => r.id);
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Tom eller dubblerad ändringslista");
  if (!indata.varfor?.trim() || !ORSAKKODER.includes(indata.orsak)) throw new Error("Rättelsen kräver skäl och giltig orsak");
  if (Object.keys(indata.material).some((id) => !ids.includes(id))) throw new Error("Referenser för okänt mål");
  const loften = lista(lage.data["promises.json"], "promises.json") as Lofte[];
  const perId = new Map(loften.map((p) => [p.id, p]));
  if (perId.size !== loften.length) throw new Error("Dubblerade löftes-id");
  const facit = JSON.parse(lage.facit) as { ids: string[]; count: number; [k: string]: unknown };
  if (!Array.isArray(facit.ids) || facit.count !== facit.ids.length) throw new Error("Ankarfacit är ogiltigt");
  const brottFore = new Set(ankarbrott(loften));
  for (const rad of indata.rader) {
    if (!["ankare", "grupp", "egen"].includes(rad.utfall)) throw new Error(`Okänt utfall för ${rad.id}`);
    const prov = provaRad(rad, perId);
    if (!prov.ok || !brottFore.has(rad.id)) throw new Error([...prov.fel, ...(!brottFore.has(rad.id) ? [`${rad.id} finns inte i aktuell ankarskuld`] : [])].join("; "));
  }
  const datum = svenskDag(nu);
  const perRad = new Map(indata.rader.map((r) => [r.id, r]));
  const nya = loften.map((p) => {
    const rad = perRad.get(p.id);
    if (!rad) return p;
    const nytt = tillampa(p, rad);
    const gammalHistorik = Array.isArray(p.history) ? p.history : [];
    return { ...nytt, history: [...gammalHistorik, { date: datum, change: rad.skal, commit: "0000000" }] };
  });
  const brottEfter = new Set(ankarbrott(nya));
  if (ids.some((id) => brottEfter.has(id))) throw new Error("Ändringen lämnar målpost kvar i ankarskulden");
  if ([...brottEfter].some((id) => !brottFore.has(id))) throw new Error("Ändringen skapar ny ankarskuld");
  const facitEfter = { ...facit, ids: facit.ids.filter((id) => brottEfter.has(id)) };
  facitEfter.count = facitEfter.ids.length;
  const föreSumma = totalFlasket(loften as unknown as PipelinePromise[]);
  const efterSumma = totalFlasket(nya as unknown as PipelinePromise[]);
  const delta = efterSumma - föreSumma;
  const antal = (utfall: Ankarrad["utfall"]) => indata.rader.filter((r) => r.utfall === utfall).length;
  const rattelser = [...lista(lage.data["rattelser.json"], "rattelser.json"), {
    date: datum,
    affects: `Löftessidorna för ${[...ids].sort().join(", ")} — uträkningens grund`,
    what: `${ids.length} uträkningar har fått spårbar grund: ${antal("ankare")} ankare, ${antal("grupp")} grupper och ${antal("egen")} egna uträkningar. ` +
      `Beloppen på de berörda löftena är oförändrade. Rikssumman ändras med ${delta.toLocaleString("sv-SE")} miljoner kronor för mandatperioden när grupper räknas en gång. ` +
      indata.rader.map((r) => r.skal.replace(/\.?$/u, ".")).join(" "),
    why: indata.varfor, orsak: indata.orsak, commit: "0000000",
  }];
  const changelog = [...lista(lage.data["changelog.json"], "changelog.json"), {
    run_id: `ankarpasset-${datum}`, added: [], updated: ids, retracted: [],
    data_hash: computeDataHash(nya), timestamp: nu.toISOString(),
  }];
  const filer = skapaAnkarskuldpaket(lage.data, {
    "promises.json": json(nya), "rattelser.json": json(rattelser), "changelog.json": json(changelog),
  }, lage.facit, json(facitEfter), lage.partier);
  const provningar = indata.rader.map((rad) => {
    const referenser = ordnaSakreferenser(indata.material[rad.id] ?? []);
    const underlagHash = digest({ id: rad.id, rad, filerHash: filer.hash, referenser });
    return { id: rad.id, underlagHash, referenser, bedomare: null,
      bedomningar: (Object.keys(SAKMOMENT) as Sakmoment[]).map((moment) => ({ moment, utfall: "oavgjort" as const, motivering: "", belagg: [] })) };
  });
  return { version: "ankarpasspaket/1", tidpunkt: nu.toISOString(), indata: structuredClone(indata), provningar, filer };
}

/** Återskapa varje byte och kräv att alla privata sakmoment bär spårbara belägg. */
export function kontrolleraAnkarpasspaket(p: Ankarpasspaket, lage: ReturnType<typeof lasAnkarskuldslage>): void {
  const nytt = forberedAnkarpasspaket(p.indata, lage, new Date(p.tidpunkt));
  if (p.version !== "ankarpasspaket/1" || p.provningar.length !== nytt.provningar.length ||
      kanoniskJson({ ...p, provningar: nytt.provningar }) !== kanoniskJson(nytt)) {
    throw new Error("Ankarpasspaketets föreläge, slutform eller format har ändrats");
  }
  p.provningar.forEach((provning, i) => {
    const tom = nytt.provningar[i]!;
    if (provning.id !== tom.id || provning.underlagHash !== tom.underlagHash ||
        kanoniskJson(provning.referenser) !== kanoniskJson(tom.referenser) ||
        Object.keys(provning).sort().join() !== "bedomare,bedomningar,id,referenser,underlagHash") {
      throw new Error("Sakprövningen gäller ett annat underlag eller format");
    }
    const beredskap = sakmomentensBeredskap(provning.bedomare, provning.bedomningar, tom.referenser);
    if (!beredskap.klar) throw new Error(`Sakprövningen är inte klar för ${provning.id}: ${beredskap.hinder.join("; ")}`);
  });
}
export function verkstallAnkarpasspaket(dataDir: string, p: Ankarpasspaket, beslutetsHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutetsHash) || ankarpasspakethash(p) !== beslutetsHash) throw new Error("Beslutet gäller inte hela paketet");
  kontrolleraAnkarpasspaket(p, lasAnkarskuldslage(dataDir));
  skrivAnkarskuldpaket(dataDir, p.filer);
}
