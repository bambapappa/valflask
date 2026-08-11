#!/usr/bin/env node
// ai-atkomst.mjs — kontrollerar att sajten och dess externa sökning kan nås.
//
// Bakgrund: 2026-08-01 nekades en Gemini-agent att läsa utlovat.se. Sajtens
// egen robots.txt välkomnade agenten, men Cloudflares "managed robots.txt"
// var påslagen på zonen och lade in ett eget block ÖVERST i den utlevererade
// filen som förbjöd Google-Extended, GPTBot, ClaudeBot med flera. Vårt block
// hamnade under och förlorade. Inget syntes i repot — bara i det som faktiskt
// levererades. Därför kontrolleras den LEVERERADE filen, inte källfilen.
//
// Körs: node ops/ai-atkomst.mjs [bas-url]
// Avslutar med 0 om allt är öppet, 1 om någon agent eller Riksdagens sökning
// stängs ute av en levererad driftinställning.

const BAS = (process.argv[2] ?? "https://utlovat.se").replace(/\/+$/, "");

// Agenterna sajten uttryckligen välkomnar (site/public/robots.txt). Varje post
// är ett robots.txt-namn plus den byrå den tillhör, så ett larm går att förstå
// utan att slå upp namnet.
const VALKOMNA = [
  ["GPTBot", "OpenAI, träning och indexering"],
  ["OAI-SearchBot", "OpenAI, ChatGPT-sökningar"],
  ["ClaudeBot", "Anthropic, Claude"],
  ["PerplexityBot", "Perplexity"],
  ["Google-Extended", "Google, Gemini-svar"],
  ["Applebot-Extended", "Apple"],
  ["CCBot", "Common Crawl"],
];

// Sidor en agent måste kunna nå för att sajten ska vara användbar som källa.
const SIDOR = [
  ["/", "förstasidan"],
  ["/llms.txt", "vägvisaren för AI-agenter"],
  ["/robots.txt", "robotsreglerna"],
  ["/sitemap.xml", "sajtkartan"],
  ["/api/v1/summary.json", "aktuella totaler"],
  ["/api/v1/promises.json", "löftena med citat och källa"],
];

/**
 * Delar robots.txt i grupper och returnerar reglerna för den grupp en robot
 * med namnet `namn` skulle följa.
 *
 * Väljer FÖRSTA matchande gruppen, precis som vår egen hämtare gör
 * (pipeline/src/fetch.ts). Robotar är oense om vad som gäller när samma namn
 * förekommer i flera grupper: några slår ihop dem och låter den minst
 * restriktiva regeln vinna, andra tar den första de ser. Vi antar det
 * pessimistiska — annars missar kontrollen precis det fall den finns för.
 */
function reglerFor(text, namn) {
  const grupper = [];
  let namnen = [];
  let regler = [];
  let sistVarNamn = false;

  const stang = () => {
    if (namnen.length > 0 && regler.length > 0) {
      for (const ua of namnen) grupper.push({ ua, regler });
    }
    namnen = [];
    regler = [];
  };

  for (const rad of text.split("\n")) {
    const trimmad = rad.replace(/#.*$/, "").trim();
    if (trimmad === "") continue;

    const lower = trimmad.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      // Flera User-agent-rader i följd delar samma regler.
      if (!sistVarNamn) stang();
      namnen.push(trimmad.slice("user-agent:".length).trim().toLowerCase());
      sistVarNamn = true;
      continue;
    }
    sistVarNamn = false;

    if (lower.startsWith("disallow:")) {
      regler.push({ vag: trimmad.slice("disallow:".length).trim(), tillat: false });
    } else if (lower.startsWith("allow:")) {
      const vag = trimmad.slice("allow:".length).trim();
      if (vag) regler.push({ vag, tillat: true });
    }
  }
  stang();

  const sokt = namn.toLowerCase();
  const grupp = grupper.find((g) => g.ua === sokt) ?? grupper.find((g) => g.ua === "*");
  return grupp?.regler ?? [];
}

/** Längsta matchande regeln vinner; oavgjort går till tillåtelse. */
function slapperIn(regler, vag = "/") {
  let bastaLangd = -1;
  let tillat = true;
  for (const regel of regler) {
    // Tom Disallow betyder "inget förbjudet" och är inte en träff.
    if (regel.vag === "") continue;
    if (vag.startsWith(regel.vag) && regel.vag.length >= bastaLangd) {
      if (regel.vag.length > bastaLangd) tillat = regel.tillat;
      else tillat = tillat || regel.tillat;
      bastaLangd = regel.vag.length;
    }
  }
  return tillat;
}

async function hamta(url, headers = {}) {
  const svar = await fetch(url, { headers, redirect: "follow" });
  return { status: svar.status, text: await svar.text(), headers: svar.headers };
}

const fel = [];
const rader = [];

console.log(`=== AI-atkomst: ${BAS} ===\n`);

// 1. robots.txt — släpper den in de agenter vi välkomnar?
let robots;
try {
  const svar = await hamta(`${BAS}/robots.txt`);
  if (svar.status !== 200) {
    fel.push(`robots.txt svarade ${svar.status}`);
  } else {
    robots = svar.text;
  }
} catch (e) {
  fel.push(`robots.txt gick inte att hämta: ${e.message}`);
}

if (robots) {
  console.log("robots.txt:");
  for (const [agent, byra] of VALKOMNA) {
    const oppen = slapperIn(reglerFor(robots, agent), "/");
    console.log(`  ${oppen ? "OK  " : "FEL "} ${agent.padEnd(20)} ${byra}`);
    if (!oppen) fel.push(`robots.txt förbjuder ${agent} (${byra})`);
  }

  // Content-Signal styr inte åtkomst men talar om hur innehållet får användas.
  // ai-train=no eller ai-input=no motsäger att sajten vill vara källa.
  const signaler = [...robots.matchAll(/^\s*content-signal:\s*(.+)$/gim)].map((m) => m[1].trim());
  if (signaler.length > 0) {
    console.log(`\nContent-Signal: ${signaler.join(" | ")}`);
    for (const signal of signaler) {
      for (const nekad of signal.matchAll(/\b(search|ai-input|ai-train)\s*=\s*no\b/gi)) {
        fel.push(`Content-Signal säger ${nekad[1]}=no — sajten ska vara fri att använda (CC BY 4.0)`);
      }
    }
  }

  if (/cloudflare managed/i.test(robots)) {
    fel.push(
      "Cloudflares managed robots.txt är påslagen och skriver i filen — " +
        "stäng av den i panelen (se ops/RUNBOOK.md §AI-atkomst)",
    );
  }
}

// 2. Svarar sidorna, och svarar de likadant för en AI-agent som för en läsare?
console.log("\nSidor (läsare / ClaudeBot):");
const BOT_UA =
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)";
for (const [vag, vad] of SIDOR) {
  try {
    const [manniska, bot] = await Promise.all([
      hamta(`${BAS}${vag}`),
      hamta(`${BAS}${vag}`, { "User-Agent": BOT_UA }),
    ]);
    const ok = manniska.status === 200 && bot.status === 200;
    console.log(`  ${ok ? "OK  " : "FEL "} ${vag.padEnd(24)} ${manniska.status} / ${bot.status}  ${vad}`);
    if (manniska.status !== 200) fel.push(`${vag} svarade ${manniska.status}`);
    else if (bot.status !== 200) fel.push(`${vag} svarade ${bot.status} för en AI-agent men 200 för en läsare`);
  } catch (e) {
    console.log(`  FEL  ${vag.padEnd(24)} ${e.message}`);
    fel.push(`${vag} gick inte att hämta: ${e.message}`);
  }
}

// 3. Kan ämnessidan anropa Riksdagens söktjänst? `_headers` är bara repots
//    avsikt; Cloudflare kan leverera en annan policy. Därför prövas både den
//    levererade CSP:n och Riksdagens CORS-svar från den skarpa adressen.
try {
  const sida = await hamta(`${BAS}/handlingsvagen/amnen/`);
  const csp = sida.headers.get("content-security-policy") ?? "";
  const connectSrc = csp
    .split(";")
    .map((del) => del.trim())
    .find((del) => del.toLowerCase().startsWith("connect-src "));
  const cspOppen = Boolean(connectSrc?.split(/\s+/).includes("https://data.riksdagen.se"));

  const origin = new URL(BAS).origin;
  const prov = new URL("https://data.riksdagen.se/dokumentlista/");
  prov.searchParams.set("sok", "skola");
  prov.searchParams.set("utformat", "json");
  prov.searchParams.set("sz", "1");
  const riksdagen = await hamta(prov.href, { Origin: origin });
  const tillatenOrigin = riksdagen.headers.get("access-control-allow-origin");
  const corsOppen = riksdagen.status === 200 && (tillatenOrigin === "*" || tillatenOrigin === origin);

  console.log("\nÄmnessökning mot Riksdagen:");
  console.log(`  ${cspOppen ? "OK  " : "FEL "} levererad CSP tillåter data.riksdagen.se`);
  console.log(`  ${corsOppen ? "OK  " : "FEL "} Riksdagen tillåter anrop från ${origin}`);
  if (!cspOppen) {
    fel.push("levererad CSP för /handlingsvagen/amnen/ saknar data.riksdagen.se i connect-src");
  }
  if (!corsOppen) {
    fel.push(
      `Riksdagens söktjänst svarade ${riksdagen.status} med Access-Control-Allow-Origin: ${tillatenOrigin ?? "saknas"}`,
    );
  }
} catch (e) {
  console.log(`\nÄmnessökning mot Riksdagen:\n  FEL  ${e.message}`);
  fel.push(`ämnessökningens externa åtkomst gick inte att kontrollera: ${e.message}`);
}

// 4. Bär förstasidan sitt innehåll utan att JavaScript körs? En agent som inte
//    kör skript ska ändå se siffrorna.
try {
  const { text } = await hamta(BAS, { "User-Agent": BOT_UA });
  const utanTaggar = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  const ord = utanTaggar.split(/\s+/).filter(Boolean).length;
  const harJsonLd = /application\/ld\+json/i.test(text);
  console.log(`\nFörstasidan utan JavaScript: ${ord} ord, JSON-LD ${harJsonLd ? "finns" : "SAKNAS"}`);
  if (ord < 200) fel.push(`förstasidan bär bara ${ord} ord utan JavaScript — agenter som inte kör skript ser nästan inget`);
  if (!harJsonLd) fel.push("förstasidan saknar JSON-LD");
} catch (e) {
  fel.push(`förstasidan gick inte att läsa: ${e.message}`);
}

console.log("");
if (fel.length > 0) {
  console.log("=== AI-ATKOMST BRUTEN ===");
  for (const f of fel) console.log(`  - ${f}`);
  console.log("\nÅtgärd: se ops/RUNBOOK.md, avsnitten om AI-atkomst och ämnessökning.");
  process.exit(1);
}
console.log("=== AI-ATKOMST OK ===");
