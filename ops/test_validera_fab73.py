"""Regressioner: en publik 200-sida får inte dölja att boten får 403, och ett
FAQ-svar utan arkivlänk är ett svar ingen kan citera."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import validera_fab73 as validator


def _faqlista(slugs=("energi-karnkraft", "kostnad-s")):
    return {
        "faq": [
            {"slug": slug, "question": f"Fråga {slug}?", "updated_at": "2026-10-01"}
            for slug in slugs
        ]
    }


def _faq_svar(slug, med_arkiv=True):
    kalla = {"parti": "Testpartiet", "quote": "Ett citat.", "url": "https://example.org/kalla",
             "archive_url": "https://web.archive.org/web/20260901/https://example.org/kalla" if med_arkiv else None,
             "date": "2026-09-01"}
    return {"question": f"Fråga {slug}?", "slug": slug, "updated_at": "2026-10-01",
            "license": "CC-BY-4.0", "sources": [kalla], "data": {}}


def _faqa_sidor(slugs):
    return {f"faq/{slug}/index.html":
            '<script type="application/ld+json">'
            '{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Fråga?"}]}</script>'
            for slug in slugs}


class LiveAgentAccessTest(unittest.TestCase):
    def test_bot_403_faller_trots_giltig_metadata(self):
        html = ('<script type="application/ld+json">'
                '{"@type":"DataCatalog","dataset":{"@type":"Dataset",'
                '"license":"https://creativecommons.org/licenses/by/4.0/",'
                '"isAccessibleForFree":true,"distribution":['
                + ','.join(json.dumps(endpoint) for endpoint in validator.ENDPOINTS)
                + ']}}</script>')
        spec = json.dumps({
            "openapi": "3.0.3",
            "paths": dict.fromkeys(
                list(validator.ENDPOINTS)
                + ["/api/v1/faq.json", "/api/v1/faq/{slug}.json"],
                {},
            ),
        })
        robots = ''.join(f'User-agent: {agent}\nAllow: /\n'
                         for agent in validator.SOK_AGENTER)
        faq_slugs = ("energi-karnkraft", "kostnad-s")

        def fake_fetch(path):
            filer = {
                "index.html": html,
                "api/v1/openapi.json": spec,
                "llms.txt": "api/v1/openapi.json /faq",
                "robots.txt": robots,
                "api/v1/faq.json": json.dumps(_faqlista(faq_slugs)),
            }
            filer.update(_faqa_sidor(faq_slugs))
            filer.update({f"api/v1/faq/{slug}.json": json.dumps(_faq_svar(slug))
                          for slug in faq_slugs})
            return filer[path]

        def fake_run(args, **_):
            if any("%{num_redirects}" in arg for arg in args):
                return SimpleNamespace(returncode=0, stdout="200 0")
            status = "403" if args[args.index("-A") + 1] == "ClaudeBot" else "200"
            return SimpleNamespace(returncode=0, stdout=status)

        validator.fel.clear()
        validator.ARGS = SimpleNamespace(dist=None)
        with patch.object(validator, "haemta", side_effect=fake_fetch), \
             patch.object(validator, "haemta_sida", side_effect=lambda vag: fake_fetch(vag)), \
             patch.object(validator.subprocess, "run", side_effect=fake_run):
            validator.validera()
        self.assertTrue(any("ClaudeBot får HTTP 403" in issue for issue in validator.fel),
                        validator.fel)
        # Felet som fångas är bot-blocket — inte FAQ-delen, som är grön här.
        self.assertFalse(any("faq" in issue for issue in validator.fel), validator.fel)


class FaqCiterbarhetTest(unittest.TestCase):
    """Ett FAQ-svar utan arkivlänk ska falla, även när allt annat är grönt."""

    def _kora(self, faq_svar):
        html = ('<script type="application/ld+json">'
                '{"@type":"DataCatalog","dataset":{"@type":"Dataset",'
                '"license":"https://creativecommons.org/licenses/by/4.0/",'
                '"isAccessibleForFree":true,"distribution":['
                + ','.join(json.dumps(endpoint) for endpoint in validator.ENDPOINTS)
                + ']}}</script>')
        spec = json.dumps({
            "openapi": "3.0.3",
            "paths": dict.fromkeys(
                list(validator.ENDPOINTS)
                + ["/api/v1/faq.json", "/api/v1/faq/{slug}.json"],
                {},
            ),
        })
        robots = ''.join(f'User-agent: {agent}\nAllow: /\n'
                         for agent in validator.SOK_AGENTER)

        def fake_fetch(path):
            filer = {
                "index.html": html,
                "api/v1/openapi.json": spec,
                "llms.txt": "api/v1/openapi.json /faq",
                "robots.txt": robots,
                "api/v1/faq.json": json.dumps(_faqlista()),
            }
            filer.update(_faqa_sidor(("energi-karnkraft", "kostnad-s")))
            filer.update({f"api/v1/faq/{slug}.json": json.dumps(faq_svar(slug))
                          for slug in ("energi-karnkraft", "kostnad-s")})
            return filer[path]

        validator.fel.clear()
        validator.ARGS = SimpleNamespace(dist=True)
        with patch.object(validator, "haemta", side_effect=fake_fetch), \
             patch.object(validator, "haemta_sida", side_effect=lambda vag: fake_fetch(vag)):
            validator.validera()
        return list(validator.fel)

    def test_svar_utan_arkivlank_faller(self):
        fel = self._kora(lambda slug: _faq_svar(slug, med_arkiv=False))
        self.assertTrue(any("ingen källa med url och arkivlänk" in f for f in fel), fel)

    def test_svar_med_arkivlank_passerar_faq_delen(self):
        fel = self._kora(_faq_svar)
        self.assertFalse(any("faq" in f for f in fel), fel)


if __name__ == "__main__":
    unittest.main()
