/**
 * Backfillen stämplar bara dina egna platshållare.
 *
 * Mönstret är två commits: dataändringen skrivs med `"commit": "0000000"`
 * eftersom hashen inte finns förrän commiten är gjord, och en andra commit
 * fyller i den. Skriptet bytte tidigare ut VARENDA `0000000` i filen mot samma
 * hash, oavsett vem som skrivit den.
 *
 * Det är ofarligt så länge alla gör sitt andra steg. Det gjorde de inte: 376
 * främmande platshållare låg kvar i trädet från sessioner som inte hunnit
 * klart, och ett anrop hade tillskrivit dem alla en commit de inte kom ur.
 * 376 falska påståenden om var en ändring kommer ifrån, i data som visas
 * publikt. Det upptäcktes 2026-09-01, när skriptet stämplade 389 i stället för
 * de 2 som var mina, och fick backas för hand.
 *
 * Provet nedan bygger ett litet git-repo med en främmande platshållare i
 * HEAD och en egen bara i arbetskopian, och kräver att skriptet rör den ena
 * och inte den andra.
 *
 * FÄLLS AV: att låta skriptet stämpla allt igen, eller att jämföra på ORDNING
 * i stället för innehåll — en tidig variant hoppade över de N första
 * platshållarna, vilket gör exakt samma felstämpling så snart din egen post
 * inte råkar ligga sist.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SKRIPT = join(import.meta.dirname, "..", "scripts", "backfilla-commit.mts");

function git(kat: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: kat, encoding: "utf8" });
}

/** Ett löfte med en historikpost. `commit` styr om posten är en platshållare. */
function lofte(id: string, commit: string, text: string) {
  return {
    id,
    title: `Löfte ${id}`,
    parties: ["x"],
    quote: "citat",
    status: "aktiv",
    cost: { msek_base: 0 },
    history: [{ date: "2026-09-01", commit, change: text }],
  };
}

/**
 * Ett repo där HEAD redan bär främmande platshållare, och arbetskopian har
 * fått en egen. `egenForst` lägger den egna FÖRE de främmande — det är fallet
 * en ordningsbaserad jämförelse får fel.
 */
function bygg(egenForst: boolean): string {
  const rot = mkdtempSync(join(tmpdir(), "backfill-"));
  mkdirSync(join(rot, "data"), { recursive: true });
  mkdirSync(join(rot, "pipeline"), { recursive: true });
  cpSync(join(import.meta.dirname, "..", "src"), join(rot, "pipeline", "src"), { recursive: true });
  cpSync(join(import.meta.dirname, "..", "schemas"), join(rot, "pipeline", "schemas"), { recursive: true });
  mkdirSync(join(rot, "pipeline", "scripts"), { recursive: true });
  // Samma djup som i repot: skriptet läser ../src och ../../data.
  cpSync(SKRIPT, join(rot, "pipeline", "scripts", "backfilla-commit.mts"));
  // tsx bor i pipelinens node_modules; provrepot ligger i /tmp och hittar den
  // annars inte.
  symlinkSync(join(import.meta.dirname, "..", "node_modules"), join(rot, "pipeline", "node_modules"), "dir");

  const skriv = (namn: string, v: unknown) =>
    writeFileSync(join(rot, "data", namn), JSON.stringify(v, null, 2) + "\n");

  const frammande = [lofte("p-0001", "0000000", "någon annans halvfärdiga par")];
  skriv("promises.json", frammande);
  skriv("rattelser.json", []);
  skriv("changelog.json", [{ run_id: "r1", added: [], updated: [], retracted: [], data_hash: "x" }]);

  git(rot, "init", "-q");
  git(rot, "config", "user.email", "prov@utlovat.se");
  git(rot, "config", "user.name", "prov");
  git(rot, "add", "-A");
  git(rot, "commit", "-qm", "främmande platshållare");

  const min = lofte("p-0002", "0000000", "min egen ändring");
  skriv("promises.json", egenForst ? [min, ...frammande] : [...frammande, min]);
  return rot;
}

function kor(rot: string): string {
  return execFileSync(process.execPath, ["--import", "tsx/esm", "scripts/backfilla-commit.mts", "abc1234"], {
    cwd: join(rot, "pipeline"),
    encoding: "utf8",
  });
}

function commitar(rot: string): Record<string, string> {
  const d = JSON.parse(readFileSync(join(rot, "data", "promises.json"), "utf8")) as Array<{
    id: string;
    history: Array<{ commit: string }>;
  }>;
  return Object.fromEntries(d.map((p) => [p.id, p.history[0]!.commit]));
}

describe("backfillen rör bara dina egna platshållare", () => {
  it("den främmande lämnas orörd, den egna stämplas", () => {
    const rot = bygg(false);
    const utskrift = kor(rot);
    const c = commitar(rot);
    assert.equal(c["p-0001"], "0000000", "någon annans halvfärdiga par ska ligga kvar");
    assert.equal(c["p-0002"], "abc1234", "din egen ska fyllas i");
    assert.match(utskrift, /lämnade orörda/u, "skriptet ska säga att det hoppade över något");
  });

  it("håller även när din egen post ligger FÖRE den främmande", () => {
    // Fallet som fäller en jämförelse på ordning i stället för innehåll.
    const rot = bygg(true);
    kor(rot);
    const c = commitar(rot);
    assert.equal(c["p-0001"], "0000000", "den främmande stämplades — jämförelsen läser ordning, inte innehåll");
    assert.equal(c["p-0002"], "abc1234");
  });
});
