/**
 * Skapar ett läsbart versionsbundet underlag, eller jämför ett sparat paket.
 * Skriver endast till standardutmatningen. Paketet intygar inget godkännande.
 *
 * node --import tsx/esm scripts/bundet-underlag.mts skapa <repo> lofte:<id>
 * node --import tsx/esm scripts/bundet-underlag.mts kontrollera <repo> <paket.json>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { byggUnderlagsregister } from "../src/underlagsregister.ts";
import { bindUnderlag, sammaUnderlag, type BundetUnderlag } from "../src/underlagsversion.ts";

try {
  const [command, repo, target, ...extra] = process.argv.slice(2);
  if (!repo || !target || extra.length || !["skapa", "kontrollera"].includes(command ?? "")) {
    throw new Error("Ange skapa <repo> <slag:id> eller kontrollera <repo> <paket.json>");
  }
  const read = (file: string): Record<string, unknown>[] => {
    const rows: unknown = JSON.parse(readFileSync(resolve(repo, file), "utf8"));
    if (!Array.isArray(rows)) throw new Error(`Förväntade en lista i ${file}`);
    return rows;
  };
  const register = byggUnderlagsregister({
    loften: read("data/promises.json"),
    kopplingar: read("handlingsvagen/data/kopplingar.json"),
    handlingar: read("handlingsvagen/data/handlingar.json"),
    standpunkter: read("data/stances.json"),
  });
  if (command === "skapa") {
    process.stdout.write(JSON.stringify(bindUnderlag(target, register), null, 2) + "\n");
  } else {
    const saved = JSON.parse(readFileSync(resolve(target), "utf8")) as BundetUnderlag;
    const current = bindUnderlag(saved.rot, register);
    if (!sammaUnderlag(saved, current)) throw new Error("Underlaget har ändrats eller paketet är ogiltigt; ny prövning krävs");
    process.stdout.write(`Oförändrat underlag: ${current.rot} ${current.hash}\n`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
