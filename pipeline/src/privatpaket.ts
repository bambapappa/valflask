import { createHash } from "node:crypto";

export interface PrivatArtefakt {
  id: number; name: string; expired: boolean; size_in_bytes: number; digest: string;
  workflow_run: { id: number; head_branch: string; head_sha: string; repository_id: number; head_repository_id: number };
}
export interface PrivatKorning {
  id: number; path: string; event: string; status: string; conclusion: string;
  head_branch: string; head_sha: string; repository: { id: number }; head_repository: { id: number };
}

export function privatPaketnamn(issue: number, hash: string, typ: "godkannandepaket" | "avvisningspaket" = "godkannandepaket"): string {
  if (!Number.isSafeInteger(issue) || issue < 1 || !/^[0-9a-f]{64}$/u.test(hash)) throw new Error("Ogiltig paketidentitet");
  return `${typ}-${issue}-${hash}`;
}

export function valjPrivatArtefakt(artefakter: PrivatArtefakt[], issue: number, hash: string, typ: "godkannandepaket" | "avvisningspaket" = "godkannandepaket"): PrivatArtefakt {
  const namn = privatPaketnamn(issue, hash, typ);
  return valjMedNamn(artefakter, namn);
}

function valjMedNamn(artefakter: PrivatArtefakt[], namn: string): PrivatArtefakt {
  const val = artefakter.filter(a => a.name === namn && a.expired === false);
  if (val.length !== 1) throw new Error("Exakt en giltig privat paketartefakt krävs");
  const a = val[0]!;
  if (!Number.isSafeInteger(a.id) || a.id < 1 || !Number.isSafeInteger(a.workflow_run?.id) || a.workflow_run.id < 1 ||
      !Number.isSafeInteger(a.size_in_bytes) || a.size_in_bytes < 1 || a.size_in_bytes > 32 * 1024 * 1024 ||
      !/^sha256:[0-9a-f]{64}$/u.test(a.digest)) throw new Error("Ogiltig privat artefaktmetadata");
  return a;
}

export function kontrolleraPrivatKorning(a: PrivatArtefakt, run: PrivatKorning, typ: "godkannandepaket" | "avvisningspaket" | "publiceringsprovning" = "godkannandepaket"): void {
  const w = a.workflow_run;
  if (run.id !== w.id || run.path !== `.github/workflows/${typ}.yml` ||
      run.event !== "workflow_dispatch" || run.status !== "completed" || run.conclusion !== "success" ||
      run.head_branch !== "main" || w.head_branch !== "main" || !/^[0-9a-f]{40}$/u.test(run.head_sha) || run.head_sha !== w.head_sha ||
      !Number.isSafeInteger(run.repository?.id) || run.repository.id < 1 ||
      run.repository.id !== run.head_repository?.id || run.repository.id !== w.repository_id || run.repository.id !== w.head_repository_id) {
    throw new Error("Privat paket måste komma från producentens lyckade huvudgrenskörning i samma repo");
  }
}

export function kontrolleraPrivatZip(a: PrivatArtefakt, bytes: Buffer): void {
  if (bytes.length !== a.size_in_bytes || `sha256:${createHash("sha256").update(bytes).digest("hex")}` !== a.digest) {
    throw new Error("Hämtad privat artefakt stämmer inte med GitHubs kontrollsumma");
  }
}

export function privatPubliceringsnamn(manifesthash: string): string {
  if (!/^[0-9a-f]{64}$/u.test(manifesthash)) throw new Error("Ogiltig manifestidentitet");
  return `publiceringsprovning-${manifesthash}`;
}
export function valjPrivatPubliceringsprovning(artefakter: PrivatArtefakt[], manifesthash: string): PrivatArtefakt {
  return valjMedNamn(artefakter, privatPubliceringsnamn(manifesthash));
}
