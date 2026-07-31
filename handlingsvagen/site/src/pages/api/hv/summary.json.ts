import { buildSummary } from "../../../lib/rutnat.ts";

export const prerender = true;

export async function GET() {
  const summary = buildSummary();
  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
}
