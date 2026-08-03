/**
 * Synkar kopplingskön (data/kopplingsforslag.json) till GitHub-issues i
 * DETTA (privata) repo: ETT issue per förslag, etikett "koppling-kö", så
 * ägaren fattar H6-besluten direkt i GitHub-gränssnittet:
 *
 *   /godkänn                          ja — förslaget som det står
 *   /godkänn --motionstyp parti       ja — motionstypen satt av granskaren
 *   /avvisa <skäl>                    nej
 *
 * Besluten exekveras av .github/workflows/koppling-review.yml. Varje issue
 * bär postens koppling-id i titeln ([koppling <id>]) — stabilt även när
 * kö-index förskjuts. Idempotent: listar redan skapade issues (öppna OCH
 * stängda, så ett avgjort beslut aldrig återuppstår) och skapar bara det
 * som saknas, max SYNC_CAP per körning med paus emellan.
 *
 * Privat tills HV5: issues skapas här, aldrig i valflask före
 * lanseringsgrinden. Vid HV5 speglas flödet dit (spec §8).
 *
 * Miljö: GITHUB_TOKEN (issues:write), GITHUB_REPOSITORY ("ägare/repo"),
 * valfritt PROMISES_PATH (valflask data/promises.json för löftestexterna).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Handling } from "../src/handlingar.ts";
import {
  byggIssueBody,
  byggIssueTitel,
  kopplingId,
  type KoPost,
  type LofteInfo,
} from "../src/granskning.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");
const LABEL = "koppling-kö";
const API = "https://api.github.com";

const token = process.env["GITHUB_TOKEN"];
const repo = process.env["GITHUB_REPOSITORY"];
if (!token || !repo) {
  console.error("Kräver GITHUB_TOKEN och GITHUB_REPOSITORY.");
  process.exit(1);
}
const cap = Math.max(1, Number(process.env["SYNC_CAP"] ?? 60));
const sleepMs = Math.max(0, Number(process.env["SYNC_SLEEP_MS"] ?? 2000));

const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "handlingsvagen-koppling-sync",
};

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...HEADERS, ...init?.headers } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} för ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Alla koppling-id:n som redan har ett issue (öppet eller stängt). */
async function existingIssueIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const batch = (await api(
      `/repos/${repo}/issues?labels=${encodeURIComponent(LABEL)}&state=all&per_page=100&page=${page}`,
    )) as Array<{ title: string }>;
    for (const issue of batch) {
      const m = issue.title.match(/^\[koppling ([0-9a-f]{12})\]/u);
      if (m) ids.add(m[1]!);
    }
    if (batch.length < 100) break;
  }
  return ids;
}

/**
 * Öppna koppling-issues med nummer, id och KROPP. Kroppen behövs för att
 * upptäcka att kö-posten ändrats sedan issuet skapades — se uppdateringen
 * nedan.
 */
async function openIssues(): Promise<Array<{ number: number; id: string; body: string }>> {
  const out: Array<{ number: number; id: string; body: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const batch = (await api(
      `/repos/${repo}/issues?labels=${encodeURIComponent(LABEL)}&state=open&per_page=100&page=${page}`,
    )) as Array<{ number: number; title: string; body: string | null }>;
    for (const issue of batch) {
      const m = issue.title.match(/^\[koppling ([0-9a-f]{12})\]/u);
      if (m) out.push({ number: issue.number, id: m[1]!, body: issue.body ?? "" });
    }
    if (batch.length < 100) break;
  }
  return out;
}

const items = JSON.parse(readFileSync(join(DATA_DIR, "kopplingsforslag.json"), "utf8")) as KoPost[];
const handlingar = JSON.parse(readFileSync(join(DATA_DIR, "handlingar.json"), "utf8")) as Handling[];
const hById = new Map(handlingar.map((h) => [h.id, h]));

/** Löftestexter ur valflask när sökvägen finns — annars visas bara id:t. */
const promisesPath = process.env["PROMISES_PATH"];
const loften = new Map<string, LofteInfo>();
if (promisesPath && existsSync(resolve(promisesPath))) {
  const promises = JSON.parse(readFileSync(resolve(promisesPath), "utf8")) as Array<
    { id: string; title?: string; quote?: string; parties?: string[] }
  >;
  for (const p of promises) loften.set(p.id, p);
  console.log(`Löftestexter: ${loften.size} ur ${promisesPath}.`);
} else {
  console.log("PROMISES_PATH saknas — issues visar löftes-id utan text.");
}

console.log(`Kön: ${items.length} förslag. Hämtar befintliga issues …`);
const existing = await existingIssueIds();
console.log(`Redan issue-satta: ${existing.size}.`);

let created = 0;
for (const post of items) {
  if (created >= cap) {
    console.log(`Nådde SYNC_CAP=${cap} — resten tas nästa synk.`);
    break;
  }
  const id = kopplingId(post);
  if (existing.has(id)) continue;
  const handling = hById.get(post.handling_id);
  const lofte = post.promise_id ? loften.get(post.promise_id) : undefined;
  const title = byggIssueTitel(post, id, handling);
  await api(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title,
      body: byggIssueBody(post, id, handling, lofte),
      labels: [LABEL],
    }),
  });
  created++;
  console.log(`  skapade ${title.slice(0, 90)}`);
  if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
}
console.log(`Klart: ${created} nya issues, ${existing.size} fanns sedan tidigare.`);

// ── Uppdatera issues vars kö-post ändrats sedan issuet skapades.
//
// VARFÖR: `kopplingId` är en hash av mål + handling och bär INTE citatet. Byts
// beviset i kön behåller posten alltså samma id, issuet räknas som befintligt
// och skapas inte om — men dess text står kvar med det gamla citatet. Då kan
// den som granskar läsa ett citat, skriva /godkänn, och få ett annat publicerat.
// Hela poängen med att en människa godkänner varje koppling är att människan
// ser det som godkänns.
//
// Ändringen är aldrig tyst: kroppen skrivs om OCH en kommentar läggs, så det
// syns i issuets historik att beviset bytts och när.
const koById = new Map(items.map((p) => [kopplingId(p), p] as const));
let uppdaterade = 0;
for (const issue of await openIssues()) {
  if (uppdaterade + created >= cap) {
    console.log(`Nådde SYNC_CAP=${cap} — resten uppdateras nästa synk.`);
    break;
  }
  const post = koById.get(issue.id);
  if (!post) continue; // hanteras av vaktmästaren nedan
  const handling = hById.get(post.handling_id);
  const lofte = post.promise_id ? loften.get(post.promise_id) : undefined;
  const farsk = byggIssueBody(post, issue.id, handling, lofte);
  if (farsk.trim() === issue.body.trim()) continue;
  await api(`/repos/${repo}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body: farsk }),
  });
  await api(`/repos/${repo}/issues/${issue.number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body:
        "♻️ Förslaget har ändrats sedan issuet skapades — texten ovan är uppdaterad " +
        "till vad som står i kön nu. Läs om den innan du beslutar.",
    }),
  });
  uppdaterade++;
  console.log(`  uppdaterade #${issue.number}`);
  if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
}
if (uppdaterade > 0) console.log(`Uppdaterade ${uppdaterade} issues vars förslag ändrats.`);

// ── Vaktmästaren: stäng öppna issues vars kö-post inte längre finns —
// posten har hanterats utanför issue-flödet (granska-CLI:t). Beslutet är
// spårat i git (kopplingsforslag-diffen); issuet är bara ett fönster mot
// kön och ska inte stå öppet mot tomhet.
const queueIds = new Set(items.map((p) => kopplingId(p)));
let closed = 0;
for (const issue of await openIssues()) {
  if (queueIds.has(issue.id)) continue;
  if (closed >= cap) {
    console.log(`Vaktmästaren nådde SYNC_CAP=${cap} — resten städas nästa synk.`);
    break;
  }
  await api(`/repos/${repo}/issues/${issue.number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: "🧹 Posten har hanterats utanför issue-flödet (granska-CLI:t) — se git-historiken för kopplingsforslag.json för beslutet. Stänger.",
    }),
  });
  await api(`/repos/${repo}/issues/${issue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "completed" }),
  });
  closed++;
  if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
}
if (closed > 0) console.log(`Vaktmästaren stängde ${closed} föräldralösa issues.`);
