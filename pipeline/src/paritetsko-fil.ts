import { lasFillage, skapaFilpaket, skrivFilpaket, type Fillage } from "./datatransaktion.ts";

const FILER = ["paritetskon.json", "promises.json"] as const;

/** Bind svepets resultat till både den lästa kön och löftesbeståndet. */
export function lasParitetsunderlag(dir: string): Fillage {
  return lasFillage(dir, FILER);
}

export function skrivParitetsko(dir: string, fore: Fillage, ko: unknown): void {
  if (fore["promises.json"] === null || fore["promises.json"] === undefined) {
    throw new Error("Löftesbeståndet saknas");
  }
  const efter = { ...fore, "paritetskon.json": JSON.stringify(ko, null, 2) + "\n" };
  skrivFilpaket(dir, skapaFilpaket(fore, efter));
}
