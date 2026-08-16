/**
 * Kö-posten ska gå att peka ut med något som inte flyttar sig.
 *
 * VARFÖR: `review.ts` godkände på index, och index är positioner. Ett
 * beslutsunderlag skrivs mot kön en dag och verkställs mot kön en annan, och
 * däremellan avgörs poster ovanför. Då pekar varje nummer i dokumentet på fel
 * post — och ingenting säger ifrån, för index 17 finns fortfarande. Det är den
 * farligaste sortens fel: det ser ut som att det gick bra.
 *
 * Det är mätt, inte befarat. `REVIEWKO-79-2026-08-16.md` skrevs mot en kö på 79
 * poster. Sexton avgjordes samma dag, och därefter hade **ingen av de 59
 * kvarvarande kvar sitt nummer** — inte en enda. Ett dokument skrivet på
 * förmiddagen hade på eftermiddagen godkänt 59 andra löften än det beskrev.
 *
 * Id:t fanns redan — issueflödet använde det — men det syntes inte i
 * listningen och krävde ett eget kommandonamn. Den som läste `pnpm review`
 * fick bara numret, och skrev därför numret i sitt underlag.
 *
 * VAD DET INTE FÅNGAR: att underlaget beskriver rätt post från början. Provet
 * säger bara att nyckeln fortsätter peka på samma post när kön ändras.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewId, findIndexByReviewId, loesKoArgument, reject } from "../src/review.ts";

type Post = { candidate: { title: string }; failures: []; articleUrl: string; articleTitle: string };

function ko(n: number): Post[] {
  return Array.from({ length: n }, (_, i) => ({
    candidate: { title: `Löfte ${i}` },
    failures: [] as [],
    articleUrl: `https://exempel.test/artikel-${i}`,
    articleTitle: `Artikel ${i}`,
  }));
}

function skrivKo(dir: string, poster: Post[]): void {
  writeFileSync(join(dir, "needs_review.json"), JSON.stringify(poster, null, 2) + "\n");
  writeFileSync(join(dir, "avvisade.json"), "[]\n");
}

function lasKo(dir: string): Post[] {
  return JSON.parse(readFileSync(join(dir, "needs_review.json"), "utf8")) as Post[];
}

describe("kö-posten pekas ut med en nyckel som håller", () => {
  it("numret flyttar sig när en post ovanför avgörs — id:t gör det inte", () => {
    const dir = mkdtempSync(join(tmpdir(), "konyckeln-"));
    try {
      skrivKo(dir, ko(5));
      const fore = lasKo(dir);

      // Underlaget skrivs: «post [3] ska godkännas». Vi noterar båda formerna.
      const malId = reviewId(fore[3]!);
      assert.equal(fore[3]!.candidate.title, "Löfte 3");

      // Sedan avgörs två poster OVANFÖR — precis det som hände mellan att
      // REVIEWKO-79 skrevs och att den skulle verkställas.
      reject("0", "avvisad i ett tidigare pass", dir);
      reject("0", "avvisad i ett tidigare pass", dir);

      const efter = lasKo(dir);
      assert.equal(efter.length, 3);

      // Numret pekar nu på ett ANNAT löfte, och ingenting hade sagt ifrån.
      assert.equal(
        efter[3],
        undefined,
        "index 3 finns inte längre — men i en längre kö hade det pekat på fel post, tyst",
      );
      assert.equal(
        efter[1]!.candidate.title,
        "Löfte 3",
        "posten underlaget menade ligger nu på index 1",
      );

      // Id:t pekar fortfarande på rätt post.
      assert.equal(findIndexByReviewId(efter, malId), 1);
      assert.equal(loesKoArgument(efter, malId), 1);
      assert.equal(efter[loesKoArgument(efter, malId)]!.candidate.title, "Löfte 3");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ko:-prefixet duger — det är formen granskningsloggen och issuen skriver", () => {
    const poster = ko(3);
    const id = reviewId(poster[2]!);
    assert.equal(loesKoArgument(poster, id), 2);
    assert.equal(loesKoArgument(poster, `ko:${id}`), 2);
  });

  it("ett index duger fortfarande — den gamla vägen är inte stängd", () => {
    const poster = ko(3);
    assert.equal(loesKoArgument(poster, "0"), 0);
    assert.equal(loesKoArgument(poster, "2"), 2);
  });

  it("avvisning tar samma nyckel som godkännande", () => {
    const dir = mkdtempSync(join(tmpdir(), "konyckeln-reject-"));
    try {
      skrivKo(dir, ko(4));
      const malId = reviewId(lasKo(dir)[2]!);

      reject(malId, "avvisad via stabil nyckel", dir);

      const kvar = lasKo(dir);
      assert.equal(kvar.length, 3);
      assert.deepEqual(
        kvar.map((p) => p.candidate.title),
        ["Löfte 0", "Löfte 1", "Löfte 3"],
        "rätt post togs bort — den nyckeln pekade på, inte den numret råkar peka på",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
