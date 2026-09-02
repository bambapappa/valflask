/**
 * Tar bort sidfoten ur en PR-beskrivning (pr-sidfot.yml).
 *
 * Regeln bor i `src/prtexten.ts` och prövas med vanlig text; det här är
 * läsaren som hämtar beskrivningen, tillämpar regeln och skriver tillbaka den
 * när något ändrats. Rör beskrivningen inget behövs ingen skrivning alls —
 * en tom uppdatering hade skapat en till `edited`-händelse och kört
 * arbetsflödet i cirkel.
 *
 *   PR=7056 GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node … pr-sidfot.mts
 */
import { utanSidfot } from "../src/prtexten.ts";

const token = process.env["GITHUB_TOKEN"];
const repo = process.env["GITHUB_REPOSITORY"];
const nummer = process.env["PR"];
if (!token || !repo || !nummer) {
  console.error("Kräver GITHUB_TOKEN, GITHUB_REPOSITORY och PR.");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "utlovat-pr-sidfot",
  "Content-Type": "application/json",
};
const URL = `https://api.github.com/repos/${repo}/pulls/${nummer}`;

const svar = await fetch(URL, { headers: HEADERS });
if (!svar.ok) {
  console.error(`Kunde inte hämta PR #${nummer}: ${svar.status}`);
  process.exit(1);
}
const { body } = (await svar.json()) as { body: string | null };

const { text, stadad } = utanSidfot(body ?? "");
if (!stadad) {
  console.log(`PR #${nummer}: ingen sidfot i beskrivningen.`);
  process.exit(0);
}

const skriv = await fetch(URL, { method: "PATCH", headers: HEADERS, body: JSON.stringify({ body: text }) });
if (!skriv.ok) {
  console.error(`Kunde inte skriva tillbaka beskrivningen: ${skriv.status} ${await skriv.text()}`);
  process.exit(1);
}
console.log(`PR #${nummer}: sidfoten borttagen.`);
