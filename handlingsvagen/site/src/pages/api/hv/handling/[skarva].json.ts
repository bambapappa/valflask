/**
 * Handlingarnas visningsdata, skärvat på handling-id (tusental). Sökrutan
 * hämtar bara de skärvor träffarna ligger i.
 */
import { byggHandlingSkarva, handlingSkarvor } from "../../../../lib/amne.ts";

export const prerender = true;

export function getStaticPaths() {
  return handlingSkarvor().map((skarva) => ({ params: { skarva } }));
}

export async function GET({ params }: { params: { skarva: string } }) {
  return new Response(JSON.stringify(byggHandlingSkarva(params.skarva)), {
    headers: { "Content-Type": "application/json" },
  });
}
