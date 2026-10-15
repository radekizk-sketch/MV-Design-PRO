"""Kontrakt API obiektu kabla nN (karta OBIEKT-KABEL-NN).

`GET /api/cases/{case_id}/enm/nn-cable?cable_ref=` (+ `/warianty-przekroju`, `/dowod`,
`/dowod/pakiet`): realny projekt i przypadek w bazie, model w magazynie projektu, biegi
rozpływu i zwarć przypadku utrwalone — ta sama ścieżka co aplikacja.
"""

from __future__ import annotations

import io
from zipfile import ZipFile

from enm.canonical_analysis import create_run, execute_run
from enm.store import get_enm, set_enm

from tests.application.analyses.test_kabel_nn import GRUNT_2_OBWODY, _siec


def _przypadek(client) -> tuple[str, str]:
    projekt = client.post("/api/projects", json={"name": "Kabel nN — API"})
    assert projekt.status_code == 201, projekt.text
    przypadek = client.post(
        "/api/study-cases", json={"project_id": projekt.json()["id"], "name": "Przypadek kabla"}
    )
    assert przypadek.status_code == 201, przypadek.text
    case_id = str(przypadek.json()["id"])
    from application.twin_key import klucz_twin_dla_przypadku

    return case_id, klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _z_biegami(case_id: str, klucz: str, **parametry) -> None:
    set_enm(klucz, _siec("MCB", **parametry))
    for rodzaj in ("PF", "short_circuit_sn"):
        bieg = execute_run(create_run(case_id=case_id, klucz_twin=klucz, analysis_type=rodzaj).id)
        assert bieg.status == "FINISHED", bieg.error_message


def test_obliczenia_kabla_z_modelu_i_biegu(app_client) -> None:
    case_id, klucz = _przypadek(app_client)
    _z_biegami(case_id, klucz, ulozenie=GRUNT_2_OBWODY)
    resp = app_client.get(f"/api/cases/{case_id}/enm/nn-cable", params={"cable_ref": "k1"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "OK"
    assert body["brakujace_biegi"] == []
    assert body["kabel"]["warunki_ulozenia"] == GRUNT_2_OBWODY
    assert body["kabel"]["typ_nazwa"] == "YAKY 4x16 mm²"
    assert body["opcje_ulozenia"]["srodowiska"] == ["powietrze", "grunt"]
    assert len(body["kryteria"]) == 8


def test_obliczenia_bez_biegow_nazywaja_brakujace_biegi(app_client) -> None:
    case_id, klucz = _przypadek(app_client)
    set_enm(klucz, _siec("MCB"))
    body = app_client.get(f"/api/cases/{case_id}/enm/nn-cable", params={"cable_ref": "k1"}).json()
    assert body["brakujace_biegi"] == ["LOAD_FLOW", "SC_3F"]


def test_zmiana_warunkow_ulozenia_operacja_domenowa_zmienia_iz_prim(app_client) -> None:
    """Edycja inline warunków ułożenia = realna operacja `set_nn_cable_laying_conditions`."""
    case_id, klucz = _przypadek(app_client)
    _z_biegami(case_id, klucz)
    przed = app_client.get(f"/api/cases/{case_id}/enm/nn-cable", params={"cable_ref": "k1"}).json()
    resp = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "set_nn_cable_laying_conditions",
                "idempotency_key": "",
                "payload": {"segment_ref": "k1", "cable_laying_conditions": GRUNT_2_OBWODY},
            },
        },
    )
    assert resp.status_code == 200, resp.text
    assert not resp.json().get("error"), resp.json().get("error")
    po = app_client.get(f"/api/cases/{case_id}/enm/nn-cable", params={"cable_ref": "k1"}).json()
    iz_przed = next(w for w in przed["wielkosci"] if w["kod"] == "iz_prim")["wartosc"]
    iz_po = next(w for w in po["wielkosci"] if w["kod"] == "iz_prim")["wartosc"]
    assert iz_po < iz_przed


def test_warianty_i_wybor_przez_operacje_przypisania_katalogu(app_client) -> None:
    case_id, klucz = _przypadek(app_client)
    _z_biegami(case_id, klucz, p_kw=70.0)
    warianty = app_client.get(
        f"/api/cases/{case_id}/enm/nn-cable/warianty-przekroju", params={"cable_ref": "k1"}
    ).json()
    assert warianty["status"] == "OK"
    wybrany = next(
        v for v in warianty["warianty"] if v["catalog_item_id"] == warianty["rekomendacja"]
    )
    resp = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": "assign_catalog_to_element",
                "idempotency_key": "",
                "payload": {"element_ref": "k1", "catalog_binding": wybrany["catalog_binding"]},
            },
        },
    )
    assert resp.status_code == 200, resp.text
    assert not resp.json().get("error"), resp.json().get("error")
    kabel = next(b for b in get_enm(klucz).branches if b.ref_id == "k1")
    assert kabel.catalog_ref == wybrany["catalog_item_id"]
    po = app_client.get(f"/api/cases/{case_id}/enm/nn-cable", params={"cable_ref": "k1"}).json()
    k1 = next(k for k in po["kryteria"] if k["kryterium_id"] == "kabel_nn.obciazalnosc")
    assert k1["ocena_semantyka"] == "pozytywna"


def test_dowod_z_modelu_i_pakiet_deterministyczny(app_client) -> None:
    case_id, klucz = _przypadek(app_client)
    _z_biegami(case_id, klucz)
    dowod = app_client.get(f"/api/cases/{case_id}/enm/nn-cable/dowod", params={"cable_ref": "k1"})
    assert dowod.status_code == 200, dowod.text
    body = dowod.json()
    assert body["pack_type"] == "LV_CIRCUIT_VERIFICATION"
    assert body["summary"]["total_steps"] == 11
    assert len(body["kroki"]) == 11
    assert "Kabel K1" in body["title_pl"]
    pakiet1 = app_client.get(
        f"/api/cases/{case_id}/enm/nn-cable/dowod/pakiet", params={"cable_ref": "k1"}
    )
    pakiet2 = app_client.get(
        f"/api/cases/{case_id}/enm/nn-cable/dowod/pakiet", params={"cable_ref": "k1"}
    )
    assert pakiet1.status_code == pakiet2.status_code == 200
    assert pakiet1.content == pakiet2.content
    with ZipFile(io.BytesIO(pakiet1.content)) as zf:
        assert "proof_pack/proof.json" in set(zf.namelist())


def test_dowod_bez_biegu_rozplywu_422_z_powodem(app_client) -> None:
    case_id, klucz = _przypadek(app_client)
    set_enm(klucz, _siec("MCB"))
    resp = app_client.get(f"/api/cases/{case_id}/enm/nn-cable/dowod", params={"cable_ref": "k1"})
    assert resp.status_code == 422
    assert "rozpływu" in resp.json()["detail"]
