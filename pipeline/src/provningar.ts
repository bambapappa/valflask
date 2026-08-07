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
    const cur = (obj["current"] ?? {}) as Record<string, unknown>;
    del = {
      subquestion_id: obj["subquestion_id"] ?? null,
      party: obj["party"] ?? null,
      position: cur["position"] ?? null,
      statement_id: cur["statement_id"] ?? null,
    };
  }
  return createHash("sha256").update(pythonJson(del), "utf8").digest("hex").slice(0, 16);
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
