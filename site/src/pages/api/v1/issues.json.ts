import { getIssuesFile } from "../../../lib/stances";

export const prerender = true;

export async function GET() {
  const issuesFile = getIssuesFile();
  const body = {
    generated_at: new Date().toISOString(),
    license: "CC-BY-4.0",
    attribution: "drygast.nu",
    criteria_note: issuesFile.criteria_note,
    formulation_note: issuesFile.formulation_note,
    issues: issuesFile.issues,
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
