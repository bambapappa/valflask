import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { bindPubliceringsartefakt } from "../src/publiceringsartefakt.ts";
import { lasPubliceringsbas } from "../src/publiceringsbas.ts";
import { bindPubliceringsbas } from "../src/publiceringspaket.ts";
import { arPubliceringsomgang } from "../src/publiceringsomgang.ts";
import { publiceringsvy } from "../src/publiceringsvy.ts";
import { packaPubliceringspaket } from "../src/publiceringslagring.ts";

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
  const omgang = arPubliceringsomgang(process.env.GITHUB_EVENT_NAME ?? "", process.env.GITHUB_REF ?? "", process.env.PUBLICERA ?? "");
  const publicera = omgang && paket.filer.sokvagar.length > 0;
  const beslutstext = publicera
    ? `Manifest: ${manifest.hash}\nFörbered och granska den separata privata sakprövningen innan publicering godkänns. Använd sedan den kombinerade godkännandetexten därifrån; den måste binda både detta manifest och sakprövningens hash.\n`
    : omgang ? "Inga filer har ändrats sedan föregående publicering. Inget godkännande begärs.\n"
      : "Detta är ett provunderlag. Denna körning får inte publicera och inget godkännande begärs.\n";
  const besked = `Granska underlaget i artefakten publiceringsunderlag-${korning}-${forsok}.\n\n` +
    `Läs både poständringarna och filjämförelsen i granska.html. Hela filjämförelsen finns även i andringar.patch.\n\n` +
    beslutstext;
  const filer = {
    "paket.json": JSON.stringify(packaPubliceringspaket(paket)),
    "granska.html": vy,
    "andringar.patch": paket.filer.patch,
    "manifest.json": JSON.stringify(manifest, null, 2),
    "LAS-MIG.txt": besked,
  };
  if (Object.values(filer).reduce((n, text) => n + Buffer.byteLength(text), 0) > 64 * 1024 * 1024) {
    throw new Error("Publiceringsunderlaget överskrider storleksgränsen");
  }
  mkdirSync(ut, { recursive: true });
  for (const [namn, text] of Object.entries(filer)) writeFileSync(join(ut, namn), text);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `publicera=${publicera}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, besked);
} catch (error) {
  console.error(error instanceof Error && !("status" in error) ? error.message : "Publiceringsunderlaget kunde inte skapas");
  process.exitCode = 1;
}
