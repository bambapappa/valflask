import { createHash } from "node:crypto";
import { kanoniskJson } from "./underlagsversion.ts";
import type { byggPubliceringspaket } from "./publiceringspaket.ts";

type Paket = ReturnType<typeof byggPubliceringspaket>;
const html = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Visar hela det lagrade ändringsunderlaget utan att intyga sakprövning eller beslut. */
export function publiceringsvy(paket: Paket): string {
  const { hash, ...innehall } = paket;
  if (paket.version !== "publiceringspaket/1" || !Array.isArray(paket.andringar) ||
      !paket.antalFore || !paket.antalEfter ||
      createHash("sha256").update(kanoniskJson(innehall)).digest("hex") !== hash) {
    throw new Error("Publiceringspaketets innehåll eller hash är ogiltigt");
  }
  const visa = (value: unknown) => html(JSON.stringify(value, null, 2));
  const etiketter: Record<string, string> = { title: "Rubrik", cost: "Kostnad och uträkning",
    source: "Källa", party: "Parti", parties: "Partier", status: "Status", promise_type: "Löftestyp",
    group_id: "Grupp", history: "Historik", evidence: "Belägg", direction: "Riktning" };
  const falt = (andring: Paket["andringar"][number]) => {
    const index = (p: typeof andring.fore) => new Map((p?.poster ?? []).map((x) => [`${x.slag}:${x.id}`, x.innehall]));
    const fore = index(andring.fore), efter = index(andring.efter);
    return [...new Set([...fore.keys(), ...efter.keys()])].sort().map((id) => {
      if (id !== andring.rot && (!fore.has(id) || !efter.has(id))) {
        return `<h3>${html(id)}</h3><p>${fore.has(id) ? "Ingår inte längre som beroende i detta underlag." : "Ingår nu som beroende i detta underlag."} Detta säger inte att posten har lagts till eller tagits bort ur beståndet.</p>`;
      }
      const a = fore.get(id) ?? {}, b = efter.get(id) ?? {};
      const nycklar = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((k) =>
        !(k in a) || !(k in b) || kanoniskJson(a[k]) !== kanoniskJson(b[k]));
      if (!nycklar.length) return "";
      return `<h3>${html(id)}</h3><table><thead><tr><th>Ändrat fält</th><th>Före</th><th>Efter</th></tr></thead><tbody>` +
        nycklar.map((k) => `<tr><th scope="row">${html(etiketter[k] ?? k)}</th><td><pre>${k in a ? visa(a[k]) : "Fältet saknades"}</pre></td><td><pre>${k in b ? visa(b[k]) : "Fältet borttaget"}</pre></td></tr>`).join("") + "</tbody></table>";
    }).join("");
  };
  const rader = paket.andringar.map((andring, i) => `<article id="post-${i}">
<h2>${html(andring.rot)}</h2>
<p>${andring.sort === "tillagd" ? "Tillagd" : andring.sort === "borttagen" ? "Borttagen" : "Ändrad"} · ${andring.direkt ? "Postens eget underlag ändrat" : "Ett beroende har ändrats"}</p>
${falt(andring)}
<details><summary>Visa hela underlaget och alla beroenden</summary>
<div class="jamforelse"><section><h3>Före</h3>${andring.fore === null ? "<p>Posten saknades.</p>" : `<pre>${visa(andring.fore)}</pre>`}</section>
<section><h3>Efter</h3>${andring.efter === null ? "<p>Posten borttagen.</p>" : `<pre>${visa(andring.efter)}</pre>`}</section></div></details></article>`).join("\n");
  return `<!doctype html><html lang="sv"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Underlag inför publicering</title><style>
body{font:17px/1.5 system-ui,sans-serif;max-width:1400px;margin:2rem auto;padding:0 1rem;color:#18212b;background:#fff}
article{border-top:2px solid #687889;margin-top:2rem}code,pre{overflow-wrap:anywhere;white-space:pre-wrap}
.jamforelse{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.5rem}
pre{background:#f0f3f6;padding:1rem;font-size:13px}section{min-width:0}
table{width:100%;table-layout:fixed;border-collapse:collapse}th,td{vertical-align:top;text-align:left;border:1px solid #bac4ce;padding:.5rem;overflow-wrap:anywhere}th:first-child{width:20%}td pre{margin:0}summary{cursor:pointer;padding:1rem 0}
@media(max-width:700px){.jamforelse{grid-template-columns:1fr}}
</style><main><h1>Underlag inför publicering</h1>
<p>Detta är en jämförelse av lagrat underlag. Den visar inte att uppgifterna är korrekta eller att en människa har godkänt publiceringen.</p>
<dl><dt>Föregående revision</dt><dd><code>${html(paket.foreRevision)}</code></dd>
<dt>Föreslagen revision</dt><dd><code>${html(paket.efterRevision)}</code></dd>
<dt>Paketets kontrollsumma</dt><dd><code>${html(hash)}</code></dd></dl>
<p>${paket.andringar.length} berörda poster. Registret innehåller ${paket.antalFore} poster före och ${paket.antalEfter} efter.</p>
${rader || "<p>Inga ändringar i det jämförda underlaget.</p>"}</main></html>\n`;
}
