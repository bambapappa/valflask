/**
 * Datumfönster för skörden.
 *
 * Riksmötestaggen (rm) halkar efter verkligheten: propositioner och frågor
 * från september 2026 bär fortfarande rm 2025/26 (mätt 2026-09-28), så en
 * skörd av innevarande riksmöte ensam missar allt som kom mellan riksmötena.
 * Fönsterskörden väljer i stället på datum — allt riksdagen daterat mellan
 * två dagar, oavsett tagg.
 *
 * Voteringar går inte att välja på datum: voteringlista ignorerar from/tom
 * både med och utan rm (mätt 2026-09-29 — rm=2025/26 gav 797 id med och
 * utan fönster), och grupperade rader bär inget datum. För dem skördas i
 * stället riksmötena fönstret berör, och bara id som ännu inte finns.
 */

export interface Datumfonster {
  from: string;
  tom: string;
}

/**
 * Dagar bakåt från senaste kända handling som fönstret ändå tar med. Ett
 * dokument kan publiceras dagar efter sitt datum; omkörningen är idempotent,
 * så överlappet kostar bara några extra anrop.
 */
export const FONSTRETS_OVERLAPP_DAGAR = 14;

const ISO_DAG = /^\d{4}-\d{2}-\d{2}$/u;

function arGiltigDag(s: string): boolean {
  return ISO_DAG.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

/** Validerar ett fönster från kommandoraden. Faller hellre än skördar fel dagar. */
export function tolkaFonster(from: string, tom: string): Datumfonster {
  for (const [namn, v] of [["--from", from], ["--tom", tom]] as const) {
    if (!arGiltigDag(v)) throw new Error(`${namn} måste vara ett datum ÅÅÅÅ-MM-DD, fick "${v}"`);
  }
  if (from > tom) throw new Error(`--from ${from} ligger efter --tom ${tom}`);
  return { from, tom };
}

/** Dagens datum i UTC som ÅÅÅÅ-MM-DD. */
export function idagUtc(nu: Date = new Date()): string {
  return nu.toISOString().slice(0, 10);
}

/** Riksmötet ett datum hör till. Ett riksmöte löper september–augusti. */
export function riksmoteFor(datum: string): string {
  const ar = Number(datum.slice(0, 4));
  const start = Number(datum.slice(5, 7)) >= 9 ? ar : ar - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Riksmötena vars voteringar ett fönster kan beröra: från riksmötet för
 * fönstrets start till riksmötet för dess slut. Börjar fönstret under hösten
 * (september–december) tas även riksmötet före med, eftersom handlingar då
 * kan bära förra riksmötets tagg.
 */
export function riksmotenForFonster(f: Datumfonster): string[] {
  const hostStart = Number(f.from.slice(5, 7)) >= 9;
  const forsta = Number(riksmoteFor(f.from).slice(0, 4)) - (hostStart ? 1 : 0);
  const sista = Number(riksmoteFor(f.tom).slice(0, 4));
  const ut: string[] = [];
  for (let s = forsta; s <= sista; s += 1) ut.push(`${s}/${String((s + 1) % 100).padStart(2, "0")}`);
  return ut;
}

/** Fönstrets startdag ur datat: senaste daterade handling minus överlappet. */
export function franDatumUrData(handlingar: ReadonlyArray<{ datum: string }>, overlappDagar: number): string {
  const senaste = handlingar
    .map((h) => h.datum)
    .filter(arGiltigDag)
    .reduce((a, b) => (b > a ? b : a), "");
  if (senaste === "") throw new Error("inga daterade handlingar att räkna fönstret från — ange --from uttryckligen");
  const d = new Date(`${senaste}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - overlappDagar);
  return idagUtc(d);
}

/** Voterings-id som ännu inte finns bland handlingarna — bara de behöver hämtas. */
export function okandaVoteringsIdn(
  idn: readonly string[],
  handlingar: ReadonlyArray<{ votering_id?: string | undefined }>,
): string[] {
  const kanda = new Set(handlingar.map((h) => h.votering_id).filter(Boolean));
  return idn.filter((id) => !kanda.has(id));
}
