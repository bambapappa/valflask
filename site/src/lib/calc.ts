import type { PromisePost } from "./data";

// Filändelsen är inte kosmetisk: utan den går calc.ts att importera från
// Astro men INTE från ett fristående node-skript (--experimental-strip-types
// resolverar inte ändelselösa relativa sökvägar). Det var tröskeln som fick
// generate-og.mts att bära egna kopior av formateringen i stället för att
// importera den — och kopiorna gled isär. Behåll ändelsen.
export { canonicalStringify, computeDataHash } from "./canonical.ts";

export {
  promiseTotalMsek,
  partyTotalMsek,
  totalFlasket,
  totalBesparingar,
  totalFinancingClaimed,
  financingGap,
  getPromisesForParty,
  countPromises,
  isFixture,
  flasketPerRost,
  categoryBreakdown,
  coalitionAggregates,
  computeComparisons,
  buildSummary,
  formatComparison,
  isActive,
  isCostType,
  isBesparing,
  promiseTotalLowMsek,
  promiseTotalHighMsek,
} from "./aggregates.ts";

export type {
  CoalitionResult,
  GroupNote,
  ComparisonResult,
  CategoryBreakdown,
  SummaryData,
} from "./aggregates.ts";

export function formatMsek(msek: number, basis?: string): string {
  // Negativa tal (besparingar i en summa) skrivs med minus framför beloppet,
  // inte inne i siffran: "≈ −600 mkr", inte "≈ -600 mkr" efter tusenavdelare.
  const sign = msek < 0 ? "\u2212" : "";
  const abs = Math.abs(msek);
  const prefix = (basis === "llm_estimat" ? "≈ " : "") + sign;
  if (abs >= 1000) {
    const mdkr = abs / 1000;
    return mdkr >= 10
      ? `${prefix}${mdkr.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} mdkr`
      : `${prefix}${mdkr.toFixed(1).replace(".", ",")} mdkr`;
  }
  return `${prefix}${abs.toLocaleString("sv-SE")} mkr`;
}

export function formatMsekBare(msek: number): string {
  const sign = msek < 0 ? "\u2212" : "";
  const abs = Math.abs(msek);
  if (abs >= 1000) {
    const mdkr = abs / 1000;
    return mdkr >= 10
      ? `${sign}${mdkr.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")}`
      : `${sign}${mdkr.toFixed(1).replace(".", ",")}`;
  }
  return `${sign}${abs.toLocaleString("sv-SE")}`;
}

export function formatMsekShort(msek: number): string {
  return formatMsekBare(msek);
}

export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

export function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("sv-SE");
  } catch {
    return dateStr;
  }
}

export function dataHash(changelog: Array<{ data_hash: string }>): string {
  return changelog.length > 0 ? changelog[changelog.length - 1].data_hash : "0000000000000000000000000000000000000000000000000000000000000000";
}

export function getPartyByCode(parties: Array<{ code: string; name: string }>, code: string) {
  return parties.find((p) => p.code === code);
}

export function formatMsekOg(msek: number, basis?: string): string {
  const prefix = basis === "llm_estimat" ? "≈ " : "";
  return `${prefix}${formatMsekBare(msek)}`;
}

export function formatBasisLabel(basis: string): string {
  const labels: Record<string, string> = {
    rut: "Riksdagens utredningstjänst",
    myndighet: "Myndighet",
    parti: "Partiets egen siffra",
    media: "Nyhetsmedier",
    llm_estimat: "Datoruppskattning",
    granskare: "Satt för hand vid granskningen",
  };
  return labels[basis] ?? basis;
}

/** Plain-språksetikett för kostnadstyp — råa enum-värden ("intäktsminskning")
 *  är obegripliga för en bred läsekrets. */
export function formatCostType(type: string): string {
  const labels: Record<string, string> = {
    utgift: "utgift",
    intäktsminskning: "minskad inkomst för staten (t.ex. skattesänkning)",
    besparing: "besparing",
    intäktsökning: "ökad inkomst för staten (t.ex. ny eller höjd skatt)",
  };
  return labels[type] ?? type;
}
