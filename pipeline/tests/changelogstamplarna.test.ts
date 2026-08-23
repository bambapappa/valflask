/**
 * Inget verktyg får stämpla sin changelogpost med midnatt.
 *
 * Changelogens SISTA post bär det fingeravtryck sajten publicerar. En
 * midnattsstämpel sorterar före allt annat som skrivits samma dag, så en post
 * som skrevs sist hamnar först — och då publiceras fel hash.
 *
 * Felet fanns i två verktyg samtidigt och upptäcktes 2026-08-23, båda gångerna
 * av `fingeravtrycket.test.ts` efter att skadan var gjord. Det här provet
 * flyttar upptäckten dit felet skrivs: det sveper skriptkatalogen efter
 * `${datum}T00:00:00Z` i en `timestamp`.
 *
 * Provet är samma sorts svep som `dagen.test.ts`, av samma skäl: en regel som
 * bara står i en docstring travar inte till nästa verktyg.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SKRIPT = resolve(import.meta.dirname, "../scripts");
/** `timestamp:` följt av en mall som slutar på midnatt. */
const MIDNATT = /timestamp:\s*`\$\{[^}]+\}T00:00:00Z`/u;

describe("changelogstämplarna", () => {
  const filer = readdirSync(SKRIPT).filter((f) => f.endsWith(".mts"));

  it("hittar skript att mäta", () => {
    assert.ok(filer.length > 20, "en tom katalog intygar ingenting");
  });

  it("inget skript stämplar en changelogpost med midnatt", () => {
    const brott = filer.filter((f) => MIDNATT.test(readFileSync(join(SKRIPT, f), "utf8")));
    assert.deepEqual(
      brott,
      [],
      "Changelogens sista post bär fingeravtrycket sajten publicerar. En midnattsstämpel\n" +
        "sorterar före allt annat samma dag, så fel post hamnar sist. Använd\n" +
        `new Date().toISOString(). Brott: ${brott.join(", ")}`,
    );
  });

  it("provet biter mot ett infört fel", () => {
    // Utan det här ledet vore en grön katalog inget bevis.
    assert.ok(MIDNATT.test("  timestamp: `${datum}T00:00:00Z`,"));
    assert.equal(MIDNATT.test("  timestamp: new Date().toISOString(),"), false);
  });
});
