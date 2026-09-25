/** Hämtar endast data från en kontrollerad privat producent; ingen artefaktkod körs. */
import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { publiceringsprovningshash, kontrolleraPubliceringsprovning, type Publiceringsprovning } from "../src/publiceringsprovning.ts";
import { privatPubliceringsnamn, valjPrivatPubliceringsprovning, kontrolleraPrivatKorning, kontrolleraPrivatZip, type PrivatArtefakt, type PrivatKorning } from "../src/privatpaket.ts";

let dir: string | undefined;
try {
  const repo = process.env.GRANSKNINGSREPO ?? "";
  const root = process.env.RUNNER_TEMP;
  const out = process.env.GITHUB_OUTPUT;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repo) || !root || !out) throw new Error("Saknad privat konfiguration");
  const manifest = JSON.parse(readFileSync(process.env.PUBLICERINGSMANIFEST_FIL ?? "", "utf8"));
  const paket = JSON.parse(readFileSync(process.env.PUBLICERINGSPAKET_FIL ?? "", "utf8"));
  const name = privatPubliceringsnamn(manifest.hash);
  const api = (path: string, extra: string[] = []) => execFileSync("gh", ["api", path, ...extra], { maxBuffer: 34 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const pages = JSON.parse(api(`repos/${repo}/actions/artifacts?name=${name}&per_page=100`, ["--paginate", "--slurp"]).toString()) as Array<{ artifacts: PrivatArtefakt[] }>;
  const a = valjPrivatPubliceringsprovning(pages.flatMap(p => p.artifacts), manifest.hash);
  const run = JSON.parse(api(`repos/${repo}/actions/runs/${a.workflow_run.id}`).toString()) as PrivatKorning;
  kontrolleraPrivatKorning(a, run, "publiceringsprovning");
  const zip = api(`repos/${repo}/actions/artifacts/${a.id}/zip`);
  kontrolleraPrivatZip(a, zip);
  dir = mkdtempSync(join(resolve(root), "privat-publiceringsprovning-"));
  const zipfil = join(dir, "paket.zip"), paketfil = join(dir, "paket.json");
  writeFileSync(zipfil, zip, { flag: "wx", mode: 0o600 });
  // Läs en enda namngiven fil. Extrahera aldrig sökvägar ur ZIP-arkivet.
  const bytes = execFileSync("python3", ["-c", "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nif z.namelist()!=['paket.json']: raise ValueError('Fel filuppsättning')\ni=z.getinfo('paket.json')\nif i.file_size>64*1024*1024: raise ValueError('För stort paket')\nsys.stdout.buffer.write(z.read(i))", zipfil], { maxBuffer: 65 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const provning = JSON.parse(bytes.toString()) as Publiceringsprovning;
  kontrolleraPubliceringsprovning(provning, paket, manifest.hash, publiceringsprovningshash(provning));
  writeFileSync(paketfil, bytes, { flag: "wx", mode: 0o600 });
  rmSync(zipfil);
  appendFileSync(out, `paketfil=${paketfil}\n`);
  console.log("Privat paket hämtat och kontrollsummor verifierade.");
} catch {
  if (dir) rmSync(dir, { recursive: true, force: true });
  // API-svar och paketets privata innehåll får inte hamna i en publik jobblogg.
  console.error("Privat publiceringsprövning kunde inte verifieras. Kontrollera producentkörning, läsbehörighet och paketets identitet.");
  process.exit(1);
}
