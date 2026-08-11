/**
 * Hämtar det innehåll en ren avslagsbeslutspunkt bara adresserar.
 *
 * Beslutstexten säger vilka motioner och yrkanden som avslogs, men inte vad
 * yrkandena begärde. Godkännandets grind kräver därför deras ordagranna
 * lydelser redan när kopplingen skapas. `avslag-backfill` använder samma
 * funktion för äldre kopplingar som saknar fältet.
 */

import type { Avslag } from "./granskning.ts";
import {
  parseAvslagsreferenser,
  type Utskottspunkt,
  type Yrkande,
} from "./riksdagen.ts";

export interface AvslagsKallor {
  punkter(dokId: string): Promise<Utskottspunkt[] | null>;
  motionDokId(rm: string, beteckning: string): Promise<string | null>;
  yrkanden(dokId: string): Promise<Yrkande[] | null>;
}

export interface AvslagsUnderlag {
  punkt: Utskottspunkt;
  avslaget: Avslag[];
}

/**
 * Slår upp samtliga yrkanden som punkten avslår. Ett enda saknat uppslag
 * fäller hela hämtningen; ett partiellt `avslaget`-fält får aldrig se helt ut.
 */
export async function hamtaAvslagsunderlag(
  id: string,
  punktnummer: number | null | undefined,
  dokId: string | undefined,
  kallor: AvslagsKallor,
): Promise<AvslagsUnderlag> {
  if (!dokId) throw new Error(`${id}: handlingen saknar dokument-id`);
  if (punktnummer === undefined) throw new Error(`${id}: handlingen saknar beslutspunkt`);

  const punkter = await kallor.punkter(dokId);
  const punkt = (punkter ?? []).find((p) => p.punkt === punktnummer);
  if (!punkt) throw new Error(`${id}: punkt ${punktnummer} finns inte i ${dokId}`);

  const referenser = parseAvslagsreferenser(punkt.forslag);
  if (referenser.length === 0) {
    throw new Error(`${id}: punkt ${punktnummer} i ${dokId} pekar inte ut några motioner`);
  }

  const avslaget: Avslag[] = [];
  for (const ref of referenser) {
    const motionDokId = await kallor.motionDokId(ref.rm, ref.beteckning);
    if (!motionDokId) {
      throw new Error(`${id}: hittar inte motion ${ref.rm}:${ref.beteckning} hos riksdagen`);
    }
    const yrkanden = await kallor.yrkanden(motionDokId);
    if (!yrkanden || yrkanden.length === 0) {
      throw new Error(`${id}: motion ${ref.rm}:${ref.beteckning} (${motionDokId}) saknar yrkandelista`);
    }
    // Utskottet kan avslå ett "delyrkande 2" trots att motionens öppna data
    // bara har ett sammansatt dokforslag, exempelvis yrkande 1 med två led.
    // Då finns ingen ordagrann dellydelse att hämta separat. Hela det enda
    // moder-yrkandet är den minsta officiella lydelse som går att visa. Finns
    // flera möjliga moder-yrkanden vägrar vi gissa vilket utskottet menade.
    if (ref.delyrkande && yrkanden.length !== 1) {
      throw new Error(
        `${id}: ${ref.rm}:${ref.beteckning} har ${yrkanden.length} yrkanden — ` +
          `delyrkande ${ref.yrkanden.join(", ")} kan inte knytas till ett entydigt moder-yrkande`,
      );
    }
    const valda = ref.delyrkande
      ? yrkanden
      : ref.yrkanden.length > 0
        ? yrkanden.filter((y) => ref.yrkanden.includes(y.nummer))
        : yrkanden;
    if (valda.length === 0) {
      throw new Error(`${id}: yrkande ${ref.yrkanden.join(", ")} finns inte i ${ref.rm}:${ref.beteckning}`);
    }
    for (const y of valda) {
      avslaget.push({
        motion: `${ref.rm}:${ref.beteckning}`,
        parti: ref.parti,
        ...(ref.delyrkande
          ? { yrkande: `${y.nummer} (delyrkande ${ref.yrkanden.join(", ")})` }
          : ref.yrkanden.length > 0
            ? { yrkande: y.nummer }
            : {}),
        dok_id: motionDokId,
        lydelse: y.lydelse,
      });
    }
  }

  return { punkt, avslaget };
}
