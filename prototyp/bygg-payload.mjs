// Bygger prototypens datapaket ur handlingsvagen/data — kompakt men förlustfritt
// för det prototypen visar. Körs från repo-roten.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const rot = "/home/user/handlingsvagen";
const scratch = "/tmp/claude-0/-home-user/c411f895-70a3-5d53-9bed-57f1b7b91271/scratchpad";

const handlingar = JSON.parse(readFileSync(`${rot}/data/handlingar.json`, "utf8"));
const personer = JSON.parse(readFileSync(`${rot}/data/personer.json`, "utf8"));
const betankanden = JSON.parse(readFileSync(`${rot}/data/betankanden.json`, "utf8"));
const forslag = JSON.parse(readFileSync(`${rot}/data/kopplingsforslag.json`, "utf8"));
const promises = JSON.parse(readFileSync(`${scratch}/promises.json`, "utf8"));

const KINDS = ["motion", "proposition", "interpellation", "skriftlig_fraga", "votering"];
const personIdx = new Map(personer.map((p, i) => [p.intressent_id, i]));

// Handlingar: [id, kindIdx, datum, titel, partier, dok_id, votering_id|0, punkt|0, personIdxCsv]
const H = handlingar.map((h) => [
  h.id,
  KINDS.indexOf(h.kind),
  h.datum,
  h.titel.trim(),
  h.parties.join(" "),
  h.dok_id,
  h.votering_id ?? 0,
  h.punkt ?? 0,
  h.persons
    .map((p) => (p.riksdagen_id ? personIdx.get(p.riksdagen_id) : undefined))
    .filter((i) => i !== undefined)
    .join(","),
]);

// Löften: [id, titel, partier, kategori]
const L = promises
  .filter((p) => (p.status ?? "aktiv") === "aktiv")
  .map((p) => [p.id, p.title, (p.parties ?? []).join(" "), p.category ?? "", p.quote ?? ""]);

// Betänkanden: nyckel "202223:AU10" → titel
const B = {};
for (const b of betankanden) B[`${b.rm.replace("/", "")}:${b.beteckning}`] = b.titel;

// Personer: [id, namn, parti, valkrets]
const P = personer.map((p) => [p.intressent_id, p.namn, p.parti, p.valkrets]);

// Roster per riksmöte: personlistan som index i P; röststräng per votering.
const R = [];
for (const fil of readdirSync(`${rot}/data/roster`).sort()) {
  const rm = JSON.parse(readFileSync(`${rot}/data/roster/${fil}`, "utf8"));
  R.push({
    rm: rm.rm,
    p: rm.personer.map((id) => personIdx.get(id)),
    v: rm.voteringar.map((v) => [v.votering_id, v.roster, v.avvikande_parti ?? 0]),
  });
}

const payload = {
  byggd: "2026-07-20",
  kinds: KINDS,
  handlingar: H,
  loften: L,
  betankanden: B,
  personer: P,
  roster: R,
  forslag,
};
const json = JSON.stringify(payload);
writeFileSync(`${scratch}/payload.json`, json);
console.log("payload:", (json.length / 1e6).toFixed(2), "MB;",
  "handlingar", H.length, "| löften", L.length, "| personer", P.length,
  "| voteringar i roster", R.reduce((s, r) => s + r.v.length, 0));
