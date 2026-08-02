/**
 * Bygger `public/kombinator.js` ur `src/scripts/kombinator.ts`.
 *
 * esbuild står som eget devDependency i `package.json`, så binären ligger
 * alltid i `node_modules/.bin/`. Skriptet letade tidigare på hårdkodade
 * sökvägar inne i pnpm-butiken (`node_modules/.pnpm/esbuild@0.27.7/…`),
 * vilket band bygget till den version någon annan råkade dra in: när Astro
 * lyftes till 7 flyttade esbuild till 0.28.1 och bygget hittade ingenting.
 * Ett lokalt träd klarade sig ändå, eftersom den gamla versionen låg kvar i
 * butiken — felet syntes först på en ren installation.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const src = resolve(root, "src/scripts/kombinator.ts");
const out = resolve(root, "public/kombinator.js");
const esbuild = resolve(root, "node_modules/.bin/esbuild");

/** Klientkoden måste rymmas i 25 kB — den hämtas vid varje sidvisning. */
const BUDGET = 25 * 1024;

if (!existsSync(esbuild)) {
  console.error(`Hittar inte esbuild på ${esbuild}. Kör installationen först.`);
  process.exit(1);
}

execFileSync(
  esbuild,
  [src, "--bundle", "--format=iife", "--target=es2022", "--minify", `--outfile=${out}`, "--analyze"],
  { stdio: "inherit", cwd: root },
);

const size = statSync(out).size;
console.log(`kombinator.js: ${size} bytes (${(size / 1024).toFixed(1)} kB)`);
if (size > BUDGET) {
  console.error(`FAIL: kombinator.js överskrider budgeten på 25 kB (${(size / 1024).toFixed(1)} kB)`);
  process.exit(1);
}
