/**
 * Samma vägda utslag som `vagda.json`, men nycklade på riksdagens egna
 * dokument-id. Den breda träfflistan kommer från riksdagen och känner bara
 * de id:na; utan den här kan en rad där inte visa att vi redan vägt
 * dokumentet.
 */
import { byggVagdaDokId } from "../../../lib/amne.ts";

export const prerender = true;

export async function GET() {
  return new Response(JSON.stringify(byggVagdaDokId()), {
    headers: { "Content-Type": "application/json" },
  });
}
