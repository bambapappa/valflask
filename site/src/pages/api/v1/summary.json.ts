import { getPromises, getParties, getConstants, getChangelog } from "../../../lib/data";
import { buildSummary } from "../../../lib/aggregates";

export const prerender = true;

export async function GET() {
  const promises = getPromises();
  const parties = getParties();
  const constants = getConstants();
  const changelog = getChangelog();
  const summary = buildSummary(promises, parties, constants, changelog);

  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
