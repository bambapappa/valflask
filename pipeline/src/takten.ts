/**
 * Retry-After, tolkad en gång för hela pipelinen.
 *
 * Låg tidigare bara i `llm.ts`, privat. När hämtningen skulle backa av på
 * samma sätt fanns två vägar: kopiera funktionen eller flytta ut den. En
 * kopia hade varit en regel på två ställen, och sådana glider isär — samma
 * skäl som att arkivväntan bara får ligga i `arkivvantan.ts`.
 */

/**
 * Tolkar ett `Retry-After`-huvud till millisekunder, kapat vid `capMs`.
 *
 * Huvudet kommer i två former enligt RFC 9110: ett antal sekunder, eller ett
 * HTTP-datum. Båda hanteras. Saknas huvudet, eller går det inte att tolka,
 * blir svaret `null` — och då är det den anropande koden som får välja sin
 * egen väntan. Ett otolkbart huvud ska inte tyst bli noll.
 */
export function parseRetryAfterMs(h: string | null, capMs: number): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(capMs, Math.max(0, secs * 1000));
  const date = Date.parse(h);
  if (Number.isFinite(date)) return Math.min(capMs, Math.max(0, date - Date.now()));
  return null;
}
