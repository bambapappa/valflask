import { getPromises, getParties, getChronicles } from "../lib/data";
import { promiseTotalMsek } from "../lib/aggregates";
import { formatMsek } from "../lib/calc";

export const prerender = true;

export async function GET() {
  const BASE = "https://drygast.nu";
  const promises = getPromises();
  const parties = getParties();

  const chronicleItems = getChronicles()
    .sort((a, b) => b.slug.localeCompare(a.slug))
    .map((c) => {
      const link = `${BASE}/veckans-flask/${c.slug}`;
      return `    <item>
      <title>${escapeXml(`Veckans fläsk v${c.week}: ${c.headline}`)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <description>${escapeXml(c.headline)}</description>
      <pubDate>${new Date(c.generated_at).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const promiseItems = promises
    .filter((p) => p.status !== "tillbakadragen")
    .sort((a, b) => b.date_stated.localeCompare(a.date_stated))
    .slice(0, 50)
    .map((p) => {
      const partyNames = p.parties.map((c) => parties.find((pp) => pp.code === c)?.name || c).join(", ");
      const total = formatMsek(promiseTotalMsek(p), p.cost.basis);
      const link = `${BASE}/lofte/${p.id}/${p.slug}`;
      const pubDate = new Date(p.date_stated).toUTCString();
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid>${BASE}/lofte/${p.id}</guid>
      <description>${escapeXml(`${partyNames} lovar: ${p.title}. Kostnad: ${total}.`)}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>drygast.nu — Vallöften 2026</title>
    <link>${BASE}</link>
    <description>Oberoende, källspårad sammanställning av svenska riksdagspartiers vallöften inför valet 2026.</description>
    <language>sv</language>
    <atom:link href="${BASE}/rss.xml" rel="self" type="application/rss+xml" />
${[chronicleItems, promiseItems].filter(Boolean).join("\n")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
