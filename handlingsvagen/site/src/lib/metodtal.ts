/**
 * Talen metodsidan påstår något om — räknade ur datat vid varje bygge.
 *
 * Metodsidan beskriver hur ojämnt registret är fyllt, och hur många löften
 * sökningen ännu inte hittat en enda handling att pröva mot. Det är påståenden
 * om vårt data, inte om metoden, och de ändras varje gång kön betas av. Stod de
 * som siffror i texten blev de tysta osanningar: i augusti 2026 stod det "155
 * kopplingar" för Miljöpartiet när talet redan passerat 200, och "79 av 467"
 * när löftena var över femhundra. Samma regel gäller därför här som för
 * krönikorna: texten är statisk, talen slås upp.
 */
import { getKopplingar, getLoften, getParties, getSoktaLoften, malId } from "./data.ts";

export interface PartiTal {
  kod: string;
  namn: string;
  /** Aktiva kopplingar på partiets EGNA löften. */
  kopplingar: number;
  /** Partiets löften som ännu inte fått en enda handling prövad mot sig. */
  oprovade: number;
  loften: number;
}

export interface MetodTal {
  /** Partierna sorterade på antal kopplingar, flest först. */
  partier: PartiTal[];
  /** Löften utan en enda prövad handling, och hur många löften vi följer. */
  oprovade: number;
  loften: number;
  /** Andelen oprövade löften i hela procent. */
  oprovadeProcent: number;
}

export function metodTal(): MetodTal {
  const loften = getLoften();
  const sokta = getSoktaLoften();
  const kopplingarPerParti = new Map<string, number>();
  const oprovadePerParti = new Map<string, number>();
  const loftenPerParti = new Map<string, number>();

  const lofteById = new Map(loften.map((l) => [l.id, l]));
  for (const k of getKopplingar()) {
    if (k.status !== "aktiv") continue;
    const lof = lofteById.get(malId(k));
    if (!lof) continue;
    for (const p of lof.parties) kopplingarPerParti.set(p, (kopplingarPerParti.get(p) ?? 0) + 1);
  }
  for (const l of loften) {
    for (const p of l.parties) {
      loftenPerParti.set(p, (loftenPerParti.get(p) ?? 0) + 1);
      if (!sokta.has(l.id)) oprovadePerParti.set(p, (oprovadePerParti.get(p) ?? 0) + 1);
    }
  }

  const partier = getParties()
    .map((p) => ({
      kod: p.code,
      namn: p.namn,
      kopplingar: kopplingarPerParti.get(p.code) ?? 0,
      oprovade: oprovadePerParti.get(p.code) ?? 0,
      loften: loftenPerParti.get(p.code) ?? 0,
    }))
    .sort((a, b) => b.kopplingar - a.kopplingar || a.kod.localeCompare(b.kod, "sv"));

  const oprovade = loften.filter((l) => !sokta.has(l.id)).length;
  return {
    partier,
    oprovade,
    loften: loften.length,
    oprovadeProcent: loften.length === 0 ? 0 : Math.round((oprovade / loften.length) * 100),
  };
}
