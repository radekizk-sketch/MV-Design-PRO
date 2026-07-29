"""Karta F-K5 (dlug V12K-189): koncowka prezentacji nastaw nadpradowych.

Sedno: nastawa NIEDOSTEPNA musi dojsc do warstwy prezentacji jako STAN z powodem i
akcja naprawcza. Wczesniej wynik `protection.overcurrent.v0` nie mial zadnej koncowki
prezentacyjnej — dane byly w kopercie biegu i nikt ich nie pokazywal.
"""

from __future__ import annotations

from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)
from application.analyses.run_index import index_run

_NASTAWY_Z_BRAKIEM = {
    "curve": "IEC_NI",
    "i_pickup_51_a": 120.0,
    "tms_51": 0.2,
    # Bez biegu 1F prad zwarcia doziemnego jest nieznany — V12K-189 zwraca None.
    "i_inst_50_a": None,
    "i_pickup_51n_a": None,
    "tms_51n": 0.3,
    "i_inst_50n_a": None,
    "readiness_codes": ["protection.fault_current_missing"],
    "is_complete": False,
}


def _zasiej_bieg_nastaw(
    uow_factory,
    *,
    run_id: str,
    analysis_type: str = "protection.overcurrent.v0",
    meta: dict | None = None,
) -> str:
    inputs = InputsRef(base_snapshot_id="snapshot-1", spec_ref=None, inline={})
    artifacts = (ArtifactRef(type="protection_report_v0", id="protection_report_v0:seed"),)
    trace = TraceRef(type="white_box", id=None, inline={"steps": ["seed"]})
    created_at_utc = "2026-07-25T00:00:00+00:00"
    envelope_dict = {
        "schema_version": "v0",
        "run_id": run_id,
        "analysis_type": analysis_type,
        "case_id": "case-1",
        "inputs": inputs.to_dict(),
        "artifacts": [a.to_dict() for a in artifacts],
        "trace": trace.to_dict(),
        "created_at_utc": created_at_utc,
        "fingerprint": "",
    }
    envelope = AnalysisRunEnvelope(
        run_id=run_id,
        analysis_type=analysis_type,
        case_id="case-1",
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint_envelope(envelope_dict),
    )
    entry = index_run(
        envelope,
        primary_artifact_type="protection_report_v0",
        primary_artifact_id="protection_report_v0:seed",
        base_snapshot_id="snapshot-1",
        case_id="case-1",
        status="DEGRADED",
        meta=(
            meta if meta is not None else {"protection_report_v0": {"settings": _NASTAWY_Z_BRAKIEM}}
        ),
    )
    with uow_factory() as uow:
        if uow.analysis_runs_index.get(run_id) is None:
            uow.analysis_runs_index.add(entry)
    return run_id


def test_niedostepne_nastawy_wychodza_z_powodem_i_akcja(app_client, uow_factory) -> None:
    run_id = _zasiej_bieg_nastaw(uow_factory, run_id="protection.overcurrent.v0:api-brak")

    response = app_client.get(f"/api/protection/overcurrent-settings?run_id={run_id}")

    assert response.status_code == 200
    dane = response.json()
    assert dane["run_id"] == run_id
    prezentacja = dane["prezentacja"]
    assert prezentacja["kompletne"] is False
    assert prezentacja["brakujace"] == ["i_inst_50_a", "i_pickup_51n_a", "i_inst_50n_a"]

    po_kluczu = {p["klucz"]: p for p in prezentacja["pozycje"]}
    assert po_kluczu["i_pickup_51_a"]["wartosc"] == 120.0
    brak = po_kluczu["i_inst_50_a"]
    assert brak["stan"] == "NIEDOSTEPNA"
    assert brak["wartosc"] is None
    # Akcja naprawcza pochodzi z kanonicznego rejestru kodow gotowosci.
    assert brak["fix_action_id"] == "fix_protection_run_short_circuit"
    assert "analiz" in brak["powod_pl"].lower()


def test_bieg_nieznany_daje_404(app_client) -> None:
    response = app_client.get("/api/protection/overcurrent-settings?run_id=nie-ma-takiego")
    assert response.status_code == 404


def test_bieg_innego_typu_jest_odrzucany(app_client, uow_factory) -> None:
    run_id = _zasiej_bieg_nastaw(
        uow_factory,
        run_id="protection.device_mapping.v0:api-zly-typ",
        analysis_type="protection.device_mapping.v0",
    )

    response = app_client.get(f"/api/protection/overcurrent-settings?run_id={run_id}")

    assert response.status_code == 422
    assert "nadpradowych" in response.json()["detail"]


def test_bieg_bez_nastaw_nie_udaje_pustego_zestawu(app_client, uow_factory) -> None:
    """Pusty zestaw w UI wygladalby jak „wszystko w porzadku" — dlatego 422."""
    run_id = _zasiej_bieg_nastaw(
        uow_factory,
        run_id="protection.overcurrent.v0:api-bez-nastaw",
        meta={"protection_report_v0": {}},
    )

    response = app_client.get(f"/api/protection/overcurrent-settings?run_id={run_id}")

    assert response.status_code == 422
    assert "nastaw" in response.json()["detail"]


def test_wybor_po_case_id_bierze_najnowszy_bieg(app_client, uow_factory) -> None:
    """Porzadek biegow zna backend, nie UI (jedno zrodlo reguly „najnowszy")."""
    _zasiej_bieg_nastaw(uow_factory, run_id="protection.overcurrent.v0:api-case-1")
    _zasiej_bieg_nastaw(
        uow_factory,
        run_id="protection.overcurrent.v0:api-case-2",
        meta={
            "protection_report_v0": {
                "settings": {**_NASTAWY_Z_BRAKIEM, "i_inst_50_a": 900.0, "is_complete": False}
            }
        },
    )

    response = app_client.get("/api/protection/overcurrent-settings?case_id=case-1")

    assert response.status_code == 200
    dane = response.json()
    # Oba biegi maja ten sam created_at (zasiew), wiec remis rozstrzyga run_id malejaco.
    assert dane["run_id"] == "protection.overcurrent.v0:api-case-2"
    po_kluczu = {p["klucz"]: p for p in dane["prezentacja"]["pozycje"]}
    assert po_kluczu["i_inst_50_a"]["wartosc"] == 900.0


def test_brak_parametru_albo_oba_naraz_sa_odrzucane(app_client) -> None:
    assert app_client.get("/api/protection/overcurrent-settings").status_code == 422
    assert (
        app_client.get("/api/protection/overcurrent-settings?run_id=r&case_id=c").status_code == 422
    )
