"""Testy regresyjne kwalifikatora ekspertów elektroenergetycznych.

Uruchomienie: python -m unittest discover -s mv-design-pro/scripts -p 'test_rada_ekspercka.py' -v
"""
from __future__ import annotations

import copy
import unittest

from rada_ekspercka import load_registry, normalize, route_task, validate_registry


class RegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = load_registry()

    def test_240_specialists_in_30_groups(self):
        self.assertEqual(len(self.registry["experts"]), 240)
        self.assertEqual(len(self.registry["groups"]), 30)
        self.assertEqual(validate_registry(self.registry), [])

    def test_duplicate_id_rejected(self):
        broken = copy.deepcopy(self.registry)
        broken["experts"][1]["id"] = "E001"
        self.assertTrue(validate_registry(broken))

    def test_missing_evidence_rejected(self):
        broken = copy.deepcopy(self.registry)
        broken["experts"][1]["evidence"] = []
        self.assertTrue(validate_registry(broken))

    def test_polish_normalization(self):
        self.assertEqual(normalize("Żyła powrotna — ZAŁĄCZENIE"), "zyla powrotna zalaczenie")

    def test_nc_rfg_selection(self):
        result = route_task("Badanie NC RfG, WOS i certyfikat modułu typu B", self.registry)
        self.assertEqual(result["profile"], "NC_RFG_WOS")
        self.assertEqual(result["lead"]["id"], "E121")
        self.assertIn("E127", [x["id"] for x in result["team"]])

    def test_cable_sn_selection(self):
        result = route_task("Dobór kabla SN 15 kV, żyła powrotna, obciążalność", self.registry)
        self.assertEqual(result["profile"], "KABLE_SN_NN")
        self.assertEqual(result["lead"]["id"], "E057")

    def test_protection_selection(self):
        result = route_task("Oblicz nastawy zabezpieczenia ziemnozwarciowego i selektywność EAZ", self.registry)
        self.assertEqual(result["profile"], "EAZ")
        self.assertIn("E075", [x["id"] for x in result["team"]])

    def test_power_quality_selection(self):
        result = route_task("Analiza jakości energii: harmoniczne, THD, flicker", self.registry)
        self.assertEqual(result["profile"], "JAKOSC_ENERGII")

    def test_station_selection(self):
        result = route_task("Konfiguracja stacji SN 15 kV, pola i sprzęgło", self.registry)
        self.assertEqual(result["profile"], "STACJA_SN_NN")

    def test_technical_screen_does_not_ignore_engineer(self):
        result = route_task("Ekran konfiguracji pola SN w stacji", self.registry)
        team = [result["lead"]["id"], *[x["id"] for x in result["team"]]]
        self.assertTrue(any(x in team for x in ("E025", "E029")))
        self.assertTrue(result["engineering_review_required"])

    def test_simple_css_not_over_reviewed(self):
        result = route_task("Popraw kolor przycisku w menu", self.registry)
        self.assertFalse(result["engineering_review_required"])
        self.assertIsNone(result["lead"])

    def test_no_guessing_unknown_domain(self):
        result = route_task("Zbadaj mechanizm niepowiązany z energetyką", self.registry)
        self.assertEqual(result["profile"], "WYMAGA_KWALIFIKACJI")
        self.assertIsNone(result["lead"])

    def test_independent_reviewer(self):
        for description in (
            "Dobór kabla SN", "NC RfG WOS", "Nastawy EAZ",
            "Harmoniczne THD", "Symulacja RMS EMT LVRT",
            "BESS GFM", "Stacja SN", "Rozpływ mocy",
        ):
            with self.subTest(description=description):
                result = route_task(description, self.registry)
                members = [result["lead"]["id"], *[x["id"] for x in result["team"]]]
                self.assertNotIn(result["reviewer"]["id"], members)

    def test_reproducibility(self):
        task = "Zwarcia doziemne SN, nastawy EAZ, przekładniki CT"
        self.assertEqual(route_task(task, self.registry), route_task(task, self.registry))

    def test_invalid_max_experts(self):
        with self.assertRaises(ValueError):
            route_task("Dobór kabla", self.registry, max_experts=1)


if __name__ == "__main__":
    unittest.main()
