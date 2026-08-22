/**
 * Skriver en sitemap för Handlingsvågens sidor efter bygget.
 *
 * Fläskvågens sitemap byggs ur dess egen data och känner inte till sidorna
 * under /handlingsvagen. Utan den här filen skulle tredje vågen bara hittas
 * genom länkar — den vore läsbar men osynlig för sökmotorerna, vilket är
 * halva poängen med att lansera den.
 *
 * Källan är den byggda utdatan: varje index.html under dist/ är en sida.
 * Då kan listan inte glida ifrån vad som faktiskt publiceras.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { svenskDag } from "../../../pipeline/src/dagen.ts";

const SITE = "https://utlovat.se";
const BAS = "/handlingsvagen";
const dist = resolve(import.meta.dirname, "../dist");

function sidor(dir: string, prefix = ""): string[] {
  const ut: string[] = [];
  for (const post of readdirSync(dir)) {
    const full = join(dir, post);
    if (statSync(full).isDirectory()) {
      // API-svaren är maskindata, inte sidor att indexera.
      if (post === "api" || post === "_astro") continue;
      ut.push(...sidor(full, `${prefix}/${post}`));
    } else if (post === "index.html") {
      ut.push(prefix === "" ? "/" : `${prefix}/`);
    }
  }
  return ut;
}

const adresser = sidor(dist).sort();
const idag = svenskDag();
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...adresser.map(
    (a) => `  <url><loc>${SITE}${BAS}${a === "/" ? "/" : a}</loc><lastmod>${idag}</lastmod></url>`,
  ),
  "</urlset>",
  "",
].join("\n");

writeFileSync(join(dist, "sitemap.xml"), xml);
console.log(`sitemap: ${adresser.length} sidor under ${BAS}`);
