/**
 * Betänkandenas voteringar, skärvat på riksmöte. Sidan hämtar en skärva när
 * en sökning träffat betänkanden — och kan då visa hur partierna faktiskt
 * röstade om de betänkandena, med riksdagens egna siffror.
 */
import { byggVoteringSkarva, voteringSkarvor } from "../../../../lib/amne.ts";

export const prerender = true;

export function getStaticPaths() {
  return voteringSkarvor().map((skarva) => ({ params: { skarva } }));
}

export async function GET({ params }: { params: { skarva: string } }) {
  return new Response(JSON.stringify(byggVoteringSkarva(params.skarva)), {
    headers: { "Content-Type": "application/json" },
  });
}
