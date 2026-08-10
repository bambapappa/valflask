/**
 * Vaktar att varje aktivt belägg pekar på ett löfte som fortfarande finns.
 *
 * Ett löfte kan försvinna under fötterna på sina belägg. Det dras tillbaka som
 * dubblett, eller avvisas ur beståndet helt — och kopplingarna som bokförts på
 * det står kvar aktiva, för ingenting går tillbaka och tittar på dem. De blir
 * osynliga snarare än fel: läskopian som sajten bygger på tar bara med
 * publicerade löften, så raden faller tyst ur rutnätet. Det som ligger kvar är
 * utslagen. Domsmotorn räknar på alla mål med minst en aktiv koppling och
 * struntar i löftets status, så partidomar och ledamotsmeriter fortsätter
 * skrivas för ett löfte ingen läsare kan nå.
 *
 * Det märktes första gången den 9 augusti 2026: `p-2026-0131` hade dragits
 * tillbaka som dubblett fyra dagar tidigare, och fyra kopplingar stod kvar mot
 * det. Utslagen bar åtta partidomar och femton ledamotsmeriter på ett löfte som
 * inte fanns. Kön städas redan — `stadaAvgjorda` i `granskning.ts` kastar
 * förslag mot tillbakadragna löften — men den städningen tar bara det som ännu
 * inte godkänts. Godkända kopplingar hade ingen som såg efter.
 *
 * **Larmet säger inte vad som ska göras.** Ett belägg mot ett tillbakadraget
 * löfte har två utgångar, och valet mellan dem är en människas: bär löftet som
 * står kvar samma politik flyttas kopplingen dit (`ompekning.ts`), annars dras
 * den in (`indragning.ts`). Att låta grinden välja åt oss vore att låta koden
 * avgöra om ett parti ska mista ett belägg.
 */
import type { KopplingPost } from "./granskning.ts";

/** Det grinden behöver veta om ett löfte. Samma form som ompekningens. */
export interface MalUppgift {
  id: string;
  status?: string;
}

/** Ett belägg vars mål inte längre går att nå, och varför. */
export interface HemlostBelagg {
  /** Kopplingens id. */
  id: string;
  /** Målet den pekar på. */
  mal: string;
  /** `tillbakadraget` — löftet finns men är indraget. `saknas` — det finns inte alls. */
  slag: "tillbakadraget" | "saknas";
}

/**
 * Aktiva kopplingar vars löfte är tillbakadraget eller borta.
 *
 * Ståndpunktskopplingar (`stance_id`) prövas inte här: Frågevågens ståndpunkter
 * lever i en annan fil med en annan livscykel, och att tiga om dem är ärligare
 * än att pröva dem mot fel register. Indragna kopplingar prövas inte heller —
 * de är redan avgjorda, och deras mål får gärna vara borta.
 */
export function hemlosaBelagg(
  kopplingar: readonly KopplingPost[],
  loften: readonly MalUppgift[],
): HemlostBelagg[] {
  const status = new Map(loften.map((p) => [p.id, p.status ?? "aktiv"]));
  const ut: HemlostBelagg[] = [];
  for (const k of kopplingar) {
    if (k.status !== "aktiv") continue;
    if (k.promise_id === undefined) continue;
    const s = status.get(k.promise_id);
    if (s === undefined) ut.push({ id: k.id, mal: k.promise_id, slag: "saknas" });
    else if (s !== "aktiv") ut.push({ id: k.id, mal: k.promise_id, slag: "tillbakadraget" });
  }
  return ut.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Larmet i klartext, grupperat på mål.
 *
 * Grupperingen är hela poängen med formen: fyra kopplingar mot samma indragna
 * löfte är ett beslut att fatta, inte fyra. Läser man dem som fyra rader
 * avgör man dem var för sig och missar att de hör ihop.
 */
export function larmtext(fynd: readonly HemlostBelagg[]): string {
  if (fynd.length === 0) return "Inga aktiva belägg mot tillbakadragna eller försvunna löften.";
  const perMal = new Map<string, HemlostBelagg[]>();
  for (const f of fynd) perMal.set(f.mal, [...(perMal.get(f.mal) ?? []), f]);
  const rader = [...perMal.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mal, poster]) => {
      const slag = poster[0]?.slag === "saknas" ? "finns inte i promises.json" : "är tillbakadraget";
      return (
        `  ${mal} ${slag} men bär ${poster.length} aktiv${poster.length === 1 ? "t" : "a"} ` +
        `belägg: ${poster.map((p) => p.id).join(", ")}`
      );
    });
  return (
    `${fynd.length} aktiv${fynd.length === 1 ? "t" : "a"} belägg pekar på löften som inte går att nå:\n` +
    `${rader.join("\n")}\n\n` +
    "Varje sådant belägg ska antingen flyttas till det löfte som står kvar\n" +
    "(npm run peka-om) eller dras in (npm run dra-in). Vilket av dem det blir\n" +
    "är en människas beslut och inte kodens: flyttas det fel mister ett parti\n" +
    "ett belägg det har rätt till, och dras det inte in räknas ett utslag på\n" +
    "ett löfte ingen läsare kan nå."
  );
}
