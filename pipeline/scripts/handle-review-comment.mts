/**
 * Exekverar ett granskningsbeslut från en issue-kommentar (review.yml).
 * Läser ISSUE_TITLE + COMMENT_BODY ur miljön (aldrig via shell-interpolering —
 * kommentartext är data, inte kod), slår upp kö-posten via review-id i titeln
 * och kör samma approve/reject som CLI:t. Skriver resultatet till
 * GITHUB_OUTPUT (result, message) så workflown kan kommentera och stänga.
 *
 *   result: approved | rejected | error
 */
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";
import { bindGithubGodkannande, godkannandepakethash, verkstallGodkannandepaket, type Godkannandepaket } from "../src/godkannandepaket.ts";
import {
  parseReviewCommand,
  findIndexByReviewId,
  type ReviewCandidate,
} from "../src/review.ts";
import { lasFillage } from "../src/datatransaktion.ts";
import { AVVISNINGSFILER, avvisningsforslagshash, avvisningspakethash, forberedAvvisningspaket, verkstallAvvisningspaket } from "../src/avvisningspaket.ts";

const DATA_DIR = join(import.meta.dirname, "../../data");

function output(result: "approved" | "rejected" | "error", message: string): void {
  const out = process.env.GITHUB_OUTPUT;
  const safe = message.replace(/\r?\n/gu, " ").slice(0, 900);
  if (out) {
    appendFileSync(out, `result=${result}\nmessage=${safe}\n`);
  }
  console.log(`[${result}] ${safe}`);
  // Fel = grönt jobb med förklarande kommentar (ägaren rättar kommandot och
  // försöker igen) — röda körningar reserveras för infrastrukturfel.
}

const title = process.env.ISSUE_TITLE ?? "";
const body = process.env.COMMENT_BODY ?? "";
const decisionActor = process.env.DECISION_ACTOR ?? "";
const decisionAssociation = process.env.DECISION_ASSOCIATION ?? "";
const decisionRef = process.env.DECISION_REF ?? "";

if (decisionAssociation !== "OWNER" || !decisionActor || !/^https:\/\/github\.com\//u.test(decisionRef)) {
  output("error", "Beslutets verifierade GitHub-identitet eller händelsereferens saknas. Ingen ändring gjord.");
  process.exit(0);
}

const idMatch = title.match(/^\[review ([0-9a-f]{12})\]/u);
if (!idMatch) {
  output("error", "Issue-titeln saknar review-id — är detta verkligen ett review-issue?");
  process.exit(0);
}
const id = idMatch[1]!;

const cmd = parseReviewCommand(body);
if (!cmd) {
  output(
    "error",
    "Oklart kommando. Ett avslag anges med `/avvisa <skäl>`. Ett godkännande kräver ett " +
      "redan förberett beslutspaket med fullständig sakprövning och separat prövningshash.",
  );
  process.exit(0);
}

const items = JSON.parse(
  readFileSync(join(DATA_DIR, "needs_review.json"), "utf8"),
) as ReviewCandidate[];
const index = findIndexByReviewId(items, id);
if (index < 0) {
  output("error", `Posten (review-id ${id}) finns inte längre i kön — troligen redan hanterad. Ingen ändring gjord.`);
  process.exit(0);
}
const entry = items[index]!;

if (cmd.action === "approve-package") {
  try {
    const fil = process.env.GODKANNANDEPAKET_FIL;
    if (!fil) throw new Error("Privat paketfil saknas");
    const inomRepo = relative(realpathSync(resolve(DATA_DIR, "..")), realpathSync(fil));
    if (!inomRepo.startsWith(".." + "/") && !isAbsolute(inomRepo)) {
      throw new Error("Paketfilen måste ligga privat utanför kodrepot");
    }
    const paket = bindGithubGodkannande(JSON.parse(readFileSync(fil, "utf8")) as Godkannandepaket, {
      repository: process.env.GITHUB_REPOSITORY ?? "",
      issue: Number(process.env.ISSUE_NUMBER), reviewId: id,
      actor: decisionActor, actorType: process.env.DECISION_ACTOR_TYPE ?? "",
      association: decisionAssociation, handelse: decisionRef, forslagshash: cmd.hash,
    });
    verkstallGodkannandepaket(DATA_DIR, paket, godkannandepakethash(paket));
    output("approved", "Det exakta beslutspaketet har verkställts. Publicering prövas separat.");
  } catch {
    // Privat sakunderlag och filinnehåll får inte hamna i det publika issuets svar.
    output("error", "Godkännandepaketet kunde inte verifieras. Kontrollera privat fil, hash, issue, beslutsaktör och oförändrat föreläge. Ingen publicering har gjorts.");
  }
  process.exit(0);
}

if (cmd.action === "reject") {
  const paket = forberedAvvisningspaket([{ id, skal: cmd.reason }], lasFillage(DATA_DIR, AVVISNINGSFILER), new Date());
  paket.beslut = {
    bedomare: decisionActor,
    utfall: "avvisa",
    motivering: cmd.reason,
    forslagshash: avvisningsforslagshash(paket),
    kalla: { system: "github", association: "OWNER", actor: decisionActor, handelse: decisionRef },
  };
  verkstallAvvisningspaket(DATA_DIR, paket, avvisningspakethash(paket));
  const t = entry.candidate?.title ?? entry.articleTitle ?? "(okänd)";
  output("rejected", `Avvisad: "${t}" — ${cmd.reason}`);
  process.exit(0);
}

output(
  "error",
  "Godkännandet verkställdes inte. Ett ja måste avse ett redan sparat löftesförslag, " +
    "en fullständig sakprövning och beslutets separata prövningshash. Använd det förberedda " +
    "beslutspaketet; issue-kommentaren ensam får inte skapa underlaget efter beslutet.",
);
process.exit(0);
