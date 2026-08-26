import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../src/scripts/webmcp.ts"), "utf8");
let errors = 0;
function check(label: string, ok: boolean): void { console.log(`${ok ? "OK" : "FEL"} ${label}`); if (!ok) errors++; }

check("registrerar ett begränsat sökverktyg", source.includes('name: "search_verified_evidence"') && source.includes("max_results"));
check("visar samma citat för människan", source.includes("showEvidenceBoard(result") && source.includes("item.quote"));
check("bär källa och arkivlänk", source.includes("item.source.archive_url") && source.includes("Källa:"));
check("utesluter röstrekommendation", source.includes("inte en röstrekommendation"));
check("använder bara publika API-ytor", !source.includes("OPENAI_API_KEY") && source.includes('"/api/v1/promises.json"'));
if (errors) process.exit(1);
