import { getParties, getPromises } from "../../../lib/data";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const parties = getParties();
  const promises = getPromises();
  const data_hash = computeDataHash(promises);
  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    license: "CC-BY-4.0",
    data: parties.map((p) => ({
      code: p.code,
      name: p.name,
      color: p.color,
      color_text: p.color_text,
      mandate_2022: p.mandate_2022,
      votes_2022: p.votes_2022,
      block: p.block,
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
