/** bind <fil> <identitet.json> eller kontrollera <fil> <manifest.json> <aktuell-identitet.json> */
import { readFileSync } from "node:fs";
import { bindPubliceringsartefakt, kontrolleraPubliceringsartefakt } from "../src/publiceringsartefakt.ts";

try {
  const [kommando, fil, underlag, aktuell, ...extra] = process.argv.slice(2);
  if (!fil || !underlag || extra.length) throw new Error("Ange fil och identitetsunderlag");
  const las = (sokvag: string) => JSON.parse(readFileSync(sokvag, "utf8"));
  if (kommando === "bind" && !aktuell) {
    process.stdout.write(JSON.stringify(await bindPubliceringsartefakt(fil, las(underlag)), null, 2) + "\n");
  } else if (kommando === "kontrollera" && aktuell) {
    await kontrolleraPubliceringsartefakt(fil, las(underlag), las(aktuell));
    console.log("Artefaktens byte och publiceringsidentitet stämmer. Mänskligt godkännande måste kontrolleras separat.");
  } else throw new Error("Ange bind eller kontrollera med rätt underlag");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
