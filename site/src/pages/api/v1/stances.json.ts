import { getStances } from "../../../lib/stances";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const stances = getStances();
  const body = {
    generated_at: new Date().toISOString(),
    data_hash: computeDataHash(stances),
    algorithm: "sha256",
    canonical_source: "stances.json",
    license: "CC-BY-4.0",
    attribution: "drygast.nu",
    note: "Append-only: publicerade besked ändras eller raderas aldrig; ändringar är egna poster (changes). Tomma celler (inget_tydligt_besked) är förstklassig, likabehandlad data.",
    stances,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
