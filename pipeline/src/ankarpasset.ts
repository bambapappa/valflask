/**
 * Ankarpasset: betar av ankarskulden, en läst hög i taget.
 *
 * Skulden är de publicerade löften vars uträkning lånar ett belopp ur ett annat
 * löfte utan en spårbar koppling — «beloppet läggs där jämförbara löften
 * ligger». `ankarkravet.ts` mäter dem; den här modulen är hur de lämnar listan.
 *
 * Tre utfall, och bara tre. De speglar `ankarkravet.ts` docstring exakt:
 *
 *   `ankare`  Löftet som lånas ut är utpekat och skrivs i `cost.anchor_ids`.
 *             Sajten renderar det som en länk med det andra löftets rubrik.
 *   `grupp`   Det är SAMMA reform, inte ett riktmärke. Posten går in i
 *             gruppen och beloppet räknas en gång — `dedupeByGroup` låter
 *             gruppens största post bära summan.
 *   `egen`    Uträkningen skrivs om så att den inte längre påstår ett lån den
 *             inte kan visa. Beloppet får stå på sin egen aritmetik.
 *
 * VARFÖR EN MODUL OCH INTE ETT ENGÅNGSSKRIPT. 194 poster återstår när det här
 * skrivs, och de ska betas av i pass om tjugo under lång tid. Ett engångsskript
 * per pass är precis så de elva bevisrättningarna 2026-08-06 gjordes, och de
 * nådde ingen testsvit.
 *
 * Ren logik utan fil- och nätverksåtkomst — CLI ligger i
 * `scripts/ankarpasset.mts`.
 */
import { lanarUtanSparbartAnkare, type AnkarPost } from "./ankarkravet.ts";

export type Utfall = "ankare" | "grupp" | "egen";

/** En rad i passet: vilket löfte, vilket utfall, med vilket värde och varför. */
export interface Ankarrad {
  id: string;
  utfall: Utfall;
  /** Ankar-id:n (`ankare`), grupp-id (`grupp`), eller den nya uträkningen (`egen`). */
  varde: string;
  /** Vad läsningen fann. Går i rättelseloggen, aldrig i publicerad text. */
  skal: string;
  /**
   * Ny metodnot, när den gamla bär samma ogrundade påstående som uträkningen.
   *
   * Ankarkravet läser bara `calculation`, men metodnoten står intill den på
   * löftessidan. Skrivs bara uträkningen om kan noten bli kvar och påstå ett
   * lån sidan inte längre visar — och då har vi flyttat felet, inte rättat det.
   */
  metodnot?: string;
}

/** Löftesfälten passet rör. Delmängd av promises.json. */
export interface Lofte extends AnkarPost {
  title?: string;
  parties?: readonly string[];
  cost: {
    calculation?: string | null;
    anchor_ids?: readonly string[] | null;
    msek_base?: number | null;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

const INTERN_BETECKNING = /\b[kp]-20\d\d-\d{4}\b/u;

/**
 * Prövar en rad mot allt som går att pröva utan att läsa.
 *
 * Det som INTE prövas här är det som avgör om raden är riktig: om ankaret
 * verkligen är det löfte uträkningen menade, och om beloppet som lånas är
 * rimligt. Det är en läsning, och den har redan gjorts när raden skrevs.
 */
export function provaRad(
  rad: Ankarrad,
  loften: ReadonlyMap<string, Lofte>,
): { ok: boolean; fel: string[] } {
  const fel: string[] = [];
  const p = loften.get(rad.id);
  if (!p) {
    fel.push(`${rad.id} finns inte i promises.json`);
    return { ok: false, fel };
  }
  if ((p.status ?? "aktiv") !== "aktiv") fel.push(`${rad.id} har status ${p.status}`);
  if (rad.skal.trim() === "") fel.push(`${rad.id} saknar skäl — rättelseloggen ska säga vad läsningen fann`);
  if (!lanarUtanSparbartAnkare(p)) {
    fel.push(`${rad.id} bryter inte mot ankarkravet — den hör inte till skulden`);
  }

  if (rad.utfall === "ankare") {
    const mal = rad.varde.split(",").map((s) => s.trim()).filter(Boolean);
    if (mal.length === 0) fel.push(`${rad.id} saknar ankar-id`);
    for (const m of mal) {
      const t = loften.get(m);
      if (!t) fel.push(`${rad.id}: ankaret ${m} finns inte`);
      else if ((t.status ?? "aktiv") !== "aktiv") fel.push(`${rad.id}: ankaret ${m} är ${t.status}`);
      if (m === rad.id) fel.push(`${rad.id} kan inte vara sitt eget ankare`);
      // En kedja är tillåten, en cykel är det inte: lånar ankaret tillbaka av
      // oss står två belopp och håller varandra uppe utan grund i botten.
      if (t?.cost.anchor_ids?.includes(rad.id)) {
        fel.push(`${rad.id}: ankaret ${m} lånar redan av ${rad.id} — det blir en cykel`);
      }
    }
  } else if (rad.utfall === "grupp") {
    if (!rad.varde.trim()) fel.push(`${rad.id} saknar grupp-id`);
    const medlemmar = [...loften.values()].filter((l) => l.group_id === rad.varde);
    if (medlemmar.length === 0) {
      fel.push(`${rad.id}: gruppen ${rad.varde} finns inte — en grupp med en enda post är ingen grupp`);
    }
  } else if (rad.utfall === "egen") {
    if (rad.varde.trim().length < 40) fel.push(`${rad.id}: den nya uträkningen är för kort för att bära ett belopp`);
    if (INTERN_BETECKNING.test(rad.varde) || INTERN_BETECKNING.test(rad.metodnot ?? "")) {
      fel.push(`${rad.id}: texten innehåller en intern beteckning — den möter läsaren, skriv ut saken i ord`);
    }
    // Poängen med `egen` är att lånet försvinner. Står påståendet kvar har vi
    // bara skrivit om meningen runt det, och grinden fäller posten igen.
    if (lanarUtanSparbartAnkare({ ...p, cost: { ...p.cost, calculation: rad.varde } })) {
      fel.push(`${rad.id}: den nya uträkningen påstår fortfarande ett lån utan spårbar koppling`);
    }
  }
  return { ok: fel.length === 0, fel };
}

/** Löftet efter passet. Beloppet står stilla — det är grunden som får en adress. */
export function tillampa(lofte: Lofte, rad: Ankarrad): Lofte {
  if (rad.utfall === "ankare") {
    const mal = rad.varde.split(",").map((s) => s.trim()).filter(Boolean);
    return { ...lofte, cost: { ...lofte.cost, anchor_ids: mal } };
  }
  if (rad.utfall === "grupp") return { ...lofte, group_id: rad.varde };
  return {
    ...lofte,
    cost: {
      ...lofte.cost,
      calculation: rad.varde,
      ...(rad.metodnot ? { method_note: rad.metodnot } : {}),
    },
  };
}
