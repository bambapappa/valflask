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
  const rader = paket.andringar.map((andring, i) => `<article id="post-${i}">
<h2>${html(andring.rot)}</h2>
<p>${andring.sort === "tillagd" ? "Tillagd" : andring.sort === "borttagen" ? "Borttagen" : "Ändrad"} · ${andring.direkt ? "Postens eget underlag ändrat" : "Ett beroende har ändrats"}</p>
<div class="jamforelse"><section><h3>Före</h3>${andring.fore === null ? "<p>Posten saknades.</p>" : `<pre>${visa(andring.fore)}</pre>`}</section>
<section><h3>Efter</h3>${andring.efter === null ? "<p>Posten borttagen.</p>" : `<pre>${visa(andring.efter)}</pre>`}</section></div></article>`).join("\n");
  return `<!doctype html><html lang="sv"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Underlag inför publicering</title><style>
body{font:17px/1.5 system-ui,sans-serif;max-width:1400px;margin:2rem auto;padding:0 1rem;color:#18212b;background:#fff}
article{border-top:2px solid #687889;margin-top:2rem}code,pre{overflow-wrap:anywhere;white-space:pre-wrap}
.jamforelse{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.5rem}
pre{background:#f0f3f6;padding:1rem;font-size:13px}section{min-width:0}
@media(max-width:700px){.jamforelse{grid-template-columns:1fr}}
</style><main><h1>Underlag inför publicering</h1>
<p>Detta är en jämförelse av lagrat underlag. Den visar inte att uppgifterna är korrekta eller att en människa har godkänt publiceringen.</p>
<dl><dt>Föregående revision</dt><dd><code>${html(paket.foreRevision)}</code></dd>
<dt>Föreslagen revision</dt><dd><code>${html(paket.efterRevision)}</code></dd>
<dt>Paketets kontrollsumma</dt><dd><code>${html(hash)}</code></dd></dl>
<p>${paket.andringar.length} berörda poster. Registret innehåller ${paket.antalFore} poster före och ${paket.antalEfter} efter.</p>
${rader || "<p>Inga ändringar i det jämförda underlaget.</p>"}</main></html>\n`;
}
