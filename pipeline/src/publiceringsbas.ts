import { execFileSync } from "node:child_process";

export interface Publiceringsbas {
  revision: string;
  deploymentId: string;
  publiceradVid: string;
}

const tillstand = new Set(["ABANDONED", "ACTIVE", "DESTROYED", "ERROR", "FAILURE", "INACTIVE", "IN_PROGRESS", "PENDING", "QUEUED", "SUCCESS", "WAITING"]);
const statusar = new Set(["ERROR", "FAILURE", "INACTIVE", "IN_PROGRESS", "PENDING", "QUEUED", "SUCCESS", "WAITING"]);

/** Skapandeordningen säger inte när en version publicerades; även en återställning kan slutföras senare. */
export function valjPubliceringsbas(sidor: unknown): Publiceringsbas {
  if (!Array.isArray(sidor) || !sidor.length) throw new Error("Drifthistorik saknas");
  const ids = new Set<number>(), cursors = new Set<string>();
  const kandidater: Publiceringsbas[] = [];
  let antal: number | undefined;
  for (const [i, sida] of sidor.entries()) {
    if (sida?.errors?.length) throw new Error("Drifthistoriken innehåller API-fel");
    const d = sida?.data?.repository?.deployments;
    if (!d || !Number.isSafeInteger(d.totalCount) || d.totalCount < 0 || !Array.isArray(d.nodes) ||
        d.pageInfo?.hasNextPage !== (i < sidor.length - 1)) throw new Error("Ofullständig drifthistorik");
    if (antal !== undefined && antal !== d.totalCount) throw new Error("Drifthistoriken ändrades under läsningen");
    antal = d.totalCount;
    const cursor = d.pageInfo.endCursor;
    if (d.nodes.length && (typeof cursor !== "string" || !cursor || cursors.has(cursor))) throw new Error("Ogiltig sidindelning i drifthistoriken");
    if (cursor) cursors.add(cursor);
    for (const n of d.nodes) {
      if (!n || !Number.isSafeInteger(n.databaseId) || n.databaseId <= 0 || ids.has(n.databaseId) ||
          !/^[a-f0-9]{40}$/.test(n.commitOid) || n.environment !== "github-pages" || !tillstand.has(n.state)) {
        throw new Error("Ogiltig driftsättning i historiken");
      }
      ids.add(n.databaseId);
      if (n.latestStatus !== null && (!n.latestStatus || !statusar.has(n.latestStatus.state))) throw new Error("Okänd driftstatus");
      const lyckad = n.latestStatus?.state === "SUCCESS";
      if (lyckad !== (n.state === "ACTIVE" || n.state === "SUCCESS")) throw new Error("Motstridiga driftstatusar");
      if (!lyckad) continue;
      const tid = n.latestStatus.createdAt;
      if (typeof tid !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(tid) || !Number.isFinite(Date.parse(tid))) throw new Error("Publiceringstid saknas");
      kandidater.push({ revision: n.commitOid, deploymentId: String(n.databaseId), publiceradVid: tid });
    }
  }
  if (ids.size !== antal) throw new Error("Drifthistoriken är ofullständig eller ändrades under läsningen");
  kandidater.sort((a, b) => Date.parse(b.publiceradVid) - Date.parse(a.publiceradVid) || Number(b.deploymentId) - Number(a.deploymentId));
  const bas = kandidater[0];
  if (!bas) throw new Error("Föregående publicerade revision kunde inte fastställas");
  if (kandidater.some((k) => Date.parse(k.publiceradVid) === Date.parse(bas.publiceradVid) && k.revision !== bas.revision)) {
    throw new Error("Flera revisioner har samma senaste publiceringstid");
  }
  return bas;
}

export function lasPubliceringsbas(repo: string): Publiceringsbas {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Ogiltigt repo för drifthistoriken");
  const [owner, name] = repo.split("/");
  const query = `query($owner:String!,$name:String!,$endCursor:String) {
    repository(owner:$owner,name:$name) {
      deployments(first:100,after:$endCursor,environments:["github-pages"],orderBy:{field:CREATED_AT,direction:DESC}) {
        totalCount pageInfo { hasNextPage endCursor }
        nodes { databaseId commitOid state environment latestStatus { state createdAt } }
      }
    }
  }`;
  let sidor: unknown;
  try {
    sidor = JSON.parse(execFileSync("gh", ["api", "graphql", "--paginate", "--slurp", "-f", `query=${query}`,
      "-f", `owner=${owner}`, "-f", `name=${name}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] }));
  } catch { throw new Error("Drifthistoriken kunde inte läsas"); }
  return valjPubliceringsbas(sidor);
}
