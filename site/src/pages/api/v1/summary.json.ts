import { getPromises, getParties, getConstants, getChangelog } from "../../../lib/data";
import { buildSummary } from "../../../lib/aggregates";

export const prerender = true;

export async function GET() {
  const promises = getPromises();
  const parties = getParties();
  const constants = getConstants();
  const changelog = getChangelog();
  const summary = buildSummary(promises, parties, constants, changelog);

  const body = {
    generated_at: summary.generated_at,
    data_hash: summary.data_hash,
    license: "CC-BY-4.0",
    data: summary,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
