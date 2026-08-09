/**
 * Källor som ändrats efter att vi citerat dem.
 *
 * En källa är inte ett dokument som ligger stilla. Sidor skrivs om, adresser
 * flyttas, myndigheter språkgranskar sina egna handlingar. Det är hela skälet
 * till att varje citat har en arkivkopia — men kopian har hittills bara varit
 * en länk bredvid källan, och när de två börjat säga olika saker har det synts
 * som en stämpel på en enskild löftessida och ingen annanstans.
 *
 * Den här modulen samlar fallen. Den avgör också vilka som får läggas fram,
 * och det är dess viktigaste uppgift: **ett fall utan bevis är ett rykte.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Tre villkor, alla nödvändiga:
 *
 * 1. **Kopian måste bära citatet.** Utan arkivkopia finns inget «förut» att
 *    ställa mot «nu», bara vårt ord om vad som stod. Arkivsvepet har redan
 *    prövat att kopian bär citatet ordagrant; saknas kopian utesluts fallet.
 * 2. **En människa måste ha sett båda länkarna.** Kontrollen kan ha fel av
 *    skäl som inte är källans: en samtyckesruta som äter innehållet, en sida
 *    som ritas med javascript, en betalvägg. Var och en ser ut precis som en
 *    utbytt sida. Därför publicerar `reviewed_at` fallet — inte mätningen.
 * 3. **Slaget måste vara känt.** «Ordalydelsen är ändrad» och «sidan är en
 *    annan sida» är två olika påståenden om världen och får inte skrivas ihop.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Och en regel om ton, som väger lika tungt som de tre ovan:
 *
 * **Vi säger vad som står, inte varför.** Sidan redovisar två textstycken och
 * två datum. Den påstår ingenting om avsikt — inte att någon velat dölja
 * något, inte att en ändring är ett svek. Läsaren har båda länkarna och gör
 * sin egen bedömning. Det är också därför vem som äger sidan skrivs ut: när
 * riksdagen språkgranskar en motion är det riksdagen som ändrat texten, inte
 * partiet som skrev den, och att låta det se ut som partiets verk vore att
 * anklaga fel part.
 */
import { getParties, getPartyByCode, getPromises, type Party, type PromisePost } from "./data.ts";
import { getIssuesFile, getStances, type StanceStatement } from "./stances.ts";
import type { Andringsslag, Kallandring } from "./source-link.ts";

/** Rubriken varje slag får på sidan. Torr, och utan påstående om avsikt. */
export const SLAG_RUBRIK: Record<Andringsslag, string> = {
  ordalydelse: "ORDALYDELSEN ÄR ÄNDRAD",
  "sidan-utbytt": "SIDAN ÄR UTBYTT",
  "sidan-borttagen": "SIDAN ÄR BORTTAGEN",
};

/** Vad slaget betyder, i en mening, för den som inte läst metodsidan. */
export const SLAG_FORKLARING: Record<Andringsslag, string> = {
  ordalydelse:
    "Sidan finns kvar och handlar om samma sak, men orden vi citerade är omskrivna.",
  "sidan-utbytt":
    "Adressen svarar, men innehållet vi citerade finns inte längre där.",
  "sidan-borttagen": "Adressen svarar inte längre — sidan är borta.",
};

export interface AndradKalla {
  /** `lofte` eller `besked` — vilken våg fallet kommer ur. */
  slagAvBelagg: "lofte" | "besked";
  id: string;
  /** Rubriken läsaren känner igen fallet på. */
  rubrik: string;
  /** Länk in i sajten, till löftet eller frågan citatet hör till. */
  vag: string;
  parti: Party | undefined;
  /** Det vi citerade, ordagrant. */
  citat: string;
  kallaUrl: string;
  /** Vem som äger sidan. `data.riksdagen.se` är inte partiet. */
  domin: string;
  arkivUrl: string;
  hamtad: string;
  andring: Kallandring;
}

/**
 * Ett fall utan arkivkopia går inte att belägga, och ett ogranskat får vänta.
 *
 * Exporterad för att kunna provas: det här är sidans hela försvar, och ett
 * försvar som bara finns inuti en filläsande funktion går inte att mäta.
 */
export function farLaggasFram(
  andring: Kallandring | undefined,
  arkivUrl: string | null,
): andring is Kallandring & { reviewed_at: string } {
  return Boolean(andring?.reviewed_at) && Boolean(arkivUrl);
}

function franLofte(p: PromisePost, parties: Party[]): AndradKalla | null {
  if (!farLaggasFram(p.source.source_change, p.source.archive_url)) return null;
  return {
    slagAvBelagg: "lofte",
    id: p.id,
    rubrik: p.title,
    vag: `/lofte/${p.slug}`,
    parti: getPartyByCode(parties, p.parties[0] ?? ""),
    citat: p.quote,
    kallaUrl: p.source.url,
    domin: p.source.domain,
    arkivUrl: p.source.archive_url!,
    hamtad: p.source.fetched_at.slice(0, 10),
    andring: p.source.source_change!,
  };
}

function franBesked(
  st: StanceStatement & { source_change?: Kallandring },
  fragaSlug: string,
  fragaTitel: string,
  partikod: string,
  parties: Party[],
): AndradKalla | null {
  if (!farLaggasFram(st.source_change, st.source.archive_url)) return null;
  return {
    slagAvBelagg: "besked",
    id: st.id,
    rubrik: fragaTitel,
    vag: `/fraga/${fragaSlug}`,
    parti: getPartyByCode(parties, partikod),
    citat: st.quote,
    kallaUrl: st.source.url,
    domin: st.source.domain,
    arkivUrl: st.source.archive_url!,
    hamtad: st.source.fetched_at.slice(0, 10),
    andring: st.source_change!,
  };
}

/**
 * Alla belagda fall ur båda vågorna, senast observerade först.
 *
 * Ordningen är medveten: det här är inte en lista att bläddra igenom utan en
 * logg att titta i, och det senaste är det som ännu ingen sett.
 */
export function getAndradeKallor(): AndradKalla[] {
  const parties = getParties();
  const fall: AndradKalla[] = [];

  for (const p of getPromises()) {
    if (p.status !== "aktiv") continue;
    const f = franLofte(p, parties);
    if (f) fall.push(f);
  }

  const fragor = getIssuesFile().issues;
  const titelFor = new Map<string, { slug: string; titel: string }>();
  for (const fraga of fragor) {
    for (const sq of fraga.subquestions) titelFor.set(sq.id, { slug: fraga.slug, titel: fraga.title });
  }
  for (const cell of getStances()) {
    const fraga = titelFor.get(cell.subquestion_id);
    if (!fraga) continue;
    for (const st of cell.statements) {
      const f = franBesked(st, fraga.slug, fraga.titel, cell.party, parties);
      if (f) fall.push(f);
    }
  }

  return fall.sort((a, b) =>
    a.andring.observed_at === b.andring.observed_at
      ? a.id.localeCompare(b.id)
      : a.andring.observed_at < b.andring.observed_at
        ? 1
        : -1,
  );
}

/** Antal fall per slag — sidans ingress behöver kunna räkna utan att lista. */
export function raknaPerSlag(fall: AndradKalla[]): Record<Andringsslag, number> {
  const ut: Record<Andringsslag, number> = {
    ordalydelse: 0,
    "sidan-utbytt": 0,
    "sidan-borttagen": 0,
  };
  for (const f of fall) ut[f.andring.kind]++;
  return ut;
}
