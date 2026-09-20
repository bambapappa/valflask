import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import { kontrolleraPubliceringspaket, type byggPubliceringspaket, type Publiceringsandring } from "./publiceringspaket.ts";
import { ordnaSakreferenser, sakmomentensBeredskap, SAKMOMENT, type Sakreferens, type Sakbedomning, type Sakmoment } from "./sakmoment.ts";

type Paket = ReturnType<typeof byggPubliceringspaket>;
export interface Publiceringspostprovning {
  andring: Publiceringsandring;
  referenser: Sakreferens[];
  bedomare: string | null;
  bedomningar: Sakbedomning[];
}
export interface Publiceringsprovning {
  version: "publiceringsprovning/1";
  manifesthash: string;
  pakethash: string;
  poster: Publiceringspostprovning[];
}
export function publiceringsprovningshash(p: Publiceringsprovning): string {
  return createHash("sha256").update(kanoniskJson(p)).digest("hex");
}
/** Privat utkast: exakt offentlig ändringsmängd och oavgjort i varje sakmoment. */
export function forberedPubliceringsprovning(paket: Paket, manifesthash: string, material: Record<string, Sakreferens[]>): Publiceringsprovning {
  kontrolleraPubliceringspaket(paket);
  if (!/^[0-9a-f]{64}$/u.test(manifesthash)) throw new Error("Manifesthash saknas");
  const roots = paket.andringar.map(a => a.rot);
  if (new Set(roots).size !== roots.length || roots.some(r => !r.trim())) throw new Error("Dubblerad eller tom ändringsidentitet");
  if (Object.keys(material).some(rot => !roots.includes(rot))) throw new Error("Material för okänd ändring");
  return { version: "publiceringsprovning/1", manifesthash, pakethash: paket.hash,
    poster: paket.andringar.map(andring => ({ andring: structuredClone(andring), referenser: ordnaSakreferenser(material[andring.rot] ?? []), bedomare: null,
      bedomningar: (Object.keys(SAKMOMENT) as Sakmoment[]).map(moment => ({ moment, utfall: "oavgjort", motivering: "", belagg: [] })) })) };
}
/** Kräver exakt prövningshash ur det externa beslutet; intygar inte sakriktigheten. */
export function kontrolleraPubliceringsprovning(p: Publiceringsprovning, paket: Paket, manifesthash: string, beslutadHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutadHash) || publiceringsprovningshash(p) !== beslutadHash) throw new Error("Beslutet gäller inte hela publiceringsprövningen");
  if (!Array.isArray(p.poster)) throw new Error("Publiceringsprövningens poster saknas");
  const material = Object.fromEntries(p.poster.map(rad => [rad.andring.rot, rad.referenser]));
  const nytt = forberedPubliceringsprovning(paket, manifesthash, material);
  const avklatt = { ...p, poster: p.poster.map(rad => ({ ...rad, bedomare: null, bedomningar: nytt.poster.find(n => n.andring.rot === rad.andring.rot)?.bedomningar })) };
  if (kanoniskJson(avklatt) !== kanoniskJson(nytt)) throw new Error("Prövningen gäller inte hela publiceringspaketets exakta ändringsmängd eller format");
  for (const rad of p.poster) {
    const resultat = sakmomentensBeredskap(rad.bedomare, rad.bedomningar, rad.referenser);
    if (!resultat.klar) throw new Error("Publiceringsprövningen har saknade, oavgjorda eller motsagda moment");
  }
}
