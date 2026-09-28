import { normalizeForVerbatim } from "./gates.ts";

export type Kalltext = { text: string } | { utfall: "borttagen" | "obestamd" };
export type Citatutfall = "ok" | "andrad" | "borttagen" | "obestamd";

/** Hämta en delad sida en gång, men pröva varje beskeds eget citat. */
export class CitatkontrollPerKalla {
  private readonly sidor = new Map<string, Promise<Kalltext>>();

  constructor(private readonly hamta: (url: string) => Promise<Kalltext>) {}

  har(url: string): boolean { return this.sidor.has(url); }
  antalKallor(): number { return this.sidor.size; }

  async kontrollera(url: string, citat: string): Promise<Citatutfall> {
    let sida = this.sidor.get(url);
    if (!sida) {
      sida = this.hamta(url);
      this.sidor.set(url, sida);
    }
    const svar = await sida;
    if ("utfall" in svar) return svar.utfall;
    const ord = normalizeForVerbatim(citat);
    if (!ord) return "obestamd";
    return normalizeForVerbatim(svar.text).includes(ord) ? "ok" : "andrad";
  }
}
