import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ankarpasspakethash, forberedAnkarpasspaket, kontrolleraAnkarpasspaket, verkstallAnkarpasspaket, type Ankarpassindata } from "../src/ankarpasspaket.ts";
import { lasAnkarskuldslage } from "../src/ankarskuldtransaktion.ts";
import { SAKMOMENT, type Sakmoment } from "../src/sakmoment.ts";

const lan = "Beloppet ligger i linje med jämförbara löften om samma område.";
function lofte(id: string, base: number, extra: Record<string, unknown> = {}) {
  return { id, title: id, status: "aktiv", group_id: null, parties: ["M"], history: [],
    cost: { msek_low: base, msek_base: base, msek_high: base, period: "per_ar", type: "utgift", calculation: lan }, ...extra };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ankarpasspaket-"));
  const dataDir = join(root, "data");
  mkdirSync(dataDir);
  mkdirSync(join(root, "pipeline/facit"), { recursive: true });
  const loften = [
    lofte("a", 15),
    lofte("b", 15, { cost: { msek_low: 15, msek_base: 15, msek_high: 15, period: "per_ar", type: "utgift", calculation: "Egen kostnad per mottagare." } }),
    lofte("c", 10),
    lofte("d", 10, { group_id: "g-samma", cost: { msek_low: 10, msek_base: 10, msek_high: 10, period: "per_ar", type: "utgift", calculation: "Egen kostnad per mottagare." } }),
    lofte("e", 5),
  ];
  writeFileSync(join(dataDir, "promises.json"), JSON.stringify(loften) + "\n");
  writeFileSync(join(dataDir, "changelog.json"), "[]\n");
  writeFileSync(join(dataDir, "rattelser.json"), "[]\n");
  writeFileSync(join(dataDir, "parties.json"), "[{\"code\":\"M\"}]\n");
  writeFileSync(join(root, "pipeline/facit/ankarskulden.json"), JSON.stringify({ count: 3, ids: ["a", "c", "e"] }) + "\n");
  const indata: Ankarpassindata = {
    rader: [
      { id: "a", utfall: "ankare", varde: "b", skal: "Källan och uträkningen visar att b är riktmärket." },
      { id: "c", utfall: "grupp", varde: "g-samma", skal: "c och d avser samma reform och ska räknas en gång." },
      { id: "e", utfall: "egen", varde: "5 000 mottagare gånger 1 000 kronor ger 5 msek per år.", skal: "Uträkningen kan göras från egna mottagare och kostnader." },
    ],
    material: Object.fromEntries(["a", "c", "e"].map((id) => [id, [
      { id: `${id}-kalla`, slag: "kalla" as const, adress: "https://example.org/kalla", innehall: "Syntetisk källa för prov" },
      { id: `${id}-regel`, slag: "regel" as const, adress: "metod/ankare", innehall: "Syntetisk regel för prov" },
    ]])),
    varfor: "Ankargrunden måste kunna följas på varje publicerad löftessida.",
    orsak: "annat",
  };
  return { root, dataDir, indata };
}

test("tre ankarutfall bildar ett fryst fyrfilspaket men oavgjort sakprov stoppar skrivning", () => {
  const f = fixture();
  try {
    const fore = lasAnkarskuldslage(f.dataDir);
    const p = forberedAnkarpasspaket(f.indata, fore, new Date("2026-09-24T12:00:00Z"));
    assert.equal(p.provningar.length, 3);
    assert.throws(() => kontrolleraAnkarpasspaket(p, fore), /Sakprövningen är inte klar/u);
    assert.throws(() => verkstallAnkarpasspaket(f.dataDir, p, ankarpasspakethash(p)), /Sakprövningen är inte klar/u);
    assert.deepEqual(lasAnkarskuldslage(f.dataDir), fore);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("exakt prövat paket skriver fyra filer och behåller partibindningen", () => {
  const f = fixture();
  try {
    const fore = lasAnkarskuldslage(f.dataDir);
    const p = forberedAnkarpasspaket(f.indata, fore, new Date("2026-09-24T12:00:00Z"));
    for (const provning of p.provningar) {
      provning.bedomare = "syntetiskt-prov";
      provning.bedomningar = (Object.keys(SAKMOMENT) as Sakmoment[]).map((moment) => ({
        moment, utfall: "styrkt", motivering: "Syntetiskt sakmoment med spårbart material.",
        belagg: provning.referenser.map((r) => r.id),
      }));
    }
    kontrolleraAnkarpasspaket(p, fore);
    assert.throws(() => verkstallAnkarpasspaket(f.dataDir, p, "0".repeat(64)), /Beslutet gäller inte/u);
    writeFileSync(join(f.dataDir, "parties.json"), "[{\"code\":\"M\",\"changed\":true}]\n");
    assert.throws(() => verkstallAnkarpasspaket(f.dataDir, p, ankarpasspakethash(p)), /föreläge/u);
    writeFileSync(join(f.dataDir, "parties.json"), fore.partier);
    verkstallAnkarpasspaket(f.dataDir, p, ankarpasspakethash(p));
    const nya = JSON.parse(readFileSync(join(f.dataDir, "promises.json"), "utf8")) as Array<{ id: string; group_id: string | null; cost: { anchor_ids?: string[]; calculation: string; msek_base: number }; history: unknown[] }>;
    assert.deepEqual(nya.find((l) => l.id === "a")?.cost.anchor_ids, ["b"]);
    assert.equal(nya.find((l) => l.id === "c")?.group_id, "g-samma");
    assert.match(nya.find((l) => l.id === "e")!.cost.calculation, /mottagare/u);
    assert.equal(nya.find((l) => l.id === "a")?.cost.msek_base, 15);
    assert.equal(nya.find((l) => l.id === "a")?.history.length, 1);
    const efter = lasAnkarskuldslage(f.dataDir);
    assert.deepEqual(JSON.parse(efter.facit).ids, []);
    assert.equal(JSON.parse(efter.data["rattelser.json"]!).length, 1);
    assert.equal(JSON.parse(efter.data["changelog.json"]!).length, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("osynkat facit får inte rättas tyst av ett annat ankarbeslut", () => {
  const f = fixture();
  try {
    const path = join(f.root, "pipeline/facit/ankarskulden.json");
    writeFileSync(path, JSON.stringify({ count: 4, ids: ["a", "c", "e", "b"] }) + "\n");
    assert.throws(() => forberedAnkarpasspaket(f.indata, lasAnkarskuldslage(f.dataDir), new Date("2026-09-24T12:00:00Z")), /redan rättad post/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
