interface PartyRow {
  code: string;
  name: string;
  total_msek: number;
  mandates: number;
  votes: number;
  per_vote: number;
  promises_count: number;
  financing_gap_msek: number;
}

interface SummaryData {
  generated_at: string;
  data_hash: string;
  total_parties: number;
  total_promises: number;
  total_msek_flasket: number;
  total_msek_besparingar: number;
  total_financing_claimed_msek: number;
  financing_gap_msek: number;
  reformutrymme_msek_per_ar: number | "VERIFIERA";
  reformutrymme_total_msek: number | null;
  parties: PartyRow[];
}

interface PromiseItem {
  id: string;
  group_id: string | null;
  parties: string[];
  cost: { type: string; period: string; msek_base: number };
  financing_claimed: { msek: number | null; period?: "per_ar" | "engang" };
  status: string;
}

interface GroupNote {
  group_id: string;
  parties: string[];
  minMsek: number;
  maxMsek: number;
  hasSpread: boolean;
}

interface CoalitionResult {
  totalFlasket: number;
  totalBesparingar: number;
  totalFinancingClaimed: number;
  financingGap: number;
  promisesCount: number;
  mandatesSum: number;
  groupNotes: GroupNote[];
}

function promiseTotal(p: PromiseItem): number {
  return p.cost.msek_base * (p.cost.period === "per_ar" ? 4 : 1);
}

function isActive(p: PromiseItem): boolean {
  return p.status !== "tillbakadragen";
}

function isCostType(p: PromiseItem): boolean {
  return p.cost.type === "utgift" || p.cost.type === "intäktsminskning";
}

function isBesparing(p: PromiseItem): boolean {
  return p.cost.type === "besparing" || p.cost.type === "intäktsökning";
}

/**
 * Finansieringsuppgiften räknad för mandatperioden, precis som kostnaderna.
 * Speglar `financingClaimedMsek` i lib/aggregates.ts — samma regel måste gälla
 * i klienten som på de byggda sidorna.
 */
function financingClaimed(p: PromiseItem): number {
  const msek = p.financing_claimed?.msek ?? 0;
  if (msek === 0) return 0;
  return msek * (p.financing_claimed.period === "per_ar" ? 4 : 1);
}

function computeCoalition(promises: PromiseItem[], partyCodes: string[]): CoalitionResult {
  const partySet = new Set(partyCodes);
  const relevant = promises.filter((p) => isActive(p) && p.parties.some((c) => partySet.has(c)));
  const seenGroups = new Map<string, { min: number; max: number; parties: Set<string> }>();
  let totalFlasket = 0;
  let totalBesparingar = 0;
  let totalFinancing = 0;
  let count = 0;
  const counted = new Set<string>();

  // Gruppnoterna behöver ALLA medlemmar: spannet är skillnaden mellan dem.
  for (const p of relevant) {
    if (!p.group_id) continue;
    const t = promiseTotal(p);
    const existing = seenGroups.get(p.group_id);
    if (existing) {
      existing.min = Math.min(existing.min, t);
      existing.max = Math.max(existing.max, t);
      for (const c of p.parties) existing.parties.add(c);
    } else {
      seenGroups.set(p.group_id, { min: t, max: t, parties: new Set(p.parties) });
    }
  }

  // Gruppen representeras av medlemmen med HÖGST belopp, samma regel som
  // dedupeByGroup på de byggda sidorna. Loopen tog förut den först påträffade,
  // och då kunde kombinatorn visa ett annat tal än partisidan för samma grupp.
  const rep = new Map<string, PromiseItem>();
  for (const p of relevant) {
    if (!p.group_id) continue;
    const cur = rep.get(p.group_id);
    if (cur === undefined || promiseTotal(p) > promiseTotal(cur) || (promiseTotal(p) === promiseTotal(cur) && p.id < cur.id)) {
      rep.set(p.group_id, p);
    }
  }

  for (const p of relevant) {
    if (p.group_id) {
      if (counted.has(p.group_id)) continue;
      counted.add(p.group_id);
      const b = rep.get(p.group_id)!;
      if (isCostType(b)) totalFlasket += promiseTotal(b);
      else if (isBesparing(b)) totalBesparingar += promiseTotal(b);
      totalFinancing += financingClaimed(b);
      count++;
      continue;
    }
    if (isCostType(p)) totalFlasket += promiseTotal(p);
    else if (isBesparing(p)) totalBesparingar += promiseTotal(p);
    totalFinancing += financingClaimed(p);
    count++;
  }

  const groupNotes: GroupNote[] = Array.from(seenGroups.entries())
    .filter(([, v]) => v.min !== v.max)
    .map(([gid, v]) => ({ group_id: gid, parties: Array.from(v.parties), minMsek: v.min, maxMsek: v.max, hasSpread: true }));

  return {
    totalFlasket,
    totalBesparingar,
    totalFinancingClaimed: totalFinancing,
    financingGap: totalFlasket - totalBesparingar - totalFinancing,
    promisesCount: count,
    mandatesSum: 0,
    groupNotes,
  };
}

function formatMsek(msek: number): string {
  if (msek >= 1000) {
    const mdkr = msek / 1000;
    return mdkr >= 10
      ? `${mdkr.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} mdkr`
      : `${mdkr.toFixed(1).replace(".", ",")} mdkr`;
  }
  return `${msek.toLocaleString("sv-SE")} mkr`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Gör en intern gruppkod läsbar: "g-slopad-karens" → "Slopad karens".
 * Interna koder ska aldrig möta läsaren — men vilken politik gruppen gäller
 * är värd information, så koden skrivs ut i klartext i stället för att döljas.
 */
function groupLabel(groupId: string): string {
  const words = groupId.replace(/^g-/, "").replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

async function init() {
  const container = document.getElementById("kombinator");
  const resultDiv = document.getElementById("kombinator-resultat");
  if (!container || !resultDiv) return;

  let summaryData: SummaryData | null = null;
  let promisesData: PromiseItem[] | null = null;

  try {
    const [sumResp, promResp] = await Promise.all([
      fetch("/api/v1/summary.json"),
      fetch("/api/v1/promises.json"),
    ]);
    // API:t paketerar nyttolasten i ett kuvert { generated_at, data_hash, license, data } (§5/M5).
    const sumJson = await sumResp.json();
    const promJson = await promResp.json();
    summaryData = sumJson && sumJson.data ? sumJson.data : sumJson;
    promisesData = promJson && promJson.data ? promJson.data : promJson;
  } catch {
    resultDiv.innerHTML = '<div class="resultat__tom">Kunde inte ladda data.</div>';
    return;
  }

  if (!summaryData || !promisesData) {
    resultDiv.innerHTML = '<div class="resultat__tom">Ingen data tillgänglig.</div>';
    return;
  }

  const partyMap = new Map(summaryData.parties.map((p) => [p.code, p]));
  const checkboxes = container.querySelectorAll<HTMLInputElement>('input[name="party"]');

  function render() {
    const checked = Array.from(checkboxes).filter((cb) => cb.checked).map((cb) => cb.value);
    if (checked.length === 0) {
      resultDiv.innerHTML = '<div class="resultat__tom">Välj minst ett parti ovan.</div>';
      return;
    }

    const coalition = computeCoalition(promisesData!, checked);
    const mandates = checked.reduce((s, c) => s + (partyMap.get(c)?.mandates ?? 0), 0);

    let html = '<table class="resultat__tabell"><thead><tr>';
    html += '<th class="radnr">#</th><th>Parti</th><th class="num">Totalt</th><th class="num">Löften</th><th class="num">Mandat</th>';
    html += '</tr></thead><tbody>';

    checked.forEach((code, i) => {
      const p = partyMap.get(code);
      if (!p) return;
      html += `<tr><td class="radnr">${i + 1}</td>`;
      html += `<td>${escapeHtml(p.name)}</td>`;
      html += `<td class="num">${formatMsek(p.total_msek)}</td>`;
      html += `<td class="num">${p.promises_count}</td>`;
      html += `<td class="num">${p.mandates}</td></tr>`;
    });

    html += '</tbody><tfoot>';
    html += `<tr><td colspan="2"><strong>Fläsket</strong> <span class="fotnot">(löften som flera partier delar räknas en gång)</span></td><td class="num" colspan="3"><strong class="num">${formatMsek(coalition.totalFlasket)}</strong></td></tr>`;
    html += `<tr><td colspan="2">Besparingar</td><td class="num" colspan="3">${formatMsek(coalition.totalBesparingar)}</td></tr>`;
    html += `<tr><td colspan="2">Finansiering angiven</td><td class="num" colspan="3">${formatMsek(coalition.totalFinancingClaimed)}</td></tr>`;

    const gapLabel = coalition.financingGap < 0
      ? `ÖVERTÄCKT (${formatMsek(Math.abs(coalition.financingGap))})`
      : formatMsek(coalition.financingGap);
    html += `<tr><td colspan="2"><strong>Finansieringsgap</strong></td><td class="num" colspan="3"><strong class="num">${gapLabel}</strong></td></tr>`;
    html += `<tr><td colspan="2">Mandat totalt</td><td class="num" colspan="3">${mandates} / 349</td></tr>`;
    html += '</tfoot></table>';

    if (coalition.groupNotes.length > 0) {
      html += '<div class="etikett" style="margin-top:0.75rem">LÖFTEN SOM FLERA PARTIER DELAR</div>';
      for (const gn of coalition.groupNotes) {
        html += `<p class="resultat__fotnot">${escapeHtml(groupLabel(gn.group_id))}: partierna har olika prislapp, mellan ${formatMsek(gn.minMsek)} och ${formatMsek(gn.maxMsek)} (${gn.parties.join(", ")}). Räknas en gång.</p>`;
      }
    }

    resultDiv.innerHTML = html;
  }

  checkboxes.forEach((cb) => cb.addEventListener("change", render));
}

document.addEventListener("DOMContentLoaded", init);
