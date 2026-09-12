import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { svenskDag } from "./dagen.ts";
import { harledLoftestyp } from "./loftestyp.ts";
import type { CostShape, ReviewCandidate } from "./review.ts";

export interface PromiseEntry {
  /** Reform eller inriktning. Härleds ur citatet och prissättningen. */
  loftestyp?: "reform" | "inriktning";
  id: string;
  group_id: string | null;
  title: string;
  slug: string;
  parties: string[];
  person: { name: string; role: string } | null;
  quote: string;
  date_stated: string;
  source: { url: string; domain: string; archive_url: string | null; fetched_at: string };
  category: string;
  cost: Record<string, unknown>;
  financing_claimed: Record<string, unknown>;
  comparisons: string[];
  quip: string | null;
  status: string;
  history: unknown[];
  extraction: Record<string, unknown>;
}

function slugify(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s : "lofte";
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return ""; // manuell källa kan vara fritext (t.ex. "SVT Aktuellt, rikssänt")
  }
}

function nextId(promises: PromiseEntry[]): string {
  const maxNum = promises.reduce((max, p) => {
    const m = p.id.match(/^p-2026-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
  }, 0);
  return `p-2026-${String(maxNum + 1).padStart(4, "0")}`;
}

export interface FrystLoftesforslag {
  version: "loftesforslag/1";
  fore: { loften: string; kopost: string };
  tidpunkt: string;
  nyttLofte: PromiseEntry;
  gruppandring: PromiseEntry | null;
  hash: string;
}

function hash(value: unknown): string {
  return createHash("sha256").update(kanoniskJson(value)).digest("hex");
}

/** Skapar en slutform utan skrivning eller attest. Klockan läses bara av anroparen. */
export function forberedLoftesforslag(
  item: ReviewCandidate,
  cost: CostShape,
  befintliga: PromiseEntry[],
  linkTo: string | undefined,
  nu: Date,
): FrystLoftesforslag {
  if (!item?.candidate?.quote?.trim() || !item.articleUrl?.trim() || !cost) {
    throw new Error("Förslaget saknar löftesunderlag");
  }
  if (new Set(befintliga.map((p) => p.id)).size !== befintliga.length) {
    throw new Error("Dubblerade löftesidentiteter i föreläget");
  }
  const promises = structuredClone(befintliga);
  const cand = item.candidate;
  const newId = nextId(promises);
  const title = cand.title ?? item.articleTitle ?? "Okänt löfte";

  // Dublettlänkning: dela group_id med målet (R3 räknar gruppen en gång).
  let group_id: string | null = null;
  let groupTargetModified = false;
  if (linkTo) {
    const target = promises.find((p) => p.id === linkTo);
    if (!target) {
      throw new Error(`Hittade inget löfte att länka till: ${linkTo}`);
    }
    group_id = target.group_id ?? `g-${linkTo}`;
    if (!target.group_id) {
      target.group_id = group_id;
      target.history.push({ date: svenskDag(nu), commit: "0000000",
        change: "Sammanförd med ytterligare ett löfte i samma grupp för gemensam beräkning." });
      groupTargetModified = true;
    }
  }

  const newPromise: PromiseEntry = {
    id: newId,
    group_id,
    // Sorten härleds ur citatet och prissättningen, samma regel som resten av
    // beståndet. Fältet sattes inte alls vid godkännandet: 164 löften
    // publicerade 2026-08-25 kom ut utan sort, och utan den går en nolla inte
    // att läsa — syns det inte om åtgärden är gratis eller om det inte finns
    // någon åtgärd att prissätta? Sorten styr dessutom kopplingssteget.
    loftestyp: harledLoftestyp(cand.quote ?? "", cost as never),
    title,
    slug: slugify(title),
    parties: cand.parties ?? [],
    person: cand.person ?? null,
    quote: cand.quote ?? "",
    date_stated: svenskDag(nu),
    source: {
      url: item.articleUrl,
      domain: domainOf(item.articleUrl),
      // Fylls av arkiv-backfillsteget (scripts/archive-backfill.mts) vid nästa
      // pipelinekörning — SPEC §6.2 "nytt försök nästa run tills satt".
      archive_url: null,
      fetched_at: nu.toISOString(),
    },
    category: cand.category ?? "övrigt",
    cost: { ...cost },
    // Beloppet i citatet är INTE en finansieringsuppgift. Fältet fylldes förut
    // med `amount_in_text_msek`, och då hamnade ISK-gränsen på 500 000 kronor,
    // barnavdragets 10 000 per barn och ett anslag på 16 miljoner i fältet för
    // vad partiet säger att löftet finansieras med — och drogs av från vad
    // partiernas löften kostar. Beskriver löftet ingen finansiering är fältet
    // tomt (rättat på p-2026-0463, p-2026-0465 och p-2026-0571).
    financing_claimed: {
      described: false,
      summary: null,
      msek: null,
    },
    comparisons: [],
    quip: null,
    status: "aktiv",
    history: [],
    extraction: {
      model: "review",
      verified_by: "owner",
      run_id: `review-${nu.toISOString().slice(0, 13)}`,
    },
  };

  const payload = {
    version: "loftesforslag/1" as const,
    fore: { loften: hash(befintliga), kopost: hash(item) },
    tidpunkt: nu.toISOString(),
    nyttLofte: newPromise,
    gruppandring: groupTargetModified ? promises.find((p) => p.id === linkTo)! : null,
  };
  return structuredClone({ ...payload, hash: hash(payload) });
}

/** Kontrollerar versionen och tar fram exakt sparade poster; fattar inget beslut. */
export function tillampaLoftesforslag(
  forslag: FrystLoftesforslag,
  befintliga: PromiseEntry[],
  item: ReviewCandidate,
  forvantadHash: string,
): PromiseEntry[] {
  const { hash: sparadHash, ...payload } = forslag;
  if (forslag.version !== "loftesforslag/1" || sparadHash !== forvantadHash || hash(payload) !== sparadHash) {
    throw new Error("Löftesförslaget har ändrats eller har okänd version");
  }
  if (hash(befintliga) !== forslag.fore.loften || hash(item) !== forslag.fore.kopost) {
    throw new Error("Löftesförslagets underlag har ändrats; förbered och pröva på nytt");
  }
  if (befintliga.some((p) => p.id === forslag.nyttLofte.id)) {
    throw new Error("Löftesförslagets nya identitet finns redan");
  }
  const group = forslag.gruppandring;
  if (group && !befintliga.some((p) => p.id === group.id)) {
    throw new Error("Löftesförslagets gruppmål saknas");
  }
  return structuredClone([
    ...befintliga.map((p) => group?.id === p.id ? group : p),
    forslag.nyttLofte,
  ]).sort((a, b) => a.id.localeCompare(b.id));
}
