import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("kb_reference", ROOT / "kb.py")
kb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(kb)

class KnowledgeBaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        kb.DB = pathlib.Path(cls.tmp.name) / "test_fts.sqlite3"
        cls.stat = kb.build()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_integrity(self):
        self.assertEqual((self.stat["records"], self.stat["sources"], self.stat["rules"]), (168, 7, 59))
        self.assertTrue(kb.check()["ok"])

    def test_15kv_cmin_source(self):
        f = kb.search("cmin SN", limit=20)
        self.assertIn("SC-C-01", [x["id"] for x in f])
        x = next(x for x in f if x["id"] == "SC-C-01")
        self.assertIn("PDF 30", x["citation"])
        self.assertIn("1,00", x["content"])

    def test_norm_only_search(self):
        f = kb.search("prąd zwarciowy", source="IEC60909_2016", limit=20)
        self.assertTrue(f)
        self.assertTrue(all(x["source_id"] == "IEC60909_2016" for x in f))

    def test_earth_fault_limit(self):
        f = kb.search("izolowany neutralny", limit=20)
        self.assertIn("SC-SCOPE-02", [x["id"] for x in f])

    def test_equation_reference(self):
        facts = kb.load("knowledge.json")
        f = next(x for x in facts if x["id"] == "SC-KAPPA-01")
        self.assertEqual(f["source"]["equation"], "(57)")

    def test_reject_wrong_cmin(self):
        out = kb.validate_case({"un_kv": 15, "scenario": "MIN", "c_factor": 0.95})
        self.assertEqual(out["status"], "WYMAGA_KOREKTY")
        self.assertEqual(out["problems"][0]["rule_id"], "KB-R-002")

    def test_15kv_correct_cmin(self):
        out = kb.validate_case({"un_kv": 15, "scenario": "MIN", "c_factor": 1.00})
        self.assertEqual(out["status"], "BRAK_WYKRYTEJ_SPRZECZNOSCI")
        self.assertIn("nie jest", out["disclaimer"].lower())

    def test_isolated_earth_fault_not_applicable(self):
        out = kb.validate_case({"fault": "1F_Z", "neutral": "IZOLOWANY"})
        self.assertEqual(out["problems"][0]["rule_id"], "KB-R-001")

    def test_sql_fts_parser_not_exposed(self):
        self.assertIsInstance(kb.search('"; DROP TABLE idx; --'), list)
        self.assertTrue(kb.search("cmin"))

    def test_a1_is_not_full_standard(self):
        sources = {s["id"]: s for s in kb.load("sources.json")}
        self.assertEqual(sources["EN50160_A1_2025"]["kind"], "zmiana_normy")
        self.assertIn("TYLKO", sources["EN50160_A1_2025"]["notes"])
        out = kb.validate_case({"quality_standard":"EN50160_A1_2025","full_compliance":True})
        self.assertIn("KB-R2-008", [e["rule_id"] for e in out["problems"]])

    def test_two_earth_faults_have_distinct_locations(self):
        out = kb.validate_case({"fault":"2x1F_Z","fault_location_a":"A","fault_location_b":"A"})
        self.assertIn("KB-R2-002", [e["rule_id"] for e in out["problems"]])

    def test_60909_3_earth_fault_scope_and_page(self):
        facts = kb.search("zwarcie podwójne", source="IEC60909_3_2010", limit=20)
        self.assertTrue(facts)
        self.assertTrue(all("60909-3:2010" in x["citation"] for x in facts))
        self.assertTrue(any("PDF" in x["citation"] for x in facts))

    def test_mv_50160_asymmetry(self):
        facts = kb.search("asymetria 95%", source="EN50160_A1_2025", limit=30)
        self.assertIn("PQ-A1-MV-UNBALANCE", [x["id"] for x in facts])
        x = next(x for x in facts if x["id"] == "PQ-A1-MV-UNBALANCE")
        self.assertIn("A1", x["citation"])

    def test_lv_limit_not_reused_for_mv(self):
        out = kb.validate_case({"network_voltage_level":"SN","voltage_limit_clause":"4.2.2.2"})
        self.assertIn("KB-R2-009", [e["rule_id"] for e in out["problems"]])

    def test_62271_1_source_and_locators(self):
        facts = [x for x in kb.load("knowledge.json") if x["source_id"] == "IEC62271_1_2018"]
        self.assertEqual(len(facts), 56)
        self.assertTrue(all(x["source"]["pdf_page"] - 12 == x["source"]["printed_page"] for x in facts))
        src = next(x for x in kb.load("sources.json") if x["id"] == "IEC62271_1_2018")
        self.assertEqual(src["pages"], 136)
        self.assertEqual(src["status"], "source_verified_amendment_missing")

    def test_62271_voltage_insulation_references(self):
        facts = {x["id"]:x for x in kb.load("knowledge.json")}
        self.assertIn("17,5", facts["SG-INSULATION-17_5"]["content"])
        self.assertIn("110 kV", facts["SG-INSULATION-17_5"]["content"])
        self.assertIn("75/85", facts["SG-INSULATION-17_5"]["content"])
        self.assertIn("95/110", facts["SG-INSULATION-24"]["content"])
        self.assertIn("125/145", facts["SG-INSULATION-24"]["content"])
        self.assertEqual(facts["SG-INSULATION-17_5"]["source"]["pdf_page"], 45)

    def test_62271_1_search_and_citation(self):
        facts = kb.search("IP1XB", source="IEC62271_1_2018", limit=20)
        self.assertIn("SG-IP-TOUCH", [x["id"] for x in facts])
        x = next(x for x in facts if x["id"] == "SG-IP-TOUCH")
        self.assertIn("bez zmiany A1", x["citation"])

    def test_62271_1_apparatus_minimum_guard(self):
        out = kb.validate_case({"un_kv": 15, "switchgear":{"rated_ur_kv":12,
              "calculated_ip_ka":27, "rated_ip_ka":25,
              "short_circuit_breaking_capacity_derived_from":"Ik"}})
        ids = [x["rule_id"] for x in out["problems"]]
        self.assertIn("KB-R3-003", ids)
        self.assertIn("KB-R3-007", ids)
        self.assertIn("KB-R3-006", ids)

    def test_62271_1_missing_amendment_prevents_full_verdict(self):
        out = kb.validate_case({"full_62271_1_compliance": True})
        self.assertIn("KB-R3-002", [x["rule_id"] for x in out["problems"]])

    def test_not_a_normative_source(self):
        items = kb.load("knowledge.json")
        self.assertFalse(any(x["source_id"] == "QET499" for x in items))
        sources = {x["id"]: x["kind"] for x in kb.load("sources.json")}
        self.assertEqual(sources["QET499"], "notatka")

if __name__ == "__main__":
    unittest.main()
