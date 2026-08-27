import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeDataHash } from "../../../lib/canonical";
import { getPromises } from "../../../lib/data";

export const prerender = true;

type Link = {
  promise_id?: string;
  handling_id: string;
  riktning: "stodjer" | "motverkar";
  status: "aktiv" | "indragen";
  bevis?: { citat?: string };
  extraction?: { verified_by?: string | null };
};
type Action = {
  id: string;
  kind: string;
  titel: string;
  datum: string;
  organ?: string | null;
  dok_id: string;
  parties: string[];
  url: string;
  archive_url: string | null;
};
type Correction = { date: string; affects: string; what: string; why: string; commit?: string };

function handlingsData<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), "../handlingsvagen/data", filename), "utf8")) as T;
}

/**
 * A compact public projection of the reviewed promise-to-action edges.
 * Raw Handlingsvågen files are not shipped: this only contains the sources
 * a reader needs to trace an already-published connection.
 */
export async function GET() {
  const promises = getPromises();
  const knownPromiseIds = new Set(promises.map((promise) => promise.id));
  const actions = new Map(handlingsData<Action[]>("handlingar.json").map((action) => [action.id, action]));
  const corrections = handlingsData<Correction[]>("rattelser.json");
  const correctionCounts = new Map<string, number>();
  for (const correction of corrections) {
    for (const promiseId of knownPromiseIds) {
      if (correction.affects.includes(promiseId)) {
        correctionCounts.set(promiseId, (correctionCounts.get(promiseId) ?? 0) + 1);
      }
    }
  }
  const traces: Record<string, { actions: unknown[]; correction_count: number }> = {};

  for (const link of handlingsData<Link[]>("kopplingar.json")) {
    const promiseId = link.promise_id;
    if (link.status !== "aktiv" || !promiseId || !knownPromiseIds.has(promiseId)) continue;
    const action = actions.get(link.handling_id);
    if (!action) continue;
    const trace = (traces[promiseId] ??= {
      actions: [],
      correction_count: correctionCounts.get(promiseId) ?? 0,
    });
    trace.actions.push({
      connection_id: `${promiseId}:${link.handling_id}`,
      recorded_relation: link.riktning,
      link_evidence_quote: link.bevis?.citat ?? "",
      reviewed_by_human: link.extraction?.verified_by === "owner",
      action: {
        id: action.id,
        kind: action.kind,
        title: action.titel,
        date: action.datum,
        body: action.organ ?? null,
        document_id: action.dok_id,
        parties: action.parties,
        source_url: action.url,
        archive_url: action.archive_url,
      },
    });
  }

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    data_hash: computeDataHash(promises),
    license: "CC-BY-4.0",
    data: traces,
    note: "Kedjan visar granskade kopplingar och handlingarnas källor. Den avgör inte om ett löfte hölls eller bröts.",
  }, null, 2), { headers: { "Content-Type": "application/json" } });
}
