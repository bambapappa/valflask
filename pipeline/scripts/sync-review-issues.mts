/**
 * Synkar review-kön (data/needs_review.json) till GitHub-issues: ETT issue per
 * kö-post, så ägaren kan besluta direkt i GitHub-gränssnittet:
 *
 *   /godkänn                      ja — föreslagen kostnad tas som den är
 *   /godkänn 500 1000 2000        ja med ändrade belopp (msek: low base high)
 *   /godkänn --group p-2026-0123  ja, länka som dublett (delad group_id)
 *   /avvisa <skäl>                nej
 *
 * Besluten exekveras av .github/workflows/review.yml. Varje issue bär postens
 * review-id i titeln ([review <id>]) — stabilt även när kö-index förskjuts.
 * Skriptet är idempotent: det listar redan skapade issues (öppna OCH stängda,
 * så ett avgjort beslut aldrig återuppstår) och skapar bara det som saknas,
 * max SYNC_CAP per körning med paus emellan (GitHubs sekundära rate limits).
 *
 * Miljö: GITHUB_TOKEN (issues:write), GITHUB_REPOSITORY ("ägare/repo").
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";
import { ankarflagga } from "../src/utrakningen.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");
const LABEL = "review-kö";
const API = "https://api.github.com";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) {
  console.error("Kräver GITHUB_TOKEN och GITHUB_REPOSITORY.");
  process.exit(1);
}
const cap = Math.max(1, Number(process.env.SYNC_CAP ?? 60));
const sleepMs = Math.max(0, Number(process.env.SYNC_SLEEP_MS ?? 2000));

const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "utlovat-review-sync",
};

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...HEADERS, ...init?.headers } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} för ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Alla review-id:n som redan har ett issue (öppet eller stängt). */
async function existingIssueIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const batch = (await api(
      `/repos/${repo}/issues?labels=${encodeURIComponent(LABEL)}&state=all&per_page=100&page=${page}`,
    )) as Array<{ title: string }>;
    for (const issue of batch) {
      const m = issue.title.match(/^\[review ([0-9a-f]{12})\]/u);
      if (m) ids.add(m[1]!);
    }
    if (batch.length < 100) break;
  }
  return ids;
}

/** Öppna review-issues med nummer + review-id (för vaktmästarstädningen). */
async function openIssues(): Promise<Array<{ number: number; id: string }>> {
  const out: Array<{ number: number; id: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const batch = (await api(
      `/repos/${repo}/issues?labels=${encodeURIComponent(LABEL)}&state=open&per_page=100&page=${page}`,
    )) as Array<{ number: number; title: string }>;
    for (const issue of batch) {
      const m = issue.title.match(/^\[review ([0-9a-f]{12})\]/u);
      if (m) out.push({ number: issue.number, id: m[1]! });
    }
    if (batch.length < 100) break;
  }
  return out;
}

function fmtMsek(n: number): string {
  return n >= 1000 ? `${(n / 1000).toLocaleString("sv-SE")} mdkr` : `${n.toLocaleString("sv-SE")} msek`;
}

function issueBody(entry: ReviewCandidate, id: string): string {
  const cand = (entry.candidate ?? {}) as {
    title?: string; parties?: string[]; quote?: string; category?: string;
    person?: { name: string; role: string } | null; amount_in_text_msek?: number | null;
  };
  const reasons: string[] = [];
  for (const f of entry.failures ?? []) reasons.push(`**${f.gate}**: ${f.reason}`);
  if (entry.verifyReason) reasons.push(`**Verify**: ${entry.verifyReason}`);
  if (entry.costReason) reasons.push(`**Kostnad**: ${entry.costReason}`);
  if (entry.manualReason) reasons.push(`**Manuell**: ${entry.manualReason}`);
  if (entry.duplicateOf) {
    reasons.push(
      `**Möjlig dublett av** \`${entry.duplicateOf}\`` +
        (entry.duplicateReason ? ` — ${entry.duplicateReason}` : ""),
    );
  }

  // Ankaret: en nolla som citatet självt motsäger. Flaggan säger till den som
  // ska besluta att beloppet troligen ska ankras i vad åtgärden kostar i dag —
  // den ändrar ingenting och hindrar ingenting. Se `utrakningen.ts` kontroll 6.
  if (entry.cost) {
    // Kön bär ofta motiveringen i method_note och inte i calculation; ankaret
    // ska läsa det som faktiskt står, oavsett vilket av fälten det står i.
    const skal = [entry.cost.calculation ?? "", entry.cost.method_note ?? ""].join(" ").trim();
    const atgard = ankarflagga(cand.quote ?? "", { msek_base: entry.cost.msek_base, calculation: skal });
    if (atgard !== null) {
      reasons.push(
        `**Ankaret**: nollad, men citatet namnger \`${atgard}\` — en åtgärd som redan finns och ` +
          `har en känd kostnad. Ankra beloppet i vad den senast kostade i stället för att nolla ` +
          `den som inriktning.`,
      );
    }
  }

  const lines: string[] = [];
  lines.push(`**Parti:** ${(cand.parties ?? []).map((p) => p.toUpperCase()).join(", ") || "?"}`);
  lines.push(`**Kategori:** ${cand.category ?? "övrigt"}`);
  if (cand.person) lines.push(`**Person:** ${cand.person.name} (${cand.person.role})`);
  lines.push(`**Källa:** ${entry.articleUrl}`);
  lines.push("");
  lines.push(`> ${(cand.quote ?? "(citat saknas)").replace(/\n/gu, "\n> ")}`);
  lines.push("");
  // En post utan uträkning har inget föreslaget belopp, hur mycket siffror den
  // än bär. Nollan i en havererad kostnadspost är ingen bedömning, och att
  // visa den under rubriken «Föreslagen kostnad» säger motsatsen — därför får
  // de posterna en egen rubrik som säger vad som faktiskt krävs.
  const harUtrakning = ((entry.cost?.calculation ?? "").trim()) !== "";
  if (entry.cost && harUtrakning) {
    const c = entry.cost;
    lines.push(`### Föreslagen kostnad: ${fmtMsek(c.msek_base)} per år`);
    lines.push(`Spann ${fmtMsek(c.msek_low)} – ${fmtMsek(c.msek_high)} · basis \`${c.basis}\` · confidence ${c.confidence}`);
    lines.push("");
    lines.push(`**Uträkning:** ${c.calculation}`);
    lines.push(`**Motivering:** ${c.method_note || "(saknas)"}`);
    if (cand.amount_in_text_msek != null) {
      lines.push(`**Belopp i källtexten:** ${cand.amount_in_text_msek} msek`);
    }
  } else {
    lines.push(`### ⚠️ Kräver belopp och uträkning för hand`);
    lines.push(
      entry.cost
        ? "Kostnadssteget gick inte igenom för den här posten. Siffrorna nedan är " +
            "platshållare och inte ett förslag."
        : "Posten kom aldrig fram till kostnadssteget.",
    );
    if (entry.cost) {
      const c = entry.cost;
      lines.push("");
      lines.push(`<sub>platshållare: ${fmtMsek(c.msek_low)} / ${fmtMsek(c.msek_base)} / ${fmtMsek(c.msek_high)} · ${c.method_note || ""}</sub>`);
    }
    lines.push("");
    lines.push("Godkännandet kräver båda:");
    lines.push("");
    lines.push("```");
    lines.push("/godkänn <low> <base> <high>");
    lines.push("Uträkning: …");
    lines.push("```");
    if (cand.amount_in_text_msek != null) {
      lines.push("");
      lines.push(`**Belopp i källtexten:** ${cand.amount_in_text_msek} msek`);
    }
  }
  lines.push("");
  if (reasons.length > 0) {
    lines.push(`### Varför flaggad`);
    for (const r of reasons) lines.push(`- ${r}`);
    lines.push("");
  }
  lines.push(`### Ditt beslut`);
  lines.push("| Beslut | Snabbast (etikett — funkar i bulk från listvyn) | Kommentar |");
  lines.push("|---|---|---|");
  lines.push("| ✅ Ja | sätt `beslut:godkänn` | `/godkänn` |");
  lines.push("| ✏️ Ja, med ändrat belopp | — | `/godkänn <low> <base> <high>` (msek) |");
  if (entry.duplicateOf) lines.push(`| 🔗 Ja, länka som dublett | — | \`/godkänn --group ${entry.duplicateOf}\` |`);
  lines.push("| ❌ Nej | sätt `beslut:avvisa` | `/avvisa <skäl>` |");
  lines.push("");
  lines.push(`<sub>review-id \`${id}\` · beslutet exekveras av review-workflown och committas till main — full spårbarhet i git + detta issue.</sub>`);
  return lines.join("\n");
}

const items = JSON.parse(readFileSync(join(DATA_DIR, "needs_review.json"), "utf8")) as ReviewCandidate[];
console.log(`Kön: ${items.length} poster. Hämtar befintliga issues …`);
const existing = await existingIssueIds();
console.log(`Redan issue-satta: ${existing.size}.`);

let created = 0;
for (const entry of items) {
  if (created >= cap) {
    console.log(`Nådde SYNC_CAP=${cap} — resten tas nästa synk.`);
    break;
  }
  const id = reviewId(entry);
  if (existing.has(id)) continue;
  const cand = (entry.candidate ?? {}) as { title?: string; parties?: string[] };
  const parti = (cand.parties ?? ["?"]).map((p) => p.toUpperCase()).join(",");
  const title = `[review ${id}] ${parti} — ${(cand.title ?? entry.articleTitle ?? "okänt löfte").slice(0, 120)}`;
  await api(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title,
      body: issueBody(entry, id),
      labels: [LABEL, ...(cand.parties ?? []).map((p) => `parti:${p}`)],
    }),
  });
  created++;
  console.log(`  skapade ${title.slice(0, 90)}`);
  if (sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
}
console.log(`Klart: ${created} nya issues, ${existing.size} fanns sedan tidigare.`);

// ── Vaktmästaren: stäng öppna issues vars kö-post inte längre finns —
// posten har hanterats utanför issue-flödet (review-CLI, bulk-revision).
// Beslutet och skälet är spårat i git (needs_review-diffen + changelog);
// issuet är bara ett fönster mot kön och ska inte stå öppet mot tomhet.
const queueIds = new Set(items.map((e) => reviewId(e)));
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
      body: "🧹 Posten har hanterats utanför issue-flödet (review-CLI/revision) — se git-historiken för needs_review.json för beslutet. Stänger.",
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
