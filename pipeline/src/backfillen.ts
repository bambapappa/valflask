/**
 * Vilka platshållare är DINA?
 *
 * Mönstret är två commits: dataändringen skrivs med `"commit": "0000000"`
 * eftersom hashen inte finns förrän commiten är gjord, och en andra commit
 * fyller i den. Backfillen bytte tidigare ut varenda `0000000` i filen mot
 * samma hash, oavsett vem som skrivit den.
 *
 * Ofarligt så länge alla gör sitt andra steg. Det gjorde de inte: 376
 * främmande platshållare låg kvar i trädet från sessioner som inte hunnit
 * klart, och ett anrop hade tillskrivit dem alla en commit de inte kom ur —
 * 376 falska påståenden om var en ändring kommer ifrån, i data som visas
 * publikt. Mätt 2026-09-01, när skriptet stämplade 389 i stället för 2.
 *
 * Regeln bor här och inte i skriptet, så att den går att pröva utan att starta
 * en delprocess, bygga ett git-repo och symlänka in `node_modules`. Ett prov
 * som gör allt det mäter lika mycket sin egen miljö som regeln det påstår sig
 * mäta — och ett prov som bara ibland håller är inget prov.
 */

export const PLATSHALLARE = "0000000";

/** Varje objekt som bär en platshållare, serialiserat, med antal. */
export function platshallarna(o: unknown, ut: Map<string, number> = new Map()): Map<string, number> {
  if (Array.isArray(o)) {
    for (const x of o) platshallarna(x, ut);
  } else if (o && typeof o === "object") {
    const r = o as Record<string, unknown>;
    if (r["commit"] === PLATSHALLARE) {
      const n = JSON.stringify(r);
      ut.set(n, (ut.get(n) ?? 0) + 1);
    }
    for (const v of Object.values(r)) platshallarna(v, ut);
  }
  return ut;
}

/**
 * Stämplar platshållarna i `trad` som inte redan fanns i `committat`.
 *
 * Jämförelsen görs på INNEHÅLL, inte på ordning. En tidig variant räknade hur
 * många platshållare den committade versionen hade och hoppade över så många i
 * trädet — men det antar att dina egna ligger sist. Lägger du en historikpost
 * på ett tidigt löfte hoppas din egen över och någon annans stämplas i
 * stället: precis samma felstämpling, med omvänt tecken.
 *
 * Nyckeln är därför posten själv, serialiserad, räknad som en multimängd så
 * att två likalydande poster inte slår ihop till en.
 *
 * `committat` som `null` betyder «allt i trädet är ditt» — filen är ny, eller
 * den som kör har uttryckligen sagt att även andras ska stämplas.
 */
export function stampla(
  trad: unknown,
  committat: unknown | null,
  hash: string,
): { bytta: number; hoppade: number } {
  const andras = committat === null ? new Map<string, number>() : platshallarna(committat);
  let bytta = 0;
  let hoppade = 0;

  const ga = (o: unknown): void => {
    if (Array.isArray(o)) {
      for (const x of o) ga(x);
    } else if (o && typeof o === "object") {
      const r = o as Record<string, unknown>;
      if (r["commit"] === PLATSHALLARE) {
        const n = JSON.stringify(r);
        const kvar = andras.get(n) ?? 0;
        if (kvar > 0) {
          andras.set(n, kvar - 1);
          hoppade += 1;
        } else {
          r["commit"] = hash;
          bytta += 1;
        }
      }
      for (const v of Object.values(r)) ga(v);
    }
  };

  ga(trad);
  return { bytta, hoppade };
}
