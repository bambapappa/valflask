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
 * RÄTTELSELOGGEN GÅR SAMMA VÄG, med ett undantag som är avsiktligt. Fältet
 * `affects` SKA bära id:t — det är maskinläsbart just för att en rättelse ska
 * gå att koppla till sitt löfte, och det står ovanför prosan på rättelsesidan,
 * så uppgiften går inte förlorad när den lyfts ur texten. Undantaget gäller
 * bara det fältet; `what` och `why` är prosa och läses som prosa.
 *
 * VAD DET INTE FÅNGAR: annan intern jargong i samma fält. «4× outlier»,
 * «cross-party» och hänvisningar till regelnummer städades bara där en mening
 * ändå skrevs om, och det var ingen systematisk genomgång.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INTERN_BETECKNING } from "../src/publicerad-text.ts";

const DATA = resolve(import.meta.dirname, "../../data");

// Regeln bor i src/publicerad-text.ts och kopieras inte hit: den ska gälla
// FÖRE publiceringen också, och två kopior glider isär. Se modulens huvud.
const INTERN = INTERN_BETECKNING;

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

  it("rättelseloggens prosa bär dem inte heller", () => {
    const poster = JSON.parse(readFileSync(resolve(DATA, "rattelser.json"), "utf8")) as Array<{
      date: string;
      affects: string;
      what?: string;
      why?: string;
    }>;
    const fynd: string[] = [];
    for (const post of poster) {
      // `affects` är undantaget: id:t där är avsiktligt maskinläsbart och står
      // ovanför prosan på rättelsesidan, så uppgiften finns kvar för den som
      // vill slå upp exakt vilka löften en rättelse rörde.
      for (const [falt, text] of [["what", post.what ?? ""], ["why", post.why ?? ""]] as const) {
        for (const träff of text.match(INTERN) ?? []) {
          fynd.push(`${post.date} ${falt}: «${träff}»`);
        }
      }
    }
    assert.deepEqual(fynd, [], `Skriv ut vilket löfte som avses.\n${fynd.join("\n")}`);
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
      "Tidigare belopp per år: p-0411 600 mkr, p-0089 300 mkr.",
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
      // Fällde tidigare på ett gruppnamn som aldrig stod där: bokstavsföljden
      // «g-inlämning» finns inuti «gång-inlämning». Mätt på p-2026-0908
      // 2026-08-17, som pekades ut för något den inte gjort.
      "Löfte om 'en gång-inlämning' mellan myndigheter kräver systemintegration och gemensamma gränssnitt.",
      "Uppgifterna lämnas en gång-inlämning per år, inte fyra.",
    ];
    for (const rad of skaPassera) {
      assert.equal(rad.match(INTERN), null, `borde passera: ${rad}`);
    }
  });
});
