from __future__ import annotations

from datetime import datetime

import pytest
from analysis.lf_sensitivity.builder import LFSensitivityBuilder
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)
from application.proof_engine.proof_generator import (
    LoadFlowBusInput,
    LoadFlowElementInput,
    LoadFlowVoltageInput,
    ProofGenerator,
)
from application.proof_engine.types import LoadElementKind, ProofDocument


def _build_p32_proof() -> ProofDocument:
    input_data = LoadFlowVoltageInput(
        project_name="Test Project",
        case_name="Case P32",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        buses=[
            LoadFlowBusInput(
                bus_id="BUS_01",
                u_ll_kv=9.8,
                u_nom_kv=10.0,
            )
        ],
        elements=[
            LoadFlowElementInput(
                element_id="LINE_01",
                element_kind=LoadElementKind.LINE,
                from_bus_id="BUS_00",
                to_bus_id="BUS_01",
                r_ohm=0.5,
                x_ohm=0.2,
                p_mw=1.0,
                q_mvar=0.5,
                u_nom_kv=10.0,
                u_ll_kv=10.0,
            )
        ],
    )
    return ProofGenerator.generate_load_flow_voltage_proof(input_data)


def _build_voltage_profile(u_nom_kv: float | None) -> VoltageProfileView:
    rows = (
        VoltageProfileRow(
            bus_id="BUS_01",
            bus_name=None,
            u_nom_kv=u_nom_kv,
            u_kv=9.8,
            u_pu=0.98,
            delta_pct=-2.0,
            status=VoltageProfileStatus.PASS,
            p_mw=1.0,
            q_mvar=0.5,
            case_name="Case P32",
            run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        ),
    )
    summary = VoltageProfileSummary(
        worst_bus_id="BUS_01",
        worst_delta_pct_abs=2.0,
        pass_count=1,
        warning_count=0,
        fail_count=0,
        not_computed_count=0,
    )
    context = VoltageProfileContext(
        project_name="Test Project",
        case_name="Case P32",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        snapshot_id=None,
        trace_id=None,
    )
    return VoltageProfileView(
        context=context,
        thresholds={"voltage_warn_pct": 5.0, "voltage_fail_pct": 10.0},
        rows=rows,
        summary=summary,
    )


def test_p33_determinism_to_dict() -> None:
    builder = LFSensitivityBuilder()
    proof = _build_p32_proof()
    view_a = builder.build(proof, _build_voltage_profile(10.0), None)
    view_b = builder.build(proof, _build_voltage_profile(10.0), None)

    assert view_a.to_dict() == view_b.to_dict()


def test_p33_ranking_stability() -> None:
    builder = LFSensitivityBuilder()
    proof = _build_p32_proof()
    view = builder.build(proof, _build_voltage_profile(10.0), None)

    assert view.top_drivers
    assert view.top_drivers[0].parameter == "U_n"
    assert view.top_drivers[0].perturbation == "-5.0%"


def test_p33_driver_math_sanity() -> None:
    builder = LFSensitivityBuilder()
    proof = _build_p32_proof()
    view = builder.build(proof, _build_voltage_profile(10.0), None)

    entry = view.entries[0]
    driver = next(
        item
        for item in entry.drivers
        if item.parameter == "P_LINE_01" and item.perturbation == "+5.0%"
    )

    assert driver.delta_delta_pct == pytest.approx(0.025, rel=1e-3)


def test_p33_not_computed_propagation() -> None:
    builder = LFSensitivityBuilder()
    proof = _build_p32_proof()
    view = builder.build(proof, _build_voltage_profile(None), None)

    entry = view.entries[0]
    assert entry.missing_data
    assert not entry.drivers
    assert view.summary.not_computed_count == 1
