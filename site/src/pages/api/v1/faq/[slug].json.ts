import { faqFragor } from "../../../../lib/faq";

export const prerender = true;

export function getStaticPaths() {
  return faqFragor().map((s) => ({ params: { slug: s.slug } }));
}

export async function GET({ params }: { params: { slug: string } }) {
  const svar = faqFragor().find((s) => s.slug === params.slug);
  if (!svar) return new Response(JSON.stringify({ error: "okänd FAQ-fråga" }, null, 2), { status: 404 });

  const body = {
    question: svar.question,
    slug: svar.slug,
    typ: svar.typ,
    kontext: svar.kontext,
    answer_short: svar.answer_short,
    updated_at: svar.updated_at,
    license: svar.license,
    attribution: "utlovat.se",
    data_hash: svar.data_hash,
    page_url: `https://utlovat.se/faq/${svar.slug}/`,
    index_url: "https://utlovat.se/api/v1/faq.json",
    sources: svar.sources,
    data: svar.data,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
