import { kanoniskJson } from "./underlagsversion.ts";
import { kontrolleraPubliceringspaket, type byggPubliceringspaket } from "./publiceringspaket.ts";

type Paket = ReturnType<typeof byggPubliceringspaket>;
const html = (value: string) => value.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Visar hela det lagrade ändringsunderlaget utan att intyga sakprövning eller beslut. */
export function publiceringsvy(paket: Paket): string {
  kontrolleraPubliceringspaket(paket);
  const { hash } = paket;
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
        nycklar.map((k) => `<tr><th scope="row">${html(etiketter[k] ?? k)}</th><td><span class="mobiletikett">Före</span><pre>${k in a ? visa(a[k]) : "Fältet saknades"}</pre></td><td><span class="mobiletikett">Efter</span><pre>${k in b ? visa(b[k]) : "Fältet borttaget"}</pre></td></tr>`).join("") + "</tbody></table>";
    }).join("");
  };
  const tal = (n: number | null) => n === null ? "Fanns inte" : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 20 }).format(n);
  const beloppsrad = (namn: string, fore: number | null, efter: number | null) =>
    `<tr><th scope="row">${html(namn)}</th><td><span class="mobiletikett">Före</span>${tal(fore)}</td><td><span class="mobiletikett">Efter</span>${tal(efter)}</td><td><span class="mobiletikett">Ändring</span>${fore === null || efter === null ? "—" : tal(efter - fore)}</td></tr>`;
  const beloppstabell = (rader: string) => `<table><thead><tr><th>Belopp</th><th>Före</th><th>Efter</th><th>Ändring</th></tr></thead><tbody>${rader}</tbody></table>`;
  const summorvy = () => {
    if (!paket.summor) return "<p>Summering saknas i detta underlag.</p>";
    const { fore, efter } = paket.summor;
    const etiketter = { utgifter: "Utgifter och intäktsminskningar", besparingar: "Besparingar och intäktsökningar", finansiering: "Partiernas angivna finansiering", gap: "Finansieringsgap" };
    const totaler = beloppstabell((Object.keys(etiketter) as (keyof typeof etiketter)[]).map((k) => beloppsrad(etiketter[k], fore[k], efter[k])).join(""));
    const partiFore = new Map(fore.partier.map((p) => [p.kod, p]));
    const partiEfter = new Map(efter.partier.map((p) => [p.kod, p]));
    const partier = [...new Set([...partiFore.keys(), ...partiEfter.keys()])].sort().map((kod) => {
      const a = partiFore.get(kod), b = partiEfter.get(kod), namn = (b ?? a)!.namn;
      return beloppsrad(`${namn}: netto före angiven finansiering`, a?.netto ?? null, b?.netto ?? null) +
        beloppsrad(`${namn}: angiven finansiering`, a?.finansiering ?? null, b?.finansiering ?? null) +
        beloppsrad(`${namn}: finansieringsgap`, a?.gap ?? null, b?.gap ?? null);
    }).join("");
    return `<section><h2>Summor för mandatperioden</h2><p>Alla belopp är miljoner kronor. Före och efter räknas med respektive revisions data och beräkningskod från sajten. Detta kontrollerar inte om kalkylernas sakunderlag håller.</p>${totaler}
<details><summary>Visa partisummor före och efter</summary><p>Partiernas egna summor kan inte adderas till rikssumman: gemensamma löften räknas för varje berört parti men en gång i rikssumman.</p>${beloppstabell(partier)}</details>
<details><summary>Visa beräkningskodens kontrollsummor</summary><p>Före: <code>${html(fore.berakningshash)}</code></p><p>Efter: <code>${html(efter.berakningshash)}</code></p></details></section>`;
  };
  const filvy = paket.filer === null
    ? "<p>Filjämförelse saknas. Underlaget omfattar endast de fyra postregistren och räcker inte för publiceringsbeslut.</p>"
    : `<section id="filer"><h2>Alla filändringar</h2><p>${paket.filer.sokvagar.length} ändrade filer mellan revisionerna. Listan omfattar även kod, övriga data och texter som inte visas som poster nedan.</p>
${paket.filer.sokvagar.length ? `<ul>${paket.filer.sokvagar.map((p) => `<li><code>${html(p)}</code></li>`).join("")}</ul><details><summary>Visa hela filjämförelsen</summary><p>Binära filer återges i Gits patchformat och behöver även granskas i sitt ursprungliga format.</p><pre>${html(paket.filer.patch)}</pre></details>` : "<p>Inga spårade filer har ändrats.</p>"}</section>`;
  const rubrik = (andring: Paket["andringar"][number]) => {
    const post = (andring.efter ?? andring.fore)?.poster.find((p) => `${p.slag}:${p.id}` === andring.rot);
    const title = post?.innehall.title;
    return typeof title === "string" && title.trim()
      ? `<h2>${html(title)}</h2><p><code>${html(andring.rot)}</code></p>`
      : `<h2>${html(andring.rot)}</h2>`;
  };
  const rader = paket.andringar.map((andring, i) => `<article id="post-${i}">
${rubrik(andring)}
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
.mobiletikett{display:none}
@media(max-width:700px){.jamforelse{grid-template-columns:1fr}thead{display:none}table,tbody,tr,th,td{display:block}tr{margin-bottom:1rem}th:first-child{width:auto}td pre{padding:.75rem}.mobiletikett{display:block;font-weight:700;margin-bottom:.5rem}}
</style><main><h1>Underlag inför publicering</h1>
<p>Detta är en jämförelse av lagrat underlag. Den visar inte att uppgifterna är korrekta eller att en människa har godkänt publiceringen.</p>
<dl><dt>Föregående revision</dt><dd><code>${html(paket.foreRevision)}</code></dd>
${paket.driftbas ? `<dt>Föregående lyckade publicering</dt><dd>${html(paket.driftbas.publiceradVid)} · ${html(paket.driftbas.deploymentId)}</dd>` : ""}
<dt>Föreslagen revision</dt><dd><code>${html(paket.efterRevision)}</code></dd>
<dt>Paketets kontrollsumma</dt><dd><code>${html(hash)}</code></dd></dl>
<p>${paket.andringar.length} berörda poster. Registret innehåller ${paket.antalFore} poster före och ${paket.antalEfter} efter.</p>
${summorvy()}
${filvy}
<h2>Ändringar i löften, ståndpunkter, kopplingar och handlingar</h2>
${rader || "<p>Inga ändringar i de fyra postregistren.</p>"}</main></html>\n`;
}
