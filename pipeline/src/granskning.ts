/**
 * Granskningsflödet (H6) för kopplingsförslag — ägarens beslut, aldrig kodens.
 *
 * Samma mönster och samma kommandon som valflasks granskningskö
 * (/godkänn, /avvisa), egen etikett: koppling-kö. Kön
 * data/kopplingsforslag.json synkas till GitHub-issues, ägarens kommentar
 * exekveras av en workflow, godkända förslag flyttas till
 * data/kopplingar.json med status aktiv och verified_by "owner".
 *
 * Privat tills HV5: issues skapas i DETTA repo — aldrig i valflask före
 * lanseringsgrinden. Vid HV5 speglas flödet till valflask (spec §8).
 *
 * Ren logik utan fil- och nätverksåtkomst — CLI och workflowskript ligger i
 * scripts/koppling-granska.mts, koppling-issues.mts, koppling-kommentar.mts.
 */

import { createHash } from "node:crypto";
import type { Handling } from "./handlingar.ts";
import type { KopplingsForslag } from "./grindar.ts";
import { CITAT_MIN_TECKEN } from "./grindar.ts";
import { dokumentUrl } from "./riksdagen.ts";

/** En köpost i data/kopplingsforslag.json (skriven av scripts/foreslag.mts). */
export interface KoPost extends KopplingsForslag {
  skapad: string;
  extraction: { model: string; verified_by: string | null; run_id: string };
}

/** En fastställd koppling i data/kopplingar.json (kopplingar.schema.json). */
export interface KopplingPost {
  id: string;
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  riktning: "stodjer" | "motverkar";
  bevis: { citat: string; sida?: number | null; kalla_dok_id?: string };
  motionstyp?: "parti" | "kommitte" | "enskild";
  method_note: string;
  confidence: number;
  extraction: { model: string; verified_by: string | null; run_id: string };
  status: "aktiv" | "indragen";
}

/**
 * Stabilt id för en kö-post: hash av målets id + handlingens id — samma
 * nyckel som förslagsstegets dubblettskydd. Issue-titeln bär id:t, så
 * beslutet träffar rätt post oavsett hur kö-index förskjutits.
 */
export function kopplingId(post: Pick<KoPost, "promise_id" | "stance_id" | "handling_id">): string {
  const target = post.promise_id ?? post.stance_id ?? "";
  return createHash("sha256").update(`${target}::${post.handling_id}`).digest("hex").slice(0, 12);
}

export function findIndexByKopplingId(items: KoPost[], id: string): number {
  return items.findIndex((p) => kopplingId(p) === id);
}

export type GranskningsKommando =
  | { action: "approve"; motionstyp?: "parti" | "kommitte" | "enskild" }
  | { action: "reject"; reason: string };

const MOTIONSTYPER: Record<string, "parti" | "kommitte" | "enskild"> = {
  parti: "parti",
  kommitte: "kommitte",
  "kommitté": "kommitte",
  enskild: "enskild",
};

/**
 * Tolkar en issue-kommentar från ägaren till ett granskningsbeslut.
 *  /godkänn                        → ja, förslaget som det står
 *  /godkänn --motionstyp parti     → ja, och motionstypen sätts av granskaren
 *                                    (b-0007: "parti" sätts alltid av människa)
 *  /avvisa <skäl>                  → nej
 * Engelska alias: /approve, /reject. Endast FÖRSTA raden tolkas.
 * Okänt eller grumligt kommando ⇒ null (workflown svarar med hjälptext).
 */
export function parseGranskningsKommando(body: string): GranskningsKommando | null {
  const line = (body ?? "").trim().split("\n", 1)[0]!.trim();
  const approve = line.match(/^\/(?:godkänn|godkann|approve)\b(.*)$/iu);
  if (approve) {
    const rest = approve[1]!.trim();
    if (rest === "") return { action: "approve" };
    const m = rest.match(/^--motionstyp[= ]+(\S+)$/u);
    const typ = m ? MOTIONSTYPER[m[1]!.toLowerCase()] : undefined;
    if (!typ) return null; // något annat än ren motionstyp — be om förtydligande
    return { action: "approve", motionstyp: typ };
  }
  const reject = line.match(/^\/(?:avvisa|reject)\b(.*)$/iu);
  if (reject) {
    const reason = reject[1]!.trim();
    return { action: "reject", reason: reason === "" ? "avvisad via koppling-issue" : reason };
  }
  return null;
}

/** Nästa lediga kopplings-id: k-<år>-NNNN i stigande följd. */
export function nastaKopplingsId(kopplingar: Array<{ id: string }>, year: number): string {
  const max = kopplingar.reduce((acc, k) => {
    const m = k.id.match(/^k-\d{4}-(\d{4})$/u);
    return m ? Math.max(acc, parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `k-${year}-${String(max + 1).padStart(4, "0")}`;
}

/** Fel i granskningen som ska besvaras vänligt, inte krascha workflown. */
export class GranskningsFel extends Error {}

export interface GodkannResultat {
  kopplingar: KopplingPost[];
  ko: KoPost[];
  koppling: KopplingPost;
}

/**
 * Verkställer ett godkännande: validerar postens offlineinvariant­er
 * (H2:s ordagranna kontroll gjordes mot källtexten när förslaget skapades
 * och citatet är oförändrat sedan dess), flyttar posten ur kön och lägger
 * en aktiv koppling med verified_by "owner". Muterar inget — returnerar
 * nya listor.
 */
export function godkannForslag(
  ko: KoPost[],
  index: number,
  kopplingar: KopplingPost[],
  handlingar: Handling[],
  opts: { motionstyp?: "parti" | "kommitte" | "enskild"; year?: number } = {},
): GodkannResultat {
  const post = ko[index];
  if (!post) throw new GranskningsFel(`Ogiltigt kö-index ${index} — kön har ${ko.length} poster.`);
  const handling = handlingar.find((h) => h.id === post.handling_id);
  if (!handling) {
    throw new GranskningsFel(`Handlingen ${post.handling_id} finns inte i handlingar.json — kan inte godkännas.`);
  }
  if (!post.promise_id && !post.stance_id) {
    throw new GranskningsFel("Posten pekar varken på löfte eller ståndpunkt.");
  }
  if (post.riktning !== "stodjer" && post.riktning !== "motverkar") {
    throw new GranskningsFel(`Okänd riktning: "${String(post.riktning)}".`);
  }
  if ((post.bevis?.citat ?? "").length < CITAT_MIN_TECKEN) {
    throw new GranskningsFel(`Citatet är kortare än ${CITAT_MIN_TECKEN} tecken — förslaget är trasigt, avvisa det.`);
  }
  if ((post.method_note ?? "").trim() === "") {
    throw new GranskningsFel("Posten saknar motivering (method_note).");
  }
  if (opts.motionstyp && handling.kind !== "motion") {
    throw new GranskningsFel(`--motionstyp gäller bara motioner — ${post.handling_id} är ${handling.kind}.`);
  }
  const motionstyp = handling.kind === "motion" ? (opts.motionstyp ?? post.motionstyp) : undefined;
  if (handling.kind === "motion" && !motionstyp) {
    throw new GranskningsFel("Motion utan motionstyp — ange /godkänn --motionstyp parti|kommitte|enskild (b-0007).");
  }

  const year = opts.year ?? new Date().getFullYear();
  const koppling: KopplingPost = {
    id: nastaKopplingsId(kopplingar, year),
    ...(post.promise_id ? { promise_id: post.promise_id } : {}),
    ...(post.stance_id ? { stance_id: post.stance_id } : {}),
    handling_id: post.handling_id,
    riktning: post.riktning,
    bevis: { ...post.bevis },
    ...(motionstyp ? { motionstyp } : {}),
    method_note: post.method_note,
    confidence: post.confidence,
    extraction: { ...post.extraction, verified_by: "owner" },
    status: "aktiv",
  };
  return {
    kopplingar: [...kopplingar, koppling].sort((a, b) => a.id.localeCompare(b.id)),
    ko: ko.filter((_, i) => i !== index),
    koppling,
  };
}

export interface AvvisaResultat {
  ko: KoPost[];
  post: KoPost;
}

/**
 * Verkställer en avvisning: posten lyfts ur kön. Skälet spåras i
 * issuekommentaren och i gitdiffen — kön är ingen publicerad data, så
 * ingen rättelsenot behövs (samma princip som valflask).
 */
export function avvisaForslag(ko: KoPost[], index: number): AvvisaResultat {
  const post = ko[index];
  if (!post) throw new GranskningsFel(`Ogiltigt kö-index ${index} — kön har ${ko.length} poster.`);
  return { ko: ko.filter((_, i) => i !== index), post };
}

/** Löftesfält issue-texten visar när valflask-datat finns till hands. */
export interface LofteInfo {
  id: string;
  title?: string;
  quote?: string;
  parties?: string[];
}

export function byggIssueTitel(post: KoPost, id: string, handling?: Handling): string {
  const target = post.promise_id ?? post.stance_id ?? "?";
  const kind = handling ? ` (${handling.kind})` : "";
  return `[koppling ${id}] ${target} ↔ ${post.handling_id}${kind}`;
}

/**
 * Issue-texten: allt ägaren behöver för H6-beslutet — löftet, handlingen,
 * riktningen, det ordagranna citatet med källänk, motiveringen — plus
 * beslutstabellen. Ren funktion, testbar utan GitHub.
 */
export function byggIssueBody(post: KoPost, id: string, handling?: Handling, lofte?: LofteInfo): string {
  const lines: string[] = [];
  const target = post.promise_id ?? post.stance_id ?? "?";

  lines.push(`### Löfte/ståndpunkt`);
  if (lofte?.title) {
    lines.push(`**${lofte.title}** (\`${target}\`${lofte.parties?.length ? `, ${lofte.parties.map((p) => p.toUpperCase()).join(", ")}` : ""})`);
    if (lofte.quote) lines.push(`> ${lofte.quote.replace(/\n/gu, "\n> ")}`);
  } else {
    lines.push(`\`${target}\` — titel och citat finns i valflask \`data/promises.json\`.`);
  }
  lines.push("");

  lines.push(`### Riksdagshandling`);
  if (handling) {
    lines.push(`**${handling.titel}** (\`${handling.id}\`, ${handling.kind}, ${handling.datum})`);
    lines.push(`Källa: ${handling.url}`);
    if (handling.kind === "votering" && handling.utfall) lines.push(`Kammarens utfall: **${handling.utfall}**.`);
  } else {
    lines.push(`\`${post.handling_id}\` — SAKNAS i handlingar.json; godkännande kommer att stoppas.`);
  }
  lines.push("");

  lines.push(`### Föreslagen koppling`);
  const riktningsord = post.riktning === "stodjer" ? "stödjer" : "motverkar";
  if (handling?.kind === "votering") {
    lines.push(`**Riktning:** ett bifall (Ja) i voteringen **${riktningsord}** löftet — partiernas och ledamöternas faktiska röster ger sedan utslaget i domsmotorn.`);
  } else {
    lines.push(`**Riktning:** handlingen **${riktningsord}** löftet.`);
  }
  lines.push("");
  lines.push(`> ${post.bevis.citat.replace(/\n/gu, "\n> ")}`);
  lines.push("");
  if (post.bevis.kalla_dok_id) {
    lines.push(`Citatet står i betänkandet: ${dokumentUrl(post.bevis.kalla_dok_id)} — kontrollerat ord för ord mot dess text när förslaget skapades.`);
  } else {
    lines.push(`Citatet är kontrollerat ord för ord mot handlingens text när förslaget skapades.`);
  }
  lines.push(`**Motivering:** ${post.method_note}`);
  lines.push(`**Confidence:** ${post.confidence} · modell \`${post.extraction.model}\` · körning \`${post.extraction.run_id}\``);
  if (handling?.kind === "motion") {
    lines.push(`**Motionstyp (förslag):** ${post.motionstyp ?? "saknas"} — "parti" sätts alltid av granskaren (b-0007).`);
  }
  lines.push("");

  lines.push(`### Ditt beslut`);
  lines.push("| Beslut | Kommentar |");
  lines.push("|---|---|");
  lines.push("| ✅ Ja | `/godkänn` |");
  if (handling?.kind === "motion") {
    lines.push("| ✏️ Ja, med motionstyp satt av dig | `/godkänn --motionstyp parti` (eller `kommitte`/`enskild`) |");
  }
  lines.push("| ❌ Nej | `/avvisa <skäl>` |");
  lines.push("");
  lines.push(`<sub>koppling-id \`${id}\` · beslutet exekveras av koppling-review-workflown och committas — full spårbarhet i git + detta issue. Grindarna H1–H5 passerades när förslaget skapades; detta är H6, ägarens beslut.</sub>`);
  return lines.join("\n");
}
