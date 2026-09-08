import { createHash } from "node:crypto";

export type Underlagsslag = "lofte" | "koppling" | "standpunkt" | "handling";
export interface Underlagspost {
  slag: Underlagsslag;
  id: string;
  innehall: Record<string, unknown>;
  beroenden: string[];
}
export interface BundetUnderlag {
  version: "underlag/1";
  rot: string;
  poster: Underlagspost[];
  hash: string;
}

/** Nyckelordning påverkar inte versionen; innehåll och listordning gör det. */
export function kanoniskJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(kanoniskJson).join(",")}]`;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${kanoniskJson(obj[k])}`).join(",")}}`;
  }
  throw new Error("Underlaget måste vara fullständigt JSON, utan odefinierade värden");
}

export function underlagsnyckel(slag: Underlagsslag, id: string): string {
  if (!id.trim()) throw new Error("Underlagsposten saknar identitet");
  return `${slag}:${id}`;
}

/** Beroendegrafen lagras i paketet; ett oförändrat ID skyddar inte ändrat innehåll. */
export function bindUnderlag(rot: string, register: readonly Underlagspost[]): BundetUnderlag {
  const index = new Map<string, Underlagspost>();
  for (const post of register) {
    const key = underlagsnyckel(post.slag, post.id);
    if (index.has(key)) throw new Error(`Dubblerad underlagsidentitet: ${key}`);
    if (Object.keys(post.innehall).length === 0) throw new Error(`Tomt underlag: ${key}`);
    index.set(key, post);
  }
  const besokta = new Set<string>();
  const poster: Underlagspost[] = [];
  const besok = (key: string): void => {
    if (besokta.has(key)) return;
    const post = index.get(key);
    if (!post) throw new Error(`Underlag eller beroende saknas: ${key}`);
    besokta.add(key);
    const beroenden = [...new Set(post.beroenden)].sort();
    poster.push({ ...post, innehall: structuredClone(post.innehall), beroenden });
    for (const dependency of beroenden) besok(dependency);
  };
  besok(rot);
  poster.sort((a, b) => {
    const ka = underlagsnyckel(a.slag, a.id), kb = underlagsnyckel(b.slag, b.id);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const payload = { version: "underlag/1" as const, rot, poster };
  const hash = createHash("sha256").update(kanoniskJson(payload)).digest("hex");
  return { ...payload, hash };
}

/** Ett paket är ett underlag, inte ett bevis för ett mänskligt godkännande. */
export function sammaUnderlag(godkant: BundetUnderlag, aktuellt: BundetUnderlag): boolean {
  const original = bindUnderlag(godkant.rot, godkant.poster);
  const nu = bindUnderlag(aktuellt.rot, aktuellt.poster);
  return godkant.version === "underlag/1" && aktuellt.version === "underlag/1" &&
    kanoniskJson(original) === kanoniskJson(godkant) &&
    kanoniskJson(nu) === kanoniskJson(aktuellt) && original.hash === nu.hash;
}
