#!/usr/bin/env python3
"""FAB-73 validerare — automatgrind (spec steg 6).

Kollar mot en byggd sajt (byggkatalog eller live-URL):
  1. JSON-LD Dataset + DataCatalog på startsidan (license CC-BY-4.0, distribution)
  2. /api/v1/openapi.json finns, parsar som JSON, täcker huvudendpoints
  3. llms.txt länkar till openapi.json
  4. robots.txt släpper in de sju AI-sök/user-agenterna

Användning:
  python3 validera_fab73.py --live                  # mot https://utlovat.se
  python3 validera_fab73.py --dist <katalog>        # mot byggd site/
"""
import argparse
import json
import re
import subprocess
import sys
from typing import Optional, List

BASE = "https://utlovat.se"
UA_LAESARE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
SOK_AGENTER = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User",
    "ClaudeBot", "Claude-SearchBot", "Claude-User",
    "PerplexityBot", "Perplexity-User",
]
ENDPOINTS = [
    "/api/v1/summary.json", "/api/v1/promises.json",
    "/api/v1/issues.json", "/api/v1/stances.json",
]

fel: List[str] = []


def haemta(vag: str) -> str:
    if ARGS.dist:
        with open(f"{ARGS.dist}/{vag}", encoding="utf-8") as f:
            return f.read()
    # curl i stället för urllib: urllib får DNS/403-quirks mot Cloudflare,
    # curl är samma väg som ops/ai-atkomst.mjs redan använder.
    url = BASE + ("/" + vag if not vag.startswith("/") else vag)
    ut = subprocess.run(
        ["curl", "-sf", "--max-time", "30", "-A", UA_LAESARE, url],
        capture_output=True, text=True, check=True,
    )
    return ut.stdout


def kolla(villkor: bool, medd: str) -> None:
    if not villkor:
        fel.append(medd)


def json_ld_block(html: str) -> List[dict]:
    ut = []
    for m in re.finditer(
        r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.S
    ):
        try:
            ut.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            fel.append("ogiltig JSON i ld+json-block")
    return ut


def dataset_i(block: List[dict]) -> Optional[dict]:
    for b in block:
        graf = b.get("@graph", [b] if isinstance(b, dict) else [])
        for nod in graf:
            if nod.get("@type") == "Dataset":
                return nod
            if nod.get("@type") == "DataCatalog" and isinstance(nod.get("dataset"), dict):
                ds = nod["dataset"]
                if ds.get("@type") == "Dataset":
                    return ds
    return None


def validera() -> None:
    # 1. Dataset + DataCatalog på startsidan
    html = haemta("index.html")
    block = json_ld_block(html)
    ds = dataset_i(block)
    kolla(ds is not None, "startsida: inget Dataset i JSON-LD")
    if ds:
        kolla(ds.get("license") == "https://creativecommons.org/licenses/by/4.0/",
              "Dataset: license saknar CC-BY-4.0-URL")
        kolla(bool(ds.get("distribution")), "Dataset: distribution saknas")
        for ep in ENDPOINTS:
            kolla(ep in json.dumps(ds), f"Dataset: distribution saknar {ep}")
        kolla(ds.get("isAccessibleForFree") is True, "Dataset: isAccessibleForFree saknas")
    kolla("DataCatalog" in html, "startsida: DataCatalog saknas i JSON-LD")

    # 2. OpenAPI
    spec_tom = False
    try:
        spec = json.loads(haemta("api/v1/openapi.json"))
    except subprocess.CalledProcessError:
        fel.append("api/v1/openapi.json saknas (404)")
        spec_tom = True
    except FileNotFoundError:
        fel.append("api/v1/openapi.json saknas")
        spec_tom = True
    except json.JSONDecodeError:
        fel.append("api/v1/openapi.json är inte giltig JSON")
        spec_tom = True
    if not spec_tom:
        kolla(spec.get("openapi", "").startswith("3."), "openapi.json: saknar openapi 3.x-fältet")
        paths = spec.get("paths", {})
        for ep in ENDPOINTS:
            kolla(ep in paths, f"openapi.json: paths saknar {ep}")

    # 3. llms.txt länkar openapi.json
    kolla("api/v1/openapi.json" in haemta("llms.txt"),
          "llms.txt: länkar inte api/v1/openapi.json")

    # 4. robots.txt släpper in agenterna
    robots = haemta("robots.txt")
    # parsa: User-agent-rader i följd delar regler (samma logik som ai-atkomst.mjs)
    regler: dict[str, list[str]] = {}
    namn: list[str] = []
    for rad in robots.splitlines():
        r = rad.strip().lower()
        if r.startswith("user-agent:"):
            namn.append(r.split(":", 1)[1].strip())
        elif r.startswith("allow:") or r.startswith("disallow:"):
            for n in namn:
                regler.setdefault(n, []).append(r)
        elif not r:
            namn = []
    for agent in SOK_AGENTER:
        n = agent.lower()
        m = [r for r in regler.get(n, []) if r.startswith("allow:")]
        kolla(bool(m), f"robots.txt: {agent} saknar Allow")

    # redirect-kedja ≤ 3 hopp (live-koll bara)
    if not ARGS.dist:
        ut = subprocess.run(
            ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{num_redirects}",
             "--max-time", "30", "-A", UA_LAESARE, BASE + "/"],
            capture_output=True, text=True, check=True,
        )
        status, hopp = ut.stdout.split()
        kolla(status.startswith("2"), f"startsida: oväntad status {status}")
        kolla(int(hopp) <= 3, f"startsida: {hopp} redirect-hopp (> 3)")


def main() -> int:
    global ARGS
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--live", action="store_true")
    g.add_argument("--dist")
    ARGS = p.parse_args()
    validera()
    if fel:
        print("FALLER:")
        for f in fel:
            print(f"  - {f}")
        return 1
    print("GRÖN: alla FAB-73-kontroller passerade")
    return 0


if __name__ == "__main__":
    sys.exit(main())
