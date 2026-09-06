/**
 * Hur många av en förslagskörnings kopplingar talar till partiets fördel, och
 * hur många emot?
 *
 * Kön 2026-09-06 hade 135 `stodjer` och ett enda `motverkar` — och det enda var
 * en votering, alltså inte något motorn hittade i en motionstext. En kö där
 * 99,3 procent av allt som hittas talar till partiets fördel är inte ett fel i
 * sig: partier motionerar om sin egen politik, och en motion som går emot det
 * egna löftet är sällsynt av naturliga skäl. Men kvoten är värd att mäta, för
 * de två förklaringarna ser likadana ut i en enskild kö:
 *
 * - **Partierna gör mest sådant som stämmer med vad de lovat.** Då är kvoten
 *   ett mätresultat om partierna.
 * - **Motorn frågar bara efter det som stämmer.** Då är kvoten ett mätresultat
 *   om oss, och Handlingsvågen blir ett register över vad partierna hunnit
 *   tycka i stället för över vad de gjort tvärtemot.
 *
 * Skillnaden syns bara över tid: är kvoten stabil runt 99 procent oavsett
 * vilka löften och vilka handlingar en körning går igenom, är det frågan som
 * är ensidig och inte materialet. Därför skrivs en rad per körning, och därför
 * skrivs den bredvid datat i stället för i en körningslogg som rullar bort.
 *
 * Två tal per körning, inte ett. **Föreslagna** är vad modellen sa ja till,
 * **i kön** vad som också tog sig genom grindarna. Det är det första talet som
 * mäter motorns fråga; det andra kan skilja sig av skäl som inte har med
 * riktningen att göra.
 */

import type { Riktning } from "./domar.ts";

/** En körnings mätning, som den skrivs till `data/riktningsfordelningen.json`. */
export interface Riktningspost {
  run_id: string;
  datum: string;
  foreslagna: { stodjer: number; motverkar: number };
  i_kon: { stodjer: number; motverkar: number };
  /**
   * Satt på den enda post som inte mättes av körningen själv: körningen
   * 2026-09-06, räknad ur kön i efterhand när mätningen byggdes. Då är
   * `foreslagna` inte vad modellen sa ja till utan vad som tog sig genom
   * grindarna — ett golv, inte talet. Fältet finns för att serien inte ska
   * läsas som om den första raden mätte samma sak som resten.
   */
  efterhandsmatt?: true;
}

/** Loggen är en lista i tidsordning, äldst först. */
export type Riktningslogg = Riktningspost[];

const tomt = () => ({ stodjer: 0, motverkar: 0 });

/** Räknar en körnings riktningar. Ett förslag som föll på en grind når inte kön. */
export function raknaKorningen(
  runId: string,
  datum: string,
  utfall: ReadonlyArray<{ riktning: Riktning; iKon: boolean }>,
): Riktningspost {
  const post: Riktningspost = { run_id: runId, datum, foreslagna: tomt(), i_kon: tomt() };
  for (const u of utfall) {
    if (u.riktning !== "stodjer" && u.riktning !== "motverkar") continue;
    post.foreslagna[u.riktning] += 1;
    if (u.iKon) post.i_kon[u.riktning] += 1;
  }
  return post;
}

/**
 * Lägger posten i loggen — samma `run_id` skriver över i stället för att
 * dubbleras. En körning som startas om ska räknas en gång, annars mäter
 * kvoten hur ofta vi kört och inte vad vi hittat.
 */
export function laggTill(logg: Riktningslogg, post: Riktningspost): Riktningslogg {
  const utan = logg.filter((p) => p.run_id !== post.run_id);
  return [...utan, post].sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.run_id < b.run_id ? -1 : 1));
}

/** Andelen `motverkar` av det modellen föreslog, eller `null` när körningen är tom. */
export function andelMotverkar(post: Riktningspost): number | null {
  const summa = post.foreslagna.stodjer + post.foreslagna.motverkar;
  return summa === 0 ? null : post.foreslagna.motverkar / summa;
}

/** Körningens egen rad, för utskriften när körningen är klar. */
export function korningensRad(post: Riktningspost): string {
  const andel = andelMotverkar(post);
  const summa = post.foreslagna.stodjer + post.foreslagna.motverkar;
  if (andel === null) return "riktningen: körningen föreslog ingen koppling — ingenting att mäta.";
  return (
    `riktningen: ${post.foreslagna.motverkar} av ${summa} föreslagna kopplingar går EMOT löftet ` +
    `(${(andel * 100).toFixed(1)} %), ${post.i_kon.motverkar} av dem tog sig genom grindarna. ` +
    "Hittar motorn nästan bara stöd är det antingen partiernas handlingar eller vår egen fråga " +
    "som är ensidig, och bara serien över tid skiljer dem åt."
  );
}

/**
 * Serien, för den som läser loggen. Talet som betyder något är det sista:
 * hur många körningar i rad som inte hittat en enda handling som går emot.
 */
export function serienssammanfattning(logg: Riktningslogg): string {
  if (logg.length === 0) return "ingen körning mätt än.";
  const summa = logg.reduce(
    (a, p) => ({
      stodjer: a.stodjer + p.foreslagna.stodjer,
      motverkar: a.motverkar + p.foreslagna.motverkar,
    }),
    tomt(),
  );
  const total = summa.stodjer + summa.motverkar;
  let iRad = 0;
  for (let i = logg.length - 1; i >= 0; i--) {
    if ((logg[i]!.foreslagna.motverkar ?? 0) > 0) break;
    iRad += 1;
  }
  const andel = total === 0 ? 0 : (summa.motverkar / total) * 100;
  const efterhand = logg.filter((p) => p.efterhandsmatt).length;
  return (
    `${logg.length} körningar mätta, ${total} föreslagna kopplingar, ${summa.motverkar} emot ` +
    `(${andel.toFixed(1)} %). ${iRad} körning(ar) i rad utan en enda handling som går emot.` +
    (efterhand > 0
      ? ` ${efterhand} av raderna är räknad(e) ur kön i efterhand — där är «föreslagna» ett golv.`
      : "")
  );
}
