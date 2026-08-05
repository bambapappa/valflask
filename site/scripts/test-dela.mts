/**
 * test-dela.mts — delningsknapparna ska bara peka på adresser som faktiskt
 * delar sidan, och aldrig dra in tredjepartsskript.
 *
 * Bakgrunden (2026-08-05): önskemål kom om TikTok och Snapchat. Snapchat har
 * en dokumenterad delningsadress som varken kräver SDK eller klient-id.
 * TikTok har det INTE — deras delning omfattar bara video och bilder, via
 * app-intents på mobilen eller ett uppladdnings-API med inloggning. En
 * TikTok-knapp hade alltså sett ut att fungera utan att göra något, och
 * TikTok nås i stället genom enhetens delningsark.
 *
 * Grinden finns för att nästa person som får samma önskemål ska mötas av ett
 * rött test i stället för att lägga in en död länk.
 *
 * Körs i sajtens teststil (node --experimental-strip-types).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DELA = resolve(__dirname, "../src/components/Dela.astro");

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

const src = readFileSync(DELA, "utf8");
// Kommentarsblocket FÖRKLARAR varför TikTok saknas och nämner därför både
// tiktok.com och ordet TikTok. Det ska inte fälla grinden.
const kod = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("--- Kanaler med dokumenterad delningsadress ---");
for (const [namn, monster] of [
  ["X", "twitter.com/intent/tweet"],
  ["Facebook", "facebook.com/sharer/sharer.php"],
  ["Bluesky", "bsky.app/intent/compose"],
  ["Snapchat", "snapchat.com/share?link="],
] as Array<[string, string]>) {
  check(`${namn} finns med`, kod.includes(monster), `saknar ${monster}`);
}

console.log("\n--- Inga knappar som inte delar något ---");
check(
  "ingen TikTok-länk",
  !/tiktok\.com/i.test(kod),
  "TikTok har ingen adress som delar en webblänk — knappen hade inte gjort något. " +
    "TikTok nås genom enhetens delningsark (navigator.share).",
);
check(
  "delningsarket finns kvar — det är vägen till TikTok",
  /navigator\.share/.test(kod) && /data-dela-native/.test(kod),
  "utan delningsarket finns ingen väg alls till appar som saknar delningsadress",
);

console.log("\n--- Inga tredjepartsskript (§17) ---");
check(
  "inga externa skript laddas",
  !/<script[^>]+src=["']https?:/i.test(kod),
  "delningsknapparna drar in ett tredjepartsskript",
);
for (const sdk of ["sdk.snapkit.com", "connect.facebook.net", "platform.twitter.com"]) {
  check(`${sdk} laddas inte`, !kod.includes(sdk));
}

console.log("\n--- Länkarna är säkert öppnade ---");
const externaLankar = [...kod.matchAll(/<a\s[^>]*href=\{(\w+)\}[^>]*>/g)];
check(
  "varje extern delningslänk bär rel=noopener noreferrer",
  externaLankar.length > 0 &&
    externaLankar.every((m) => m[0].includes('rel="noopener noreferrer"')),
  `${externaLankar.filter((m) => !m[0].includes("noopener")).length} länk(ar) saknar rel`,
);
check(
  "varje extern delningslänk bär aria-label",
  externaLankar.every((m) => m[0].includes("aria-label=")),
  "en delningslänk saknar aria-label",
);

if (errors > 0) {
  console.error(`\ntest-dela: ${errors} grind(ar) föll`);
  process.exit(1);
}
console.log("\ntest-dela: alla grindar gröna");
