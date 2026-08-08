import { test } from "node:test";
import assert from "node:assert/strict";
import {
  yrkandeslag,
  motionensSlag,
  bindandeInkomstberakning,
} from "../src/yrkandeslag.ts";

/** Lydelserna nedan står ordagrant i riksdagens yrkandelistor. */

test("anslagsyrkandet känns igen oavsett hur tabellen pekas ut", () => {
  assert.equal(
    yrkandeslag(
      "Riksdagen anvisar anslagen för 2026 inom utgiftsområde 17 Kultur, medier, trossamfund och fritid enligt förslaget i tabell A i motionen.",
    ),
    "anslag",
  );
  assert.equal(
    yrkandeslag(
      "Riksdagen anvisar anslagen för 2026 inom utgiftsområde 9 Hälsovård, sjukvård och social omsorg enligt det förslag som framgår av tabell 1 i motionen.",
    ),
    "anslag",
  );
  assert.equal(
    yrkandeslag(
      "Riksdagen anvisar anslagen för 2025 inom utgiftsområde 9 Hälsovård, sjukvård och social omsorg med de ändringar i förhållande till regeringens förslag som framgår av tabell 1 i motionen.",
    ),
    "anslag",
  );
});

test("ramverkets tre former skiljs från anslagen", () => {
  assert.equal(
    yrkandeslag(
      "Riksdagen godkänner de riktlinjer för den ekonomiska politiken och budgetpolitiken som föreslås i motionen.",
    ),
    "ramverk",
  );
  assert.equal(
    yrkandeslag(
      "Riksdagen fastställer utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget för 2026–2028 enligt förslaget i tabell E i motionen.",
    ),
    "ramverk",
  );
  assert.equal(
    yrkandeslag(
      "Riksdagen beslutar om fördelning av utgifter på utgiftsområden och övriga utgifter för 2026 enligt förslaget i tabell A i motionen.",
    ),
    "ramverk",
  );
});

test("inkomstberäkningen är sitt eget slag — b-0039 behandlar den skilt", () => {
  assert.equal(
    yrkandeslag(
      "Riksdagen godkänner beräkningen av inkomsterna i statens budget för 2026 enligt förslaget i tabell C i motionen.",
    ),
    "inkomstberakning",
  );
});

test("lagförslagsledet är det som binder regeringen", () => {
  const bindande =
    "Riksdagen godkänner beräkningen av inkomsterna i statens budget för 2026 enligt förslaget i tabell C i motionen och ställer sig bakom det som anförs i motionen om att regeringen ska återkomma med lagförslag i överensstämmelse med denna beräkning och tillkännager detta för regeringen.";
  const bara_tabell =
    "Riksdagen godkänner beräkningen av inkomsterna i statens budget för 2026 enligt förslaget i tabell C i motionen.";
  assert.equal(bindandeInkomstberakning([bindande]), true);
  assert.equal(bindandeInkomstberakning([bara_tabell]), false, "en siffra i en tabell binder ingen");
});

test("sakyrkandet är allt som säger vad partiet vill i sak", () => {
  assert.equal(
    yrkandeslag(
      "Riksdagen ställer sig bakom det som anförs i motionen om att höja barnbidraget och tillkännager detta för regeringen.",
    ),
    "sak",
  );
  assert.equal(
    yrkandeslag("Riksdagen avslår proposition 2024/25:30 Sänkt skatt på bensin och diesel."),
    "sak",
  );
  assert.equal(
    yrkandeslag(
      "Riksdagen beslutar att 9 kap. 1 § patientlagen (2014:821) ska ha den lydelse som framgår av bilaga 1.",
    ),
    "sak",
  );
});

test("en anslagsmotion utan sakyrkanden är klass A", () => {
  assert.equal(
    motionensSlag([
      "Riksdagen anvisar anslagen för 2026 inom utgiftsområde 4 Rättsväsendet enligt förslaget i tabellen i motionen.",
    ]),
    "bara_anslag",
  );
});

test("en ramverksmotion utan anslagsyrkanden är klass B", () => {
  assert.equal(
    motionensSlag([
      "Riksdagen godkänner de riktlinjer för den ekonomiska politiken och budgetpolitiken som föreslås i motionen.",
      "Riksdagen fastställer utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget för 2026–2028 enligt förslaget i tabell E i motionen.",
      "Riksdagen godkänner beräkningen av inkomsterna i statens budget för 2026 enligt förslaget i tabell C i motionen.",
    ]),
    "bara_ramverk",
  );
});

/**
 * Det här är den avgörande ordningen. Motionen anvisar anslag OCH yrkar avslag
 * på ett bestämt regeringsförslag. Avslagsyrkandet kan bära ett löfte direkt,
 * så posten ska läsas och inte avgöras av en tabellrad. Mätt i beståndet gäller
 * det 13 kopplingar som annars hade behandlats mekaniskt.
 */
test("ett enda sakyrkande gör motionen till en läsning, inte en tabellkontroll", () => {
  assert.equal(
    motionensSlag([
      "Riksdagen anvisar anslagen för 2025 inom utgiftsområde 21 Energi enligt förslaget i tabellen i motionen.",
      "Riksdagen avslår regeringens förslag om att under 2025 ställa ut kreditgarantier för lån till investeringar i ny kärnkraft som inklusive tidigare utfärdade garantier uppgår till högst 400 000 000 000 kronor.",
    ]),
    "sakyrkanden",
  );
});

test("en motion utan yrkandelista säger det, i stället för att gissa", () => {
  assert.equal(motionensSlag([]), "inga_yrkanden");
});
