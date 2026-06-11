export const prerender = true;
export async function GET() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>drygast.nu</title></channel></rss>`, {
    headers: { 'Content-Type': 'application/xml' }
  });
}
