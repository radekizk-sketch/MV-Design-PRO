"""Real QElectroTech examples and rejection guards — Python stdlib unittest."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
SCRIPTS = PROJECT / "scripts"
sys.path.insert(0, str(SCRIPTS))
from import_qet_nn import ImportFailure, convert  # noqa: E402

VENDOR = PROJECT / "docs/sld/vendor/qet"
MANIFEST = VENDOR / "import_manifest.json"
IMPORTER = SCRIPTS / "import_qet_nn.py"


class QetImporterTests(unittest.TestCase):
    def test_real_curated_source(self):
        items = json.loads(MANIFEST.read_text(encoding="utf-8"))["items"]
        self.assertEqual(len(items), 7)
        for item in items:
            with self.subTest(item=item["id"]):
                raw = (VENDOR/item["sourcePath"]).read_bytes()
                result = convert(raw,source_path=item["sourcePath"],symbol_id=item["id"])
                self.assertEqual(result["verificationStatus"],"DRAFT")
                self.assertEqual(result["approval"],"OWNER_REQUIRED")
                self.assertIsNone(result["modelBinding"])
                self.assertEqual(result["source"]["license"],"CC-BY-3.0")
                self.assertGreaterEqual(len(result["ports"]),2)
                self.assertGreater(len(result["geometry"]["primitives"]),1)
                self.assertTrue(all(x["reviewRequired"] for x in result["ports"]))
                self.assertTrue(all(x["phase"] is None for x in result["ports"]))
    def test_auxiliary_rcbo_strokes_keep_original_weights(self):
        path=("10_electric/11_singlepole/200_fuses_protective_gears/"
              "50_residual_current_circuit_breaker/rcbo.elmt")
        r=convert((VENDOR/path).read_bytes(),source_path=path,
                  symbol_id="nn.qet.rcbo")
        weights={p.get("w",1) for p in r["geometry"]["primitives"]}
        self.assertIn(0.65,weights)
        self.assertIn(1,weights)

    def test_reference_geometry_hotspot_is_preserved(self):
        # disjoncteur1.elmt: źródłowy przewód (0,-20) -> (0,-10);
        # hotspot (9,30), czyli dokładne punkty (9,10) -> (9,20).
        path=("10_electric/11_singlepole/200_fuses_protective_gears/"
              "11_circuit_breakers/disjoncteur1.elmt")
        data=convert((VENDOR/path).read_bytes(),source_path=path,
                     symbol_id="nn.qet.wylacznik1p")
        g=data["geometry"]
        self.assertEqual(g["hotspot"],{"x":9,"y":30})
        self.assertIn({"k":"line","x1":9,"y1":10,"x2":9,"y2":20},
                      g["primitives"])
        self.assertEqual(sorted(p["dir"] for p in data["ports"]),["N","S"])
        self.assertEqual(data["switchState"],"NOT_MODELLED")

    def test_complex_reference_arc_and_ellipse_are_retained(self):
        prefix="10_electric/11_singlepole/200_fuses_protective_gears/"
        sources=[
          (prefix+"50_residual_current_circuit_breaker/rcbo.elmt","arc"),
          (prefix+"50_residual_current_circuit_breaker/rccb.elmt","path"),
        ]
        for path,kind in sources:
            with self.subTest(path=path):
                obj=convert((VENDOR/path).read_bytes(),source_path=path,
                            symbol_id="nn.qet.fixture")
                self.assertIn(kind,{p["k"] for p in obj["geometry"]["primitives"]})
                self.assertIsNone(obj["modelBinding"])

    def test_independent_of_file_order_and_locale(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)/"candidate.json"
            command = [sys.executable,str(IMPORTER),"--manifest",str(MANIFEST),
                       "--source-root",str(VENDOR),"--output",str(output)]
            subprocess.run(command,check=True,capture_output=True,text=True)
            a=output.read_bytes()
            subprocess.run(command,check=True,capture_output=True,text=True)
            self.assertEqual(a,output.read_bytes(),"Niedeterministyczny rezultat")
            obj=json.loads(a)
            self.assertEqual(obj["contract"],"MvNnQetCandidateV1")
            self.assertIs(obj["production"],False)
            self.assertEqual(len(obj["symbols"]),7)
    def test_reject_entity_doctype(self):
        dirty=b'<!DOCTYPE a [<!ENTITY x SYSTEM "file:///etc/passwd">]><definition/>'
        with self.assertRaises(ImportFailure): convert(dirty,source_path="x.elmt",symbol_id="nn.x")
    def test_reject_active_content(self):
        dirty=b'<definition><description><script/></description></definition>'
        with self.assertRaises(ImportFailure): convert(dirty,source_path="x.elmt",symbol_id="nn.x")
    def test_reject_duplicate_port(self):
        src=(b'<definition width="16" height="24" hotspot_x="0" hotspot_y="0">'
             b'<description><line x1="0" y1="0" x2="0" y2="24"/>'
             b'<terminal x="0" y="0" orientation="n"/>'
             b'<terminal x="0" y="0" orientation="n"/></description></definition>')
        with self.assertRaises(ImportFailure): convert(src,source_path="x.elmt",symbol_id="nn.x")
    def test_reject_unsupported_graphic_instead_of_silent_loss(self):
        src=(b'<definition width="16" height="24" hotspot_x="0" hotspot_y="0">'
             b'<description><bezier/><terminal x="8" y="0" orientation="n"/>'
             b'</description></definition>')
        with self.assertRaises(ImportFailure): convert(src,source_path="x.elmt",symbol_id="nn.x")
    def test_reject_path_escape(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td)
            bad={"schemaVersion":1,"items":[{"id":"nn.x","sourcePath":"../../etc/passwd.elmt"}]}
            manifest=folder/"m.json"
            manifest.write_text(json.dumps(bad),encoding="utf-8")
            command=[sys.executable,str(IMPORTER),"--manifest",str(manifest),
                     "--source-root",str(folder),"--output",str(folder/"o.json")]
            run=subprocess.run(command,capture_output=True,text=True)
            self.assertNotEqual(run.returncode,0)
            self.assertFalse((folder/"o.json").exists())


if __name__=="__main__":
    unittest.main()
