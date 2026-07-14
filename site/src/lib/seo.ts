/**
 * Sidtitlar för sökmotorer och AI-agenter (SPEC §12).
 *
 * Sökmotorer trunkerar titlar runt ~65 tecken med "…" — då kapas beloppet
 * och avsändaren bort, vilket är precis det vi vill visa (Bing-varning
 * 2026-07-14: 353 sidor). Regeln är identisk för alla partier: långa
 * löftestitlar kapas vid ordgräns så att belopp + "drygast.nu" alltid
 * överlever; korta titlar behåller den fulla frågemallen. H1 och innehåll
 * visar alltid den okapade titeln — detta gäller enbart <title>.
 */

/** Budget för hela <title>-strängen. */
export const TITLE_BUDGET = 70;

/** Kapar vid ordgräns med "…"; städar hängande skiljetecken. */
export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - 1));
  const sp = cut.lastIndexOf(" ");
  const head = sp > 20 ? cut.slice(0, sp) : cut;
  return head.replace(/[\s,.;:!?–—-]+$/u, "") + "…";
}

/**
 * Löftessidans <title>. Kort titel ⇒ frågemallen; lång ⇒ kompakt form där
 * citatet kapas men beloppet och avsändaren alltid får plats.
 * `amount` kommer från formatMsek och bär redan "≈ " vid llm_estimat.
 */
export function promisePageTitle(promiseTitle: string, amount: string): string {
  const full = `Vad kostar löftet "${promiseTitle}"? ${amount} — drygast.nu`;
  if (full.length <= TITLE_BUDGET) return full;
  const overhead = ` ${amount} — drygast.nu`.length;
  return `${truncateAtWord(promiseTitle, TITLE_BUDGET - overhead)} ${amount} — drygast.nu`;
}
