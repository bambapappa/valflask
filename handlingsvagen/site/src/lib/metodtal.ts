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
import { getHandlingMap, getKopplingar, getLoften, getParties, getSoktaLoften, malId } from "./data.ts";

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
  /** Partikod → medianen egna (enskilda) motioner per ledamot. */
  motionerPerLedamot: Map<string, number>;
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
    motionerPerLedamot: motionerPerLedamot(),
  };
}

/**
 * Medianen egna förslag per riksdagsledamot, per parti.
 *
 * Metodsidan förklarar varför registret ser ojämnt fyllt ut, och ett av
 * skälen är att partierna motionerar olika mycket. Talen stod som fasta
 * siffror i texten ("ungefär 50" och "ungefär 15") på en sida där
 * grannmeningarna redan slogs upp — mätt 2026-08-09 var de 48 och 18. De
 * växer varje gång registret fylls på, så de slås upp de också.
 *
 * Median och inte medelvärde: en handfull mycket flitiga ledamöter drar
 * snittet, och meningen handlar om hur en vanlig ledamot arbetar. Enskilda
 * motioner räknas, för det är dem meningen kallar "egna förslag" — parti- och
 * kommittémotioner är gruppens.
 */
function motionerPerLedamot(): Map<string, number> {
  const antalPerLedamot = new Map<string, { parti: string; n: number }>();
  for (const h of getHandlingMap().values()) {
    if (h.kind !== "motion" || h.motionstyp !== "enskild") continue;
    for (const p of h.persons ?? []) {
      const nyckel = `${p.party}|${p.riksdagen_id ?? p.name}`;
      const post = antalPerLedamot.get(nyckel) ?? { parti: p.party, n: 0 };
      post.n += 1;
      antalPerLedamot.set(nyckel, post);
    }
  }
  const perParti = new Map<string, number[]>();
  for (const { parti, n } of antalPerLedamot.values()) {
    const lista = perParti.get(parti) ?? [];
    lista.push(n);
    perParti.set(parti, lista);
  }
  const median = new Map<string, number>();
  for (const [parti, lista] of perParti) {
    lista.sort((a, b) => a - b);
    median.set(parti, lista[Math.floor(lista.length / 2)] ?? 0);
  }
  return median;
}
