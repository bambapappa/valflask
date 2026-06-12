import { getChangelog } from "../../../lib/data";

export const prerender = true;

export async function GET() {
  const changelog = getChangelog();
  const body = {
    generated_at: new Date().toISOString(),
    data: changelog,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
