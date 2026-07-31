/**
 * Etikettbeslut ("knappen"): svep över öppna review-kö-issues och exekvera
 * beslut satta som etiketter — GitHubs listvy kan bulk-applicera etiketter,
 * så ägaren kan godkänna/avvisa MÅNGA poster i ett klick:
 *
 *   beslut:godkänn  → godkänn med den föreslagna kostnaden som den är
 *   beslut:avvisa   → avvisa
 *
 * "Ja med ändrade belopp" kräver fortfarande kommentar (/godkänn låg bas hög) —
 * belopp går inte att uttrycka i en etikett. Etiketter kan bara sättas av
 * användare med triage-behörighet (= ägaren i detta repo), så etikettens
 * närvaro ÄR auktorisationen.
 *
 * TVÅ FASER (så att en omgjord push aldrig tappar beslut):
 *   apply  — muterar data/ och skriver planerade issue-notifieringar till
 *            NOTIFY_FILE (utanför repot). INGA GitHub-mutationer: körningen
 *            kan göras om från färsk main tills pushen lyckas.
 *   notify — läser NOTIFY_FILE och kommenterar/stänger/av-etiketterar.
 *            Körs EFTER lyckad push.
 * Sveper allt och är idempotent — ofarligt att concurrency-koalescering
 * slänger köade dubblettkörningar (kvarvarande svep tar allt).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  approve,
  reject,
  findIndexByReviewId,
  type ReviewCandidate,
} from "../src/review.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");
const QUEUE_LABEL = "review-kö";
const APPROVE_LABEL = "beslut:godkänn";
const REJECT_LABEL = "beslut:avvisa";
const API = "https://api.github.com";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const notifyFile = process.env.NOTIFY_FILE;
const mode = process.argv[2] ?? "apply";
if (!token || !repo || !notifyFile) {
  console.error("Kräver GITHUB_TOKEN, GITHUB_REPOSITORY och NOTIFY_FILE.");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "drygast-review-apply",
};

async function api(path: string, init?: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...HEADERS, ...init?.headers } });
  const text = await res.text();
  if (!res.ok && res.status !== 422 && res.status !== 404) {
    throw new Error(`GitHub API ${res.status} för ${path}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Notification {
  number: number;
  body: string;
  close?: "completed" | "not_planned";
  removeLabel?: string;
}

/* ─────────────────────────── notify-fasen ── */

if (mode === "notify") {
  const planned = JSON.parse(readFileSync(notifyFile, "utf8")) as Notification[];
  for (const n of planned) {
    await api(`/repos/${repo}/issues/${n.number}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: n.body }),
    });
    if (n.removeLabel) {
      await fetch(`${API}/repos/${repo}/issues/${n.number}/labels/${encodeURIComponent(n.removeLabel)}`, {
        method: "DELETE",
        headers: HEADERS,
      });
    }
    if (n.close) {
      await api(`/repos/${repo}/issues/${n.number}`, {
        method: "PATCH",
        body: JSON.stringify({ state: "closed", state_reason: n.close }),
      });
    }
    await sleep(500);
  }
  console.log(`Notifierade ${planned.length} issues.`);
  process.exit(0);
}

/* ─────────────────────────── apply-fasen ── */

/** Beslutsetiketterna måste finnas för att kunna väljas i UI:t (422 = finns redan). */
await api(`/repos/${repo}/labels`, {
  method: "POST",
  body: JSON.stringify({
    name: APPROVE_LABEL, color: "0e8a16",
    description: "Godkänn med föreslagen kostnad (bulk-bar via listvyn)",
  }),
});
await api(`/repos/${repo}/labels`, {
  method: "POST",
  body: JSON.stringify({
    name: REJECT_LABEL, color: "d93f0b",
    description: "Avvisa posten (bulk-bar via listvyn)",
  }),
});

interface Issue { number: number; title: string; labels: Array<{ name: string }> }

const issues: Issue[] = [];
for (let page = 1; page <= 20; page++) {
  const { json } = await api(
    `/repos/${repo}/issues?labels=${encodeURIComponent(QUEUE_LABEL)}&state=open&per_page=100&page=${page}`,
  );
  const batch = json as Issue[];
  issues.push(...batch);
  if (batch.length < 100) break;
}

const notifications: Notification[] = [];
let approved = 0, rejected = 0, skipped = 0;

for (const issue of issues) {
  const names = issue.labels.map((l) => l.name);
  const wantsApprove = names.includes(APPROVE_LABEL);
  const wantsReject = names.includes(REJECT_LABEL);
  if (!wantsApprove && !wantsReject) continue;

  const idMatch = issue.title.match(/^\[review ([0-9a-f]{12})\]/u);
  if (!idMatch) { skipped++; continue; }
  const id = idMatch[1]!;

  if (wantsApprove && wantsReject) {
    notifications.push({
      number: issue.number,
      body: "⚠️ Både `beslut:godkänn` och `beslut:avvisa` — ta bort den ena så exekverar jag den andra.",
    });
    skipped++;
    continue;
  }

  // Kön läses om per beslut — index förskjuts när tidigare poster tas bort.
  const items = JSON.parse(readFileSync(join(DATA_DIR, "needs_review.json"), "utf8")) as ReviewCandidate[];
  const index = findIndexByReviewId(items, id);
  if (index < 0) {
    notifications.push({
      number: issue.number,
      body: "⚠️ Posten finns inte längre i kön — troligen redan hanterad på annat håll. Stänger.",
      close: "completed",
    });
    skipped++;
    continue;
  }

  if (wantsReject) {
    const { title } = reject(String(index), "avvisad via etikett", DATA_DIR);
    notifications.push({
      number: issue.number,
      body: `❌ Avvisad via etikett: "${title}"`,
      close: "not_planned",
    });
    rejected++;
  } else {
    const entry = items[index]!;
    if (!entry.cost) {
      notifications.push({
        number: issue.number,
        body: "⚠️ Posten saknar föreslagen kostnad — etikettbeslut går inte här. Kommentera i stället: `/godkänn <low> <base> <high>` (msek).",
        removeLabel: APPROVE_LABEL,
      });
      skipped++;
      continue;
    }
    const res = approve([String(index)], DATA_DIR);
    notifications.push({
      number: issue.number,
      body: `✅ Publicerad via etikett som **${res.id}** — "${res.title}", ${res.msekBase} msek. Livesajten uppdateras vid nästa bygge.`,
      close: "completed",
    });
    approved++;
  }
}

writeFileSync(notifyFile, JSON.stringify(notifications, null, 2) + "\n");
console.log(`Svep: ${approved} godkända, ${rejected} avvisade, ${skipped} hoppade, ${notifications.length} notifieringar planerade.`);
