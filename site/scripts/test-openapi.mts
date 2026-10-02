/**
 * test-openapi.mts — OpenAPI-specen och verkligheten håller varandra aktualiserade.
 *
 * En spec som listar endpoints som inte finns, eller endpoints som inte står i
 * specen, är värre än ingen spec för en agent som följer den: den letar bil-i-
 * luften. Grinden är tvåvägs och offline mot den byggda sajten:
 *
 *   1. Varje konkret path i openapi.json finns som fil i site/dist/api/v1/.
 *   2. Varje mall-path (som /api/v1/faq/{slug}.json) har minst en byggd
 *      instans, och varje byggd instans matchar en mall i specen.
 *   3. Varje JSON-fil i site/dist/api/v1/ har en path i specen — ett nytt
 *      endpoint utan spec-rad fäller bygget, inte tvärtom.
 *
 * Fallprov (provade mot införda fel, utskrifter i PR-texten): en borttagen
 * endpoint-fil (parties.json) fäller check 1; en ny fil utan spec-rad
 * (hemlig.json) fäller check 3. Uten dist-katalog (blänkt underlag) faller
 * hela grinden — den mäter byggd verklighet, inte goda intentioner.
 *
 *   node --experimental-strip-types scripts/test-openapi.mts
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROT = resolve(__dirname, "../..");
const SPEC = resolve(ROT, "site/public/api/v1/openapi.json");
const API_DIST = resolve(ROT, "site/dist/api/v1");

let fel = 0;
function check(etikett: string, villkor: boolean, varfor?: string): void {
  if (villkor) console.log(`  OK: ${etikett}`);
  else {
    console.error(`FAIL: ${etikett}${varfor ? ` — ${varfor}` : ""}`);
    fel++;
  }
}

console.log("--- OpenAPI: specen är läsbar ---");

if (!existsSync(SPEC)) {
  check("openapi.json finns i site/public/api/v1/", false);
  console.error("\nOpenAPI-grinden: 1 fel.");
  process.exit(1);
}

const spec = JSON.parse(readFileSync(SPEC, "utf8"));
check("openapi 3.x", typeof spec.openapi === "string" && spec.openapi.startsWith("3."), String(spec.openapi));
check("licens CC-BY-4.0", spec.info?.license?.name === "CC-BY-4.0");
const paths: string[] = Object.keys(spec.paths ?? {});
check("specen listar endpoints", paths.length >= 10, `${paths.length} paths`);

console.log("\n--- Tvåvägskoll mot byggd sajten ---");

if (!existsSync(API_DIST)) {
  check("site/dist/api/v1 finns (kör pnpm build först)", false);
  console.error("\nOpenAPI-grinden: 1 fel.");
  process.exit(1);
}

const filer = readdirSync(API_DIST).filter((f) => f.endsWith(".json"));
const underkataloger = readdirSync(API_DIST, { withFileTypes: true }).filter((d) => d.isDirectory());

// Konkreta paths: "/api/v1/summary.json" → filen "summary.json".
const konkreta = paths.filter((p) => !p.includes("{"));
for (const p of konkreta) {
  const fil = p.replace("/api/v1/", "");
  check(`${p} finns som fil i dist`, filer.includes(fil) || underkataloger.some((d) => fil.startsWith(`${d.name}/`)));
}

// Mall-paths: "/api/v1/faq/{slug}.json" → minst en instans i faq/-katalogen.
const mallar = paths.filter((p) => p.includes("{"));
for (const mall of mallar) {
  const prefix = mall.slice(0, mall.indexOf("{")).replace("/api/v1/", "");
  const suffix = mall.slice(mall.lastIndexOf("}") + 1);
  const katalog = underkataloger.find((d) => `${d.name}/` === prefix);
  if (!katalog) {
    check(`${mall} har en byggd katalog`, false, `väntade katalogen ${prefix}`);
    continue;
  }
  const instanser = readdirSync(resolve(API_DIST, katalog.name)).filter((f) => f.endsWith(suffix));
  check(`${mall} har minst en byggd instans`, instanser.length >= 1, "0 instanser");
}

// Alla filer i roten ska stå i specen; openapi.json är specen själv.
for (const fil of filer) {
  if (fil === "openapi.json") continue;
  check(`/api/v1/${fil} står i specen`, paths.includes(`/api/v1/${fil}`));
}
// Alla filer i underkataloger ska matcha en mall.
for (const d of underkataloger) {
  const filer_i = readdirSync(resolve(API_DIST, d.name)).filter((f) => f.endsWith(".json"));
  for (const fil of filer_i) {
    const matcharMall = mallar.some((mall) => {
      const prefix = mall.slice(0, mall.indexOf("{")).replace("/api/v1/", "");
      const suffix = mall.slice(mall.lastIndexOf("}") + 1);
      return `${d.name}/` === prefix && fil.endsWith(suffix);
    });
    check(`/api/v1/${d.name}/${fil} matchar en mall i specen`, matcharMall);
  }
}

console.log(fel === 0 ? "\nOpenAPI-grinden: grön." : `\nOpenAPI-grinden: ${fel} fel.`);
process.exit(fel > 0 ? 1 : 0);
