/**
 * Läser in domsmotorns indata från disk och räknar fram partidomar och
 * ledamotsmeriter. Ligger skilt från `scripts/domar.mts` för att BÅDE
 * skrivvägen och kontrollen ska gå genom exakt samma kod: skriptet skriver
 * `data/domar.json`, testet räknar om och jämför med den incheckade filen.
 *
 * Utan den delningen står regeln på två ställen, och då är den en regel man
 * ändrar två gånger — eller glömmer att ändra på det ena stället.
 *
 * Ingen logik bor här: själva domsmotorn ligger i `domar.ts` och rörs inte.
 * Det här är inläsningen runt den.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "./handlingar.ts";
import type { RdVoteringRad } from "./riksdagen.ts";
import {
  computeLedamotMeriter,
  computePartiDomar,
  targetId,
  type Koppling,
} from "./domar.ts";
import { avkodaRoster, type Person, type RmRoster } from "./roster.ts";

export interface DomarInnehall {
  partidomar: ReturnType<typeof computePartiDomar>;
  ledamotsmeriter: ReturnType<typeof computeLedamotMeriter>;
}

/**
 * @param rot     Handlingsvågens rot (katalogen som rymmer `data/`).
 * @param promisesPath  Sökväg till valflasks `data/promises.json`.
 */
export function beraknaDomar(rot: string, promisesPath: string): DomarInnehall {
  const kopplingar: Koppling[] = JSON.parse(
    readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"),
  );
  const handlingar: Handling[] = JSON.parse(
    readFileSync(resolve(rot, "data/handlingar.json"), "utf8"),
  );
  const promises: Array<{ id: string; parties: string[]; status?: string }> =
    JSON.parse(readFileSync(promisesPath, "utf8"));

  // Rutnätet visar alla åtta riksdagspartier per mål. Domar räknas därför för
  // hela partiuniversumet på varje mål med minst en aktiv koppling;
  // domsmotorn fyller bara en cell där partiet självt agerat (röst i kopplad
  // votering, eget författarskap) — övriga blir "ingen_handling_annu", en
  // ärlig tom cell. Mål utan kopplingar redovisas inte alls här.
  const partierAvMal = new Map(promises.map((p) => [p.id, p.parties]));
  const partiFil = resolve(rot, "data/parties.json");
  const universum: string[] | null = existsSync(partiFil)
    ? (JSON.parse(readFileSync(partiFil, "utf8")) as Array<{ code: string }>).map(
        (p) => p.code,
      )
    : null;
  if (!universum) {
    console.warn(
      "data/parties.json saknas — faller tillbaka på målens egna partier (kör npm run vendor för alla åtta).",
    );
  }
  const targetParties: Record<string, string[]> = {};
  for (const k of kopplingar) {
    if (k.status !== "aktiv") continue;
    const t = targetId(k);
    const egnaPartier = partierAvMal.get(t);
    if (!egnaPartier) throw new Error(`koppling ${k.id} pekar på okänt mål ${t}`);
    targetParties[t] = universum ?? egnaPartier;
  }

  // Röster i kompakt format: personregister + röststrängar per riksmöte.
  const rosterDir = resolve(rot, "data/roster");
  const roster = new Map<string, RdVoteringRad[]>();
  const registerPath = resolve(rot, "data/personer.json");
  if (existsSync(rosterDir) && existsSync(registerPath)) {
    const register: Person[] = JSON.parse(readFileSync(registerPath, "utf8"));
    for (const fil of readdirSync(rosterDir)) {
      if (!fil.endsWith(".json")) continue;
      const rmRoster: RmRoster = JSON.parse(
        readFileSync(resolve(rosterDir, fil), "utf8"),
      );
      for (const [vid, rader] of avkodaRoster(rmRoster, register)) {
        roster.set(vid, rader);
      }
    }
  }

  return {
    partidomar: computePartiDomar(kopplingar, handlingar, targetParties),
    ledamotsmeriter: computeLedamotMeriter(kopplingar, handlingar, roster),
  };
}
