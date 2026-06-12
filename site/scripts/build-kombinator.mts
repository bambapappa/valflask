import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = resolve(root, "src/scripts/kombinator.ts");
const out = resolve(root, "public/kombinator.js");

try {
  const esbuildBin = resolve(
    root,
    "node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild"
  );
  execSync(
    `${esbuildBin} ${src} --bundle --format=iife --target=es2022 --minify --outfile=${out} --analyze 2>&1`,
    { stdio: "inherit", cwd: root }
  );
  const size = statSync(out).size;
  console.log(`kombinator.js: ${size} bytes (${(size / 1024).toFixed(1)} kB)`);
  if (size > 25 * 1024) {
    console.error(`FAIL: kombinator.js exceeds 25 kB budget (${(size / 1024).toFixed(1)} kB)`);
    process.exit(1);
  }
} catch (e: any) {
  if (e.status === 1) process.exit(1);
  const fallback = resolve(
    root,
    "node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild"
  );
  try {
    execSync(
      `${fallback} ${src} --bundle --format=iife --target=es2022 --minify --outfile=${out}`,
      { stdio: "inherit", cwd: root }
    );
    const size = statSync(out).size;
    console.log(`kombinator.js: ${size} bytes (${(size / 1024).toFixed(1)} kB)`);
    if (size > 25 * 1024) {
      console.error(`FAIL: kombinator.js exceeds 25 kB budget`);
      process.exit(1);
    }
  } catch {
    console.error("Could not find esbuild. Install it or compile kombinator.ts manually.");
    process.exit(1);
  }
}
