/**
 * Inverterat index skärvat på ordets två första tecken: ordstam → handlingar.
 * Sökrutan hämtar bara den skärva det sökta ordet hör till.
 */
import { byggOrdSkarva, ordSkarvor } from "../../../../lib/amne.ts";

export const prerender = true;

export function getStaticPaths() {
  return ordSkarvor().map((prefix) => ({ params: { prefix } }));
}

export async function GET({ params }: { params: { prefix: string } }) {
  return new Response(JSON.stringify(byggOrdSkarva(params.prefix)), {
    headers: { "Content-Type": "application/json" },
  });
}
