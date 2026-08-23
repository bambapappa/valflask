/**
 * Sätter ett belopp på ett nollat löfte som pekar ut en åtgärd, ur ett
 * namngivet ankare.
 *
 * `regelnollning` tar bort ett belopp som en regel säger ska vara noll. Det
 * här är spegelbilden: ett löfte som **pekar ut en bestämd åtgärd utan att
 * ange en nivå** ska enligt ankarregeln prissättas som åtgärden kostar, och
 * nollningsregeln gäller bara löften som varken pekar ut en åtgärd eller anger
 * en nivå. Utan ett verktyg för det ledet gick skulden bara att beta av åt ett
 * håll, och paritetskön fastnade på par där den nollade sidan var den som hade
 * fel.
 *
 * **Ankaret måste vara ett annat löfte som räknar fram sitt belopp.** Att låna
 * ett annat partis nivå är tillåtet, men bara när lånet står utskrivet — det
 * är regelns egen formulering, och verktyget tvingar fram den genom att kräva
 * att ankaret namnges i ett fält och att uträkningen säger vad som lånas.
 *
 * Tre spärrar som alla följer av att beloppet går UPP:
 *
 *   · ankaret måste finnas, vara aktivt och bära ett belopp större än noll;
 *   · ankaret får inte vara posten själv, och det får inte i sin tur peka
 *     tillbaka — annars hämtar två poster sitt belopp ur varandra;
 *   · det nya beloppet måste vara ankarets, inte ett tal någon valt fritt.
 *     Verktyget lånar en nivå; det uppfinner ingen.
 */

export interface Ankarrad {
  id: string;
  /** Löftet vars belopp lånas. */
  ankare: string;
  /** Den nya uträkningen. Ska säga vad som lånas och varför. */
  utrakning: string;
  /** Vad läsningen fann. Går i rättelseloggen, aldrig i uträkningen. */
  skal: string;
}

export const SKAL_MIN_TECKEN = 40;

interface Kostnad {
  msek_low?: number | null;
  msek_base?: number | null;
  msek_high?: number | null;
  period?: string | null;
  type?: string | null;
  calculation?: string | null;
  anchor_ids?: readonly string[] | null;
}

export interface Lofte {
  id: string;
  title?: string;
  quote?: string;
  status?: string;
  parties?: readonly string[];
  cost: Kostnad;
  history?: { date: string; change: string; commit: string }[];
}

export interface Ankarprovning {
  ok: boolean;
  fel: string[];
}

export function provaAnkarrad(
  lofte: Lofte | undefined,
  ankare: Lofte | undefined,
  rad: Ankarrad,
): Ankarprovning {
  const fel: string[] = [];
  if (!lofte) return { ok: false, fel: [`${rad.id} finns inte i promises.json`] };
  if (!ankare) return { ok: false, fel: [`${rad.id}: ankaret ${rad.ankare} finns inte i promises.json`] };

  if (lofte.status === "tillbakadragen") fel.push(`${rad.id} är tillbakadragen`);
  if (ankare.status === "tillbakadragen") {
    fel.push(`${rad.id}: ankaret ${rad.ankare} är tillbakadraget och kan inte bära ett belopp`);
  }
  if (rad.id === rad.ankare) fel.push(`${rad.id} kan inte vara sitt eget ankare`);
  if ((ankare.cost.anchor_ids ?? []).includes(rad.id)) {
    fel.push(`${rad.id}: ankaret ${rad.ankare} pekar tillbaka hit — två poster kan inte låna av varandra`);
  }

  const bas = lofte.cost.msek_base ?? 0;
  if (bas !== 0) {
    fel.push(`${rad.id} står redan på ${bas} — verktyget sätter ett belopp på en nolla, det ändrar inget befintligt`);
  }
  const ankarbas = ankare.cost.msek_base ?? 0;
  if (ankarbas <= 0) {
    fel.push(`${rad.id}: ankaret ${rad.ankare} står på ${ankarbas} och har inget belopp att låna ut`);
  }
  if (ankare.cost.period !== lofte.cost.period) {
    fel.push(
      `${rad.id}: perioden skiljer — posten är ${lofte.cost.period}, ankaret ${ankare.cost.period}. ` +
        "Ett engångsbelopp och ett årligt är inte samma nivå.",
    );
  }
  if (ankare.cost.type !== lofte.cost.type) {
    fel.push(
      `${rad.id}: kostnadstypen skiljer — posten är ${lofte.cost.type}, ankaret ${ankare.cost.type}. ` +
        "En utgift och en besparing räknas åt olika håll.",
    );
  }
  if (rad.skal.trim().length < SKAL_MIN_TECKEN) {
    fel.push(`${rad.id}: skälet är för kort för rättelseloggen`);
  }
  if (rad.utrakning.trim() === "") fel.push(`${rad.id}: den nya uträkningen saknas`);
  // Lånet ska stå utskrivet — det är regelns egen formulering.
  if (!/lån|hämtat|samma nivå|jämförbar|motsvarande/iu.test(rad.utrakning)) {
    fel.push(`${rad.id}: uträkningen säger inte att beloppet är lånat och varifrån`);
  }
  const intern = /\b[kp]-20\d\d-\d{4}\b|\bg-p-20\d\d-\d{4}\b/u.exec(rad.utrakning);
  if (intern) {
    fel.push(`${rad.id}: uträkningen bär den interna beteckningen ${intern[0]} — skriv ut saken i ord`);
  }
  return { ok: fel.length === 0, fel };
}

/** Vad mandatperioden får när posten prissätts. */
export function paverkan(ankare: Lofte): number {
  const bas = ankare.cost.msek_base ?? 0;
  return ankare.cost.period === "per_ar" ? bas * 4 : bas;
}

/** Posten med ankarets spann och en uträkning som skriver ut lånet. */
/**
 * Posten med beloppet satt ur ankaret.
 *
 * SORTEN FÖLJER MED. Ett inriktningslöfte bär aldrig ett basbelopp — det är
 * hela skillnaden mellan sorterna, och `loftestyp.test.ts` vaktar den. Att
 * prissätta en nolla gör därför posten till en reform, och lämnas sorten kvar
 * faller nästa körning på en grind som har rätt.
 *
 * Det hände 2026-08-23, och det är samma sorts fel som när nollningen skrev om
 * uträkningen men lämnade ankaret kvar: verktyget ändrade det ena av två fält
 * som hör ihop. Sorten styr dessutom kopplingssteget sedan 2026-08-22, så ett
 * fel här fortplantar sig till Handlingsvågen.
 */
export function satt<T extends Lofte>(lofte: T, ankare: Lofte, rad: Ankarrad, datum: string): T {
  const c = ankare.cost;
  const enhet = c.period === "per_ar" ? "miljoner kronor per år" : "miljoner kronor";
  const bytteSort = (lofte as { loftestyp?: string }).loftestyp === "inriktning" && (c.msek_base ?? 0) !== 0;
  return {
    ...lofte,
    ...(bytteSort ? { loftestyp: "reform" } : {}),
    cost: {
      ...lofte.cost,
      msek_low: c.msek_low ?? 0,
      msek_base: c.msek_base ?? 0,
      msek_high: c.msek_high ?? 0,
      calculation: rad.utrakning.trim(),
      anchor_ids: [...new Set([...(lofte.cost.anchor_ids ?? []), rad.ankare])],
    },
    history: [
      ...(lofte.history ?? []),
      {
        date: datum,
        change:
          `Beloppet höjt från noll till ${(c.msek_base ?? 0).toLocaleString("sv-SE")} ${enhet}. ` +
          "Löftet pekar ut en bestämd åtgärd utan att ange en nivå, och nollningsregeln gäller bara " +
          "löften som varken pekar ut en åtgärd eller anger en nivå. Beloppet är lånat från ett " +
          "jämförbart löfte som räknar fram sin siffra, och lånet står utskrivet i uträkningen." +
          (bytteSort
            ? " Sorten ändras samtidigt från inriktning till reform: ett inriktningslöfte bär aldrig " +
              "ett basbelopp, och posten stod som inriktning bara därför att den var nollad."
            : ""),
        commit: "0000000",
      },
    ],
  };
}

export function rattelsePost(
  rader: { lofte: Lofte; ankare: Lofte }[],
  datum: string,
  summor: { partier: Map<string, number>; riket: number },
): { date: string; affects: string; what: string; why: string; commit: string } {
  const ider = [...new Set(rader.map((r) => r.lofte.id))].sort();
  const partitext = [...summor.partier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, mkr]) => `${p.toUpperCase()} ökar med ${mkr.toLocaleString("sv-SE")} miljoner kronor`)
    .join(", ");
  return {
    date: datum,
    affects: `${ider.join(", ")} — ${ider.length} löften prissatta`,
    what:
      `${ider.length} löften stod på noll trots att citatet pekar ut en bestämd åtgärd. De har fått ` +
      "det belopp ett jämförbart löfte om samma åtgärd räknar fram, och uträkningen skriver ut " +
      `varifrån talet är lånat. ${partitext ? `${partitext}. ` : ""}` +
      `Summan för alla partier ökar med ${summor.riket.toLocaleString("sv-SE")} miljoner kronor för mandatperioden.`,
    why:
      "Nollningsregeln gäller löften som varken pekar ut en åtgärd eller anger en nivå. Pekar löftet ut " +
      "en bestämd åtgärd utan att säga hur mycket ankras beloppet i vad samma åtgärd kostar — och när " +
      "ett annat parti lovar samma sak och har räknat fram sin siffra är den ett dugligt ankare, så " +
      "länge lånet står utskrivet. Posterna hittades när paritetskön betades: samma politik stod på noll " +
      "hos det ena partiet och på ett räknat belopp hos det andra, och skillnaden följde inte vad " +
      "partierna lovat utan bara vilken post som råkade räknas.",
    commit: "0000000",
  };
}
