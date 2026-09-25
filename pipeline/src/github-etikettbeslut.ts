export interface GitHubEtiketthandelse {
  id?: number;
  event?: string;
  actor?: { login?: string } | null;
  label?: { name?: string } | null;
}

export interface VerifieratEtikettbeslut {
  actor: string;
  handelse: string;
}

export function verifieraEtikettbeslut(
  handelser: GitHubEtiketthandelse[],
  etikett: string,
  repoOwner: string,
  repo: string,
  issueNumber: number,
): VerifieratEtikettbeslut | null {
  const senaste = handelser
    .filter((h) => h.event === "labeled" && h.label?.name === etikett)
    .at(-1);
  const actor = senaste?.actor?.login?.trim();
  if (!actor || !Number.isSafeInteger(senaste?.id) || actor.toLowerCase() !== repoOwner.trim().toLowerCase()) {
    return null;
  }
  return {
    actor,
    handelse: `https://github.com/${repo}/issues/${issueNumber}#event-${senaste!.id}`,
  };
}
