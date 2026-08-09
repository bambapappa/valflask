/**
 * Kanalbilderna — vad som står på de lodräta delningsbilderna (1080×1920).
 *
 * Den här filen räknar och skriver INGENTING själv om vad löftena kostar: alla
 * tal kommer ur `src/lib/`, precis som sajtens sidor och delningsbilderna i
 * `generate-og.mts`. Egna kopior av summeringen har glidit isär från sajten
 * förr; ett faktum har en plats.
 *
 * Två saker är särskilda för den här kanalen:
 *
 * **1. Talen skrivs som golv.** En bild som ligger kvar i ett flöde i tre
 * veckor måste vara sann i tre veckor, och beståndet växer varje vecka. Därför
 * står det aldrig "3 817 miljarder" på bilden utan "över 3 500 miljarder" —
 * ett runt tal som ligger under det mätta med marginal (`golvtal`). Det exakta
 * talet står i stället i `kanal/TEXTER.md` bredvid bilden, med mätdatum, så att
 * ingen behöver gissa vad golvet vilar på.
 *
 * **2. Bara Anton och IBM Plex Mono.** Sajtens brödtextfont är en variabel
 * fil som satori inte kan läsa (`opentype.js` faller på `fvar`-tabellen).
 * Delningsbilderna i `generate-og.mts` sätts av samma skäl i de två andra
 * familjerna, så kanalen följer den redan tagna vägen i stället för att lägga
 * till en fjärde fil i fontbudgeten.
 */
import {
  getPromises,
  getParties,
  getChangelog,
  getConstants,
  getRattelser,
} from "../src/lib/data.ts";
import { getStances, getIssuesFile } from "../src/lib/stances.ts";
import {
  totalFlasket,
  countPromises,
  partyTotalMsek,
  isActive,
  dataHash,
} from "../src/lib/calc.ts";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/* ───────────────────────────────────────────────────────── golvet under talet ── */

/**
 * Nivåerna ett tal får rundas ned till, från grövst till finast. Ett golv ska
 * kännas som ett tal en människa hade sagt: 3 500, inte 3 816. Halvsteg
 * (5 000, 500, 50) finns med därför att bara tiopotenser gör hoppen för
 * långa — 3 817 hade blivit "över 3 000".
 */
const NIVAER = [
  1e9, 5e8, 1e8, 5e7, 1e7, 5e6, 1e6, 5e5, 1e5, 5e4, 1e4, 5e3, 1e3, 5e2, 1e2, 5e1, 1e1, 5, 1,
];

/**
 * Det rundaste talet som ligger under `matt` utan att tappa mer än en femtedel.
 *
 * Marginalen är avsiktligt stor: bilden ska tåla att beståndet växer OCH att en
 * rättelse drar ned en summa, utan att någon behöver dra tillbaka en bild ur ett
 * flöde. Går inget golv att hitta (mycket små tal) returneras talet självt
 * nedrundat — då står det exakta talet på bilden, vilket är sant men kortlivat.
 */
export function golvtal(matt: number, minAndel = 0.8): number {
  if (!Number.isFinite(matt) || matt <= 0) return 0;
  for (const nivå of NIVAER) {
    const golv = Math.floor(matt / nivå) * nivå;
    if (golv > 0 && golv >= matt * minAndel) return golv;
  }
  return Math.floor(matt);
}

/** "9" ur 0,953 — andelen som hela tiondelar, alltid nedåt ("mer än 9 av 10"). */
export function avTio(andel: number): number {
  return Math.max(0, Math.min(10, Math.floor(andel * 10)));
}

/** Svenska tusental med hårt blanksteg, som resten av sajten. */
export function tal(v: number): string {
  return Math.round(v).toLocaleString("sv-SE");
}

/** Ett mätt värde som en läsare läser det: 3 816,8 — inte 3816.8. */
export function matt(v: number, decimaler = 1): string {
  return v.toLocaleString("sv-SE", { minimumFractionDigits: decimaler, maximumFractionDigits: decimaler });
}

/**
 * Ett påstående på en bild och mätningen bakom det. Renderaren visar `visat`,
 * `TEXTER.md` visar båda — och `test-kanalbilder.mts` faller om ett golv någon
 * gång skulle hamna över sin egen mätning.
 */
export interface Golvpåstående {
  pastaende: string;
  matt: string;
  mattVarde: number;
  visatVarde: number;
}

/* ───────────────────────────────────────────────────────────── bildens delar ── */

export type Block =
  | { typ: "kicker"; text: string }
  | { typ: "rubrik"; text: string; grad?: number }
  | { typ: "brodtext"; text: string; grad?: number }
  | { typ: "jattetal"; over: string | null; tal: string; enhet: string; underrad: string }
  | { typ: "punkter"; poster: Array<{ etikett: string; rubrik: string; text: string }> }
  | { typ: "faktarad"; delar: string[] }
  | { typ: "statrader"; poster: Array<{ tal: string; etikett: string }> }
  | {
      typ: "staplar";
      rader: Array<{ etikett: string; andel: number; varde: string; markerad?: boolean }>;
      not: string;
    }
  | { typ: "rutnat"; kolumner: string[]; celler: boolean[]; not: string }
  | {
      typ: "panel";
      etikett: string;
      rubrik: string;
      rader: Array<{ tal?: string; text: string }>;
      not?: string;
    }
  | { typ: "luft"; hojd: number };

/**
 * Formatet avgör ramen, inte bara måtten.
 *
 * `lodrat` (1080×1920) är gjort för att skrollas förbi: en tanke per bild,
 * stora tal, och underkanten tom eftersom appens knappar ligger där.
 * `liggande` (1920×1080) är gjort för att *läsas* — som omslag till en text
 * någon redan valt att öppna. Där får bilden bära flera påståenden bredvid
 * varandra, och talen skrivs exakt i stället för som golv: en artikel är
 * daterad, och en läsare som klickar sig vidare vill kunna kontrollera talet.
 */
export type Format = "lodrat" | "liggande";

export interface Bild {
  /** Filnamnet utan ändelse, också bildens namn i `TEXTER.md`. */
  fil: string;
  format?: Format;
  serie: string;
  nr: number;
  antal: number;
  block: Block[];
  /** Källraden längst ned — obligatorisk, precis som under sajtens diagram. */
  kallrad: string;
  /** Förslag på bildtext när bilden läggs upp. */
  bildtext: string;
  /** Golven på bilden med mätningen bakom sig. */
  matningar: Golvpåstående[];
}

/* ─────────────────────────────────────────────────────────────── mätningarna ── */

function golvpåstående(pastaende: string, mattVarde: number, matt: string, visatVarde: number): Golvpåstående {
  return { pastaende, matt, mattVarde, visatVarde };
}

export interface Underlag {
  datum: string;
  akt: string;
  partier: number;
  mandat: number;
  ledamoter: number;
  sakfragor: number;
  delfragor: number;
  celler: number;
  cellerIfyllda: number;
  loften: number;
  flasketMdkr: number;
  reformutrymmeMdkr: number;
  gangerReformutrymmet: number;
  kallor: number;
  arkivandel: number;
  rattelser: number;
  handlingar: number;
  voteringar: number;
  kopplingar: number;
  handlingsvagenLedamoter: number;
  partisummor: Array<{ kod: string; namn: string; mdkr: number }>;
  rutnat: { kolumner: string[]; celler: boolean[] };
  /** Handlingsvågens utslag: hur många löften som fått ett, och hur de föll. */
  utslag: { loften: number; iLinje: number; emot: number; badeOch: number };
  /** Fritextsöket "Ämnen och ord": vad som går att söka i, och över vilken tid. */
  amnesindex: {
    handlingar: number;
    motioner: number;
    interpellationer: number;
    fragor: number;
    propositioner: number;
    fran: string;
    till: string;
  };
  /** Ett verkligt sökexempel, räknat ur samma index som sajten söker i. */
  sokexempel: {
    ord: string;
    traffar: number;
    motioner: number;
    interpellationer: number;
    fragor: number;
  };
}

/**
 * Ett sökord räknat mot ämnesindexet — samma register som sidan *Ämnen och ord*
 * söker i. Filerna är 36 MB tillsammans, så de läses en i taget och släpps:
 * bilden behöver antalet, inte indexet.
 */
function sokTraffar(ord: string, kindPerId: Map<string, string>): {
  traffar: number;
  motioner: number;
  interpellationer: number;
  fragor: number;
} {
  const kvar = { traffar: 0, motioner: 0, interpellationer: 0, fragor: 0 };
  for (const fil of readdirSync(resolve(process.cwd(), "../handlingsvagen/data/nyckelord")).sort()) {
    if (!fil.endsWith(".json")) continue;
    const del = läsHandlingsvagen<{ handlingar: Record<string, { t?: string[]; y?: string[] }> }>(
      `nyckelord/${fil}`,
    );
    for (const [id, termer] of Object.entries(del.handlingar)) {
      const alla = new Set([...(termer.t ?? []), ...(termer.y ?? [])]);
      if (!alla.has(ord)) continue;
      kvar.traffar += 1;
      const kind = kindPerId.get(id);
      if (kind === "motion") kvar.motioner += 1;
      else if (kind === "interpellation") kvar.interpellationer += 1;
      else if (kind === "skriftlig_fraga") kvar.fragor += 1;
    }
  }
  return kvar;
}

/** Handlingsvågens data ligger utanför site/ och läses rakt av — inga härledda tal. */
function läsHandlingsvagen<T>(fil: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), "../handlingsvagen/data", fil), "utf8"));
}

export function mätUnderlaget(): Underlag {
  const promises = getPromises();
  const parties = getParties();
  const changelog = getChangelog();
  const constants = getConstants();
  const stances = getStances();
  const issuesFil = getIssuesFile();

  const senaste = changelog[changelog.length - 1];
  const datum = (senaste?.timestamp ?? "").slice(0, 10) || "2026-01-01";

  const delfragor = issuesFil.issues.flatMap((f) => f.subquestions.map((d) => d.id));
  const partikoder = parties.map((p) => p.code);
  const ifylld = new Map<string, boolean>();
  for (const cell of stances) {
    ifylld.set(`${cell.subquestion_id}|${cell.party}`, cell.current.position !== "inget_tydligt_besked");
  }
  const celler: boolean[] = [];
  for (const d of delfragor) {
    for (const kod of partikoder) celler.push(ifylld.get(`${d}|${kod}`) ?? false);
  }

  const aktiva = promises.filter(isActive);
  const arkiverade = aktiva.filter((p) => Boolean(p.source.archive_url)).length;
  const kallor = new Set(aktiva.map((p) => p.source.url)).size;

  const flasketMsek = totalFlasket(promises);
  const reformutrymme = constants.reformutrymme_msek_per_ar.value;
  const reformTotalMsek = reformutrymme === "VERIFIERA" ? 0 : (reformutrymme as number) * 4;

  const handlingar = läsHandlingsvagen<Array<{ id: string; kind: string; datum: string }>>("handlingar.json");
  const kopplingar = läsHandlingsvagen<unknown[]>("kopplingar.json");
  const personer = läsHandlingsvagen<unknown[]>("personer.json");
  const domar = läsHandlingsvagen<{
    partidomar: Array<{ target_id: string; status: string }>;
  }>("domar.json");

  // Utslagen: bara de som faktiskt föll ut. "Ingen handling ännu" är inget
  // utslag — det är just det tomma som sajten vägrar fylla i.
  const avgjorda = domar.partidomar.filter((d) => d.status !== "ingen_handling_annu");

  // Ämnesindexet täcker inte hela registret: voteringarna ligger utanför, för
  // de bär ingen egen text att söka i. Talet på bilden ska vara det sökbara,
  // inte det totala.
  const kindPerId = new Map(handlingar.map((h) => [h.id, h.kind]));
  const indexerade = new Set<string>();
  for (const fil of readdirSync(resolve(process.cwd(), "../handlingsvagen/data/nyckelord")).sort()) {
    if (!fil.endsWith(".json")) continue;
    const del = läsHandlingsvagen<{ handlingar: Record<string, unknown> }>(`nyckelord/${fil}`);
    for (const id of Object.keys(del.handlingar)) indexerade.add(id);
  }
  const iIndex = handlingar.filter((h) => indexerade.has(h.id));
  const indexDatum = iIndex.map((h) => h.datum).filter(Boolean).sort();
  const antalAv = (kind: string): number => iIndex.filter((h) => h.kind === kind).length;
  const sokord = "npf";
  const traff = sokTraffar(sokord, kindPerId);

  return {
    datum,
    akt: dataHash(changelog).slice(0, 8),
    partier: parties.length,
    mandat: parties.reduce((s, p) => s + p.mandate_2022, 0),
    ledamoter: personer.length,
    sakfragor: issuesFil.issues.length,
    delfragor: delfragor.length,
    celler: celler.length,
    cellerIfyllda: celler.filter(Boolean).length,
    loften: countPromises(promises),
    flasketMdkr: flasketMsek / 1000,
    reformutrymmeMdkr: reformTotalMsek / 1000,
    gangerReformutrymmet: reformTotalMsek > 0 ? flasketMsek / reformTotalMsek : 0,
    kallor,
    arkivandel: aktiva.length > 0 ? arkiverade / aktiva.length : 0,
    rattelser: getRattelser().length,
    handlingar: handlingar.length,
    voteringar: handlingar.filter((h) => h.kind === "votering").length,
    kopplingar: kopplingar.length,
    handlingsvagenLedamoter: personer.length,
    partisummor: parties
      .map((p) => ({ kod: p.code.toUpperCase(), namn: p.name, mdkr: partyTotalMsek(promises, p.code) / 1000 }))
      .sort((a, b) => b.mdkr - a.mdkr),
    rutnat: { kolumner: partikoder.map((k) => k.toUpperCase()), celler },
    utslag: {
      loften: new Set(avgjorda.map((d) => d.target_id)).size,
      iLinje: avgjorda.filter((d) => d.status === "agerat_i_linje").length,
      emot: avgjorda.filter((d) => d.status === "agerat_emot").length,
      badeOch: avgjorda.filter((d) => d.status === "bade_och").length,
    },
    amnesindex: {
      handlingar: iIndex.length,
      motioner: antalAv("motion"),
      interpellationer: antalAv("interpellation"),
      fragor: antalAv("skriftlig_fraga"),
      propositioner: antalAv("proposition"),
      fran: indexDatum[0] ?? "",
      till: indexDatum[indexDatum.length - 1] ?? "",
    },
    sokexempel: { ord: sokord, ...traff },
  };
}

/* ────────────────────────────────────────────────────────────────── bilderna ── */

const SERIE_A = "SÅ FUNKAR DET";
const SERIE_B = "DAGENS SIFFROR";

export function byggBilder(u: Underlag): Bild[] {
  const kallradA = `utlovat.se · granskning inför riksdagsvalet 13 september 2026`;
  const kallradB = `Källa: utlovat.se · mätt ${u.datum} · akt ${u.akt}`;

  /* Golven, en gång, så att bild och TEXTER.md aldrig kan säga olika. */
  const gFlask = golvtal(u.flasketMdkr);
  const gLoften = golvtal(u.loften);
  const gGanger = golvtal(u.gangerReformutrymmet);
  const gLedamoter = golvtal(u.ledamoter);
  const gHandlingar = golvtal(u.handlingar);
  const gVoteringar = golvtal(u.voteringar);
  const gKopplingar = golvtal(u.kopplingar);
  const gKallor = golvtal(u.kallor);
  const gRattelser = golvtal(u.rattelser);
  const gArkiv = avTio(u.arkivandel);
  const tommaAndel = u.celler > 0 ? (u.celler - u.cellerIfyllda) / u.celler : 0;
  const gTomma = avTio(tommaAndel);

  const a: Bild[] = [
    {
      fil: "a1-vad-ar-utlovat",
      serie: SERIE_A,
      nr: 1,
      antal: 7,
      block: [
        { typ: "kicker", text: "RIKSDAGSVALET 13 SEPTEMBER 2026" },
        { typ: "rubrik", text: "VI LÄSER VALLÖFTENA. DU FÅR KVITTOT." },
        {
          typ: "brodtext",
          text:
            "Alla åtta riksdagspartiers löften på ett ställe: vad de sa, ord för ord, vad det kostar, och vad de faktiskt har gjort i riksdagen.",
        },
        {
          typ: "brodtext",
          text: "Ingen tyckare. Inga anonyma påståenden. Varje siffra går att följa tillbaka till källan.",
        },
        { typ: "faktarad", delar: [`${u.partier} PARTIER`, "3 VÅGOR", "1 VALDAG"] },
      ],
      kallrad: kallradA,
      bildtext:
        "Vi läser alla åtta riksdagspartiers vallöften och visar vad de kostar, var partierna står och vad de faktiskt gjort i riksdagen. Med citat, källa och arkivkopia på varje påstående. utlovat.se",
      matningar: [],
    },
    {
      fil: "a2-tre-vagor",
      serie: SERIE_A,
      nr: 2,
      antal: 7,
      block: [
        { typ: "kicker", text: "TRE SÄTT ATT GRANSKA SAMMA PARTI" },
        { typ: "rubrik", text: "TRE VÅGOR", grad: 132 },
        {
          typ: "punkter",
          poster: [
            {
              etikett: "1",
              rubrik: "FLÄSKVÅGEN",
              text: "Vad löftena kostar. Varje löfte har ett citat, en källa och en uträkning du kan följa steg för steg.",
            },
            {
              etikett: "2",
              rubrik: "FRÅGEVÅGEN",
              text: `Var partierna står i ${u.sakfragor} sakfrågor. Ruta för ruta, belagt med exakta citat.`,
            },
            {
              etikett: "3",
              rubrik: "HANDLINGSVÅGEN",
              text: "Håller de vad de lovar? Löftena vägs mot vad partierna och ledamöterna gjort i riksdagen.",
            },
          ],
        },
      ],
      kallrad: kallradA,
      bildtext:
        "Tre vågor: vad löftena kostar (Fläskvågen), var partierna står (Frågevågen) och vad de faktiskt gjort i riksdagen (Handlingsvågen). Allt på utlovat.se",
      matningar: [],
    },
    {
      fil: "a3-omfattningen",
      serie: SERIE_A,
      nr: 3,
      antal: 7,
      block: [
        { typ: "kicker", text: "VAD SOM LIGGER PÅ BORDET" },
        { typ: "rubrik", text: "HELA RIKSDAGEN, INGET URVAL", grad: 104 },
        {
          typ: "statrader",
          poster: [
            { tal: `${u.partier}`, etikett: "PARTIER I RIKSDAGEN — ALLA GRANSKAS LIKA" },
            { tal: `${u.mandat}`, etikett: "MANDAT SOM STÅR PÅ SPEL DEN 13 SEPTEMBER" },
            { tal: `${tal(gLedamoter)}+`, etikett: "LEDAMÖTER VARS RIKSDAGSARBETE VÄGS MOT LÖFTENA" },
            { tal: `${u.sakfragor}`, etikett: `SAKFRÅGOR, UPPDELADE I ${u.delfragor} RAKA DELFRÅGOR` },
          ],
        },
      ],
      kallrad: kallradB,
      bildtext:
        "Alla åtta partier, alla 349 mandat, hela mandatperiodens riksdagsarbete. Ingen får en snällare eller hårdare måttstock än någon annan. utlovat.se",
      matningar: [
        golvpåstående(`över ${tal(gLedamoter)} ledamöter`, u.ledamoter, `${tal(u.ledamoter)} ledamöter i registret`, gLedamoter),
      ],
    },
    {
      fil: "a4-sa-kontrolleras-ett-lofte",
      serie: SERIE_A,
      nr: 4,
      antal: 7,
      block: [
        { typ: "kicker", text: "FRÅN UTTALANDE TILL SIFFRA" },
        { typ: "rubrik", text: "SÅ KONTROLLERAS ETT LÖFTE", grad: 104 },
        {
          typ: "punkter",
          poster: [
            { etikett: "1", rubrik: "CITATET", text: "Partiets egna ord, ord för ord. Ingen omskrivning, ingen tolkning." },
            { etikett: "2", rubrik: "KÄLLAN", text: "Länk dit det sades — plus en arkivkopia där citatet måste stå kvar." },
            { etikett: "3", rubrik: "UTRÄKNINGEN", text: "Varje krona räknas fram öppet. Stegen står på löftets egen sida." },
            { etikett: "4", rubrik: "MÄNNISKAN", text: "Ingen summa publiceras utan att en människa har godkänt den." },
          ],
        },
      ],
      kallrad: kallradA,
      bildtext:
        "Citat ord för ord, källa med arkivkopia, uträkning i öppen dager, och en människa som godkänner varje belopp. Så blir ett uttalande en siffra på utlovat.se",
      matningar: [],
    },
    {
      fil: "a5-tomma-celler",
      serie: SERIE_A,
      nr: 5,
      antal: 7,
      block: [
        { typ: "kicker", text: "DÄRFÖR ÄR VISSA RUTOR TOMMA" },
        { typ: "rubrik", text: "HELLRE TOMT ÄN PÅHITTAT" },
        {
          typ: "brodtext",
          text: "Har ett parti inte sagt något tydligt i en fråga lämnar vi rutan tom. Vi gissar inte, och vi tolkar inte in ett svar som inte finns.",
        },
        {
          typ: "brodtext",
          text: "En tom ruta betyder: vi har inte hittat ett rent besked. Den betyder inte att partiet saknar åsikt.",
        },
        { typ: "faktarad", delar: ["INGEN GISSNING", "INGEN TOLKNING"] },
      ],
      kallrad: kallradA,
      bildtext:
        "En tom ruta är ett ärligt svar. Hittar vi inget rent citat får rutan stå tom — vi fyller aldrig ut med gissningar för att det ska se komplett ut. utlovat.se",
      matningar: [],
    },
    {
      fil: "a6-vi-rattar-synligt",
      serie: SERIE_A,
      nr: 6,
      antal: 7,
      block: [
        { typ: "kicker", text: "NÄR VI HAR FEL" },
        { typ: "rubrik", text: "FEL RÄTTAS ÖPPET" },
        {
          typ: "brodtext",
          text: "Blir något fel skriver vi det på sidan där felet stod, och i en rättelselogg som alla kan läsa. Vad som var fel, varför, och vad som ändrades.",
        },
        { typ: "brodtext", text: "Ingen siffra ändras i tysthet. Det är hela poängen med att visa uträkningen." },
        { typ: "faktarad", delar: ["ÖPPEN RÄTTELSELOGG", "INGEN TYST ÄNDRING"] },
      ],
      kallrad: kallradA,
      bildtext:
        "Vi har fel ibland. Då står felet kvar, synligt, tillsammans med rättelsen — i en öppen logg som vem som helst kan läsa. utlovat.se/rattelser",
      matningar: [],
    },
    {
      fil: "a7-gor-det-sjalv",
      serie: SERIE_A,
      nr: 7,
      antal: 7,
      block: [
        { typ: "kicker", text: "SAJTEN GÖR MER ÄN LISTAR" },
        { typ: "rubrik", text: "TESTA SJÄLV", grad: 132 },
        {
          typ: "punkter",
          poster: [
            { etikett: "→", rubrik: "BYGG EN KOALITION", text: "Välj partier och se vad deras löften skulle kosta tillsammans." },
            { etikett: "→", rubrik: "SÖK BLAND LÖFTENA", text: "Skriv in en fråga du bryr dig om och se vem som lovat vad." },
            { etikett: "→", rubrik: "TOPPLISTOR", text: "Dyrast, störst, senast — och vad som ligger bakom varje siffra." },
            { etikett: "→", rubrik: "TA DATAT", text: "Allt är fritt att ladda ner och använda vidare (CC BY 4.0)." },
          ],
        },
      ],
      kallrad: kallradA,
      bildtext:
        "Bygg din egen koalition, sök bland löftena, läs topplistorna — eller ladda ner hela datat och räkna själv. utlovat.se",
      matningar: [],
    },
  ];

  const b: Bild[] = [
    {
      fil: "b1-vad-loftena-kostar",
      serie: SERIE_B,
      nr: 1,
      antal: 6,
      block: [
        { typ: "kicker", text: "VALLÖFTENA FÖR 2027–2030" },
        { typ: "jattetal", over: "ÖVER", tal: tal(gFlask), enhet: "MILJARDER KRONOR", underrad: "hittills, från alla åtta partier" },
        {
          typ: "brodtext",
          text: `Summan av vad partiernas löften skulle kosta staten under nästa mandatperiod. Varje krona är räknad öppet, löfte för löfte.`,
        },
        { typ: "faktarad", delar: [`ÖVER ${tal(gLoften)} LÖFTEN`, `${u.partier} PARTIER`] },
      ],
      kallrad: kallradB,
      bildtext:
        `Vallöftena för 2027–2030 kostar hittills över ${tal(gFlask)} miljarder kronor tillsammans. Uträkningen bakom varje belopp ligger öppen på utlovat.se`,
      matningar: [
        golvpåstående(`över ${tal(gFlask)} miljarder kronor`, u.flasketMdkr, `${matt(u.flasketMdkr)} miljarder kronor`, gFlask),
        golvpåstående(`över ${tal(gLoften)} löften`, u.loften, `${tal(u.loften)} aktiva löften`, gLoften),
      ],
    },
    {
      fil: "b2-mot-reformbudgeten",
      serie: SERIE_B,
      nr: 2,
      antal: 6,
      block: [
        { typ: "kicker", text: "LÖFTENA MOT PENGARNA SOM FINNS" },
        // "För mycket" vore ett omdöme om politiken. Bilden säger hur mycket
        // större önskelistan är än utrymmet — och läsaren drar slutsatsen.
        { typ: "rubrik", text: `MER ÄN ${tal(gGanger)} GÅNGER STÖRRE ÄN UTRYMMET`, grad: 92 },
        {
          typ: "staplar",
          rader: [
            { etikett: "LÖFTENA", andel: 1, varde: `över ${tal(gFlask)} mdkr`, markerad: true },
            { etikett: "UTRYMMET", andel: Math.min(1, u.reformutrymmeMdkr / Math.max(u.flasketMdkr, 1)), varde: `${tal(u.reformutrymmeMdkr)} mdkr` },
          ],
          not: "Utrymmet = regeringens reformvolym i budgeten för 2026, gånger fyra år.",
        },
        {
          typ: "brodtext",
          text: "Allt kommer inte att genomföras — det är inte heller påståendet. Bilden visar hur mycket större önskelistan är än pengarna som brukar finnas.",
        },
      ],
      kallrad: kallradB,
      bildtext:
        `Partiernas löften är mer än ${tal(gGanger)} gånger större än den reformbudget en regering brukar ha under fyra år. Uträkningen ligger öppen på utlovat.se/metod`,
      matningar: [
        golvpåstående(`mer än ${tal(gGanger)} gånger`, u.gangerReformutrymmet, `${matt(u.gangerReformutrymmet)} gånger reformutrymmet`, gGanger),
        golvpåstående(`över ${tal(gFlask)} mdkr`, u.flasketMdkr, `${matt(u.flasketMdkr)} mdkr`, gFlask),
      ],
    },
    {
      fil: "b3-vem-lovar-mest",
      serie: SERIE_B,
      nr: 3,
      antal: 6,
      block: [
        { typ: "kicker", text: "SUMMAN AV VARJE PARTIS LÖFTEN" },
        { typ: "rubrik", text: "VEM LOVAR MEST?", grad: 116 },
        {
          typ: "staplar",
          rader: u.partisummor.map((p) => ({
            etikett: p.kod,
            andel: p.mdkr / Math.max(...u.partisummor.map((x) => x.mdkr)),
            varde: `över ${tal(golvtal(p.mdkr))} mdkr`,
          })),
          not: "Miljarder kronor för hela mandatperioden 2027–2030. Besparingar dras av.",
        },
        {
          typ: "brodtext",
          text: "Ett stort tal är inte samma sak som en dålig politik — och ett litet är inte samma sak som en billig. Ett parti som lovat färre saker har en kortare lista, inte en snålare.",
          grad: 30,
        },
      ],
      kallrad: kallradB,
      bildtext:
        "Summan av varje partis löften för 2027–2030. Beloppen bygger på partiernas egna ord och uträkningar du kan läsa rad för rad. utlovat.se/jamfor",
      matningar: u.partisummor.map((p) =>
        golvpåstående(`${p.namn}: över ${tal(golvtal(p.mdkr))} mdkr`, p.mdkr, `${matt(p.mdkr)} mdkr`, golvtal(p.mdkr)),
      ),
    },
    {
      fil: "b4-tomma-rutor",
      serie: SERIE_B,
      nr: 4,
      antal: 6,
      block: [
        { typ: "kicker", text: "FRÅGEVÅGEN JUST NU" },
        { typ: "rubrik", text: `MER ÄN ${gTomma} AV 10 RUTOR ÄR TOMMA`, grad: 96 },
        {
          typ: "rutnat",
          kolumner: u.rutnat.kolumner,
          celler: u.rutnat.celler,
          not: `${u.delfragor} delfrågor × ${u.partier} partier. Fylld ruta = partiet har gett ett rent besked.`,
        },
        {
          typ: "brodtext",
          text: "Så här mycket vet vi alltså inte — och vi låtsas inte annat. Rutan fylls först när partiet sagt något tydligt som går att citera.",
          grad: 30,
        },
      ],
      kallrad: kallradB,
      bildtext:
        "Så här ser Frågevågen ut i dag: de flesta rutor är tomma, för de flesta partier har inte gett ett rent besked i de flesta delfrågor. Vi fyller dem inte med gissningar. utlovat.se/fragor",
      matningar: [
        golvpåstående(`mer än ${gTomma} av 10 rutor tomma`, tommaAndel * 10, `${matt(tommaAndel * 100, 0)} % tomma (${u.celler - u.cellerIfyllda} av ${u.celler})`, gTomma),
      ],
    },
    {
      fil: "b5-handlingsvagen",
      serie: SERIE_B,
      nr: 5,
      antal: 6,
      block: [
        { typ: "kicker", text: "HÅLLER DE VAD DE LOVAR?" },
        { typ: "rubrik", text: "ORDEN VÄGS MOT HANDLINGARNA", grad: 96 },
        {
          typ: "statrader",
          poster: [
            { tal: `${tal(gHandlingar)}+`, etikett: "RIKSDAGSHANDLINGAR GENOMSÖKTA" },
            { tal: `${tal(gVoteringar)}+`, etikett: "VOTERINGAR — VEM RÖSTADE HUR" },
            { tal: `${tal(gKopplingar)}+`, etikett: "KOPPLINGAR MELLAN LÖFTE OCH HANDLING, EN OCH EN GODKÄNDA" },
          ],
        },
        {
          typ: "brodtext",
          text: "Motioner, frågor, interpellationer och voteringar från hela mandatperioden. Ingen koppling publiceras utan att en människa sagt ja.",
          grad: 30,
        },
      ],
      kallrad: kallradB,
      bildtext:
        "Vi väger löftena mot vad partierna faktiskt gjort i riksdagen: motioner, frågor och voteringar från hela mandatperioden. utlovat.se/handlingsvagen",
      matningar: [
        golvpåstående(`över ${tal(gHandlingar)} riksdagshandlingar`, u.handlingar, `${tal(u.handlingar)} handlingar`, gHandlingar),
        golvpåstående(`över ${tal(gVoteringar)} voteringar`, u.voteringar, `${tal(u.voteringar)} voteringar`, gVoteringar),
        golvpåstående(`över ${tal(gKopplingar)} kopplingar`, u.kopplingar, `${tal(u.kopplingar)} godkända kopplingar`, gKopplingar),
      ],
    },
    {
      fil: "b6-kvittot",
      serie: SERIE_B,
      nr: 6,
      antal: 6,
      block: [
        { typ: "kicker", text: "VARFÖR DU KAN KONTROLLERA OSS" },
        { typ: "rubrik", text: `MER ÄN ${gArkiv} AV 10 LÖFTEN HAR EN ARKIVKOPIA`, grad: 88 },
        {
          typ: "brodtext",
          text: "En arkivkopia är ett fruset ögonblick av sidan där löftet stod. Tas sidan bort finns citatet kvar — och citatet måste stå ordagrant i kopian.",
        },
        {
          typ: "statrader",
          poster: [
            { tal: `${tal(gKallor)}+`, etikett: "SKILDA KÄLLOR BAKOM LÖFTENA" },
            { tal: `${tal(gRattelser)}+`, etikett: "RÄTTELSER VI PUBLICERAT OM OSS SJÄLVA" },
          ],
        },
      ],
      kallrad: kallradB,
      bildtext:
        "Nästan varje löfte vi publicerar har en arkivkopia där citatet står kvar ord för ord, även om partiet tar bort sidan. Kontrollera oss gärna. utlovat.se/metod",
      matningar: [
        golvpåstående(`mer än ${gArkiv} av 10 med arkivkopia`, u.arkivandel * 10, `${matt(u.arkivandel * 100)} % har arkivkopia`, gArkiv),
        golvpåstående(`över ${tal(gKallor)} källor`, u.kallor, `${tal(u.kallor)} skilda källadresser`, gKallor),
        golvpåstående(`över ${tal(gRattelser)} rättelser`, u.rattelser, `${tal(u.rattelser)} rättelseposter`, gRattelser),
      ],
    },
  ];

  /**
   * Artikelbilden. Ett annat format, en annan läsare och därför andra regler:
   * talen står exakt, inte som golv. Den här bilden hamnar överst i en text
   * någon skrivit och daterat, och en läsare som klickar sig vidare till
   * registret ska hitta samma tal där — ett golv hade sett ut som slarv.
   * Källraden bär mätdatum, som överallt annars.
   */
  const i: Bild[] = [
    {
      fil: "l1-handlingsvagen-artikelbild",
      format: "liggande",
      serie: "ARTIKELBILD",
      nr: 1,
      antal: 1,
      block: [
        { typ: "kicker", text: "HANDLINGSVÅGEN · UTLOVAT.SE" },
        { typ: "rubrik", text: "LÖFTET ÄR NYTT. ÄR POLITIKEN DET?", grad: 96 },
        {
          typ: "brodtext",
          text:
            "Inför valet 2026 lovar partierna mycket. Handlingsvågen väger löftena mot vad partierna och deras ledamöter faktiskt har gjort i riksdagen under mandatperioden 2022–2026 — och gör därmed skillnad på det som drivits i fyra år och det som dök upp i valrörelsen.",
          grad: 27,
        },
        {
          typ: "brodtext",
          text:
            "Varje koppling mellan ett löfte och en handling är granskad en och en, med handlingens egen lydelse som bevis, och godkänd av en människa innan den publiceras.",
          grad: 27,
        },
        {
          typ: "faktarad",
          delar: [`${u.partier} PARTIER`, `${u.mandat} MANDAT`, `${tal(u.handlingsvagenLedamoter)} LEDAMÖTER`],
        },
        {
          typ: "panel",
          etikett: "VAD HAR DE GJORT ÅT DET?",
          rubrik: "LÖFTE MOT HANDLING",
          rader: [
            { tal: tal(u.kopplingar), text: "granskade kopplingar mellan ett löfte och en riksdagshandling" },
            {
              tal: tal(u.utslag.loften),
              text: `löften har ett utslag — ${tal(u.utslag.iLinje)} gånger i linje, ${tal(u.utslag.emot)} gånger emot, ${tal(u.utslag.badeOch)} gånger både och`,
            },
          ],
          not: "Finns ingen handling bakom löftet står utslaget tomt. Ingen dom utan bevis.",
        },
        {
          typ: "panel",
          etikett: "ÄMNEN OCH ORD",
          rubrik: "SÖK HELA MANDATPERIODEN",
          rader: [
            {
              tal: tal(u.amnesindex.handlingar),
              text: `motioner, interpellationer, skriftliga frågor och propositioner, ${u.amnesindex.fran} till ${u.amnesindex.till}`,
            },
            {
              tal: `"${u.sokexempel.ord}"`,
              text: `ger ${tal(u.sokexempel.traffar)} handlingar: ${tal(u.sokexempel.interpellationer)} interpellationer, ${tal(u.sokexempel.motioner)} motioner, ${tal(u.sokexempel.fragor)} skriftliga frågor`,
            },
          ],
          not: "Söket dömer aldrig — riktningen kommer ur granskade utslag.",
        },
      ],
      kallrad: `Källa: utlovat.se/handlingsvagen · registret mätt ${u.datum} · akt ${u.akt} · data CC BY 4.0`,
      bildtext:
        "Inför valet är alla partier överens om att de bryr sig. Frågan är sedan när. Handlingsvågen på utlovat.se väger varje vallöfte mot partiets faktiska riksdagsarbete 2022–2026 — motion för motion, fråga för fråga — och låter utslaget stå tomt när det inte finns någon handling att väga mot. Där finns också ett fritextsök över hela mandatperiodens handlingar: skriv ett ord, till exempel npf, och få allt partierna skrivit i frågan samlat på ett ställe.",
      matningar: [],
    },
  ];

  return [...a, ...b, ...i];
}
