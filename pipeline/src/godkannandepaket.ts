import { createHash } from "node:crypto";
import { forberedGodkannandelista, type Listgodkannande } from "./godkannandelista.ts";
import { kanoniskJson } from "./underlagsversion.ts";
import { lasFillage, skrivFilpaket, type Filpaket } from "./datatransaktion.ts";

export const GODKANNANDE_MIN_TECKEN = 25;

export interface Godkannandebeslut {
  bedomare: string;
  utfall: "godkann";
  motivering: string;
  forslagshash: string;
  kalla: {
    system: "github";
    association: "OWNER";
    actor: string;
    handelse: string;
  };
}

export interface Godkannandepaket {
  version: "godkannandepaket/1";
  tidpunkt: string;
  rader: Listgodkannande[];
  beslut: Godkannandebeslut | null;
  filer: Filpaket;
}

function hash(varde: unknown): string {
  return createHash("sha256").update(kanoniskJson(varde)).digest("hex");
}

function forslag(paket: Godkannandepaket): Omit<Godkannandepaket, "beslut"> {
  return {
    version: paket.version,
    tidpunkt: paket.tidpunkt,
    rader: paket.rader,
    filer: paket.filer,
  };
}

export function godkannandeforslagshash(paket: Godkannandepaket): string {
  return hash(forslag(paket));
}

export function godkannandepakethash(paket: Godkannandepaket): string {
  return hash(paket);
}

export function forberedGodkannandepaket(
  rader: readonly Listgodkannande[],
  dataDir: string,
  nu: Date,
): Godkannandepaket {
  if (!Number.isFinite(nu.getTime())) throw new Error("Godkännandepaketet kräver en giltig tidpunkt");
  return {
    version: "godkannandepaket/1",
    tidpunkt: nu.toISOString(),
    rader: structuredClone([...rader]),
    beslut: null,
    filer: forberedGodkannandelista(rader, dataDir),
  };
}

export function kontrolleraGodkannandepaket(paket: Godkannandepaket, dataDir: string): void {
  const aktuellt = lasFillage(dataDir, Object.keys(paket.filer?.fore ?? {}));
  if (kanoniskJson(paket.filer.fore) !== kanoniskJson(aktuellt)) {
    throw new Error("Godkännandepaketets föreläge har ändrats");
  }
  const nytt = forberedGodkannandepaket(paket.rader, dataDir, new Date(paket.tidpunkt));
  if (kanoniskJson({ ...paket, beslut: null }) !== kanoniskJson(nytt)) {
    throw new Error("Godkännandepaketets förslag, sakprövning eller slutform har ändrats");
  }
  const beslut = paket.beslut;
  if (
    !beslut ||
    Object.keys(beslut).sort().join(",") !== "bedomare,forslagshash,kalla,motivering,utfall" ||
    beslut.utfall !== "godkann" ||
    !beslut.bedomare?.trim() ||
    beslut.motivering?.trim().length < GODKANNANDE_MIN_TECKEN ||
    beslut.forslagshash !== godkannandeforslagshash(paket) ||
    Object.keys(beslut.kalla ?? {}).sort().join(",") !== "actor,association,handelse,system" ||
    beslut.kalla.system !== "github" ||
    beslut.kalla.association !== "OWNER" ||
    beslut.kalla.actor !== beslut.bedomare ||
    !/^https:\/\/github\.com\//u.test(beslut.kalla.handelse)
  ) {
    throw new Error("Ett separat mänskligt godkännande av exakt paket saknas eller gäller ett annat förslag");
  }
}

export function verkstallGodkannandepaket(dataDir: string, paket: Godkannandepaket, beslutadHash: string): void {
  if (!/^[0-9a-f]{64}$/u.test(beslutadHash) || godkannandepakethash(paket) !== beslutadHash) {
    throw new Error("Det mänskliga beslutet gäller inte hela godkännandepaketet");
  }
  kontrolleraGodkannandepaket(paket, dataDir);
  skrivFilpaket(dataDir, paket.filer);
}
