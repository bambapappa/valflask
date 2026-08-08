/**
 * Hämtning mot riksdagen med lokal cache — delad av skripten som behöver
 * källdokumentens text.
 *
 * Cachen ligger i data/.kallcache/ och är inte versionshanterad. Den finns
 * för att en omkörning inte ska fråga riksdagen om samma dokument igen;
 * innehållet är alltid hämtat, aldrig konstruerat.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { HttpFetch } from "../src/riksdagen.ts";
import { arSvarsobjekt } from "../src/kallcachegrind.ts";

const rot = resolve(import.meta.dirname, "../..");
const cacheDir = resolve(rot, "data/.kallcache");

/** Fördröjd hämtning — riksdagens öppna data ska inte hamras. */
export const politeFetch: HttpFetch = async (url) => {
  await new Promise((r) => setTimeout(r, 200));
  return fetch(url);
};

/**
 * Svarets kropp som JSON.
 *
 * Finns för att `politeFetch` lämnar ett **svarsobjekt** och inte data. Den som
 * lägger svaret rakt i cachen får en tom post: ett svarsobjekt har inga egna
 * fält, så det serialiseras till `{}` och hämtningen ser ut att ha lyckats med
 * ingenting i. Kroppen ska läsas här, en gång, av alla som behöver den.
 */
export async function hamtaJson(url: string): Promise<unknown> {
  const svar = await politeFetch(url);
  if (svar.status !== 200) throw new Error(`${url} svarade ${svar.status}`);
  return JSON.parse(await svar.text()) as unknown;
}

/** Hämtar en gång per nyckel, sedan ur cachen. null = hämtningen föll. */
export async function cachat<T>(nyckel: string, hamta: () => Promise<T>): Promise<T | null> {
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const fil = resolve(cacheDir, `${nyckel.replace(/[^A-Za-z0-9_.-]/gu, "_")}.json`);
  if (existsSync(fil)) return JSON.parse(readFileSync(fil, "utf8")) as T;
  try {
    const v = await hamta();
    // Ett svarsobjekt är inte data. Skrivs det i cachen blir posten `{}`, och
    // nästa körning läser den tomma posten som ett hämtat dokument utan att
    // fråga riksdagen igen — en hämtning som aldrig skett ser då ut som ett
    // dokument utan innehåll. Det har kostat: verktyget som skulle avgöra
    // anslagsmotionerna kunde inte hämta någonting alls i sitt incheckade
    // skick, och felet syntes inte som ett nätfel utan som «ingen dokumenttext».
    if (arSvarsobjekt(v)) {
      throw new Error(
        `${nyckel}: hämtningen lämnade ett svarsobjekt i stället för data. ` +
          "Läs kroppen först — hamtaJson() gör det.",
      );
    }
    writeFileSync(fil, JSON.stringify(v));
    return v;
  } catch (e) {
    console.error(`  hämtning misslyckades (${nyckel}): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
