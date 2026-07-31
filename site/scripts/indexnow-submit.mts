/**
 * indexnow-submit.mts — pingar IndexNow (Bing → Copilot/ChatGPT-sök, Yandex m.fl.)
 * med de sidor som FAKTISKT ändrats vid senaste datakörningen, så nya/ändrade
 * löften kommer in i AI-agenternas index snabbt utan att vänta på nästa crawl.
 *
 *   node --experimental-strip-types scripts/indexnow-submit.mts          # ändrade
 *   node --experimental-strip-types scripts/indexnow-submit.mts --all    # allt (backfill)
 *
 * IndexNow kräver ingen API-nyckel/secret: domänägarskap bevisas genom att
 * nyckelfilen (public/<KEY>.txt) ligger live. Icke-blockerande: skriptet får
 * aldrig fälla en deploy — fel loggas som varning.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HOST = "drygast.nu";
const BASE = `https://${HOST}`;
// Publik nyckel (ingen hemlighet — den ligger dessutom på /<KEY>.txt).
const KEY = "547b2beea892cfb44a32d83e1901c410";
const KEY_LOCATION = `${BASE}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const DATA = join(import.meta.dirname, "../../data");
const load = <T>(f: string): T => JSON.parse(readFileSync(join(DATA, f), "utf8")) as T;

interface Promise_ { id: string; slug: string; status: string }
interface Party { code: string }
interface Chronicle { slug: string }
interface ChangelogEntry { added: string[]; updated: string[]; retracted: string[] }

const promises = load<Promise_[]>("promises.json");
const parties = load<Party[]>("parties.json");
const chronicles = load<Chronicle[]>("chronicles.json");
const changelog = load<ChangelogEntry[]>("changelog.json");

const all = process.argv.includes("--all");
const slugById = new Map(promises.map((p) => [p.id, p.slug]));

const urls = new Set<string>();
// Aggregatsidor som ändras vid varje datauppdatering.
for (const p of ["/", "/topplistor", "/regeringar", "/jamfor"]) urls.add(`${BASE}${p}`);
for (const p of parties) urls.add(`${BASE}/parti/${p.code}`);
if (chronicles[0]) urls.add(`${BASE}/veckans-flask/${chronicles[0].slug}`);

if (all) {
  for (const p of promises) if (p.status === "aktiv") urls.add(`${BASE}/lofte/${p.id}/${p.slug}`);
} else {
  // Bara löften ur senaste changelog-posten (added/updated/retracted). Retract:
  // sidan är borta → submit ändå så sökmotorn recrawlar och avindexerar.
  const last = changelog[changelog.length - 1];
  if (last) {
    for (const id of [...last.added, ...last.updated, ...last.retracted]) {
      const slug = slugById.get(id);
      if (slug) urls.add(`${BASE}/lofte/${id}/${slug}`);
    }
  }
}

const urlList = [...urls];
console.log(`IndexNow: skickar ${urlList.length} URL:er (${all ? "backfill" : "ändrade"}) …`);

if (process.argv.includes("--dry-run")) {
  console.log(urlList.join("\n"));
  console.log("(--dry-run: inget skickat)");
  process.exit(0);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
});

// 200 = mottaget, 202 = accepterat/köat. Andra koder loggas men fäller inget.
if (res.ok || res.status === 202) {
  console.log(`IndexNow OK (HTTP ${res.status}).`);
} else {
  console.warn(`::warning::IndexNow svarade HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
