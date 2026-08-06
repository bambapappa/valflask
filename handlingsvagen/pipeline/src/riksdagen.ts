/**
 * Klient mot riksdagens öppna data (data.riksdagen.se).
 * Deterministisk och testbar: all nätverksåtkomst går via injicerbar fetch.
 */

export type HttpFetch = (url: string) => Promise<{ status: number; text(): Promise<string> }>;

const BASE = "https://data.riksdagen.se";

/** Dokumenttyper vi skördar. bet (betänkanden) hämtas för voteringskoppling. */
export type DokTyp = "mot" | "prop" | "ip" | "fr" | "bet";

export interface RdDokument {
  dok_id: string;
  doktyp: string;
  rm: string;
  /** Löpbeteckning inom riksmötet, t.ex. "AU10" — voteringars nyckel till betänkandet. */
  beteckning?: string;
  datum: string;
  titel: string;
  undertitel?: string;
  /** Riksdagens egen motionsklassning: "Enskild motion"/"Kommittémotion"/"Partimotion". */
  subtyp?: string;
  organ?: string;
  dokument_url_html?: string;
  dokument_url_text?: string;
  /** Intressenter (motionärer m.fl.) med parti. */
  intressenter: Array<{ namn: string; partibet: string; intressent_id?: string; roll?: string }>;
}

export interface RdVoteringRad {
  votering_id: string;
  rm: string;
  beteckning: string;
  punkt: number;
  namn: string;
  intressent_id: string;
  parti: string;
  valkrets: string;
  rost: "Ja" | "Nej" | "Avstår" | "Frånvarande";
  avser: string;
  datum?: string;
}

export interface RdPerson {
  intressent_id: string;
  tilltalsnamn: string;
  efternamn: string;
  parti: string;
  valkrets: string;
  status?: string;
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

async function getJson(fetcher: HttpFetch, url: string): Promise<unknown> {
  const res = await fetcher(url);
  if (res.status !== 200) throw new Error(`riksdagen ${res.status}: ${url}`);
  return JSON.parse(await res.text());
}

/** Tolkar en dokumentlista-sida till typade dokument. Exporterad för tester. */
export function parseDokumentLista(payload: unknown): { dokument: RdDokument[]; nextUrl: string | null } {
  const dl = (payload as { dokumentlista?: Record<string, unknown> }).dokumentlista;
  if (!dl) throw new Error("svar utan dokumentlista");
  const docs = asArray(dl["dokument"] as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map(
    (d): RdDokument => {
      const intress = d["dokintressent"] as { intressent?: unknown } | undefined;
      return {
        dok_id: String(d["dok_id"] ?? d["id"] ?? ""),
        doktyp: String(d["doktyp"] ?? ""),
        rm: String(d["rm"] ?? ""),
        ...(d["beteckning"] ? { beteckning: String(d["beteckning"]) } : {}),
        datum: String(d["datum"] ?? "").slice(0, 10),
        titel: String(d["titel"] ?? ""),
        ...(d["undertitel"] ? { undertitel: String(d["undertitel"]) } : {}),
        ...(d["subtyp"] ? { subtyp: String(d["subtyp"]) } : {}),
        ...(d["organ"] ? { organ: String(d["organ"]) } : {}),
        ...(d["dokument_url_html"] ? { dokument_url_html: String(d["dokument_url_html"]) } : {}),
        ...(d["dokument_url_text"] ? { dokument_url_text: String(d["dokument_url_text"]) } : {}),
        intressenter: asArray(intress?.intressent as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((i) => ({
          namn: String(i["namn"] ?? ""),
          partibet: String(i["partibet"] ?? "").toLowerCase(),
          ...(i["intressent_id"] ? { intressent_id: String(i["intressent_id"]) } : {}),
          ...(i["roll"] ? { roll: String(i["roll"]) } : {}),
        })),
      };
    },
  );
  const next = dl["@nasta_sida"];
  return { dokument: docs, nextUrl: typeof next === "string" && next.length > 0 ? next : null };
}

/** Hämtar samtliga dokument av en typ för ett riksmöte, med paginering. */
export async function fetchDokument(
  fetcher: HttpFetch,
  doktyp: DokTyp,
  rm: string,
  opts: { maxPages?: number } = {},
): Promise<RdDokument[]> {
  const out: RdDokument[] = [];
  let url: string | null =
    `${BASE}/dokumentlista/?doktyp=${doktyp}&rm=${encodeURIComponent(rm)}&sz=200&sort=datum&sortorder=asc&utformat=json`;
  let pages = 0;
  const maxPages = opts.maxPages ?? Infinity;
  while (url && pages < maxPages) {
    const parsed = parseDokumentLista(await getJson(fetcher, url));
    out.push(...parsed.dokument);
    url = parsed.nextUrl ? parsed.nextUrl.replace(/^http:/, "https:") : null;
    pages += 1;
  }
  return out;
}

/** Tolkar voteringlista-rader. Exporterad för tester. */
export function parseVoteringLista(payload: unknown): RdVoteringRad[] {
  const vl = (payload as { voteringlista?: Record<string, unknown> }).voteringlista;
  if (!vl) throw new Error("svar utan voteringlista");
  return asArray(vl["votering"] as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((v) => ({
    votering_id: String(v["votering_id"] ?? ""),
    rm: String(v["rm"] ?? ""),
    beteckning: String(v["beteckning"] ?? ""),
    punkt: Number(v["punkt"] ?? 0),
    namn: String(v["namn"] ?? ""),
    intressent_id: String(v["intressent_id"] ?? ""),
    parti: String(v["parti"] ?? "").toLowerCase(),
    valkrets: String(v["valkrets"] ?? ""),
    rost: String(v["rost"] ?? "") as RdVoteringRad["rost"],
    avser: String(v["avser"] ?? ""),
    ...(v["systemdatum"] ? { datum: String(v["systemdatum"]).slice(0, 10) } : {}),
  }));
}

/** Hämtar alla röster (per ledamot) för ett betänkande, eller hela riksmötet punktvis. */
export async function fetchVoteringar(
  fetcher: HttpFetch,
  rm: string,
  opts: { beteckning?: string; punkt?: number; sz?: number } = {},
): Promise<RdVoteringRad[]> {
  const params = new URLSearchParams({ rm, sz: String(opts.sz ?? 10000), utformat: "json", gruppering: "" });
  if (opts.beteckning) params.set("bet", opts.beteckning);
  if (opts.punkt !== undefined) params.set("punkt", String(opts.punkt));
  return parseVoteringLista(await getJson(fetcher, `${BASE}/voteringlista/?${params}`));
}

/**
 * Hämtar id-listan över riksmötets voteringspunkter (gruppering=votering_id).
 * Grupperat svar är litet (~600–800 rader per riksmöte) och trunkeras inte;
 * längden kontrolleras ändå mot svarets @antal.
 */
export async function fetchVoteringsIdn(fetcher: HttpFetch, rm: string): Promise<string[]> {
  const params = new URLSearchParams({ rm, sz: "20000", utformat: "json", gruppering: "votering_id" });
  const payload = (await getJson(fetcher, `${BASE}/voteringlista/?${params}`)) as {
    voteringlista?: Record<string, unknown>;
  };
  const vl = payload.voteringlista;
  if (!vl) throw new Error("svar utan voteringlista");
  const idn = asArray(vl["votering"] as Record<string, unknown> | Array<Record<string, unknown>> | undefined)
    .map((v) => String(v["votering_id"] ?? ""))
    .filter(Boolean);
  const antal = Number(vl["@antal"] ?? idn.length);
  if (idn.length !== antal) throw new Error(`voteringslista ${rm}: fick ${idn.length} id men @antal=${antal}`);
  return idn;
}

/** Tolkar ett /votering/<id>/json-svar till per-ledamotsrader. Exporterad för tester. */
export function parseVotering(payload: unknown): RdVoteringRad[] {
  const dv = (payload as { votering?: { dokvotering?: { votering?: unknown } } }).votering?.dokvotering;
  if (!dv) throw new Error("svar utan dokvotering");
  return asArray(dv.votering as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((v) => ({
    votering_id: String(v["votering_id"] ?? ""),
    rm: String(v["rm"] ?? ""),
    beteckning: String(v["beteckning"] ?? ""),
    punkt: Number(v["punkt"] ?? 0),
    namn: String(v["namn"] ?? ""),
    intressent_id: String(v["intressent_id"] ?? ""),
    parti: String(v["parti"] ?? "").toLowerCase(),
    valkrets: String(v["valkrets"] ?? ""),
    rost: String(v["rost"] ?? "") as RdVoteringRad["rost"],
    avser: String(v["avser"] ?? ""),
    ...(v["datum"] ?? v["systemdatum"] ? { datum: String(v["datum"] ?? v["systemdatum"]).slice(0, 10) } : {}),
  }));
}

/**
 * Hämtar samtliga per-ledamotsrader för EN votering via /votering/<id>/json.
 * voteringlista/ med stor sz trunkeras tyst (ett riksmöte har ~200 000
 * radnivåposter) — därför hämtas voteringar alltid en och en.
 */
export async function fetchVoteringRader(fetcher: HttpFetch, voteringId: string): Promise<RdVoteringRad[]> {
  return parseVotering(await getJson(fetcher, `${BASE}/votering/${voteringId}/json`));
}

/** Hämtar ledamotsregistret. */
export async function fetchPersoner(fetcher: HttpFetch): Promise<RdPerson[]> {
  const payload = (await getJson(fetcher, `${BASE}/personlista/?utformat=json`)) as {
    personlista?: { person?: unknown };
  };
  return asArray(payload.personlista?.person as Record<string, unknown> | Array<Record<string, unknown>> | undefined).map((p) => ({
    intressent_id: String(p["intressent_id"] ?? ""),
    tilltalsnamn: String(p["tilltalsnamn"] ?? ""),
    efternamn: String(p["efternamn"] ?? ""),
    parti: String(p["parti"] ?? "").toLowerCase(),
    valkrets: String(p["valkrets"] ?? ""),
    ...(p["status"] ? { status: String(p["status"]) } : {}),
  }));
}

/**
 * Gör dokument-HTML till läsbar text: skript/stil bort, taggar → blanksteg,
 * vanliga entiteter avkodade. Whitespace jämnas ut. Exporterad för tester.
 */
export function htmlTillText(html: string): string {
  const ENTITETER: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    aring: "å", auml: "ä", ouml: "ö", Aring: "Å", Auml: "Ä", Ouml: "Ö",
    eacute: "é", Eacute: "É", ndash: "–", mdash: "—", hellip: "…",
    ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", sect: "§",
  };
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    // Inline-taggar tas bort UTAN mellanrum. Riksdagens dokument sätts med
    // ett <span> per teckenformat, och ett avstavat ord kan därför ligga som
    // "ut</span><span>&shy;</span><span>reda". Ersattes varje tagg med ett
    // blanksteg blev texten "ut reda", och citatet "…att utreda en tydlig
    // bortre gräns…" stod plötsligt inte ordagrant i sitt eget dokument —
    // trots att det gör det. Upptäckt 2026-08-06 när ett yrkande ur
    // riksdagens egen yrkandelista föll mot dokumentet det är hämtat ur.
    .replace(/<\/?(?:span|b|i|em|strong|a|u|s|sub|sup|small|big|font|abbr|cite|q|mark|time|bdi|bdo|wbr)(?:\s[^>]*)?\/?>/giu, "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&#x([0-9a-f]+);/giu, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/gu, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/gu, (m, e: string) => ENTITETER[e] ?? m)
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Hämtar ett dokuments fulltext (för ordagrann citatkontroll, grind H2).
 * Riksdagens /dokument/<id>/text svarar numera med dokumentstatus-XML, så
 * texten hämtas ur dokumentstatus/<id>.json vars dokument.html bär hela
 * innehållet.
 */
export async function fetchDokumentText(fetcher: HttpFetch, dokId: string): Promise<string> {
  const payload = (await getJson(fetcher, `${BASE}/dokumentstatus/${dokId}.json`)) as {
    dokumentstatus?: { dokument?: { html?: unknown } };
  };
  const html = payload.dokumentstatus?.dokument?.html;
  if (typeof html !== "string" || html.length === 0) {
    throw new Error(`dokumentstatus ${dokId}: ingen dokumenttext`);
  }
  return htmlTillText(html);
}

/** Ett yrkande i en motion — det motionären faktiskt begär. */
export interface Yrkande {
  /** Yrkandenumret som det står i motionen ("1", "2", …). */
  nummer: string;
  /** Yrkandets lydelse: "Riksdagen ställer sig bakom det som anförs…". */
  lydelse: string;
}

/**
 * Motionens yrkanden — själva handlingen, skild från brödtexten.
 *
 * En motions handling är dess yrkande. Brödtexten argumenterar FÖR yrkandet;
 * den är inte handlingen. Utan den här listan får modellen bara dokumentets
 * löpande text och belägger gärna kopplingen med en problembeskrivning
 * ("Sverige behöver fler poliser i hela landet") i stället för med det
 * motionären begär. Vid genomgången av kopplingskön 2026-08-06 var det skälet
 * till att vart tredje förslag behövde vägas om.
 *
 * Lydelserna står ordagrant i dokumentets egen text ("Förslag till
 * riksdagsbeslut"), så ett citat ur ett yrkande passerar den ordagranna
 * kontrollen mot källtexten.
 */
export async function fetchYrkanden(fetcher: HttpFetch, dokId: string): Promise<Yrkande[]> {
  const payload = (await getJson(fetcher, `${BASE}/dokumentstatus/${dokId}.json`)) as {
    dokumentstatus?: { dokforslag?: { forslag?: unknown } };
  };
  const lista = asArray(payload.dokumentstatus?.dokforslag?.forslag as unknown);
  const ut: Yrkande[] = [];
  for (const y of lista as Array<Record<string, unknown>>) {
    // Vissa yrkanden bär sin text i lydelse2 (lagförslag med två led).
    const lydelse = htmlTillText(String(y["lydelse"] ?? "")) || htmlTillText(String(y["lydelse2"] ?? ""));
    if (lydelse === "") continue;
    ut.push({ nummer: String(y["nummer"] ?? ""), lydelse });
  }
  return ut;
}

/** En förslagspunkt i ett betänkande — det kammaren faktiskt röstade om. */
export interface Utskottspunkt {
  /** Punktnumret, som en voterings `punkt`. */
  punkt: number;
  /** Punktens rubrik, t.ex. "Lagförslagen" eller "Vandelsprövningen". */
  rubrik: string;
  /** Beslutstexten: "Riksdagen antar…" eller "Riksdagen avslår motionerna…". */
  forslag: string;
}

/**
 * Betänkandets förslagspunkter — vad varje punkt faktiskt avgjorde.
 *
 * Utan detta vet vi bara VILKEN punkt en votering gällde, inte VAD den
 * punkten beslutade. Ett betänkande antar typiskt lagförslagen i punkt 1
 * och avslår motioner i punkt 2 och framåt; en modell som bara får
 * punktnumret och hela betänkandetexten citerar då gärna sammanfattningens
 * beskrivning av propositionen — alltså punkt 1:s sak — som bevis för en
 * punkt som i själva verket bara avslog några motioner.
 */
export async function fetchUtskottspunkter(fetcher: HttpFetch, dokId: string): Promise<Utskottspunkt[]> {
  const payload = (await getJson(fetcher, `${BASE}/utskottsforslag/${dokId}.json`)) as {
    utskottsforslag?: { dokutskottsforslag?: { utskottsforslag?: unknown } };
  };
  const rad = payload.utskottsforslag?.dokutskottsforslag?.utskottsforslag;
  const lista = Array.isArray(rad) ? rad : rad ? [rad] : [];
  const ut: Utskottspunkt[] = [];
  for (const p of lista as Array<Record<string, unknown>>) {
    const punkt = Number(p["punkt"]);
    if (!Number.isInteger(punkt)) continue;
    ut.push({
      punkt,
      rubrik: htmlTillText(String(p["rubrik"] ?? "")),
      forslag: htmlTillText(String(p["forslag"] ?? "")),
    });
  }
  return ut;
}

/** Publik webbadress för ett dokument (den vi visar och arkiverar). */
export function dokumentUrl(dokId: string): string {
  return `https://data.riksdagen.se/dokument/${dokId}`;
}
