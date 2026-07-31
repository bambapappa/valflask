import { getPromises } from "../../../lib/data";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const promises = getPromises();
  const data_hash = computeDataHash(promises);
  const cleaned = promises.map((p) => ({
    id: p.id,
    group_id: p.group_id,
    title: p.title,
    slug: p.slug,
    parties: p.parties,
    person: p.person ? { name: p.person.name, role: p.person.role } : null,
    quote: p.quote,
    date_stated: p.date_stated,
    source: { url: p.source.url, domain: p.source.domain, archive_url: p.source.archive_url },
    category: p.category,
    cost: { type: p.cost.type, period: p.cost.period, msek_low: p.cost.msek_low, msek_base: p.cost.msek_base, msek_high: p.cost.msek_high, basis: p.cost.basis },
    financing_claimed: { described: p.financing_claimed.described, summary: p.financing_claimed.summary, msek: p.financing_claimed.msek },
    comparisons: p.comparisons,
    quip: p.quip,
    status: p.status,
  }));

  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    license: "CC-BY-4.0",
    data: cleaned,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
