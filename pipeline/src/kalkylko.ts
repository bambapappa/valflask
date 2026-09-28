import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { lasFillage, skapaFilpaket, skrivFilpaket } from "./datatransaktion.ts";
export function kalkylPosthash(v: unknown): string { return createHash("sha256").update(kanoniskJson(v)).digest("hex"); }
export function lasKalkylko(dir: string): Record<string, unknown>[] {
  const text = lasFillage(dir, ["calculation_review.json"])["calculation_review.json"];
  const ko: unknown = text === null ? [] : JSON.parse(text!);
  if (!Array.isArray(ko) || ko.some((p) => !p || typeof p !== "object" || Array.isArray(p))) throw new Error("Ogiltig kalkylkö");
  return ko;
}
export function sammanfogaKalkylko(a: Record<string, unknown>[], b: Record<string, unknown>[]): Record<string, unknown>[] {
  const poster = new Map<string, Record<string, unknown>>();
  for (const p of [...a, ...b]) poster.set(kanoniskJson(p), p);
  return structuredClone([...poster.values()]);
}
export function sparaKalkylko(dir: string, forslag: Record<string, unknown>[]): void {
  const fore = lasFillage(dir, ["calculation_review.json"]);
  const gamla = fore["calculation_review.json"] === null ? [] : JSON.parse(fore["calculation_review.json"]!);
  if (!Array.isArray(gamla) || gamla.some((p) => !p || typeof p !== "object" || Array.isArray(p))) throw new Error("Ogiltig kalkylkö");
  const efter = { "calculation_review.json": JSON.stringify(sammanfogaKalkylko(gamla, forslag), null, 2) + "\n" };
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
}
