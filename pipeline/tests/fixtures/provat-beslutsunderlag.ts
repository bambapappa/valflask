import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { approve, prepare, loesKoArgument, type Beslutsunderlag, type ReviewCandidate } from "../../src/review.ts";
import { byggSakunderlag, skapaSakprovning } from "../../src/sakprovning.ts";
import { kanoniskJson } from "../../src/underlagsversion.ts";

/** Endast teststruktur. Inga verkliga källkontroller, sakbedömningar eller attester. */
export function provatBeslutsunderlag(args: string[], dir: string): Beslutsunderlag {
  const forslag = prepare(args, dir);
  const loften = JSON.parse(readFileSync(join(dir, "promises.json"), "utf8"));
  const ko: ReviewCandidate[] = JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8"));
  const post = ko[loesKoArgument(ko, args[0])]!;
  const aktuellaReferenser = [
    { id: "kalla", slag: "kalla" as const, adress: post.articleUrl, innehall: post.candidate.quote! },
    { id: "regel", slag: "regel" as const, adress: "test", innehall: "Formatprov, inget faktiskt sakfacit." },
  ];
  const provning = skapaSakprovning(byggSakunderlag(forslag, loften, post, aktuellaReferenser));
  provning.bedomare = "Test av skrivgränsen, inte en mänsklig attest";
  for (const b of provning.bedomningar) {
    b.utfall = "styrkt";
    b.motivering = "Test av kontraktet, ingen utförd sakbedömning.";
    b.belagg = ["kalla", "regel"];
  }
  const provningshash = createHash("sha256").update(kanoniskJson(provning)).digest("hex");
  return { forslag, provning, aktuellaReferenser, provningshash };
}

export function godkannMedTestunderlag(args: string[], dir: string) {
  return approve(args, dir, provatBeslutsunderlag(args, dir));
}
