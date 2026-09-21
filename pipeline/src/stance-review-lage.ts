import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StanceReviewEntry } from "./stance-pipeline.ts";

/** Endast en saknad kö är tom. Ett befintligt trasigt underlag stoppar skörden. */
export function lasStanceReview(dir: string): StanceReviewEntry[] {
  const fil = join(dir, "stances_review.json");
  let text: string;
  try {
    if (!lstatSync(fil).isFile()) throw new Error("Ståndpunktskön är inte en vanlig fil");
    text = readFileSync(fil, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("Ståndpunktskön kan inte läsas som JSON"); }
  if (!Array.isArray(value) || value.some((e) => !e || typeof e.articleUrl !== "string" ||
      !e.articleUrl.trim() || !Array.isArray(e.failures) || e.candidate == null)) {
    throw new Error("Ståndpunktskön har ogiltigt format");
  }
  return value as StanceReviewEntry[];
}
