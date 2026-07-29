"""Testy końcówki API werdyktu stabilności SSCI (faza 1 — ekspozycja backendowa).

Domyka OSTATNIĄ lukę inwentarza: analiza ``ssci_stability`` (kryterium
impedancyjne Nyquista, Sun 2011 / Wen 2016) istniała bez punktu wejścia. Końcówka
``GET /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability`` wystawia
werdykt na bazie GOTOWEGO przebiegu V12.6 ``ssci_impedance``.

Kontrakt: gotowy przebieg → widok werdyktu (metryki + flagi + White Box);
determinizm (dwa wywołania identyczne); 404 (brak przebiegu); 409 (rodzaj przebiegu
V12.6 inny niż ``ssci_impedance``); uczciwy stan zerowy (brak przekształtnika/DER
→ werdykt „brak danych", bez fabrykacji). Payloady liczy REALNY solver D-03 (karta
referencyjna Huawei), a ścieżka HTTP GET jest wykonywana natywnie.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from analysis.ssci_stability import (
    VERDICT_NO_DATA,
    VERDICT_RISK,
    VERDICT_STABLE,
    VERDICT_UNSTABLE,
)
from application.v126_artifacts import build_v126_proof_artifact, build_v126_report_artifact
from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126ConverterInput,
)

STABILITY = "/api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability"
_HUAWEI_CARD_ID = "conv-pv-card-huawei-sun2000-215ktl"


@pytest.fixture(autouse=True)
def _reset_v126_runs() -> None:
    from api import v126_academic

    v126_academic._runs.clear()
    yield
    v126_academic._runs.clear()


def _reference_card():
    repo = get_default_mv_catalog()
    by_id = {c.id: c for c in repo.list_converter_types()}
    return by_id[_HUAWEI_CARD_ID]


def _converter_from_card(card) -> V126ConverterInput:
    return V126ConverterInput(
        ref="INV1",
        bus_ref="CONV",
        mode="GFL",
        rated_mva=card.sn_mva,
        rated_kv=card.un_kv,
        current_loop_bandwidth_hz=card.current_loop_bandwidth_hz,
        voltage_loop_bandwidth_hz=card.voltage_loop_bandwidth_hz,
        pll_bandwidth_hz=card.pll_bandwidth_hz,
        control_delay_ms=card.control_delay_ms,
        filter_l_pu=card.filter_l_pu,
        filter_r_pu=card.filter_r_pu,
        p_mw=0.2,
        q_mvar=0.0,
    )


def _model(card, *, scr: float, with_converter: bool = True) -> V126AcademicInput:
    fault_level_mva = scr * card.sn_mva
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref="PCC", name="PCC", nominal_kv=card.un_kv, fault_level_mva=fault_level_mva
            ),
            V126BusInput(ref="CONV", name="Konwerter", nominal_kv=card.un_kv),
        ],
        branches=[
            V126BranchInput(
                ref="L1",
                from_bus_ref="PCC",
                to_bus_ref="CONV",
                kind="cable",
                length_km=0.05,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.08,
            )
        ],
        converters=[_converter_from_card(card)] if with_converter else [],
    )


def _seed_run(
    model: V126AcademicInput,
    analysis_type: V126AnalysisType = V126AnalysisType.SSCI_IMPEDANCE,
) -> UUID:
    """Zapisz przebieg V12.6 wiernie jak ``run_v126_analysis`` (realny solver).

    Odtwarza dokładnie kształt rekordu utrwalanego przez końcówkę POST
    (``result``/``input``/``proof``/``report``); numery pochodzą z REALNEGO solvera,
    nie są fabrykowane. Końcówka GET pod testem jest wykonywana natywnie przez
    ``app_client``.
    """
    from api import v126_academic

    result = V126AcademicSolver().run(analysis_type, model)
    run_id = UUID(hex=result["deterministic_hash"][:32])
    run_record: dict[str, Any] = {
        "run_id": str(run_id),
        "case_id": "c-ssci",
        "analysis_type": analysis_type.value,
        "status": "FINISHED",
        "created_at": datetime.now(UTC).isoformat(),
        "input": model.model_dump(mode="json"),
        "result": result,
        "deterministic_hash": result["deterministic_hash"],
    }
    proof = build_v126_proof_artifact(run_record)
    run_record["proof"] = proof
    run_record["report"] = build_v126_report_artifact(run_record, proof)
    v126_academic._runs[str(run_id)] = run_record
    return run_id


# ---------------------------------------------------------------------------
# Werdykt na realnym przebiegu
# ---------------------------------------------------------------------------


def test_stability_weak_grid_flags_ssci_risk(app_client) -> None:
    card = _reference_card()
    run_id = _seed_run(_model(card, scr=1.5))
    resp = app_client.get(STABILITY.format(run_id=run_id))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    verdict = body["verdict"]
    assert verdict["verdict"] in (VERDICT_RISK, VERDICT_UNSTABLE), verdict["verdict"]
    assert verdict["is_risk"] is True
    assert verdict["has_magnitude_crossover"] is True
    assert verdict["offending_frequency_hz"] is not None
    # White Box audytowalny (Wzór→Dane→Podstawienie→Wynik→Jednostka).
    assert verdict["white_box"]
    for step in verdict["white_box"]:
        assert step["formula_latex"] and step["result_pl"] and step["unit_check_pl"]
    # Proweniencja z odtworzonej karty falownika (jakość pól ESTIMATED/DATASHEET).
    assert verdict["provenance"] is not None
    assert body["analysis_id"]


def test_stability_strong_grid_is_stable(app_client) -> None:
    card = _reference_card()
    run_id = _seed_run(_model(card, scr=50.0))
    resp = app_client.get(STABILITY.format(run_id=run_id))
    assert resp.status_code == 200, resp.text
    verdict = resp.json()["verdict"]
    assert verdict["verdict"] == VERDICT_STABLE, verdict["verdict"]
    assert verdict["is_risk"] is False
    assert verdict["has_magnitude_crossover"] is False
    assert verdict["offending_frequency_hz"] is None


def test_stability_endpoint_is_deterministic(app_client) -> None:
    card = _reference_card()
    run_id = _seed_run(_model(card, scr=1.5))
    first = app_client.get(STABILITY.format(run_id=run_id)).json()
    second = app_client.get(STABILITY.format(run_id=run_id)).json()
    assert first == second


def test_stability_no_converter_is_honest_no_data(app_client) -> None:
    """Brak przekształtnika/DER → solver „dane niekompletne" → werdykt „brak danych"
    z jawnym ``missing_data`` (ZERO fabrykacji), zwrócony 200."""
    card = _reference_card()
    run_id = _seed_run(_model(card, scr=1.5, with_converter=False))
    resp = app_client.get(STABILITY.format(run_id=run_id))
    assert resp.status_code == 200, resp.text
    verdict = resp.json()["verdict"]
    assert verdict["verdict"] == VERDICT_NO_DATA
    assert verdict["is_risk"] is False
    assert verdict["missing_data"]
    assert verdict["max_minor_loop_gain"] is None


# ---------------------------------------------------------------------------
# Błędy: 404 / 409
# ---------------------------------------------------------------------------


def test_stability_unknown_run_returns_404(app_client) -> None:
    resp = app_client.get(STABILITY.format(run_id=uuid4()))
    assert resp.status_code == 404, resp.text


def test_stability_wrong_v126_analysis_type_returns_409(app_client) -> None:
    """Przebieg V12.6 innego rodzaju (voltage_stability) → 409 (spójne z rodziną v126)."""
    card = _reference_card()
    run_id = _seed_run(_model(card, scr=1.5), analysis_type=V126AnalysisType.VOLTAGE_STABILITY)
    resp = app_client.get(STABILITY.format(run_id=run_id))
    assert resp.status_code == 409, resp.text
