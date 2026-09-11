import { createHash } from "node:crypto";
import { bindUnderlag, kanoniskJson, underlagsnyckel, type BundetUnderlag, type Underlagspost } from "./underlagsversion.ts";

import type { Publiceringssummor } from "./publiceringssummor.ts";
import type { Filjamforelse } from "./publiceringsfiler.ts";

export interface Publiceringsandring {
  rot: string;
  sort: "tillagd" | "borttagen" | "andrad";
  direkt: boolean;
  fore: BundetUnderlag | null;
  efter: BundetUnderlag | null;
}

/** Jämför lagrade sakunderlag. Paketet intygar varken sakriktighet eller godkännande. */
export function byggPubliceringspaket(foreRevision: string, efterRevision: string,
  fore: readonly Underlagspost[], efter: readonly Underlagspost[], filer: Filjamforelse | null = null,
  summor: { fore: Publiceringssummor; efter: Publiceringssummor } | null = null) {
  for (const revision of [foreRevision, efterRevision]) {
    if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Ange fullständiga commit-identiteter");
  }
  if (summor && (summor.fore.revision !== foreRevision || summor.efter.revision !== efterRevision)) {
    throw new Error("Summeringens revision skiljer sig från publiceringspaketet");
  }
  const indexera = (register: readonly Underlagspost[]) => {
    if (!register.length) throw new Error("Tomt underlagsregister");
    const index = new Map<string, Underlagspost>();
    for (const post of register) {
      const key = underlagsnyckel(post.slag, post.id);
      if (index.has(key)) throw new Error(`Dubblerad underlagsidentitet: ${key}`);
      if (!Object.keys(post.innehall).length) throw new Error(`Tomt underlag: ${key}`);
      kanoniskJson(post);
      index.set(key, post);
    }
    for (const post of register) for (const key of post.beroenden) {
      if (!index.has(key)) throw new Error(`Underlag eller beroende saknas: ${key}`);
    }
    return index;
  };
  const tidigare = indexera(fore), senare = indexera(efter);
  const innehall = (post: Underlagspost | undefined) => post ? kanoniskJson({
    ...post, beroenden: [...new Set(post.beroenden)].sort(),
  }) : null;
  const direkta = new Set([...tidigare.keys(), ...senare.keys()].filter((key) =>
    innehall(tidigare.get(key)) !== innehall(senare.get(key))));
  // Även tidigare beroenden behövs när ett ankare eller en gruppmedlem tas bort.
  const omvanda = new Map<string, Set<string>>();
  for (const post of [...fore, ...efter]) for (const dependency of post.beroenden) {
    if (!omvanda.has(dependency)) omvanda.set(dependency, new Set());
    omvanda.get(dependency)!.add(underlagsnyckel(post.slag, post.id));
  }
  const berorda = new Set(direkta);
  for (const key of berorda) for (const rot of omvanda.get(key) ?? []) berorda.add(rot);
  const andringar: Publiceringsandring[] = [...berorda].sort().map((rot) => ({
    rot,
    sort: !tidigare.has(rot) ? "tillagd" : !senare.has(rot) ? "borttagen" : "andrad",
    direkt: direkta.has(rot),
    fore: tidigare.has(rot) ? bindUnderlag(rot, fore) : null,
    efter: senare.has(rot) ? bindUnderlag(rot, efter) : null,
  }));
  const payload = { version: "publiceringspaket/2" as const, foreRevision, efterRevision,
    antalFore: fore.length, antalEfter: efter.length, andringar, filer, summor };
  return { ...payload, hash: createHash("sha256").update(kanoniskJson(payload)).digest("hex") };
}
