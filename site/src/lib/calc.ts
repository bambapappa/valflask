import type { PromisePost } from "./data";

export { canonicalStringify, computeDataHash } from "./canonical";

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
  deterministComparisons,
  buildSummary,
  formatComparison,
  isActive,
  isCostType,
  isBesparing,
  promiseTotalLowMsek,
  promiseTotalHighMsek,
} from "./aggregates";

export type {
  CoalitionResult,
  GroupNote,
  ComparisonResult,
  CategoryBreakdown,
  SummaryData,
} from "./aggregates";

export function formatMsek(msek: number, basis?: string): string {
  const prefix = basis === "llm_estimat" ? "≈ " : "";
  if (msek >= 1000) {
    const mdkr = msek / 1000;
    return mdkr >= 10
      ? `${prefix}${mdkr.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")} mdkr`
      : `${prefix}${mdkr.toFixed(1).replace(".", ",")} mdkr`;
  }
  return `${prefix}${msek.toLocaleString("sv-SE")} mkr`;
}

export function formatMsekBare(msek: number): string {
  if (msek >= 1000) {
    const mdkr = msek / 1000;
    return mdkr >= 10
      ? `${mdkr.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")}`
      : `${mdkr.toFixed(1).replace(".", ",")}`;
  }
  return `${msek.toLocaleString("sv-SE")}`;
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
    rut: "RUT/utredning",
    myndighet: "Myndighet",
    parti: "Partiets beräkning",
    media: "Media",
    llm_estimat: "LLM-estimat",
  };
  return labels[basis] ?? basis;
}
