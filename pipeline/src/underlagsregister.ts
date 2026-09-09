import { underlagsnyckel, type Underlagspost, type Underlagsslag } from "./underlagsversion.ts";

type Rad = Record<string, unknown>;
export interface PubliceratUnderlag {
  loften: Rad[];
  kopplingar: Rad[];
  handlingar: Rad[];
  standpunkter: Rad[];
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Saknar ${field}`);
  return value;
}

/** Hela lagrade posten binds; inga nya fält kan falla bort ur en gammal fältlista. */
export function byggUnderlagsregister(data: PubliceratUnderlag): Underlagspost[] {
  const result: Underlagspost[] = [];
  const ids = new Set<string>();
  const add = (slag: Underlagsslag, id: string, innehall: Rad, beroenden: string[]) => {
    const key = underlagsnyckel(slag, id);
    if (ids.has(key)) throw new Error(`Dubblerad underlagsidentitet: ${key}`);
    ids.add(key);
    result.push({ slag, id, innehall, beroenden });
  };
  const grupper = new Map<string, string[]>();
  for (const p of data.loften) {
    if (p.group_id && p.status !== "tillbakadragen") {
      const group = text(p.group_id, "gruppidentitet");
      grupper.set(group, [...(grupper.get(group) ?? []), text(p.id, "löftesidentitet")]);
    }
  }
  for (const p of data.loften) {
    const id = text(p.id, "löftesidentitet");
    text(p.quote, `citat för ${id}`);
    if (!p.cost || typeof p.cost !== "object") throw new Error(`Saknar kalkyl för ${id}`);
    const c = p.cost as Rad;
    const anchors = c.anchor_ids ?? [];
    if (!Array.isArray(anchors)) throw new Error(`Ogiltig ankarlista för ${id}`);
    const beroenden = anchors.map((a) => underlagsnyckel("lofte", text(a, "kalkylankare")));
    if (p.group_id && p.status !== "tillbakadragen") {
      for (const member of grupper.get(String(p.group_id)) ?? []) {
        if (member !== id) beroenden.push(underlagsnyckel("lofte", member));
      }
    }
    add("lofte", id, p, beroenden);
  }
  for (const h of data.handlingar) add("handling", text(h.id, "handlingsidentitet"), h, []);
  for (const s of data.standpunkter) {
    const id = `${text(s.subquestion_id, "delfråga")}::${text(s.party, "parti")}`;
    add("standpunkt", id, s, []);
  }
  for (const k of data.kopplingar) {
    const id = text(k.id, "kopplingsidentitet");
    const targets = [k.promise_id, k.stance_id].filter((v) => v !== null && v !== undefined);
    if (targets.length !== 1) throw new Error(`Kopplingen ${id} behöver exakt ett mål`);
    const slag = k.promise_id !== null && k.promise_id !== undefined ? "lofte" : "standpunkt";
    const target = text(targets[0], "kopplingsmål");
    add("koppling", id, k, [
      underlagsnyckel(slag, target),
      underlagsnyckel("handling", text(k.handling_id, "handling")),
    ]);
  }
  return result;
}
