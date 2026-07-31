import { getChangelog, getPromises } from "../../../lib/data";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const changelog = getChangelog();
  const promises = getPromises();
  const data_hash = computeDataHash(promises);
  const body = {
    generated_at: new Date().toISOString(),
    data_hash,
    license: "CC-BY-4.0",
    // Sajten bytte adress 2026-08-02. Gamla adresser pekar vidare, men den
    // som hämtar data maskinellt ska aldrig behöva gissa varför värdnamnet
    // ändrats — därför står bytet skrivet i svaret.
    adressbyte: {
      datum: "2026-08-02",
      fran: "drygast.nu",
      till: "utlovat.se",
      kommentar:
        "Sajten heter numera utlovat.se. Gamla adresser pekar vidare med permanent omdirigering, sökväg för sökväg.",
    },
    data: changelog,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
