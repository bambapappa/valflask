import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Beslutsunderlag } from "./review.ts";
import { kanoniskJson } from "./underlagsversion.ts";

export interface Listgodkannande {
  args: string[];
  underlag: Beslutsunderlag;
  provningshash: string;
}
const FILER = ["promises.json", "needs_review.json", "changelog.json", "provningar.json"] as const;

function lasLage(dataDir: string): Record<string, string | null> {
  return Object.fromEntries(FILER.map((fil) => {
    try { return [fil, readFileSync(join(dataDir, fil), "utf8")]; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && ["changelog.json", "provningar.json"].includes(fil)) return [fil, null];
      throw error;
    }
  }));
}
function hash(lage: Record<string, string | null>): string {
  return createHash("sha256").update(kanoniskJson(lage)).digest("hex");
}

/** Samma skrivväg körs sekventiellt i en engångskopia; originalfilerna ändras inte. */
export function forprovaGodkannandelista(rader: readonly Listgodkannande[], dataDir: string): string {
  if (!Array.isArray(rader) || rader.length === 0) throw new Error("Godkännandelistan är tom");
  const lage = lasLage(dataDir);
  const dir = mkdtempSync(join(tmpdir(), "godkannandelista-"));
  try {
    for (const [fil, text] of Object.entries(lage)) if (text !== null) writeFileSync(join(dir, fil), text);
    const program = `import {readFileSync} from 'node:fs'; import {approve} from ${JSON.stringify(new URL("./review.ts", import.meta.url).href)}; const r=JSON.parse(readFileSync(0,'utf8')); approve(r.args,process.argv[1],r.underlag,r.provningshash);`;
    for (let i = 0; i < rader.length; i++) {
      const rad = rader[i]!;
      if (!rad.underlag || !/^[0-9a-f]{64}$/u.test(rad.provningshash ?? "")) {
        throw new Error(`Rad ${i + 1} saknar beslutsunderlag eller separat prövningshash`);
      }
      const r = spawnSync(process.execPath, ["--import", "tsx/esm", "-e", program, dir], {
        input: JSON.stringify(rad), encoding: "utf8", maxBuffer: 1024 * 1024,
      });
      if (r.error || r.status !== 0) {
        throw new Error(`Förprövningen stoppades på rad ${i + 1}; inga originaldata skrivna. ${r.error?.message ?? r.stderr}`);
      }
    }
    return hash(lage);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export function kontrolleraListansForelage(dataDir: string, forvantadHash: string): void {
  if (hash(lasLage(dataDir)) !== forvantadHash) throw new Error("Listans föreläge ändrades efter förprövningen; kör hela förprövningen igen");
}
