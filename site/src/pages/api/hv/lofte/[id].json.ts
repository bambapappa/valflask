import { lofteIds, buildLofteDetalj } from "../../../../lib/rutnat.ts";

export const prerender = true;

export function getStaticPaths() {
  return lofteIds().map((id) => ({ params: { id } }));
}

export async function GET({ params }: { params: { id: string } }) {
  const detalj = buildLofteDetalj(params.id);
  if (!detalj) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(detalj), {
    headers: { "Content-Type": "application/json" },
  });
}
