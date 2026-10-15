"""Kontrakt `GET /api/cases/{case_id}/enm/eksport-cgmes` (karta KASACJA-SCL-I-CIM-KLIENT).

Jedyna ścieżka eksportu modelu sieci po kasacji klientowych eksporterów SCL/CIM
(decyzja K-14/D-41). Kontrakt:

* model kompletny → 200, `application/zip`, bajty RÓWNE `export_cgmes(enm)` z
  warstwy aplikacji (końcówka niczego nie dokłada ani nie przelicza);
* determinizm: dwa biegi na sieci złotej → identyczny SHA-256;
* wejście tylko do odczytu: rewizja i odcisk modelu po eksporcie bez zmian;
* model niekompletny → 422 z NAZWANYMI brakami po polsku (nie 500, nie pusty plik);
* przypadek spoza projektu → 404 (wspólne tłumaczenie `case_id`, `klucz_twin_dep`).
"""

from __future__ import annotations

import hashlib
import io
import zipfile
from uuid import uuid4

from application.cgmes.service import export_cgmes, verify_cgmes_integrity
from enm.models import EnergyNetworkModel, ENMHeader
from enm.store import get_enm, set_enm

from tests.cgmes.golden_enm import build_golden_enm


def _nowy_przypadek(client) -> str:
    project = client.post("/api/projects", json={"name": "Eksport CGMES — test"})
    assert project.status_code == 201, project.text
    case = client.post(
        "/api/study-cases", json={"project_id": project.json()["id"], "name": "Przypadek"}
    )
    assert case.status_code == 201, case.text
    return str(case.json()["id"])


def _klucz(client, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tłumaczenie co warstwa API."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _adres(case_id: str) -> str:
    return f"/api/cases/{case_id}/enm/eksport-cgmes"


def test_siec_zlota_daje_archiwum_rowne_warstwie_aplikacji(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    klucz = _klucz(app_client, case_id)
    set_enm(klucz, build_golden_enm())
    zapisany = get_enm(klucz)

    odpowiedz = app_client.get(_adres(case_id))

    assert odpowiedz.status_code == 200, odpowiedz.text
    assert odpowiedz.headers["content-type"] == "application/zip"
    assert odpowiedz.headers["content-disposition"] == "attachment"
    assert odpowiedz.headers["x-model-rewizja"] == str(zapisany.header.revision)
    assert odpowiedz.headers["x-model-odcisk"] == zapisany.header.hash_sha256
    assert zapisany.header.hash_sha256
    assert odpowiedz.content == export_cgmes(zapisany)
    assert verify_cgmes_integrity(odpowiedz.content) == []
    with zipfile.ZipFile(io.BytesIO(odpowiedz.content)) as archiwum:
        assert archiwum.namelist() == ["EQ.xml", "TP.xml", "refmap.json", "manifest.json"]


def test_dwa_biegi_na_sieci_zlotej_maja_ten_sam_sha256(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    set_enm(_klucz(app_client, case_id), build_golden_enm())

    pierwszy = app_client.get(_adres(case_id))
    drugi = app_client.get(_adres(case_id))

    assert pierwszy.status_code == drugi.status_code == 200
    assert hashlib.sha256(pierwszy.content).hexdigest() == hashlib.sha256(drugi.content).hexdigest()


def test_eksport_nie_zmienia_modelu(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    klucz = _klucz(app_client, case_id)
    set_enm(klucz, build_golden_enm())
    przed = get_enm(klucz).header

    assert app_client.get(_adres(case_id)).status_code == 200

    po = get_enm(klucz).header
    assert (po.revision, po.hash_sha256) == (przed.revision, przed.hash_sha256)


def test_model_pusty_to_nazwana_odmowa_422(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    set_enm(_klucz(app_client, case_id), EnergyNetworkModel(header=ENMHeader(name="Pusty")))

    odpowiedz = app_client.get(_adres(case_id))

    assert odpowiedz.status_code == 422
    detail = odpowiedz.json()["detail"]
    assert detail.startswith("Eksport CGMES wstrzymany — model sieci jest niekompletny:")
    assert "nie zawiera żadnej szyny" in detail


def test_zacisk_do_szyny_spoza_modelu_to_nazwana_odmowa_422(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    enm = build_golden_enm()
    enm = enm.model_copy(
        update={
            "loads": [
                (
                    lo.model_copy(update={"bus_ref": "szyna_spoza_modelu"})
                    if lo.ref_id == "load_c"
                    else lo
                )
                for lo in enm.loads
            ]
        }
    )
    set_enm(_klucz(app_client, case_id), enm)

    odpowiedz = app_client.get(_adres(case_id))

    assert odpowiedz.status_code == 422
    detail = odpowiedz.json()["detail"]
    assert "Odbiór „Odbiór C”" in detail
    assert "load_c" not in detail


def test_przypadek_spoza_projektu_to_404(app_client) -> None:
    odpowiedz = app_client.get(_adres(str(uuid4())))
    assert odpowiedz.status_code == 404
