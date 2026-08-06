/**
 * Prövar kopplingsköns bevis mot källdokumenten hos riksdagen.
 *
 * Kön bär bara metadata — dokumenttexten sparas inte lokalt. Att citaten
 * står ordagrant i sina källor kontrollerades när förslaget skapades, men
 * inte sedan dess, och grinden som prövar VAR i dokumentet citatet står
 * tillkom 2026-08-06, efter att kön fyllts. Det här skriptet kör båda
 * kontrollerna mot kön som den ligger:
 *
 *   1. Står citatet ordagrant i källdokumentet? (H2, första ledet)
 *   2. Står det i den del som ÄR handlingen — motionens yrkanden eller
 *      voteringspunktens beslutstext? (H2, andra ledet)
 *
 * För en post som faller på ledet 2 skrivs de yrkanden ut som ligger
 * närmast löftet, rankade på ordöverlapp, så att en människa kan välja
 * vilket citat posten ska vägas om till. Skriptet väljer aldrig självt.
 *
 *   npm run ko-kontrollera -- --ut rapport.json [--bara-motioner] [--max 50]
 *
 * Hämtningarna cachas i data/.kallcache/ så en omkörning inte frågar
 * riksdagen om samma dokument igen.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchDokumentText, fetchUtskottspunkter, fetchYrkanden, type Yrkande } from "../src/riksdagen.ts";
import { cachat, politeFetch } from "./kallcache.mts";
import { normalizeForVerbatim } from "../src/grindar.ts";
import { nyckelord, type Lofte } from "../src/foreslag.ts";
import type { Handling } from "../src/handlingar.ts";
import type { KoPost } from "../src/granskning.ts";
import { kopplingId } from "../src/granskning.ts";

const rot = resolve(import.meta.dirname, "../..");

export interface Utfall {
  koppling_id: string;
  promise_id?: string;
  handling_id: string;
  kind: string;
  dok_id: string;
  citat: string;
  /** Står citatet ordagrant i källdokumentet? */
  ordagrant: boolean | null;
  /** Står det i handlingens egen del (yrkande/beslutspunkt)? null = kunde inte prövas. */
  i_handlingen: boolean | null;
  /** Yrkanden rankade på ordöverlapp mot löftet — underlag för en omvägning. */
  kandidater?: Array<{ nummer: string; lydelse: string; poang: number }>;
}

function poangMotLofte(lofte: Lofte | undefined, text: string): number {
  if (!lofte) return 0;
  const mal = nyckelord(`${lofte.title} ${lofte.quote}`);
  let n = 0;
  for (const w of nyckelord(text)) if (mal.has(w)) n += 1;
  return n;
}

async function main() {
  const argv = process.argv.slice(2);
  const utPath = argv.includes("--ut") ? argv[argv.indexOf("--ut") + 1]! : undefined;
  const max = argv.includes("--max") ? Number(argv[argv.indexOf("--max") + 1]) : Infinity;
  const baraMotioner = argv.includes("--bara-motioner");

  const ko: KoPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingsforslag.json"), "utf8"));
  const handlingar: Handling[] = JSON.parse(readFileSync(resolve(rot, "data/handlingar.json"), "utf8"));
  const loften: Lofte[] = JSON.parse(readFileSync(resolve(rot, "../data/promises.json"), "utf8"));
  const hById = new Map(handlingar.map((h) => [h.id, h]));
  const lById = new Map(loften.map((l) => [l.id, l]));

  const utfall: Utfall[] = [];
  let i = 0;
  for (const post of ko) {
    if (i >= max) break;
    const h = hById.get(post.handling_id);
    if (!h) {
      console.error(`${post.handling_id}: saknas i handlingar.json`);
      continue;
    }
    if (baraMotioner && h.kind !== "motion") continue;
    i += 1;

    const kallDok = post.bevis.kalla_dok_id ?? h.dok_id;
    const text = await cachat(`text-${kallDok}`, () => fetchDokumentText(politeFetch, kallDok));
    const citat = normalizeForVerbatim(post.bevis.citat);
    const ordagrant = text === null ? null : normalizeForVerbatim(text).includes(citat);

    let iHandlingen: boolean | null = null;
    let kandidater: Utfall["kandidater"];

    if (h.kind === "votering" && post.bevis.kalla_dok_id) {
      const punkter = await cachat(`punkter-${post.bevis.kalla_dok_id}`, () =>
        fetchUtskottspunkter(politeFetch, post.bevis.kalla_dok_id!),
      );
      const p = punkter?.find((x) => x.punkt === h.punkt);
      iHandlingen = p ? normalizeForVerbatim(p.forslag).includes(citat) : null;
    } else if (h.kind === "motion") {
      const yrkanden = await cachat<Yrkande[]>(`yrk-${h.dok_id}`, () => fetchYrkanden(politeFetch, h.dok_id));
      if (yrkanden && yrkanden.length > 0) {
        iHandlingen = yrkanden.some((y) => normalizeForVerbatim(y.lydelse).includes(citat));
        if (!iHandlingen) {
          const lofte = post.promise_id ? lById.get(post.promise_id) : undefined;
          kandidater = yrkanden
            .map((y) => ({ ...y, poang: poangMotLofte(lofte, y.lydelse) }))
            .sort((a, b) => b.poang - a.poang)
            .slice(0, 5);
        }
      }
    }

    utfall.push({
      koppling_id: kopplingId(post),
      ...(post.promise_id ? { promise_id: post.promise_id } : {}),
      handling_id: post.handling_id,
      kind: h.kind,
      dok_id: kallDok,
      citat: post.bevis.citat,
      ordagrant,
      i_handlingen: iHandlingen,
      ...(kandidater ? { kandidater } : {}),
    });
    if (i % 20 === 0) console.error(`  ${i} prövade`);
  }

  const brutna = utfall.filter((u) => u.ordagrant === false);
  const oprovade = utfall.filter((u) => u.ordagrant === null);
  const brodtext = utfall.filter((u) => u.i_handlingen === false);
  console.log(`${utfall.length} poster prövade mot källdokumenten`);
  console.log(`  ${utfall.length - brutna.length - oprovade.length} står ordagrant i sin källa`);
  console.log(`  ${brutna.length} gör INTE det`);
  console.log(`  ${oprovade.length} kunde inte prövas (hämtningen föll)`);
  console.log(`  ${brodtext.length} står i brödtexten, inte i handlingens egen del`);
  for (const u of brutna) console.log(`  BRUTET: ${u.koppling_id} ${u.handling_id} "${u.citat.slice(0, 70)}…"`);

  if (utPath) {
    writeFileSync(resolve(utPath), JSON.stringify(utfall, null, 2) + "\n");
    console.log(`rapport → ${utPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
