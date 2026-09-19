import { createHash } from "node:crypto";
import { forberedKalkylforslag } from "../../src/kalkylforslag.ts";
import { byggSakunderlag, skapaSakprovning } from "../../src/sakprovning.ts";
import { kanoniskJson } from "../../src/underlagsversion.ts";
import type { Kalkylbeslutsunderlag } from "../../src/kalkylbeslut.ts";
import type { PromiseEntry } from "../../src/loftesforslag.ts";
import type { ReviewCandidate } from "../../src/review.ts";
import type { Flyttrad } from "../../src/kalkylflytt.ts";
/** Endast syntetiskt kontraktsprov; ingen sakbedömning eller mänsklig attest. */
export function provatKalkylunderlag(rad: Flyttrad, loften: PromiseEntry[], kandidat: ReviewCandidate): Kalkylbeslutsunderlag {
  const forslag = forberedKalkylforslag(rad, loften, kandidat, new Date());
  const aktuellaReferenser = [{ id: "kalla", slag: "kalla" as const, adress: kandidat.articleUrl, innehall: kandidat.candidate.quote! },
    { id: "regel", slag: "regel" as const, adress: "test", innehall: "Formatprov, inget faktiskt sakfacit." }];
  const provning = skapaSakprovning(byggSakunderlag(forslag, loften, kandidat, aktuellaReferenser));
  provning.bedomare = "Syntetiskt kontraktsprov, inte mänsklig attest";
  for (const b of provning.bedomningar) { b.utfall = "styrkt"; b.motivering = "Tekniskt formatprov, ingen utförd sakbedömning."; b.belagg = ["kalla", "regel"]; }
  const provningshash = createHash("sha256").update(kanoniskJson(provning)).digest("hex");
  return { forslag, provning, aktuellaReferenser, provningshash };
}
