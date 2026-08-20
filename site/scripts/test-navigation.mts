import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rot = resolve(import.meta.dirname, "../..");
const las = (path: string) => readFileSync(resolve(rot, path), "utf8");

const start = las("site/dist/index.html");
const sok = las("site/dist/sok/index.html");
const sidhuvud = las("site/src/components/SiteHeader.astro");
const sidfot = las("site/src/components/SiteFooter.astro");
const hvLayout = las("handlingsvagen/site/src/layouts/Layout.astro");
const hvAmnen = las("handlingsvagen/site/src/pages/amnen.astro");
const bas = las("site/src/styles/base.css");

assert.match(start, /Tre sätt att granska politiken/);
assert.match(start, /<h1[^>]*>Tre sätt att granska politiken<\/h1>/);
for (const adress of ["/fragor", "/handlingsvagen/", "/sok"]) {
  assert.ok(start.includes(`href=\"${adress}\"`), `startsidan länkar ${adress}`);
}
for (const spel of ["valtris.utlovat.se", "rostfiske.utlovat.se"]) {
  assert.ok(start.includes(spel), `starten länkar ${spel}`);
  assert.ok(sidfot.includes(spel), `sidfoten länkar ${spel}`);
  assert.ok(hvLayout.includes(spel), `Handlingsvågens sidfot länkar ${spel}`);
}
assert.match(sok, /Den här sökningen läser inte hela riksdagens dokument/);
assert.match(sok, /NPF/);
assert.match(hvAmnen, /annan sökning än/);
assert.match(hvAmnen, /ord inne i riksdagens dokument/);
assert.match(sidhuvud, /aria-current/);
assert.match(hvLayout, /aria-current/);
assert.match(bas, /min-height:\s*44px/);
assert.match(bas, /overflow-wrap:\s*break-word/);

console.log("navigation: startsida, sökomfång, spel och tillgänglighetsankare är gröna");
