import type { PromisePost } from "./data";

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

export function promiseTotalMsek(p: PromisePost): number {
  const multiplier = p.cost.period === "per_ar" ? 4 : 1;
  return p.cost.msek_base * multiplier;
}

export function partyTotalMsek(promises: PromisePost[], partyCode: string): number {
  return getPromisesForParty(promises, partyCode).reduce((sum, p) => sum + promiseTotalMsek(p), 0);
}

export function totalFlasket(promises: PromisePost[]): number {
  return promises
    .filter((p) => p.cost.type === "utgift" || p.cost.type === "intäktsminskning")
    .reduce((sum, p) => sum + promiseTotalMsek(p), 0);
}

export function totalBesparingar(promises: PromisePost[]): number {
  return promises
    .filter((p) => p.cost.type === "besparing")
    .reduce((sum, p) => sum + promiseTotalMsek(p), 0);
}

export function totalFinancingClaimed(promises: PromisePost[]): number {
  return promises.reduce((sum, p) => sum + (p.financing_claimed.msek ?? 0), 0);
}

export function financingGap(promises: PromisePost[]): number {
  return totalFlasket(promises) - totalBesparingar(promises) - totalFinancingClaimed(promises);
}

export function getPromisesForParty(promises: PromisePost[], code: string): PromisePost[] {
  return promises.filter((p) => p.parties.includes(code) && p.status !== "tillbakadragen");
}

export function countPromises(promises: PromisePost[]): number {
  return promises.filter((p) => p.status !== "tillbakadragen").length;
}

export function isFixture(promises: PromisePost[]): boolean {
  return promises.some((p) => p.extraction.run_id.startsWith("fixture-"));
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
