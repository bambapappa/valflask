import { createHash } from "node:crypto";
import { getPromises } from "../../../lib/data";
import { getIssuesFile, getStances } from "../../../lib/stances";
import { canonicalStringify, computeDataHash } from "../../../lib/canonical";

export const prerender = true;

function hashOf(data: unknown): string {
  return createHash("sha256").update(canonicalStringify(data)).digest("hex");
}

export async function GET() {
  const promises = getPromises();
  const data_hash = computeDataHash(promises);
  const body = {
    generated_at: new Date().toISOString(),
    // Bakåtkompatibelt: data_hash avser promises.json, som alltid.
    data_hash,
    algorithm: "sha256",
    canonical_source: "promises.json",
    // Frågevågen (SPEC-FRAGEVAGEN §4.3): integritetskedjan utökad per fil.
    files: {
      "promises.json": data_hash,
      "stances.json": hashOf(getStances()),
      "issues.json": hashOf(getIssuesFile()),
    },
    license: "CC-BY-4.0",
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
