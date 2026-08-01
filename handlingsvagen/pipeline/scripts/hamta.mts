/**
 * Gemensam hämtare för skördeskripten: artigt tempo (300 ms mellan anrop)
 * + retry med exponentiell backoff på 429/5xx och nätfel — en enstaka 503
 * får inte fälla en timslång skörd.
 */

import type { HttpFetch } from "../src/riksdagen.ts";

const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const politeFetch: HttpFetch = async (url) => {
  for (let forsok = 0; ; forsok += 1) {
    await sov(300);
    try {
      const res = await fetch(url);
      if ((res.status === 429 || res.status >= 500) && forsok < 4) {
        console.log(`  retry ${forsok + 1}/4 efter HTTP ${res.status}`);
        await sov(2_000 * 2 ** forsok);
        continue;
      }
      return res;
    } catch (e) {
      if (forsok >= 4) throw e;
      console.log(`  retry ${forsok + 1}/4 efter nätfel: ${e instanceof Error ? e.message : String(e)}`);
      await sov(2_000 * 2 ** forsok);
    }
  }
};
