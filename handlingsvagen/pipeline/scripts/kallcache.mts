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

const rot = resolve(import.meta.dirname, "../..");
const cacheDir = resolve(rot, "data/.kallcache");

/** Fördröjd hämtning — riksdagens öppna data ska inte hamras. */
export const politeFetch: HttpFetch = async (url) => {
  await new Promise((r) => setTimeout(r, 200));
  return fetch(url);
};

/** Hämtar en gång per nyckel, sedan ur cachen. null = hämtningen föll. */
export async function cachat<T>(nyckel: string, hamta: () => Promise<T>): Promise<T | null> {
  if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  const fil = resolve(cacheDir, `${nyckel.replace(/[^A-Za-z0-9_.-]/gu, "_")}.json`);
  if (existsSync(fil)) return JSON.parse(readFileSync(fil, "utf8")) as T;
  try {
    const v = await hamta();
    writeFileSync(fil, JSON.stringify(v));
    return v;
  } catch (e) {
    console.error(`  hämtning misslyckades (${nyckel}): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
