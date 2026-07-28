/**
 * Arkiv-backfill för Frågevågen.
 *
 * Löftesflödet har `archive:backfill` som tar om de arkiveringar som
 * misslyckades i körningen. Ståndpunkterna saknade motsvarighet: pipelinen
 * arkiverar källan direkt i körningen, men blir det nätfel eller är sidan inte
 * indexerad ännu lämnas `archive_url` null och ingen försöker igen. Vid
 * genomgången av torrkörningens kö 2026-07-28 saknade tre av fem poster
 * arkivlänk, och lanseringschecklistans steg 3 kräver klickbar arkivlänk.
 *
 * Skillnad mot löftesflödets backfill: **citatet måste stå ordagrant i
 * snapshotten**. En arkivkopia som inte bär citatet backar inte beskedet
 * (kärnprincip, se archive-verify.ts). Wayback returnerar närmaste snapshot,
 * som mycket väl kan vara äldre än sidinnehållet — därför verifieras varje
 * träff innan den skrivs.
 *
 * Körning:
 *   node --import tsx/esm scripts/stances-archive-backfill.mts [mode] [maxSaves] [limit]
 *     mode=avail (default) — bara befintliga snapshots
 *     mode=save            — begär även nya Wayback-kopior (bunden budget)
 *     --dry-run            — skriv inget, visa bara vad som skulle ske
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotBacksQuote } from "../src/archive-verify.ts";

const DATA = join(import.meta.dirname, "../../data");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const positional = args.filter((a) => !a.startsWith("--"));
const MODE = positional[0] ?? "avail";
const MAX_SAVES = parseInt(positional[1] ?? "0", 10) || (MODE === "save" ? 10 : 0);
const LIMIT = parseInt(positional[2] ?? "0", 10) || Infinity;
const UA = "DrygastBot/1.0 (+https://drygast.nu/om)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StanceSource {
  url: string;
  domain: string;
  archive_url: string | null;
}
interface Statement {
  id: string;
  quote: string;
  date_stated?: string;
  source: StanceSource;
}
interface StanceCell {
  subquestion_id: string;
  party: string;
  statements?: Statement[];
}

const cells = JSON.parse(readFileSync(join(DATA, "stances.json"), "utf8")) as StanceCell[];
const statements = cells.flatMap((c) => c.statements ?? []);
const missing = statements.filter((s) => !s.source?.archive_url);

const stripFrag = (u: string) => u.split("#")[0]!;
const tsDigits = (iso?: string) => (iso ? iso.replace(/[^0-9]/g, "").slice(0, 14) : "");

/** Käll-URL → de besked som väntar på den. Flera besked delar ofta samma sida. */
const groups = new Map<string, Statement[]>();
for (const s of missing) {
  const key = stripFrag(s.source.url);
  groups.set(key, [...(groups.get(key) ?? []), s]);
}
const urls = [...groups.keys()].slice(0, LIMIT);

console.log(
  `Utan arkivlänk: ${missing.length} besked över ${groups.size} käll-URL:er. ` +
    `Läge=${MODE} maxSaves=${MAX_SAVES} behandlar=${urls.length}${DRY ? " (torrkörning)" : ""}.`,
);

async function availability(url: string, ts: string): Promise<string | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}${ts ? `&timestamp=${ts}` : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) {
        const body = (await res.json()) as {
          archived_snapshots?: { closest?: { available?: boolean; url?: string } };
        };
        const closest = body.archived_snapshots?.closest;
        if (closest?.available && closest.url) return closest.url.replace(/^http:/, "https:");
        return null;
      }
    } catch {
      /* nätfel — backa av och försök igen */
    }
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

async function requestSave(url: string): Promise<void> {
  try {
    await fetch(`https://web.archive.org/save/${url}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    /* save är best effort — fas C kollar om den blev indexerad */
  }
}

const resolved = new Map<string, string>();
let saves = 0;

for (const url of urls) {
  const waiting = groups.get(url)!;
  const ts = tsDigits(waiting[0]?.date_stated);
  let snap = await availability(url, ts);

  if (!snap && MODE === "save" && saves < MAX_SAVES) {
    saves += 1;
    console.log(`  … begär Wayback-kopia (${saves}/${MAX_SAVES}): ${url}`);
    await requestSave(url);
    await sleep(8000);
    snap = await availability(url, ts);
  }

  if (!snap) {
    console.log(`  – ingen snapshot: ${url}`);
    await sleep(1500);
    continue;
  }

  // Kärnprincipen: arkivet duger bara om citatet står ordagrant i det. Ett
  // besked per URL räcker att pröva på — bär snapshotten inte det citatet är
  // den fel version av sidan för alla som väntar på den.
  const probe = waiting[0]!;
  const backs = await snapshotBacksQuote(snap, probe.quote);
  if (backs !== true) {
    console.log(
      `  ✗ snapshot bär inte citatet (${backs === null ? "gick ej att avgöra" : "citat saknas"}): ${url}`,
    );
    await sleep(1500);
    continue;
  }

  resolved.set(url, snap);
  console.log(`  ✓ ${url}`);
  await sleep(1500);
}

const changed: string[] = [];
for (const s of missing) {
  const snap = resolved.get(stripFrag(s.source.url));
  if (!snap) continue;
  const frag = s.source.url.includes("#") ? "#" + s.source.url.split("#")[1] : "";
  if (!DRY) s.source.archive_url = snap + frag;
  changed.push(s.id);
}

if (changed.length === 0) {
  console.log("\nInga arkivlänkar att sätta.");
} else if (DRY) {
  console.log(`\nTorrkörning: ${changed.length} besked skulle få arkivlänk (${changed.join(", ")}).`);
} else {
  writeFileSync(join(DATA, "stances.json"), JSON.stringify(cells, null, 2) + "\n");
  console.log(`\nKLART: ${changed.length} besked fick arkivlänk (${resolved.size}/${urls.length} URL:er lösta).`);
}
console.log(
  `Kvar utan arkiv: ${statements.filter((s) => !s.source?.archive_url).length} av ${statements.length} besked.`,
);
