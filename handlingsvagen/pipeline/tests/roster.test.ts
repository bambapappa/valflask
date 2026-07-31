import { test } from "node:test";
import assert from "node:assert/strict";
import { RmRosterBygge, avkodaRoster, mergePersoner, rmFilnamn, type Person } from "../src/roster.ts";
import type { RdVoteringRad } from "../src/riksdagen.ts";

function rad(over: Partial<RdVoteringRad>): RdVoteringRad {
  return {
    votering_id: "V-1",
    rm: "2022/23",
    beteckning: "UU15",
    punkt: 5,
    namn: "Kenneth G Forslund",
    intressent_id: "025",
    parti: "s",
    valkrets: "VGV",
    rost: "Ja",
    avser: "sakfrågan",
    datum: "2023-05-10",
    ...over,
  };
}

test("RmRosterBygge + avkodaRoster: förlustfri rundtur", () => {
  const bygge = new RmRosterBygge("2022/23");
  bygge.laggTillVotering([
    rad({}),
    rad({ intressent_id: "026", namn: "M Molin", parti: "m", rost: "Nej" }),
    rad({ intressent_id: "027", namn: "F Frisk", parti: "m", rost: "Frånvarande" }),
  ]);
  bygge.laggTillVotering([
    rad({ votering_id: "V-2", punkt: 6, rost: "Avstår" }),
    // 026/027 saknar rad i V-2 → "-" i strängen, ingen rad vid avkodning
  ]);
  const { roster, personer } = bygge.bygg();

  assert.deepEqual(roster.personer, ["025", "026", "027"]);
  assert.equal(roster.voteringar.length, 2);
  assert.equal(roster.voteringar[0]!.roster, "JNF");
  assert.equal(roster.voteringar[1]!.roster, "A--");

  const avkodat = avkodaRoster(roster, personer);
  const v1 = avkodat.get("V-1")!;
  assert.equal(v1.length, 3);
  assert.deepEqual(v1.map((r) => r.rost), ["Ja", "Nej", "Frånvarande"]);
  assert.deepEqual(v1.map((r) => r.parti), ["s", "m", "m"]);
  assert.equal(v1[0]!.namn, "Kenneth G Forslund");
  assert.equal(v1[0]!.datum, "2023-05-10");
  assert.equal(avkodat.get("V-2")!.length, 1); // "-" ger ingen rad
});

test("partibyte fångas per votering via avvikelselistan", () => {
  const bygge = new RmRosterBygge("2022/23");
  bygge.laggTillVotering([rad({})]); // röstar som s
  bygge.laggTillVotering([rad({ votering_id: "V-2", parti: "-", rost: "Nej" })]); // blivit vilde
  const { roster, personer } = bygge.bygg();

  assert.equal(personer[0]!.parti, "-"); // registret bär senast sedda
  const v1 = roster.voteringar.find((v) => v.votering_id === "V-1")!;
  assert.deepEqual(v1.avvikande_parti, { "0": "s" }); // rösten föll som s

  const avkodat = avkodaRoster(roster, personer);
  assert.equal(avkodat.get("V-1")![0]!.parti, "s");
  assert.equal(avkodat.get("V-2")![0]!.parti, "-");
});

test("sakfrågan föredras framför motivfrågan, dubblettrader ignoreras", () => {
  const bygge = new RmRosterBygge("2022/23");
  bygge.laggTillVotering([
    rad({ avser: "motivfrågan", rost: "Nej" }),
    rad({}),
    rad({}), // dubblett — första sakfrågeraden vinner
  ]);
  const { roster } = bygge.bygg();
  assert.equal(roster.voteringar[0]!.roster, "J");
});

test("mergePersoner: idempotent, nya läggs till, kända uppdateras", () => {
  const a: Person[] = [{ intressent_id: "025", namn: "K", parti: "s", valkrets: "VGV" }];
  const b: Person[] = [
    { intressent_id: "025", namn: "K", parti: "-", valkrets: "VGV" },
    { intressent_id: "026", namn: "M", parti: "m", valkrets: "AB" },
  ];
  const merged = mergePersoner(a, b);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.parti, "-");
  assert.deepEqual(mergePersoner(merged, b), merged);
});

test("avkodaRoster vägrar trasiga filer", () => {
  const fil = { rm: "2022/23", personer: ["025"], voteringar: [{ votering_id: "V-1", beteckning: "X", punkt: 1, datum: "2023-01-01", roster: "JJ" }] };
  assert.throws(() => avkodaRoster(fil, [{ intressent_id: "025", namn: "K", parti: "s", valkrets: "V" }]));
});

test("rmFilnamn", () => {
  assert.equal(rmFilnamn("2022/23"), "2022-23.json");
});
