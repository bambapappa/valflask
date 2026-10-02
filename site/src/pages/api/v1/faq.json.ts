import { faqFragor } from "../../../lib/faq";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const svar = faqFragor();
  const body = {
    generated_at: new Date().toISOString(),
    data_hash: computeDataHash(svar.map((s) => [s.slug, s.question, s.updated_at])),
    algorithm: "sha256",
    canonical_source: "issues.json+stances.json+promises.json",
    license: "CC-BY-4.0",
    attribution: "utlovat.se",
    note: "Frågeformaterade, citerbara svar byggda ur publicerat data. Varje fråga har ett eget JSON-svar med källor (citat, url, arkivkopia) och underlagets datum i updated_at. Tomma celler är data: 'inget tydligt besked' betyder att inget citat i källorna ensamt räcker som belägg.",
    faq: svar.map((s) => ({
      slug: s.slug,
      question: s.question,
      typ: s.typ,
      kontext: s.kontext,
      updated_at: s.updated_at,
      page_url: `https://utlovat.se/faq/${s.slug}/`,
      api_url: `https://utlovat.se/api/v1/faq/${s.slug}.json`,
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
