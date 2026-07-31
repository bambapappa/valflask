import { getPromises, getParties, getConstants, getChangelog } from "../lib/data";
import { buildSummary, promiseTotalMsek } from "../lib/aggregates";
import { formatMsek } from "../lib/calc";

export const prerender = true;

export async function GET() {
  const BASE = "https://drygast.nu";
  const promises = getPromises();
  const parties = getParties();
  const constants = getConstants();
  const changelog = getChangelog();
  const summary = buildSummary(promises, parties, constants, changelog);

  let md = `# drygast.nu — llms-full.txt

> Oberoende, källspårad sammanställning av svenska riksdagspartiers vallöften inför valet 2026-09-13.
> Alla belopp i miljoner kronor (mkr) eller miljarder kronor (mdkr) för mandatperioden 2027–2030.

## Sammanfattning

- Totalt antal löften: ${summary.total_promises}
- Totalt fläsket (utgifter + intäktsminskningar): ${formatMsek(summary.total_msek_flasket)}
- Totalt besparingar: ${formatMsek(summary.total_msek_besparingar)}
- Finansieringsgap: ${formatMsek(summary.financing_gap_msek)}
- Antal partier: ${summary.total_parties}

## Partiöversikt

| Parti | Totalt (mdkr) | Löften | Mandat |
|-------|---------------|--------|--------|
`;

  for (const p of summary.parties) {
    md += `| ${p.name} | ${formatMsek(p.total_msek)} | ${p.promises_count} | ${p.mandates} |\n`;
  }

  md += `
## Alla löften

`;

  for (const p of promises) {
    const partyNames = p.parties.map((c) => parties.find((pp) => pp.code === c)?.name || c).join(", ");
    const total = formatMsek(promiseTotalMsek(p), p.cost.basis);
    md += `### [${p.title}](${BASE}/lofte/${p.id}/${p.slug})

- ID: ${p.id}
- Parti: ${partyNames}
- Kategori: ${p.category}
- Kostnad: ${total} (${p.cost.period === "per_ar" ? "per år ×4" : "engång"})
- Källa: ${p.source.domain}
- Datum: ${p.date_stated}
- Status: ${p.status}
- Citat: "${p.quote.slice(0, 200)}${p.quote.length > 200 ? "…" : ""}"

`;
  }

  md += `## API

- Sammanfattning: ${BASE}/api/v1/summary.json
- Alla löften: ${BASE}/api/v1/promises.json
- Partier: ${BASE}/api/v1/parties.json
- Jämförelser: ${BASE}/api/v1/comparisons.json
- Changelog: ${BASE}/api/v1/changelog.json
- Integritet: ${BASE}/api/v1/integrity.json
- Frågevågen, frågorna: ${BASE}/api/v1/issues.json
- Frågevågen, partiernas besked: ${BASE}/api/v1/stances.json

## Metod

Se ${BASE}/metod

## Licens

CC BY 4.0 — ange "drygast.nu" som källa.
`;

  return new Response(md, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
