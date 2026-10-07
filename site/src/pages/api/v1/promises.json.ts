import { apiCost } from "../../../lib/kostnadsvisning";
import { getPromises } from "../../../lib/data";
import { computeDataHash } from "../../../lib/canonical";
import { valdagKategori, regeringKategori } from "../../../lib/loftesfilter";

import { REGERINGSGRANS_2026 } from "../../../lib/regeringsgrans";

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
    valdag_kategori: valdagKategori(p),
    regering_kategori: regeringKategori(p),
    source: { url: p.source.url, domain: p.source.domain, archive_url: p.source.archive_url, date_basis: p.source.date_basis ?? null },
    category: p.category,
    cost: apiCost(p),
    financing_claimed: { described: p.financing_claimed.described, summary: p.financing_claimed.summary, msek: p.financing_claimed.msek },
    comparisons: p.comparisons,
    quip: p.quip,
    status: p.status,
  }));

  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    license: "CC-BY-4.0",
    regeringsgrans: { milstolpe: "government_assumes_office", ...REGERINGSGRANS_2026 },
    data: cleaned,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
