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
        self.assertEqual((self.stat["records"], self.stat["sources"], self.stat["rules"]), (70, 4, 22))
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

    def test_not_a_normative_source(self):
        items = kb.load("knowledge.json")
        self.assertFalse(any(x["source_id"] == "QET499" for x in items))
        sources = {x["id"]: x["kind"] for x in kb.load("sources.json")}
        self.assertEqual(sources["QET499"], "notatka")

if __name__ == "__main__":
    unittest.main()
