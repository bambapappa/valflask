import { filtreraLoeften, matcharLoeftesfilter } from "../src/lib/loftesfilter.ts";
import type { PromisePost } from "../src/lib/data.ts";

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

if (errors) process.exit(1);
