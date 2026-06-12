import { getPromises, getParties, getPeople } from "../lib/data";

export const prerender = true;

export async function GET() {
  const BASE = "https://drygast.nu";
  const promises = getPromises();
  const parties = getParties();
  const people = getPeople();

  const urls: Array<{ loc: string; changefreq: string; priority: string }> = [];

  urls.push({ loc: `${BASE}/`, changefreq: "daily", priority: "1.0" });

  urls.push({ loc: `${BASE}/api`, changefreq: "weekly", priority: "0.7" });
  urls.push({ loc: `${BASE}/metod`, changefreq: "monthly", priority: "0.5" });
  urls.push({ loc: `${BASE}/om`, changefreq: "monthly", priority: "0.3" });
  urls.push({ loc: `${BASE}/press`, changefreq: "monthly", priority: "0.3" });
  urls.push({ loc: `${BASE}/rattelser`, changefreq: "weekly", priority: "0.3" });
  urls.push({ loc: `${BASE}/jamfor`, changefreq: "weekly", priority: "0.8" });
  urls.push({ loc: `${BASE}/regeringar`, changefreq: "weekly", priority: "0.7" });
  urls.push({ loc: `${BASE}/topplistor`, changefreq: "weekly", priority: "0.7" });
  urls.push({ loc: `${BASE}/sok`, changefreq: "monthly", priority: "0.6" });

  for (const p of parties) {
    urls.push({ loc: `${BASE}/parti/${p.code}`, changefreq: "daily", priority: "0.9" });
  }

  for (const p of promises) {
    urls.push({ loc: `${BASE}/lofte/${p.id}/${p.slug}`, changefreq: "weekly", priority: "0.8" });
  }

  urls.push({ loc: `${BASE}/veckans-flask/2026-24`, changefreq: "weekly", priority: "0.6" });

  const peopleWithPromises = people.filter((person) =>
    promises.some((p) => p.person?.name === person.name)
  );
  for (const person of peopleWithPromises) {
    urls.push({ loc: `${BASE}/ledamot/${person.slug}`, changefreq: "weekly", priority: "0.6" });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
