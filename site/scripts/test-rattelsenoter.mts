/**
 * test-rattelsenoter.mts — rättelsenoten ska nå den sida rättelsen gäller.
 *
 * Regeln säger «rättelsenot på berörd sida plus post i rättelseloggen».
 * Löftessidan visar sin egen historik; Frågevågens sidor visade ingenting alls
 * förrän 2026-08-14, så varje ståndpunktsrättelse fanns bara på `/rattelser`
 * — inte där läsaren ser cellen (ATTGORA E6).
 *
 * Provet mäter två saker mot det verkliga datat:
 *
 * 1. **att kopplingen biter** — varje rättelse som bär en beteckning eller en
 *    frågelydelse hamnar på rätt fråga, och bara där,
 * 2. **hur många som inte når fram** — en post vars `affects` beskriver
 *    cellerna i löptext går inte att koppla, och det talet ska stå skrivet i
 *    stället för att upptäckas av en läsare som undrar var noten tog vägen.
 *
 * Undantaget prosan inte nämner, och som provet därför mäter: ett besked-id
 * vars besked är RADERAT går inte att slå upp. En tömd cell raderar sitt
 * statement (E4/E5), så just den rättelsen når inte sin sida. Går det talet
 * upp har en tömning till skett utan att någon sett noten försvinna.
 */
import { rattelserForFraga, beteckningarI } from "../src/lib/rattelsenoter.ts";
import { getRattelser } from "../src/lib/data.ts";
import { getIssuesFile, getStances } from "../src/lib/stances.ts";
import type { Rattelse } from "../src/lib/data";

let errors = 0;
function check(label: string, cond: boolean, msg?: string): void {
  if (cond) console.log(`  OK: ${label}`);
  else {
    console.error(`FAIL: ${label}${msg ? ` — ${msg}` : ""}`);
    errors++;
  }
}

const issues = getIssuesFile().issues;
const stances = getStances();
const rattelser = getRattelser();

// ── 1. Beteckningarna läses, och bara de ────────────────────────────────

check(
  "beteckningarI plockar besked- och delfrågeid",
  [...beteckningarI("Frågevågen: st-2026-0044 och sq-energi-karnkraft")].sort().join(" ") ===
    "sq-energi-karnkraft st-2026-0044",
);
check(
  "ett löftesnummer är ingen ståndpunktsbeteckning",
  beteckningarI("Löftet p-2026-0324 (MP, miljardärsskatt)").size === 0,
);

// ── 2. Kopplingen mot det verkliga datat ────────────────────────────────

/** Vilken fråga varje rättelse hamnar på. */
const traffar = new Map<Rattelse, string[]>();
for (const issue of issues) {
  for (const r of rattelserForFraga(rattelser, issue, stances)) {
    traffar.set(r, [...(traffar.get(r) ?? []), issue.slug]);
  }
}

check(
  "minst en rättelse når en frågesida",
  traffar.size > 0,
  "ingen rättelse kopplas till någon fråga — kopplingen mäter ingenting",
);

/**
 * Kärnkraftsrättelsen 2026-08-13 namnger frågan genom att citera dess egen
 * lydelse i stället för att skriva id:t. Fångas den inte är lydelsenyckeln
 * borta, och tre celler står orättade på sin sida.
 */
const karnkraft = rattelser.find(
  (r) => r.date === "2026-08-13" && r.affects.includes("Frågevågens rad om kärnkraft"),
);
if (karnkraft) {
  check(
    "en rättelse som citerar frågans lydelse når frågan",
    (traffar.get(karnkraft) ?? []).includes("energipolitiken"),
    `hamnade på ${(traffar.get(karnkraft) ?? []).join(", ") || "ingen sida"}`,
  );
}

/**
 * En rättelse som varken bär en beteckning eller frågans egna ord ska nå
 * ingen sida alls. Posten 2026-07-17 beskriver sina fyra besked i egen
 * kortform («S sjukvård-vinst») och är just det fallet: hellre ingen not än
 * en not på en sida rättelsen kanske inte gäller.
 */
const utanNyckel = rattelser.find((r) => r.date === "2026-07-17" && r.affects.startsWith("Frågevågen: fyra besked"));
if (utanNyckel) {
  check(
    "en rättelse utan beteckning och utan frågelydelse gissas inte fram till en sida",
    !traffar.has(utanNyckel),
    `hamnade på ${(traffar.get(utanNyckel) ?? []).join(", ")}`,
  );
}

/**
 * Lydelsenyckeln kräver delfrågans HELA text. En tom lydelse får aldrig
 * matcha — då hade varje rättelse hamnat på varje fråga.
 */
const tomLydelse = rattelserForFraga(
  [{ date: "2026-01-01", affects: "Frågevågen: en cell", what: "x", why: "y" }],
  { ...issues[0]!, subquestions: [{ ...issues[0]!.subquestions[0]!, id: "sq-x", text: "" }] },
  stances,
);
check("en tom frågelydelse matchar ingenting", tomLydelse.length === 0);

/**
 * Undantaget prosan inte nämner, och hela skälet till att E5 är ett fynd:
 * A3-posten namnger tre celler, men Kristdemokraternas cell om den statliga
 * inkomstskatten **tömdes**, och en tömning raderar beskedet. Id:t
 * st-2026-0039 går därför inte att slå upp, och noten når inte frågan om
 * ekonomin — bara frågan om uppehållstillstånd, vars två besked finns kvar.
 *
 * Provet låser fast måttet: går det upp har en tömning till gjort en
 * rättelsenot hemlös.
 */
const a3 = rattelser.find((r) => r.date === "2026-08-14" && r.affects.includes("permanenta uppehållstillstånd"));
if (a3) {
  const sidor = traffar.get(a3) ?? [];
  check(
    "A3-posten når frågan om uppehållstillstånd",
    sidor.includes("invandringen-och-integrationen"),
    `hamnade på ${sidor.join(", ") || "ingen sida"}`,
  );
  check(
    "den tömda cellens fråga nås INTE — beskedet är raderat (E5)",
    !sidor.includes("ekonomin"),
    "st-2026-0039 går plötsligt att slå upp — då är E5 löst och provet ska skrivas om",
  );
}

// ── 3. De som inte når fram — mätt, inte gissat ─────────────────────────

/** Rättelser som handlar om Frågevågen, oavsett om de går att koppla. */
const omFragevagen = rattelser.filter((r) => /Frågevågen|ståndpunkt/iu.test(r.affects));
const utan = omFragevagen.filter((r) => !traffar.has(r));

console.log(
  `\n  ${omFragevagen.length} rättelser rör Frågevågen · ${omFragevagen.length - utan.length} når sin sida · ${utan.length} gör det inte`,
);
for (const r of utan) console.log(`    ${r.date}  ${r.affects.slice(0, 90)}`);

/**
 * Taket får sjunka, aldrig stiga. En post når ingen sida i dag: 2026-07-17,
 * som beskriver sina fyra besked i egen kortform («S sjukvård-vinst»). Skriv
 * delfrågans id eller dess lydelse i affects — höj inte taket.
 */
const TAK_UTAN_SIDA = 1;
check(
  `högst ${TAK_UTAN_SIDA} rättelser om Frågevågen saknar en sida att stå på`,
  utan.length <= TAK_UTAN_SIDA,
  `${utan.length} saknar sida. Skriv delfrågans id eller dess lydelse i affects — ` +
    "höj inte taket. Är orsaken en tömd cell är det E5 som biter.",
);

console.log(errors === 0 ? "rattelsenoter: alla grindar gröna" : `rattelsenoter: ${errors} grindar föll`);
if (errors > 0) process.exit(1);
