/**
 * Granskning (H6) från terminalen — samma beslut som issue-flödet:
 *
 *   npm run granska -- list
 *   npm run granska -- godkann <koppling-id|index> [--motionstyp parti|kommitte|enskild]
 *   npm run granska -- avvisa <koppling-id|index> <skäl>
 *
 * Godkända förslag flyttas från data/kopplingsforslag.json till
 * data/kopplingar.json (status aktiv, verified_by "owner"). Avvisade lyfts
 * ur kön; skälet spåras i gitdiffen/committexten. Endast ägaren beslutar —
 * skriptet är verktyget, inte beslutsfattaren.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import {
  avvisaForslag,
  findIndexByKopplingId,
  godkannForslag,
  GranskningsFel,
  kopplingId,
  type KopplingPost,
  type KoPost,
} from "../src/granskning.ts";
import { lasProvningar } from "../../../pipeline/src/provningar.ts";

const rot = resolve(import.meta.dirname, "../..");
// Kvalitetsfiltrets index ligger i valflasks rot-data, inte Handlingsvågens —
// en logg för alla tre vågarna, ett index.
const rotData = resolve(rot, "../data");
const koPath = resolve(rot, "data/kopplingsforslag.json");
const kopplingarPath = resolve(rot, "data/kopplingar.json");

function lasJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;
}

function skrivJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function resolveIndex(ko: KoPost[], nyckel: string | undefined): number {
  if (nyckel === undefined) {
    console.error("Ange koppling-id (12 hex-tecken) eller kö-index.");
    process.exit(1);
  }
  const index = /^[0-9a-f]{12}$/u.test(nyckel) ? findIndexByKopplingId(ko, nyckel) : Number(nyckel);
  if (!Number.isInteger(index) || index < 0 || index >= ko.length) {
    console.error(`Ingen kö-post matchar "${nyckel}" — redan hanterad? Kön har ${ko.length} poster.`);
    process.exit(1);
  }
  return index;
}

function list(ko: KoPost[], handlingar: Handling[]): void {
  if (ko.length === 0) {
    console.log("Kön är tom — inga kopplingsförslag väntar på beslut.");
    return;
  }
  const hById = new Map(handlingar.map((h) => [h.id, h]));
  ko.forEach((post, i) => {
    const h = hById.get(post.handling_id);
    console.log(`[${i}] ${kopplingId(post)} ${post.promise_id ?? post.stance_id} ↔ ${post.handling_id} (${h?.kind ?? "OKÄND"}) ${post.riktning}`);
    console.log(`    ${h?.titel ?? "handling saknas i handlingar.json"}`);
    console.log(`    "${post.bevis.citat.slice(0, 100)}${post.bevis.citat.length > 100 ? "…" : ""}"`);
    if (post.motionstyp) console.log(`    motionstyp: ${post.motionstyp}`);
    console.log();
  });
  console.log(`Totalt: ${ko.length} förslag i kön.`);
}

const [kommando, ...args] = process.argv.slice(2);
const ko = lasJson<KoPost[]>(koPath, []);
const kopplingar = lasJson<KopplingPost[]>(kopplingarPath, []);
const handlingar = lasJson<Handling[]>(resolve(rot, "data/handlingar.json"), []);

try {
  switch (kommando) {
    case "list":
      list(ko, handlingar);
      break;
    case "godkann":
    case "godkänn": {
      let motionstyp: "parti" | "kommitte" | "enskild" | undefined;
      const rest: string[] = [];
      for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "--motionstyp") {
          const v = args[++i];
          if (v !== "parti" && v !== "kommitte" && v !== "enskild") {
            console.error("--motionstyp måste vara parti, kommitte eller enskild.");
            process.exit(1);
          }
          motionstyp = v;
        } else rest.push(args[i]!);
      }
      const index = resolveIndex(ko, rest[0]);
      const res = godkannForslag(
        ko,
        index,
        kopplingar,
        handlingar,
        motionstyp ? { motionstyp } : {},
        lasProvningar(rotData),
      );
      skrivJson(kopplingarPath, res.kopplingar);
      skrivJson(koPath, res.ko);
      console.log(`Godkänd: ${res.koppling.id} — ${res.koppling.promise_id ?? res.koppling.stance_id} ↔ ${res.koppling.handling_id} (${res.koppling.riktning})`);
      console.log(`Commit-meddelande: data: koppling godkänd ${res.koppling.id}`);
      break;
    }
    case "avvisa": {
      const index = resolveIndex(ko, args[0]);
      const skal = args.slice(1).join(" ").trim();
      if (skal === "") {
        console.error("Användning: npm run granska -- avvisa <koppling-id|index> <skäl>");
        process.exit(1);
      }
      const res = avvisaForslag(ko, index);
      skrivJson(koPath, res.ko);
      console.log(`Avvisad: ${res.post.promise_id ?? res.post.stance_id} ↔ ${res.post.handling_id} — ${skal}`);
      break;
    }
    default:
      console.log("Användning: npm run granska -- <list|godkann|avvisa>");
      console.log("  list                                        Visa kön");
      console.log("  godkann <id|index> [--motionstyp parti]     Godkänn förslag (H6)");
      console.log("  avvisa <id|index> <skäl>                    Avvisa förslag");
      process.exit(kommando ? 1 : 0);
  }
} catch (e) {
  if (e instanceof GranskningsFel) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
