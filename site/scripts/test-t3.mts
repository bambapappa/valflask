import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const Ajv2020 = (await import("ajv/dist/2020.js")).Ajv2020;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DATA_DIR = resolve(ROOT, "data");
const SCHEMAS_DIR = resolve(ROOT, "pipeline/schemas");
const DIST_DIR = resolve(ROOT, "site/dist");

let errors = 0;

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
  errors++;
}

function check(label: string, condition: boolean, msg?: string) {
  if (condition) {
    console.log(`  OK: ${label}`);
  } else {
    fail(`${label}${msg ? ` — ${msg}` : ""}`);
  }
}

console.log("=== T3: Schema validation + HTML checks ===");

// Part 1: AJV validation
console.log("\n--- Schema validation ---");

const schemaFiles: Record<string, string> = {
  "promises.json": "promises.schema.json",
  "parties.json": "parties.schema.json",
  "people.json": "people.schema.json",
  "constants.json": "constants.schema.json",
  "changelog.json": "changelog.schema.json",
  "needs_review.json": "needs_review.schema.json",
  "seen.json": "seen.schema.json",
};

for (const [dataFile, schemaFile] of Object.entries(schemaFiles)) {
  try {
    const ajv = new Ajv2020({ strict: false });
    const schema = JSON.parse(readFileSync(resolve(SCHEMAS_DIR, schemaFile), "utf8"));
    const data = JSON.parse(readFileSync(resolve(DATA_DIR, dataFile), "utf8"));
    const validate = ajv.compile(schema);
    const valid = validate(data);
    check(`${dataFile} valid`, valid, valid ? "" : JSON.stringify(validate.errors));
  } catch (e: any) {
    fail(`${dataFile}: ${e.message}`);
  }
}

// Part 2: HTML lang="sv"
console.log("\n--- HTML: lang=\"sv\" ---");

function findHtmlFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(fullPath));
    } else if (entry.name.endsWith(".html")) {
      results.push(fullPath);
    }
  }
  return results;
}

const htmlFiles = findHtmlFiles(DIST_DIR);
let langOk = 0;
let langFail = 0;
for (const f of htmlFiles) {
  const content = readFileSync(f, "utf8");
  if (content.includes('lang="sv"')) {
    langOk++;
  } else {
    langFail++;
    fail(`Missing lang="sv": ${f.replace(DIST_DIR, "")}`);
  }
}
check(`lang="sv" on all HTML pages`, langFail === 0, `${langOk} ok, ${langFail} missing`);

// Part 3: tabular-nums in CSS or HTML
console.log("\n--- tabular-nums ---");
let tnumFound = false;
const cssDir = resolve(DIST_DIR, "_astro");
if (existsSync(cssDir)) {
  const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
  for (const cf of cssFiles) {
    const content = readFileSync(resolve(cssDir, cf), "utf8");
    if (content.includes("tabular-nums")) {
      tnumFound = true;
      break;
    }
  }
}
if (!tnumFound) {
  for (const f of htmlFiles.slice(0, 10)) {
    const content = readFileSync(f, "utf8");
    if (content.includes("tabular-nums")) {
      tnumFound = true;
      break;
    }
  }
}
check("tabular-nums in CSS output", tnumFound);

// Part 4: exactly one <h1> per page
console.log("\n--- H1 per page ---");
let h1Ok = 0;
let h1Fail = 0;
const h1FailDetails: string[] = [];
for (const f of htmlFiles) {
  const content = readFileSync(f, "utf8");
  const h1Count = (content.match(/<h1[\s>]/g) || []).length;
  const rel = f.replace(DIST_DIR, "");
  if (h1Count === 1) {
    h1Ok++;
  } else {
    h1Fail++;
    h1FailDetails.push(`${rel}: ${h1Count} h1`);
  }
}
check("exactly one <h1> per page", h1Fail === 0, `${h1Ok} ok, ${h1Fail} wrong: ${h1FailDetails.slice(0, 10).join("; ")}`);

// Part 5: og:image with absolute URL on every page
console.log("\n--- og:image ---");
let ogOk = 0;
let ogFail = 0;
const ogFailDetails: string[] = [];
for (const f of htmlFiles) {
  const content = readFileSync(f, "utf8");
  const rel = f.replace(DIST_DIR, "");
  const hasOgImage = /property="og:image"\s+content="https:\/\//.test(content);
  if (hasOgImage) {
    ogOk++;
  } else {
    ogFail++;
    ogFailDetails.push(rel);
  }
}
check("og:image with absolute URL on all pages", ogFail === 0, `${ogOk} ok, ${ogFail} missing: ${ogFailDetails.slice(0, 10).join("; ")}`);

// Part 6: ≈ appears on at least one known llm_estimat promise page
console.log("\n--- ≈ typography for llm_estimat ---");
const data = JSON.parse(readFileSync(resolve(DATA_DIR, "promises.json"), "utf8"));
const llmPromise = data.find((p: any) => p.cost.basis === "llm_estimat");
let approxFound = false;
if (llmPromise) {
  const slug = `lofte/${llmPromise.id}/${llmPromise.slug}/index.html`;
  const fullPath = resolve(DIST_DIR, slug);
  if (existsSync(fullPath)) {
    const content = readFileSync(fullPath, "utf8");
    approxFound = content.includes("≈");
  }
}
check("≈ on llm_estimat promise page", approxFound, `checked ${llmPromise?.id ?? "no llm_estimat found"}`);

// Part 7: zero style= attributes in dist HTML
console.log("\n--- No inline style attributes ---");
let styleAttrCount = 0;
const styleAttrExamples: string[] = [];
for (const f of htmlFiles) {
  const content = readFileSync(f, "utf8");
  const matches = content.match(/ style="[^"]*"/g);
  if (matches) {
    styleAttrCount += matches.length;
    if (styleAttrExamples.length < 5) {
      styleAttrExamples.push(`${f.replace(DIST_DIR, "")}: ${matches.length}`);
    }
  }
}
check("zero style= attributes in dist HTML", styleAttrCount === 0, `found ${styleAttrCount}: ${styleAttrExamples.join("; ")}`);

// Part 8: zero <style> elements in dist HTML
console.log("\n--- No <style> elements ---");
let styleElemCount = 0;
for (const f of htmlFiles) {
  const content = readFileSync(f, "utf8");
  const matches = content.match(/<style[\s>]/g);
  if (matches) {
    styleElemCount += matches.length;
  }
}
check("zero <style> elements in dist HTML", styleElemCount === 0, `found ${styleElemCount}`);

// Part 9: data-taxameter on start page with correct value
console.log("\n--- Taxameter ---");
const startPage = resolve(DIST_DIR, "index.html");
let taxameterOk = false;
if (existsSync(startPage)) {
  const content = readFileSync(startPage, "utf8");
  const match = content.match(/data-taxameter="(\d+(?:\.\d+)?)"/);
  if (match) {
    const val = parseFloat(match[1]);
    const expectedFlasket = data.reduce((sum: number, p: any) => {
      if (p.cost.type !== "utgift" && p.cost.type !== "intäktsminskning") return sum;
      const mult = p.cost.period === "per_ar" ? 4 : 1;
      return sum + p.cost.msek_base * mult;
    }, 0);
    taxameterOk = val === expectedFlasket;
    if (!taxameterOk) {
      fail(`data-taxameter="${match[1]}" != expected flasket ${expectedFlasket}`);
    }
  } else {
    fail("data-taxameter attribute not found on start page");
  }
} else {
  fail("start page index.html not found");
}
check("data-taxameter with correct flasket total on start page", taxameterOk);

console.log("");
console.log(errors === 0 ? "T3: ALL CHECKS PASSED" : `T3: ${errors} FAILURES`);
process.exit(errors);
