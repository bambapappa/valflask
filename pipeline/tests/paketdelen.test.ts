/**
 * En paketdel är inte en dubblett.
 *
 * Citatkollen flaggar också DELMÄNGDER: ligger det ena citatet ordagrant inne i
 * det andra räknas det som samma yttrande — men bara när det korta utgör minst
 * hälften av det långa. Gränsen är inte kosmetisk, och den är mätt på
 * publicerat data:
 *
 *   · `p-2026-2312` «Förbättra klimakterierådgivningen.» ligger inne i
 *     `p-2026-4191`, som räknar upp fyra åtgärder. Delmängden är 0,125 — alltså
 *     en **paketdel**. Att flagga den som dubblett vore att slå ihop ett
 *     delåtagande med sitt paket, och de bär 40 respektive 100 mkr.
 *   · LSS-paret `p-2026-3869` / `p-2026-3874` bär exakt samma citat, ordagrant.
 *     Det ÄR en dubblett, och kollen ska hitta den.
 *
 * Provet mäter mot de verkliga posterna i `data/promises.json`, inte mot
 * fixturer skrivna ur samma antagande som koden.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findQuoteDuplicate, type ExistingPromiseLite } from "../src/similarity.ts";

const REPO = join(import.meta.dirname, "../..");
const promises = JSON.parse(readFileSync(join(REPO, "data/promises.json"), "utf8")) as Array<{
  id: string; title: string; parties: string[]; category: string;
  group_id: string | null; quote: string; status: string;
}>;

function lofte(id: string): ExistingPromiseLite & { quote: string } {
  const p = promises.find((q) => q.id === id);
  assert.ok(p, `provet behöver det publicerade löftet ${id}`);
  return {
    id: p.id, title: p.title, parties: p.parties, category: p.category,
    group_id: p.group_id, quote: p.quote, status: p.status,
  };
}

describe("citatkollen skiljer paketdel från dubblett", () => {
  // FÄLLS AV: att ta bort delmängdskravet (`kort.length >= lang.length * 0.5`).
  // Då blir varje kort åtagande en dubblett av varje paket det ingår i.
  test("ett delåtagande i ett paket flaggas inte som dubblett", () => {
    const del = lofte("p-2026-2312");
    const paket = lofte("p-2026-4191");
    // Delen ligger verkligen inne i paketet — annars mäter provet inget.
    const rensa = (s: string) => s.toLowerCase().replace(/[^a-z0-9åäöéèü]+/gu, "");
    assert.ok(rensa(paket.quote).includes(rensa(del.quote)), "delen ska ligga inne i paketet");
    assert.ok(rensa(del.quote).length < rensa(paket.quote).length * 0.5, "och vara mindre än hälften");

    assert.equal(findQuoteDuplicate({ quote: del.quote }, [paket]), null);
    assert.equal(findQuoteDuplicate({ quote: paket.quote }, [del]), null);
  });

  // Kontrollprov: utan det kan provet ovan vara grönt för att kollen aldrig
  // hittar något.
  test("ordagrant samma citat flaggas fortfarande", () => {
    const a = lofte("p-2026-3869");
    const b = lofte("p-2026-3874");
    assert.equal(a.quote, b.quote, "LSS-paret bär samma citat");
    assert.equal(findQuoteDuplicate({ quote: a.quote }, [b])?.id, b.id);
  });

  // Gränsen, skriven ut: över hälften flaggas, och då är det människan som
  // avgör om det är en omskörd eller ett paket med ett dominerande åtagande.
  test("en delmängd över hälften flaggas — och är en läsning, inte ett svar", () => {
    const kort = lofte("p-2026-0128");
    const lang = lofte("p-2026-0615");
    const rensa = (s: string) => s.toLowerCase().replace(/[^a-z0-9åäöéèü]+/gu, "");
    const andel = rensa(kort.quote).length / rensa(lang.quote).length;
    assert.ok(andel > 0.5 && andel < 1, `delmängden ska ligga över hälften: ${andel}`);
    assert.equal(findQuoteDuplicate({ quote: kort.quote }, [lang])?.id, lang.id);
    // Båda ligger redan i samma grupp — människan har alltså avgjort saken.
    assert.equal(kort.group_id, lang.group_id);
    assert.ok(kort.group_id, "och gruppen finns");
  });
});
