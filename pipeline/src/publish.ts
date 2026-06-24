import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  passesAmountCapR5,
  type ExtractionCandidate,
  type GateFailure,
  type NormalizedArticle,
} from "./gates.ts";
import type { CostEstimate } from "./cost.ts";
import type { VerifyResult } from "./verify.ts";

export interface PipelinePromise {
  id: string;
  group_id: string | null;
  title: string;
  slug: string;
  parties: string[];
  person: {
    name: string;
    role: string;
    riksdagen_id?: string | null;
  } | null;
  quote: string;
  date_stated: string;
  source: {
    url: string;
    domain: string;
    archive_url: string | null;
    fetched_at: string;
  };
  category: string;
  cost: CostEstimate;
  financing_claimed: {
    described: boolean;
    summary: string | null;
    msek: number | null;
  };
  comparisons: string[];
  quip: string;
  status: "aktiv";
  history: [];
  extraction: {
    model: string;
    verified_by: string;
    run_id: string;
  };
}

export interface NeedsReviewEntry {
  candidate: unknown;
  failures: GateFailure[];
  articleUrl: string;
  articleTitle: string;
  verifyReason?: string;
  costReason?: string;
  /** Beräknad kostnad (om steget hanns med) — så review kan visa och redigera den. */
  cost?: CostEstimate;
  /** Id på troligt befintligt löfte detta är en dublett av (manuell länkning i review). */
  duplicateOf?: string;
}

export interface ChangelogEntry {
  run_id: string;
  added: string[];
  updated: string[];
  retracted: string[];
  data_hash: string;
  timestamp: string;
}

export interface PublishInput {
  processedCandidates: Array<{
    candidate: ExtractionCandidate;
    article: NormalizedArticle;
    verifyResult: VerifyResult;
    cost: CostEstimate;
    quip: string;
    archiveUrl: string | null;
    extractModel: string;
    verifyModel: string;
  }>;
  reviewItems: NeedsReviewEntry[];
  existingPromises: PipelinePromise[];
  runId: string;
  now: Date;
  outputDir: string;
}

export interface PublishResult {
  promises: PipelinePromise[];
  needsReview: NeedsReviewEntry[];
  dataHash: string;
  changelogEntry: ChangelogEntry;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function nextId(existing: PipelinePromise[]): string {
  let max = 0;
  for (const p of existing) {
    const m = p.id.match(/^p-2026-(\d+)$/);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > max) max = n;
    }
  }
  return `p-2026-${String(max + 1).padStart(4, "0")}`;
}

function canonicalStringify(data: unknown, indent?: string): string {
  if (data === null || data === undefined) return "null";
  if (typeof data === "boolean") return data ? "true" : "false";
  if (typeof data === "number") return JSON.stringify(data);
  if (typeof data === "string") return JSON.stringify(data);
  if (Array.isArray(data)) {
    const items = data.map((v) => canonicalStringify(v, indent));
    return `[${items.join(",")}]`;
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => {
      const val = canonicalStringify(obj[k], indent);
      return `${JSON.stringify(k)}:${val}`;
    });
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

export function computeDataHash(promises: PipelinePromise[]): string {
  const canonical = canonicalStringify(promises);
  return createHash("sha256").update(canonical).digest("hex");
}

export function publish(input: PublishInput): PublishResult {
  const {
    processedCandidates,
    reviewItems,
    existingPromises,
    runId,
    now,
    outputDir,
  } = input;

  const newPromises: PipelinePromise[] = [];
  const allPromises = [...existingPromises];
  const addedIds: string[] = [];

  for (const pc of processedCandidates) {
    if (!passesAmountCapR5(pc.cost.msek_base)) {
      reviewItems.push({
        candidate: pc.candidate,
        failures: [
          {
            gate: "G4",
            reason: `R5 recheck i publish: msek_base ${pc.cost.msek_base} överstiger taket`,
          },
        ],
        articleUrl: pc.article.url,
        articleTitle: pc.article.title,
      });
      continue;
    }

    const id = nextId(allPromises);
    const date = pc.article.published.slice(0, 10);

    const p: PipelinePromise = {
      id,
      group_id: null,
      title: pc.candidate.title,
      slug: slugify(pc.candidate.title),
      parties: pc.candidate.parties,
      person: pc.candidate.person,
      quote: pc.candidate.quote,
      date_stated: date,
      source: {
        url: pc.article.url,
        domain: pc.article.domain,
        archive_url: pc.archiveUrl,
        fetched_at: pc.article.published,
      },
      category: pc.candidate.category,
      cost: pc.cost,
      financing_claimed: {
        described: pc.candidate.financing_mentioned,
        summary: null,
        msek: null,
      },
      comparisons: [],
      quip: pc.quip,
      status: "aktiv",
      history: [],
      extraction: {
        model: pc.extractModel,
        verified_by: pc.verifyModel,
        run_id: runId,
      },
    };

    allPromises.push(p);
    newPromises.push(p);
    addedIds.push(id);
  }

  allPromises.sort((a, b) => a.id.localeCompare(b.id));

  const dataHash = computeDataHash(allPromises);

  const changelogEntry: ChangelogEntry = {
    run_id: runId,
    added: addedIds,
    updated: [],
    retracted: [],
    data_hash: dataHash,
    timestamp: now.toISOString(),
  };

  mkdirSync(outputDir, { recursive: true });

  writeFileSync(
    `${outputDir}/promises.json`,
    JSON.stringify(allPromises, null, 2) + "\n",
  );
  writeFileSync(
    `${outputDir}/needs_review.json`,
    JSON.stringify(reviewItems, null, 2) + "\n",
  );

  const existingChangelog = (() => {
    try {
      return JSON.parse(
        readFileSync(`${outputDir}/changelog.json`, "utf8"),
      ) as ChangelogEntry[];
    } catch {
      return [];
    }
  })();
  existingChangelog.push(changelogEntry);
  writeFileSync(
    `${outputDir}/changelog.json`,
    JSON.stringify(existingChangelog, null, 2) + "\n",
  );

  return {
    promises: allPromises,
    needsReview: reviewItems,
    dataHash,
    changelogEntry,
  };
}
