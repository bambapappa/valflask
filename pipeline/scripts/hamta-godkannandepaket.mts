/** Hämtar endast data från en kontrollerad privat producent; ingen artefaktkod körs. */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseReviewCommand } from "../src/review.ts";
import { godkannandeforslagshash, type Godkannandepaket } from "../src/godkannandepaket.ts";
import { privatPaketnamn, valjPrivatArtefakt, kontrolleraPrivatKorning, kontrolleraPrivatZip, type PrivatArtefakt, type PrivatKorning } from "../src/privatpaket.ts";

const cmd = parseReviewCommand(process.env.COMMENT_BODY ?? "");
if (cmd?.action !== "approve-package") process.exit(0);
let dir: string | undefined;
try {
  const repo = process.env.GRANSKNINGSREPO ?? "";
  const root = process.env.RUNNER_TEMP;
  const out = process.env.GITHUB_OUTPUT;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo) || !root || !out) throw new Error("Saknad privat konfiguration");
  const issue = Number(process.env.ISSUE_NUMBER);
  const name = privatPaketnamn(issue, cmd.hash);
  const api = (path: string, extra: string[] = []) => execFileSync("gh", ["api", path, ...extra], { maxBuffer: 34 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const pages = JSON.parse(api(`repos/${repo}/actions/artifacts?name=${name}&per_page=100`, ["--paginate", "--slurp"]).toString()) as Array<{ artifacts: PrivatArtefakt[] }>;
  const a = valjPrivatArtefakt(pages.flatMap(p => p.artifacts), issue, cmd.hash);
  const run = JSON.parse(api(`repos/${repo}/actions/runs/${a.workflow_run.id}`).toString()) as PrivatKorning;
  kontrolleraPrivatKorning(a, run);
  const zip = api(`repos/${repo}/actions/artifacts/${a.id}/zip`);
  kontrolleraPrivatZip(a, zip);
  dir = mkdtempSync(join(resolve(root), "privat-godkannande-"));
  const zipfil = join(dir, "paket.zip"), paketfil = join(dir, "paket.json");
  writeFileSync(zipfil, zip, { flag: "wx", mode: 0o600 });
  // Läs en enda namngiven fil. Extrahera aldrig sökvägar ur ZIP-arkivet.
  const bytes = execFileSync("python3", ["-c", "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.namelist()==['paket.json']; i=z.getinfo('paket.json'); assert i.file_size<=64*1024*1024; sys.stdout.buffer.write(z.read(i))", zipfil], { maxBuffer: 65 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const paket = JSON.parse(bytes.toString()) as Godkannandepaket;
  if (paket.version !== "godkannandepaket/1" || paket.beslut !== null || godkannandeforslagshash(paket) !== cmd.hash) throw new Error("Fel paket");
  writeFileSync(paketfil, bytes, { flag: "wx", mode: 0o600 });
  rmSync(zipfil);
  appendFileSync(out, `paketfil=${paketfil}\n`);
  console.log("Privat paket hämtat och kontrollsummor verifierade.");
} catch {
  if (dir) rmSync(dir, { recursive: true, force: true });
  // API-svar och paketets privata innehåll får inte hamna i en publik jobblogg.
  console.error("Privat godkännandepaket kunde inte verifieras. Kontrollera producentkörning, läsbehörighet och paketets identitet.");
  process.exit(1);
}
