import { test } from "node:test";
import assert from "node:assert/strict";
import {
  betankandeNyckel,
  indexeraBetankanden,
  mergeBetankanden,
  normaliseraBetankande,
  type Betankande,
} from "../src/betankanden.ts";
import { parseDokumentLista } from "../src/riksdagen.ts";

/** Fixtur formad som riktiga dokumentlista-svar för doktyp=bet. */
const betPayload = {
  dokumentlista: {
    "@traffar": "2",
    "@sida": "1",
    dokument: [
      {
        dok_id: "HA01AU10",
        doktyp: "bet",
        rm: "2022/23",
        beteckning: "AU10",
        datum: "2023-05-10 00:00:00",
        titel: "Arbetslöshetsförsäkringen",
        organ: "AU",
      },
      {
        dok_id: "HA01UU15",
        doktyp: "bet",
        rm: "2022/23",
        beteckning: "UU15",
        datum: "2023-04-12 00:00:00",
        titel: "Internationella relationer",
        organ: "UU",
      },
    ],
  },
};

test("parseDokumentLista tar med beteckning för betänkanden", () => {
  const { dokument } = parseDokumentLista(betPayload);
  assert.equal(dokument[0]!.beteckning, "AU10");
  assert.equal(dokument[1]!.beteckning, "UU15");
});

test("normaliseraBetankande: bet blir indexpost, andra typer och luckor blir null", () => {
  const { dokument } = parseDokumentLista(betPayload);
  const b = normaliseraBetankande(dokument[0]!);
  assert.deepEqual(b, {
    dok_id: "HA01AU10",
    rm: "2022/23",
    beteckning: "AU10",
    datum: "2023-05-10",
    titel: "Arbetslöshetsförsäkringen",
    organ: "AU",
  });
  assert.equal(normaliseraBetankande({ ...dokument[0]!, doktyp: "mot" }), null);
  const utanBeteckning = { ...dokument[0]! };
  delete utanBeteckning.beteckning;
  assert.equal(normaliseraBetankande(utanBeteckning), null); // ingen nyckel gissas ur dok_id
});

test("betankandeNyckel har samma form som voteringshandlingars dok_id", () => {
  assert.equal(betankandeNyckel("2022/23", "AU10"), "202223:AU10");
});

test("mergeBetankanden: idempotent, ingen tyst uppdatering, deterministisk ordning", () => {
  const { dokument } = parseDokumentLista(betPayload);
  const norm = dokument.map((d) => normaliseraBetankande(d)!) as Betankande[];
  const first = mergeBetankanden([], norm);
  assert.deepEqual(first.map((b) => b.dok_id), ["HA01UU15", "HA01AU10"]); // äldst först
  const andrad = norm.map((b) => ({ ...b, titel: "ÄNDRAD" }));
  const again = mergeBetankanden(first, andrad);
  assert.equal(again.length, 2);
  assert.equal(again.find((b) => b.dok_id === "HA01AU10")!.titel, "Arbetslöshetsförsäkringen");
});

test("indexeraBetankanden slår upp på voteringens dok_id-form", () => {
  const { dokument } = parseDokumentLista(betPayload);
  const index = indexeraBetankanden(dokument.map((d) => normaliseraBetankande(d)!) as Betankande[]);
  assert.equal(index.get("202223:AU10")!.dok_id, "HA01AU10");
  assert.equal(index.get("202223:XX99"), undefined);
});
