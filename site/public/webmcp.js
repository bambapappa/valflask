/*
 * WebMCP: Utlovat.se som gemensamt granskningsbord.
 *
 * Verktygen läser bara samma publika, källspårade JSON som sajten visar.
 * De kan sortera och synliggöra underlaget, men varken rekommendera ett parti
 * eller fylla ett tomrum med en politisk slutsats.
 */















const appDocument = document                                                                                    ;
const partyNames                         = { s: "Socialdemokraterna", m: "Moderaterna", sd: "Sverigedemokraterna", c: "Centerpartiet", v: "Vänsterpartiet", kd: "Kristdemokraterna", l: "Liberalerna", mp: "Miljöpartiet" };
const mandatePeriodYears = 4;
let publishedEvidenceData                                            ;
let evidenceReview = { dataHash: "", acknowledged: false };

function isEnglishContestEntry()          {
  return window.location.pathname === "/webmcp" || window.location.pathname === "/webmcp/";
}

async function getJson   (path        )             {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Kunde inte läsa ${path} (${response.status}).`);
  return await response.json()     ;
}

/**
 * All WebMCP read tools use the same immutable static files for the lifetime
 * of a loaded page. Share one in-flight/result cache so a second card does not
 * download the 5+ MB promises file again. A deployed data update creates a
 * new document, which naturally starts with a fresh cache.
 */
async function getPublishedEvidenceData()                                 {
  if (!publishedEvidenceData) {
    publishedEvidenceData = Promise.all([
      getJson                         ("/api/v1/promises.json"),
      getJson                           ("/api/v1/stances.json"),
      getJson                     ("/api/v1/issues.json"),
      getJson                       ("/api/v1/integrity.json"),
    ]).then(([promisesResponse, stancesResponse, issuesResponse, integrity]) => {
      if (!Array.isArray(promisesResponse.data) || !Array.isArray(stancesResponse.stances) || !Array.isArray(issuesResponse.issues)) {
        throw new Error("Utlovats publicerade API-svar har oväntat format.");
      }
      return { promises: promisesResponse.data, stances: stancesResponse.stances, issues: issuesResponse.issues, dataHash: integrity.data_hash };
    }).catch((error) => {
      publishedEvidenceData = undefined;
      throw error;
    });
  }
  return await publishedEvidenceData;
}

function formatMsek(value        )         {
  return value >= 1000
    ? `${(value / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} mdkr`
    : `${value.toLocaleString("sv-SE")} mkr`;
}

function englishCostBasis(basis         )         {
  if (basis === "parti") return "Party’s own amount.";
  if (basis === "llm_estimat") return "Utlovat.se estimate — published range, not a fact.";
  return "Utlovat.se calculation — published range, not a fact.";
}

function costIntervalDetail(cost                     )         {
  const estimated = cost.basis !== "parti";
  const marker = estimated ? "≈ " : "";
  if (isEnglishContestEntry()) {
    if (cost.period === "per_ar") return `Cost range for a four-year term: ${marker}${formatMsek(cost.msek_low * mandatePeriodYears)}–${formatMsek(cost.msek_high * mandatePeriodYears)} (annual cost × ${mandatePeriodYears}). Basis: ${englishCostBasis(cost.basis)}`;
    return `Cost range: ${marker}${formatMsek(cost.msek_low)}–${formatMsek(cost.msek_high)} (one-off cost). Basis: ${englishCostBasis(cost.basis)}`;
  }
  if (cost.period === "per_ar") return `Kostnadsintervall för mandatperioden: ${formatMsek(cost.msek_low * mandatePeriodYears)}–${formatMsek(cost.msek_high * mandatePeriodYears)} (årlig kostnad × ${mandatePeriodYears}; fyraårigt mandatperiodsantagande).`;
  return `Kostnadsintervall: ${formatMsek(cost.msek_low)}–${formatMsek(cost.msek_high)} (engångskostnad).`;
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

const swedishQueryStopWords = new Set(["att", "bara", "de", "den", "det", "en", "ett", "for", "fran", "har", "hur", "i", "jamfor", "med", "mot", "och", "om", "pa", "parti", "partier", "partierna", "som", "vad", "visa"]);

function queryTermGroups(query         )             {
  return normalise(query ?? "").split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !swedishQueryStopWords.has(term))
    .map((term) => {
      const forms = [term];
      if (term.endsWith("en") && term.length > 4) forms.push(term.slice(0, -2));
      else if (term.endsWith("n") && term.length > 4) forms.push(term.slice(0, -1));
      return Array.from(new Set(forms));
    });
}

function queryTerms(query         )           {
  return queryTermGroups(query).flat();
}

function matchesQuery(query                    , ...fields          )          {
  const groups = queryTermGroups(query);
  if (groups.length === 0) return true;
  const haystack = normalise(fields.join(" "));
  return groups.every((forms) => forms.some((term) => haystack.includes(term)));
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

function evidenceAcknowledgement(dataHash        )              {
  evidenceReview = { dataHash, acknowledged: false };
  const acknowledgement = el("label");
  acknowledgement.className = "webmcp-evidence-board__acknowledgement";
  const input = el("input");
  input.type = "checkbox";
  input.addEventListener("change", () => { evidenceReview.acknowledged = input.checked; });
  acknowledgement.append(input, document.createTextNode(" Jag har själv läst underlaget ovan. Agentens resultat är annars märkt som overifierat."));
  return acknowledgement;
}

function evidenceReviewStatus()                                                                                          {
  return {
    status: evidenceReview.acknowledged ? "human_acknowledged" : "unverified",
    data_hash: evidenceReview.dataHash || null,
    note: evidenceReview.acknowledged
      ? "En människa har markerat att underlaget lästs i den synliga vyn. Markeringen är en upplysning, inte ett politiskt omdöme."
      : "Ingen mänsklig läskvittering finns för det synliga underlaget. Behandla resultatet som overifierat tills källorna har lästs.",
  };
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
  board.append(evidenceAcknowledgement(dataHash ?? ""));
  board.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPromiseTraceBoard(promise             , trace              , dataHash        )       {
  showEvidenceBoard([{
    kind: "lofte", title: promise.title, party_codes: promise.parties, quote: promise.quote,
    date: promise.date_stated, source: promise.source, page_url: `/lofte/${promise.id}/${promise.slug}`,
    category: promise.category, detail: "Löftets källa och arkivkopia visas ovan. Kedjan nedan återger publicerade riksdagshandlingar utan en dom om utfallet.",
  }], dataHash);
  const board = document.getElementById("webmcp-evidence-board");
  if (!board) return;
  board.append(el("h3", "Riksdagshandlingar i den publicerade kedjan"));
  if (trace.actions.length === 0) {
    board.append(el("p", "Ingen aktiv, publicerad koppling till en riksdagshandling finns i detta underlag."));
    return;
  }
  const list = el("ol");
  list.className = "webmcp-evidence-board__list";
  for (const item of trace.actions) {
    const row = el("li");
    const action = item.action;
    const links = el("p");
    links.append(link(action.source_url, `Riksdagens källa: ${action.document_id || action.id}`));
    if (action.archive_url) links.append(document.createTextNode(" · "), link(action.archive_url, "arkivkopia"));
    row.append(
      el("div", `${action.kind.toUpperCase()} · ${action.date}${action.body ? ` · ${action.body}` : ""}`),
      el("strong", action.title),
      el("blockquote", `”${item.link_evidence_quote}”`),
      el("p", `Granskad koppling: ${item.recorded_relation}. Detta är kopplingens registrerade relation, inte en dom om löftet hölls eller bröts.`),
      links,
    );
    list.append(row);
  }
  board.append(list);
}

async function collectEvidence(input             )                                                                                               {
  const selectedCodes = selectedPartyCodes(input.party_codes);
  const partyCodes = new Set(selectedCodes);
  const kind = input.kind ?? "alla";
  const category = input.category?.trim().toLowerCase();
  const { promises, stances, issues, dataHash } = await getPublishedEvidenceData();
  const evidence             = [];
  const coverage = Object.fromEntries(selectedCodes.map((code) => [code, { archive_excluded_count: 0, no_clear_positions: [] }]))                                 ;
  const markArchiveExcluded = (codes          )       => {
    for (const code of codes) if (coverage[code]) coverage[code].archive_excluded_count++;
  };
  if (kind === "alla" || kind === "loften") for (const promise of promises) {
    const matchingPartyCodes = promise.parties.filter((code) => !partyCodes.size || partyCodes.has(code));
    if (promise.status === "tillbakadragen" || matchingPartyCodes.length === 0 || (category && promise.category.toLowerCase() !== category) || !matchesQuery(input.query, promise.title, promise.category, promise.quote)) continue;
    if (input.require_archive_copy && !promise.source.archive_url) {
      markArchiveExcluded(matchingPartyCodes);
      continue;
    }
    evidence.push({ kind: "lofte", title: promise.title, party_codes: promise.parties, quote: promise.quote, date: promise.date_stated, source: promise.source, page_url: `/lofte/${promise.id}/${promise.slug}`, category: promise.category, detail: costIntervalDetail(promise.cost) });
  }
  if (kind === "alla" || kind === "besked") {
    const subquestions = new Map(issues.flatMap((issue) => issue.subquestions.map((sq) => [sq.id, { issue, text: sq.text }]         )));
    for (const cell of stances) {
      if (partyCodes.size && !partyCodes.has(cell.party)) continue;
      const context = subquestions.get(cell.subquestion_id);
      const statement = cell.statements.find((item) => item.id === cell.current.statement_id);
      if (!context || (category && context.issue.category.toLowerCase() !== category)) continue;
      const title = `${context.issue.title}: ${context.text}`;
      const pageUrl = `/fraga/${context.issue.slug}#${cell.subquestion_id}-${cell.party}`;
      if (!statement) {
        if (cell.current.position === "inget_tydligt_besked" && matchesQuery(input.query, context.issue.title, context.issue.category, context.text) && coverage[cell.party]) {
          coverage[cell.party].no_clear_positions.push({ party_code: cell.party, title, page_url: pageUrl, last_searched: cell.last_searched });
        }
        continue;
      }
      if (!matchesQuery(input.query, context.issue.title, context.issue.category, context.text, statement.quote)) continue;
      if (input.require_archive_copy && !statement.source.archive_url) {
        markArchiveExcluded([cell.party]);
        continue;
      }
      evidence.push({ kind: "besked", title, party_codes: [cell.party], quote: statement.quote, date: statement.date_stated, source: statement.source, page_url: pageUrl, category: context.issue.category, detail: `Registrerat besked: ${statement.position.toUpperCase()}.` });
    }
  }
  evidence.sort((a, b) => b.date.localeCompare(a.date));
  return { evidence, dataHash, coverage };
}

function limitedEvidence(input             , evidence            )             {
  const max = Math.max(1, Math.min(input.max_results ?? 12, 20));
  return evidence.slice(0, max);
}

function researchBriefUrl(input            )         {
  const params = new URLSearchParams();
  params.set("parties", selectedPartyCodes(input.party_codes).join(","));
  params.set("query", input.query.trim());
  if (input.category?.trim()) params.set("category", input.category.trim().toLowerCase());
  params.set("kind", input.kind ?? "alla");
  params.set("max", String(Math.max(1, Math.min(input.max_results ?? 12, 20))));
  if (input.require_archive_copy) params.set("arkiv", "1");
  return `${isEnglishContestEntry() ? "/webmcp" : "/granska"}?${params.toString()}`;
}

function coverageText(count        , coverage                           , requiresArchive         )         {
  if (count > 0) return `${count} belagda poster i detta urval`;
  if (requiresArchive && coverage && coverage.archive_excluded_count > 0) return `Har ${coverage.archive_excluded_count} belagd${coverage.archive_excluded_count === 1 ? " post" : "a poster"} i urvalet, men utan arkivkopia`;
  const noClear = coverage?.no_clear_positions[0];
  if (noClear) return `Inget tydligt besked registrerat${noClear.last_searched ? ` · senast sökt ${noClear.last_searched}` : ""}`;
  return "Ingen träff i detta avgränsade underlag";
}

function renderResearchBrief(input            , evidence            , dataHash        , coverageByParty                               )       {
  const outlet = document.getElementById("webmcp-brief-outlet");
  if (!outlet) return;
  const parties = selectedPartyCodes(input.party_codes);
  const shown = limitedEvidence(input, evidence);
  outlet.replaceChildren();
  const header = el("header");
  header.className = "webmcp-brief__header";
  const label = el("div", "GRANSKNINGSKORT · INGEN RÖSTREKOMMENDATION");
  label.className = "etikett";
  const category = input.category?.trim() ? ` · kategori: ${input.category.trim()}` : "";
  header.append(label, el("h2", input.query.trim()), el("p", `Urval: ${parties.map((code) => partyNames[code]).join(", ")} · ${input.kind ?? "alla"}${category} · ${input.require_archive_copy ? "bara arkivkopior; andra belägg kan finnas utan kopia" : "arkivkopior när de finns"}.`));
  outlet.append(header);
  const coverage = el("ul");
  coverage.className = "webmcp-brief__coverage";
  for (const code of parties) {
    const count = evidence.filter((item) => item.party_codes.includes(code)).length;
    const item = el("li");
    item.append(el("strong", partyNames[code]), el("span", coverageText(count, coverageByParty[code], Boolean(input.require_archive_copy))));
    coverage.append(item);
  }
  outlet.append(coverage);
  const gap = el("p", "Ingen träff betyder inte att ett parti saknar åsikt eller politik. Det betyder bara att den inte finns i just detta sökurval av publicerade poster.");
  gap.className = "webmcp-brief__gap";
  outlet.append(gap, el("h3", `Belägg (${shown.length} av ${evidence.length})`), evidenceList(shown), evidenceAcknowledgement(dataHash));
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
  return { data_hash: collected.dataHash, result_count: result.length, evidence: result, recorded_no_clear: Object.values(collected.coverage).flatMap((item) => item.no_clear_positions), archive_excluded_by_party: Object.fromEntries(Object.entries(collected.coverage).map(([code, item]) => [code, item.archive_excluded_count])), evidence_review: evidenceReviewStatus(), note: "Endast publicerade och källspårade poster visas. Registrerade 'inget tydligt besked' redovisas separat. Resultatet är inte en röstrekommendation." };
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
  return { data_hash: collected.dataHash, brief_url: briefUrl, evidence_count: collected.evidence.length, displayed_evidence_count: evidence.length, missing_party_codes: missingPartyCodes, recorded_no_clear: Object.values(collected.coverage).flatMap((item) => item.no_clear_positions), archive_excluded_by_party: Object.fromEntries(Object.entries(collected.coverage).map(([code, item]) => [code, item.archive_excluded_count])), evidence_review: { status: "unverified", data_hash: collected.dataHash, note: "Granskningskortet öppnas i den synliga vyn. Ingen mänsklig läskvittering finns ännu." }, note: "Kortet visar belägg, registrerade otydliga besked och tomrum sida vid sida. Det avgör inte vilket parti som är bäst." };
}

async function getEvidenceBoardStatus() {
  return evidenceReviewStatus();
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

async function tracePromise(input                        ) {
  const promiseId = input.promise_id.trim();
  const { promises, dataHash } = await getPublishedEvidenceData();
  const promise = promises.find((item) => item.id === promiseId);
  if (!promise) throw new Error("Löftet finns inte i Utlovats publicerade API.");
  const traces = await getJson                                        ("/api/v1/promise-traces.json");
  const trace = traces.data[promiseId] ?? { actions: [], correction_count: 0 };
  const shownActions = trace.actions.slice(0, 10);
  showPromiseTraceBoard(promise, { ...trace, actions: shownActions }, dataHash);
  return {
    data_hash: dataHash,
    promise: { id: promise.id, title: promise.title, quote: promise.quote, date: promise.date_stated, source: promise.source, page_url: `/lofte/${promise.id}/${promise.slug}` },
    parliamentary_action_count: trace.actions.length,
    parliamentary_actions: shownActions.map(({ connection_id, recorded_relation, link_evidence_quote, reviewed_by_human, action }) => ({ connection_id, recorded_relation, link_evidence_quote, reviewed_by_human, action })),
    correction_count: trace.correction_count,
    evidence_review: evidenceReviewStatus(),
    note: `Visar ${shownActions.length} av ${trace.actions.length} riksdagshandlingar i kedjan löfte → källa → arkiv → riksdagshandling. Den gör ingen bedömning av om löftet hölls eller bröts.`,
  };
}

function currentPromiseId()                     {
  return window.location.pathname.match(/^\/lofte\/(p-\d{4}-\d{4})(?:\/|$)/)?.[1];
}

async function traceCurrentPromise() {
  const promiseId = currentPromiseId();
  if (!promiseId) throw new Error("Den här sidan gäller inte ett publicerat löfte.");
  return await tracePromise({ promise_id: promiseId });
}

function currentQuestionSlug()                     {
  return window.location.pathname.match(/^\/fraga\/([^/]+)(?:\/|$)/)?.[1];
}

async function buildCurrentQuestionBrief(input                                        ) {
  const slug = currentQuestionSlug();
  const { issues } = await getPublishedEvidenceData();
  const issue = issues.find((item) => item.slug === slug);
  if (!issue) throw new Error("Den här frågesidan finns inte i Utlovats publicerade API.");
  return await buildResearchBrief({ ...input, query: issue.title, category: issue.category });
}

function briefInputFromUrl()                         {
  if (!["/granska", "/granska/", "/webmcp", "/webmcp/"].includes(window.location.pathname)) return undefined;
  const params = new URLSearchParams(window.location.search);
  const partyCodes = selectedPartyCodes(params.get("parties")?.split(","));
  const query = params.get("query")?.trim() ?? "";
  if (partyCodes.length === 0 || queryTerms(query).length === 0) return undefined;
  const kind = params.get("kind");
  return { party_codes: partyCodes, query, category: params.get("category")?.trim() || undefined, kind: kind === "loften" || kind === "besked" ? kind : "alla", max_results: Number(params.get("max")) || 12, require_archive_copy: params.get("arkiv") === "1" };
}

async function loadSharedBrief()                {
  const input = briefInputFromUrl();
  if (!input) return;
  const collected = await collectEvidence(input);
  renderResearchBrief(input, collected.evidence, collected.dataHash, collected.coverage);
}

async function registerTools()                {
  if (typeof appDocument.modelContext?.registerTool !== "function") return;
  const english = isEnglishContestEntry();
  await appDocument.modelContext.registerTool({
    name: "search_verified_evidence",
    description: english
      ? "Read published Swedish election promises and party positions from Utlovat.se. Return exact quotes, dates, sources and archive copies when available. Search only the published material; never use it to recommend a party."
      : "Hämta publicerade, källspårade svenska vallöften och partibesked från utlovat.se. Visar alltid exakt citat, datum, källa och arkivkopia när sådan finns. Sökningen matchar bara ord i det publicerade underlaget. Använd inte resultatet för röstrekommendationer.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", items: { type: "string", enum: Object.keys(partyNames) }, description: "Valfria partikoder." }, category: { type: "string", description: "Valfri exakt kategori." }, query: { type: "string", description: "Valfritt ämne eller sökord. Matchas bara mot publicerad rubrik, kategori, delfråga och citat." }, kind: { type: "string", enum: ["loften", "besked", "alla"] }, max_results: { type: "integer", minimum: 1, maximum: 20 }, require_archive_copy: { type: "boolean", description: "Visa bara poster med länkad arkivkopia. Detta säger inte att källan är primär; den uppgiften saknas i det publika API:t." } }, additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: searchEvidence,
  });
  await appDocument.modelContext.registerTool({
    name: "build_research_brief",
    description: english
      ? "Build a visible, shareable research brief for an issue and selected parties. It shows published quotes, sources, archive copies, recorded unclear positions and bounded gaps. It never recommends a party or treats a blank result as no policy."
      : "Bygg ett delbart granskningskort på utlovat.se för en sakfråga och valda partier. Kortet visar publicerade citat, källor, arkivkopior, registrerade otydliga besked och vilka partier som saknar träff i just urvalet. Det gör ingen röstrekommendation och påstår inte att en tom träff saknar politik.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", minItems: 1, items: { type: "string", enum: Object.keys(partyNames) }, description: "Partikoder som människan vill granska sida vid sida." }, category: { type: "string", description: "Valfri exakt kategori. Följer alltid med i den delbara länken." }, query: { type: "string", minLength: 2, description: "Sakfråga eller neutralt sökord, till exempel 'skola' eller 'sjukvård'. Vanliga frågeord ignoreras." }, kind: { type: "string", enum: ["loften", "besked", "alla"] }, max_results: { type: "integer", minimum: 1, maximum: 20 }, require_archive_copy: { type: "boolean", description: "Visa bara poster med länkad arkivkopia, utan att kalla dem primärkällor. Kortet anger när belägg finns men saknar arkivkopia." } }, required: ["party_codes", "query"], additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: buildResearchBrief,
  });
  await appDocument.modelContext.registerTool({
    name: "show_party_comparison",
    description: english
      ? "Open Utlovat.se's existing comparison view with selected parties. It counts shared promises once and shows financing gaps; it does not recommend a party."
      : "Öppna utlovat.se:s befintliga jämförelsevy med valda partier markerade. Vyn räknar gemensamma löften en gång och visar finansieringsgap; den rekommenderar inte ett parti.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", minItems: 1, items: { type: "string", enum: Object.keys(partyNames) }, description: "Partikoder att jämföra." } }, required: ["party_codes"], additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: showPartyComparison,
  });
  await appDocument.modelContext.registerTool({
    name: "get_evidence_board_status",
    description: english
      ? "Read whether the person has marked the visible evidence board as read. An unchecked board is always unverified. This status is not a judgement about a party or policy."
      : "Läs om människan har markerat att det synliga bevisbordet har lästs. Ett omarkerat bord är alltid overifierat. Statusen är inte en bedömning av parti eller politik.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: getEvidenceBoardStatus,
  });
  await appDocument.modelContext.registerTool({
    name: "trace_promise",
    description: english
      ? "Trace one published promise to its source, archive copy and reviewed parliamentary actions. Return the evidence chain only; never decide whether the promise was kept or broken."
      : "Följ ett publicerat löfte till dess källa, arkivkopia och granskade riksdagshandlingar. Visar bara evidenskedjan och dömer aldrig om löftet hölls eller bröts.",
    inputSchema: { type: "object", properties: { promise_id: { type: "string", pattern: "^p-\\d{4}-\\d{4}$", description: "Utlovats publicerade löftes-id, till exempel p-2026-0001." } }, required: ["promise_id"], additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: tracePromise,
  });
  if (currentPromiseId()) {
    await appDocument.modelContext.registerTool({
      name: "trace_current_promise",
      description: english
        ? "Trace the promise currently open on this page to its source, archive copy and reviewed parliamentary actions. It never decides whether it was kept or broken."
        : "Följ löftet på den öppna sidan till dess källa, arkivkopia och granskade riksdagshandlingar. Verktyget dömer aldrig om löftet hölls eller bröts.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true }, execute: traceCurrentPromise,
    });
  }
  if (currentQuestionSlug()) {
    await appDocument.modelContext.registerTool({
      name: "build_current_question_brief",
      description: english
        ? "Build a visible research brief for the issue currently open on this page and selected parties. It preserves visible gaps and never recommends a party."
        : "Bygg ett synligt granskningskort för sakfrågan på den öppna sidan och valda partier. Verktyget redovisar luckor och rekommenderar aldrig ett parti.",
      inputSchema: { type: "object", properties: { party_codes: { type: "array", minItems: 1, items: { type: "string", enum: Object.keys(partyNames) }, description: "Partikoder som ska visas sida vid sida." }, kind: { type: "string", enum: ["loften", "besked", "alla"] }, max_results: { type: "integer", minimum: 1, maximum: 20 }, require_archive_copy: { type: "boolean", description: "Visa bara poster med länkad arkivkopia." } }, required: ["party_codes"], additionalProperties: false },
      annotations: { readOnlyHint: true }, execute: buildCurrentQuestionBrief,
    });
  }
}

void registerTools().catch((error) => console.warn("WebMCP kunde inte initieras", error));
void loadSharedBrief().catch((error) => console.warn("Granskningskortet kunde inte laddas", error));
