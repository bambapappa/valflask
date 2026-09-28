import { ALLA_LOFTESFILTER, filtreraLoeften, filterNyckel, loftesvyer, matcharLoeftesfilter, valdagKategori } from "../src/lib/loftesfilter.ts";
import { getParties, getPromises, type PromisePost } from "../src/lib/data.ts";
import { getPromisesForParty } from "../src/lib/aggregates.ts";

let errors = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`ok ${name}`);
  else { errors += 1; console.error(`FEL ${name}${detail ? `: ${detail}` : ""}`); }
}

function promise(id: string, basis: string, loftestyp: "reform" | "inriktning", date = "2026-09-12", dateBasis: "kalla" | "insamling" = "kalla"): PromisePost {
  return {
    id, loftestyp, date_stated: date, source: { date_basis: dateBasis },
    cost: { basis },
  } as PromisePost;
}

const partietsReform = promise("p-parti-reform", "parti", "reform");
const partietsPolicy = promise("p-parti-policy", "parti", "inriktning");
const egenReform = promise("p-egen-reform", "llm_estimat", "reform");
const myndighetsankrad = promise("p-myndighet", "myndighet", "reform");
const alla = [partietsReform, partietsPolicy, egenReform, myndighetsankrad];

check("standardurvalet visar bara partiets reform", filtreraLoeften(alla, { underlag: "parti", loftestyp: "reform", valdag: "fore" }).map((p) => p.id).join(",") === "p-parti-reform");
check("inriktning är oberoende av beloppsunderlag", matcharLoeftesfilter(partietsPolicy, { underlag: "parti", loftestyp: "inriktning", valdag: "fore" }));
check("Utlovat.se omfattar även myndighetsankrad egen beräkning", matcharLoeftesfilter(myndighetsankrad, { underlag: "utlovat", loftestyp: "reform", valdag: "fore" }));
check("partiets belopp blandas inte in bland Utlovat.se:s", !matcharLoeftesfilter(partietsReform, { underlag: "utlovat", loftestyp: "alla", valdag: "fore" }));
check("alla löften ger full population", filtreraLoeften(alla, { underlag: "alla", loftestyp: "alla", valdag: "alla" }).length === 4);
check("partiets och Utlovat.se:s underlag delar upp hela populationen", ["reform", "inriktning"].every((loftestyp) => {
  const typ = loftestyp as "reform" | "inriktning";
  const party = filtreraLoeften(alla, { underlag: "parti", loftestyp: typ, valdag: "alla" }).length;
  const utlovat = filtreraLoeften(alla, { underlag: "utlovat", loftestyp: typ, valdag: "alla" }).length;
  const combined = filtreraLoeften(alla, { underlag: "alla", loftestyp: typ, valdag: "alla" }).length;
  return party + utlovat === combined;
}));
check("alla-läget innehåller båda underlagen", filtreraLoeften(alla, { underlag: "alla", loftestyp: "reform", valdag: "alla" }).map((p) => p.id).join(",") === "p-parti-reform,p-egen-reform,p-myndighet");

const paValdagen = promise("p-valdag", "parti", "reform", "2026-09-13");
const efter = promise("p-efter", "parti", "reform", "2026-09-14");
const baraInsamlat = promise("p-oklar", "parti", "reform", "2026-09-14", "insamling");
const valdagBaraInsamlat = promise("p-valdag-oklar", "parti", "reform", "2026-09-13", "insamling");
const sidUppdateradEfter = { ...efter, id: "p-siduppdaterad", source: { date_basis: "osakert-kalldatum" as const } };
check("valdagen är en egen kategori", valdagKategori(paValdagen) === "valdagen");
check("källdaterat efter valet visas efter", valdagKategori(efter) === "efter");
check("insamlat efter valet räknas inte som nytt löfte", valdagKategori(baraInsamlat) === "oklar");
check("insamlat på valdagen räknas inte som uttalat på valdagen", valdagKategori(valdagBaraInsamlat) === "oklar");
check("sidans ändringsdatum efter valet räknas inte som nytt löfte", valdagKategori(sidUppdateradEfter) === "oklar");
check("alla tidpunkter delar upp populationen utan bortfall", ["fore", "valdagen", "efter", "oklar"].reduce((n, valdag) => n + filtreraLoeften([...alla, paValdagen, efter, baraInsamlat], { underlag: "alla", loftestyp: "alla", valdag: valdag as "fore" | "valdagen" | "efter" | "oklar" }).length, 0) === 7);

const published = getPromises().filter((p) => p.status !== "tillbakadragen");
const views = loftesvyer(published);
const keys = views.flatMap((view) => view.keys);
check("alla 45 filterval pekar på exakt en vy", keys.length === ALLA_LOFTESFILTER.length && new Set(keys).size === keys.length && ALLA_LOFTESFILTER.every((filter) => keys.includes(filterNyckel(filter))));
check("identiska datumurval delar samma statiska vy", views.length < ALLA_LOFTESFILTER.length);
check("publicerade löften delas exakt mellan partiets och Utlovat.se:s belopp", ["reform", "inriktning", "alla"].every((loftestyp) => {
  const typ = loftestyp as "reform" | "inriktning" | "alla";
  const party = filtreraLoeften(published, { underlag: "parti", loftestyp: typ, valdag: "alla" }).length;
  const utlovat = filtreraLoeften(published, { underlag: "utlovat", loftestyp: typ, valdag: "alla" }).length;
  const combined = filtreraLoeften(published, { underlag: "alla", loftestyp: typ, valdag: "alla" }).length;
  return party + utlovat === combined;
}));
check("varje partis urval delas utan bortfall eller överlapp", getParties().every((party) => ["reform", "inriktning", "alla"].every((loftestyp) => {
  const typ = loftestyp as "reform" | "inriktning" | "alla";
  const own = getPromisesForParty(filtreraLoeften(published, { underlag: "parti", loftestyp: typ, valdag: "alla" }), party.code).length;
  const estimated = getPromisesForParty(filtreraLoeften(published, { underlag: "utlovat", loftestyp: typ, valdag: "alla" }), party.code).length;
  const combined = getPromisesForParty(filtreraLoeften(published, { underlag: "alla", loftestyp: typ, valdag: "alla" }), party.code).length;
  return own + estimated === combined;
})));

if (errors) process.exit(1);
