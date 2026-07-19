/**
 * Förslagssteget (HV2): språkmodellen läser ett löfte och ett
 * riksdagsdokument och får FÖRESLÅ en koppling med exakt citat.
 * Allt den föreslår prövas av grindarna H1–H5 (kod) och därefter av
 * ägaren (H6). Modellen sätter aldrig domar och skriver aldrig data.
 *
 * Kandidaturvalet är deterministiskt (ordöverlapp) så att samma data
 * alltid ger samma kandidatlista — modellen väljer inte vad den får se.
 */

import type { Betankande } from "./betankanden.ts";
import { indexeraBetankanden } from "./betankanden.ts";
import type { Handling } from "./handlingar.ts";
import type { LlmClient } from "./llm.ts";
import { provaGrindarna, type GrindFel, type GrindKontext, type KopplingsForslag } from "./grindar.ts";

/** Löftesfälten förslagssteget behöver (delmängd av valflask promises.json). */
export interface Lofte {
  id: string;
  title: string;
  quote: string;
  parties: string[];
  person?: string | null;
  category?: string;
}

const STOPPORD = new Set([
  "att", "och", "det", "som", "för", "med", "till", "ska", "skall", "inte",
  "den", "det", "de", "vi", "man", "har", "kan", "bör", "från", "om", "en",
  "ett", "är", "av", "på", "i", "eller", "samt", "vår", "våra", "alla",
  "mer", "fler", "detta", "denna", "sig", "sina", "vara", "blir", "genom",
]);

/** Ord (gemener, ≥4 tecken, ej stoppord) ur en text — deterministiskt. */
export function nyckelord(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-zåäöéü0-9-]+/u)
      .filter((w) => w.length >= 4 && !STOPPORD.has(w)),
  );
}

export interface Kandidat {
  handling: Handling;
  poang: number;
}

/**
 * Rankar dokumenthandlingar mot ett löfte på ordöverlapp i titeln.
 * Voteringar utelämnas här — de kopplas via betänkandetexten i ett
 * senare steg. Minst två gemensamma nyckelord krävs.
 */
export function rankaKandidater(lofte: Lofte, handlingar: Handling[], max: number): Kandidat[] {
  const mal = nyckelord(`${lofte.title} ${lofte.quote} ${lofte.category ?? ""}`);
  const kandidater: Kandidat[] = [];
  for (const h of handlingar) {
    if (h.kind === "votering") continue;
    if (lofte.parties.length > 0 && h.parties.length > 0 && !lofte.parties.some((p) => h.parties.includes(p))) {
      continue; // fel aktör — H3 skulle ändå fälla
    }
    let poang = 0;
    for (const w of nyckelord(h.titel)) if (mal.has(w)) poang += 1;
    if (poang >= 2) kandidater.push({ handling: h, poang });
  }
  return kandidater
    .sort((a, b) => b.poang - a.poang || a.handling.id.localeCompare(b.handling.id))
    .slice(0, max);
}

/** En voteringskandidat: voteringen plus betänkandet vars text är källan. */
export interface VoteringsKandidat {
  handling: Handling;
  betankande: Betankande;
  poang: number;
}

/**
 * Rankar voteringar mot ett löfte på ordöverlapp i BETÄNKANDETS titel —
 * voteringens egen titel är bara beteckning och punkt. Samma deterministiska
 * regel som för dokument: minst två gemensamma nyckelord. Voteringar utan
 * betänkande i indexet utelämnas (tomt är ärligt); löftespartiet måste
 * förekomma i röstfördelningen — annars skulle H3 ändå fälla.
 */
export function rankaVoteringsKandidater(
  lofte: Lofte,
  handlingar: Handling[],
  betankanden: Betankande[],
  max: number,
): VoteringsKandidat[] {
  const index = indexeraBetankanden(betankanden);
  const mal = nyckelord(`${lofte.title} ${lofte.quote} ${lofte.category ?? ""}`);
  const kandidater: VoteringsKandidat[] = [];
  for (const h of handlingar) {
    if (h.kind !== "votering") continue;
    const bet = index.get(h.dok_id);
    if (!bet) continue;
    const partier = h.rostfordelning ? Object.keys(h.rostfordelning) : [];
    if (lofte.parties.length > 0 && partier.length > 0 && !lofte.parties.some((p) => partier.includes(p))) {
      continue;
    }
    let poang = 0;
    for (const w of nyckelord(bet.titel)) if (mal.has(w)) poang += 1;
    if (poang >= 2) kandidater.push({ handling: h, betankande: bet, poang });
  }
  return kandidater
    .sort((a, b) => b.poang - a.poang || a.handling.id.localeCompare(b.handling.id))
    .slice(0, max);
}

/** Motionstyp härledd ur handlingen: flera undertecknare → kommitté, annars
 * enskild. "parti" sätts aldrig av kod — det avgör människan i granskningen
 * (b-0007). */
export function motionstypAvHandling(h: Handling): "kommitte" | "enskild" | undefined {
  if (h.kind !== "motion") return undefined;
  return h.persons.length > 1 ? "kommitte" : "enskild";
}

/** Modellens förväntade JSON-svar. */
export interface ForslagSvar {
  riktning: "stodjer" | "motverkar";
  citat: string;
  motivering: string;
  confidence: number;
}

/** Rensar ev. kodstaket och tolkar modellsvaret. null = ingen koppling. */
export function parseForslagSvar(raw: string): ForslagSvar | null {
  const utan = raw.replace(/^\s*```(?:json)?\s*/u, "").replace(/\s*```\s*$/u, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(utan);
  } catch {
    throw new Error(`ogiltigt JSON-svar: ${raw.slice(0, 120)}`);
  }
  const k = (parsed as { koppling?: unknown }).koppling;
  if (k === null || k === undefined) return null;
  const o = k as Record<string, unknown>;
  const riktning = o["riktning"];
  const citat = o["citat"];
  const motivering = o["motivering"];
  const confidence = Number(o["confidence"]);
  if (riktning !== "stodjer" && riktning !== "motverkar") throw new Error(`okänd riktning i svaret: ${String(riktning)}`);
  if (typeof citat !== "string" || typeof motivering !== "string") throw new Error("svaret saknar citat/motivering");
  return { riktning, citat, motivering, confidence: Number.isFinite(confidence) ? confidence : 0 };
}

export function byggPrompt(lofte: Lofte, handling: Handling, kalltext: string, betankande?: Betankande): string {
  return [
    `LÖFTE (${lofte.parties.join(", ").toUpperCase()}): ${lofte.title}`,
    `Exakt citat ur löfteskällan: "${lofte.quote}"`,
    "",
    `RIKSDAGSHANDLING (${handling.kind}, ${handling.datum}): ${handling.titel}`,
    ...(betankande
      ? [
          `Voteringen gällde punkt ${handling.punkt ?? "?"} i betänkandet ` +
            `${betankande.rm}:${betankande.beteckning} "${betankande.titel}". ` +
            "DOKUMENTTEXT nedan är betänkandets text — citatet ska stå där.",
        ]
      : []),
    "",
    "DOKUMENTTEXT:",
    kalltext,
  ].join("\n");
}

export interface ForslagResultat {
  forslag: KopplingsForslag | null;
  grindfel: GrindFel[];
}

/**
 * Kör förslagssteget för ETT (löfte, handling)-par: fråga modellen, tolka
 * svaret, pröva grindarna. Källtexten skickas till både modellen och H2 —
 * samma text, samma sanning. För en votering är källtexten betänkandets
 * text: skicka med betänkandet, så bär beviset dess dok_id.
 */
export async function skapaForslag(
  llm: LlmClient,
  systemPrompt: string,
  model: string,
  lofte: Lofte,
  handling: Handling,
  kalltext: string,
  fonster: GrindKontext["fonster"],
  betankande?: Betankande,
): Promise<ForslagResultat> {
  const svar = parseForslagSvar(
    await llm.complete(byggPrompt(lofte, handling, kalltext, betankande), {
      systemPrompt,
      model,
      temperature: 0,
      responseFormat: { type: "json_object" },
    }),
  );
  if (!svar) return { forslag: null, grindfel: [] };

  const motionstyp = motionstypAvHandling(handling);
  const forslag: KopplingsForslag = {
    promise_id: lofte.id,
    handling_id: handling.id,
    riktning: svar.riktning,
    bevis: { citat: svar.citat, ...(betankande ? { kalla_dok_id: betankande.dok_id } : {}) },
    ...(motionstyp ? { motionstyp } : {}),
    method_note: svar.motivering,
    confidence: svar.confidence,
  };
  const grindfel = provaGrindarna(forslag, {
    handling,
    kalltext,
    malPartier: lofte.parties,
    fonster,
  });
  return { forslag, grindfel };
}
