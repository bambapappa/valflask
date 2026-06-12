import { getPromises, getParties, getChangelog } from "../../../lib/data";
import { totalFlasket, dataHash } from "../../../lib/calc";

export const prerender = true;

export async function GET() {
  const promises = getPromises();
  const changelog = getChangelog();
  const active = promises.filter((p) => p.status !== "tillbakadragen");
  const flasket = totalFlasket(promises);
  const hash = dataHash(changelog);

  const summary = {
    generated_at: new Date().toISOString(),
    data_hash: hash,
    total_parties: 8,
    total_promises: active.length,
    total_msek_base: flasket,
    financing_gap_msek: 0,
  };
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
