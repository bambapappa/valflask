/**
 * Granskningskön ska spegla verkligheten — inte släpa efter den.
 *
 * VARFÖR: `needs_review.json` bar 2026-08-02 tjugosex poster medan bara
 * tjugoen hade ett öppet issue. De fem övriga var avgjorda sedan länge —
 * fyra godkända och publicerade, ett avvisat — men posterna städades aldrig
 * bort. Ingen grind sa ifrån. T7 rapporterade "26 poster" vid varje körning
 * utan att veta bättre, och den som läste filen såg fem beslut som redan var
 * fattade ligga och vänta på beslut.
 *
 * Den verkliga risken är dubbelpublicering: godkänner någon en post vars
 * löfte redan ligger i `promises.json` får sajten samma löfte två gånger,
 * och summan räknar det två gånger.
 *
 * Testet nedan låser fast att det inte kan hända. Nyckeln är samma par som
 * `reviewId` bygger på — källans adress plus löftets rubrik — så det är
 * exakt samma identitet som issue-synken och beslutsvägen använder.
 *
 * VAD DET INTE FÅNGAR: en post som avvisats men lämnats kvar. Ett avvisat
 * förslag blir aldrig ett löfte, så det finns ingenting att jämföra mot i
 * datat — det kräver en koll mot stängda issues, och den kan bara göras med
 * nätet. Den luckan är känd och står här för att nästa läsare inte ska tro
 * att kön är helt vaktad.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewId, type ReviewCandidate } from "../src/review.ts";

const DATA = resolve(import.meta.dirname, "../../data");

function las<T>(fil: string): T {
  return JSON.parse(readFileSync(resolve(DATA, fil), "utf8")) as T;
}

interface Lofte {
  title?: string;
  status?: string;
  source?: { url?: string };
}

/** Samma identitet som `reviewId`: källans adress och löftets rubrik. */
function loftesNyckel(l: Lofte): string {
  return `${l.source?.url ?? ""}::${l.title ?? ""}`;
}

function koNyckel(e: ReviewCandidate): string {
  const titel = (e.candidate as { title?: string } | null | undefined)?.title ?? "";
  return `${e.articleUrl ?? ""}::${titel}`;
}

describe("granskningskön speglar verkligheten", () => {
  it("ingen kö-post pekar på ett löfte som redan är publicerat", () => {
    const ko = las<ReviewCandidate[]>("needs_review.json");
    const loften = las<Lofte[]>("promises.json");

    const publicerade = new Map<string, string>();
    for (const l of loften) {
      if ((l.status ?? "aktiv") !== "aktiv") continue; // tillbakadragna räknas inte
      publicerade.set(loftesNyckel(l), l.title ?? "");
    }

    const kvarglomda = ko
      .filter((e) => publicerade.has(koNyckel(e)))
      .map((e) => `${reviewId(e)} — ${publicerade.get(koNyckel(e))}`);

    assert.deepEqual(
      kvarglomda,
      [],
      `Kön bär ${kvarglomda.length} post(er) vars löfte redan är publicerat. ` +
        `Beslutet är alltså fattat och verkställt, men posten städades inte bort. ` +
        `Godkänns den en gång till publiceras löftet dubbelt.\n  ` +
        kvarglomda.join("\n  "),
    );
  });

  it("ingen post ligger två gånger i kön", () => {
    const ko = las<ReviewCandidate[]>("needs_review.json");
    const sedda = new Set<string>();
    const dubbletter: string[] = [];
    for (const e of ko) {
      const id = reviewId(e);
      if (sedda.has(id)) dubbletter.push(id);
      sedda.add(id);
    }
    assert.deepEqual(
      dubbletter,
      [],
      `Samma post ligger flera gånger i kön: ${dubbletter.join(", ")}. ` +
        `Issue-synken skapar bara ett issue per identitet, så den andra posten ` +
        `skulle bli osynlig och aldrig gå att avgöra.`,
    );
  });
});
