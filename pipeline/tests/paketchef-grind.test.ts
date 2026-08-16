import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Ett installationssteg måste använda den pakethanterare vars låsfil katalogen
 * faktiskt spårar.
 *
 * Repot blandar två: `pipeline/` och `site/` spårar `pnpm-lock.yaml`, medan
 * `handlingsvagen/pipeline/` och `handlingsvagen/site/` spårar
 * `package-lock.json`. Stegen ser identiska ut, och att kopiera ett mellan
 * katalogerna går tyst sönder — `npm ci` faller på att det inte finns någon
 * package-lock.json, och `pnpm install --frozen-lockfile` på motsatsen.
 *
 * Det hände: `kostnad-omkorning.yml` fick sitt installationssteg från
 * `arkiv.yml`, som kör i handlingsvagen/pipeline. Körning 31938898106 föll
 * direkt, innan ett enda modellanrop hann göras. Felet syns inte vid läsning
 * av arbetsflödet — bara katalogen avgör vilket kommando som är rätt, och den
 * står på en annan rad.
 *
 * Grinden mäter regeln och inte de filer som råkat vara fel i dag: den läser ut
 * varje installationssteg ur varje arbetsflöde, slår upp katalogens låsfil och
 * jämför. Ett nytt arbetsflöde som kopierar fel steg fälls utan att någon
 * behöver komma ihåg det här.
 */

const ROT = resolve(import.meta.dirname, "../..");
const WORKFLOWS = join(ROT, ".github/workflows");

interface Steg {
  fil: string;
  rad: number;
  kommando: "npm" | "pnpm";
  katalog: string;
}

/**
 * Installationsstegen i ett arbetsflöde, med den katalog de körs i.
 *
 * `working-directory` kan stå på steget eller ärvas från jobbets `defaults`.
 * Båda formerna förekommer i repot, så båda läses.
 */
export function lasInstallationssteg(text: string, fil: string): Steg[] {
  const rader = text.split("\n");
  const ut: Steg[] = [];

  // Jobbets defaults.run.working-directory, om det finns.
  let standardkatalog = ".";
  for (let i = 0; i < rader.length; i++) {
    if (/^\s*defaults:\s*$/u.test(rader[i]!)) {
      for (let j = i + 1; j < Math.min(i + 6, rader.length); j++) {
        const m = /^\s*working-directory:\s*(\S+)\s*$/u.exec(rader[j]!);
        if (m) standardkatalog = m[1]!;
      }
    }
  }

  for (let i = 0; i < rader.length; i++) {
    const rad = rader[i]!;
    const m = /(?:^|\s)(npm ci|npm install|pnpm install)\b/u.exec(rad);
    if (!m) continue;

    // Katalogen: närmaste working-directory under samma steg, annars jobbets.
    let katalog = standardkatalog;
    for (let j = i + 1; j < Math.min(i + 8, rader.length); j++) {
      if (/^\s*-\s/u.test(rader[j]!)) break; // nästa steg har börjat
      const w = /^\s*working-directory:\s*(\S+)\s*$/u.exec(rader[j]!);
      if (w) { katalog = w[1]!; break; }
    }
    ut.push({
      fil,
      rad: i + 1,
      kommando: m[1]!.startsWith("pnpm") ? "pnpm" : "npm",
      katalog,
    });
  }
  return ut;
}

/**
 * Vilken pakethanterare katalogen KRÄVER — och `null` när den inte kräver någon.
 *
 * Bara en katalog med **exakt en** låsfil har ett svar. `handlingsvagen/pipeline`
 * spårar båda, och där fungerar både `npm ci` och `pnpm install` — grinden ska
 * inte ha en åsikt om vilken som väljs. Första utkastet av den här funktionen
 * läste pnpm först och fällde tre arbetsflöden som är gröna i drift; regeln var
 * för grov, inte repot fel.
 */
export function katalogensPaketchef(katalog: string): "npm" | "pnpm" | null {
  const abs = join(ROT, katalog);
  const pnpm = existsSync(join(abs, "pnpm-lock.yaml"));
  const npm = existsSync(join(abs, "package-lock.json"));
  if (pnpm && npm) return null; // båda går
  if (pnpm) return "pnpm";
  if (npm) return "npm";
  return null;
}

test("varje installationssteg använder katalogens egen pakethanterare", () => {
  const filer = readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(filer.length > 0, "hittade inga arbetsflöden — grinden mäter ingenting");

  const fel: string[] = [];
  let prövade = 0;

  for (const f of filer) {
    const steg = lasInstallationssteg(readFileSync(join(WORKFLOWS, f), "utf8"), f);
    for (const s of steg) {
      const chef = katalogensPaketchef(s.katalog);
      if (chef === null) continue; // ingen låsfil, eller båda — inget att kräva
      prövade++;
      if (chef !== s.kommando) {
        fel.push(
          `${s.fil}:${s.rad} kör ${s.kommando} i ${s.katalog}, som spårar ` +
            `${chef === "pnpm" ? "pnpm-lock.yaml" : "package-lock.json"}`,
        );
      }
    }
  }

  assert.ok(prövade > 0, "inga installationssteg lästes — läsaren är trasig, inte repot");
  assert.deepEqual(fel, [], `Installationssteg med fel pakethanterare:\n  ${fel.join("\n  ")}`);
});

test("läsaren hittar felet den finns för — prövad mot det som faktiskt hände", () => {
  // Steget som föll i körning 31938898106, ordagrant ur det första utkastet.
  const utkast = [
    "      - name: Install pipeline deps",
    "        run: npm ci",
    "        working-directory: pipeline",
  ].join("\n");
  const steg = lasInstallationssteg(utkast, "prov.yml");
  assert.equal(steg.length, 1);
  assert.equal(steg[0]!.kommando, "npm");
  assert.equal(steg[0]!.katalog, "pipeline");
  assert.equal(katalogensPaketchef("pipeline"), "pnpm");
});

test("läsaren ser katalogen även när den ärvs från jobbets defaults", () => {
  const arv = [
    "    defaults:",
    "      run:",
    "        working-directory: handlingsvagen",
    "    steps:",
    "      - name: Install",
    "        run: npm ci",
    "        working-directory: handlingsvagen/pipeline",
  ].join("\n");
  const steg = lasInstallationssteg(arv, "prov.yml");
  assert.equal(steg[0]!.katalog, "handlingsvagen/pipeline");
  // Den katalogen spårar båda låsfilerna, så grinden kräver ingen av dem.
  assert.equal(katalogensPaketchef("handlingsvagen/pipeline"), null);
});
