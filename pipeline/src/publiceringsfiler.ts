import { execFileSync } from "node:child_process";

export interface Filjamforelse {
  sokvagar: string[];
  patch: string;
}

/** Alla spårade filer ingår, även sådana som inte tillhör ett postregister. */
export function lasPubliceringsfiler(repo: string, fore: string, efter: string): Filjamforelse {
  if (![fore, efter].every((sha) => /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error("Filjämförelsen kräver fullständiga commit-identiteter");
  }
  const diff = (...format: string[]) => execFileSync("git", ["-C", repo, "diff",
    "--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=none", "--submodule=short", ...format, fore, efter, "--"], {
    encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  const namn = diff("--name-only", "-z");
  const sokvagar = namn ? namn.slice(0, -1).split("\0").sort() : [];
  const patch = diff("--binary", "--full-index", "--no-color", "--src-prefix=a/", "--dst-prefix=b/");
  if ((namn && !namn.endsWith("\0")) || Boolean(sokvagar.length) !== Boolean(patch.length)) {
    throw new Error("Ofullständig filjämförelse");
  }
  return { sokvagar, patch };
}
