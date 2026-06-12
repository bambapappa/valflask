import { readFileSync } from "node:fs";
import type { LlmClient, LlmOptions } from "./llm.ts";
import type { NormalizedArticle, ExtractionCandidate } from "./gates.ts";

const A1_SYSTEM = (() => {
  const raw = readFileSync(
    new URL("../prompts/A1-extract.md", import.meta.url),
    "utf8",
  );
  return raw.replace(/^#\s+.*\n/, "").trim();
})();

export async function extractFromArticle(
  article: NormalizedArticle,
  llm: LlmClient,
  model: string,
): Promise<ExtractionCandidate[]> {
  const userPrompt =
    `<KALLTEXT url="${article.url}" domain="${article.domain}" published="${article.published}">\n` +
    `${article.text}\n` +
    `</KALLTEXT>`;

  const opts: LlmOptions = {
    systemPrompt: A1_SYSTEM,
    temperature: 0,
    model,
  };

  let raw: string;
  try {
    raw = await llm.complete(userPrompt, opts);
  } catch {
    throw new Error(`Extract failed for ${article.url}`);
  }

  let parsed: { promises: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    try {
      raw = await llm.complete(userPrompt, opts);
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `Extract JSON parse failed after retry for ${article.url}`,
      );
    }
  }

  return parsed.promises as ExtractionCandidate[];
}
