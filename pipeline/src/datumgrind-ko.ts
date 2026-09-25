import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "./datatransaktion.ts";

export function lasDatumgrindKo(dir: string): Fillage {
  const fore = lasFillage(dir, ["needs_review.json"]);
  if (fore["needs_review.json"] === null) throw new Error("Löfteskön saknas");
  return fore;
}

/** Nätverkshämtningen får inte ersätta ett beslut som kom in under tiden. */
export function skrivDatumgrindKo(dir: string, fore: Fillage, poster: unknown): void {
  const efter = { ...fore, "needs_review.json": JSON.stringify(poster, null, 2) + "\n" };
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
}
