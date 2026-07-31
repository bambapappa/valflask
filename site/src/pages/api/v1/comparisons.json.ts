import { getPromises, getConstants } from "../../../lib/data";
import { computeComparisons } from "../../../lib/aggregates";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const promises = getPromises();
  const constants = getConstants();
  const data_hash = computeDataHash(promises);

  const comparisons = promises.map((p) => ({
    promise_id: p.id,
    title: p.title,
    comparisons: computeComparisons(p, constants).map((c) => ({
      label: c.label,
      computed: c.computed,
      unit: c.unit,
      kind: c.kind,
      unverifiable: c.unverifiable,
    })),
  }));

  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    license: "CC-BY-4.0",
    data: comparisons,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
