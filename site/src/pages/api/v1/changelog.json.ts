import { getChangelog, getPromises } from "../../../lib/data";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const changelog = getChangelog();
  const promises = getPromises();
  const data_hash = computeDataHash(promises);
  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    license: "CC-BY-4.0",
    data: changelog,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
