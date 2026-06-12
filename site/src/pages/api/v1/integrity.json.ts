import { getPromises } from "../../../lib/data";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const promises = getPromises();
  const data_hash = computeDataHash(promises);
  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    algorithm: "sha256",
    canonical_source: "promises.json",
    license: "CC-BY-4.0",
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
