/**
 * Kompakt röstlagring (b-0012): ett personregister plus en röststräng per
 * votering. En röst är informationsmässigt ett tecken — J/N/A/F, eller "-"
 * för den som inte satt i kammaren vid voteringen. Ordningen ges av
 * riksmötesfilens personlista (sorterade intressent_id). Partibyten fångas
 * per votering i en avvikelselista, så avkodningen alltid ger partiet som
 * gällde vid rösttillfället.
 *
 * Formatet är förlustfritt relativt radnivån för fälten domsmotorn och
 * sajten använder; varje post bär voterings-id och är därmed klickbar hela
 * vägen till riksdagens egen post.
 */

import type { RdVoteringRad } from "./riksdagen.ts";

export interface Person {
  intressent_id: string;
  namn: string;
  parti: string;
  valkrets: string;
}

export interface RosterVotering {
  votering_id: string;
  beteckning: string;
  punkt: number;
  datum: string;
  /** Ett tecken per person i riksmötesfilens ordning: J/N/A/F/-. */
  roster: string;
  /** Index (som sträng) → parti, när radens parti avvek från registret. */
  avvikande_parti?: Record<string, string>;
}

export interface RmRoster {
  rm: string;
  /** intressent_id i fast, sorterad ordning — index är röststrängens position. */
  personer: string[];
  voteringar: RosterVotering[];
}

const ROST_TILL_TECKEN: Record<RdVoteringRad["rost"], string> = {
  Ja: "J",
  Nej: "N",
  "Avstår": "A",
  "Frånvarande": "F",
};

const TECKEN_TILL_ROST: Record<string, RdVoteringRad["rost"]> = {
  J: "Ja",
  N: "Nej",
  A: "Avstår",
  F: "Frånvarande",
};

/** Bygger en riksmötesfil inkrementellt, en votering i taget. */
export class RmRosterBygge {
  private readonly rm: string;
  private readonly personer = new Map<string, Person>();
  private readonly voteringar = new Map<
    string,
    { beteckning: string; punkt: number; datum: string; rost: Map<string, string>; parti: Map<string, string> }
  >();

  constructor(rm: string) {
    this.rm = rm;
  }

  /** Lägger till radnivårösterna för EN votering (sakfrågan föredras, som i normaliseraVotering). */
  laggTillVotering(rader: RdVoteringRad[]): void {
    const first = rader[0];
    if (!first) return;
    const sak = rader.filter((r) => r.votering_id === first.votering_id && r.avser === "sakfrågan");
    const rows = sak.length > 0 ? sak : rader.filter((r) => r.votering_id === first.votering_id);
    const post = {
      beteckning: first.beteckning,
      punkt: first.punkt,
      datum: first.datum ?? "",
      rost: new Map<string, string>(),
      parti: new Map<string, string>(),
    };
    for (const r of rows) {
      if (!r.intressent_id || post.rost.has(r.intressent_id)) continue;
      post.rost.set(r.intressent_id, ROST_TILL_TECKEN[r.rost] ?? "-");
      post.parti.set(r.intressent_id, r.parti);
      const known = this.personer.get(r.intressent_id);
      if (!known) {
        this.personer.set(r.intressent_id, {
          intressent_id: r.intressent_id,
          namn: r.namn,
          parti: r.parti,
          valkrets: r.valkrets,
        });
      } else {
        known.parti = r.parti; // registret bär senast sedda parti; avvikelser fångas per votering
      }
    }
    this.voteringar.set(first.votering_id, post);
  }

  /** Färdigställer riksmötesfilen + personposterna (för registermerge). */
  bygg(): { roster: RmRoster; personer: Person[] } {
    const ordning = [...this.personer.keys()].sort();
    const index = new Map(ordning.map((id, i) => [id, i]));
    const voteringar: RosterVotering[] = [...this.voteringar.entries()]
      .map(([votering_id, v]) => {
        const tecken = ordning.map((id) => v.rost.get(id) ?? "-");
        const avvikande: Record<string, string> = {};
        for (const [id, parti] of v.parti) {
          if (parti !== this.personer.get(id)!.parti) avvikande[String(index.get(id)!)] = parti;
        }
        return {
          votering_id,
          beteckning: v.beteckning,
          punkt: v.punkt,
          datum: v.datum,
          roster: tecken.join(""),
          ...(Object.keys(avvikande).length > 0 ? { avvikande_parti: avvikande } : {}),
        };
      })
      .sort(
        (a, b) =>
          a.datum.localeCompare(b.datum) ||
          a.beteckning.localeCompare(b.beteckning) ||
          a.punkt - b.punkt ||
          a.votering_id.localeCompare(b.votering_id),
      );
    return {
      roster: { rm: this.rm, personer: ordning, voteringar },
      personer: [...this.personer.values()].sort((a, b) => a.intressent_id.localeCompare(b.intressent_id)),
    };
  }
}

/**
 * Idempotent registermerge: nya personer läggs till, kända uppdateras med
 * senast sedda uppgifter. Sorterat på intressent_id — stabila diffar.
 */
export function mergePersoner(existing: Person[], incoming: Person[]): Person[] {
  const byId = new Map(existing.map((p) => [p.intressent_id, p]));
  for (const p of incoming) byId.set(p.intressent_id, p);
  return [...byId.values()].sort((a, b) => a.intressent_id.localeCompare(b.intressent_id));
}

/**
 * Avkodar en riksmötesfil till radnivå för domsmotorn
 * (computeLedamotMeriter). "-" ger ingen rad — personen satt inte i
 * kammaren. Parti tas ur avvikelselistan när den finns, annars registret.
 */
export function avkodaRoster(fil: RmRoster, register: Person[]): Map<string, RdVoteringRad[]> {
  const personAvId = new Map(register.map((p) => [p.intressent_id, p]));
  const ut = new Map<string, RdVoteringRad[]>();
  for (const v of fil.voteringar) {
    if (v.roster.length !== fil.personer.length) {
      throw new Error(`votering ${v.votering_id}: röststräng ${v.roster.length} tecken, ${fil.personer.length} personer`);
    }
    const rader: RdVoteringRad[] = [];
    for (let i = 0; i < fil.personer.length; i += 1) {
      const tecken = v.roster[i]!;
      if (tecken === "-") continue;
      const rost = TECKEN_TILL_ROST[tecken];
      if (!rost) throw new Error(`votering ${v.votering_id}: okänt rösttecken "${tecken}"`);
      const id = fil.personer[i]!;
      const person = personAvId.get(id);
      if (!person) throw new Error(`votering ${v.votering_id}: ${id} saknas i personregistret`);
      rader.push({
        votering_id: v.votering_id,
        rm: fil.rm,
        beteckning: v.beteckning,
        punkt: v.punkt,
        namn: person.namn,
        intressent_id: id,
        parti: v.avvikande_parti?.[String(i)] ?? person.parti,
        valkrets: person.valkrets,
        rost,
        avser: "sakfrågan",
        ...(v.datum ? { datum: v.datum } : {}),
      });
    }
    ut.set(v.votering_id, rader);
  }
  return ut;
}

/** Filnamn för ett riksmöte: "2022/23" → "2022-23.json". */
export function rmFilnamn(rm: string): string {
  return `${rm.replace("/", "-")}.json`;
}
