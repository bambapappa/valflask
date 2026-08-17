/**
 * Videokopiorna får aldrig glida ihop med de ordagranna arkivkopiorna.
 *
 * Citatgrinden säger att en arkivkopia godtas bara om citatet står ordagrant i
 * själva ögonblicksbilden. En film bär ingen text att pröva mot. Hamnar en
 * videoadress i `archive_url` ser löftet ut att ha ett ordagrant belägg det
 * inte har — och det är ett fel som ser ut som en förbättring, vilket är den
 * farligaste sorten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arVideokopia } from "../src/archive.ts";
import { arFilm, filmensAdress } from "../src/filmkallan.ts";

const DATA = join(import.meta.dirname, "../../data");
interface Lofte {
  id: string;
  status?: string;
  source: { url: string; archive_url: string | null; video_archive_url?: string | null };
}
const promises = JSON.parse(readFileSync(join(DATA, "promises.json"), "utf8")) as Lofte[];

test("ingen videokopia har smugit sig in i archive_url", () => {
  const fel = promises.filter((p) => arVideokopia(p.source.archive_url));
  assert.deepEqual(
    fel.map((p) => p.id),
    [],
    "archive_url ska bara bära kopior där citatet går att pröva ord för ord",
  );
});

test("video_archive_url sätts bara på filmkällor", () => {
  const fel = promises.filter((p) => p.source.video_archive_url && !arFilm(p.source.url));
  assert.deepEqual(fel.map((p) => p.id), [], "en webbsida ska ha en vanlig arkivkopia, inte en videokopia");
});

test("video_archive_url är alltid en videoadress", () => {
  const fel = promises.filter(
    (p) => p.source.video_archive_url && !arVideokopia(p.source.video_archive_url),
  );
  assert.deepEqual(fel.map((p) => p.id), [], "en sidkopia av YouTube-sidan är inte sändningen");
});

test("filmensAdress skalar bort tidsstämpeln — kopian gäller sändningen", () => {
  // Kö-posternas källor bär ofta &t=1180s. Söker vi på den adressen hittar vi
  // aldrig kopian, som ligger på sändningen.
  assert.equal(
    filmensAdress("https://youtube.com/watch?v=nzYmcPx0jJc&t=274s"),
    "https://www.youtube.com/watch?v=nzYmcPx0jJc",
  );
  assert.equal(
    filmensAdress("https://youtu.be/iwXT2XAad-w?t=90"),
    "https://www.youtube.com/watch?v=iwXT2XAad-w",
  );
  assert.equal(
    filmensAdress("https://www.youtube.com/watch?v=EHRLoIRh_EQ"),
    "https://www.youtube.com/watch?v=EHRLoIRh_EQ",
  );
});

test("arFilm känner igen båda adressformerna, och tar inte webbsidor", () => {
  assert.equal(arFilm("https://youtube.com/watch?v=x123456"), true);
  assert.equal(arFilm("https://youtu.be/x123456"), true);
  assert.equal(arFilm("https://kristdemokraterna.se/var-politik/pension"), false);
});
