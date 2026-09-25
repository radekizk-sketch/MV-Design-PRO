"""Karta POLE-ZAJĘTE — warstwa API: `POST /enm/domain-ops` (jedyna produkcyjna droga zmiany
modelu) odmawia drugiego kabla z zajętego pola i niesie zajętość pól w `logical_views`.

Iloczyn w tej warstwie: rodzaj {stacja na odcinku, GPZ} × stan {pole wolne, pole zajęte} ×
operacja {ciąg z pola, odgałęzienie}; model po odmowie jest NIEZMIENIONY (zapis tylko po
sukcesie), a `line_fields` odpowiedzi zgadza się z migawką odczytaną z magazynu.
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from enm.zajetosc_pol import KOD_POLE_ZAJETE, zajetosc_pol
from fastapi.testclient import TestClient

APARAT = "sw-cb-abb-vd4-17kv-630a"
KABEL = "cable-tfk-yakxs-3x120"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


def _przypadek(klient: TestClient) -> str:
    projekt = klient.post("/api/projects", json={"name": "Pole zajęte — test API"})
    assert projekt.status_code == 201, projekt.text
    przypadek = klient.post(
        "/api/study-cases",
        json={"project_id": projekt.json()["id"], "name": "Przypadek pola zajętego"},
    )
    assert przypadek.status_code == 201, przypadek.text
    return str(przypadek.json()["id"])


def _op(klient: TestClient, case_id: str, nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert odp.status_code == 200, odp.text
    return odp.json()


def _odcinek(dlugosc_m: int, nazwa: str) -> dict[str, Any]:
    return {"rodzaj": "KABEL", "dlugosc_m": dlugosc_m, "catalog_ref": KABEL, "name": nazwa}


def _siec(klient: TestClient, case_id: str) -> dict[str, Any]:
    gpz = _op(
        klient,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
            "sections_count": 1,
            "line_fields_per_section": 2,
            "gpz_line_field_apparatus": {"catalog_ref": APARAT},
        },
    )
    pole_gpz = next(
        w["field_ref"] for w in gpz["logical_views"]["line_fields"] if not w["occupied"]
    )
    ciag = _op(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"field_ref": pole_gpz, "segment": _odcinek(500, "Magistrala")},
    )
    odcinek = [b for b in ciag["snapshot"]["branches"] if b.get("type") == "cable"][-1]
    return _op(
        klient,
        case_id,
        "insert_station_on_segment_sn",
        {
            "segment_ref": odcinek["ref_id"],
            "field_apparatus_catalog_ref": APARAT,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"name": "Stacja Olchowa", "sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "FEEDER"],
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
        },
    )


@pytest.mark.parametrize("operacja", ["ciag_z_pola", "odgalezienie"])
@pytest.mark.parametrize("rodzaj", ["stacja", "gpz"])
def test_api_drugi_kabel_z_zajetego_pola(klient: TestClient, rodzaj: str, operacja: str) -> None:
    case_id = _przypadek(klient)
    odpowiedz = _siec(klient, case_id)
    wiersze = odpowiedz["logical_views"]["line_fields"]
    # Model odczytu API = ta sama funkcja zajętości co migawka zapisana w magazynie.
    migawka = klient.get(f"/api/cases/{case_id}/enm").json()
    assert {w["field_ref"]: w["occupied"] for w in wiersze} == {
        ref: z.zajete for ref, z in zajetosc_pol(migawka).items()
    }

    prefiks = "stn/" if rodzaj == "stacja" else "gpz/"
    pole = next(
        w["field_ref"]
        for w in wiersze
        if w["station_ref"].startswith(prefiks)
        and w["bay_role"] in {"OUT", "FEEDER"}
        and not w["occupied"]
    )

    def _przylacz(nazwa: str) -> dict[str, Any]:
        if operacja == "ciag_z_pola":
            return _op(
                klient,
                case_id,
                "continue_trunk_segment_sn",
                {"field_ref": pole, "segment": _odcinek(300, nazwa)},
            )
        return _op(
            klient,
            case_id,
            "start_branch_segment_sn",
            {"from_ref": f"{pole}.BRANCH", "segment": _odcinek(150, nazwa)},
        )

    pierwszy = _przylacz("Pierwszy")
    assert not pierwszy.get("error"), pierwszy.get("error")
    wiersz = next(w for w in pierwszy["logical_views"]["line_fields"] if w["field_ref"] == pole)
    assert wiersz["occupied"] is True and len(wiersz["segment_refs"]) == 1

    przed = klient.get(f"/api/cases/{case_id}/enm").json()
    drugi = _przylacz("Drugi")
    if rodzaj == "gpz" and operacja == "odgalezienie":
        # Kanon GPZ: odgałęzienie z zajętego pola dostaje inne wolne albo NOWE pole.
        assert not drugi.get("error"), drugi.get("error")
        po = zajetosc_pol(drugi["snapshot"])
        assert all(not z.przeciazone for z in po.values())
        return
    assert drugi.get("error_code") == KOD_POLE_ZAJETE
    assert "zajęte" in drugi["error"]
    # Odmowa nie zostawia skutku: model w magazynie bez zmian.
    assert klient.get(f"/api/cases/{case_id}/enm").json() == przed
