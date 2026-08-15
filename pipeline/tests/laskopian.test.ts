/**
 * Handlingsvågens läskopia mäts där löftena ändras.
 *
 * Kopian (`handlingsvagen/data/loften-index.json`) är härledd ur
 * `data/promises.json`. Ändras löftena utan att kopian skrivs om saknas de nya
 * löftena i rutnätet — och för läsaren ser ett löfte som saknas ut som ett
 * löfte partiet aldrig gett.
 *
 * **Kontrollen fanns redan, men på fel sida av huset.** Den ligger i
 * `handlingsvagen/pipeline/tests/vendorkopia.test.ts`, alltså i den svit en
 * session som bara rör Fläskvågen inte nödvändigtvis kör. Följden är mätt: när
 * två löften drogs tillbaka 2026-08-14 blev `main` röd, och tre PR:er slogs
 * ihop förbi den röda grinden innan någon tittade. Samma glidning hade hänt
 * två gånger tidigare, 7 och 9 augusti, och åtgärden var båda gångerna ett
 * åtagande att komma ihåg kommandot. Det glömdes båda gångerna.
 *
 * Provet här ändrar inte vad som mäts — det ändrar **vem som ser det**. Den
 * som rör `promises.json` kör den här sviten enligt arbetsordningen, och får
 * beskedet i samma andetag som ändringen i stället för på huvudgrenen efteråt.
 *
 * Logiken importeras ur Handlingsvågens modul, aldrig kopieras: två kopior av
 * en jämförelse glider isär tyst, och då mäter den ena något annat än den
 * andra.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  byggKopia,
  jamforKopia,
  arSamstammig,
  glidningstext,
  type LoftesradIKopian,
  type RaLoftesuppgift,
} from "../../handlingsvagen/pipeline/src/vendorkopia.ts";

const ROT = resolve(import.meta.dirname, "..", "..");

test("läskopian i Handlingsvågen följer Fläskvågens löften", () => {
  const incheckad: LoftesradIKopian[] = JSON.parse(
    readFileSync(resolve(ROT, "handlingsvagen", "data", "loften-index.json"), "utf8"),
  );
  const promises: RaLoftesuppgift[] = JSON.parse(
    readFileSync(resolve(ROT, "data", "promises.json"), "utf8"),
  );
  const glidning = jamforKopia(incheckad, byggKopia(promises));

  assert.ok(
    arSamstammig(glidning),
    `${glidningstext(glidning)}\n\n` +
      "  Du har ändrat löftena utan att skriva om Handlingsvågens läskopia.\n" +
      "  Kör, från handlingsvagen/pipeline:\n" +
      "    npm run vendor -- --promises ../../data/promises.json --parties ../../data/parties.json\n" +
      "    npm run domar  -- --promises ../../data/promises.json\n\n" +
      "  Ändrar omräkningen ett utslag i domar.json är det något en läsare sett,\n" +
      "  och då krävs rättelsenot och post i data/rattelser.json — inte en tyst\n" +
      "  omräkning. Står domarna stilla är det bara en resynk av en härledd fil.",
  );
});
