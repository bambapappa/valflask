export const prerender = true;

export async function GET() {
  const summary = {
    generated_at: new Date().toISOString(),
    data_hash: "0000000000000000000000000000000000000000000000000000000000000000",
    total_parties: 8,
    total_promises: 0,
    total_msek_base: 0,
    financing_gap_msek: 0,
  };
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
