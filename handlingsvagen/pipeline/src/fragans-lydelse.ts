/**
 * Frågans egen lydelse — det ledamoten faktiskt frågar.
 *
 * En interpellation eller en skriftlig fråga har inga yrkanden. Handlingen är
 * frågan själv, och texten före upptakten är bakgrund och argumentation, precis
 * som en motions brödtext. Ett bevis som citerar bakgrunden ser ordagrant rätt
 * ut och visar ändå inte handlingen.
 *
 * Porterad från `handlingens-egna-ord`-skillens `fragans_lydelser`, så att
 * svepet över hela beståndet kan pröva samma sak i samma kanon som skillen gör
 * för en post i taget. Går de två isär ljuger den ena.
 */

/**
 * Frågans upptakt: «…vill jag fråga statsrådet X:», «Min fråga till Y lyder
 * därför:», «Jag vill därför fråga:». Formuleringen varierar, kolonet gör det
 * inte. Prövad mot 30 slumpade fråge- och interpellationsdokument: träff i
 * samtliga.
 */
const UPPTAKT = /\b(?:fråga|frågar|frågor)\b[^:?!]{0,140}:/giu;

/** Kortare än så är ingen frågelydelse, det är en fras. */
const MIN_TECKEN = 40;

/** Frågornas lydelser i ordning, med sitt nummer. */
export function fragansLydelser(text: string): Array<{ nummer: string; lydelse: string }> {
  const trav = [...text.matchAll(UPPTAKT)];
  const sista = trav.at(-1);
  const svans = sista?.index === undefined ? text : text.slice(sista.index + sista[0].length);
  const ut: Array<{ nummer: string; lydelse: string }> = [];
  let n = 0;
  for (const m of svans.match(/[^?]+\?/gu) ?? []) {
    let f = m.trim();
    if (trav.length === 0) {
      // Utan upptakt vet vi inte var frågedelen börjar; klipp vid föregående
      // meningsslut så bakgrundstext inte följer med in i lydelsen.
      f = f.replace(/^[\s\S]*(?<=[.:!?])\s+/u, "").trim();
    }
    if (f.length >= MIN_TECKEN) ut.push({ nummer: String(++n), lydelse: f });
  }
  return ut;
}
