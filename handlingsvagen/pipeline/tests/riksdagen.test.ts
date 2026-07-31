import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUtskottspunkter, parseDokumentLista, parseVotering, parseVoteringLista, type HttpFetch } from "../src/riksdagen.ts";
import {
  berikaPartier,
  motionstypAvSubtyp,
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

test("motionstypAvSubtyp mappar riksdagens klassning, okänt → undefined", () => {
  assert.equal(motionstypAvSubtyp("Enskild motion"), "enskild");
  assert.equal(motionstypAvSubtyp("Kommittémotion"), "kommitte");
  assert.equal(motionstypAvSubtyp("Partimotion"), "parti");
  assert.equal(motionstypAvSubtyp(""), undefined); // utgången motion m.m.
  assert.equal(motionstypAvSubtyp(undefined), undefined);
});

test("normaliseraDokument sätter motionstyp ur subtyp, aldrig ur gissning", () => {
  const { dokument } = parseDokumentLista(dokPayload);
  // Fixturen saknar subtyp → motionstyp osatt (ingen gissning ur antal namn).
  assert.equal(normaliseraDokument(dokument[0]!)!.motionstyp, undefined);
  const medSubtyp = { ...dokument[1]!, subtyp: "Enskild motion" };
  assert.equal(normaliseraDokument(medSubtyp)!.motionstyp, "enskild");
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

/** Fixtur formad exakt som riktiga /votering/<id>/json-svar (kontrollerad 2026-07-19). */
const enVoteringPayload = {
  votering: {
    dokument: { dok_id: "HA01UU15", rm: "2022/23", beteckning: "UU15" },
    dokvotering: {
      votering: [
        { dok_id: "HA01UU15", votering_id: "008484EA", punkt: "5", namn: "Kenneth G Forslund", intressent_id: "0257612529618", parti: "S", valkrets: "Västra Götalands läns västra", rost: "Ja", avser: "sakfrågan", votering: "huvud", rm: "2022/23", beteckning: "UU15", datum: "2023-05-10 00:00:00", systemdatum: "2023-05-10 16:08:12" },
        { dok_id: "HA01UU15", votering_id: "008484EA", punkt: "5", namn: "M Molin", intressent_id: "026", parti: "M", valkrets: "AB", rost: "Nej", avser: "sakfrågan", votering: "huvud", rm: "2022/23", beteckning: "UU15", datum: "2023-05-10 00:00:00", systemdatum: "2023-05-10 16:08:12" },
      ],
    },
  },
};

test("parseVotering: /votering/<id>-rader → radformat med gemener och taltyper", () => {
  const rader = parseVotering(enVoteringPayload);
  assert.equal(rader.length, 2);
  assert.equal(rader[0]!.parti, "s");
  assert.equal(rader[0]!.punkt, 5);
  assert.equal(rader[0]!.datum, "2023-05-10");
  assert.equal(rader[0]!.beteckning, "UU15");
  const [h] = normaliseraVoteringar(rader);
  assert.ok(h);
  assert.equal(h.votering_id, "008484EA");
  assert.deepEqual(h.rostfordelning!["s"], { ja: 1, nej: 0, avstar: 0, franvarande: 0 });
});

test("mergeHandlingar räknar vidare förbi 9999 utan id-krock", () => {
  const rader = parseVoteringLista(votPayload);
  const norm = normaliseraVoteringar(rader);
  const existing = mergeHandlingar([] as Handling[], norm, 2026).map((h) => ({ ...h, id: "h-2026-9999" }));
  const other = norm.map((h) => ({ ...h, punkt: 4 }));
  const merged = mergeHandlingar(existing, other, 2026);
  assert.deepEqual(merged.map((h) => h.id), ["h-2026-9999", "h-2026-10000"]);
  const again = mergeHandlingar(merged, [...norm, ...other], 2026);
  assert.equal(again.length, 2); // femsiffrigt id läses tillbaka — idempotent även efter 9999
});

test("mergeHandlingar skiljer voteringspunkter åt", () => {
  const rader = parseVoteringLista(votPayload);
  const norm = normaliseraVoteringar(rader);
  const other = norm.map((h) => ({ ...h, punkt: 4 }));
  const merged = mergeHandlingar(mergeHandlingar([] as Handling[], norm, 2026), other, 2026);
  assert.equal(merged.length, 2);
});

/**
 * Fixtur formad exakt som riktiga utskottsforslag-svar (kontrollerad
 * 2026-07-31 mot HD01JuU2): punkt 1 antar lagförslagen, punkt 2 avslår
 * bara motioner. Det är precis den skillnaden matchningen måste se.
 */
const utskottsPayload = {
  utskottsforslag: {
    dokutskottsforslag: {
      utskottsforslag: [
        {
          punkt: "1",
          rubrik: "Lagf&ouml;rslagen",
          forslag: "Riksdagen antar regeringens f&ouml;rslag till lag om &auml;ndring i r&auml;tteg&aring;ngsbalken.<BR/>",
        },
        {
          punkt: "2",
          rubrik: "Hemliga tv&aring;ngsmedel",
          forslag: "Riksdagen avsl&aring;r motionerna 2024/25:3444 av Gudrun Nordborg m.fl. (V) yrkandena 2 och 3.",
        },
      ],
    },
  },
};

test("fetchUtskottspunkter: punkternas rubrik och beslut plockas ut, entiteter avkodade", async () => {
  const fetcher: HttpFetch = async () =>
    new Response(JSON.stringify(utskottsPayload), { status: 200 }) as unknown as Awaited<ReturnType<HttpFetch>>;
  const punkter = await fetchUtskottspunkter(fetcher, "HD01JuU2");
  assert.equal(punkter.length, 2);
  assert.deepEqual(punkter[0], { punkt: 1, rubrik: "Lagförslagen", forslag: "Riksdagen antar regeringens förslag till lag om ändring i rättegångsbalken." });
  assert.equal(punkter[1]!.punkt, 2);
  assert.ok(punkter[1]!.forslag.startsWith("Riksdagen avslår motionerna"));
});

test("fetchUtskottspunkter: ensam punkt kommer som objekt, inte lista", async () => {
  const en = { utskottsforslag: { dokutskottsforslag: { utskottsforslag: { punkt: "1", rubrik: "Enda", forslag: "Riksdagen antar." } } } };
  const fetcher: HttpFetch = async () =>
    new Response(JSON.stringify(en), { status: 200 }) as unknown as Awaited<ReturnType<HttpFetch>>;
  assert.deepEqual(await fetchUtskottspunkter(fetcher, "X"), [{ punkt: 1, rubrik: "Enda", forslag: "Riksdagen antar." }]);
});

test("fetchUtskottspunkter: tomt svar ger tom lista, inget kast", async () => {
  const fetcher: HttpFetch = async () =>
    new Response(JSON.stringify({ utskottsforslag: {} }), { status: 200 }) as unknown as Awaited<ReturnType<HttpFetch>>;
  assert.deepEqual(await fetchUtskottspunkter(fetcher, "X"), []);
});
