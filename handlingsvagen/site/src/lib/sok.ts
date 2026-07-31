/**
 * Eget litet sökindex (b-0018 F3): exakt matchning + prefix, inga beroenden,
 * buntat i bygget, laddas först när sökrutan fokuseras. Täcker löftestitlar,
 * kategorier, partier och de 425 sittande ledamöterna — allt rutnätet och
 * parti-/ledamotssidorna kan navigera till.
 */
import { buildSummary } from "./rutnat.ts";
import { getParties, getPersoner } from "./data.ts";

export interface SokPost {
  typ: "lofte" | "kategori" | "parti" | "ledamot";
  id: string;
  text: string;
  kategori?: string;
  /** Relativ sökväg (utan bas) för parti/ledamot; löften/kategorier navigeras via startsidan. */
  url?: string;
}

export function buildSokIndex(): SokPost[] {
  const summary = buildSummary();
  const poster: SokPost[] = [];
  for (const kat of summary.kategorier) poster.push({ typ: "kategori", id: kat, text: kat });
  for (const l of summary.loften) poster.push({ typ: "lofte", id: l.id, text: l.titel, kategori: l.kategori });
  for (const p of getParties()) poster.push({ typ: "parti", id: p.code, text: p.namn, url: `parti/${p.code}` });
  for (const p of getPersoner()) {
    poster.push({ typ: "ledamot", id: p.intressent_id, text: `${p.namn} (${p.parti.toUpperCase()})`, url: `ledamot/${p.intressent_id}` });
  }
  return poster;
}
