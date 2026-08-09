/**
 * Takten mot web.archive.org.
 *
 * Arkivet är gratis, delat och strypt. Varje gång vi ber om något — uppslag,
 * ögonblicksbild eller en ny kopia — kan svaret bli 429, och det har det blivit
 * i tre pass i rad: uppslagstjänsten 429:ade 8 augusti, innehållshämtningen föll
 * 9 augusti, och sparfunktionen 429:ade efter fem kopior i rad samma kväll.
 * Mänskligt beslut 2026-08-09: **respektera strypningen i stället för att köra
 * på.** Ett 429 är arkivet som säger «vänta», inte ett fel att försöka runt.
 *
 * Två regler, båda kodade här:
 *
 * 1. **Vänta så länge arkivet säger.** Svarar det `Retry-After` gäller den
 *    tiden. Saknas huvudet fördubblas pausen för varje försök.
 * 2. **En strypt begäran är inte ett utfall.** Den som räknar budget eller
 *    skriver «kopia saknas» måste kunna skilja «arkivet sa nej just nu» från
 *    «arkivet har ingen kopia». Annars skrivs en tom lucka in som ett mätvärde,
 *    och det är precis så de 45 *oavgjort* en gång blev till 48 av 48.
 */
import type { HttpFetch } from "./archive.ts";

/** Grundpausen mellan två begäranden. Mätt: fem saves i rad ger 429. */
export const GRUNDPAUS_MS = 5_000;
const MAX_FORSOK = 4;
const TAK_MS = 120_000;

export const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Utfallet av en begäran mot arkivet, med strypningen som eget svar. */
export type Arkivsvar =
  | { slag: "svar"; res: Response }
  | { slag: "strypt"; vantade: number }
  | { slag: "nat" };

/**
 * Hur länge arkivet vill att vi väntar. `Retry-After` kommer som sekunder
 * eller som ett datum; båda formerna gäller enligt HTTP, och Wayback använder
 * sekundformen. Utan huvud fördubblas grundpausen per försök.
 */
export function pausEfterStrypning(res: Response, forsok: number, nu = Date.now()): number {
  const huvud = res.headers.get("retry-after");
  if (huvud) {
    const sekunder = Number(huvud);
    if (Number.isFinite(sekunder) && sekunder >= 0) return Math.min(sekunder * 1000, TAK_MS);
    const datum = Date.parse(huvud);
    if (!Number.isNaN(datum)) return Math.min(Math.max(datum - nu, 0), TAK_MS);
  }
  return Math.min(GRUNDPAUS_MS * 2 ** forsok, TAK_MS);
}

/**
 * Hämtar från arkivet och väntar ut strypningen i stället för att köra på.
 * Returnerar `strypt` när alla försök tagit slut — anroparen ska då sluta be
 * om mer, inte skriva ned ett utfall.
 */
export async function hamtaFranArkivet(
  url: string,
  httpFetch: HttpFetch = globalThis.fetch.bind(globalThis),
  init: RequestInit = {},
  maxForsok = MAX_FORSOK,
): Promise<Arkivsvar> {
  let vantade = 0;
  for (let forsok = 0; forsok < maxForsok; forsok++) {
    let res: Response;
    try {
      res = await httpFetch(url, init);
    } catch {
      return { slag: "nat" };
    }
    if (res.status !== 429 && res.status !== 503) return { slag: "svar", res };
    const paus = pausEfterStrypning(res, forsok);
    vantade += paus;
    if (forsok < maxForsok - 1) await sov(paus);
  }
  return { slag: "strypt", vantade };
}
