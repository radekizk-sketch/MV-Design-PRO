from __future__ import annotations

import math
from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import (
    LoadFlowBusInput,
    LoadFlowElementInput,
    LoadFlowVoltageInput,
    ProofGenerator,
)
from application.proof_engine.types import LoadElementKind, ProofType


@pytest.fixture
def p32_input() -> LoadFlowVoltageInput:
    return LoadFlowVoltageInput(
        project_name="Test Project",
        case_name="Case P32",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        buses=[
            LoadFlowBusInput(
                bus_id="BUS_01",
                u_ll_kv=9.8,
                u_nom_kv=10.0,
                nazwa="Szyna SN testowa",
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
                nazwa="Linia SN testowa",
            )
        ],
    )


def test_p32_registry_step_order(p32_input: LoadFlowVoltageInput) -> None:
    proof = ProofGenerator.generate_load_flow_voltage_proof(p32_input)
    assert proof.proof_type == ProofType.LOAD_FLOW_VOLTAGE
    assert [step.equation.equation_id for step in proof.steps] == (
        EquationRegistry.get_lf_step_order()
    )


def test_p32_math_sanity(p32_input: LoadFlowVoltageInput) -> None:
    proof = ProofGenerator.generate_load_flow_voltage_proof(p32_input)
    results = {step.equation.equation_id: step.result.value for step in proof.steps}

    assert results["EQ_LF_001"] == pytest.approx(math.sqrt(1.0**2 + 0.5**2), rel=1e-4)
    assert results["EQ_LF_002"] == pytest.approx(0.0645, rel=1e-3)
    assert results["EQ_LF_003"] == pytest.approx(0.05, rel=1e-4)
    assert results["EQ_LF_004"] == pytest.approx(0.01, rel=1e-4)
    assert results["EQ_LF_005"] == pytest.approx(0.06, rel=1e-4)
    assert results["EQ_LF_006"] == pytest.approx(0.98, rel=1e-4)
    assert results["EQ_LF_007"] == pytest.approx(-2.0, rel=1e-4)


def test_p32_unit_checks_pass(p32_input: LoadFlowVoltageInput) -> None:
    proof = ProofGenerator.generate_load_flow_voltage_proof(p32_input)
    assert all(step.unit_check.passed for step in proof.steps)


def test_p32_not_computed_propagation() -> None:
    input_data = LoadFlowVoltageInput(
        project_name="Test Project",
        case_name="Case P32 Missing",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        buses=[
            LoadFlowBusInput(
                bus_id="BUS_01",
                u_ll_kv=None,
                u_nom_kv=None,
                nazwa="Szyna SN testowa",
            )
        ],
        elements=[
            LoadFlowElementInput(
                element_id="LINE_01",
                element_kind=LoadElementKind.LINE,
                from_bus_id="BUS_00",
                to_bus_id="BUS_01",
                r_ohm=None,
                x_ohm=0.2,
                p_mw=None,
                q_mvar=0.5,
                u_nom_kv=None,
                u_ll_kv=None,
                nazwa="Linia SN testowa",
            )
        ],
    )

    proof = ProofGenerator.generate_load_flow_voltage_proof(input_data)

    assert proof.summary.warnings == (
        "element „Linia SN testowa”: nie obliczono — brak danych: moc czynna P, rezystancja R "
        "gałęzi, napięcie międzyprzewodowe U z rozpływu mocy, napięcie znamionowe Un.",
        "szyna „Szyna SN testowa”: nie obliczono — brak danych: napięcie międzyprzewodowe U z "
        "rozpływu mocy, napięcie znamionowe Un.",
    )
    status = proof.summary.key_results["computed_status"]
    assert (status.value, status.formatted) == ("NOT COMPUTED", "nie obliczono — brak danych")
    for warning in proof.summary.warnings:
        assert "u_ll_kv" not in warning and "u_nom_kv" not in warning, warning
        assert "NOT COMPUTED" not in warning and "missing_data" not in warning, warning


def test_p32_json_determinism(p32_input: LoadFlowVoltageInput) -> None:
    artifact_id = UUID("11111111-1111-1111-1111-111111111111")
    proof_a = ProofGenerator.generate_load_flow_voltage_proof(p32_input, artifact_id)
    proof_b = ProofGenerator.generate_load_flow_voltage_proof(p32_input, artifact_id)

    json_a = proof_a.to_dict()
    json_b = proof_b.to_dict()

    for payload in (json_a, json_b):
        del payload["document_id"]
        del payload["created_at"]

    assert json_a == json_b


def test_ostrzezenie_braku_nazywa_wielkosci_i_miejsce() -> None:
    """Każdy kod braku, który dowód spadku napięcia może zgłosić (szyna i element), ma nazwę
    wielkości — ostrzeżenie nie niesie kodu pola wejścia."""
    import ast
    import inspect
    import textwrap

    from application.proof_engine.proof_generator import NAZWY_WEJSC_DOWODU_LF_PL

    kody: set[str] = set()
    for funkcja in (
        ProofGenerator._missing_lf_bus_inputs,
        ProofGenerator._missing_lf_element_inputs,
    ):
        for wezel in ast.walk(ast.parse(textwrap.dedent(inspect.getsource(funkcja)))):
            if (
                isinstance(wezel, ast.Call)
                and isinstance(wezel.func, ast.Attribute)
                and wezel.func.attr == "append"
                and isinstance(wezel.args[0], ast.Constant)
            ):
                kody.add(wezel.args[0].value)
    assert kody == set(NAZWY_WEJSC_DOWODU_LF_PL)


def test_status_obliczen_dowodu_ma_tekst_dla_projektanta() -> None:
    """Każdy status obliczeń, który generator może nadać (stałe ``computed_status = "…"``
    w całym module), ma tekst wyniku; wartość maszynowa zostaje w ``value``."""
    import ast
    import inspect

    import application.proof_engine.proof_generator as modul
    from application.proof_engine.proof_generator import STATUSY_OBLICZEN_DOWODU_PL

    statusy: set[str] = set()
    for wezel in ast.walk(ast.parse(inspect.getsource(modul))):
        if isinstance(wezel, ast.Assign) and any(
            isinstance(c, ast.Name) and c.id == "computed_status" for c in wezel.targets
        ):
            for stala in ast.walk(wezel.value):
                if isinstance(stala, ast.Constant) and isinstance(stala.value, str):
                    statusy.add(stala.value)
    assert statusy == set(STATUSY_OBLICZEN_DOWODU_PL)
    for tekst in STATUSY_OBLICZEN_DOWODU_PL.values():
        assert tekst and tekst[0].islower() and "COMPUTED" not in tekst
