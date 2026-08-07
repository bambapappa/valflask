/**
 * Granskningsflödet (H6) för kopplingsförslag — ägarens beslut, aldrig kodens.
 *
 * Samma mönster och samma kommandon som valflasks granskningskö
 * (/godkänn, /avvisa), egen etikett: koppling-kö. Kön
 * data/kopplingsforslag.json synkas till GitHub-issues, ägarens kommentar
 * exekveras av en workflow, godkända förslag flyttas till
 * data/kopplingar.json med status aktiv och verified_by "owner".
 *
 * Privat tills HV5: issues skapas i DETTA repo — aldrig i valflask före
 * lanseringsgrinden. Vid HV5 speglas flödet till valflask (spec §8).
 *
 * Ren logik utan fil- och nätverksåtkomst — CLI och workflowskript ligger i
 * scripts/koppling-granska.mts, koppling-issues.mts, koppling-kommentar.mts.
 */

import { createHash } from "node:crypto";
import type { Handling } from "./handlingar.ts";
import type { KopplingsForslag } from "./grindar.ts";
import { avslagsbeslut, CITAT_MIN_TECKEN, normalizeForVerbatim } from "./grindar.ts";
import { dokumentUrl } from "./riksdagen.ts";
// Delad med Fläskvågens pipeline med flit. Hashen som avgör om en sak ändrats
// sedan den prövades räknas på tre ställen — här, i valflasks review och i
// logg.py — och två kopior av den formeln hade glidit isär utan att något
// syntes förrän grinden började stoppa allt.
import { provningsGrind, type Provning } from "../../../pipeline/src/provningar.ts";

/** En köpost i data/kopplingsforslag.json (skriven av scripts/foreslag.mts). */
export interface KoPost extends KopplingsForslag {
  skapad: string;
  extraction: { model: string; verified_by: string | null; run_id: string };
}

/** En fastställd koppling i data/kopplingar.json (kopplingar.schema.json). */
export interface KopplingPost {
  id: string;
  promise_id?: string;
  stance_id?: string;
  handling_id: string;
  riktning: "stodjer" | "motverkar";
  bevis: { citat: string; sida?: number | null; kalla_dok_id?: string };
  /**
   * Vad punkten avslog, när beviset bara är en lista på avslagna motioner.
   * Yrkandenas egna lydelser, hämtade ur motionerna punkten pekar ut — aldrig
   * skrivna för hand. Fylls av `npm run avslag-backfill`.
   */
  avslaget?: Avslag[];
  motionstyp?: "parti" | "kommitte" | "enskild";
  method_note: string;
  confidence: number;
  extraction: { model: string; verified_by: string | null; run_id: string };
  status: "aktiv" | "indragen";
  indragen?: { datum: string; skal: string };
}

/** Ett avslaget yrkande: adressen punkten ger, och lydelsen den pekar på. */
export interface Avslag {
  /** Motionens beteckning, som den står i punkten: "2024/25:3435". */
  motion: string;
  /** Motionärens parti i gemener; tom sträng för partilös. */
  parti: string;
  /** Yrkandenumret, eller undefined när punkten avslår hela motionen. */
  yrkande?: string;
  /** Motionens dok-id hos riksdagen — så lydelsen går att slå upp. */
  dok_id: string;
  /** Yrkandets egen lydelse, ordagrant ur riksdagens yrkandelista. */
  lydelse: string;
}

/**
 * Stabilt id för en kö-post: hash av målets id + handlingens id — samma
 * nyckel som förslagsstegets dubblettskydd. Issue-titeln bär id:t, så
 * beslutet träffar rätt post oavsett hur kö-index förskjutits.
 */
export function kopplingId(post: Pick<KoPost, "promise_id" | "stance_id" | "handling_id">): string {
  const target = post.promise_id ?? post.stance_id ?? "";
  return createHash("sha256").update(`${target}::${post.handling_id}`).digest("hex").slice(0, 12);
}

export function findIndexByKopplingId(items: KoPost[], id: string): number {
  return items.findIndex((p) => kopplingId(p) === id);
}

export type GranskningsKommando =
  | {
      action: "approve";
      motionstyp?: "parti" | "kommitte" | "enskild";
      /** Ett bättre citat ur SAMMA dokument, angivet av granskaren. */
      bevis?: string;
    }
  | { action: "reject"; reason: string };

const MOTIONSTYPER: Record<string, "parti" | "kommitte" | "enskild"> = {
  parti: "parti",
  kommitte: "kommitte",
  "kommitté": "kommitte",
  enskild: "enskild",
};

/**
 * Tolkar en issue-kommentar från ägaren till ett granskningsbeslut.
 *  /godkänn                        → ja, förslaget som det står
 *  /godkänn --motionstyp parti     → ja, och motionstypen sätts av granskaren
 *                                    (b-0007: "parti" sätts alltid av människa)
 *  /avvisa <skäl>                  → nej
 * Engelska alias: /approve, /reject. Endast FÖRSTA raden tolkas som kommando.
 *
 * En rad som börjar "Bevis:" byter ut förslagets citat mot ett bättre ur SAMMA
 * dokument. Den låg tidigare utanför räckhåll: en genomgång av kön 2026-08-02
 * lade 28 förslag i högen "citatet bär inte, men dokumentet bär sannolikt ett
 * bättre" — och det fanns ingen väg att lägga in det bättre citatet. Det nya
 * citatet prövas ordagrant mot källdokumentet innan det sparas; håller det
 * inte sker ingen ändring alls. Formen speglar granskningsköns "Uträkning:".
 *
 * Okänt eller grumligt kommando ⇒ null (workflown svarar med hjälptext).
 */
export function parseGranskningsKommando(body: string): GranskningsKommando | null {
  const text = (body ?? "").trim();
  const line = text.split("\n", 1)[0]!.trim();
  // Citatet får bära vad som helst utom radbrytning — kapa vid signaturens
  // vågräta linje, precis som granskningskön gör med uträkningen, så att en
  // signatur aldrig kan hamna i ett publicerat bevis.
  const efterKommando = text
    .slice(line.length)
    .split(/\n[ \t]*(?:-{3,}|_{3,}|\*{3,})[ \t]*(?:\n|$)/u)[0]!;
  const bevisMatch = efterKommando.match(/^[ \t]*Bevis:[ \t]*(.+)$/imu);
  const bevis = bevisMatch?.[1]?.trim();

  const approve = line.match(/^\/(?:godkänn|godkann|approve)\b(.*)$/iu);
  if (approve) {
    const rest = approve[1]!.trim();
    const medBevis = bevis && bevis !== "" ? { bevis } : {};
    if (rest === "") return { action: "approve", ...medBevis };
    const m = rest.match(/^--motionstyp[= ]+(\S+)$/u);
    const typ = m ? MOTIONSTYPER[m[1]!.toLowerCase()] : undefined;
    if (!typ) return null; // något annat än ren motionstyp — be om förtydligande
    return { action: "approve", motionstyp: typ, ...medBevis };
  }
  const reject = line.match(/^\/(?:avvisa|reject)\b(.*)$/iu);
  if (reject) {
    const reason = reject[1]!.trim();
    return { action: "reject", reason: reason === "" ? "avvisad via koppling-issue" : reason };
  }
  return null;
}

/** Nästa lediga kopplings-id: k-<år>-NNNN i stigande följd. */
export function nastaKopplingsId(kopplingar: Array<{ id: string }>, year: number): string {
  const max = kopplingar.reduce((acc, k) => {
    const m = k.id.match(/^k-\d{4}-(\d{4})$/u);
    return m ? Math.max(acc, parseInt(m[1]!, 10)) : acc;
  }, 0);
  return `k-${year}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Prövar ett citat granskaren angett mot källdokumentets text. Samma kanon och
 * samma golv som H2 använder när förslaget skapas — ett bevis som byts ut ska
 * hålla exakt lika hårt som ett bevis som föreslås.
 *
 * Källtexten hämtas av anroparen (den här modulen rör aldrig nätet), så
 * kontrollen sker mot dokumentet som det ser ut NU, inte mot en kopia.
 */
export function provaNyttBevis(
  citat: string,
  kalltext: string,
): { ok: true } | { ok: false; skal: string } {
  const c = normalizeForVerbatim(citat);
  if (c.length < CITAT_MIN_TECKEN) {
    return { ok: false, skal: `Citatet har ${c.length} tecken — minst ${CITAT_MIN_TECKEN} krävs.` };
  }
  if (!normalizeForVerbatim(kalltext).includes(c)) {
    return {
      ok: false,
      skal:
        "Citatet står inte ordagrant i riksdagsdokumentet. Kontrollera att det är kopierat teckenrätt " +
        "och att det kommer ur SAMMA dokument som förslaget pekar på.",
    };
  }
  return { ok: true };
}

/** Fel i granskningen som ska besvaras vänligt, inte krascha workflown. */
export class GranskningsFel extends Error {}

export interface GodkannResultat {
  kopplingar: KopplingPost[];
  ko: KoPost[];
  koppling: KopplingPost;
}

/**
 * Verkställer ett godkännande: validerar postens offlineinvariant­er
 * (H2:s ordagranna kontroll gjordes mot källtexten när förslaget skapades
 * och citatet är oförändrat sedan dess), flyttar posten ur kön och lägger
 * en aktiv koppling med verified_by "owner". Muterar inget — returnerar
 * nya listor.
 */
export function godkannForslag(
  ko: KoPost[],
  index: number,
  kopplingar: KopplingPost[],
  handlingar: Handling[],
  opts: {
    motionstyp?: "parti" | "kommitte" | "enskild";
    year?: number;
    /**
     * Ett bättre citat, REDAN prövat ordagrant mot källdokumentet av
     * anroparen (provaNyttBevis). Den här modulen når inte nätet och kan
     * därför inte pröva det själv — därav kravet.
     */
    bevis?: string;
    /**
     * Vad punkten avslog, hämtat av anroparen ur motionernas yrkandelistor.
     * Krävs när beviset bara avslår motioner; samma skäl som ovan — den här
     * modulen når inte nätet.
     */
    avslaget?: Avslag[];
  },
  /**
   * Kvalitetsfiltrets prövningar, lästa ur `data/provningar.json` av
   * anroparen (den här modulen rör inte filsystemet).
   *
   * Obligatorisk med flit. Vore den valfri hade varje anropare som glömde den
   * fått en tyst väg runt grinden, och det är precis så filtret blev en vana i
   * stället för en regel. En anropare som inte har indexet lämnar en tom karta
   * — och då släpps ingenting igenom, vilket är rätt svar.
   */
  provningar: Map<string, Provning>,
): GodkannResultat {
  const post = ko[index];
  if (!post) throw new GranskningsFel(`Ogiltigt kö-index ${index} — kön har ${ko.length} poster.`);
  const handling = handlingar.find((h) => h.id === post.handling_id);
  if (!handling) {
    throw new GranskningsFel(`Handlingen ${post.handling_id} finns inte i handlingar.json — kan inte godkännas.`);
  }
  if (!post.promise_id && !post.stance_id) {
    throw new GranskningsFel("Posten pekar varken på löfte eller ståndpunkt.");
  }
  if (post.riktning !== "stodjer" && post.riktning !== "motverkar") {
    throw new GranskningsFel(`Okänd riktning: "${String(post.riktning)}".`);
  }
  const citat = opts.bevis?.trim() || post.bevis?.citat || "";
  if (normalizeForVerbatim(citat).length < CITAT_MIN_TECKEN) {
    throw new GranskningsFel(`Citatet är kortare än ${CITAT_MIN_TECKEN} tecken — förslaget är trasigt, avvisa det.`);
  }
  if ((post.method_note ?? "").trim() === "") {
    throw new GranskningsFel("Posten saknar motivering (method_note).");
  }
  // Ett bevis som bara räknar upp avslagna motioner visar inte vad som
  // avslogs. Punkten pekar ut yrkandena, så uppgiften FINNS — den ska hämtas,
  // inte utelämnas. Utan den ser läsaren en lista på nummer.
  if (avslagsbeslut(citat) && (opts.avslaget ?? []).length === 0) {
    throw new GranskningsFel(
      "Beviset är en punkt som bara avslår motioner. Vad som avslogs måste stå i fältet " +
        "avslaget — kör `npm run avslag-backfill -- --koppling <id>` och godkänn sedan om.",
    );
  }
  if (opts.motionstyp && handling.kind !== "motion") {
    throw new GranskningsFel(`--motionstyp gäller bara motioner — ${post.handling_id} är ${handling.kind}.`);
  }
  const motionstyp = handling.kind === "motion" ? (opts.motionstyp ?? post.motionstyp) : undefined;
  if (handling.kind === "motion" && !motionstyp) {
    throw new GranskningsFel("Motion utan motionstyp — ange /godkänn --motionstyp parti|kommitte|enskild (b-0007).");
  }

  const year = opts.year ?? new Date().getFullYear();
  const koppling: KopplingPost = {
    id: nastaKopplingsId(kopplingar, year),
    ...(post.promise_id ? { promise_id: post.promise_id } : {}),
    ...(post.stance_id ? { stance_id: post.stance_id } : {}),
    handling_id: post.handling_id,
    riktning: post.riktning,
    bevis: { ...post.bevis, citat },
    ...((opts.avslaget ?? []).length > 0 ? { avslaget: opts.avslaget } : {}),
    ...(motionstyp ? { motionstyp } : {}),
    method_note: opts.bevis
      ? `${post.method_note} (beviset utbytt av granskaren mot ett annat citat ur samma dokument)`
      : post.method_note,
    confidence: post.confidence,
    extraction: { ...post.extraction, verified_by: "owner" },
    status: "aktiv",
  };
  // Kvalitetsfiltret, som grind. Hashen räknas på kopplingen som FAKTISKT
  // publiceras, så ett bevis utbytt vid godkännandet kräver att just det
  // citatet är prövat — ett nytt citat har aldrig gått genom filtret.
  const grind = provningsGrind(
    provningar,
    [`ko:${kopplingId(post)}`, koppling.id],
    "koppling",
    koppling as unknown as Record<string, unknown>,
  );
  if (!grind.ok) {
    throw new GranskningsFel(`Posten ${grind.skal}`);
  }

  return {
    kopplingar: [...kopplingar, koppling].sort((a, b) => a.id.localeCompare(b.id)),
    ko: ko.filter((_, i) => i !== index),
    koppling,
  };
}

/**
 * Nya poster ur en förslagskörning: de som finns i körningens resultat men
 * inte i dess startläge (per stabil nyckel mål::handling).
 */
export function nyaKoPoster(start: KoPost[], resultat: KoPost[]): KoPost[] {
  const kanda = new Set(start.map((p) => kopplingId(p)));
  return resultat.filter((p) => !kanda.has(kopplingId(p)));
}

/**
 * Lägger en körnings NYA poster på en färsk kö — och bara dem. Poster som
 * ägaren hann avgöra medan körningen pågick (borta ur färska kön men kvar i
 * körningens resultat) återuppstår aldrig: de fanns i startläget och räknas
 * därför inte som nya. Används av foreslag-workflowns pushloop vid race.
 */
export function laggTillNyaKoPoster(farsk: KoPost[], start: KoPost[], resultat: KoPost[]): KoPost[] {
  const iFarsk = new Set(farsk.map((p) => kopplingId(p)));
  return [...farsk, ...nyaKoPoster(start, resultat).filter((p) => !iFarsk.has(kopplingId(p)))];
}

/**
 * Städar bort kö-poster vars mål inte längre kan bära en koppling.
 *
 * Ett löfte som dragits tillbaka har ett mänskligt beslut bakom sig, och det
 * beslutet är verkställt. Ligger ett förslag kvar mot det kan kopplingen
 * godkännas — och då pekar rutnätet på ett löfte som inte finns.
 *
 * Granskningskön i valflask har haft den här städningen sedan tidigare
 * (publish.ts). Kopplingskön saknade den: vid genomgången 2026-08-06 hängde
 * ett förslag på p-2026-0131, som dragits tillbaka dagen innan.
 *
 * `aktivaLoften` är id:na på de löften som får bära en koppling — de som finns
 * OCH inte är tillbakadragna. Ett löfte som försvunnit ur registret helt kan
 * lika lite bära en koppling och städas på samma grund.
 *
 * Bara löften prövas. Ett förslag som pekar på en ståndpunkt lämnas orört:
 * ståndpunkternas id-form är ännu inte fastställd i specen, och en gissad form
 * hade tömt hela den sidan av kön tyst. Fastställs formen hör prövningen hemma
 * här, med sitt eget test.
 */
export function stadaAvgjorda(ko: KoPost[], aktivaLoften: Set<string>): {
  kvar: KoPost[];
  bortstadade: KoPost[];
} {
  const kvar: KoPost[] = [];
  const bortstadade: KoPost[] = [];
  for (const post of ko) {
    // Bär posten inget löfte är den antingen en ståndpunktskoppling eller
    // trasig på ett annat sätt. Båda felen ska synas där de hör hemma.
    if (post.promise_id === undefined || aktivaLoften.has(post.promise_id)) kvar.push(post);
    else bortstadade.push(post);
  }
  return { kvar, bortstadade };
}

export interface AvvisaResultat {
  ko: KoPost[];
  post: KoPost;
}

/**
 * Verkställer en avvisning: posten lyfts ur kön. Skälet spåras i
 * issuekommentaren och i gitdiffen — kön är ingen publicerad data, så
 * ingen rättelsenot behövs (samma princip som valflask).
 */
export function avvisaForslag(ko: KoPost[], index: number): AvvisaResultat {
  const post = ko[index];
  if (!post) throw new GranskningsFel(`Ogiltigt kö-index ${index} — kön har ${ko.length} poster.`);
  return { ko: ko.filter((_, i) => i !== index), post };
}

/** Löftesfält issue-texten visar när valflask-datat finns till hands. */
export interface LofteInfo {
  id: string;
  title?: string;
  quote?: string;
  parties?: string[];
}

export function byggIssueTitel(post: KoPost, id: string, handling?: Handling): string {
  const target = post.promise_id ?? post.stance_id ?? "?";
  const kind = handling ? ` (${handling.kind})` : "";
  return `[koppling ${id}] ${target} ↔ ${post.handling_id}${kind}`;
}

/**
 * Issue-texten: allt ägaren behöver för H6-beslutet — löftet, handlingen,
 * riktningen, det ordagranna citatet med källänk, motiveringen — plus
 * beslutstabellen. Ren funktion, testbar utan GitHub.
 */
export function byggIssueBody(post: KoPost, id: string, handling?: Handling, lofte?: LofteInfo): string {
  const lines: string[] = [];
  const target = post.promise_id ?? post.stance_id ?? "?";

  // Kön ligger numera i det publika repot, så vem som helst kan läsa det här
  // issuet. Rubriken avslöjar ingenting — den bär bara två id:n — men den som
  // öppnar issuet ser ett påstående om ett parti som ingen människa har prövat.
  // Varningen står därför överst, före allt annat: den som kan läsa påståendet
  // kan aldrig missa förbehållet.
  lines.push(`> ⚠️ **Ogranskat förslag — inte publicerat, inte kontrollerat av en människa.**`);
  lines.push(`> En språkmodell har föreslagit att riksdagshandlingen nedan hör ihop med löftet.`);
  lines.push(`> Förslaget kan vara fel: det kan gälla fel beslut, citera fel parti eller peka på`);
  lines.push(`> papperet löftet självt stod skrivet på. Ingenting av det här syns på sajten, och`);
  lines.push(`> ingenting räknas, förrän en människa läst citatet mot källan och sagt ja.`);
  lines.push(`> **Läs det som en fråga, inte som ett påstående om partiet.**`);
  lines.push("");

  lines.push(`### Löfte/ståndpunkt`);
  if (lofte?.title) {
    lines.push(`**${lofte.title}** (\`${target}\`${lofte.parties?.length ? `, ${lofte.parties.map((p) => p.toUpperCase()).join(", ")}` : ""})`);
    if (lofte.quote) lines.push(`> ${lofte.quote.replace(/\n/gu, "\n> ")}`);
  } else {
    lines.push(`\`${target}\` — titel och citat finns i valflask \`data/promises.json\`.`);
  }
  lines.push("");

  lines.push(`### Riksdagshandling`);
  if (handling) {
    lines.push(`**${handling.titel}** (\`${handling.id}\`, ${handling.kind}, ${handling.datum})`);
    lines.push(`Källa: ${handling.url}`);
    if (handling.kind === "votering" && handling.utfall) lines.push(`Kammarens utfall: **${handling.utfall}**.`);
  } else {
    lines.push(`\`${post.handling_id}\` — SAKNAS i handlingar.json; godkännande kommer att stoppas.`);
  }
  lines.push("");

  lines.push(`### Föreslagen koppling`);
  const riktningsord = post.riktning === "stodjer" ? "stödjer" : "motverkar";
  if (handling?.kind === "votering") {
    lines.push(`**Riktning:** ett bifall (Ja) i voteringen **${riktningsord}** löftet — partiernas och ledamöternas faktiska röster ger sedan utslaget i domsmotorn.`);
  } else {
    lines.push(`**Riktning:** handlingen **${riktningsord}** löftet.`);
  }
  lines.push("");
  lines.push(`> ${post.bevis.citat.replace(/\n/gu, "\n> ")}`);
  lines.push("");
  if (post.bevis.kalla_dok_id) {
    lines.push(`Citatet står i betänkandet: ${dokumentUrl(post.bevis.kalla_dok_id)} — kontrollerat ord för ord mot dess text när förslaget skapades.`);
  } else {
    lines.push(`Citatet är kontrollerat ord för ord mot handlingens text när förslaget skapades.`);
  }
  lines.push(`**Motivering:** ${post.method_note}`);
  lines.push(`**Confidence:** ${post.confidence} · modell \`${post.extraction.model}\` · körning \`${post.extraction.run_id}\``);
  if (handling?.kind === "motion") {
    const rd = handling.motionstyp
      ? ` (riksdagens egen klassning: **${handling.motionstyp}**)`
      : " (riksdagen har ingen klassning — t.ex. utgången motion; avgör själv)";
    lines.push(`**Motionstyp:** ${post.motionstyp ?? "saknas"}${rd}. Ändra vid behov med \`/godkänn --motionstyp …\`.`);
  }
  lines.push("");

  lines.push(`### Ditt beslut`);
  lines.push("| Beslut | Kommentar |");
  lines.push("|---|---|");
  lines.push("| ✅ Ja | `/godkänn` |");
  if (handling?.kind === "motion") {
    lines.push("| ✏️ Ja, med motionstyp satt av dig | `/godkänn --motionstyp parti` (eller `kommitte`/`enskild`) |");
  }
  lines.push("| 📄 Ja, men på ett bättre citat | `/godkänn` + en rad `Bevis: <citatet>` |");
  lines.push("| ❌ Nej | `/avvisa <skäl>` |");
  lines.push("");
  lines.push(
    "Bär förslaget fel citat men dokumentet ett bättre: skriv citatet på en rad som börjar " +
      "`Bevis:` under kommandot. Det prövas ord för ord mot källdokumentet innan det sparas — " +
      "håller det inte sker ingen ändring alls.",
  );
  lines.push("");
  lines.push(`<sub>koppling-id \`${id}\` · beslutet exekveras av koppling-review-workflown och committas — full spårbarhet i git + detta issue. De automatiska kontrollerna passerades när förslaget skapades; det här är det mänskliga beslutet.</sub>`);
  return lines.join("\n");
}
