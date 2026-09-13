import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { lasFillage, skapaFilpaket, type Filpaket } from "./datatransaktion.ts";
import type { Beslut } from "./reviewbeslut.ts";

export const VERKSTALLFILER = ["promises.json", "needs_review.json", "provningar.json", "changelog.json", "rattelser.json", "avvisade.json"] as const;
/** Alla mutationer sker i kopian; originalet får endast det färdiga paketet. */
export function forberedReviewverkstall(rader: readonly Beslut[], dataDir: string): Filpaket {
  if (!Array.isArray(rader) || rader.length === 0) throw new Error("Beslutslistan är tom");
  const fore = lasFillage(dataDir, VERKSTALLFILER);
  for (const fil of ["promises.json", "needs_review.json", "provningar.json"]) if (fore[fil] === null) throw new Error(`Saknar ${fil}`);
  const dir = mkdtempSync(join(tmpdir(), "reviewverkstall-"));
  try {
    for (const [fil, text] of Object.entries(fore)) if (text !== null) writeFileSync(join(dir, fil), text);
    const program = `import {readFileSync} from 'node:fs'; import {verkstallReviewKopia} from ${JSON.stringify(new URL("./reviewverkstall.ts", import.meta.url).href)}; await verkstallReviewKopia(JSON.parse(readFileSync(0,'utf8')),process.argv[1]);`;
    const r = spawnSync(process.execPath, ["--import", "tsx/esm", "-e", program, dir], { input: JSON.stringify(rader), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    if (r.error || r.status !== 0) throw new Error(`Förprövningen avbröts; inga originaldata skrivna. ${r.error?.message ?? r.stderr}`);
    return skapaFilpaket(fore, lasFillage(dir, VERKSTALLFILER));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
