import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dokumentlistaUrl,
  fetchDokument,
  fetchVoteringsIdn,
  parseVotering,
  SaknarRostlista,
  type HttpFetch,
} from "../src/riksdagen.ts";
import { mergeHandlingar, normaliseraDokument, type Handling } from "../src/handlingar.ts";
import {
  franDatumUrData,
  okandaVoteringsIdn,
  riksmoteFor,
  riksmotenForFonster,
  tolkaFonster,
} from "../src/datumfonster.ts";

/** Fejkad fetch som svarar med givna payloads i tur och ordning och minns URL:erna. */
function fejk(...svar: unknown[]): { fetcher: HttpFetch; urls: string[] } {
  const urls: string[] = [];
  const fetcher: HttpFetch = async (url) => {
    urls.push(url);
    const payload = svar.shift();
    if (payload === undefined) throw new Error(`oväntat anrop: ${url}`);
    return { status: 200, text: async () => JSON.stringify(payload) };
  };
  return { fetcher, urls };
}

const FONSTER = { from: "2026-08-28", tom: "2026-09-28" };

test("dokumentlistaUrl: datumfönster ger from/tom och INGET rm", () => {
  const url = new URL(dokumentlistaUrl("prop", { fonster: FONSTER }));
  assert.equal(url.searchParams.get("from"), "2026-08-28");
  assert.equal(url.searchParams.get("tom"), "2026-09-28");
  assert.equal(url.searchParams.get("doktyp"), "prop");
  assert.equal(url.searchParams.has("rm"), false);
});

test("dokumentlistaUrl: riksmöte utan fönster ger rm och inga datum", () => {
  const url = new URL(dokumentlistaUrl("mot", { rm: "2025/26" }));
  assert.equal(url.searchParams.get("rm"), "2025/26");
  assert.equal(url.searchParams.has("from"), false);
});

test("dokumentlistaUrl: varken rm eller fönster faller", () => {
  assert.throws(() => dokumentlistaUrl("mot", {}), /rm eller datumfönster/);
});

test("tolkaFonster: felaktigt datum och omvänt fönster faller", () => {
  assert.throws(() => tolkaFonster("2026-8-28", "2026-09-28"), /ÅÅÅÅ-MM-DD/);
  assert.throws(() => tolkaFonster("2026-09-30", "2026-09-28"), /efter/);
  assert.deepEqual(tolkaFonster("2026-08-28", "2026-09-28"), FONSTER);
});

test("fetchVoteringsIdn: anrop utan riksmöte faller — voteringlista ignorerar from/tom utan rm", async () => {
  const { fetcher, urls } = fejk();
  await assert.rejects(() => fetchVoteringsIdn(fetcher, ""), /riksmöte/);
  assert.equal(urls.length, 0);
});

test("fetchVoteringsIdn: faller vid trunkering (@antal == sz)", async () => {
  const { fetcher } = fejk({
    voteringlista: { "@antal": "2", votering: [{ votering_id: "A" }, { votering_id: "B" }] },
  });
  await assert.rejects(() => fetchVoteringsIdn(fetcher, "2025/26", { sz: 2 }), /trunkera/);
});

test("fetchDokument: faller när mottagna rader skiljer från svarets @traffar", async () => {
  const { fetcher } = fejk({
    dokumentlista: { "@traffar": "3", dokument: [{ dok_id: "X1", doktyp: "prop", rm: "2025/26", datum: "2026-09-01" }] },
  });
  await assert.rejects(() => fetchDokument(fetcher, "prop", null, { fonster: FONSTER }), /@traffar/);
});

test("fönsterskörd fångar en handling daterad efter valdagen trots rm 2025/26, och omkörning ger 0 nya", async () => {
  const septProp = {
    dokumentlista: {
      "@traffar": "1",
      dokument: {
        dok_id: "HD03250",
        doktyp: "prop",
        rm: "2025/26",
        datum: "2026-09-15 00:00:00",
        titel: "Budgetpropositionen för 2027",
        dokintressent: { intressent: { roll: "undertecknare", namn: "Statsministern", partibet: "M", intressent_id: "1" } },
      },
    },
  };
  const skorda = async (fetcher: HttpFetch, befintliga: Handling[]) => {
    const dok = await fetchDokument(fetcher, "prop", null, { fonster: FONSTER });
    const norm = dok.map((d) => normaliseraDokument(d)).filter((h): h is NonNullable<typeof h> => h !== null);
    return mergeHandlingar(befintliga, norm, 2026);
  };

  const forsta = fejk(septProp);
  const efter1 = await skorda(forsta.fetcher, []);
  assert.equal(new URL(forsta.urls[0]!).searchParams.has("rm"), false, "rm får inte styra urvalet");
  assert.equal(efter1.length, 1);
  assert.equal(efter1[0]!.dok_id, "HD03250");
  assert.equal(efter1[0]!.datum, "2026-09-15");

  const andra = fejk(septProp);
  const efter2 = await skorda(andra.fetcher, efter1);
  assert.equal(efter2.length - efter1.length, 0);
});

test("parseVotering: omröstning utan röstlista ger SaknarRostlista, trasigt svar ger vanligt fel", () => {
  // Formen riksdagen svarar med för t.ex. "Omröstning 2025/26:0311-1" (mätt 2026-09-29).
  const utanRostlista = {
    votering: { dokument: { dok_id: "HD190311-1", rm: "2025/26", beteckning: "0311-1", typrubrik: "Omröstning 2025/26:0311-1" } },
  };
  assert.throws(() => parseVotering(utanRostlista), SaknarRostlista);
  assert.throws(
    () => parseVotering({}),
    (e: unknown) => e instanceof Error && !(e instanceof SaknarRostlista),
  );
});

test("riksmoteFor: riksmötet löper september–augusti", () => {
  assert.equal(riksmoteFor("2026-08-31"), "2025/26");
  assert.equal(riksmoteFor("2026-09-01"), "2026/27");
  assert.equal(riksmoteFor("2099-12-31"), "2099/00");
});

test("riksmotenForFonster: höstfönster tar med förra riksmötet — septemberhandlingar bär gamla taggen", () => {
  assert.deepEqual(riksmotenForFonster(FONSTER), ["2025/26", "2026/27"]);
  assert.deepEqual(riksmotenForFonster({ from: "2026-10-01", tom: "2026-10-08" }), ["2025/26", "2026/27"]);
  assert.deepEqual(riksmotenForFonster({ from: "2026-03-01", tom: "2026-03-08" }), ["2025/26"]);
});

test("franDatumUrData: senaste kända datum minus överlapp", () => {
  const hs = [{ datum: "2026-08-13" }, { datum: "2026-08-27" }, { datum: "" }];
  assert.equal(franDatumUrData(hs, 14), "2026-08-13");
  assert.equal(franDatumUrData(hs, 0), "2026-08-27");
  assert.throws(() => franDatumUrData([{ datum: "" }], 14), /inga daterade/);
});

test("okandaVoteringsIdn: redan skördade voteringar hämtas inte om", () => {
  const hs = [{ votering_id: "A" }, { votering_id: undefined }, { votering_id: "C" }];
  assert.deepEqual(okandaVoteringsIdn(["A", "B", "C", "D"], hs), ["B", "D"]);
});
