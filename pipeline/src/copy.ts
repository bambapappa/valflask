import { readFileSync } from "node:fs";
import type { LlmClient, LlmOptions } from "./llm.ts";
import { extractJsonPayload } from "./extract.ts";

const A3_SYSTEM = (() => {
  const raw = readFileSync(
    new URL("../prompts/A3-quip.md", import.meta.url),
    "utf8",
  );
  return raw.replace(/^#\s+.*\n/, "").trim();
})();

const A4_SYSTEM = (() => {
  const raw = readFileSync(
    new URL("../prompts/A4-weekly.md", import.meta.url),
    "utf8",
  );
  return raw.replace(/^#\s+.*\n/, "").trim();
})();

export interface WeeklyChronicle {
  headline: string;
  body_md: string;
}

export async function generateQuip(
  title: string,
  costText: string,
  llm: LlmClient,
  model: string,
): Promise<string> {
  const prompt =
    `Löfte: ${title}\nBelopp: ${costText}\n\nSvara med EN mening.`;

  const opts: LlmOptions = {
    systemPrompt: A3_SYSTEM,
    temperature: 0,
    model,
  };

  const raw = await llm.complete(prompt, opts);
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function generateWeekly(
  promisesJson: string,
  totalGap: string,
  llm: LlmClient,
  model: string,
): Promise<WeeklyChronicle> {
  const prompt =
    `Underlag (JSON):\n${promisesJson}\n\nTotalt finansieringsgap: ${totalGap}`;

  const opts: LlmOptions = {
    systemPrompt: A4_SYSTEM,
    temperature: 0,
    model,
  };

  const raw = await llm.complete(prompt, opts);
  // Modeller svarar ofta med ```json-staket — skala av innan parsning. Och vid
  // oparsbart svar: KASTA, publicera aldrig råsvaret (veckan 2026-28 hamnade
  // live som rå JSON med rubriken "Veckans fläsk"). maybeGenerateWeekly sväljer
  // felet och försöker igen nästa körning.
  const parsed = JSON.parse(extractJsonPayload(raw)) as Partial<WeeklyChronicle>;
  if (
    typeof parsed.headline !== "string" || parsed.headline.trim() === "" ||
    typeof parsed.body_md !== "string" || parsed.body_md.trim() === ""
  ) {
    throw new Error("Veckokrönikans LLM-svar saknar headline/body_md");
  }
  return { headline: parsed.headline, body_md: parsed.body_md };
}
