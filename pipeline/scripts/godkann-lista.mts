/**
 * Verkställer en beslutad godkännandehög i löfteskön — en rad per post.
 *
 * VARFÖR DEN FINNS. Samma skäl som `avvisa-lista`: en genomgången kö avgörs i
 * ett svep, och 126 kommandon i rad är både långsamt och lätt att avbryta mitt
 * i. Skriptet kallar `approve()` en gång per rad, alltså exakt samma kodväg som
 * `pnpm review approve` — med kvalitetsfiltrets grind, ankarkravet, spärren mot
 * interna beteckningar och changelog-posten per godkännande.
 *
 * FILFORMAT: JSON-lista med rader
 *   { "id": "<review-id>", "low": 0, "base": 0, "high": 0,
 *     "typ": "utgift", "period": "per_ar", "basis": "granskare",
 *     "calc": "…", "note": "…", "group": "p-2026-1234" }
 * Utelämnas `low`/`base`/`high` godkänns posten med kö-postens egen kostnad.
 * `calc` krävs så snart ett belopp sätts — ett belopp utan uträkning publiceras
 * inte.
 *
 * Varje rad kräver underlagsfil och separat provningshash från beslutet.
 * TORRKÖRNING ÄR STANDARD: utan `--skriv` prövas att raderna går att läsa
 * och att varje beslut går att verkställa, i listans ordning, i en isolerad kopia.
 *
 *   pnpm godkann-lista -- <fil.json> [--skriv]
 */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { reviewId } from "../src/review.ts";
import { forberedGodkannandelista } from "../src/godkannandelista.ts";
import { skrivFilpaket } from "../src/datatransaktion.ts";
import type { Beslutsunderlag, ReviewCandidate } from "../src/review.ts";

const fil = process.argv[2];
const skriv = process.argv.includes("--skriv");
if (!fil) {
  console.error("Användning: pnpm godkann-lista -- <fil.json> [--skriv]");
  process.exit(1);
}

type Rad = {
  id: string; low?: number; base?: number; high?: number;
  typ?: string; period?: string; basis?: string; basis_url?: string; calc?: string; note?: string; group?: string;
  titel?: string;
  underlagsfil: string; provningshash: string;
};
const rader = JSON.parse(readFileSync(fil, "utf8")) as Rad[];

const konFil = join(import.meta.dirname, "../../data/needs_review.json");
const kon = JSON.parse(readFileSync(konFil, "utf8")) as ReviewCandidate[];
const finns = new Set(kon.map((e) => reviewId(e)));
const saknade = rader.filter((r) => !finns.has(r.id));
if (saknade.length > 0) {
  console.error(`${saknade.length} id finns inte i kön — ingenting godkänns:`);
  for (const r of saknade.slice(0, 10)) console.error(`  ${r.id} ${r.titel ?? ""}`);
  process.exit(1);
}
const utanCalc = rader.filter((r) => r.base !== undefined && !(r.calc ?? "").trim());
if (utanCalc.length > 0) {
  console.error(`${utanCalc.length} rad(er) sätter ett belopp utan uträkning — ingenting godkänns.`);
  process.exit(1);
}

const DATA_DIR = join(import.meta.dirname, "../../data");
const beslut = rader.map((r) => {
  if (!r.underlagsfil || !/^[0-9a-f]{64}$/u.test(r.provningshash ?? "")) {
    throw new Error(`Beslutet ${r.id} saknar underlagsfil eller separat prövningshash`);
  }
  const underlag = JSON.parse(readFileSync(resolve(dirname(fil), r.underlagsfil), "utf8")) as Beslutsunderlag;
  const args: string[] = [r.id];
  if (r.base !== undefined) args.push(String(r.low ?? r.base), String(r.base), String(r.high ?? r.base));
  if (r.calc) args.push("--calc", r.calc);
  if (r.typ) args.push("--typ", r.typ);
  if (r.period) args.push("--period", r.period);
  if (r.basis) args.push("--basis", r.basis);
  if (r.basis_url) args.push("--basis-url", r.basis_url);
  if (r.note) args.push("--note", r.note);
  if (r.group) args.push("--group", r.group);
  return { args, underlag, provningshash: r.provningshash };
});
const paket = forberedGodkannandelista(beslut, DATA_DIR);
console.log(`${rader.length} rader förprövade i isolerad kopia. ${skriv ? "SKRIVER." : "Inga sakdata skrivna — kör om med --skriv."}`);
if (!skriv) process.exit(0);
skrivFilpaket(DATA_DIR, paket);
console.log(`${rader.length} av ${rader.length} godkända.`);
