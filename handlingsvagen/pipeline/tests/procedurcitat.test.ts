/**
 * Grinden mot beslutsformler utan upplysning. Regeln står i
 * `src/procedurcitat.ts`.
 *
 * Provet mäter tre saker, och det tredje är det som gör grinden värd att ha:
 * att den fäller ett tomt citat utan förklaring, att den släpper igenom ett
 * tomt citat vars motivering bär saken, och att den släpper igenom de citat
 * som namnger propositionen eller lagen.
 *
 * **Beståndet är grönt i dag och det är avsikten.** Grinden byggdes inte i
 * augusti med skälet att den hade fällt rätt data; det som saknades var
 * avgörandet i G5 och en mätning av vad de tomma citaten faktiskt är. De tre
 * som bär en tom formel är voteringspunkter där formeln ÄR beslutet, och deras
 * motiveringar förklarar vad de avslagna förslagen ville. Grinden finns för
 * nästa bevisbyte, inte för det som redan står.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  motiveringenForklarar,
  sakinnehallet,
  tomtProcedurcitat,
  utanUpplysning,
  type Procedurpost,
} from "../src/procedurcitat.ts";

const KOPPLINGAR = resolve(import.meta.dirname, "../../data/kopplingar.json");

describe("tomtProcedurcitat", () => {
  it("fäller en avslagslista som bara bär nummer och namn", () => {
    assert.ok(
      tomtProcedurcitat(
        "Riksdagen avslår motionerna 2024/25:442 av Serkan Köse (S), 2024/25:1774 av " +
          "Mats Berglund m.fl. (MP) yrkande 44 och 2024/25:3110 av Lawen Redar m.fl. (S) yrkande 60.",
      ),
    );
  });

  it("släpper igenom ett citat som namnger propositionen", () => {
    assert.equal(
      tomtProcedurcitat("Riksdagen avslår proposition 2023/24:158 Ändrad åldersgräns för avgiftsfri tandvård"),
      false,
    );
  });

  it("släpper igenom ett citat som namnger vad lagen gäller", () => {
    assert.equal(
      tomtProcedurcitat("Riksdagen antar regeringens förslag till 1. lag om fritidskort, 2. lag om E-hälsomyndighetens behandling av personuppgifter."),
      false,
    );
  });

  it("släpper igenom ett anslagsyrkande som namnger utgiftsområdet", () => {
    assert.equal(
      tomtProcedurcitat(
        "Riksdagen anvisar anslagen för 2024 inom utgiftsområde 12 Ekonomisk trygghet för familjer och barn enligt förslaget i tabell A i motionen.",
      ),
      false,
    );
  });

  it("rör inte ett citat som inte är en beslutsformel", () => {
    assert.equal(tomtProcedurcitat("Vi vill höja barnbidraget med 200 kronor."), false);
    assert.equal(tomtProcedurcitat(""), false);
  });

  it("sakinnehållet stryker hänvisningar men behåller sakord", () => {
    assert.equal(sakinnehallet("Riksdagen avslår motionerna 2024/25:442 av Serkan Köse (S)."), "");
    assert.match(sakinnehallet("Riksdagen avslår proposition 2023/24:158 Ändrad åldersgräns för avgiftsfri tandvård"), /åldersgräns/u);
  });
});

describe("motiveringenForklarar", () => {
  it("godtar en motivering som säger vad beslutet innebär", () => {
    assert.ok(
      motiveringenForklarar(
        "Ett ja till utskottets förslag innebär att riksdagen avslår motioner som vill värna " +
          "public services oberoende, vilket går emot löftet.",
      ),
    );
  });

  it("underkänner en motivering som bara upprepar formeln", () => {
    assert.equal(motiveringenForklarar("Riksdagen avslog motionerna vid voteringen den dagen."), false);
  });

  it("underkänner en för kort motivering", () => {
    assert.equal(motiveringenForklarar("Avslag."), false);
    assert.equal(motiveringenForklarar(undefined), false);
  });
});

describe("grinden mot det incheckade datat", () => {
  const poster = JSON.parse(readFileSync(KOPPLINGAR, "utf8")) as Procedurpost[];

  it("hittar kopplingar att mäta", () => {
    // En tom lista över ett tomt register intygar ingenting.
    assert.ok(poster.filter((k) => k.status === "aktiv").length > 500);
  });

  it("ingen aktiv koppling bär en tom formel utan förklaring", () => {
    const brott = utanUpplysning(poster);
    assert.deepEqual(
      brott,
      [],
      "Ett citat som bara säger att riksdagen avslog något, utan att säga vad, visar läsaren\n" +
        "ett beslut utan innehåll. Byt citatet, eller skriv i motiveringen vad de avslagna\n" +
        `förslagen ville. Brott: ${brott.join(", ")}`,
    );
  });

  it("provet biter mot ett infört fel", () => {
    // Utan det här ledet vore det gröna beståndet inget bevis: en grind som
    // aldrig fäller något är inte skild från en som inte mäter.
    const infort: Procedurpost[] = [
      ...poster,
      {
        id: "k-2026-9999",
        status: "aktiv",
        method_note: "Beviset byttes 2026-08-08 mot handlingens egen lydelse.",
        bevis: { citat: "Riksdagen avslår motionerna 2024/25:442 av Serkan Köse (S) yrkande 3." },
      },
    ];
    assert.deepEqual(utanUpplysning(infort), ["k-2026-9999"]);
  });

  it("de tre voteringspunkterna passerar på sina motiveringar", () => {
    // De bär en tom formel — en avslagspunkt har ingen annan text — men
    // motiveringen säger vad de avslagna förslagen ville. Faller någon av dem
    // har motiveringen skrivits om till något sämre.
    for (const id of ["k-2026-0021", "k-2026-0117", "k-2026-0118"]) {
      const k = poster.find((x) => x.id === id);
      if (!k) continue; // dras posten in är provet inte längre relevant för den
      assert.ok(tomtProcedurcitat(k.bevis?.citat ?? undefined), `${id} bär inte längre en tom formel`);
      assert.ok(motiveringenForklarar(k.method_note ?? undefined), `${id}: motiveringen förklarar inte längre`);
    }
  });
});
