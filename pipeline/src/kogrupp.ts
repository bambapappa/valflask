/**
 * Gruppen som en `delat`-post ska bära, satt PÅ kö-posten före godkännandet.
 *
 * VARFÖR STEGET FINNS. Samma skäl som `kobelopp.ts`, och samma fälla. Kvalitets-
 * filtret prövar löftet som det faktiskt kommer att publiceras, och prövningen
 * skrivs mot kö-posten innan beslutet. `group_id` ingår i `kanon()` — det är en
 * utsaga om att posten gäller samma politik som ett annat löfte, och den utsagan
 * är just vad en prövning ska kunna uttala sig om. Sätts gruppen först vid
 * godkännandet beskriver prövningen en annan version, och grinden fäller posten
 * med rätta.
 *
 * Mätt 2026-08-25: alla tre prövade `delat`-poster hade en hash som stämde med
 * `group_id: null` och inte med gruppen de skulle in i. Sjutton beslut satt fast
 * där — inte för att någon tvivlade på dem, utan för att gruppen sattes ett steg
 * för sent.
 *
 * `harledGrupp` speglar `approve()`:s egen härledning och finns som en egen
 * funktion just för att de två inte ska glida isär.
 */

/** Det gruppsättningen behöver veta om ett publicerat löfte. */
export interface Gruppmal {
  id: string;
  status?: string;
  group_id?: string | null;
  title?: string;
}

/** Kö-posten, läst som gruppsättningen ser den. */
export interface Kogruppost {
  id: string;
  group_id?: string | null;
}

export interface Kogrupprad {
  /** Kö-postens id. */
  id: string;
  /** Det publicerade löfte posten ska dela grupp med. */
  till: string;
}

export interface Kogruppprovning {
  ok: boolean;
  fel: string[];
  /** Satt när raden inte behöver göras om — gruppen står redan rätt. */
  hoppas?: string;
}

/**
 * Gruppens namn, härlett ur målet.
 *
 * Har målet redan en grupp är det den posten ska in i; annars bildas en ny med
 * målets id i namnet. Exakt vad `approve()` gör — se `review.ts`.
 */
export function harledGrupp(mal: Gruppmal): string {
  return mal.group_id ?? `g-${mal.id}`;
}

export function provaKogrupprad(
  rad: Kogrupprad,
  post: Kogruppost | undefined,
  mal: Gruppmal | undefined,
): Kogruppprovning {
  const fel: string[] = [];

  if (post === undefined) {
    return { ok: true, fel: [], hoppas: `${rad.id}: finns inte i kön längre — redan avgjord` };
  }
  if (mal === undefined) {
    fel.push(`${rad.id}: målet ${rad.till} finns inte i promises.json`);
    return { ok: false, fel };
  }
  if ((mal.status ?? "aktiv") !== "aktiv") {
    fel.push(
      `${rad.id}: målet ${rad.till} har status ${mal.status}. ` +
        "En grupp kan inte peka på ett indraget löfte.",
    );
  }

  const onskad = harledGrupp(mal);
  const nuvarande = post.group_id ?? null;
  if (nuvarande !== null && nuvarande !== onskad) {
    // Att flytta en post mellan grupper är en läsning, inte en omskrivning.
    fel.push(
      `${rad.id}: kö-posten står redan i gruppen ${nuvarande} och raden vill ha ${onskad}. ` +
        "Avgör vilken grupp som gäller innan raden körs.",
    );
  }
  if (nuvarande === onskad) {
    return { ok: fel.length === 0, fel, hoppas: `${rad.id}: står redan i ${onskad}` };
  }

  return { ok: fel.length === 0, fel };
}
