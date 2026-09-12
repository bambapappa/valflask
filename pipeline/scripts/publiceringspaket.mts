/** node --import tsx/esm scripts/publiceringspaket.mts <repo> <före-revision> <efter-revision> */
import { execFileSync } from "node:child_process";
import { byggUnderlagsregister } from "../src/underlagsregister.ts";
import { byggPubliceringspaket } from "../src/publiceringspaket.ts";
import { lasPubliceringssummor } from "../src/publiceringssummor.ts";
import { lasPubliceringsfiler } from "../src/publiceringsfiler.ts";
import { publiceringsvy } from "../src/publiceringsvy.ts";

try {
  const args = process.argv.slice(2);
  const somHtml = args.at(-1) === "--html";
  if (somHtml) args.pop();
  const [repo, fore, efter, ...extra] = args;
  if (!repo || !fore || !efter || extra.length) throw new Error("Ange <repo> <före-revision> <efter-revision>");
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  });
  const revision = (ref: string) => git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`).trim();
  const foreRevision = revision(fore), efterRevision = revision(efter);
  const las = (sha: string) => {
    const rader = (file: string): Record<string, unknown>[] => {
      const value: unknown = JSON.parse(git("show", `${sha}:${file}`));
      if (!Array.isArray(value)) throw new Error(`Förväntade en lista i ${file}`);
      return value;
    };
    return byggUnderlagsregister({ loften: rader("data/promises.json"),
      standpunkter: rader("data/stances.json"), kopplingar: rader("handlingsvagen/data/kopplingar.json"),
      handlingar: rader("handlingsvagen/data/handlingar.json") });
  };
  const paket = byggPubliceringspaket(foreRevision, efterRevision, las(foreRevision), las(efterRevision),
    lasPubliceringsfiler(repo, foreRevision, efterRevision),
    { fore: lasPubliceringssummor(repo, foreRevision), efter: lasPubliceringssummor(repo, efterRevision) });
  process.stdout.write(somHtml ? publiceringsvy(paket) : JSON.stringify(paket, null, 2) + "\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
