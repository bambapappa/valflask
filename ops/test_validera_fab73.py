"""Regression: en publik 200-sida får inte dölja att boten får 403."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import validera_fab73 as validator


class LiveAgentAccessTest(unittest.TestCase):
    def test_bot_403_faller_trots_giltig_metadata(self):
        html = ('<script type="application/ld+json">'
                '{"@type":"DataCatalog","dataset":{"@type":"Dataset",'
                '"license":"https://creativecommons.org/licenses/by/4.0/",'
                '"isAccessibleForFree":true,"distribution":['
                + ','.join(json.dumps(endpoint) for endpoint in validator.ENDPOINTS)
                + ']}}</script>')
        spec = json.dumps({"openapi": "3.0.3", "paths": dict.fromkeys(validator.ENDPOINTS, {})})
        robots = ''.join(f'User-agent: {agent}\nAllow: /\n'
                         for agent in validator.SOK_AGENTER)

        def fake_fetch(path):
            return {"index.html": html, "api/v1/openapi.json": spec,
                    "llms.txt": "api/v1/openapi.json", "robots.txt": robots}[path]

        def fake_run(args, **_):
            if any("%{num_redirects}" in arg for arg in args):
                return SimpleNamespace(returncode=0, stdout="200 0")
            status = "403" if args[args.index("-A") + 1] == "ClaudeBot" else "200"
            return SimpleNamespace(returncode=0, stdout=status)

        validator.fel.clear()
        validator.ARGS = SimpleNamespace(dist=None)
        with patch.object(validator, "haemta", side_effect=fake_fetch), \
             patch.object(validator.subprocess, "run", side_effect=fake_run):
            validator.validera()
        self.assertTrue(any("ClaudeBot får HTTP 403" in issue for issue in validator.fel),
                        validator.fel)


if __name__ == "__main__":
    unittest.main()
