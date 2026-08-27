/*
 * WebMCP: Utlovat.se som gemensamt granskningsbord.
 *
 * Verktygen läser bara samma publika, källspårade JSON som sajten visar.
 * De kan sortera och synliggöra underlaget, men varken rekommendera ett parti
 * eller fylla ett tomrum med en politisk slutsats.
 */










const appDocument = document                                                                                    ;
const partyNames                         = { s: "Socialdemokraterna", m: "Moderaterna", sd: "Sverigedemokraterna", c: "Centerpartiet", v: "Vänsterpartiet", kd: "Kristdemokraterna", l: "Liberalerna", mp: "Miljöpartiet" };

async function getJson   (path        )             {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Kunde inte läsa ${path} (${response.status}).`);
  return await response.json()     ;
}

function formatMsek(value        )         {
  return value >= 1000
    ? `${(value / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} mdkr`
    : `${value.toLocaleString("sv-SE")} mkr`;
}

function sourceLabel(source        )         {
  if (source.domain) return source.domain;
  try { return new URL(source.url).hostname; } catch { return "källa"; }
}

function el                                       (tag   , text         )                           {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function link(href        , text        )                    {
  const node = el("a", text);
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}

function normalise(value        )         {
  return value.toLocaleLowerCase("sv-SE").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function queryTerms(query         )           {
  return normalise(query ?? "").split(/[^a-z0-9]+/).filter((term) => term.length > 1);
}

function matchesQuery(query                    , ...fields          )          {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const haystack = normalise(fields.join(" "));
  return terms.every((term) => haystack.includes(term));
}

function selectedPartyCodes(codes                      )           {
  return Array.from(new Set(codes ?? [])).filter((code) => Object.hasOwn(partyNames, code));
}

function evidenceList(evidence            )                   {
  const list = el("ol");
  list.className = "webmcp-evidence-board__list";
  for (const item of evidence) {
    const card = el("li");
    const label = el("div", `${item.kind.toUpperCase()} · ${item.party_codes.map((code) => partyNames[code] ?? code.toUpperCase()).join(", ")} · ${item.date}`);
    label.className = "etikett";
    const sources = el("p");
    sources.append(link(item.source.url, `Källa: ${sourceLabel(item.source)}`));
    if (item.source.archive_url) sources.append(document.createTextNode(" · "), link(item.source.archive_url, "arkivkopia"));
    sources.append(document.createTextNode(" · "), link(item.page_url, "på utlovat.se"));
    card.append(label, el("strong", item.title), el("blockquote", `”${item.quote}”`), el("p", item.detail), sources);
    list.append(card);
  }
  return list;
}

function showEvidenceBoard(evidence            , dataHash         )       {
  let board = document.getElementById("webmcp-evidence-board");
  if (!board) {
    board = el("aside");
    board.id = "webmcp-evidence-board";
    board.setAttribute("aria-live", "polite");
    board.setAttribute("aria-label", "Bevisbräde för agentgranskning");
    document.body.append(board);
  }
  board.replaceChildren();
  const header = el("div");
  header.className = "webmcp-evidence-board__header";
  const close = el("button", "Stäng");
  close.type = "button";
  close.addEventListener("click", () => board?.remove());
  header.append(el("h2", "Bevisbräde"), close);
  board.append(header, el("p", "Underlag från publicerade poster. Tomma besked och osäkerhet fylls aldrig med antaganden."));
  board.append(evidenceList(evidence));
  if (dataHash) {
    const hash = el("p", `Dataversion: ${dataHash}`);
    hash.className = "webmcp-evidence-board__hash";
    board.append(hash);
  }
  board.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function collectEvidence(input             )                                                      {
  const partyCodes = new Set(selectedPartyCodes(input.party_codes));
  const kind = input.kind ?? "alla";
  const category = input.category?.trim().toLowerCase();
  const [promisesResponse, stancesResponse, issuesResponse, integrity] = await Promise.all([
    getJson                         ("/api/v1/promises.json"),
    getJson                           ("/api/v1/stances.json"),
    getJson                     ("/api/v1/issues.json"),
    getJson                       ("/api/v1/integrity.json"),
  ]);
  const promises = promisesResponse.data;
  const stances = stancesResponse.stances;
  if (!Array.isArray(promises) || !Array.isArray(stances) || !Array.isArray(issuesResponse.issues)) {
    throw new Error("Utlovats publicerade API-svar har oväntat format.");
  }
  const evidence             = [];
  if (kind === "alla" || kind === "loften") for (const promise of promises) {
    if (promise.status === "tillbakadragen" || (partyCodes.size && !promise.parties.some((code) => partyCodes.has(code))) || (category && promise.category.toLowerCase() !== category) || (input.require_archive_copy && !promise.source.archive_url) || !matchesQuery(input.query, promise.title, promise.category, promise.quote)) continue;
    const multiplier = promise.cost.period === "per_ar" ? 4 : 1;
    evidence.push({ kind: "lofte", title: promise.title, party_codes: promise.parties, quote: promise.quote, date: promise.date_stated, source: promise.source, page_url: `/lofte/${promise.id}/${promise.slug}`, category: promise.category, detail: `Kostnadsintervall för mandatperioden: ${formatMsek(promise.cost.msek_low * multiplier)}–${formatMsek(promise.cost.msek_high * multiplier)}.` });
  }
  if (kind === "alla" || kind === "besked") {
    const subquestions = new Map(issuesResponse.issues.flatMap((issue) => issue.subquestions.map((sq) => [sq.id, { issue, text: sq.text }]         )));
    for (const cell of stances) {
      if (partyCodes.size && !partyCodes.has(cell.party)) continue;
      const context = subquestions.get(cell.subquestion_id);
      const statement = cell.statements.find((item) => item.id === cell.current.statement_id);
      if (!context || !statement || (category && context.issue.category.toLowerCase() !== category) || (input.require_archive_copy && !statement.source.archive_url) || !matchesQuery(input.query, context.issue.title, context.issue.category, context.text, statement.quote)) continue;
      evidence.push({ kind: "besked", title: `${context.issue.title}: ${context.text}`, party_codes: [cell.party], quote: statement.quote, date: statement.date_stated, source: statement.source, page_url: `/fraga/${context.issue.slug}#${cell.subquestion_id}-${cell.party}`, category: context.issue.category, detail: `Registrerat besked: ${statement.position.toUpperCase()}.` });
    }
  }
  evidence.sort((a, b) => b.date.localeCompare(a.date));
  return { evidence, dataHash: integrity.data_hash };
}

function limitedEvidence(input             , evidence            )             {
  const max = Math.max(1, Math.min(input.max_results ?? 12, 20));
  return evidence.slice(0, max);
}

function researchBriefUrl(input            )         {
  const params = new URLSearchParams();
  params.set("parties", selectedPartyCodes(input.party_codes).join(","));
  params.set("query", input.query.trim());
  params.set("kind", input.kind ?? "alla");
  params.set("max", String(Math.max(1, Math.min(input.max_results ?? 12, 20))));
  if (input.require_archive_copy) params.set("arkiv", "1");
  return `/granska?${params.toString()}`;
}

function renderResearchBrief(input            , evidence            , dataHash        )       {
  const outlet = document.getElementById("webmcp-brief-outlet");
  if (!outlet) return;
  const parties = selectedPartyCodes(input.party_codes);
  const shown = limitedEvidence(input, evidence);
  outlet.replaceChildren();
  const header = el("header");
  header.className = "webmcp-brief__header";
  const label = el("div", "GRANSKNINGSKORT · INGEN RÖSTREKOMMENDATION");
  label.className = "etikett";
  header.append(label, el("h2", input.query.trim()), el("p", `Urval: ${parties.map((code) => partyNames[code]).join(", ")} · ${input.kind ?? "alla"} · ${input.require_archive_copy ? "bara arkivkopior" : "arkivkopior när de finns"}.`));
  outlet.append(header);
  const coverage = el("ul");
  coverage.className = "webmcp-brief__coverage";
  for (const code of parties) {
    const count = evidence.filter((item) => item.party_codes.includes(code)).length;
    const item = el("li");
    item.append(el("strong", partyNames[code]), el("span", count === 0 ? "Ingen träff i detta avgränsade underlag" : `${count} belagda poster i detta urval`));
    coverage.append(item);
  }
  outlet.append(coverage);
  const gap = el("p", "Ingen träff betyder inte att ett parti saknar åsikt eller politik. Det betyder bara att den inte finns i just detta sökurval av publicerade poster.");
  gap.className = "webmcp-brief__gap";
  outlet.append(gap, el("h3", `Belägg (${shown.length} av ${evidence.length})`), evidenceList(shown));
  const footer = el("footer");
  footer.className = "webmcp-brief__footer";
  footer.append(el("p", `Dataversion: ${dataHash}`));
  const copy = el("button", "Kopiera granskningslänk");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      copy.textContent = "Länk kopierad";
    } catch { copy.textContent = "Kunde inte kopiera länken"; }
  });
  footer.append(copy);
  outlet.append(footer);
}

async function searchEvidence(input             ) {
  const collected = await collectEvidence(input);
  const result = limitedEvidence(input, collected.evidence);
  showEvidenceBoard(result, collected.dataHash);
  return { data_hash: collected.dataHash, result_count: result.length, evidence: result, note: "Endast publicerade och källspårade poster visas. Resultatet är inte en röstrekommendation." };
}

async function buildResearchBrief(input            ) {
  const parties = selectedPartyCodes(input.party_codes);
  if (parties.length === 0) throw new Error("Välj minst ett giltigt parti.");
  if (queryTerms(input.query).length === 0) throw new Error("Skriv en sakfråga eller ett sökord för granskningskortet.");
  const collected = await collectEvidence(input);
  const evidence = limitedEvidence(input, collected.evidence);
  const missingPartyCodes = parties.filter((code) => !collected.evidence.some((item) => item.party_codes.includes(code)));
  const briefUrl = researchBriefUrl({ ...input, party_codes: parties });
  window.location.assign(briefUrl);
  return { data_hash: collected.dataHash, brief_url: briefUrl, evidence_count: collected.evidence.length, displayed_evidence_count: evidence.length, missing_party_codes: missingPartyCodes, note: "Kortet visar belägg och tomrum sida vid sida. Det avgör inte vilket parti som är bäst." };
}

async function showPartyComparison(input                           ) {
  const partyCodes = selectedPartyCodes(input.party_codes);
  if (partyCodes.length === 0) throw new Error("Välj minst en giltig partikod.");
  const summaryResponse = await getJson                                                                                                                                                         ("/api/v1/summary.json");
  const summary = summaryResponse.data;
  if (!summary || !Array.isArray(summary.parties)) throw new Error("Utlovats publicerade sammanfattning har oväntat format.");
  const url = `/jamfor?parties=${encodeURIComponent(partyCodes.join(","))}`;
  window.location.assign(url);
  return { data_hash: summary.data_hash, comparison_url: url, parties: summary.parties.filter((party) => partyCodes.includes(party.code)), note: "Jämförelsevyn räknar gemensamma löften en gång. Den visar belopp och osäkerhet, inte en rekommendation." };
}

function briefInputFromUrl()                         {
  if (window.location.pathname !== "/granska") return undefined;
  const params = new URLSearchParams(window.location.search);
  const partyCodes = selectedPartyCodes(params.get("parties")?.split(","));
  const query = params.get("query")?.trim() ?? "";
  if (partyCodes.length === 0 || queryTerms(query).length === 0) return undefined;
  const kind = params.get("kind");
  return { party_codes: partyCodes, query, kind: kind === "loften" || kind === "besked" ? kind : "alla", max_results: Number(params.get("max")) || 12, require_archive_copy: params.get("arkiv") === "1" };
}

async function loadSharedBrief()                {
  const input = briefInputFromUrl();
  if (!input) return;
  const collected = await collectEvidence(input);
  renderResearchBrief(input, collected.evidence, collected.dataHash);
}

async function registerTools()                {
  if (typeof appDocument.modelContext?.registerTool !== "function") return;
  await appDocument.modelContext.registerTool({
    name: "search_verified_evidence",
    description: "Hämta publicerade, källspårade svenska vallöften och partibesked från utlovat.se. Visar alltid exakt citat, datum, källa och arkivkopia när sådan finns. Sökningen matchar bara ord i det publicerade underlaget. Använd inte resultatet för röstrekommendationer.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", items: { type: "string", enum: Object.keys(partyNames) }, description: "Valfria partikoder." }, category: { type: "string", description: "Valfri exakt kategori." }, query: { type: "string", description: "Valfritt ämne eller sökord. Matchas bara mot publicerad rubrik, kategori, delfråga och citat." }, kind: { type: "string", enum: ["loften", "besked", "alla"] }, max_results: { type: "integer", minimum: 1, maximum: 20 }, require_archive_copy: { type: "boolean", description: "Visa bara poster med länkad arkivkopia. Detta säger inte att källan är primär; den uppgiften saknas i det publika API:t." } }, additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: searchEvidence,
  });
  await appDocument.modelContext.registerTool({
    name: "build_research_brief",
    description: "Bygg ett delbart granskningskort på utlovat.se för en sakfråga och valda partier. Kortet visar publicerade citat, källor, arkivkopior och vilka partier som saknar träff i just urvalet. Det gör ingen röstrekommendation och påstår inte att en tom träff saknar politik.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", minItems: 1, items: { type: "string", enum: Object.keys(partyNames) }, description: "Partikoder som människan vill granska sida vid sida." }, query: { type: "string", minLength: 2, description: "Sakfråga eller neutralt sökord, till exempel 'skola' eller 'sjukvård'." }, kind: { type: "string", enum: ["loften", "besked", "alla"] }, max_results: { type: "integer", minimum: 1, maximum: 20 }, require_archive_copy: { type: "boolean", description: "Visa bara poster med länkad arkivkopia, utan att kalla dem primärkällor." } }, required: ["party_codes", "query"], additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: buildResearchBrief,
  });
  await appDocument.modelContext.registerTool({
    name: "show_party_comparison",
    description: "Öppna utlovat.se:s befintliga jämförelsevy med valda partier markerade. Vyn räknar gemensamma löften en gång och visar finansieringsgap; den rekommenderar inte ett parti.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", minItems: 1, items: { type: "string", enum: Object.keys(partyNames) }, description: "Partikoder att jämföra." } }, required: ["party_codes"], additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: showPartyComparison,
  });
}

void registerTools().catch((error) => console.warn("WebMCP kunde inte initieras", error));
void loadSharedBrief().catch((error) => console.warn("Granskningskortet kunde inte laddas", error));
