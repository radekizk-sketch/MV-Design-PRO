"""Importer symboli QElectroTech pola liniowego SN (karta UX-04/POLE-LINIOWE-WZORZEC).

Przypina: (1) świeżość i determinizm wygenerowanej geometrii TS, (2) zgodność gabarytów
i portów z siatką schematu, (3) regułę noża (zamknięcie = obrót na styk stały), oraz
(4) zachowanie fail-closed importera na danych niezaufanych — każda iniekcja w kopii
katalogu źródeł musi przerwać import, a nie wygenerować geometrię po cichu.
"""

from __future__ import annotations

import importlib.util
import json
import math
import shutil
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


qet = _load_script("import_qet_pole_sn")

GRID = 8


def _symbole() -> list[dict]:
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    elementy = {w["id"]: qet.wczytaj_element(w) for w in manifest["elementy"]}
    return [
        qet.zloz_symbol(w, elementy, float(manifest["skala"]), 20.0) for w in manifest["symbole"]
    ]


@pytest.fixture
def kopia_zrodel(tmp_path, monkeypatch):
    """Kopia katalogu vendor QET z podmienionymi ścieżkami importera (iniekcje)."""
    cel = tmp_path / "qet"
    shutil.copytree(qet.ZRODLA, cel)
    monkeypatch.setattr(qet, "ZRODLA", cel)
    monkeypatch.setattr(qet, "MANIFEST", cel / "import_manifest.json")
    return cel


def _manifest(katalog: Path) -> dict:
    return json.loads((katalog / "import_manifest.json").read_text(encoding="utf-8"))


def _zapisz_manifest(katalog: Path, dane: dict) -> None:
    (katalog / "import_manifest.json").write_text(json.dumps(dane), encoding="utf-8")


def _podmien_zrodlo(katalog: Path, ident: str, stare: bytes, nowe: bytes) -> None:
    """Zmienia plik źródła ORAZ jego SHA w manifeście — sprawdza regułę treści, nie SHA."""
    manifest = _manifest(katalog)
    wpis = next(w for w in manifest["elementy"] if w["id"] == ident)
    plik = katalog / wpis["sourcePath"]
    dane = plik.read_bytes()
    assert stare in dane, "iniekcja musi trafić w treść źródła"
    dane = dane.replace(stare, nowe, 1)
    plik.write_bytes(dane)
    wpis["upstreamBlobSha"] = qet.sha_bloba_git(dane)
    _zapisz_manifest(katalog, manifest)


def test_wygenerowany_plik_ts_jest_swiezy_i_deterministyczny():
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    cel = PROJECT_ROOT / manifest["wyjscie"]
    pierwszy = qet.generuj()
    assert pierwszy == qet.generuj()
    assert (
        cel.read_text(encoding="utf-8") == pierwszy
    ), "qetPoleSn.ts rozjechany z importerem — python scripts/import_qet_pole_sn.py"
    assert qet.main(["--sprawdz"]) == 0


def test_sha_bloba_zrodel_rowne_manifestowi_i_wszystkie_elementy_uzyte():
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    for wpis in manifest["elementy"]:
        dane = (qet.ZRODLA / wpis["sourcePath"]).read_bytes()
        assert qet.sha_bloba_git(dane) == wpis["upstreamBlobSha"], wpis["sourcePath"]
    assert manifest["upstreamCommit"] == "14a4727f70856d8e79de59a353fa3c52d3e90e21"
    assert (qet.ZRODLA / "ELEMENTS.LICENSE").is_file()
    readme = (qet.ZRODLA / "README.md").read_text(encoding="utf-8")
    assert "CC BY 3.0" in readme and "QElectroTech" in readme


def test_gabaryty_i_porty_na_siatce_schematu():
    for s in _symbole():
        assert s["szerokosc"] % GRID == 0 and s["wysokosc"] % GRID == 0, s["id"]
        for port in s["porty"]:
            assert port["x"] % GRID == 0 and port["y"] % GRID == 0, (s["id"], port)
            assert 0 <= port["x"] <= s["szerokosc"] and 0 <= port["y"] <= s["wysokosc"]
        o = s["obrys"]
        assert o["x"] >= 0 and o["y"] >= 0, s["id"]
        assert o["x"] + o["width"] <= s["szerokosc"] + 1e-9, s["id"]
        assert o["y"] + o["height"] <= s["wysokosc"] + 1e-9, s["id"]
        # Gabaryt symetryczny względem osi toru (port dolny, bez niego górny).
        nazwy = {p["name"]: p for p in s["porty"]}
        os_x = (nazwy.get("bottom") or nazwy["top"])["x"]
        assert math.isclose(os_x * 2, s["szerokosc"]), s["id"]


def test_noz_zamyka_na_styk_staly_a_trojpolozeniowy_ma_polozenie_uziemione():
    manifest = json.loads(qet.MANIFEST.read_text(encoding="utf-8"))
    po_id = {s["id"]: s for s in _symbole()}
    lacznikowe = {w["symbolId"] for w in manifest["symbole"] if w.get("noz")}
    assert lacznikowe == {
        "qetBreaker",
        "qetDisconnector",
        "qetLoadBreakSwitch",
        "qetFuseSwitch",
        "qetEarthSwitch",
        "qetThreePositionSwitch",
    }
    for ident in lacznikowe:
        noz = po_id[ident]["noz"]
        assert noz["katy"]["open"] == 0
        assert noz["katy"]["closed"] != 0
        assert all(p["k"] == "line" and p["nozStanu"] for p in noz["prymitywy"])
    trojpol = po_id["qetThreePositionSwitch"]["noz"]["katy"]
    # Zamknięty i uziemiony — przeciwne kierunki od położenia odłączonego (oś).
    assert trojpol["closed"] == -trojpol["earthed"] and trojpol["closed"] < 0
    assert trojpol["unknown"] == 0
    # Dwupołożeniowe: nieznany = połowa kąta zamknięcia.
    for ident in lacznikowe - {"qetThreePositionSwitch"}:
        katy = po_id[ident]["noz"]["katy"]
        assert "earthed" not in katy
        assert math.isclose(katy["unknown"], katy["closed"] / 2, abs_tol=1e-4)
    zlozone = {s["id"] for s in po_id.values() if s["zlozenie"]}
    assert zlozone == {"qetThreePositionSwitch"}
    doprowadzenia = {s["id"]: s["doprowadzenia"] for s in po_id.values() if s["doprowadzenia"]}
    assert list(doprowadzenia) == ["qetThreePositionSwitch"]
    (lead,) = doprowadzenia["qetThreePositionSwitch"]
    assert lead["port"] == "top" and lead["y2"] == 0 and lead["x1"] == lead["x2"] and lead["powod"]
    assert "złożenie z elementów QET" in po_id["qetThreePositionSwitch"]["zlozenie"]


def test_iniekcja_zmieniony_plik_bez_zmiany_sha_przerywa_import(kopia_zrodel):
    wpis = _manifest(kopia_zrodel)["elementy"][0]
    plik = kopia_zrodel / wpis["sourcePath"]
    plik.write_bytes(plik.read_bytes() + b"\n")
    with pytest.raises(qet.BladImportu, match="SHA bloba"):
        qet.generuj()


def test_iniekcja_dtd_przerywa_import(kopia_zrodel):
    _podmien_zrodlo(
        kopia_zrodel,
        "en_60617_07_13_05",
        b"<definition",
        b'<!DOCTYPE x [<!ENTITY a "b">]><definition',
    )
    with pytest.raises(qet.BladImportu, match="DTD"):
        qet.generuj()


def test_iniekcja_nieznany_element_rysunku_przerywa_import(kopia_zrodel):
    _podmien_zrodlo(kopia_zrodel, "en_60617_07_13_05", b"<line ", b'<rect x="0" y="0"/><line ')
    with pytest.raises(qet.BladImportu, match="nieznany element rysunku"):
        qet.generuj()


def test_iniekcja_tekst_bez_decyzji_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    wpis = next(w for w in manifest["elementy"] if w["id"] == "en_60617_06_13_10")
    wpis["teksty"].pop("3")
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="bez decyzji"):
        qet.generuj()


def test_iniekcja_zacisk_bez_przypisania_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == "qetBreaker")
    symbol["porty"] = [p for p in symbol["porty"] if p["name"] != "bottom"]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="bez przypisania"):
        qet.generuj()


@pytest.mark.parametrize("wariant", ["bez_deklaracji", "bez_powodu", "zly_zacisk"])
def test_iniekcja_zacisk_poza_torem_wymaga_deklaracji_z_powodem(kopia_zrodel, wariant):
    """Zacisk wtórny przekładnika napięciowego nie jest portem: bez deklaracji, z pustym
    powodem albo ze wskazaniem nieistniejącego zacisku import jest przerywany."""
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == "qetVoltageTransformer")
    if wariant == "bez_deklaracji":
        symbol.pop("zaciskiPozaTorem")
        oczekiwany = "bez przypisania"
    elif wariant == "bez_powodu":
        symbol["zaciskiPozaTorem"][0]["powod"] = "  "
        oczekiwany = "bez powodu"
    else:
        symbol["zaciskiPozaTorem"][0]["zacisk"] = [0, 70]
        oczekiwany = "nie ma zacisku"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match=oczekiwany):
        qet.generuj()


def test_przekladnik_napieciowy_ma_jeden_port_pierwotny():
    vt = next(s for s in _symbole() if s["id"] == "qetVoltageTransformer")
    assert [p["name"] for p in vt["porty"]] == ["top"]
    assert vt["noz"] is None


def test_iniekcja_sciezka_poza_katalogiem_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    manifest["elementy"][0]["sourcePath"] = "../poza.elmt"
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="niebezpieczna ścieżka"):
        qet.generuj()


def test_iniekcja_kolor_lub_styl_kreski_przerywa_import(kopia_zrodel):
    _podmien_zrodlo(kopia_zrodel, "en_60617_07_13_05", b"line-style:normal", b"line-style:dashed")
    with pytest.raises(qet.BladImportu, match="styl kreski"):
        qet.generuj()


def test_iniekcja_port_poza_rastrem_qet_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == "qetCableHead")
    symbol["porty"][1]["punkt"] = [-75, -20]
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="poza rastrem"):
        qet.generuj()


def test_iniekcja_niezadeklarowany_port_wewnatrz_gabarytu_przerywa_import(kopia_zrodel):
    manifest = _manifest(kopia_zrodel)
    symbol = next(w for w in manifest["symbole"] if w["symbolId"] == "qetThreePositionSwitch")
    symbol.pop("portyWewnatrzGabarytu")
    _zapisz_manifest(kopia_zrodel, manifest)
    with pytest.raises(qet.BladImportu, match="poza krawędzią gabarytu"):
        qet.generuj()
