/**
 * Kvalitetsfiltret som grind.
 *
 * `haller-det` prövar en sak i taget mot tre roller och sparar prövningen i
 * granskningsloggen. Loggen är intern och ligger i `handoff`; hit exporteras
 * bara det grinden behöver veta — att saken prövats, när, med vilket utfall,
 * och hashen av det som prövades (`data/provningar.json`, skriven av
 * `logg.py export`).
 *
 * Grinden finns för att filtret annars är en vana. Mätt 2026-08-07 hade fyra
 * av 1 382 publicerade saker gått genom det, trots att skillen fanns — och
 * ingenting i koden kände till loggen. Det som inte mäts blir inte gjort.
 *
 * **Grinden kräver en prövning, inte ett visst utfall.** "Håller med
 * förbehåll" släpper igenom med flit: ett löfte kan vara i sak riktigt utan
 * att allt går att belägga fullt ut — ankaret finns men inte på en adress
 * läsaren kan öppna, eller ingen jämförbar åtgärd finns att ankra i alls.
 * Sådant publiceras med förbehållet utskrivet. Det som stoppas är det
 * OPRÖVADE och det som prövats och inte höll.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Utfall = "haller" | "haller-med-forbehall" | "haller-inte";
export type Slag = "lofte" | "koppling" | "standpunkt";

export interface Provning {
  id: string;
  slag: Slag;
  datum: string;
  utfall: Utfall;
  underlag_hash: string;
}

/** Utfall som släpper igenom. Se modulkommentaren — förbehåll är inget hinder. */
const SLAPPER_IGENOM: readonly Utfall[] = ["haller", "haller-med-forbehall"];

/**
 * JSON i Pythons form, för att hashen ska bli densamma på båda sidor.
 *
 * `logg.py` hashar `json.dumps(..., ensure_ascii=False, sort_keys=True)`, och
 * Pythons förval sätter ett blanksteg efter både komma och kolon.
 * `JSON.stringify` gör inte det. Skillnaden syns inte i något värde men ger en
 * annan hash, och då hade varje prövning sett gammal ut här medan `logg.py
 * status` sa att den var aktuell. Skalärerna lämnas åt `JSON.stringify` —
 * teckenflykten är densamma i båda språken när icke-ASCII inte flyktas.
 */
function pythonJson(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map(pythonJson).join(", ") + "]";
  const o = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}: ${pythonJson(o[k])}`)
      .join(", ") +
    "}"
  );
}

/**
 * Det i objektet som en prövning faktiskt uttalar sig om.
 *
 * Speglar `kanon()` i `logg.py`. Ändringshistorik och tilltrosvärden räknas
 * inte — de säger inget om påståendet. Beloppet, citatet, källan och
 * riktningen gör det.
 */
export function kanon(slag: Slag, obj: Record<string, unknown>): string {
  let del: unknown;
  if (slag === "lofte") {
    const c = (obj["cost"] ?? {}) as Record<string, unknown>;
    const source = (obj["source"] ?? {}) as Record<string, unknown>;
    del = {
      quote: obj["quote"] ?? null,
      title: obj["title"] ?? null,
      parties: obj["parties"] ?? null,
      status: obj["status"] ?? null,
      group_id: obj["group_id"] ?? null,
      url: source["url"] ?? null,
      cost: {
        type: c["type"] ?? null,
        period: c["period"] ?? null,
        msek_low: c["msek_low"] ?? null,
        msek_base: c["msek_base"] ?? null,
        msek_high: c["msek_high"] ?? null,
        basis: c["basis"] ?? null,
        calculation: c["calculation"] ?? null,
      },
    };
  } else if (slag === "koppling") {
    const bevis = (obj["bevis"] ?? {}) as Record<string, unknown>;
    del = {
      promise_id: obj["promise_id"] ?? null,
      handling_id: obj["handling_id"] ?? null,
      riktning: obj["riktning"] ?? null,
      status: obj["status"] ?? null,
      citat: bevis["citat"] ?? null,
    };
  } else {
    const b = standpunktensBesked(obj);
    del = {
      subquestion_id: obj["subquestion_id"] ?? null,
      party: obj["party"] ?? null,
      position: b.position,
      condition_note: b.condition_note,
      quote: b.quote,
      url: b.url,
    };
  }
  return createHash("sha256").update(pythonJson(del), "utf8").digest("hex").slice(0, 16);
}

/**
 * Vad cellen säger, läst ur vilken form ståndpunkten än har.
 *
 * En ståndpunkt möter oss i tre former: som publicerat besked (`current` pekar
 * med `statement_id` in i `statements`), som kö-post på väg mot ett beslut, och
 * som det objekt godkännandet i `stances-review.mts` lägger fram. De två sista
 * bär citatet och källan platt på objektet. Alla tre ska ge samma hash när de
 * beskriver samma besked — annars blir prövningen gammal av själva
 * publiceringen.
 *
 * **`statement_id` ingår inte, och det är hela poängen.** Det mintas i
 * godkännandet och går alltså inte att veta när prövningen skrivs, så en hash
 * som bär det kan aldrig stämma efteråt. Värre: eftersom kö-formen bär citatet
 * platt medan hashen letade under `current`, täckte den i praktiken bara
 * cellens adress — samma cell gav samma hash oavsett vilket besked och vilket
 * citat som godkändes, och grinden vaktade ingenting. Speglar
 * `standpunktens_besked()` i `logg.py`.
 */
function standpunktensBesked(obj: Record<string, unknown>): {
  position: unknown;
  condition_note: unknown;
  quote: unknown;
  url: unknown;
} {
  const cur = (obj["current"] ?? {}) as Record<string, unknown>;
  const sid = cur["statement_id"];
  let kalla: Record<string, unknown> | undefined;
  if (sid) {
    kalla = ((obj["statements"] ?? []) as Record<string, unknown>[]).find((s) => s["id"] === sid);
  }
  if (kalla === undefined) kalla = cur["quote"] !== undefined && cur["quote"] !== null ? cur : obj;
  const kalla_ = kalla;
  return {
    // `in`, inte `??`: Python läser `kalla.get("position", cur.get(...))`, som
    // faller tillbaka när nyckeln SAKNAS — inte när den står till null. Skiljer
    // sig språken där ser grinden varje prövning som gammal.
    position: ("position" in kalla_ ? kalla_["position"] : cur["position"]) ?? null,
    condition_note: kalla_["condition_note"] ?? null,
    quote: kalla_["quote"] ?? null,
    url: ((kalla_["source"] ?? {}) as Record<string, unknown>)["url"] ?? null,
  };
}

/**
 * Nyckeln för en post i Fläskvågens granskningskö.
 *
 * Kön har inga id — `needs_review.json` adresseras med index, och indexet
 * flyttar sig så fort en post avgörs. Nyckeln härleds därför ur innehållet:
 * artikelns adress och citatet. Samma par ger samma nyckel före och efter
 * publiceringen, så prövningen följer med löftet ut utan att någon skriver om
 * en rad i loggen — där rader aldrig får skrivas om.
 */
export function konyckel(url: string | null | undefined, citat: string | null | undefined): string {
  const text = `${(url ?? "").trim()}\n${(citat ?? "").trim()}`;
  return "ko:" + createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

/**
 * Kö-postens id i Fläskvågen — det id issuet bär, med `ko:`-prefix.
 *
 * Speglar `reviewId()` i `review.ts`, som räknar samma hash utan prefix. Två
 * nycklar för samma kö-post är avsiktligt: den här är stabil under postens liv
 * och är därför den en granskare skriver sin prövning mot när hen läser
 * issuet, medan `konyckel` överlever en omskörd — rubriken härleds av
 * utvinningen, citatet kommer från partiet.
 */
export function reviewNyckel(url: string | null | undefined, titel: string | null | undefined): string {
  return "ko:" + createHash("sha256").update(`${url ?? ""}::${titel ?? ""}`, "utf8").digest("hex").slice(0, 12);
}

/**
 * Kö-postens id i Handlingsvågen — en hash av mål och handling.
 *
 * Räknas likadant som `granskning.ts` gör det, så en godkänd koppling går att
 * föra tillbaka till den kö-post den kom ur och därmed till sin prövning.
 */
export function koforslagId(post: { promise_id?: string | null; stance_id?: string | null; handling_id: string }): string {
  const mal = post.promise_id ?? post.stance_id ?? "";
  return createHash("sha256").update(`${mal}::${post.handling_id}`, "utf8").digest("hex").slice(0, 12);
}

/**
 * Kö-postens id i Frågevågen — sha256 över adress, delfråga, parti och citat.
 *
 * Räknas ur samma fyra fält som `stances:review` visar, och tre av dem följer
 * med ut i det publicerade beskedet oförändrade. Den fjärde, adressen, gör det
 * när kö-postens artikeladress är den som publiceras — då går nyckeln att räkna
 * fram åt båda hållen, och en prövning skriven mot kö-posten hittas efter
 * godkännandet. Bär citatet ett eget sidankare i en PDF publiceras den adressen
 * i stället, och då missar den härledda nyckeln. Det felar åt rätt håll:
 * beskedet räknas som oprövat, inte som prövat.
 */
export function standpunktNyckel(
  url: string | null | undefined,
  sq: string | null | undefined,
  parti: string | null | undefined,
  citat: string | null | undefined,
): string {
  const text = `${url ?? ""}::${sq ?? ""}::${parti ?? ""}::${citat ?? ""}`;
  return "ko:" + createHash("sha256").update(text, "utf8").digest("hex").slice(0, 12);
}

/**
 * Varje identitet en prövning av den här saken kan ha skrivits under.
 *
 * En prövning sker före beslutet — det är hela poängen med filtret — men id:t
 * mintas i beslutet. Prövningen bär därför kö-nyckeln, och saken bär efteråt
 * sitt publicerade id. Letar man bara efter det ena ser man inte det andra:
 * 2026-08-09 godtog grinden här alla tre identiteterna för ett löfte medan
 * mätningen i `logg.py` bara kände det publicerade id:t, och samma bestånd
 * rapporterades som 100 procent på ena sidan och 94,6 på den andra. **Två mått
 * på samma sak ska räknas på ett ställe** — det här är listan, och
 * `identiteter()` i `logg.py` speglar den.
 */
export function identiteter(slag: Slag, ident: string, obj: Record<string, unknown>): string[] {
  if (slag === "lofte") {
    const url = (obj["source"] as { url?: string } | undefined)?.url;
    return [ident, konyckel(url, obj["quote"] as string), reviewNyckel(url, obj["title"] as string)];
  }
  if (slag === "koppling") {
    return [ident, `ko:${koforslagId(obj as unknown as { promise_id?: string; handling_id: string })}`];
  }
  const b = standpunktensBesked(obj);
  return [
    ident,
    standpunktNyckel(b.url as string, obj["subquestion_id"] as string, obj["party"] as string, b.quote as string),
  ];
}

export function lasProvningar(dataDir: string): Map<string, Provning> {
  let rå: string;
  try {
    rå = readFileSync(join(dataDir, "provningar.json"), "utf-8");
  } catch {
    // Saknas filen har ingenting exporterats. Grinden ska då stoppa allt, inte
    // släppa igenom allt — en tom karta ger exakt det.
    return new Map();
  }
  const { poster } = JSON.parse(rå) as { poster: Provning[] };
  return new Map((poster ?? []).map((p) => [p.id, p]));
}

export type Grindsvar = { ok: true; provning: Provning } | { ok: false; skal: string };

/**
 * Har den här saken gått genom kvalitetsfiltret, och höll den?
 *
 * `nycklar` är de identiteter prövningen kan ha skrivits under — för en
 * kö-post både kö-nyckeln och det publicerade id:t den blir, eftersom
 * prövningen sker före beslutet och id:t mintas i beslutet.
 */
export function provningsGrind(
  provningar: Map<string, Provning>,
  nycklar: readonly string[],
  slag: Slag,
  obj: Record<string, unknown>,
): Grindsvar {
  const träff = nycklar.map((n) => provningar.get(n)).find((p): p is Provning => p !== undefined);
  if (!träff) {
    return {
      ok: false,
      skal:
        "har inte gått genom kvalitetsfiltret. Pröva den först:\n" +
        "    python3 <handoff>/.claude/skills/haller-det/scripts/underlag.py <valflask> " +
        `${nycklar[0]}\n` +
        "  och skriv prövningen med logg.py skriv, följt av logg.py export.",
    };
  }
  if (!SLAPPER_IGENOM.includes(träff.utfall)) {
    return {
      ok: false,
      skal:
        `prövades ${träff.datum} och höll inte. Rätta den först — skillen\n` +
        "  fa-det-att-halla hämtar ankaret ur en källa, mäter före och efter och\n" +
        "  skriver rättelsen. Pröva sedan om.",
    };
  }
  const nu = kanon(slag, obj);
  if (träff.underlag_hash !== nu) {
    return {
      ok: false,
      skal:
        `prövades ${träff.datum}, men beloppet, citatet eller källan har ändrats\n` +
        "  sedan dess. Prövningen beskriver en annan version. Pröva om.",
    };
  }
  return { ok: true, provning: träff };
}
