import assert from "node:assert/strict";
import {runInNewContext} from "node:vm";
import {mkdtempSync, mkdirSync, cpSync, symlinkSync, readdirSync, readFileSync, writeFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve, join} from "node:path";
import {execFileSync} from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
const temp = mkdtempSync(join(tmpdir(), "utlovat-okand-render-"));
try {
  const site = join(temp, "site"); mkdirSync(site); mkdirSync(join(temp, "data"));
  for (const name of ["src", "package.json", "astro.config.mjs", "tsconfig.json"]) cpSync(join(root, "site", name), join(site, name), {recursive: true});
  for (const name of ["node_modules", "public"]) symlinkSync(join(root, "site", name), join(site, name));
  for (const name of ["pipeline", "handlingsvagen"]) symlinkSync(join(root, name), join(temp, name));
  for (const name of readdirSync(join(root, "data"))) if (name !== "promises.json") symlinkSync(join(root, "data", name), join(temp, "data", name));
  const all = JSON.parse(readFileSync(join(root, "data/promises.json"), "utf8"));
  const unknown = structuredClone(all.find((p: any) => p.id === "p-2026-2944")); assert.ok(unknown);
  unknown.cost.msek_low = unknown.cost.msek_base = unknown.cost.msek_high = 0;
  unknown.cost.harledning = {version: "harledning/1", led: [], arsprofil: {status: "okand", skal: "Test"}, belopp_okant: {skal: "Syntetiskt saknat underlag"}};
  const known = all.find((p: any) => p.status !== "tillbakadragen" && p.parties.includes("s") && !p.parties.includes("c") && !p.group_id);
  assert.ok(known);
  unknown.group_id = known.group_id = "syntetisk-okand-grupp";
  writeFileSync(join(temp, "data/promises.json"), JSON.stringify([unknown, known]));
  execFileSync(join(root, "site/node_modules/.bin/astro"), ["build"], {cwd: site, stdio: "pipe", timeout: 120000, maxBuffer: 16*1024*1024});
  const html = (path: string) => readFileSync(join(site, "dist", path, "index.html"), "utf8");
  const json = (path: string) => JSON.parse(readFileSync(join(site, "dist", path), "utf8"));
  async function coalitionHtml(parties: string[]): Promise<string> {
    const result = {innerHTML: ""};
    const boxes = parties.map(value => ({value, checked: false, addEventListener() {}}));
    let start: () => Promise<void>;
    runInNewContext(readFileSync(join(root, "site/public/kombinator.js"), "utf8"), {
      document: {
        getElementById: (id: string) => id === "kombinator-resultat" ? result : {querySelectorAll: () => boxes},
        addEventListener: (_event: string, callback: () => Promise<void>) => { start = callback; },
      },
      window: {location: {search: `?parties=${parties.join(",")}`}}, URLSearchParams,
      fetch: async (path: string) => ({json: async () => json(path.slice(1))}),
    });
    await start!();
    return result.innerHTML;
  }
  const unknownCoalition = await coalitionHtml(["c"]);
  const footer = unknownCoalition.split("<tfoot>")[1];
  assert.ok(footer);
  assert.match(footer, /Fläsket[\s\S]*?Kan inte fastställas/);
  assert.match(footer, /Besparingar[\s\S]*?Kan inte fastställas/);
  assert.match(footer, /Finansieringsgap[\s\S]*?Kan inte fastställas/);
  const knownCoalition = await coalitionHtml(["s"]);
  assert.ok(!knownCoalition.includes("Kan inte fastställas"));
  assert.ok(!knownCoalition.includes("Summorna är ofullständiga"));
  const mixedHome = html("");
  const mixedHomeView = mixedHome.slice(mixedHome.indexOf("alla:alla:alla:alla")).split('<section class="sektion"')[0];
  assert.ok(mixedHomeView.includes("summan är ofullständig"));
  assert.ok(!mixedHomeView.includes('class="gapmatare"'), "Ofullständig totalsumma får ingen finansieringsmätare");
  const summary = json("api/v1/summary.json").data;
  assert.equal(summary.parties.find((p: any) => p.code === "c").per_vote, null);
  assert.equal(typeof summary.parties.find((p: any) => p.code === "s").per_vote, "number");
  assert.ok(html("parti/c").includes("Kan inte fastställas"));
  assert.ok(!html("parti/s").includes("Summorna är ofullständiga"));
  assert.ok(html("topplistor").includes("Partier med okända belopp i urvalet är inte med i denna jämförelse."));
  const topHtml = html("topplistor");
  const allIndex = topHtml.indexOf("alla:alla:alla:alla");
  assert.ok(allIndex >= 0, "Alla-löften-vyn måste finnas");
  const allView = topHtml.slice(allIndex);
  const ranking = allView.match(/<h2\b[^>]*>Partier, totalt<\/h2>[\s\S]*?<\/section>/)?.[0];
  assert.ok(ranking, "Partirangordningens byggda sektion måste finnas");
  assert.ok(!ranking.includes('/parti/c'));
  assert.ok(ranking.includes('/parti/s'));
  const largest = allView.match(/<h2\b[^>]*>Största löftena<\/h2>[\s\S]*?<\/section>/)?.[0];
  assert.ok(largest, "Löftesrangordningens byggda sektion måste finnas");
  assert.ok(!largest.includes(`/lofte/${known.id}/`));
  assert.ok(!largest.includes(`/lofte/${unknown.id}/`));
  const faq = json("api/v1/faq/kostnad-c.json");
  assert.equal(faq.data.total_msek, null);
  assert.ok(html("faq/kostnad-c").includes("Ingen sammanlagd kostnad kan fastställas"));
  const post = json("api/v1/promises.json").data.find((p: any) => p.id === unknown.id);
  assert.equal(post.cost.msek_base, null);
  assert.ok(html(`lofte/${unknown.id}/${unknown.slug}`).includes("Syntetiskt saknat underlag"));
  writeFileSync(join(temp, "data/promises.json"), JSON.stringify([unknown]));
  execFileSync(join(root, "site/node_modules/.bin/astro"), ["build"], {cwd: site, stdio: "pipe", timeout: 120000, maxBuffer: 16*1024*1024});
  const allUnknown = json("api/v1/summary.json").data;
  assert.equal(allUnknown.total_msek_flasket, null);
  assert.equal(allUnknown.total_msek_besparingar, null);
  assert.equal(allUnknown.financing_gap_msek, null);
  const home = html("");
  const homeIndex = home.indexOf("alla:alla:alla:alla");
  assert.ok(homeIndex >= 0);
  assert.match(home.slice(homeIndex), /href="\/parti\/c"[\s\S]*?<td[^>]*>Kan inte fastställas<\/td>/);
  assert.match(html("parti/c"), new RegExp(`${unknown.category}[\\s\\S]*?<td[^>]*>Kan inte fastställas</td>`));
  const unknownHomeView = home.slice(homeIndex).split('<section class="sektion"')[0];
  assert.ok(unknownHomeView.includes("summan är ofullständig"));
  assert.ok(!unknownHomeView.includes('class="gapmatare"'));
  const unknownPartyView = html("parti/c").split('class="gapmatare"');
  assert.equal(unknownPartyView.length, 1, "Helt okänt parti får ingen mätare eller ryms-stämpel");
  const unknownPanel = home.slice(homeIndex).match(/<div\b[^>]*class="[^"]*num-stor[^"]*"[^>]*>Kan inte fastställas<\/div>/)?.[0];
  assert.ok(unknownPanel, "Helt okänd startsumma får ingen nollprislapp");
  assert.ok(!unknownPanel.includes("data-taxameter"));
  assert.ok(html("parti/c").match(/class="[^"]*num-stor[^"]*"[^>]*>Kan inte fastställas/));
  const allUnknownTop = html("topplistor");
  const allUnknownView = allUnknownTop.slice(allUnknownTop.indexOf("alla:alla:alla:alla"));
  const categorySection = allUnknownView.match(/<h2\b[^>]*>Kategorier<\/h2>[\s\S]*?<\/section>/)?.[0];
  assert.ok(categorySection, "Byggd kategoritabell måste finnas");
  assert.match(categorySection, new RegExp(`${unknown.category}[\\s\\S]*?<td[^>]*>Kan inte fastställas</td>`));
  assert.match(categorySection, /<td\b[^>]*class="radnr"[^>]*>—<\/td>/, "Okänd kategorisumma får ingen beloppsrang");

  assert.ok((html("regeringar").match(/Kan inte fastställas/g) ?? []).length >= 3);
  const text = readFileSync(join(site, "dist/llms-full.txt"), "utf8");
  assert.ok(text.includes("Totalt fläsket (utgifter + intäktsminskningar): Kan inte fastställas"));
  assert.ok(text.includes("Finansieringsgap: Kan inte fastställas"));
  assert.ok(text.includes("Kostnad: Kan inte fastställas"));
  console.log("Byggda sidor/API: okänd kostnad, per-röst och FAQ verifierade; känt parti opåverkat.");
} finally {rmSync(temp, {recursive: true, force: true});}
