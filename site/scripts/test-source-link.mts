import { archiveCaptureDate, archiveLinkLabel } from "../src/lib/source-link.ts";

let failed = 0;
function check(name: string, ok: boolean): void {
  if (!ok) { console.error(`FEL: ${name}`); failed++; }
  else console.log(`OK: ${name}`);
}

const late = "https://web.archive.org/web/20260928111407/https://kristdemokraterna.se/var-politik/politik-a-till-o/uppehallstillstand";
const earlier = "https://web.archive.org/web/20260907094234/https://valkompass.svt.se/2026/parti/socialdemokraterna/";
check("arkivdatum läses ur kopians adress", archiveCaptureDate(late) === "2026-09-28");
check("senare kopia märks synligt", archiveLinkLabel(late, "2026-08-15") === "arkiv (2026-09-28, senare kopia)");
check("kopians datum och senare-markering visas", archiveLinkLabel(earlier, "2026-08-13") === "arkiv (2026-09-07, senare kopia)");
check("kopia före angivet uttalande kallas inte senare", archiveLinkLabel(earlier, "2026-09-13") === "arkiv (2026-09-07)");
check("PDF-arkiv behåller sidnumret", archiveLinkLabel("https://web.archive.org/web/20260712090000/https://example.org/rapport.pdf#page=7", "2026-07-01") === "arkiv (2026-07-12, senare kopia) (PDF, s. 7)");
check("ogiltigt kalenderdatum räknas inte som kopia", archiveCaptureDate("https://web.archive.org/web/20260230010203/https://example.org/") === null);
check("okänd arkivtjänst behåller neutral etikett", archiveLinkLabel("https://archive.ph/example", "2026-08-15") === "arkiv");
if (failed) process.exit(1);
