/** API-svar läses från den aktuella körningen; inga beslut skapas här. */
export function kontrolleraPubliceringsbeslut(miljo: any, historik: unknown, manifestHash: string): string {
  if (!/^[a-f0-9]{64}$/.test(manifestHash) || !Number.isSafeInteger(miljo?.id) ||
      miljo.id < 1 || miljo.name !== "github-pages" || miljo.can_admins_bypass !== false ||
      !Array.isArray(miljo.protection_rules) || !Array.isArray(historik)) {
    throw new Error("Miljöskydd eller granskningshistorik saknas");
  }
  const regel = miljo.protection_rules.find((r: any) => r.type === "required_reviewers");
  if (!Array.isArray(regel?.reviewers) || !regel.reviewers.length) {
    throw new Error("Publiceringen måste kräva en granskare");
  }
  const tillatna = new Set(regel.reviewers.filter((r: any) => r.type === "User" &&
    r.reviewer?.type === "User" && Number.isSafeInteger(r.reviewer.id)).map((r: any) => r.reviewer.id));
  const kommentar = `Godkänn publiceringspaket ${manifestHash}`;
  const beslut = historik.filter((r: any) => r?.comment === kommentar &&
    Array.isArray(r.environments) && r.environments.some((e: any) => e.id === miljo.id));
  // Utan händelsetid går motstridiga eller flera händelser inte att ordna säkert.
  if (beslut.length !== 1) throw new Error("Ett entydigt godkännande av exakt publiceringspaket saknas");
  const rad = beslut[0] as any;
  if (rad.state !== "approved" || rad.user?.type !== "User" ||
      !tillatna.has(rad.user.id) || typeof rad.user.login !== "string" || !rad.user.login) {
    throw new Error("Publiceringspaketet saknar godkännande från utsedd granskare");
  }
  return rad.user.login;
}
