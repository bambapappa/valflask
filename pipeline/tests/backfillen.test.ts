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
 * Provet prövar REGELN, inte skriptets omgivning. En första version startade en
 * delprocess, byggde ett git-repo i `tmpdir()` och symlänkade in
 * `node_modules` — den var grön lokalt i sex olika uppsättningar och röd i CI,
 * och loggen räckte inte till för att säga varför. Ett prov som mäter sin egen
 * miljö lika mycket som regeln, och som bara ibland håller, är inget prov.
 * Regeln bor därför i `src/backfillen.ts` och prövas med vanliga objekt.
 *
 * FÄLLS AV: att låta backfillen stämpla allt igen, eller att jämföra på ORDNING
 * i stället för innehåll — en tidig variant hoppade över de N första
 * platshållarna, vilket gör exakt samma felstämpling så snart din egen post
 * inte råkar ligga sist.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATSHALLARE, platshallarna, stampla } from "../src/backfillen.ts";

/** Ett löfte med en historikpost. `commit` styr om posten är en platshållare. */
function lofte(id: string, commit: string, text: string) {
  return { id, history: [{ date: "2026-09-01", commit, change: text }] };
}

const HASH = "abc1234";
const annans = () => lofte("p-0001", PLATSHALLARE, "någon annans halvfärdiga par");
const min = () => lofte("p-0002", PLATSHALLARE, "min egen ändring");

/** Commit-fältet på varje löfte, som en uppslagning. */
function commitar(trad: Array<{ id: string; history: Array<{ commit: string }> }>) {
  return Object.fromEntries(trad.map((p) => [p.id, p.history[0]!.commit]));
}

describe("backfillen rör bara dina egna platshållare", () => {
  it("den främmande lämnas orörd, den egna stämplas", () => {
    const committat = [annans()];
    const trad = [annans(), min()];
    const r = stampla(trad, committat, HASH);
    assert.deepEqual(commitar(trad), { "p-0001": PLATSHALLARE, "p-0002": HASH });
    assert.deepEqual(r, { bytta: 1, hoppade: 1 });
  });

  it("håller även när din egen post ligger FÖRE den främmande", () => {
    // Fallet som fäller en jämförelse på ordning i stället för innehåll: en
    // sådan hoppar över den FÖRSTA platshållaren den ser, alltså din.
    const committat = [annans()];
    const trad = [min(), annans()];
    stampla(trad, committat, HASH);
    assert.deepEqual(commitar(trad), { "p-0001": PLATSHALLARE, "p-0002": HASH });
  });

  it("två likalydande poster slår inte ihop till en", () => {
    // Multimängden, inte mängden. Fanns EN sådan post committad och trädet har
    // TVÅ, är den andra din och ska stämplas.
    const committat = [annans()];
    const tvilling = { ...annans(), id: "p-0001" };
    const trad = [annans(), tvilling];
    trad[1]!.id = "p-0001";
    const r = stampla(trad, committat, HASH);
    assert.deepEqual(r, { bytta: 1, hoppade: 1 }, "en hoppas över, en stämplas");
  });

  it("utan committad version är allt i trädet ditt", () => {
    // Filen är ny, eller den som kör har sagt --aven-andras.
    const trad = [annans(), min()];
    const r = stampla(trad, null, HASH);
    assert.deepEqual(commitar(trad), { "p-0001": HASH, "p-0002": HASH });
    assert.deepEqual(r, { bytta: 2, hoppade: 0 });
  });

  it("platshållare hittas hur djupt de än ligger", () => {
    const djupt = { a: { b: [{ c: [{ commit: PLATSHALLARE, x: 1 }] }] } };
    assert.equal(platshallarna(djupt).size, 1, "svepet ska nå hela vägen ned");
    stampla(djupt, null, HASH);
    assert.equal(djupt.a.b[0]!.c[0]!.commit, HASH);
  });

  it("skriptet använder regeln i stället för en egen kopia", () => {
    // Två kopior av samma regel glider isär, och då mäter provet den ena
    // medan skriptet kör den andra.
    const skript = readFileSync(join(import.meta.dirname, "..", "scripts", "backfilla-commit.mts"), "utf8");
    assert.match(skript, /from "\.\.\/src\/backfillen\.ts"/u, "skriptet ska importera regeln");
    assert.match(skript, /\bstampla\(/u, "och faktiskt anropa den");
  });
});
