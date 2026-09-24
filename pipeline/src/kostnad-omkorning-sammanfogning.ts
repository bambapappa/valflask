import { reviewId } from "./review.ts";
import { kanoniskJson } from "./underlagsversion.ts";

type KoPost = { articleUrl: string; candidate: { title?: string }; cost?: unknown; costReason?: unknown; [key: string]: unknown };

function indexera(indata: unknown, namn: string): { lista: KoPost[]; index: Map<string, KoPost> } {
  if (!Array.isArray(indata)) throw new Error(`${namn} måste vara en kölista`);
  const index = new Map<string, KoPost>();
  for (const rad of indata) {
    if (!rad || typeof rad !== "object" || Array.isArray(rad) || typeof rad.articleUrl !== "string" ||
        !rad.candidate || typeof rad.candidate !== "object" || Array.isArray(rad.candidate) ||
        ("title" in rad.candidate && typeof rad.candidate.title !== "string")) {
      throw new Error(`${namn} har en ogiltig köpost`);
    }
    const post = rad as KoPost;
    const id = reviewId(post);
    if (index.has(id)) throw new Error(`${namn} har dubbelt kö-id ${id}`);
    index.set(id, post);
  }
  return { lista: indata as KoPost[], index };
}

/** Flytta bara lyckade omkörningar från arbetsträdet till färsk main. */
export function sammanfogaKostnadOmkorning(bas: unknown, resultat: unknown, aktuell: unknown): KoPost[] {
  const b = indexera(bas, "Basen"), r = indexera(resultat, "Resultatet"), a = indexera(aktuell, "Aktuell kö");
  if (b.lista.length !== r.lista.length || [...b.index.keys()].some((id) => !r.index.has(id))) {
    throw new Error("Omkörningen har lagt till eller tagit bort köposter");
  }
  const andrade = new Map<string, KoPost>();
  for (const [id, efter] of r.index) {
    const fore = b.index.get(id)!;
    if (kanoniskJson(fore) === kanoniskJson(efter)) continue;
    const utanKostnad = (p: KoPost) => {
      const { cost: _cost, costReason: _reason, ...ovrigt } = p;
      return kanoniskJson(ovrigt);
    };
    if (utanKostnad(fore) !== utanKostnad(efter)) throw new Error(`Omkörningen ändrade annat än kostnad för ${id}`);
    const nu = a.index.get(id);
    if (!nu || kanoniskJson(nu) !== kanoniskJson(fore)) throw new Error(`Köpost ${id} har ändrats på main; manuell omprövning krävs`);
    andrade.set(id, efter);
  }
  return a.lista.map((p) => andrade.get(reviewId(p)) ?? p);
}
