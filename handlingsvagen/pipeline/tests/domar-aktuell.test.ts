/**
 * Vaktar att den incheckade data/domar.json stämmer med kopplingarna den
 * påstås vara räknad ur.
 *
 * Bakgrund: skriptets dokumentation sade att "en incheckad dom utan
 * motsvarande kopplingar är ett testfel" — men testet fanns inte. Följden var
 * att domfilen låg kvar från 2026-07-25 medan kopplingarna fylldes på: sajten
 * visade utslag för 55 av 150 löften, och de övriga 95 stod som "ingen
 * handling ännu" trots godkända handlingar. Bygget var grönt hela tiden,
 * eftersom ingenting jämförde filen med en omräkning.
 *
 * Testet räknar om ur exakt samma inläsning som skrivvägen använder och
 * jämför. Fältet `genererad` är ett datum och jämförs inte — det säger när
 * skriptet kördes, inte vad det räknade fram.
 *
 * Faller testet: kör
 *   npm run vendor -- --promises ../../data/promises.json --parties ../../data/parties.json
 *   npm run domar  -- --promises ../../data/promises.json
 * och committa resultatet. Ändrar omräkningen vad en läsare redan sett är det
 * en synlig rättelse — rättelsenot och post i data/rattelser.json, aldrig en
 * tyst omräkning.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { beraknaDomar } from "../src/domar-bygg.ts";

const ROT = resolve(import.meta.dirname, "..", "..");
const PROMISES = resolve(ROT, "..", "data", "promises.json");
const DOMAR = resolve(ROT, "data", "domar.json");

test("den incheckade domfilen är omräknad ur dagens kopplingar", () => {
  // Vendorade parties.json krävs för att partiuniversumet ska bli alla åtta;
  // saknas den räknar beraknaDomar på målens egna partier och jämförelsen
  // skulle mäta fel sak. Då är det bygget som är trasigt, inte datat.
  assert.ok(
    existsSync(resolve(ROT, "data", "parties.json")),
    "data/parties.json saknas — kör npm run vendor före testet",
  );

  const incheckad = JSON.parse(readFileSync(DOMAR, "utf8")) as {
    genererad: string;
    partidomar: unknown[];
    ledamotsmeriter: unknown[];
  };
  const omraknad = beraknaDomar(ROT, PROMISES);

  assert.equal(
    incheckad.partidomar.length,
    omraknad.partidomar.length,
    `domar.json bär ${incheckad.partidomar.length} partidomar men kopplingarna ger ${omraknad.partidomar.length} — räkna om och committa (se filhuvudet)`,
  );
  assert.equal(
    incheckad.ledamotsmeriter.length,
    omraknad.ledamotsmeriter.length,
    `domar.json bär ${incheckad.ledamotsmeriter.length} ledamotsmeriter men kopplingarna ger ${omraknad.ledamotsmeriter.length} — räkna om och committa (se filhuvudet)`,
  );

  // Antalen kan stämma medan innehållet glidit — ett utslag som vänt från
  // "i linje" till "både och" ändrar ingen längd. Därför jämförs allt.
  assert.deepEqual(
    incheckad.partidomar,
    omraknad.partidomar,
    "partidomarna i domar.json skiljer sig från en omräkning — räkna om och committa (se filhuvudet)",
  );
  assert.deepEqual(
    incheckad.ledamotsmeriter,
    omraknad.ledamotsmeriter,
    "ledamotsmeriterna i domar.json skiljer sig från en omräkning — räkna om och committa (se filhuvudet)",
  );
});
