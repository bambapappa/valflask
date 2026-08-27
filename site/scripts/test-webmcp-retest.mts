/**
 * Oberoende WebMCP-retest av Hermes F1–F6.
 *
 * Kör den genererade klienten som en extern konsument med ett eget,
 * adversariellt dataurval. Testet importerar inte webmcp.ts och kan därför
 * fånga när den checkade-in klienten eller dess observerbara kontrakt glider.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

let errors = 0;
function check(label: string, ok: boolean): void { console.log(`${ok ? "OK" : "FEL"} ${label}`); if (!ok) errors++; }

type Tool = { name: string; execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };
const client = readFileSync(resolve(import.meta.dirname, "../public/webmcp.js"), "utf8");
const registered = new Map<string, Tool>();
const fetches: Record<string, number> = {};
let navigation = "";

function element(): Record<string, unknown> {
  return {
    append: () => undefined, replaceChildren: () => undefined, setAttribute: () => undefined,
    addEventListener: () => undefined, scrollIntoView: () => undefined,
  };
}

const responses: Record<string, unknown> = {
  "/api/v1/promises.json": { data: [
    { id: "p-2026-1001", title: "Satsning på skolan", slug: "skolan", parties: ["s"], quote: "Vi stärker skolan.", date_stated: "2026-01-01", category: "skola", status: "aktiv", source: { url: "https://source.example/s", domain: "source.example", archive_url: "https://archive.example/s" }, cost: { msek_low: 10, msek_high: 20, period: "per_ar" } },
    { id: "p-2026-1002", title: "Engångslyft för skolan", slug: "engang", parties: ["m"], quote: "Vi gör ett engångslyft för skolan.", date_stated: "2026-01-02", category: "skola", status: "aktiv", source: { url: "https://source.example/m", domain: "source.example", archive_url: "https://archive.example/m" }, cost: { msek_low: 30, msek_high: 40, period: "engang" } },
    { id: "p-2026-1003", title: "Oarkiverad skola", slug: "oarkiverad", parties: ["m"], quote: "Vi vill göra mer för skolan.", date_stated: "2026-01-03", category: "skola", status: "aktiv", source: { url: "https://source.example/missing", domain: "source.example", archive_url: null }, cost: { msek_low: 1, msek_high: 2, period: "per_ar" } },
  ] },
  "/api/v1/stances.json": { stances: [{ party: "m", subquestion_id: "sq-school", current: { statement_id: null, position: "inget_tydligt_besked" }, statements: [], last_searched: "2026-08-26" }] },
  "/api/v1/issues.json": { issues: [{ title: "Skolan", slug: "skolan", category: "skola", subquestions: [{ id: "sq-school", text: "Mer resurser till skolan?" }] }] },
  "/api/v1/integrity.json": { data_hash: "r".repeat(64) },
  "/api/v1/summary.json": { data: { data_hash: "r".repeat(64), parties: [] } },
  "/api/v1/promise-traces.json": { data: {} },
};

runInNewContext(client, {
  document: {
    modelContext: { registerTool: async (tool: Tool) => { registered.set(tool.name, tool); } },
    createElement: () => element(), createTextNode: () => element(), getElementById: () => undefined,
    body: { append: () => undefined },
  },
  fetch: async (path: string) => {
    fetches[path] = (fetches[path] ?? 0) + 1;
    return { ok: true, json: async () => responses[path] };
  },
  window: { location: { pathname: "/granska", search: "", assign: (url: string) => { navigation = url; } } },
  console, URL, URLSearchParams, Object, Map, Set, Promise, Array, Math,
});
await new Promise((resolve) => setTimeout(resolve, 10));

const search = registered.get("search_verified_evidence");
const brief = registered.get("build_research_brief");
check("retest startar från den byggda klienten", Boolean(search && brief));
if (search && brief) {
  const normal = await search.execute({ party_codes: ["s", "m"], query: "Jämför S och M om skolan", kind: "alla", max_results: 20 });
  const evidence = normal.evidence as Array<{ detail: string }>;
  const unclear = normal.recorded_no_clear as Array<{ party_code: string; last_searched?: string }>;
  check("F1: registrerat otydligt besked redovisas med sökdatum", unclear.some((item) => item.party_code === "m" && item.last_searched === "2026-08-26"));
  check("F4: neutral svensk frågeformulering matchar skolan/skola", evidence.length === 3);
  check("F6: årlig kostnad visar fyrårigt antagande", evidence.some((item) => item.detail.includes("årlig kostnad × 4") && item.detail.includes("fyraårigt mandatperiodsantagande")));
  check("F6: engångskostnad multipliceras inte", evidence.some((item) => item.detail.includes("engångskostnad") && !item.detail.includes("årlig kostnad × 4")));

  const archiveOnly = await search.execute({ party_codes: ["s", "m"], query: "skolan", kind: "loften", require_archive_copy: true, max_results: 20 });
  check("F3: arkivfiltret redovisar bortfall per parti", (archiveOnly.archive_excluded_by_party as Record<string, number>).m === 1);

  const shared = await brief.execute({ party_codes: ["s", "m"], category: "skola", query: "skolan", kind: "loften" });
  check("F2: kategori följer med i delningslänken", String(shared.brief_url).includes("category=skola") && navigation === shared.brief_url);
  check("F5: alla kort återanvänder samma publika datahämtning", ["/api/v1/promises.json", "/api/v1/stances.json", "/api/v1/issues.json", "/api/v1/integrity.json"].every((path) => fetches[path] === 1));
}

if (errors) process.exit(1);
