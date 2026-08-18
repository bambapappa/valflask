/**
 * samtidigt.ts — kör flera väntande arbeten bredvid varandra, med tak.
 *
 * BAKGRUNDEN (2026-08-18). Körningen var entrådig rakt igenom: hämtningen
 * läste en sida i taget genom 43 källor, och artikelloopen väntade ut varje
 * LLM-svar innan nästa artikel började. Mätt på de tre senaste körningarna tog
 * de 201, 296 och 325 minuter — mot kommentarens 73–87 — och med kadens var
 * fjärde timme köade de bakom varandra i stället för att hinna emellan.
 * Nästan hela tiden var väntan, inte arbete.
 *
 * REGELN. Ordningen ut är ordningen in. Det är hela poängen med att den här
 * filen finns i stället för ett `Promise.all` på plats: pipelinens utdata är
 * grindad på determinism — samma indata ska ge samma kö, i samma ordning, och
 * dubblettkollen inom en körning beror på vilken kandidat som kom först. Ett
 * `Promise.all` ger rätt ordning i resultatlistan men släpper ändå in
 * samtidighet i det som skrivs under tiden; därför lämnar arbetena här ifrån
 * sig ett värde var, och allt som ändrar delat tillstånd görs efteråt i
 * indataordning.
 *
 * Ett arbete som kastar kastar vidare — den som anropar bestämmer vad ett fel
 * betyder. Övriga arbeten som redan startat får löpa klart innan felet når
 * anroparen, så att inget halvt svar lämnas hängande.
 */

/**
 * Kör `arbete` över `poster` med högst `tak` samtidigt.
 *
 * Resultatet ligger i posternas ordning, oavsett i vilken ordning arbetena
 * blev klara. `tak` under 1 behandlas som 1, alltså vanlig sekventiell
 * körning — det är läget proven jämför mot.
 */
export async function kartaSamtidigt<T, R>(
  poster: readonly T[],
  tak: number,
  arbete: (post: T, index: number) => Promise<R>,
): Promise<R[]> {
  const gransen = Math.max(1, Math.floor(tak));
  const resultat = new Array<R>(poster.length);
  let nasta = 0;
  let forstaFelet: unknown = null;

  const arbetare = async (): Promise<void> => {
    for (;;) {
      const i = nasta++;
      if (i >= poster.length) return;
      try {
        resultat[i] = await arbete(poster[i]!, i);
      } catch (e) {
        // Spara det FÖRSTA felet i indataordning, inte det som råkade hinna
        // först i tid. Annars beror felmeddelandet på takten.
        if (forstaFelet === null || (forstaFelet as { i: number }).i > i) {
          forstaFelet = { i, fel: e };
        }
        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(gransen, poster.length) }, () => arbetare()),
  );

  if (forstaFelet !== null) throw (forstaFelet as { fel: unknown }).fel;
  return resultat;
}
