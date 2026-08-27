import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

let errors = 0;
function check(label: string, ok: boolean): void { console.log(`${ok ? "OK" : "FEL"} ${label}`); if (!ok) errors++; }

const source = readFileSync(resolve(import.meta.dirname, "../src/scripts/webmcp.ts"), "utf8");
const client = readFileSync(resolve(import.meta.dirname, "../public/webmcp.js"), "utf8");
const expectedClient = stripTypeScriptTypes(source).replace(/[\t ]+$/gm, "");

check("den publicerade klienten är byggd från TypeScript-källan", client === expectedClient);
check("klienten innehåller ingen rad med enbart blanktecken", !/^[\t ]+$/m.test(client));
check("använder bara publika API-ytor", !client.includes("OPENAI_API_KEY") && client.includes('"/api/v1/promises.json"'));

type Tool = { name: string; annotations: { readOnlyHint: boolean }; execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };
const registered = new Map<string, Tool>();
let board: { id?: string } | undefined;
function node(): Record<string, unknown> {
  return {
    append: (...children: unknown[]) => { for (const child of children) if (child && typeof child === "object" && (child as { id?: string }).id === "webmcp-evidence-board") board = child as { id?: string }; },
    replaceChildren: () => undefined,
    setAttribute: () => undefined,
    addEventListener: () => undefined,
    scrollIntoView: () => undefined,
  };
}
const responses: Record<string, unknown> = {
  "/api/v1/promises.json": { data: [{ id: "p-1", title: "Ett löfte", slug: "ett-lofte", parties: ["s"], quote: "Vi lovar", date_stated: "2026-01-02", category: "skola", status: "aktiv", source: { url: "https://example.test/lofte", domain: "example.test", archive_url: "https://archive.test/lofte" }, cost: { msek_low: 100, msek_high: 200, period: "per_ar" } }] },
  "/api/v1/stances.json": { stances: [
    { party: "s", subquestion_id: "sq-1", current: { statement_id: "st-1", position: "ja" }, statements: [{ id: "st-1", position: "ja", quote: "Vi säger ja", date_stated: "2026-01-03", source: { url: "https://example.test/besked", domain: "example.test", archive_url: null } }] },
    { party: "m", subquestion_id: "sq-1", current: { statement_id: null, position: "inget_tydligt_besked" }, statements: [], last_searched: "2026-08-26" },
  ] },
  "/api/v1/issues.json": { issues: [{ title: "Skolan", slug: "skolan", category: "skola", subquestions: [{ id: "sq-1", text: "Mer skola?" }] }] },
  "/api/v1/integrity.json": { data_hash: "h".repeat(64) },
  "/api/v1/summary.json": { data: { data_hash: "h".repeat(64), parties: [{ code: "s", name: "Socialdemokraterna", total_msek: 400, promises_count: 1, financing_gap_msek: 0 }] } },
};
let navigationUrl = "";
const fetches: Record<string, number> = {};
const document = {
  modelContext: { registerTool: async (tool: Tool) => { registered.set(tool.name, tool); } },
  createElement: () => node(),
  createTextNode: () => node(),
  getElementById: (id: string) => id === "webmcp-evidence-board" ? board : undefined,
  body: { append: (...children: unknown[]) => { for (const child of children) if (child && typeof child === "object" && (child as { id?: string }).id === "webmcp-evidence-board") board = child as { id?: string }; } },
};

runInNewContext(client, {
  document,
  fetch: async (path: string) => {
    fetches[path] = (fetches[path] ?? 0) + 1;
    return { ok: true, json: async () => responses[path] };
  },
  window: { location: { assign: (url: string) => { navigationUrl = url; } } },
  console, URL, URLSearchParams, Object, Map, Set, Promise, Array, Math,
});
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 0));

const evidenceTool = registered.get("search_verified_evidence");
const briefTool = registered.get("build_research_brief");
const comparisonTool = registered.get("show_party_comparison");
const evidenceStatusTool = registered.get("get_evidence_board_status");
check("registrerar fyra läsande verktyg", registered.size === 4 && evidenceTool?.annotations.readOnlyHint === true && briefTool?.annotations.readOnlyHint === true && comparisonTool?.annotations.readOnlyHint === true && evidenceStatusTool?.annotations.readOnlyHint === true);
if (evidenceTool) {
  const result = await evidenceTool.execute({ party_codes: ["s"], kind: "alla", max_results: 12 });
  check("läser API-kuvertens faktiska former", result.result_count === 2 && Array.isArray(result.evidence));
  check("visar samma citat på bevisbrädet", Boolean(board));
  check("märker nytt underlag som overifierat tills en människa kvitterar", (result.evidence_review as { status?: string }).status === "unverified");
  check("gör mandatperiodsantagandet synligt", (result.evidence as Array<{ detail: string }>).some((item) => item.detail.includes("årlig kostnad × 4") && item.detail.includes("fyraårigt mandatperiodsantagande")));
  const archived = await evidenceTool.execute({ party_codes: ["s"], kind: "alla", require_archive_copy: true });
  check("kan kräva arkivkopia utan att kalla den primärkälla", archived.result_count === 1 && String(archived.note).includes("inte en röstrekommendation"));
  const archiveGap = await evidenceTool.execute({ party_codes: ["s"], kind: "besked", require_archive_copy: true });
  check("redovisar belägg som faller på arkivkravet", (archiveGap.archive_excluded_by_party as Record<string, number>).s === 1);
} else {
  check("sökverktyget finns", false);
}
if (briefTool) {
  const result = await briefTool.execute({ party_codes: ["s", "m"], category: "skola", query: "Jämför S och M om skolan", kind: "alla", require_archive_copy: true });
  const missing = result.missing_party_codes;
  check("granskningskortet tolkar en neutral frågeformulering", result.evidence_count === 1 && Array.isArray(missing) && missing.includes("m"));
  check("granskningskortet redovisar registrerat otydligt besked", Array.isArray(result.recorded_no_clear) && result.recorded_no_clear.some((item: { party_code: string }) => item.party_code === "m"));
  check("granskningskortet har en delbar länk med hela urvalet", String(result.brief_url).includes("category=skola") && String(result.brief_url).includes("query=J%C3%A4mf%C3%B6r") && navigationUrl === result.brief_url);
} else {
  check("granskningsverktyget finns", false);
}
if (comparisonTool) {
  const result = await comparisonTool.execute({ party_codes: ["s"] });
  check("jämförelsen läser sitt API-kuvert och öppnar den synliga vyn", navigationUrl === "/jamfor?parties=s" && Array.isArray(result.parties));
} else {
  check("jämförelseverktyget finns", false);
}
if (evidenceStatusTool) {
  const result = await evidenceStatusTool.execute({});
  check("statusverktyget faller säkert tillbaka till overifierat", result.status === "unverified");
} else {
  check("statusverktyget finns", false);
}
check("återanvänder de delade bevis-API-svaren mellan verktyg", ["/api/v1/promises.json", "/api/v1/stances.json", "/api/v1/issues.json", "/api/v1/integrity.json"].every((path) => fetches[path] === 1));
if (errors) process.exit(1);
