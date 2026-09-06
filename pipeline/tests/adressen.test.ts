/**
 * adressen.test.ts — grinden för adressens jämförbara form.
 *
 * Provet finns för ett mätt fel: `sd.se` och `www.sd.se` är två adresser till
 * samma sidor, och sedd-registret räknade dem som två sidor. Skrivs
 * `kanoniskAdress` om till att lämna värdnamnet i fred faller varje prov under
 * "samma sida under två stavningar" nedan. Det är fallprovet.
 *
 * Det andra provet är dyrare att missa: registret bär 5 857 poster skrivna med
 * den gamla nyckeln. Tas den gamla nyckeln bort ur `dedup` ser var och en av
 * dem ny ut, och nästa körning läser om hela beståndet. "Sedd under den gamla
 * nyckeln räknas som sedd" nedan mäter just det.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { kanoniskAdress } from "../src/adressen.ts";
import { dedup, seenKey, seenKeyForeKanoniseringen, sha256 } from "../src/fetch.ts";
import { laststTal } from "../src/skordeordning.ts";
import type { NormalizedArticle } from "../src/gates.ts";

const artikel = (url: string, contentHash?: string): NormalizedArticle =>
  ({
    url,
    title: "t",
    text: "x".repeat(500),
    published: "2026-09-01T00:00:00.000Z",
    domain: new URL(url).hostname,
    ...(contentHash ? { contentHash } : {}),
  }) as NormalizedArticle;

describe("kanoniskAdress", () => {
  test("www. bär ingen betydelse i värdnamnet", () => {
    assert.equal(
      kanoniskAdress("https://www.sd.se/a-till-o/abort"),
      kanoniskAdress("https://sd.se/a-till-o/abort"),
    );
  });

  test("avslutande snedstreck bär ingen betydelse", () => {
    assert.equal(
      kanoniskAdress("https://www.liberalerna.se/politik/jakt/"),
      kanoniskAdress("https://www.liberalerna.se/politik/jakt"),
    );
  });

  test("versaler i schema och värdnamn jämnas ut", () => {
    assert.equal(kanoniskAdress("HTTPS://WWW.SD.se/A-till-O/"), "https://sd.se/A-till-O");
  });

  test("sidankaret står kvar — en PDF:s sidor är olika artiklar", () => {
    assert.notEqual(
      kanoniskAdress("https://c.se/manifest.pdf#page=3"),
      kanoniskAdress("https://c.se/manifest.pdf#page=4"),
    );
  });

  test("frågesträngen står kvar", () => {
    assert.notEqual(
      kanoniskAdress("https://x.se/a?id=1"),
      kanoniskAdress("https://x.se/a?id=2"),
    );
  });

  test("bara prefixet www. faller — inte ett värdnamn som börjar på wwwx", () => {
    assert.equal(kanoniskAdress("https://wwwx.se/a"), "https://wwwx.se/a");
  });

  test("en adress som inte går att tolka kastar inte", () => {
    assert.equal(kanoniskAdress("  inte en adress/  "), "inte en adress");
  });
});

describe("seenKey: samma sida under två stavningar", () => {
  test("utan contentHash (RSS/API): en nyckel, inte två", () => {
    assert.equal(seenKey(artikel("https://sd.se/vad-vi-vill/")), seenKey(artikel("https://www.sd.se/vad-vi-vill")));
  });

  test("med contentHash (page/sitemap): en nyckel, inte två", () => {
    const h = sha256("samma text");
    assert.equal(
      seenKey(artikel("https://sd.se/a-till-o/abort/", h)),
      seenKey(artikel("https://www.sd.se/a-till-o/abort", h)),
    );
  });

  test("ändrat innehåll ger fortfarande ny nyckel", () => {
    assert.notEqual(
      seenKey(artikel("https://sd.se/a-till-o/abort", sha256("v1"))),
      seenKey(artikel("https://sd.se/a-till-o/abort", sha256("v2"))),
    );
  });

  test("dedup: båda stavningarna i samma körning ger EN artikel", () => {
    const { newArticles } = dedup(
      [artikel("https://sd.se/a-till-o/abort"), artikel("https://www.sd.se/a-till-o/abort/")],
      new Map(),
    );
    assert.equal(newArticles.length, 1, "samma sida två gånger är en sida");
  });
});

describe("seenKey: registret från före kanoniseringen", () => {
  test("sedd under den gamla nyckeln räknas som sedd", () => {
    const a = artikel("https://www.liberalerna.se/politik/jakt/", sha256("text"));
    const gammalt = new Map([[seenKeyForeKanoniseringen(a), a.url]]);
    const { newArticles } = dedup([a], gammalt);
    assert.equal(newArticles.length, 0, "en läst sida får inte läsas om för formelbytets skull");
  });

  test("en ny post skrivs under den kanoniska nyckeln", () => {
    const a = artikel("https://www.sd.se/a-till-o/abort/", sha256("text"));
    const { seen } = dedup([a], new Map());
    assert.ok(seen.has(seenKey(a)));
    assert.equal(seen.get(seenKey(a)), a.url, "värdet är källans egen adress, oförändrad");
  });
});

describe("laststTal", () => {
  test("samma sida under båda stavningarna är EN läst sida", () => {
    const tal = laststTal(
      new Map([
        ["h1", "https://sd.se/vad-vi-vill"],
        ["h2", "https://www.sd.se/vad-vi-vill/"],
        ["h3", "https://www.sd.se/a-till-o/abort"],
      ]),
    );
    assert.equal(tal.get("sd"), 2, "två sidor, inte tre");
  });
});
