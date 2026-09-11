/** Kontrollera en nedladdad Pages-artefakt mot aktuellt GitHub-beslut. */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { kontrolleraPubliceringsartefakt, type Publiceringsartefakt } from "../src/publiceringsartefakt.ts";
import { lasPubliceringsbas } from "../src/publiceringsbas.ts";
import { kontrolleraPubliceringspaket } from "../src/publiceringspaket.ts";
import { kontrolleraPubliceringsbeslut } from "../src/publiceringsbeslut.ts";

try {
  const [fil, manifestfil, paketfil, ...extra] = process.argv.slice(2);
  if (!fil || !manifestfil || !paketfil || extra.length) throw new Error("Ange artefaktfil, manifestfil och paketfil");
  const manifest: Publiceringsartefakt = JSON.parse(readFileSync(manifestfil, "utf8"));
  const paket = JSON.parse(readFileSync(paketfil, "utf8"));
  kontrolleraPubliceringspaket(paket);
  const repo = process.env.GITHUB_REPOSITORY;
  const korning = process.env.GITHUB_RUN_ID;
  const revision = process.env.GITHUB_SHA;
  const forsok = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (!repo || !korning || !revision || process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Kontrollen kräver huvudgrenens GitHub-körning");
  }
  // Miljöidentiteter valideras innan de får bilda API-sökvägar.
  await kontrolleraPubliceringsartefakt(fil, manifest, {
    repo, korning, revision, forsok, artefaktId: manifest.artefaktId, pakethash: manifest.pakethash,
  });
  if (paket.hash !== manifest.pakethash || paket.efterRevision !== revision || !paket.filer || !paket.summor ||
      !paket.driftbas || paket.driftbas.revision !== paket.foreRevision) throw new Error("Granskningspaketet motsvarar inte publiceringsmanifestet");
  const api = (path: string) => JSON.parse(execFileSync("gh", ["api", path], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 30_000,
    stdio: ["ignore", "pipe", "pipe"],
  }));
  const run = api(`repos/${repo}/actions/runs/${korning}`);
  if (String(run.id) !== korning || run.head_sha !== revision || run.run_attempt !== forsok ||
      run.repository?.full_name !== repo || run.head_branch !== "main") {
    throw new Error("GitHub-körningen motsvarar inte publiceringsmanifestet");
  }
  const artefakt = api(`repos/${repo}/actions/artifacts/${manifest.artefaktId}`);
  const namn = `github-pages-${korning}-${forsok}`;
  if (String(artefakt.id) !== manifest.artefaktId || artefakt.name !== namn ||
      artefakt.expired !== false || String(artefakt.workflow_run?.id) !== korning ||
      artefakt.workflow_run?.head_sha !== revision) {
    throw new Error("GitHub-artefakten motsvarar inte publiceringsmanifestet");
  }
  const miljo = api(`repos/${repo}/environments/github-pages`);
  const historik = api(`repos/${repo}/actions/runs/${korning}/approvals`);
  const granskare = kontrolleraPubliceringsbeslut(miljo, historik, manifest.hash);
  const bas = lasPubliceringsbas(repo);
  if (bas.revision !== paket.foreRevision) throw new Error("Sajten har fått en annan version sedan underlaget skapades; nytt granskningspaket krävs");
  console.log(`Publiceringspaket ${manifest.hash} godkänt av ${granskare}. Artefakt: ${namn}.`);
} catch (error) {
  // HTTP-fel kan innehålla intern tjänstedata. Publicera inte råa svar eller token.
  console.error(error instanceof Error && !("status" in error) ? error.message : "GitHub-kontrollen kunde inte genomföras");
  process.exitCode = 1;
}
