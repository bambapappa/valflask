import { kanoniskJson, type BundetUnderlag, type Underlagspost } from "./underlagsversion.ts";
import { kontrolleraPubliceringspaket, type byggPubliceringspaket } from "./publiceringspaket.ts";

type Paket = ReturnType<typeof byggPubliceringspaket>;
type Snapshot = Omit<BundetUnderlag, "poster"> & { poster: number[] };
type Lagring = {
  format: "publiceringslagring/1";
  poster: Underlagspost[];
  paket: Omit<Paket, "andringar"> & {
    andringar: (Omit<Paket["andringar"][number], "fore" | "efter"> & {
      fore: Snapshot | null; efter: Snapshot | null;
    })[];
  };
};
const MAX_BYTE = 64 * 1024 * 1024;

/** Lagra identiska postversioner en gång; sakpaketets innehåll och hash består. */
export function packaPubliceringspaket(paket: Paket): Lagring {
  kontrolleraPubliceringspaket(paket);
  const poster: Underlagspost[] = [];
  const index = new Map<string, number>();
  const snapshot = (s: BundetUnderlag | null): Snapshot | null => s === null ? null : {
    ...s, poster: s.poster.map((p) => {
      const key = kanoniskJson(p);
      let ref = index.get(key);
      if (ref === undefined) {
        ref = poster.length;
        index.set(key, ref);
        poster.push(structuredClone(p));
      }
      return ref;
    }),
  };
  return { format: "publiceringslagring/1", poster, paket: {
    ...paket, andringar: paket.andringar.map((a) => ({ ...a,
      fore: snapshot(a.fore), efter: snapshot(a.efter) })),
  } };
}

/** Återskapa alla ordnade snapshots innan befintlig hashkontroll tillämpas. */
export function packaUppPubliceringspaket(value: unknown): Paket {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Ogiltig publiceringslagring");
  const input = value as Record<string, unknown>;
  if (input.format === undefined) {
    kontrolleraPubliceringspaket(value as Paket);
    return value as Paket;
  }
  if (input.format !== "publiceringslagring/1" ||
      Object.keys(input).sort().join(",") !== "format,paket,poster" ||
      !Array.isArray(input.poster) || input.poster.length > 100_000 ||
      !input.paket || typeof input.paket !== "object" || Array.isArray(input.paket)) {
    throw new Error("Ogiltig publiceringslagring");
  }
  const lagring = value as Lagring;
  if (!Array.isArray(lagring.paket.andringar) || lagring.paket.andringar.length > 100_000) {
    throw new Error("Ogiltig publiceringslagring");
  }
  const storlek = lagring.poster.map((p) => Buffer.byteLength(kanoniskJson(p)));
  let byte = Buffer.byteLength(kanoniskJson(lagring.paket));
  const snapshot = (s: Snapshot | null): BundetUnderlag | null => {
    if (s === null) return null;
    if (!s || typeof s !== "object" || !Array.isArray(s.poster)) throw new Error("Ogiltig posthänvisning");
    return { ...s, poster: s.poster.map((ref) => {
      if (!Number.isSafeInteger(ref) || ref < 0 || ref >= lagring.poster.length) throw new Error("Ogiltig posthänvisning");
      byte += storlek[ref]!;
      if (byte > MAX_BYTE) throw new Error("För stort återställt publiceringsunderlag");
      return structuredClone(lagring.poster[ref]!);
    }) };
  };
  const paket = { ...lagring.paket, andringar: lagring.paket.andringar.map((a) => ({
    ...a, fore: snapshot(a.fore), efter: snapshot(a.efter),
  })) };
  kontrolleraPubliceringspaket(paket);
  return paket;
}
