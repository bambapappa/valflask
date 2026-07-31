// Maskering av kostnadsbelopp i löpande text (kostnadsgrinden, b-0016).
// Krönikor och jämförelser bär sina belopp mitt i prosan; här lindas själva
// talet i <span class="belopp"> så det maskas tills läsaren kvitterat grinden.
// Enheten (miljarder/miljoner/kronor), intilliggande antal ("312 löften"),
// årtal och löftes-id lämnas synliga.

/** Escapar HTML-specialtecken. Körs före maskering eftersom resultatet
 *  injiceras med set:html. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Tusenavskiljare: vanligt mellanslag eller hårt mellanslag (U+00A0).
const SEP = "[\\u0020\\u00A0]";
// Ett tal med tusenavskiljare följt av en penningenhet. Bara talgruppen ($1)
// lindas; enhetsordet ($2) står kvar synligt.
const BELOPP_RE = new RegExp(
  `(\\d(?:${SEP}?\\d)*)(${SEP}(?:miljarder|miljoner|mdkr|mkr)\\b)`,
  "gu",
);

/** Lindar penningtal (t.ex. "13 000 miljarder", "320 mkr") i .belopp.
 *  Förväntar sig redan escapad text. Bara talet lindas — enhetsordet står kvar,
 *  så "drygt 13 000 miljarder kronor" blir "drygt [maskat] miljarder kronor". */
export function maskeraBelopp(escaped: string): string {
  return escaped.replace(BELOPP_RE, '<span class="belopp">$1</span>$2');
}

/** Escapa och maskera en rå sträng i ett svep (rubriker, korta noter). */
export function maskeraText(raw: string): string {
  return maskeraBelopp(escapeHtml(raw));
}
