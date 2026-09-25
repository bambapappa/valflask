/** Förbered privat sakunderlag eller kontrollera en redan genomförd prövning. */
import { createHash } from "node:crypto";
import { kanoniskJson } from "../src/underlagsversion.ts";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve, relative, isAbsolute } from "node:path";
import { forberedPubliceringsprovning, kontrolleraPubliceringsprovning, publiceringsprovningshash } from "../src/publiceringsprovning.ts";
const [kommando, paketfil, manifestfil, indatafil, utfil, ...extra] = process.argv.slice(2);
try {
  if (!paketfil || !manifestfil || !indatafil || extra.length) throw new Error("Ange kommando, paket, manifest och privat indata");
  const las = (fil: string) => JSON.parse(readFileSync(fil, "utf8"));
  const paket = las(paketfil), manifest = las(manifestfil);
  const { hash: manifestHash, ...payload } = manifest;
  if (createHash("sha256").update(kanoniskJson(payload)).digest("hex") !== manifestHash) throw new Error("Manifestet har ändrats");
  if (manifest.pakethash !== paket.hash || manifest.revision !== paket.efterRevision) throw new Error("Manifestet gäller ett annat paket");
  if (kommando === "forbered" && utfil) {
    const rot = realpathSync(resolve(import.meta.dirname, "../.."));
    const mal = resolve(realpathSync(dirname(resolve(utfil))), basename(utfil));
    const rel = relative(rot, mal);
    if (!rel || (!rel.startsWith("../") && !isAbsolute(rel))) throw new Error("Privat utdata får inte ligga i kodrepot");
    const material = las(indatafil);
    if (!material || Array.isArray(material) || typeof material !== "object" ||
        Object.keys(material).some(k => !["poster", "helhet"].includes(k)) ||
        !material.poster || !Array.isArray(material.helhet)) throw new Error("Ange både poster och helhet");
    const p = forberedPubliceringsprovning(paket, manifest.hash, material.poster, material.helhet);
    writeFileSync(mal, JSON.stringify(p, null, 2)+"\n", { flag: "wx", mode: 0o600 });
    console.log("Privat utkast sparat. Alla sakmoment är oavgjorda; inget beslut skapat.");
  } else if (kommando === "kontroll" && !utfil) {
    const p = las(indatafil), hash = publiceringsprovningshash(p);
    kontrolleraPubliceringsprovning(p, paket, manifest.hash, hash);
    console.log(`Prövningshash: ${hash}. Formatkontrollen är ingen mänsklig attest.`);
  } else throw new Error("Använd forbered <paket> <manifest> <material> <privat utfil> eller kontroll <paket> <manifest> <privat prövning>");
} catch {
  console.error("Publiceringsprövningen kunde inte förberedas eller verifieras. Kontrollera privata indata och paketidentitet.");
  process.exitCode = 1;
}
