import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { bindPubliceringsartefakt } from "../src/publiceringsartefakt.ts";
import { lasPubliceringsbas } from "../src/publiceringsbas.ts";
import { bindPubliceringsbas } from "../src/publiceringspaket.ts";
import { publiceringsvy } from "../src/publiceringsvy.ts";

try {
  const [fil, artefaktId, ut, ...extra] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  const revision = process.env.GITHUB_SHA ?? "";
  const korning = process.env.GITHUB_RUN_ID ?? "";
  const forsok = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (!fil || !ut || !artefaktId || extra.length || !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
      !/^[a-f0-9]{40}$/.test(revision)) throw new Error("Ofullständigt byggunderlag");
  const bas = lasPubliceringsbas(repo);
  const fore = bas.revision;
  execFileSync("git", ["fetch", "origin", fore], { stdio: "pipe" });
  const paket = bindPubliceringsbas(JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types",
    "pipeline/scripts/publiceringspaket.mts", ".", fore, revision], {
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  })), bas);
  if (!paket.filer) throw new Error("Fullständig filjämförelse saknas");
  if (!paket.summor) throw new Error("Summor före och efter saknas");
  const vy = publiceringsvy(paket);
  const manifest = await bindPubliceringsartefakt(fil, { repo, revision, korning, forsok, artefaktId, pakethash: paket.hash });
  mkdirSync(ut, { recursive: true });
  writeFileSync(join(ut, "paket.json"), JSON.stringify(paket, null, 2));
  writeFileSync(join(ut, "granska.html"), vy);
  writeFileSync(join(ut, "andringar.patch"), paket.filer.patch);
  writeFileSync(join(ut, "manifest.json"), JSON.stringify(manifest, null, 2));
  const besked = `Granska underlaget i artefakten publiceringsunderlag-${korning}-${forsok}.\n\n` +
    `Läs både poständringarna och filjämförelsen i granska.html. Hela filjämförelsen finns även i andringar.patch.\n\n` +
    `Godkänn endast efter granskning. Klistra då in följande i GitHubs godkännandekommentar:\n\n` +
    `Godkänn publiceringspaket ${manifest.hash}\n`;
  writeFileSync(join(ut, "LAS-MIG.txt"), besked);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, besked);
} catch (error) {
  console.error(error instanceof Error && !("status" in error) ? error.message : "Publiceringsunderlaget kunde inte skapas");
  process.exitCode = 1;
}
