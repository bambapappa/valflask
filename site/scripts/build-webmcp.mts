/** Bygger WebMCP-klienten som registrerar Utlovats sajtverktyg i webbläsaren. */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src/scripts/webmcp.ts");
const out = resolve(root, "public/webmcp.js");
const BUDGET = 35 * 1024;

if (!existsSync(src)) {
  console.error(`Hittar inte WebMCP-källan: ${src}`);
  process.exit(1);
}

// WebMCP-klienten har inga importberoenden. Node tar bort TypeScript-typerna
// direkt, vilket gör den här nödvändiga klientbyggnaden oberoende av Astro- och
// esbuild-installationen. Bygget behåller ändå en storleksgrind.
const compiled = stripTypeScriptTypes(readFileSync(src, "utf8")).replace(/[\t ]+$/gm, "");
writeFileSync(out, compiled, "utf8");

const size = statSync(out).size;
console.log(`webmcp.js: ${size} bytes (${(size / 1024).toFixed(1)} kB)`);
if (size > BUDGET) {
  console.error(`FAIL: webmcp.js överskrider budgeten på 35 kB (${(size / 1024).toFixed(1)} kB)`);
  process.exit(1);
}
