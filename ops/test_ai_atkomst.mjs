import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function run(homeStatus, homeBody) {
  const preload = `
    const html = ${JSON.stringify(homeBody)};
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      const bot = String(options.headers?.['User-Agent'] ?? '').includes('ClaudeBot');
      if (url.pathname === '/robots.txt') return new Response('User-agent: *\\nAllow: /\\nContent-Signal: search=yes,ai-input=yes,ai-train=yes', {status:200});
      const status = bot && url.pathname === '/' ? ${homeStatus} : 200;
      const body = url.pathname === '/' && bot ? html : '<html><body>Beslutsunderlag</body></html>';
      return new Response(body, {status, headers:{
        'content-security-policy': "connect-src 'self' https://utlovat.se https://data.riksdagen.se",
        'access-control-allow-origin': '*'
      }});
    };
  `;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`,
    new URL("./ai-atkomst.mjs", import.meta.url).pathname, "https://example.test"], {encoding:"utf8", timeout:10000});
  assert.equal(result.error, undefined);
  return result;
}

test("403 is an access failure, not evidence about page content", () => {
  const result = run(403, "Forbidden");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ClaudeBot fick HTTP 403/);
  assert.match(result.stdout, /svarade 403 för en AI-agent/);
  assert.doesNotMatch(result.stdout, /förstasidan bär bara \d+ ord/);
  assert.doesNotMatch(result.stdout, /förstasidan saknar JSON-LD/);
});

test("200 still checks real non-JavaScript content", () => {
  const result = run(200, "<html><body>Endast två ord.</body></html>");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /förstasidan bär bara \d+ ord/);
  assert.match(result.stdout, /förstasidan saknar JSON-LD/);
});
