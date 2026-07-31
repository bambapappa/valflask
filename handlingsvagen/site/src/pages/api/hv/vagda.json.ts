/**
 * De handlingar som bär ett vägt utslag (godkänd koppling) och åt vilket
 * håll. Liten nyttolast — bara granskade kopplingar. Sökträffar utan post
 * här visar ingen riktning: dokumentet innehåller ordet, inget mer.
 */
import { byggVagda } from "../../../lib/amne.ts";

export const prerender = true;

export async function GET() {
  return new Response(JSON.stringify(byggVagda()), {
    headers: { "Content-Type": "application/json" },
  });
}
