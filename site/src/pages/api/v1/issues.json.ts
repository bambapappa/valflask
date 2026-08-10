import { getIssuesFile } from "../../../lib/stances";
import { computeDataHash } from "../../../lib/canonical";

export const prerender = true;

export async function GET() {
  const issuesFile = getIssuesFile();
  // Kontrollnumret saknades här och bara här: api-sidan lovar att VARJE svar
  // bär generated_at och data_hash, och sju av åtta gjorde det. Utan hashen
  // kan en läsare inte säga vilken körning frågelistan kommer från.
  const body = {
    generated_at: new Date().toISOString(),
    data_hash: computeDataHash(issuesFile.issues),
    algorithm: "sha256",
    canonical_source: "issues.json",
    license: "CC-BY-4.0",
    attribution: "utlovat.se",
    criteria_note: issuesFile.criteria_note,
    formulation_note: issuesFile.formulation_note,
    issues: issuesFile.issues,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
