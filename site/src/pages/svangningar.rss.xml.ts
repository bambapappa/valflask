import { getParties } from "../lib/data";
import { getIssuesFile, getStances, allChanges, POSITION_LABEL, KIND_LABEL } from "../lib/stances";

export const prerender = true;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const BASE = "https://drygast.nu";
  const issuesFile = getIssuesFile();
  const parties = getParties();
  const changes = allChanges(issuesFile.issues, getStances()).slice(0, 100);

  const items = changes
    .map((ch) => {
      const partyName = parties.find((p) => p.code === ch.party)?.name ?? ch.party;
      const link = `${BASE}/fraga/${ch.issue.slug}#${ch.subquestion.id}-${ch.party}`;
      const title = `${partyName}: ${POSITION_LABEL[ch.from.position]} → ${POSITION_LABEL[ch.to.position]} om ${ch.issue.title.toLowerCase()} (${KIND_LABEL[ch.kind].toLowerCase()})`;
      const description =
        `${ch.subquestion.text} ` +
        `Då (${ch.from.date_stated}): ”${ch.from.quote}” ` +
        `Nu (${ch.to.date_stated}): ”${ch.to.quote}” ` +
        `Båda beskeden med källa och arkivkopia på drygast.nu.`;
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${link}</link>
      <guid>${BASE}/svangningar#${ch.from.id}-${ch.to.id}</guid>
      <description>${escapeXml(description)}</description>
      <pubDate>${new Date(ch.date).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>drygast.nu — Svängregistret</title>
    <link>${BASE}/svangningar</link>
    <description>Varje gång ett riksdagsparti ändrar sitt besked i en av valets stora frågor: gamla och nya beskedet, båda med ordagrant citat, källa och arkivkopia. Ren datasortering.</description>
    <language>sv</language>
    <atom:link href="${BASE}/svangningar.rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
