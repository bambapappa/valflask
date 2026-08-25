import { filtreraLoeften, matcharLoeftesfilter } from "../src/lib/loftesfilter.ts";
import { getParties, getPromises, type PromisePost } from "../src/lib/data.ts";
import { getPromisesForParty } from "../src/lib/aggregates.ts";

let errors = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`ok ${name}`);
  else { errors += 1; console.error(`FEL ${name}${detail ? `: ${detail}` : ""}`); }
}

function promise(id: string, basis: string, loftestyp: "reform" | "inriktning"): PromisePost {
  return {
    id, loftestyp,
    cost: { basis },
  } as PromisePost;
}

const partietsReform = promise("p-parti-reform", "parti", "reform");
const partietsPolicy = promise("p-parti-policy", "parti", "inriktning");
const egenReform = promise("p-egen-reform", "llm_estimat", "reform");
const myndighetsankrad = promise("p-myndighet", "myndighet", "reform");
const alla = [partietsReform, partietsPolicy, egenReform, myndighetsankrad];

check("standardurvalet visar bara partiets reform", filtreraLoeften(alla, { underlag: "parti", loftestyp: "reform" }).map((p) => p.id).join(",") === "p-parti-reform");
check("inriktning är oberoende av beloppsunderlag", matcharLoeftesfilter(partietsPolicy, { underlag: "parti", loftestyp: "inriktning" }));
check("Utlovat.se omfattar även myndighetsankrad egen beräkning", matcharLoeftesfilter(myndighetsankrad, { underlag: "utlovat", loftestyp: "reform" }));
check("partiets belopp blandas inte in bland Utlovat.se:s", !matcharLoeftesfilter(partietsReform, { underlag: "utlovat", loftestyp: "alla" }));
check("alla löften ger full population", filtreraLoeften(alla, { underlag: "alla", loftestyp: "alla" }).length === 4);
check("partiets och Utlovat.se:s underlag delar upp hela populationen", ["reform", "inriktning"].every((loftestyp) => {
  const typ = loftestyp as "reform" | "inriktning";
  const party = filtreraLoeften(alla, { underlag: "parti", loftestyp: typ }).length;
  const utlovat = filtreraLoeften(alla, { underlag: "utlovat", loftestyp: typ }).length;
  const combined = filtreraLoeften(alla, { underlag: "alla", loftestyp: typ }).length;
  return party + utlovat === combined;
}));
check("alla-läget innehåller båda underlagen", filtreraLoeften(alla, { underlag: "alla", loftestyp: "reform" }).map((p) => p.id).join(",") === "p-parti-reform,p-egen-reform,p-myndighet");

const published = getPromises().filter((p) => p.status !== "tillbakadragen");
check("publicerade löften delas exakt mellan partiets och Utlovat.se:s belopp", ["reform", "inriktning", "alla"].every((loftestyp) => {
  const typ = loftestyp as "reform" | "inriktning" | "alla";
  const party = filtreraLoeften(published, { underlag: "parti", loftestyp: typ }).length;
  const utlovat = filtreraLoeften(published, { underlag: "utlovat", loftestyp: typ }).length;
  const combined = filtreraLoeften(published, { underlag: "alla", loftestyp: typ }).length;
  return party + utlovat === combined;
}));
check("varje partis urval delas utan bortfall eller överlapp", getParties().every((party) => ["reform", "inriktning", "alla"].every((loftestyp) => {
  const typ = loftestyp as "reform" | "inriktning" | "alla";
  const own = getPromisesForParty(filtreraLoeften(published, { underlag: "parti", loftestyp: typ }), party.code).length;
  const estimated = getPromisesForParty(filtreraLoeften(published, { underlag: "utlovat", loftestyp: typ }), party.code).length;
  const combined = getPromisesForParty(filtreraLoeften(published, { underlag: "alla", loftestyp: typ }), party.code).length;
  return own + estimated === combined;
})));

if (errors) process.exit(1);
