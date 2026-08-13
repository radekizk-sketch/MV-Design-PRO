"""Brama dokumentacji wykonawczej (karta KOMPLETNOSC-POLA-TR §0 pkt 2, test T10).

CO PILNUJE. Transformator przyłączony do szyny SN bez pola transformatorowego
NIE blokuje pracy ani obliczeń, ale ZAMYKA drogę do dokumentacji wykonawczej:
raport w profilu „Wykonawczy" (PW) nie może powstać, a końcówka gotowości mówi
o tym ZANIM projektant kliknie eksport (martwy klik z komunikatem po fakcie to
nie jest bramka, tylko niespodzianka).

ILOCZYN CECH (regula KLASA §2): {model z luką, model kompletny} × {profil
wykonawczy, profile pozostałe} × {JSON, DOCX, PDF} — bramka wpięta w JEDNEGO
budowniczego payloadu, więc test musi udowodnić, że żaden format jej nie omija.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from enm.canonical_analysis import CanonicalRun


def _migawka(*, role_pol: list[str]) -> dict[str, Any]:
    """Migawka stacji SN/nN z transformatorem i zadaną listą ról pól SN."""
    return {
        "buses": [
            {"ref_id": "bus-sn", "name": "Szyna SN", "voltage_kv": 15.0},
            {"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4},
        ],
        "transformers": [
            {
                "ref_id": "tr-1",
                "name": "TR 630 kVA",
                "hv_bus_ref": "bus-sn",
                "lv_bus_ref": "bus-nn",
            }
        ],
        "substations": [
            {
                "ref_id": "stn-1",
                "name": "Stacja 630 kVA",
                "station_type": "mv_lv",
                "bus_refs": ["bus-sn", "bus-nn"],
                "transformer_refs": ["tr-1"],
                "meta": {
                    "field_specs": [
                        {"field_ref": f"pole-{i}", "bay_role": rola, "bus_ref": "bus-sn"}
                        for i, rola in enumerate(role_pol)
                    ]
                },
            }
        ],
    }


def _run(snapshot: dict[str, Any]) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-pw",
        project_id="project-pw",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snapshot-pw",
        input_hash="hash-pw",
        snapshot=snapshot,
        validation={},
        readiness={},
        result_status="VALID",
        raw_result={"analysis_type": "power_flow", "converged": True, "buses": [], "branches": []},
    )


@pytest.fixture()
def _bieg_z_luka(monkeypatch) -> CanonicalRun:
    from api import analysis_runs as analysis_runs_api

    run = _run(_migawka(role_pol=["IN", "OUT", "FEEDER"]))
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)
    return run


@pytest.fixture()
def _bieg_kompletny(monkeypatch) -> CanonicalRun:
    from api import analysis_runs as analysis_runs_api

    run = _run(_migawka(role_pol=["IN", "OUT", "TR"]))
    monkeypatch.setattr(analysis_runs_api, "_require_canonical_run", lambda _run_id: run)
    return run


@pytest.mark.parametrize("format_raportu", ["json", "docx", "pdf"])
def test_brak_pola_tr_blokuje_dokumentacje_wykonawcza_w_kazdym_formacie(
    app_client, _bieg_z_luka, format_raportu: str
) -> None:
    response = app_client.get(
        f"/api/analysis-runs/{_bieg_z_luka.id}/export/report/{format_raportu}?profile=wykonawczy"
    )

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "documentation.executive_not_ready"
    assert "dokumentacji wykonawczej" in detail["message_pl"]
    blokady = detail["gotowosc_dokumentacji_wykonawczej"]["blokady"]
    assert [b["code"] for b in blokady] == ["transformer.bay_missing"]
    assert blokady[0]["element_refs"] == ["tr-1", "stn-1"]


@pytest.mark.parametrize("profil", ["osd", "audytowy"])
def test_pozostale_profile_nie_sa_blokowane(app_client, _bieg_z_luka, profil: str) -> None:
    """Bramka dotyczy WYŁĄCZNIE dokumentacji wykonawczej — reszta pracuje jak dotąd."""
    response = app_client.get(
        f"/api/analysis-runs/{_bieg_z_luka.id}/export/report/json?profile={profil}"
    )

    assert response.status_code == 200
    assert json.loads(response.content)["report_options"]["profile"] == profil


def test_model_z_polem_tr_przepuszcza_dokumentacje_wykonawcza(
    app_client, _bieg_kompletny
) -> None:
    response = app_client.get(
        f"/api/analysis-runs/{_bieg_kompletny.id}/export/report/json?profile=wykonawczy"
    )

    assert response.status_code == 200
    assert json.loads(response.content)["report_options"]["profile"] == "wykonawczy"


def test_koncowka_gotowosci_mowi_o_blokadzie_przed_kliknieciem(
    app_client, _bieg_z_luka
) -> None:
    response = app_client.get(
        f"/api/analysis-runs/{_bieg_z_luka.id}/gotowosc-dokumentacji-wykonawczej"
    )

    assert response.status_code == 200
    dane = response.json()
    assert dane["profil"] == "wykonawczy"
    assert dane["gotowy"] is False
    assert dane["blokady"][0]["code"] == "transformer.bay_missing"
    assert "nie posiada kompletnej konfiguracji pola" in dane["blokady"][0]["message_pl"]


def test_koncowka_gotowosci_dla_modelu_kompletnego(app_client, _bieg_kompletny) -> None:
    response = app_client.get(
        f"/api/analysis-runs/{_bieg_kompletny.id}/gotowosc-dokumentacji-wykonawczej"
    )

    assert response.status_code == 200
    dane = response.json()
    assert dane["gotowy"] is True
    assert dane["blokady"] == []
