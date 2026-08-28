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

type Tool = { name: string; description: string; annotations: { readOnlyHint: boolean }; execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };
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
  "/api/v1/promises.json": { data: [
    { id: "p-2026-0001", title: "Ett löfte", slug: "ett-lofte", parties: ["s"], quote: "Vi lovar", date_stated: "2026-01-02", category: "skola", status: "aktiv", source: { url: "https://example.test/lofte", domain: "example.test", archive_url: "https://archive.test/lofte" }, cost: { msek_low: 100, msek_high: 200, period: "per_ar", basis: "llm_estimat" } },
    { id: "p-2026-0002", title: "Bygga fler bostäder", slug: "bygga-fler-bostader", parties: ["s"], quote: "Vi ska bygga fler bostäder.", date_stated: "2026-01-04", category: "bostad", status: "aktiv", source: { url: "https://example.test/bostad", domain: "example.test", archive_url: "https://archive.test/bostad" }, cost: { msek_low: 0, msek_high: 0, period: "engang", basis: "parti" } },
    { id: "p-2026-0003", title: "Stärk sjukvården", slug: "stark-sjukvarden", parties: ["s"], quote: "Sjukvården ska få fler medarbetare.", date_stated: "2026-01-05", category: "välfärd", status: "aktiv", source: { url: "https://example.test/sjukvard", domain: "example.test", archive_url: "https://archive.test/sjukvard" }, cost: { msek_low: 0, msek_high: 0, period: "engang", basis: "parti" } },
    { id: "p-2026-0004", title: "Stärk energipolitiken", slug: "stark-energipolitiken", parties: ["s"], quote: "Sverige behöver mer fossilfri energi.", date_stated: "2026-01-06", category: "klimat-miljö", status: "aktiv", source: { url: "https://example.test/energi", domain: "example.test", archive_url: "https://archive.test/energi" }, cost: { msek_low: 0, msek_high: 0, period: "engang", basis: "parti" } },
  ] },
  "/api/v1/stances.json": { stances: [
    { party: "s", subquestion_id: "sq-1", current: { statement_id: "st-1", position: "ja" }, statements: [{ id: "st-1", position: "ja", quote: "Vi säger ja", date_stated: "2026-01-03", source: { url: "https://example.test/besked", domain: "example.test", archive_url: null } }] },
    { party: "m", subquestion_id: "sq-1", current: { statement_id: null, position: "inget_tydligt_besked" }, statements: [], last_searched: "2026-08-26" },
  ] },
  "/api/v1/issues.json": { issues: [{ title: "Skolan", slug: "skolan", category: "skola", subquestions: [{ id: "sq-1", text: "Mer skola?" }] }] },
  "/api/v1/integrity.json": { data_hash: "h".repeat(64) },
  "/api/v1/promise-traces.json": { data: { "p-2026-0001": { actions: [{ connection_id: "p-2026-0001:h-1", recorded_relation: "stodjer", link_evidence_quote: "Riksdagens ord", method_note: null, reviewed_by_human: true, action: { id: "h-1", kind: "motion", title: "En riksdagshandling", date: "2026-02-01", body: "Riksdagen", document_id: "M2026/1", parties: ["s"], source_url: "https://riksdagen.example/h-1", archive_url: null } }], correction_count: 0 } } },
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
  window: { location: { pathname: "/lofte/p-2026-0001/ett-lofte", assign: (url: string) => { navigationUrl = url; } } },
  console, URL, URLSearchParams, Object, Map, Set, Promise, Array, Math,
});
await Promise.resolve();
await Promise.resolve();
await new Promise((resolve) => setTimeout(resolve, 10));

const evidenceTool = registered.get("search_verified_evidence");
const briefTool = registered.get("build_research_brief");
const comparisonTool = registered.get("show_party_comparison");
const evidenceStatusTool = registered.get("get_evidence_board_status");
const traceTool = registered.get("trace_promise");
const currentTraceTool = registered.get("trace_current_promise");
check("registrerar fem globala och ett kontextuellt läsverktyg", registered.size === 6 && evidenceTool?.annotations.readOnlyHint === true && briefTool?.annotations.readOnlyHint === true && comparisonTool?.annotations.readOnlyHint === true && evidenceStatusTool?.annotations.readOnlyHint === true && traceTool?.annotations.readOnlyHint === true && currentTraceTool?.annotations.readOnlyHint === true);
if (evidenceTool) {
  const result = await evidenceTool.execute({ party_codes: ["s"], kind: "alla", max_results: 12 });
  check("läser API-kuvertens faktiska former", result.result_count === 5 && Array.isArray(result.evidence));
  check("visar samma citat på bevisbrädet", Boolean(board));
  check("märker nytt underlag som overifierat tills en människa kvitterar", (result.evidence_review as { status?: string }).status === "unverified");
  check("gör mandatperiodsantagandet synligt", (result.evidence as Array<{ detail: string }>).some((item) => item.detail.includes("årlig kostnad × 4") && item.detail.includes("fyraårigt mandatperiodsantagande")));
  const archived = await evidenceTool.execute({ party_codes: ["s"], kind: "alla", require_archive_copy: true });
  check("kan kräva arkivkopia utan att kalla den primärkälla", archived.result_count === 4 && String(archived.note).includes("inte en röstrekommendation"));
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
  const englishResult = await briefTool.execute({ party_codes: ["m", "s", "v"], query: "housing costs and building more homes" });
  check("engelsk bostadsfråga använder fasta svenska ämnesalias", englishResult.evidence_count === 1 && Array.isArray(englishResult.missing_party_codes) && englishResult.missing_party_codes.includes("m") && englishResult.missing_party_codes.includes("v") && String(englishResult.brief_url).includes("query=housing+costs+and+building+more+homes"));
  const healthcareResult = await briefTool.execute({ party_codes: ["s"], query: "What does S propose for healthcare and nursing staff?" });
  check("fri engelsk vårdfråga använder ämnesalias och frågeord", healthcareResult.evidence_count === 1 && String(healthcareResult.brief_url).includes("query=What+does+S+propose+for+healthcare+and+nursing+staff"));
  const namedHealthcareResult = await briefTool.execute({ party_codes: ["m", "s"], query: "Compare Moderate and Social Democratic commitments on healthcare and nursing staff." });
  check("fria engelska frågor ignorerar redan valda partinamn", namedHealthcareResult.evidence_count === 1 && Array.isArray(namedHealthcareResult.missing_party_codes) && namedHealthcareResult.missing_party_codes.includes("m") && String(namedHealthcareResult.brief_url).includes("query=Compare+Moderate+and+Social+Democratic"));
  const energyResult = await briefTool.execute({ party_codes: ["s"], query: "Compare S policies on electricity, nuclear power and the grid." });
  check("fri engelsk energifråga använder flera synonymer för samma sakområde", energyResult.evidence_count === 1);
  const schoolResult = await briefTool.execute({ party_codes: ["s"], query: "What is S plan for teachers and students?" });
  check("fri engelsk skolfråga använder vardagliga ämnesord", schoolResult.evidence_count === 2);
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
if (traceTool) {
  const result = await traceTool.execute({ promise_id: "p-2026-0001" });
  check("löftespåraren visar löfte, källa och riksdagshandling utan utfallsdom", result.promise && Array.isArray(result.parliamentary_actions) && (result.parliamentary_actions as Array<{ action: { document_id: string } }>)[0]?.action.document_id === "M2026/1" && String(result.note).includes("ingen bedömning"));
} else {
  check("löftespåraren finns", false);
}
if (currentTraceTool) {
  const result = await currentTraceTool.execute({});
  check("sidans löftespårare använder bara löftet i den öppna URL:en", (result.promise as { id?: string }).id === "p-2026-0001");
} else {
  check("sidans löftespårare finns", false);
}
check("återanvänder de delade bevis-API-svaren mellan verktyg", ["/api/v1/promises.json", "/api/v1/stances.json", "/api/v1/issues.json", "/api/v1/integrity.json"].every((path) => fetches[path] === 1));

const questionRegistered = new Map<string, Tool>();
let questionNavigation = "";
runInNewContext(client, {
  document: { ...document, modelContext: { registerTool: async (tool: Tool) => { questionRegistered.set(tool.name, tool); } } },
  fetch: async (path: string) => ({ ok: true, json: async () => responses[path] }),
  window: { location: { pathname: "/fraga/skolan", assign: (url: string) => { questionNavigation = url; } } },
  console, URL, URLSearchParams, Object, Map, Set, Promise, Array, Math,
});
await new Promise((resolve) => setTimeout(resolve, 10));
const currentQuestionTool = questionRegistered.get("build_current_question_brief");
if (currentQuestionTool) {
  const result = await currentQuestionTool.execute({ party_codes: ["s"] });
  check("frågesidan registrerar ett verktyg som återanvänder sidans sakfråga", String(result.brief_url).includes("query=Skolan") && questionNavigation === result.brief_url);
} else {
  check("frågesidans kontextuella verktyg finns", false);
}

const contestRegistered = new Map<string, Tool>();
runInNewContext(client, {
  document: { ...document, modelContext: { registerTool: async (tool: Tool) => { contestRegistered.set(tool.name, tool); } } },
  fetch: async (path: string) => ({ ok: true, json: async () => responses[path] }),
  window: { location: { pathname: "/webmcp/", search: "", assign: () => undefined } },
  console, URL, URLSearchParams, Object, Map, Set, Promise, Array, Math,
});
await new Promise((resolve) => setTimeout(resolve, 10));
const contestSearch = contestRegistered.get("search_verified_evidence");
if (contestSearch) {
  const result = await contestSearch.execute({ party_codes: ["s"], kind: "loften" });
  const details = (result.evidence as Array<{ detail: string }>).map((item) => item.detail);
  check("den kanoniska engelska tävlingsadressen registrerar engelsk verktygstext", contestSearch.description.includes("Read published Swedish election promises") && contestSearch.description.includes("fixed Swedish matching list"));
  check("den engelska tävlingsdemon visar estimat direkt men med ≈, intervall och underlag", details.some((detail) => detail.includes("≈") && detail.includes("Utlovat.se estimate") && detail.includes("four-year term")));
} else {
  check("tävlingssidans sökverktyg finns", false);
}

let sharedBriefRendered = false;
const sharedBriefOutlet = { ...node(), replaceChildren: () => { sharedBriefRendered = true; } };
runInNewContext(client, {
  document: {
    ...document,
    modelContext: { registerTool: async () => undefined },
    getElementById: (id: string) => id === "webmcp-brief-outlet" ? sharedBriefOutlet : id === "webmcp-evidence-board" ? board : undefined,
  },
  fetch: async (path: string) => ({ ok: true, json: async () => responses[path] }),
  window: { location: { pathname: "/webmcp/", search: "?parties=s,m&query=skola&kind=alla&max=12", assign: () => undefined } },
  console, URL, URLSearchParams, Object, Map, Set, Promise, Array, Math,
});
await new Promise((resolve) => setTimeout(resolve, 10));
check("det kanoniska snedstrecket laddar ett delat granskningskort", sharedBriefRendered);
if (errors) process.exit(1);
