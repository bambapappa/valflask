import { computeDataHash, type ChangelogEntry } from "./publish.ts";
import { skapaFilpaket, skrivFilpaket, type Fillage } from "./datatransaktion.ts";

/** Skriver nya belägg på löften och deras offentliga datafingeravtryck tillsammans. */
export function skrivUnderlagskomplettering(
  dataDir: string,
  fore: Fillage,
  loften: readonly unknown[],
  andradeId: readonly string[],
  slag: "film-arkiv" | "avskrift-kontroll",
  nu: Date,
): void {
  if (Object.keys(fore).sort().join() !== "changelog.json,promises.json" ||
      typeof fore["promises.json"] !== "string" || typeof fore["changelog.json"] !== "string") {
    throw new Error("Underlagskomplettering kräver löften och ändringslogg i föreläget");
  }
  if (!Number.isFinite(nu.getTime()) || andradeId.length === 0 ||
      new Set(andradeId).size !== andradeId.length) throw new Error("Ogiltig underlagskomplettering");
  const changelog: unknown = JSON.parse(fore["changelog.json"]);
  if (!Array.isArray(changelog)) throw new Error("Ändringsloggen kräver en lista");
  const post: ChangelogEntry = {
    run_id: `${slag}-${nu.toISOString()}`,
    added: [], updated: [...andradeId].sort(), retracted: [],
    data_hash: computeDataHash(loften), timestamp: nu.toISOString(),
  };
  const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
  skrivFilpaket(dataDir, skapaFilpaket(fore, {
    "promises.json": json(loften),
    "changelog.json": json([...changelog, post]),
  }));
}
