/**
 * Hur många sidor vi läst hos varje parti — talet som säger vad täckningen
 * är värd.
 *
 * BAKGRUNDEN (2026-08-17). Startsidan har alltid visat antal löften per parti
 * bredvid summan, som om talen vore jämförbara. Det var de inte: 232 av 801
 * löften var KD:s och 42 SD:s, därför att KD:s politikkatalog var registrerad
 * som en genomsökt källa och ingen annans var det. Vi hade läst 270 sidor hos
 * KD och 22 hos SD. Antalet löften mätte vår skörd, inte partierna.
 *
 * Skörden är utjämnad (`pipeline/src/skordeordning.ts`), men utjämningen tar
 * tid, och under tiden ska läsaren kunna se vad talet vilar på. Handlingsvågen
 * har haft samma bekännelse sedan sitt eget ojämnhetsfel: «Vi har hunnit
 * olika långt med olika partier. Det är inget mått på partierna.»
 *
 * Talet läses ur `seen.json` — registret över varje sida pipelinen hämtat —
 * och inte ur promises.json. Skillnaden är hela poängen: promises.json vet
 * bara om sidor som gav ett löfte, och en sida vi läst utan att hitta något
 * är lika mycket läst arbete. Räknar man den vägen ser ett parti vi läst
 * mycket men hittat lite hos ut som ett parti vi knappt läst.
 */
import { partiForUrl } from "../../../pipeline/src/skordeordning.ts";
import { loadData } from "./data.ts";

export interface Partitackning {
  /** Partikod, t.ex. "kd". */
  kod: string;
  /** Antal unika sidor vi hämtat på partiets egen webbplats. */
  sidor: number;
}

export interface Tackningenstal {
  /** En post per parti som har minst en läst sida, mest läst först. */
  per_parti: Partitackning[];
  /** Sidor hos det mest lästa partiet. 0 när ingenting lästs. */
  mest: number;
  /** Sidor hos det minst lästa partiet av dem som har någon sida. */
  minst: number;
  /** Partikoden med flest lästa sidor, eller null. */
  mestKod: string | null;
  /** Partikoden med färst lästa sidor, eller null. */
  minstKod: string | null;
}

const TOMT: Tackningenstal = {
  per_parti: [],
  mest: 0,
  minst: 0,
  mestKod: null,
  minstKod: null,
};

export function tackningensTal(): Tackningenstal {
  let seen: Record<string, string>;
  try {
    seen = loadData<Record<string, string>>("seen.json");
  } catch {
    return TOMT;
  }

  const rakning = new Map<string, Set<string>>();
  for (const url of Object.values(seen)) {
    const parti = partiForUrl(url);
    if (parti === null) continue;
    // Samma sida hämtad om efter en ändring är fortfarande EN läst sida.
    const nyckel = url.replace(/\/$/u, "");
    const mangd = rakning.get(parti) ?? new Set<string>();
    mangd.add(nyckel);
    rakning.set(parti, mangd);
  }

  const per_parti = [...rakning.entries()]
    .map(([kod, sidor]) => ({ kod, sidor: sidor.size }))
    .sort((a, b) => b.sidor - a.sidor || a.kod.localeCompare(b.kod));

  if (per_parti.length === 0) return TOMT;
  const forst = per_parti[0]!;
  const sist = per_parti[per_parti.length - 1]!;
  return {
    per_parti,
    mest: forst.sidor,
    minst: sist.sidor,
    mestKod: forst.kod,
    minstKod: sist.kod,
  };
}

/** Sidor lästa hos ett visst parti. 0 om vi inte läst något där. */
export function sidorFor(tal: Tackningenstal, kod: string): number {
  return tal.per_parti.find((p) => p.kod === kod)?.sidor ?? 0;
}
