import {ordnaSakreferenser, type Sakreferens} from "./sakmoment.ts";
/** Kontrollerar kopplingen till fryst material, aldrig sanningshalten i ett påstående. */
export function kravHarledningsreferenser(poster: readonly {innehall: Record<string, unknown>}[], material: readonly Sakreferens[]): void {
  const refs = new Map(ordnaSakreferenser(material).map(r => [r.id, r]));
  for (const post of poster) {
    const cost = post.innehall.cost as Record<string, unknown> | undefined;
    if (!cost || !Object.hasOwn(cost, "harledning")) continue;
    const h = cost.harledning as {led?: unknown} | null;
    if (!h || !Array.isArray(h.led)) throw new Error("Ogiltig strukturerad härledning i sakunderlaget");
    for (const value of h.led) {
      if (!value || typeof value !== "object") throw new Error("Ogiltigt härledningsled");
      const led = value as Record<string, unknown>;
      const kallbarande = ["partiets-uppgift", "extern-kalla", "redan-beslutad-basniva"].includes(String(led.roll));
      if (!kallbarande && led.kalla_ref === undefined && !led.kalla) continue;
      const ref = typeof led.kalla_ref === "string" ? refs.get(led.kalla_ref) : undefined;
      if (!ref || ref.slag !== "kalla" || typeof led.kalla !== "string" || led.kalla !== ref.adress) {
        throw new Error("Härledningsledets källa saknar entydig koppling till fryst källmaterial");
      }
    }
  }
}
