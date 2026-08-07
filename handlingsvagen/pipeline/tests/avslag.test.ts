/**
 * Vaktar att ett avslag går att läsa — både tolkningen av punktens referenser
 * och att fältet `avslaget` faktiskt är ifyllt där det krävs.
 *
 * Bakgrund: en punkt som bara avslår motioner ("Riksdagen avslår motionerna
 * 2024/25:3435 … yrkandena 1 och 2, …") passerar citatgrinden — det ÄR
 * punktens egen beslutstext — men läsaren ser bara en lista på nummer. Fem
 * kopplingar drogs in 2026-08-06 sedan yrkandena lästs: de gällde en annan
 * sakfråga än löftet, eller var ett annat partis yrkande. Uppgiften fanns hela
 * tiden, den var bara aldrig hämtad.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseAvslagsreferenser } from "../src/riksdagen.ts";
import { avslagsbeslut } from "../src/grindar.ts";
import type { KopplingPost } from "../src/granskning.ts";

test("referenserna läses ur punktens beslutstext, med parti och yrkandenummer", () => {
  const ref = parseAvslagsreferenser(
    "Riksdagen avslår motionerna 2024/25:3435 av Vasiliki Tsouplaki m.fl. (V) yrkandena 1 och 2, " +
      "2024/25:3436 av Lawen Redar m.fl. (S) yrkandena 1, 8-13 och 21 samt " +
      "2024/25:3439 av Mats Berglund m.fl. (MP) yrkande 1.",
  );
  assert.equal(ref.length, 3);
  assert.deepEqual(ref[0], { rm: "2024/25", beteckning: "3435", parti: "v", yrkanden: ["1", "2"] });
  assert.deepEqual(ref[1]!.yrkanden, ["1", "8", "9", "10", "11", "12", "13", "21"]);
  // Singularformen "yrkande 1" är den lätta att missa: en regel skriven för
  // "yrkanden"/"yrkandena" tar hela motionen i stället för ett yrkande.
  assert.deepEqual(ref[2], { rm: "2024/25", beteckning: "3439", parti: "mp", yrkanden: ["1"] });
});

test("en motion utan yrkandenummer avslås i sin helhet", () => {
  const ref = parseAvslagsreferenser("Riksdagen avslår motion 2025/26:309 av Hanna Gunnarsson m.fl. (V).");
  assert.deepEqual(ref, [{ rm: "2025/26", beteckning: "309", parti: "v", yrkanden: [] }]);
});

test("partilös motionär ger tomt parti, inte bindestrecket", () => {
  const ref = parseAvslagsreferenser("Riksdagen avslår motion 2025/26:1506 av Jamal El-Haj (-) yrkande 1.");
  assert.equal(ref[0]!.parti, "");
});

test("avslagsbeslut träffar bara punkter som enbart avslår", () => {
  assert.equal(avslagsbeslut("Riksdagen avslår motionerna 2024/25:442 av Serkan Köse (S)."), true);
  assert.equal(avslagsbeslut("Riksdagen avslår motion 2025/26:309 av Hanna Gunnarsson m.fl. (V)."), true);
  // Antar punkten något visar den vad som beslutades, även när den också
  // avslår motioner.
  assert.equal(
    avslagsbeslut("Riksdagen antar regeringens förslag till lag om ändring i brottsbalken. Därmed bifaller riksdagen proposition 2025/26:218 och avslår motionerna 2025/26:3027."),
    false,
  );
  assert.equal(avslagsbeslut("Riksdagen godkänner vad regeringen föreslår om uppföljningen."), false);
});

test("varje publicerad koppling som bara avslår motioner säger vad som avslogs", () => {
  const rot = resolve(import.meta.dirname, "..", "..");
  const kopplingar: KopplingPost[] = JSON.parse(readFileSync(resolve(rot, "data/kopplingar.json"), "utf8"));
  const saknar = kopplingar
    .filter((k) => k.status === "aktiv" && avslagsbeslut(k.bevis?.citat ?? ""))
    .filter((k) => (k.avslaget ?? []).length === 0 || (k.avslaget ?? []).some((a) => !a.lydelse || !a.motion));
  assert.deepEqual(
    saknar.map((k) => k.id),
    [],
    "Kör `npm run avslag-backfill -- --skriv` — fältet hämtas ur motionernas yrkandelistor, det skrivs aldrig för hand.",
  );
});
