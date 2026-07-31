import { readFileSync } from "node:fs";
import type { LlmClient, LlmOptions } from "./llm.ts";
import { extractJsonPayload } from "./extract.ts";
import type { NormalizedArticle, ExtractionCandidate } from "./gates.ts";

const A2_SYSTEM = (() => {
  const raw = readFileSync(
    new URL("../prompts/A2-verify.md", import.meta.url),
    "utf8",
  );
  return raw.replace(/^#\s+.*\n/, "").trim();
})();

export interface VerifyResult {
  is_promise: boolean;
  party_correct: boolean;
  amount_in_text: boolean | null;
  verdict: "publish" | "review" | "reject";
  reason: string;
}

export async function verifyCandidate(
  candidate: ExtractionCandidate,
  article: NormalizedArticle,
  llm: LlmClient,
  model: string,
): Promise<VerifyResult> {
  const userPrompt =
    `<KANDIDAT>\n${JSON.stringify(candidate)}\n</KANDIDAT>\n` +
    `<KALLTEXT url="${article.url}" domain="${article.domain}" published="${article.published}">\n${article.text}\n</KALLTEXT>`;

  const opts: LlmOptions = {
    systemPrompt: A2_SYSTEM,
    temperature: 0,
    model,
  };

  const raw = await llm.complete(userPrompt, opts);

  try {
    return JSON.parse(extractJsonPayload(raw)) as VerifyResult;
  } catch {
    return {
      is_promise: false,
      party_correct: false,
      amount_in_text: null,
      verdict: "reject",
      reason: "Verifieringsanalys misslyckades (ogiltig JSON).",
    };
  }
}
