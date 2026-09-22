/**
 * Kalkylens härledning som struktur — vem som säger vad, och vad vi själva lagt till.
 *
 * VARFÖR. En kalkyl består i dag av `basis` (en etikett för HELA beloppet),
 * `basis_url`, `method_note` och `calculation` — den sista är fri text. Det gör
 * fyra olika slags påståenden oskiljbara: partiets egen uppgift, en extern
 * källas tal, vår egen beräkning, och ett antagande vi själva valt. En läsare
 * ser «Datoruppskattning» eller «Partiets eget belopp» och kan inte se att
 * hälften av talet är partiets och hälften vårt. Mätt: 12 aktiva löften har
 * `basis: "parti"` och samtidigt en egen uppskattning i uträkningstexten.
 *
 * Två fel går dessutom inte att uttrycka i dagens form, och båda har inträffat:
 *
 *   · **Dubbelräkning av en redan beslutad basnivå.** Ett löfte om att «tillföra
 *     210 miljarder till järnvägsunderhåll 2026–2037» prissätts med hela
 *     ramen, fast ramen är beslutad sedan tidigare. Formen har ingen plats att
 *     säga «det här talet är basnivån, det ska inte summeras».
 *   · **Ett okänt belopp blir noll.** Schemat kräver tal ≥ 0 och har ingen
 *     markering för «kan inte fastställas», så en obestämbar kostnad skrivs som
 *     0 — exakt samma tal som en metodnolla, där nollan är ett svar och inte
 *     en lucka.
 *
 * FORMEN ÄR BAKÅTKOMPATIBEL. `cost.harledning` är valfritt. Saknas det byggs
 * en OSTRUKTURERAD vy ur `calculation` och `basis`, som är precis vad sajten
 * visar i dag. Ingenting i den här modulen ändrar ett publicerat belopp; den
 * läser och redovisar.
 */

/** Vem talet kommer från. Rollen, inte tilltron. */
export const LEDROLLER = [
  "partiets-uppgift",
  "extern-kalla",
  "egen-berakning",
  "antagande",
  "redan-beslutad-basniva",
] as const;
export type Ledroll = (typeof LEDROLLER)[number];

/** Ett led i härledningen: ett tal eller ett steg, med sin roll och sin källa. */
export interface Led {
  roll: Ledroll;
  /** Ledet i klartext, läsbart för en utomstående. */
  text: string;
  tal?: number | null;
  enhet?: string | null;
  /** Vilket år talet gäller. Ett tal utan år åldras tyst. */
  ar?: number | null;
  kalla?: string | null;
  /**
   * Ingår ledet i summan som blir `msek_base`?
   *
   * Förvalet är sant för alla roller UTOM `redan-beslutad-basniva`, som aldrig
   * får summeras: den beskriver vad som redan gäller, inte vad löftet tillför.
   */
  ingar_i_summan?: boolean;
}

/** Årsprofilen. En okänd profil ska förbli okänd, inte delas med fyra. */
export type Arsprofil =
  | { status: "kand"; ar: ReadonlyArray<{ ar: number; msek: number }> }
  | { status: "okand"; skal: string };

export interface Harledning {
  version: "harledning/1";
  led: readonly Led[];
  arsprofil: Arsprofil;
  /** Satt när beloppet inte kan fastställas. Då är siffrorna inte ett svar. */
  belopp_okant?: { skal: string };
  /** Sant när leden är avsedda att summera till basbeloppet. */
  summeras?: boolean;
}

export interface Kalkyl {
  msek_low?: number | null;
  msek_base?: number | null;
  msek_high?: number | null;
  basis?: string | null;
  calculation?: string | null;
  method_note?: string | null;
  harledning?: Harledning | null;
}

export function ledSummeras(led: Led): boolean {
  if (led.roll === "redan-beslutad-basniva") return led.ingar_i_summan === true;
  return led.ingar_i_summan !== false;
}

/** Fynd en läsande granskning kan göra på en härledning. */
export type Fynd =
  | { sort: "dubbelraknad-basniva"; text: string }
  | { sort: "okant-belopp-som-noll"; text: string }
  | { sort: "summan-stammer-inte"; text: string; summa: number; bas: number }
  | { sort: "tal-utan-ar"; text: string }
  | { sort: "arsprofil-stammer-inte"; text: string; summa: number; bas: number };

/**
 * Prövar härledningen mot de invarianter som går att mäta.
 *
 * Returnerar fynd, aldrig ett ändrat belopp: vad som ska göras med ett fynd är
 * en människas beslut, och en kalkyl rättas synligt med rättelsenot.
 */
export function provaHarledning(kalkyl: Kalkyl): Fynd[] {
  const h = kalkyl.harledning;
  if (!h) return [];
  const fynd: Fynd[] = [];

  for (const led of h.led) {
    if (led.roll === "redan-beslutad-basniva" && ledSummeras(led)) {
      fynd.push({
        sort: "dubbelraknad-basniva",
        text: `Ledet «${led.text}» är en redan beslutad basnivå och summeras ändå. ` +
          "Löftets kostnad är det som tillförs utöver basnivån.",
      });
    }
    if (led.tal !== null && led.tal !== undefined && (led.ar === null || led.ar === undefined)) {
      fynd.push({ sort: "tal-utan-ar", text: `Ledet «${led.text}» bär ett tal utan årtal.` });
    }
  }

  const bas = kalkyl.msek_base ?? 0;
  if (h.belopp_okant && (bas !== 0 || (kalkyl.msek_high ?? 0) !== 0)) {
    // Ett okänt belopp får inte bära ett tal som ser ut som ett svar.
    fynd.push({
      sort: "okant-belopp-som-noll",
      text: `Beloppet är markerat som obestämbart (${h.belopp_okant.skal}) men kalkylen bär tal.`,
    });
  }
  if (!h.belopp_okant && h.summeras === true) {
    const summerbara = h.led.filter((l) => ledSummeras(l) && l.tal !== null && l.tal !== undefined);
    if (summerbara.length === h.led.filter(ledSummeras).length && summerbara.length > 0) {
      const summa = summerbara.reduce((s, l) => s + (l.tal ?? 0), 0);
      if (Math.abs(summa - bas) > 0.5) {
        fynd.push({
          sort: "summan-stammer-inte",
          text: `Leden summerar till ${summa} mkr, basbeloppet är ${bas} mkr.`,
          summa, bas,
        });
      }
    }
  }
  if (h.arsprofil.status === "kand") {
    const summa = h.arsprofil.ar.reduce((s, r) => s + r.msek, 0);
    if (!h.belopp_okant && Math.abs(summa - bas) > 0.5) {
      fynd.push({
        sort: "arsprofil-stammer-inte",
        text: `Årsprofilen summerar till ${summa} mkr, basbeloppet är ${bas} mkr.`,
        summa, bas,
      });
    }
  }
  return fynd;
}

export interface Harledningsvy {
  strukturerad: boolean;
  /** Vad beloppet SÄGER — «kan inte fastställas» är inte noll kronor. */
  belopp: string;
  /** En rad per led, i den ordning härledningen anger. */
  rader: ReadonlyArray<{ roll: Ledroll; text: string; tal: string; ar: string; kalla: string | null }>;
  arsprofil: string;
  fynd: readonly Fynd[];
}

const ROLLTEXT: Record<Ledroll, string> = {
  "partiets-uppgift": "Partiets egen uppgift",
  "extern-kalla": "Extern källa",
  "egen-berakning": "Vår beräkning",
  antagande: "Vårt antagande",
  "redan-beslutad-basniva": "Redan beslutad basnivå — ingår inte i summan",
};

/**
 * Läsande härledningsvy. Visar strukturen när den finns, och säger rakt ut när
 * den inte finns — en ostrukturerad kalkyl ska inte se strukturerad ut.
 */
export function harledningsvy(kalkyl: Kalkyl): Harledningsvy {
  const h = kalkyl.harledning;
  const fynd = provaHarledning(kalkyl);
  if (!h) {
    return {
      strukturerad: false,
      belopp: `${kalkyl.msek_base ?? 0} mkr (grund: ${kalkyl.basis ?? "okänd"})`,
      rader: [{
        roll: "egen-berakning",
        text: kalkyl.calculation?.trim() || kalkyl.method_note?.trim() || "Ingen uträkning skriven.",
        tal: "—", ar: "—", kalla: null,
      }],
      arsprofil: "Okänd — ingen strukturerad härledning finns.",
      fynd,
    };
  }
  const belopp = h.belopp_okant
    ? `Kan inte fastställas — ${h.belopp_okant.skal}`
    : `${kalkyl.msek_base ?? 0} mkr (grund: ${kalkyl.basis ?? "okänd"})`;
  const arsprofil = h.arsprofil.status === "kand"
    ? h.arsprofil.ar.map((r) => `${r.ar}: ${r.msek} mkr`).join(", ")
    : `Okänd — ${h.arsprofil.skal}`;
  return {
    strukturerad: true,
    belopp,
    rader: h.led.map((l) => ({
      roll: l.roll,
      text: `${ROLLTEXT[l.roll]}: ${l.text}`,
      tal: l.tal === null || l.tal === undefined ? "—" : `${l.tal}${l.enhet ? " " + l.enhet : ""}`,
      ar: l.ar === null || l.ar === undefined ? "—" : String(l.ar),
      kalla: l.kalla ?? null,
    })),
    arsprofil,
    fynd,
  };
}
