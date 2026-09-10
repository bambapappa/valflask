import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { kanoniskJson } from "./underlagsversion.ts";

export interface Artefaktidentitet {
  repo: string;
  revision: string;
  korning: string;
  forsok: number;
  artefaktId: string;
  pakethash: string;
}
export interface Publiceringsartefakt extends Artefaktidentitet {
  version: "publiceringsartefakt/1";
  filhash: string;
  byte: number;
  hash: string;
}
const sha = /^[a-f0-9]{64}$/;
function identitet(id: Artefaktidentitet) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(id.repo) || !/^[a-f0-9]{40}$/.test(id.revision) ||
      !/^[1-9][0-9]*$/.test(id.korning) || !/^[1-9][0-9]*$/.test(id.artefaktId) ||
      !Number.isSafeInteger(id.forsok) || id.forsok < 1 || !sha.test(id.pakethash)) {
    throw new Error("Ofullständig publiceringsidentitet");
  }
}

/** Binder filens faktiska byte. Identiteter ska hämtas från körningen och artefakt-API:t. */
export async function bindPubliceringsartefakt(fil: string, id: Artefaktidentitet): Promise<Publiceringsartefakt> {
  identitet(id);
  const stat = await lstat(fil);
  if (!stat.isFile() || stat.size === 0) throw new Error("Artefakten måste vara en icke-tom vanlig fil");
  const digest = createHash("sha256");
  let byte = 0;
  for await (const chunk of createReadStream(fil)) { digest.update(chunk); byte += chunk.length; }
  if (byte !== stat.size) throw new Error("Artefakten ändrades under läsningen");
  const innehall = { version: "publiceringsartefakt/1" as const,
    repo: id.repo, revision: id.revision, korning: id.korning, forsok: id.forsok,
    artefaktId: id.artefaktId, pakethash: id.pakethash, filhash: digest.digest("hex"), byte };
  return { ...innehall, hash: createHash("sha256").update(kanoniskJson(innehall)).digest("hex") };
}

/** Kontroll av bindningen är inte bevis för mänskligt godkännande. */
export async function kontrolleraPubliceringsartefakt(fil: string, manifest: Publiceringsartefakt,
  aktuell: Artefaktidentitet): Promise<void> {
  const beraknad = await bindPubliceringsartefakt(fil, aktuell);
  if (kanoniskJson(manifest) !== kanoniskJson(beraknad)) {
    throw new Error("Artefakt, underlag eller körningsförsök skiljer sig från publiceringspaketet");
  }
}
