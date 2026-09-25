import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

export interface Publiceringssummor {
  revision: string;
  berakningshash: string;
  utgifter: number;
  besparingar: number;
  finansiering: number;
  gap: number;
  partier: { kod: string; namn: string; netto: number; finansiering: number; gap: number }[];
}

/** Varje sida av jämförelsen använder den revisionens data och sajtens egen beräkningskod. */
export function lasPubliceringssummor(repo: string, revision: string): Publiceringssummor {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("Summeringen kräver fullständig commit-identitet");
  const las = (fil: string) => execFileSync("git", ["-C", repo, "show", `${revision}:${fil}`], {
    encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  });
  const kod = las("site/src/lib/aggregates.ts");
  const loften = JSON.parse(las("data/promises.json"));
  const partier = JSON.parse(las("data/parties.json"));
  if (!Array.isArray(loften) || !loften.length || !Array.isArray(partier) || !partier.length ||
      partier.some((p) => !p || typeof p.code !== "string" || typeof p.name !== "string") ||
      new Set(partier.map((p) => p.code)).size !== partier.length) throw new Error("Summeringens data saknas eller är ogiltiga");
  const dir = mkdtempSync(join(tmpdir(), "publiceringssummor-"));
  try {
    const fil = join(dir, "aggregates.mts");
    writeFileSync(fil, kod);
    // Beräkningsmodulen har bara typimporter. Ett nytt runtimeberoende ska ge fel,
    // inte råka läsas från arbetskopian och blandas med den äldre revisionen.
    const program = `import {readFileSync} from 'node:fs';
const a = await import(process.argv[1]);
const {loften,partier} = JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify({utgifter:a.totalFlasket(loften),besparingar:a.totalBesparingar(loften),
finansiering:a.totalFinancingClaimed(loften),gap:a.financingGap(loften),partier:partier.map(p=>({
kod:p.code,namn:p.name,netto:a.partyTotalMsek(loften,p.code),
finansiering:a.partyFinancingClaimedMsek(loften,p.code),gap:a.partyFinancingGapMsek(loften,p.code)}))}));`;
    const svar = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--input-type=module",
      "--eval", program, pathToFileURL(fil).href], { input: JSON.stringify({ loften, partier }), encoding: "utf8",
      cwd: dir, env: {}, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }));
    const tal = [svar.utgifter, svar.besparingar, svar.finansiering, svar.gap,
      ...svar.partier.flatMap((p: Publiceringssummor["partier"][number]) => [p.netto, p.finansiering, p.gap])];
    if (!tal.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("Summeringen gav ogiltiga belopp");
    return { revision, berakningshash: createHash("sha256").update(kod).digest("hex"), ...svar };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
