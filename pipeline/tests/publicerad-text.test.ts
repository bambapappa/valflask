/**
 * Interna beteckningar hör inte hemma i text som möter läsaren.
 *
 * VARFÖR: `p-2026-0344`:s metodnot pekade ut vilka andra löften kostnaden
 * räknas på — med `p-2026-0358` och `p-2026-0360`, nummer som inte säger en
 * utomstående någonting. Både metodnoten, uträkningen och historiken renderas
 * på löftessidan och ligger i det publika API:et.
 *
 * Det var inte en enstaka slarvpost. Svepet 2026-08-14 fann **119
 * löftesnummer och 10 gruppnamn i 60 aktiva löften**. Regeln fanns hela tiden
 * — `CLAUDE.md` säger att interna koder aldrig får synas i text som möter
 * läsare — och `p-2026-0358`:s egen historik visar att just det felet rättades
 * där redan 2026-07-27. Regeln var alltså känd, tillämpad en gång, och åldrades
 * sedan. En språkregel utan grind är en påminnelse.
 *
 * Det andra skälet är att texten blir **osann** och inte bara obegriplig: ett
 * av numren pekade på ett löfte som samma dag gick till noll. Ju fler
 * hänvisningar med nummer, desto fler meningar som tyst slutar stämma när ett
 * belopp rör sig.
 *
 * VAD DET INTE FÅNGAR: `data/rattelser.json`. Sexton rättelseposter bär ett
 * löftesnummer i sin prosa och två bär ett gruppnamn. Rättelseloggen är den
 * offentliga redogörelsen för våra egna fel, och att skriva om den är ett
 * eget beslut — det ligger som en egen rad i åtgärdslistan. Fältet `affects`
 * SKA bära id:t: det är avsiktligt maskinläsbart, så att en post går att koppla
 * till sitt löfte, och det undantaget gäller bara det fältet.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(import.meta.dirname, "../../data");

/** Ett löftesnummer eller ett gruppnamn — de två beteckningar datat använder internt. */
const INTERN = /p-2026-\d{4}|g-[a-zåäö0-9-]{4,}/giu;

interface Lofte {
  id: string;
  status?: string;
  cost: { calculation?: string; method_note?: string };
  history: Array<{ change?: string }>;
}

/** Fälten som renderas på löftessidan och ligger i det publika API:et. */
function laserstext(p: Lofte): Array<[string, string]> {
  return [
    ["cost.calculation", p.cost.calculation ?? ""],
    ["cost.method_note", p.cost.method_note ?? ""],
    ...p.history.map((h, i): [string, string] => [`history[${i}].change`, h.change ?? ""]),
  ];
}

describe("text som möter läsaren", () => {
  it("bär inga interna löftesnummer eller gruppnamn", () => {
    const loften = JSON.parse(readFileSync(resolve(DATA, "promises.json"), "utf8")) as Lofte[];
    const fynd: string[] = [];
    for (const p of loften.filter((x) => x.status === "aktiv")) {
      for (const [falt, text] of laserstext(p)) {
        for (const träff of text.match(INTERN) ?? []) {
          fynd.push(`${p.id} ${falt}: «${träff}»`);
        }
      }
    }
    assert.deepEqual(
      fynd,
      [],
      `Skriv hänvisningen så att en läsare förstår den — «partiets löfte om ett ` +
        `sektorsbidrag för skolans personal», inte numret.\n${fynd.join("\n")}`,
    );
  });

  /**
   * Provet ska falla mot ett fel som verkligen begåtts. Raderna nedan är
   * ordagrant sådana som stod i datat före svepet.
   */
  it("faller mot de formuleringar som faktiskt stod där", () => {
    const skaFallas = [
      "Ett brett inriktningslöfte vars prissättbara delar redan är egna C-löften (fler lärare p-2026-0358, rätt stöd p-2026-0360).",
      "Kopplad till gruppen g-c-skattereform-grundlon.",
      "Jämförbart löfte p-2026-0475 estimerat 0 msek/år.",
    ];
    for (const rad of skaFallas) {
      assert.notEqual(rad.match(INTERN), null, `borde fällas: ${rad}`);
    }
  });

  it("släpper igenom en hänvisning skriven för läsaren", () => {
    const skaPassera = [
      "Delarna ligger på partiets egna löften om ett sektorsbidrag för skolans personal och om rätt till stöd utan diagnoskrav.",
      "Samma politik som Moderaternas och Liberalernas löften om slopad mängdrabatt, som båda står på 650 miljoner kronor per år.",
      "Beloppet är 4 000 miljoner kronor per år och kommer ur partiets egen budget för 2025–2027.",
    ];
    for (const rad of skaPassera) {
      assert.equal(rad.match(INTERN), null, `borde passera: ${rad}`);
    }
  });
});
