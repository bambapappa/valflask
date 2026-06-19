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

/**
 * Plockar ut JSON-objektet ur ett LLM-svar. Modeller (särskilt utan
 * response_format) omgärdar ofta JSON med ```-staket eller prosa — det här
 * skalar bort det utan att röra själva objektet.
 */
export function extractJsonPayload(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

/**
 * Normaliserar skiftläge i partikoder och kategori. Modeller råkar ofta skriva
 * "MP"/"Skatter" — schemat (G1) kräver gemener. Ändrar inte värdemängden:
 * ogiltiga värden (t.ex. "statistik/register") faller fortfarande på G1.
 */
export function normalizeCandidate(c: ExtractionCandidate): ExtractionCandidate {
  if (!c || typeof c !== "object") return c;
  const out = c as unknown as Record<string, unknown>;
  if (Array.isArray(out.parties)) {
    out.parties = out.parties.map((p) =>
      typeof p === "string" ? p.toLowerCase().trim() : p,
    );
  }
  if (typeof out.category === "string") {
    out.category = out.category.toLowerCase().trim();
  }
  return c;
}

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
  } catch (e) {
    throw new Error(
      `Extract LLM-anrop misslyckades för ${article.url}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let parsed: { promises?: unknown };
  try {
    parsed = JSON.parse(extractJsonPayload(raw));
  } catch {
    console.error(
      `[extract] JSON-parse misslyckades för ${article.url}. Råsvar (≤300 tkn): ${raw.slice(0, 300).replace(/\s+/g, " ")}`,
    );
    throw new Error(`Extract JSON-parse misslyckades för ${article.url}`);
  }

  const candidates = Array.isArray(parsed.promises)
    ? (parsed.promises as ExtractionCandidate[])
    : [];
  if (!Array.isArray(parsed.promises)) {
    console.error(
      `[extract] Svaret saknade 'promises'-array för ${article.url}. Toppnycklar: ${Object.keys(parsed as object).join(", ") || "(inga)"}`,
    );
  }

  const normalized = candidates.map(normalizeCandidate);

  console.error(
    `[extract] ${article.url} | text=${article.text.length}ch | kandidater=${normalized.length}`,
  );

  return normalized;
}
