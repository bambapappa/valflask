import { buildSokIndex } from "../../../lib/sok.ts";

export const prerender = true;

export async function GET() {
  const poster = buildSokIndex();
  return new Response(JSON.stringify(poster), {
    headers: { "Content-Type": "application/json" },
  });
}
