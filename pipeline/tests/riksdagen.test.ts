import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDokumentLista, parseVoteringLista } from "../src/riksdagen.ts";
import {
  berikaPartier,
  klassaMotionstyp,
  normaliseraDokument,
  normaliseraVoteringar,
  mergeHandlingar,
  type Handling,
} from "../src/handlingar.ts";

/** Fixtur formad exakt som riktiga dokumentlista-svar (kontrollerad 2026-07-19). */
const dokPayload = {
  dokumentlista: {
    "@traffar": "2",
    "@sida": "1",
    "@nasta_sida": "http://data.riksdagen.se/dokumentlista/?sz=2&p=2",
    dokument: [
      {
        dok_id: "HD024234",
        doktyp: "mot",
        rm: "2025/26",
        datum: "2026-07-15 00:00:00",
        titel: "med anledning av prop. 2025/26:293",
        undertitel: "av Lorena Delgado Varas m.fl. (V)",
        dokintressent: {
          intressent: [
            { roll: "undertecknare", namn: "Lorena Delgado Varas", partibet: "-", intressent_id: "0852475703226" },
            { roll: "undertecknare", namn: "Malcolm Momodou Jallow", partibet: "-", intressent_id: "0254695027922" },
          ],
        },
      },
      {
        dok_id: "HD024111",
        doktyp: "mot",
        rm: "2025/26",
        datum: "2026-06-01 00:00:00",
        titel: "En enskild motion",
        undertitel: "av Anna Aldstam (M)",
        dokintressent: {
          intressent: { roll: "undertecknare", namn: "Anna Aldstam", partibet: "M", intressent_id: "999" },
        },
      },
    ],
  },
};

const votPayload = {
  voteringlista: {
    votering: [
      { votering_id: "V-9", rm: "2025/26", beteckning: "AU10", punkt: "3", namn: "K Forslund", intressent_id: "025", parti: "S", valkrets: "VGV", rost: "Ja", avser: "sakfrågan", systemdatum: "2026-03-12 16:01:33" },
      { votering_id: "V-9", rm: "2025/26", beteckning: "AU10", punkt: "3", namn: "S Svan", intressent_id: "028", parti: "S", valkrets: "AB", rost: "Ja", avser: "sakfrågan", systemdatum: "2026-03-12 16:01:33" },
      { votering_id: "V-9", rm: "2025/26", beteckning: "AU10", punkt: "3", namn: "M Molin", intressent_id: "026", parti: "M", valkrets: "AB", rost: "Nej", avser: "sakfrågan", systemdatum: "2026-03-12 16:01:33" },
      { votering_id: "V-9", rm: "2025/26", beteckning: "AU10", punkt: "3", namn: "F Frisk", intressent_id: "027", parti: "M", valkrets: "AB", rost: "Frånvarande", avser: "sakfrågan", systemdatum: "2026-03-12 16:01:33" },
    ],
  },
};

test("parseDokumentLista: fält, datumtrimning, enstaka intressent blir lista, nästa sida", () => {
  const { dokument, nextUrl } = parseDokumentLista(dokPayload);
  assert.equal(dokument.length, 2);
  assert.equal(dokument[0]!.datum, "2026-07-15");
  assert.equal(dokument[0]!.intressenter.length, 2);
  assert.equal(dokument[1]!.intressenter.length, 1);
  assert.equal(dokument[1]!.intressenter[0]!.partibet, "m");
  assert.ok(nextUrl?.includes("p=2"));
});

test("berikaPartier slår upp '-' via ledamotsregistret", () => {
  const { dokument } = parseDokumentLista(dokPayload);
  const enriched = berikaPartier(dokument[0]!, new Map([["0852475703226", "v"], ["0254695027922", "v"]]));
  assert.deepEqual(enriched.intressenter.map((i) => i.partibet), ["v", "v"]);
});

test("klassaMotionstyp: flera undertecknare eller 'm.fl.' → kommitté, annars enskild", () => {
  const { dokument } = parseDokumentLista(dokPayload);
  assert.equal(klassaMotionstyp(dokument[0]!), "kommitte");
  assert.equal(klassaMotionstyp(dokument[1]!), "enskild");
});

test("normaliseraDokument + mergeHandlingar: deterministiska id, idempotent", () => {
  const { dokument } = parseDokumentLista(dokPayload);
  const norm = dokument.map((d) => normaliseraDokument(d)!);
  const first = mergeHandlingar([], norm, 2026);
  assert.deepEqual(first.map((h) => h.id), ["h-2026-0001", "h-2026-0002"]);
  assert.equal(first[0]!.dok_id, "HD024111"); // äldst först — deterministisk ordning
  const again = mergeHandlingar(first, norm, 2026);
  assert.equal(again.length, 2); // ingen dubblett vid omkörning
});

test("parseVoteringLista + normaliseraVoteringar: aggregat per parti, frånvaro separat", () => {
  const rader = parseVoteringLista(votPayload);
  const [h] = normaliseraVoteringar(rader);
  assert.ok(h);
  assert.equal(h.kind, "votering");
  assert.equal(h.punkt, 3);
  assert.deepEqual(h.rostfordelning!["s"], { ja: 2, nej: 0, avstar: 0, franvarande: 0 });
  assert.deepEqual(h.rostfordelning!["m"], { ja: 0, nej: 1, avstar: 0, franvarande: 1 });
  assert.equal(h.utfall, "bifall");
  assert.equal(h.datum, "2026-03-12");
});

test("mergeHandlingar skiljer voteringspunkter åt", () => {
  const rader = parseVoteringLista(votPayload);
  const norm = normaliseraVoteringar(rader);
  const other = norm.map((h) => ({ ...h, punkt: 4 }));
  const merged = mergeHandlingar(mergeHandlingar([] as Handling[], norm, 2026), other, 2026);
  assert.equal(merged.length, 2);
});
