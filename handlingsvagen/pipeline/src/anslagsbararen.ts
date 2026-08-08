/**
 * Bär anslagsyrkandet löftet? Beslutet b-0039 som körbar regel.
 *
 * Beslutet lyder att ett anslagsyrkande — "riksdagen anvisar anslagen för året
 * inom utgiftsområdet enligt tabellen" — kan bära **ett löfte som består i
 * pengar, men bara när tabellen har en rad för just den sak löftet gäller, och
 * raden ska då hämtas och skrivas ut i motiveringen**. Saknas raden bär
 * motionen inte löftet, och då dras kopplingen in — beviset byts inte.
 *
 * Regeln fanns bara som text, och 99 publicerade kopplingar väntade på den.
 * Att läsa dem för hand ur en textutskrift är just det arbete som gick fel förr:
 * en räkning ur en utskrift blev åtta poster fel, och ett svep som inte kände
 * en regel publicerade tjugo falska fynd. Därför ligger regeln här, med
 * mätvärdena som indata och prövningen som utdata.
 *
 * **Modulen avgör två av tre frågor.** Om tabellen har en rad för saken och om
 * raden rör sig är mätvärden. Om löftet *består i pengar* är en läsning: ett
 * löfte kan vara prissatt till noll och ändå handla om pengar (en bred
 * uppräkning nollas för att delarna inte ska dubbelräknas), och ett löfte kan
 * bära ett belopp och ändå vara en regel (en reglering vars enda kostnad är
 * handläggning). Läsningen lämnas därför utanför och lämnas in.
 */
import type { Anslagsrad, Radtraff } from "./anslagstabell.ts";

/**
 * Vad löftet består i, läst av en människa.
 *
 * `pengar` — löftet hålls genom att staten betalar eller avstår från att betala
 * något inom ett utgiftsanslag. Ett brett uppräkningslöfte som är prissatt till
 * noll för att inte dubbelräkna delarna hör hit: nollan är en bokföringsregel,
 * inte ett besked om att politiken är gratis.
 *
 * `regel` — löftet hålls av en lag, en modell eller ett villkor. Beslutet
 * b-0039 säger att ett anslagsyrkande **aldrig** kan bära ett sådant löfte: ett
 * belopp kan inte uttrycka en ny vårdform eller ett krav för rätten till ett
 * bidrag. Att pengar ändå råkar gå till samma myndighet ändrar inte det.
 *
 * `skatt` — löftet gäller en skatt eller en avgift. Utgiftsanslagens tabell
 * beskriver vad staten betalar ut, aldrig vad den tar in, så den kan inte bära
 * ett skattelöfte. Beslutets skatteundantag går genom
 * inkomstberäkningsyrkandet i stället, och det är en annan handling.
 */
export type Loftetsslag = "pengar" | "regel" | "skatt";

/** Mätvärdena för en koppling, som `anslag-tabell --json` skriver dem. */
export interface Anslagsmatning {
  koppling: string;
  promise_id: string | null;
  /** Antal rader i motionens anslagstabell. 0 = ingen tabell hittades. */
  tabellrader: number;
  /**
   * Hela tabellen. Finns för att läsningen ska kunna peka ut en rad som
   * ordöverlappet aldrig hittade — raden «Ekokrim – inrättande av ny myndighet»
   * bär löftet om att ersätta Ekobrottsmyndigheten utan att dela ett enda ordled
   * med löftets citat.
   */
  rader?: Anslagsrad[];
  /** Rader som delar ett sakord med löftet, närmast först, med överlappet som tal. */
  traffar: Radtraff[];
  /** Träffar vars avvikelse är läsbar och skild från noll. */
  andrade: Radtraff[];
  /** Satt när tabellen inte gick att hämta eller läsa. Då är frågan obesvarad. */
  fel?: string | null;
  /** Vad kopplingen påstår om handlingen — `stodjer`, `emot`, `avstod`. */
  riktning?: string | null;
}

export type Anslagsutfall =
  /** Löftet består i pengar och en rad för saken bär en ändring. Raden skrivs i motiveringen. */
  | "bar"
  /** Raderna för saken står ±0: motionen begärde ingen ändring av det löftet gäller. */
  | "raden_star_stilla"
  /** Ingen rad delar ett sakord med löftet. Hela tabellen ska läsas innan indragning. */
  | "ingen_rad_delar_sakord"
  /**
   * En rad rör sig, men delar bara ETT ordled med löftet. Det räcker inte för
   * att skriva raden i en publicerad motivering — anslaget "Kriminalvården"
   * delar ordstammen "kriminal" med ett löfte om stöd till barn i riskzon för
   * kriminalitet och avgör ingenting om det.
   */
  | "svag_traff"
  /** Motionen har ingen anslagstabell alls — då finns inget belopp att bära löftet. */
  | "ingen_tabell"
  /** Löftet hålls av en lag, en modell eller ett villkor. Ett belopp kan inte uttrycka det. */
  | "loftet_ar_en_regel"
  /** Löftet gäller en skatt. Utgiftstabellen beskriver inte vad staten tar in. */
  | "loftet_ar_en_skatt"
  /**
   * Raden bär en ändring, men den går åt andra hållet än kopplingen påstår:
   * kopplingen säger att partiet stöder löftet och tabellen drar ned anslaget.
   * Det kan vara en omfördelning inom anslaget — ett av fallen säger det
   * uttryckligen i sitt eget citat — och det kan vara en motsägelse. Skillnaden
   * går inte att se utan att läsa, och ett minustecken får aldrig skrivas in i
   * en motivering som stöd för att partiet begärde mer pengar.
   */
  | "raden_gar_andra_vagen"
  /**
   * Raden rör sig, men en läsning har funnit att den handlar om något annat än
   * löftet: myndighetens förvaltningsanslag i stället för reformen, klimat-
   * anpassning i stället för utsläppsminskning. Utfallet sätts av läsningen i
   * `data/anslagsraden-last.json`, aldrig av modulen — den ser bara ordled.
   */
  | "raden_handlar_om_annat"
  /** Tabellen gick inte att hämta. Säger ingenting om kopplingen. */
  | "oavgjort";

export interface Anslagsprovning {
  utfall: Anslagsutfall;
  /** Raden som bär löftet, när någon gör det. Störst ändring först bland träffarna. */
  rad: Anslagsrad | null;
  /** Vad utfallet innebär, i klarspråk och utan interna koder. */
  innebord: string;
  /** Sant när kopplingen ska dras in enligt beslutet. */
  drasIn: boolean;
  /** Sant när utfallet kräver att en människa läser hela tabellen först. */
  kraverLasning: boolean;
}

/**
 * Raden som bäst bär löftet bland de ändrade träffarna.
 *
 * Ordningen från `narmastLoftet` är ordöverlapp, inte belopp, och den första
 * träffen kan stå ±0 medan den andra bär hela ändringen. Att då skriva ut den
 * första i motiveringen vore att visa läsaren en rad som inte rör sig som
 * bevis för att partiet begärde pengar. Vi väljer därför den ändrade träff som
 * ligger närmast löftet i ordöverlapp — alltså den första i `andrade`.
 */
function baraste(matning: Anslagsmatning): Radtraff | null {
  return matning.andrade[0] ?? null;
}

/**
 * Hur många av löftets ordled en rad måste dela för att få skrivas in som
 * löftets bärare.
 *
 * Ett enda gemensamt ordled är ofta ett sammanträffande i svenskans
 * sammansättningar. Två är inte ett bevis heller, men det räcker för att raden
 * ska handla om samma sak som löftet i stället för att bara låta så. Under
 * tröskeln lämnas posten till en läsning i stället för att avgöras av svepet.
 */
export const MINSTA_ORDOVERLAPP = 2;

/**
 * Beloppet som text, i tabellens egen enhet och med tecknet kvar.
 *
 * Tusenavskiljaren är ett vanligt mellanslag, inte det hårda mellanslag
 * `toLocaleString` ger. Talet hamnar i publicerad text och i prövningsloggen,
 * och ett osynligt tecken som skiljer sig mellan två skrivningar av samma
 * belopp gör att en jämförelse mellan dem faller utan att någon ser varför.
 */
export function radensBelopp(rad: Anslagsrad): string {
  if (rad.avvikelse === null) return "okänt belopp";
  if (rad.avvikelse === 0) return "±0";
  const tal = Math.abs(rad.avvikelse)
    .toLocaleString("sv-SE")
    .replace(/\s/gu, " ");
  return `${rad.avvikelse > 0 ? "+" : "−"}${tal}`;
}

/**
 * Prövar en koppling mot beslutet.
 *
 * Ordningen mellan kontrollerna är inte likgiltig. Löftets slag kommer först:
 * bär ett löfte om en lag en tabellrad med en ändring är svaret ändå att
 * anslagsyrkandet inte kan bära det, och att då säga "raden bär löftet" skulle
 * vara att låta ett sammanträffande i sakorden avgöra. Beslutet är uttryckligt:
 * ett anslagsyrkande kan **aldrig** bära ett löfte om en regel.
 */
export function provaAnslagsbararen(matning: Anslagsmatning, slag: Loftetsslag): Anslagsprovning {
  if (matning.fel) {
    return {
      utfall: "oavgjort",
      rad: null,
      innebord: `Motionens tabell gick inte att läsa (${matning.fel}). Det säger ingenting om kopplingen.`,
      drasIn: false,
      kraverLasning: true,
    };
  }

  if (slag === "skatt") {
    return {
      utfall: "loftet_ar_en_skatt",
      rad: null,
      innebord:
        "Löftet gäller en skatt. Motionens tabell fördelar utgiftsanslag och beskriver inte vad " +
        "staten tar in, så yrkandet kan inte bära löftet hur tabellen än ser ut.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  if (slag === "regel") {
    return {
      utfall: "loftet_ar_en_regel",
      rad: null,
      innebord:
        "Löftet hålls av en lag, en modell eller ett villkor. Ett belopp kan inte uttrycka det, " +
        "och att pengar går till samma område ändrar inte vad löftet lovar.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  if (matning.tabellrader === 0) {
    return {
      utfall: "ingen_tabell",
      rad: null,
      innebord:
        "Motionen har ingen anslagstabell. Yrkandet hänvisar till en tabell som inte går att " +
        "läsa, och då finns inget belopp som kan bära löftet.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  if (matning.traffar.length === 0) {
    return {
      utfall: "ingen_rad_delar_sakord",
      rad: null,
      innebord:
        `Ingen av tabellens ${matning.tabellrader} rader delar ett sakord med löftet. Ordöverlapp ` +
        "är en läshjälp och inget bevis: hela tabellen ska läsas innan kopplingen dras in.",
      drasIn: false,
      kraverLasning: true,
    };
  }

  const traff = baraste(matning);
  if (traff === null) {
    return {
      utfall: "raden_star_stilla",
      rad: matning.traffar[0]?.rad ?? null,
      innebord:
        `Tabellens rader för det löftet gäller står ±0 eller utan läsbart tal. Motionen begärde ` +
        "ingen ändring av saken, och då bär yrkandet inte löftet.",
      drasIn: true,
      kraverLasning: false,
    };
  }

  const rad = traff.rad;
  if (matning.riktning === "stodjer" && (rad.avvikelse ?? 0) < 0) {
    return {
      utfall: "raden_gar_andra_vagen",
      rad,
      innebord:
        "Kopplingen säger att partiet stöder löftet, men den rad som bäst svarar mot löftet — " +
        `${rad.anslag} ${rad.namn} — står på ${radensBelopp(rad)} mot regeringens förslag. Motionen ` +
        "drar alltså ned anslaget. Det kan vara en omfördelning inom anslaget och det kan vara en " +
        "motsägelse, och skillnaden kräver att motionen läses.",
      drasIn: false,
      kraverLasning: true,
    };
  }

  if (traff.poang < MINSTA_ORDOVERLAPP) {
    return {
      utfall: "svag_traff",
      rad,
      innebord:
        `Den enda rad som rör sig — ${rad.anslag} ${rad.namn} med ${radensBelopp(rad)} — delar bara ` +
        "ett ordled med löftet. Det kan vara samma sak och det kan vara ett sammanträffande i en " +
        "ordstam, och skillnaden går inte att se utan att läsa tabellen.",
      drasIn: false,
      kraverLasning: true,
    };
  }

  return {
    utfall: "bar",
    rad,
    innebord:
      `Tabellen har en rad för saken: ${rad.anslag} ${rad.namn} med ${radensBelopp(rad)} mot ` +
      "regeringens förslag, i tabellens egen enhet. Yrkandet bär löftet, och raden hör i motiveringen.",
    drasIn: false,
    kraverLasning: false,
  };
}

/**
 * Raden skriven för läsaren, till kopplingens motivering.
 *
 * Beslutet kräver att raden "hämtas och skrivs ut i motiveringen" — annars vet
 * läsaren bara att vi hänvisar till en tabell, inte vilken rad i den som bär
 * löftet, och kan därför inte kontrollera oss. Enheten skrivs ut för att
 * riksdagens tabeller anger tusental kronor och en läsare som antar kronor
 * läser tusen gånger fel.
 */
export function motiveringsnot(rad: Anslagsrad, datum: string): string {
  return (
    `${NOTENS_INLEDNING}, och tabellen ingår i ` +
    `yrkandet genom hänvisningen. Raden som bär löftet är ${rad.anslag} ${rad.namn}, där motionen ` +
    `begär ${radensBelopp(rad)} mot regeringens förslag (tabellens egen enhet, normalt tusental ` +
    `kronor). Raden hämtades ur motionen ${datum}.`
  );
}

/**
 * Notens inledning.
 *
 * Stod «Motionens **enda** yrkande» till 2026-08-08, och det var sant så länge
 * regeln bara kördes på motioner som saknade sakyrkanden. Sedan raden också
 * skrivs ut för motioner som har egna sakyrkanden vid sidan av anslagsyrkandet
 * var ordet fel — och det stod i publicerad text, där en läsare kan räkna
 * yrkandena själv och se att de är fyra.
 */
const NOTENS_INLEDNING = "Motionens anslagsyrkande anvisar anslagen enligt tabellen i motionen";

/**
 * Motiveringen utan noten från en tidigare anslagsläsning, så att den inte dubbleras.
 *
 * Känner igen både dagens inledning och den som gällde till 2026-08-08. En
 * omkörning över redan skrivna motiveringar måste kunna städa bort den gamla
 * noten; gör den inte det växer motiveringen med en nästan identisk mening för
 * varje körning, och läsaren ser två påståenden om samma rad.
 */
export function utanTidigareAnslagsnot(motivering: string): string {
  const i = [NOTENS_INLEDNING, "Motionens enda yrkande anvisar anslagen enligt tabellen"]
    .map((inledning) => motivering.indexOf(inledning))
    .filter((n) => n !== -1)
    .sort((a, b) => a - b)[0];
  return (i === undefined ? motivering : motivering.slice(0, i)).trim();
}
