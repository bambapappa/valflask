/**
 * Talade källor — hur ett citat ur en sändning beläggs.
 *
 * Kärnprincipen «arkivlänkar måste bära citatet» är skriven för texter. En
 * arkiverad spelarsida kan aldrig innehålla talade ord som text, hur riktigt
 * citatet än är, så arkivkontrollen ställde en fråga sidan inte kan svara på:
 * mätt 2026-08-08 föll 18 av 18 poster ur ett partiledartal i SVT Play, och de
 * 18 var samma sändning.
 *
 * **Mänskligt beslut 2026-08-08:** ett talat citat beläggs med **hänvisning
 * till sändningen och tidpunkten i den**. En annan, arkiverbar källa som säger
 * samma sak är andra bästa. Kravet på ordagrann återgivning ändras inte — det
 * som ändras är var beläggningen finns.
 *
 * Kontrollen blir därför en annan fråga för de här källorna: **finns
 * tidpunkten?** Det går att pröva mekaniskt, och till skillnad från
 * ögonblicksbilden går det att uppfylla.
 */

/**
 * Värdar där källan är rörlig bild eller ljud.
 *
 * Listan är avsiktligt en lista över värdar och inte en gissning på filändelse
 * eller sidtitel: en spelarsida ser ut som vilken sida som helst för en
 * hämtare, och en felaktig gissning åt fel håll skulle släppa igenom ett
 * textcitat som aldrig prövades mot sin ögonblicksbild.
 */
const TALADE_VARDAR = [
  "svtplay.se",
  "svt.se/video",
  "youtube.com",
  "youtu.be",
  "tv4play.se",
  "play.tv4.se",
  "sverigesradio.se",
  "podcasts.apple.com",
  "open.spotify.com",
  "vimeo.com",
  "facebook.com/watch",
];

/** Är källan en sändning — rörlig bild eller ljud — snarare än en text? */
export function arTaladKalla(url: string | null | undefined): boolean {
  const u = (url ?? "").toLowerCase();
  return u !== "" && TALADE_VARDAR.some((v) => u.includes(v));
}

/**
 * Tidpunkten i sändningen, i sekunder, eller `null` när ingen anges.
 *
 * Formen varierar med värden, och alla former nedan finns i verkliga länkar:
 * SVT Play skriver `?position=377`, YouTube `?t=1180s` eller `#t=19m40s`,
 * Sveriges Radio `?startTime=95`. Sekunder, `1h2m3s` och `2:35` räknas alla om
 * till sekunder, så att två poster ur samma sändning går att jämföra.
 *
 * `0` är en giltig tidpunkt — början av sändningen — och skiljs därför från
 * `null`, som betyder att ingen tidpunkt anges alls.
 */
export function tidpunktISekunder(url: string | null | undefined): number | null {
  const u = url ?? "";
  const m = /[?&#](?:position|t|start|startTime|starttime|time_continue)=([0-9hms:]+)/i.exec(u);
  const rå = m?.[1];
  if (rå === undefined || rå === "") return null;

  // 1h2m3s / 40m / 95s
  const delar = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(rå);
  if (delar && (delar[1] ?? delar[2] ?? delar[3]) !== undefined) {
    return Number(delar[1] ?? 0) * 3600 + Number(delar[2] ?? 0) * 60 + Number(delar[3] ?? 0);
  }
  // 1:02:03 / 2:35
  if (rå.includes(":")) {
    const tal = rå.split(":").map(Number);
    if (tal.some((n) => !Number.isFinite(n))) return null;
    return tal.reduce((acc, n) => acc * 60 + n, 0);
  }
  // rena sekunder
  const n = Number(rå);
  return Number.isFinite(n) ? n : null;
}

/** Hur en tidpunkt skrivs för en läsare: 377 → "6.17". */
export function tidpunktSomText(sekunder: number): string {
  const t = Math.floor(sekunder / 3600);
  const m = Math.floor((sekunder % 3600) / 60);
  const s = sekunder % 60;
  const tvasiffrig = (n: number) => String(n).padStart(2, "0");
  return t > 0 ? `${t}.${tvasiffrig(m)}.${tvasiffrig(s)}` : `${m}.${tvasiffrig(s)}`;
}

/** Vad kontrollen av en talad källa kan svara. */
export type TaladUtfall = "talad-med-tid" | "talad-utan-tid";

/**
 * Beläggs det talade citatet så som beslutet kräver?
 *
 * Frågan är inte om ögonblicksbilden bär orden — den kan aldrig göra det — utan
 * om posten pekar ut **var i sändningen** citatet står.
 */
export function provaTaladKalla(url: string | null | undefined): TaladUtfall {
  return tidpunktISekunder(url) === null ? "talad-utan-tid" : "talad-med-tid";
}
