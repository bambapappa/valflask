/**
 * Domsmotorn — helt deterministisk. Ingen språkmodell och ingen människa
 * skriver domar: de räknas fram ur godkända kopplingar och öppna data.
 *
 * Riktningssemantik för voteringar (fastställd här, testad nedan):
 * kopplingens riktning beskriver vad ett BIFALL (Ja) innebär för löftet.
 * "stodjer" = en Ja-röst stödjer löftet. Partiets/ledamotens faktiska
 * röst avgör sedan utfallet:
 *   Ja + stodjer → i linje      Ja + motverkar → emot
 *   Nej + stodjer → emot        Nej + motverkar → i linje
 *   Avstår → redovisas som avstår (varken eller)
 *   Frånvarande → räknas aldrig (beslut b-0004)
 */

import type { Handling } from "./handlingar.ts";
import type { RdVoteringRad } from "./riksdagen.ts";

export type Riktning = "stodjer" | "motverkar";

export interface Koppling {
  id: string;
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  riktning: Riktning;
  motionstyp?: "parti" | "kommitte" | "enskild";
  status: "aktiv" | "indragen";
}

export type DomStatus = "agerat_i_linje" | "agerat_emot" | "bade_och" | "ingen_handling_annu";

export interface PartiDom {
  target_id: string;
  party: string;
  status: DomStatus;
  /** Kopplingar som gav utslag i linje respektive emot — alltid redovisade. */
  i_linje: string[];
  emot: string[];
  avstod: string[];
}

export function targetId(k: Koppling): string {
  const t = k.promise_id ?? k.stance_id;
  if (!t) throw new Error(`koppling ${k.id} saknar promise_id/stance_id`);
  return t;
}

/** Partiets huvudlinje i en votering: majoritet av Ja/Nej/Avstår. Frånvaro räknas aldrig. */
export function partilinjeIVotering(
  ford: { ja: number; nej: number; avstar: number },
): "ja" | "nej" | "avstar" | null {
  const { ja, nej, avstar } = ford;
  if (ja === 0 && nej === 0 && avstar === 0) return null;
  if (ja > nej && ja > avstar) return "ja";
  if (nej > ja && nej > avstar) return "nej";
  if (avstar > ja && avstar > nej) return "avstar";
  return null; // oavgjort — inget utslag, hellre tomt än gissat
}

function rostUtslag(rost: "ja" | "nej" | "avstar", riktning: Riktning): "linje" | "emot" | "avstar" {
  if (rost === "avstar") return "avstar";
  const bifall = rost === "ja";
  const stodjer = riktning === "stodjer";
  return bifall === stodjer ? "linje" : "emot";
}

/**
 * Partidomar per (löfte/ståndpunkt, parti).
 *
 * Regler:
 * - Enskilda motioner binder inte partiet (b-0007) — de räknas bara i
 *   ledamotens meritlista.
 * - Interpellationer och skriftliga frågor är enskilda ledamöters
 *   verktyg — meritlista, aldrig partidom (b-0009).
 * - En votering ger utslag via partiets huvudlinje i rostfordelning.
 * - Motioner (parti/kommitté), propositioner: kopplingens riktning ger
 *   utslaget direkt — grind H3 har redan garanterat rätt aktör.
 */
export function computePartiDomar(
  kopplingar: Koppling[],
  handlingar: Handling[],
  targetParties: Record<string, string[]>,
): PartiDom[] {
  const hById = new Map(handlingar.map((h) => [h.id, h]));
  const perTarget = new Map<string, Koppling[]>();
  for (const k of kopplingar) {
    if (k.status !== "aktiv") continue;
    const t = targetId(k);
    perTarget.set(t, [...(perTarget.get(t) ?? []), k]);
  }

  const domar: PartiDom[] = [];
  for (const [target, parties] of Object.entries(targetParties)) {
    for (const party of parties) {
      const iLinje: string[] = [];
      const emot: string[] = [];
      const avstod: string[] = [];
      for (const k of perTarget.get(target) ?? []) {
        const h = hById.get(k.handling_id);
        if (!h) throw new Error(`koppling ${k.id} pekar på okänd handling ${k.handling_id}`);
        if (h.kind === "interpellation" || h.kind === "skriftlig_fraga") continue;
        if (h.kind === "motion" && k.motionstyp === "enskild") continue;
        if (h.kind === "votering") {
          const ford = h.rostfordelning?.[party];
          if (!ford) continue;
          const linje = partilinjeIVotering(ford);
          if (!linje) continue;
          const utslag = rostUtslag(linje, k.riktning);
          if (utslag === "linje") iLinje.push(k.id);
          else if (utslag === "emot") emot.push(k.id);
          else avstod.push(k.id);
        } else {
          // Tom partilista betyder att handlingen inte bär någon avsändare —
          // en proposition skrivs av ett departement, inte av ett parti. Utan
          // spärren nedan skulle en sådan handling tillgodoräknas SAMTLIGA
          // partier, eftersom nästa rad bara utesluter fel parti när listan är
          // ifylld. Inga sådana kopplingar finns i dag (aktörsgrinden fäller
          // dem), men spärren hör hemma här och inte bara i grinden: det som
          // avgör en dom ska stå i domsmotorn.
          if (h.parties.length === 0) continue;
          if (!h.parties.includes(party)) continue;
          if (k.riktning === "stodjer") iLinje.push(k.id);
          else emot.push(k.id);
        }
      }
      const status: DomStatus =
        iLinje.length > 0 && emot.length > 0
          ? "bade_och"
          : iLinje.length > 0
            ? "agerat_i_linje"
            : emot.length > 0
              ? "agerat_emot"
              : "ingen_handling_annu";
      domar.push({ target_id: target, party, status, i_linje: iLinje, emot, avstod });
    }
  }
  return domar.sort((a, b) => a.target_id.localeCompare(b.target_id) || a.party.localeCompare(b.party));
}

export interface LedamotMerit {
  target_id: string;
  intressent_id: string;
  namn: string;
  party: string;
  /** Utslag per koppling: votering via egen röst, dokument via författarskap. */
  i_linje: string[];
  emot: string[];
  avstod: string[];
  franvarande: string[];
}

/**
 * Ledamotsmeriter: den enskilda ledamotens röster i kopplade voteringar
 * (via roster per votering_id) plus egna dokument (motioner oavsett typ,
 * interpellationer, skriftliga frågor). Frånvaro redovisas separat och
 * fäller aldrig något utslag (b-0004).
 */
export function computeLedamotMeriter(
  kopplingar: Koppling[],
  handlingar: Handling[],
  roster: Map<string, RdVoteringRad[]>,
): LedamotMerit[] {
  const hById = new Map(handlingar.map((h) => [h.id, h]));
  const byLedamot = new Map<string, LedamotMerit>();
  const merit = (target: string, id: string, namn: string, party: string): LedamotMerit => {
    const key = `${target}::${id}`;
    let m = byLedamot.get(key);
    if (!m) {
      m = { target_id: target, intressent_id: id, namn, party, i_linje: [], emot: [], avstod: [], franvarande: [] };
      byLedamot.set(key, m);
    }
    return m;
  };

  for (const k of kopplingar) {
    if (k.status !== "aktiv") continue;
    const target = targetId(k);
    const h = hById.get(k.handling_id);
    if (!h) throw new Error(`koppling ${k.id} pekar på okänd handling ${k.handling_id}`);

    if (h.kind === "votering") {
      if (!h.votering_id) continue;
      for (const rad of roster.get(h.votering_id) ?? []) {
        if (rad.avser !== "sakfrågan") continue;
        const m = merit(target, rad.intressent_id, rad.namn, rad.parti);
        if (rad.rost === "Frånvarande") m.franvarande.push(k.id);
        else if (rad.rost === "Avstår") m.avstod.push(k.id);
        else {
          const utslag = rostUtslag(rad.rost === "Ja" ? "ja" : "nej", k.riktning);
          (utslag === "linje" ? m.i_linje : m.emot).push(k.id);
        }
      }
    } else {
      for (const p of h.persons) {
        const m = merit(target, p.riksdagen_id ?? p.name, p.name, p.party);
        (k.riktning === "stodjer" ? m.i_linje : m.emot).push(k.id);
      }
    }
  }
  return [...byLedamot.values()].sort(
    (a, b) => a.target_id.localeCompare(b.target_id) || a.namn.localeCompare(b.namn),
  );
}
