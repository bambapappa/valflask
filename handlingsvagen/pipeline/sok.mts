import { cachat, hamtaJson } from "./scripts/kallcache.mts";
const dok = process.argv[2]!;
const ord = process.argv.slice(3);
const payload = (await cachat(`dokstatus-${dok}`, () =>
  hamtaJson(`https://data.riksdagen.se/dokumentstatus/${dok}.json`))) as any;
const text = (payload.dokumentstatus.dokument.html as string)
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g," ").replace(/&#(\d+);/g,(_m,d)=>String.fromCodePoint(Number(d))).replace(/\s+/g, " ");
for (const o of ord) {
  const re = new RegExp(o, "giu");
  let m; let n = 0;
  console.log(`\n### "${o}"`);
  while ((m = re.exec(text)) && n < 6) { n++;
    console.log("  …" + text.slice(Math.max(0, m.index - Number(process.env.FORE ?? 260)), m.index + Number(process.env.EFTER ?? 300)) + "…\n");
  }
  if (n === 0) console.log("  (ingen träff)");
}
