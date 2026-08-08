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

/**
 * Regressionen på böjningen. Partiet som föreslår sitt eget tak skriver
 * «Riksdagen fastställer utgiftstaket …»; partiet som säger nej till
 * regeringens skriver «Riksdagen avslår regeringens förslag att fastställa
 * utgiftstaket …». Mönstret band en gång bara den första formen, och den andra
 * räknades som ett sakyrkande — alltså som ett yrkande som kan bära ett enskilt
 * löfte, fast det bara tar ställning till taket.
 *
 * Lydelserna nedan står ordagrant i Vänsterpartiets budgetmotioner HA021299
 * (2023) och HB022385 (2024). Det är de enda formerna beståndets 211
 * partimotioner rymmer, och de är alla ramverk.
 */
test("ett avslag på regeringens utgiftstak är ramverk, inte sak", () => {
  assert.equal(
    yrkandeslag(
      "Riksdagen avslår regeringens förslag att fastställa utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget till 1 825 miljarder kronor för 2025 (avsnitt 4.2 i propositionen).",
    ),
    "ramverk",
  );
  assert.equal(
    yrkandeslag(
      "Riksdagen avslår regeringens förslag att fastställa utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget till följd av tekniska justeringar och av finanspolitiska skäl till 1 665 miljarder kronor 2023 och 1 745 miljarder kronor 2024 och beslutar att upphäva det tidigare fastställda utgiftstaket för 2024 (avsnitt 4.2 i propositionen).",
    ),
    "ramverk",
  );
});

/**
 * Det är verbet som varierar, inte saken. Mönstret ska tåla formerna utan att
 * någon behöver räkna upp dem — det var uppräkningen som var felet.
 */
test("utgiftstaket känns igen oavsett vilken form verbet står i", () => {
  for (const form of ["fastställer", "fastställa", "fastställs", "fastställas"]) {
    assert.equal(
      yrkandeslag(`Riksdagen ${form} utgiftstaket för staten för 2026 enligt förslaget i motionen.`),
      "ramverk",
      form,
    );
  }
});

/**
 * Böjningen får inte dra med sig allt som nämner ett tak. Ett yrkande som
 * *säger något om* utgiftstaket utan att fastställa det är fortfarande ett
 * sakyrkande, och ska läsas.
 *
 * Lydelsen står ordagrant i motion HA021121 och är den enda i beståndets
 * 44 353 yrkanden som bär ramverkets ord utan att vara ramverk. Den vill skärpa
 * *reglerna för* taket — ett tillkännagivande, alltså något ett parti kan lova
 * och en läsare kan hålla det till.
 */
test("att nämna utgiftstaket räcker inte — mönstret kräver att taket sätts", () => {
  assert.equal(
    yrkandeslag(
      "Riksdagen ställer sig bakom det som anförs i motionen om att skärpa lagstiftningen för ändring av utgiftstaket och tillkännager detta för regeringen.",
    ),
    "sak",
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

/**
 * Motionen som visade felet: Vänsterpartiets budgetmotion för 2024 (HB022385).
 * Åtta yrkanden, alla om ramverket — men två av dem yrkar avslag på regeringens
 * utgiftstak, och de räknades som sakyrkanden. Hela motionen såg därför ut att
 * ha något att läsa, fast den bara tar ställning till budgetens ram.
 *
 * Skillnaden är inte akademisk: en ren ramverksmotion bär inget enskilt löfte
 * annat än genom skatteundantaget, och det undantaget kräver just det
 * inkomstberäkningsyrkande som yrkande 5 bär.
 */
test("en budgetmotion som yrkar avslag på regeringens tak är ändå bara ramverk", () => {
  const yrkanden = [
    "Riksdagen godkänner de riktlinjer för den ekonomiska politiken och budgetpolitiken som föreslås i motionen (avsnitt 6-19).",
    "Riksdagen avslår regeringens förslag att fastställa utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget, till följd av tekniska justeringar och av finanspolitiska skäl, till 1 747 miljarder kronor 2024 och 1 827 miljarder kronor 2025 och beslutar att upphäva det tidigare fastställda utgiftstaket för 2025 (avsnitt 4.2 i propositionen).",
    "Riksdagen avslår regeringens förslag att fastställa utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget till 1 866 miljarder kronor för 2026 (avsnitt 4.2 i propositionen).",
    "Riksdagen fastställer utgiftstaket för staten inklusive ålderspensionssystemet vid sidan av statens budget för 2024 enligt förslaget i tabell 16 avsnitt 21 i motionen.",
    "Riksdagen godkänner beräkningen av inkomsterna i statens budget för 2024 enligt förslaget i tabell 17 avsnitt 22 i motionen och ställer sig bakom det som anförs i motionen om att regeringen ska återkomma med lagförslag i överensstämmelse med denna beräkning och tillkännager detta för regeringen.",
    "Riksdagen godkänner den preliminära beräkningen av inkomster i statens budget för 2025 och 2026 enligt förslaget i tabell 18 avsnitt 22 i motionen som riktlinje för regeringens budgetarbete.",
    "Riksdagen beslutar om fördelning av utgifter på utgiftsområden för 2024 enligt förslaget i tabell 9 avsnitt 20 i motionen.",
    "Riksdagen godkänner den preliminära fördelningen av utgifter på utgiftsområden för 2025 och 2026 enligt förslaget i tabell 10 avsnitt 20 i motionen som riktlinje för regeringens budgetarbete.",
  ];
  assert.equal(motionensSlag(yrkanden), "bara_ramverk");
  assert.equal(bindandeInkomstberakning(yrkanden), true);
});

test("en motion utan yrkandelista säger det, i stället för att gissa", () => {
  assert.equal(motionensSlag([]), "inga_yrkanden");
});
