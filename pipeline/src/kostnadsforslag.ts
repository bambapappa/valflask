import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {Ajv2020} from "ajv/dist/2020.js";
import {kanoniskJson} from "./underlagsversion.ts";
import {svenskDag} from "./dagen.ts";
import {kontrolleraOkandaBelopp, provaHarledning, type Kalkyl} from "./harledningen.ts";
import {kravHarledningsreferenser} from "./harledningsreferenser.ts";
import {ordnaSakreferenser, type Sakreferens} from "./sakmoment.ts";
import type {PromiseEntry} from "./loftesforslag.ts";
const ajv = new Ajv2020({allErrors: true, strict: true});
ajv.addFormat("uri", {type: "string", validate: (s: string) => {try {return Boolean(new URL(s).protocol);} catch {return false;}}});
const valid = ajv.compile(JSON.parse(readFileSync(new URL("../schemas/promises.schema.json", import.meta.url), "utf8")));
const hash = (v: unknown) => createHash("sha256").update(kanoniskJson(v)).digest("hex");
export interface Kostnadsrad {id: string; kostnad: Record<string, unknown>; skal: string; ta_ur_grupp?: true;}
export interface FrystKostnadsforslag {
  version: "kostnadsforslag/1"; fore: string; tidpunkt: string; rad: Kostnadsrad;
  referenser: Sakreferens[]; tidigareLofte: PromiseEntry; nyttLofte: PromiseEntry; hash: string;
}
/** Förbereder endast underlag: ingen skrivning, attest eller publicering. */
export function forberedKostnadsforslag(rad: Kostnadsrad, loften: PromiseEntry[], material: readonly Sakreferens[], nu: Date): FrystKostnadsforslag {
  if (Object.keys(rad).some(k => !["id", "kostnad", "skal", "ta_ur_grupp"].includes(k))) throw new Error("Okänt fält i kostnadsförslaget");
  if (Object.hasOwn(rad, "ta_ur_grupp") && rad.ta_ur_grupp !== true) throw new Error("Gruppborttagning måste uttryckligen vara true");
  if (!loften.length || new Set(loften.map(p => p.id)).size !== loften.length) throw new Error("Tomt eller dubblerat bestånd");
  const old = loften.find(p => p.id === rad.id);
  if (!old || old.status !== "aktiv") throw new Error("Kostnadsförslaget kräver ett aktivt publicerat löfte");
  if (rad.skal.trim().length < 40) throw new Error("Kostnadsändringen kräver tydligt rättelseskäl");
  if (rad.ta_ur_grupp && !old.group_id) throw new Error("Löftet har ingen befintlig grupp att lämna");
  const cost = structuredClone(rad.kostnad);
  if (!cost.harledning) throw new Error("Ny strukturerad härledning krävs");
  const next = structuredClone(old);
  next.cost = cost; // Hela kostnaden ersätts; gamla led eller ankare ärvs inte.
  if (rad.ta_ur_grupp) next.group_id = null;
  const change = rad.skal.trim() + (rad.ta_ur_grupp ? " Löftet tas ur sin tidigare kostnadsgrupp och redovisas separat." : "");
  next.history = [...old.history, {date: svenskDag(nu), commit: "0000000", change}];
  if (!valid([next])) throw new Error(`Ogiltig slutform: ${ajv.errorsText(valid.errors)}`);
  const profile = (cost as Kalkyl).harledning!.arsprofil;
  if (profile.status === "kand" && new Set(profile.ar.map(r => r.ar)).size !== profile.ar.length) throw new Error("Årsprofilen innehåller dubblerade år");
  kontrolleraOkandaBelopp([{id: rad.id, cost: cost as Kalkyl}]);
  const fynd = provaHarledning(cost as Kalkyl);
  if (fynd.length) throw new Error(fynd.map(f => f.text).join("; "));
  const referenser = ordnaSakreferenser(material);
  kravHarledningsreferenser([{innehall: next as unknown as Record<string, unknown>}], referenser);
  if (hash(old.cost) === hash(cost) && !rad.ta_ur_grupp) throw new Error("Kostnaden är oförändrad");
  const payload = {version: "kostnadsforslag/1" as const, fore: hash(loften), tidpunkt: nu.toISOString(), rad: structuredClone(rad), referenser, tidigareLofte: structuredClone(old), nyttLofte: next};
  return structuredClone({...payload, hash: hash(payload)});
}
/** Omprövar fryst slutform mot aktuellt bestånd och material; ger ingen skrivrätt. */
export function omprovaKostnadsforslag(f: FrystKostnadsforslag, loften: PromiseEntry[], material: readonly Sakreferens[], expected: string): FrystKostnadsforslag {
  const {hash: saved, ...payload} = f;
  if (f.version !== "kostnadsforslag/1" || saved !== expected || hash(payload) !== saved) throw new Error("Kostnadsförslaget har ändrats");
  const current = forberedKostnadsforslag(f.rad, loften, material, new Date(f.tidpunkt));
  if (current.hash !== saved) throw new Error("Kostnadsförslagets bestånd, källmaterial eller slutform har ändrats");
  return current;
}
