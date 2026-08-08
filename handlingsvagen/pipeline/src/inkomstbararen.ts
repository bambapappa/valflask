/**
 * Bär inkomstberäkningsyrkandet löftet? Skatteundantaget som körbar regel.
 *
 * Beslutet om budgetmotioners yrkanden säger att ett ramverksyrkande — riktlinjer,
 * utgiftstak, fördelning per utgiftsområde — inte bär något enskilt löfte, **utom**
 * när löftet gäller en skatt eller en avgift och motionens inkomstberäkningsyrkande
 * binder regeringen att återkomma med lagförslag i överensstämmelse med beräkningen.
 * Då är yrkandet ett åtagande att lagstifta, och tabellen ingår i det genom
 * hänvisningen.
 *
 * Undantaget kräver samma sak som anslagsregeln: **raden ska hämtas och skrivas ut
 * i motiveringen**. Utan den vet läsaren bara att vi hänvisar till en budgetmotion.
 *
 * **Modulen avgör inte om löftet gäller en skatt.** Det är en läsning av
 * uträkningen, inte av kostnadstypen: tre av de sex kopplingar regeln byggdes för
 * står som `utgift` och gäller ändå arbetsgivaravgifter. Kostnadstypen svarar på
 * vilken sida av budgeten beloppet bokförs, inte på vad löftet lovar.
 *
 * **Modulen väljer inte heller rad.** Inkomsttitlarna är breda — hela statens
 * inkomster ryms i ett trettiotal rader — så att en rad finns för «skatt på arbete»
 * säger mycket mindre än att ett bestämt anslag finns i utgiftstabellen. Om raden
 * rör sig av just det löftet gäller avgörs mot motionens egen reformtabell, av en
 * människa, och den läsningen lämnas in.
 */
import { radensBelopp, type Inkomstrad, type Inkomsttraff } from "./inkomsttabell.ts";

/** Vad löftet gäller, läst ur uträkningen av en människa. */
export type Skatteslag =
  /** Löftet sänker en skatt eller en avgift: staten tar in mindre. Raden ska gå ned. */
  | "sanker"
  /** Löftet höjer eller inför en skatt: staten tar in mer. Raden ska gå upp. */
  | "hojer"
  /** Löftet gäller ingen skatt eller avgift. Då gäller undantaget inte alls. */
  | "ingen_skatt";

/** Mätvärdena för en koppling, som `inkomst-tabell --json` skriver dem. */
export interface Inkomstmatning {
  koppling: string;
  promise_id: string | null;
  /** Binder motionens inkomstberäkningsyrkande regeringen att lagstifta? */
  bindande: boolean;
  /** Antal rader i motionens inkomsttabell för budgetåret. 0 = ingen tabell hittad. */
  tabellrader: number;
  /** Rader som delar ett sakord med löftet, närmast först, med överlappet som tal. */
  traffar: Inkomsttraff[];
  /** Träffar vars avvikelse är läsbar och skild från noll. */
  andrade: Inkomsttraff[];
  /** Satt när tabellen inte gick att hämta eller läsa. Då är frågan obesvarad. */
  fel?: string | null;
}

export type Inkomstutfall =
  /** Löftet gäller en skatt, yrkandet binder, och en rad för skatten rör sig åt rätt håll. */
  | "bar"
  /** Löftet gäller varken en skatt eller en avgift — undantaget gäller inte. */
  | "loftet_ar_ingen_skatt"
  /** Inkomstberäkningsyrkandet saknar ledet om lagförslag. Då är det en siffra, inget åtagande. */
  | "yrkandet_binder_inte"
  /** Motionen har ingen inkomsttabell för budgetåret. */
  | "ingen_inkomsttabell"
  /** Ingen inkomsttitel delar ett sakord med löftet. Hela tabellen ska läsas först. */
  | "ingen_rad_delar_sakord"
  /** Raderna för skatten står ±0: motionen begärde ingen ändring av den. */
  | "raden_star_stilla"
  /** Raden rör sig, men bara ett ordled delas — för svagt för en publicerad motivering. */
  | "svag_traff"
  /**
   * Raden rör sig åt motsatt håll mot löftet: löftet sänker skatten medan
   * motionen tar in mer på den titeln, eller tvärtom. Inkomsttitlarna är breda
   * och rymmer flera reformer samtidigt, så det kan vara en nettoeffekt av något
   * annat — och det kan vara en motsägelse. Skillnaden kräver att motionens egen
   * reformtabell läses.
   */
  | "raden_gar_andra_vagen"
  /**
   * Raden rör sig, men en läsning mot motionens reformtabell har funnit att den
   * rör något annat än löftet. Utfallet sätts av läsningen, aldrig av modulen —
   * den ser bara ordled.
   */
  | "raden_handlar_om_annat"
  /** Tabellen gick inte att hämta. Säger ingenting om kopplingen. */
  | "oavgjort";

export interface Inkomstprovning {
  utfall: Inkomstutfall;
  /** Raden som bär löftet, när någon gör det. */
  rad: Inkomstrad | null;
  /** Vad utfallet innebär, i klarspråk och utan interna koder. */
  innebord: string;
  /** Sant när kopplingen ska dras in enligt beslutet. */
  drasIn: boolean;
  /** Sant när utfallet kräver att en människa läser motionen först. */
  kraverLasning: boolean;
}

/**
 * Hur många av löftets ordled en rad måste dela för att få skrivas in som
 * löftets bärare. Samma tröskel som för anslagen, och av samma skäl: ett enda
 * gemensamt ordled är ofta ett sammanträffande i en svensk sammansättning.
 */
export const MINSTA_ORDOVERLAPP = 2;

/** Går raden åt det håll löftet lovar? Sänkt skatt ska ge ett minus på inkomsttiteln. */
function ratHall(avvikelse: number, slag: Skatteslag): boolean {
  return slag === "sanker" ? avvikelse < 0 : avvikelse > 0;
}

/**
 * Prövar en koppling mot skatteundantaget.
 *
 * Ordningen är inte likgiltig. Frågan om löftet alls gäller en skatt kommer
 * först: gör det inte det bär ramverksyrkandet ingenting, hur mycket en
 * inkomsttitel med liknande ord än råkar röra sig. Sedan kommer frågan om
 * yrkandet binder — ett inkomstberäkningsyrkande utan lagförslagsledet är en
 * siffra i en tabell och inget åtagande att lagstifta.
 */
export function provaInkomstbararen(m: Inkomstmatning, slag: Skatteslag): Inkomstprovning {
  if (m.fel) {
    return {
      utfall: "oavgjort",
      rad: null,
      innebord: `Motionens inkomsttabell gick inte att läsa (${m.fel}). Det säger ingenting om kopplingen.`,
      drasIn: false,
      kraverLasning: true,
    };
  }

  if (slag === "ingen_skatt") {
    return {
      utfall: "loftet_ar_ingen_skatt",
      rad: null,
      innebord:
        "Löftet gäller varken en skatt eller en avgift. Motionens yrkanden fastställer bara ramarna — " +
        "riktlinjer, utgiftstak och fördelning per utgiftsområde — och den enskilda reformen ligger inne " +
        "i en områdessumma utan att pekas ut. Då bär motionen inte löftet.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  if (!m.bindande) {
    return {
      utfall: "yrkandet_binder_inte",
      rad: null,
      innebord:
        "Motionens inkomstberäkningsyrkande saknar ledet om att regeringen ska återkomma med lagförslag " +
        "i överensstämmelse med beräkningen. Utan det är yrkandet en siffra i en tabell och inget " +
        "åtagande att lagstifta, och då bär det inte löftet.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  if (m.tabellrader === 0) {
    return {
      utfall: "ingen_inkomsttabell",
      rad: null,
      innebord:
        "Motionen har ingen inkomsttabell för budgetåret. Yrkandet hänvisar till en beräkning som inte " +
        "går att läsa, och då finns ingen rad som kan bära löftet.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  if (m.traffar.length === 0) {
    return {
      utfall: "ingen_rad_delar_sakord",
      rad: null,
      innebord:
        `Ingen av inkomstberäkningens ${m.tabellrader} rader delar ett sakord med löftet. Inkomsttitlarna ` +
        "är breda, så ordöverlapp är en svag läshjälp här: hela tabellen ska läsas innan kopplingen dras in.",
      drasIn: false,
      kraverLasning: true,
    };
  }

  const traff = m.andrade[0];
  if (traff === undefined) {
    return {
      utfall: "raden_star_stilla",
      rad: m.traffar[0]?.rad ?? null,
      innebord:
        "Inkomstberäkningens rader för den skatt löftet gäller står ±0 eller utan läsbart tal. Motionen " +
        "begärde ingen ändring av den skatten, och då bär yrkandet inte löftet.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  const rad = traff.rad;
  if (!ratHall(rad.avvikelse ?? 0, slag)) {
    return {
      utfall: "raden_gar_andra_vagen",
      rad,
      innebord:
        `Löftet ${slag === "sanker" ? "sänker" : "höjer"} skatten, men den inkomsttitel som bäst svarar mot ` +
        `löftet — ${rad.titel} ${rad.namn} — står på ${radensBelopp(rad)} mot regeringens förslag, alltså åt ` +
        "motsatt håll. En inkomsttitel rymmer flera reformer samtidigt, så det kan vara nettot av något " +
        "annat och det kan vara en motsägelse. Skillnaden kräver att motionens egen reformtabell läses.",
      drasIn: false,
      kraverLasning: true,
    };
  }

  if (traff.poang < MINSTA_ORDOVERLAPP) {
    return {
      utfall: "svag_traff",
      rad,
      innebord:
        `Den enda inkomsttitel som rör sig — ${rad.titel} ${rad.namn} med ${radensBelopp(rad)} — delar bara ` +
        "ett ordled med löftet. Det kan vara samma skatt och det kan vara ett sammanträffande i en ordstam, " +
        "och skillnaden går inte att se utan att läsa motionen.",
      drasIn: false,
      kraverLasning: true,
    };
  }

  return {
    utfall: "bar",
    rad,
    innebord:
      `Inkomstberäkningen har en rad för skatten: ${rad.titel} ${rad.namn} med ${radensBelopp(rad)} mot ` +
      "regeringens förslag, i tabellens egen enhet. Yrkandet binder regeringen att lagstifta i " +
      "överensstämmelse med beräkningen, så det bär löftet, och raden hör i motiveringen.",
    drasIn: false,
    kraverLasning: false,
  };
}

/**
 * Raden skriven för läsaren, till kopplingens motivering.
 *
 * Enheten skrivs ut för att budgetårets inkomsttabell anger tusental kronor och
 * en läsare som antar kronor läser tusen gånger fel. Tecknets innebörd skrivs
 * ut för att ett minus på en inkomstrad betyder sänkt skatt, inte en nedskärning.
 */
export function motiveringsnot(rad: Inkomstrad, slag: Skatteslag, datum: string): string {
  const riktning =
    (rad.avvikelse ?? 0) < 0
      ? "alltså mindre in till staten, vilket är vad en sänkning ger"
      : "alltså mer in till staten, vilket är vad en höjning ger";
  return (
    `Motionens yrkanden fastställer budgetens ramar, och ett av dem godkänner beräkningen av statens ` +
    `inkomster med kravet att regeringen ska återkomma med lagförslag i överensstämmelse med beräkningen. ` +
    `Beräkningen ingår i yrkandet genom hänvisningen. Raden som bär löftet är inkomsttitel ${rad.titel} ` +
    `${rad.namn}, där motionen begär ${radensBelopp(rad)} mot regeringens förslag (tabellens egen enhet, ` +
    `tusental kronor) — ${riktning}. Löftet ${slag === "sanker" ? "sänker" : "höjer"} den skatten. Raden ` +
    `hämtades ur motionen ${datum}.`
  );
}

/** Motiveringen utan noten från en tidigare inkomstläsning, så att den inte dubbleras. */
export function utanTidigareInkomstnot(motivering: string): string {
  const i = motivering.indexOf("Motionens yrkanden fastställer budgetens ramar");
  return (i === -1 ? motivering : motivering.slice(0, i)).trim();
}
