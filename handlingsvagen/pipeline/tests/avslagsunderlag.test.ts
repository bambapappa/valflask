import assert from "node:assert/strict";
import test from "node:test";
import { hamtaAvslagsunderlag, type AvslagsKallor } from "../src/avslagsunderlag.ts";

function kallor(over: Partial<AvslagsKallor> = {}): AvslagsKallor {
  return {
    punkter: async () => [{
      punkt: 3,
      rubrik: "Ekonomisk brottslighet",
      forslag: "Riksdagen avslår motionerna 2025/26:3586 av Teresa Carvalho m.fl. (S) yrkande 39, 2025/26:1672 av Katarina Tolgfors m.fl. (M) delyrkande 2 och 2025/26:4119 av Nooshi Dadgostar m.fl. (V) yrkande 1.",
    }],
    motionDokId: async (_rm, beteckning) => ({ "3586": "HD023586", "1672": "HD021672", "4119": "HD024119" })[beteckning] ?? null,
    yrkanden: async (dokId) => dokId === "HD023586"
      ? [{ nummer: "39", lydelse: "Inför synnerligen grova ekonomiska brott med tio års maxstraff." }]
      : dokId === "HD021672"
        ? [{ nummer: "1", lydelse: "Inför en decoy-bestämmelse samt skärp straffen för gromning." }]
        : [{ nummer: "1", lydelse: "Ett annat yrkande." }],
    ...over,
  };
}

test("hämtar varje avslaget yrkandes ordagranna lydelse före godkännande", async () => {
  const res = await hamtaAvslagsunderlag("1c03692abc60", 3, "HD01JuU42", kallor());

  assert.equal(res.punkt.punkt, 3);
  assert.deepEqual(res.avslaget, [
    {
      motion: "2025/26:3586",
      parti: "s",
      yrkande: "39",
      dok_id: "HD023586",
      lydelse: "Inför synnerligen grova ekonomiska brott med tio års maxstraff.",
    },
    {
      motion: "2025/26:1672",
      parti: "m",
      yrkande: "1 (delyrkande 2)",
      dok_id: "HD021672",
      lydelse: "Inför en decoy-bestämmelse samt skärp straffen för gromning.",
    },
    {
      motion: "2025/26:4119",
      parti: "v",
      yrkande: "1",
      dok_id: "HD024119",
      lydelse: "Ett annat yrkande.",
    },
  ]);
});

test("fäller hela hämtningen när ett utpekat yrkande saknas", async () => {
  await assert.rejects(
    hamtaAvslagsunderlag(
      "1c03692abc60",
      3,
      "HD01JuU42",
      kallor({ yrkanden: async () => [{ nummer: "1", lydelse: "Fel yrkande." }] }),
    ),
    /yrkande 39 finns inte i 2025\/26:3586/u,
  );
});

test("vägrar gissa moder-yrkande när ett delyrkande har flera kandidater", async () => {
  await assert.rejects(
    hamtaAvslagsunderlag(
      "1c03692abc60",
      3,
      "HD01JuU42",
      kallor({
        yrkanden: async (dokId) => dokId === "HD021672"
          ? [{ nummer: "1", lydelse: "Första." }, { nummer: "2", lydelse: "Andra." }]
          : dokId === "HD023586"
            ? [{ nummer: "39", lydelse: "Ekobrott." }]
            : [{ nummer: "1", lydelse: "Annat." }],
      }),
    ),
    /delyrkande 2 kan inte knytas till ett entydigt moder-yrkande/u,
  );
});

test("vägrar ett tomt eller feladresserat beslutsunderlag", async () => {
  await assert.rejects(
    hamtaAvslagsunderlag("x", undefined, "HD01JuU42", kallor()),
    /saknar beslutspunkt/u,
  );
  await assert.rejects(
    hamtaAvslagsunderlag("x", 8, "HD01JuU42", kallor()),
    /punkt 8 finns inte/u,
  );
});
