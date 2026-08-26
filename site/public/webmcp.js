/*
 * WebMCP: Utlovat.se som gemensamt granskningsbord.
 *
 * Verktygen läser endast samma publika, källspårade JSON som sajten visar.
 * De ger varken röstrekommendationer eller modellskapade politiska slutsatser.
 * Ett verktygsresultat visas också i bevisbrädet så att människan och agenten
 * kan granska exakt samma underlag.
 */

                                                                          
                                                                                                                                                                                                                                       
                                                                                                      
                                                                                                                               
                                                                                                                  
                                                                                                                                                                  

const appDocument = document                                                                                    ;
const partyNames                         = { s: "Socialdemokraterna", m: "Moderaterna", sd: "Sverigedemokraterna", c: "Centerpartiet", v: "Vänsterpartiet", kd: "Kristdemokraterna", l: "Liberalerna", mp: "Miljöpartiet" };

function unwrap   (value         )    {
  const body = value                ;
  return body.data ?? value     ;
}

async function getJson   (path        )             {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Kunde inte läsa ${path} (${response.status}).`);
  return unwrap   (await response.json());
}

function formatMsek(value        )         {
  return value >= 1000
    ? `${(value / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} mdkr`
    : `${value.toLocaleString("sv-SE")} mkr`;
}

function sourceLabel(source        )         {
  return source.domain || new URL(source.url).hostname;
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
  const heading = el("h2", "Bevisbräde");
  const close = el("button", "Stäng");
  close.type = "button";
  close.addEventListener("click", () => board?.remove());
  header.append(heading, close);
  board.append(header);
  const note = el("p", "Underlag från publicerade poster. Tomma besked och osäkerhet fylls aldrig med antaganden.");
  note.className = "webmcp-evidence-board__note";
  board.append(note);
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
  board.append(list);
  if (dataHash) {
    const hash = el("p", `Dataversion: ${dataHash}`);
    hash.className = "webmcp-evidence-board__hash";
    board.append(hash);
  }
  board.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function searchEvidence(input                                                                                                          ) {
  const partyCodes = new Set(input.party_codes ?? []);
  const kind = input.kind ?? "alla";
  const max = Math.max(1, Math.min(input.max_results ?? 12, 20));
  const category = input.category?.trim().toLowerCase();
  const [promises, stances, issuesResponse, integrity] = await Promise.all([
    getJson               ("/api/v1/promises.json"), getJson              ("/api/v1/stances.json"),
    getJson                     ("/api/v1/issues.json"), getJson                       ("/api/v1/integrity.json"),
  ]);
  const evidence             = [];
  if (kind === "alla" || kind === "loften") for (const promise of promises) {
    if (promise.status === "tillbakadragen" || (partyCodes.size && !promise.parties.some((code) => partyCodes.has(code))) || (category && promise.category.toLowerCase() !== category)) continue;
    const multiplier = promise.cost.period === "per_ar" ? 4 : 1;
    evidence.push({ kind: "lofte", title: promise.title, party_codes: promise.parties, quote: promise.quote, date: promise.date_stated, source: promise.source, page_url: `/lofte/${promise.id}/${promise.slug}`, detail: `Kostnadsintervall för mandatperioden: ${formatMsek(promise.cost.msek_low * multiplier)}–${formatMsek(promise.cost.msek_high * multiplier)}.` });
  }
  if (kind === "alla" || kind === "besked") {
    const subquestions = new Map(issuesResponse.issues.flatMap((issue) => issue.subquestions.map((sq) => [sq.id, { issue, text: sq.text }]         )));
    for (const cell of stances) {
      if (partyCodes.size && !partyCodes.has(cell.party)) continue;
      const context = subquestions.get(cell.subquestion_id);
      const statement = cell.statements.find((item) => item.id === cell.current.statement_id);
      if (!context || !statement || (category && context.issue.category.toLowerCase() !== category)) continue;
      evidence.push({ kind: "besked", title: `${context.issue.title}: ${context.text}`, party_codes: [cell.party], quote: statement.quote, date: statement.date_stated, source: statement.source, page_url: `/fraga/${context.issue.slug}#${cell.subquestion_id}-${cell.party}`, detail: `Registrerat besked: ${statement.position.toUpperCase()}.` });
    }
  }
  evidence.sort((a, b) => b.date.localeCompare(a.date));
  const result = evidence.slice(0, max);
  showEvidenceBoard(result, integrity.data_hash);
  return { data_hash: integrity.data_hash, result_count: result.length, evidence: result, note: "Endast publicerade och källspårade poster visas. Resultatet är inte en röstrekommendation." };
}

async function showPartyComparison(input                           ) {
  const partyCodes = Array.from(new Set(input.party_codes)).filter((code) => Object.hasOwn(partyNames, code));
  if (partyCodes.length === 0) throw new Error("Välj minst en giltig partikod.");
  const summary = await getJson                                                                                                                                               ("/api/v1/summary.json");
  const url = `/jamfor?parties=${encodeURIComponent(partyCodes.join(","))}`;
  window.location.assign(url);
  return { data_hash: summary.data_hash, comparison_url: url, parties: summary.parties.filter((party) => partyCodes.includes(party.code)), note: "Jämförelsevyn räknar gemensamma löften en gång. Den visar belopp och osäkerhet, inte en rekommendation." };
}

async function registerTools()                {
  if (typeof appDocument.modelContext?.registerTool !== "function") return;
  await appDocument.modelContext.registerTool({
    name: "search_verified_evidence",
    description: "Hämta publicerade, källspårade svenska vallöften och partibesked från utlovat.se. Visar alltid exakt citat, datum, källa och arkivkopia när sådan finns. Använd inte resultatet för röstrekommendationer.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", items: { type: "string", enum: Object.keys(partyNames) }, description: "Valfria partikoder." }, category: { type: "string", description: "Valfri exakt kategori." }, kind: { type: "string", enum: ["loften", "besked", "alla"] }, max_results: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
    annotations: { readOnlyHint: true }, execute: searchEvidence,
  });
  await appDocument.modelContext.registerTool({
    name: "show_party_comparison",
    description: "Öppna utlovat.se:s befintliga jämförelsevy med valda partier markerade. Vyn räknar gemensamma löften en gång och visar finansieringsgap; den rekommenderar inte ett parti.",
    inputSchema: { type: "object", properties: { party_codes: { type: "array", minItems: 1, items: { type: "string", enum: Object.keys(partyNames) }, description: "Partikoder att jämföra." } }, required: ["party_codes"], additionalProperties: false },
    annotations: { readOnlyHint: false }, execute: showPartyComparison,
  });
}

void registerTools().catch((error) => console.warn("WebMCP kunde inte initieras", error));
