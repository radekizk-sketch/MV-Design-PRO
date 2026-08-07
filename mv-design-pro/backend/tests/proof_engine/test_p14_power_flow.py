"""
P14 Power Flow Proof Pack Tests.

Tests for convergence verification, P/Q balance, and voltage checks.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.packs.p14_power_flow import (
    P14PowerFlowInput,
    P14PowerFlowProof,
)
from application.proof_engine.types import ProofType
from network_model.solvers.power_flow_result import (
    PowerFlowBusResult,
    PowerFlowResultV1,
    PowerFlowSummary,
)


def _build_converged_input() -> P14PowerFlowInput:
    """Build test input for converged power flow."""
    return P14PowerFlowInput(
        project_name="Test Project",
        case_name="Test Case P14",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        converged=True,
        iterations_count=5,
        tolerance=1e-8,
        max_mismatch_pu=1e-10,
        p_gen_total_mw=100.0,
        p_load_total_mw=98.0,
        p_losses_total_mw=2.0,
        q_gen_total_mvar=30.0,
        q_load_total_mvar=28.5,
        q_losses_total_mvar=1.5,
        v_min_pu=0.95,
        v_max_pu=1.02,
        slack_p_mw=50.0,
        slack_q_mvar=15.0,
    )


def _build_non_converged_input() -> P14PowerFlowInput:
    """Build test input for non-converged power flow."""
    return P14PowerFlowInput(
        project_name="Test Project",
        case_name="Test Case P14 Non-Converged",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        converged=False,
        iterations_count=100,
        tolerance=1e-8,
        max_mismatch_pu=0.01,  # Still above tolerance
        p_gen_total_mw=100.0,
        p_load_total_mw=98.0,
        p_losses_total_mw=2.0,
        q_gen_total_mvar=30.0,
        q_load_total_mvar=28.5,
        q_losses_total_mvar=1.5,
        v_min_pu=0.85,  # Below typical range
        v_max_pu=1.15,  # Above typical range
        slack_p_mw=50.0,
        slack_q_mvar=15.0,
    )


def test_pf_registry_ids_exist() -> None:
    """Test that P14 equation IDs exist in registry."""
    assert EquationRegistry.get_equation("EQ_PF_001") is not None
    assert EquationRegistry.get_equation("EQ_PF_002") is not None
    assert EquationRegistry.get_equation("EQ_PF_003") is not None
    assert EquationRegistry.get_equation("EQ_PF_004") is not None


def test_pf_step_order_deterministic() -> None:
    """Test that P14 step order is deterministic."""
    assert EquationRegistry.get_pf_step_order() == [
        "EQ_PF_001",
        "EQ_PF_002",
        "EQ_PF_003",
        "EQ_PF_004",
    ]


def test_pf_equations_dict() -> None:
    """Test that P14 equations dictionary is populated."""
    pf_eqs = EquationRegistry.get_pf_equations()
    assert len(pf_eqs) == 4
    assert "EQ_PF_001" in pf_eqs
    assert "EQ_PF_002" in pf_eqs
    assert "EQ_PF_003" in pf_eqs
    assert "EQ_PF_004" in pf_eqs


def test_p14_proof_generation_converged() -> None:
    """Test P14 proof generation for converged case."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert proof is not None
    assert proof.proof_type == ProofType.LOAD_FLOW_VOLTAGE
    assert len(proof.steps) == 4


def test_p14_convergence_status() -> None:
    """Test convergence verification step."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    # Check convergence result
    assert "converged" in proof.summary.key_results
    assert proof.summary.key_results["converged"].value == 1.0


def test_p14_non_converged_warning() -> None:
    """Test that non-converged case generates warning."""
    data = _build_non_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert len(proof.summary.warnings) > 0
    # Intencja bez zmian (ostrzeżenie o braku zbieżności); tekst przepisany do
    # obecnego kanonu — komunikat trafia do POBIERANEGO dowodu, więc musi być
    # poprawną polszczyzną (karta PACK-ROZPLYW).
    assert any("zbieżności" in w.lower() for w in proof.summary.warnings)


def test_p14_p_balance_math() -> None:
    """Test P balance calculation."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    # P_gen = P_load + P_losses
    # 100 = 98 + 2
    p_losses = proof.summary.key_results["p_losses_mw"].value
    assert p_losses == pytest.approx(2.0)


def test_p14_q_balance_math() -> None:
    """Test Q balance calculation."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    # Q_gen = Q_load + Q_losses
    # 30 = 28.5 + 1.5
    q_losses = proof.summary.key_results["q_losses_mvar"].value
    assert q_losses == pytest.approx(1.5)


def test_p14_voltage_range_check() -> None:
    """Test voltage range verification."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert "v_min_pu" in proof.summary.key_results
    assert "v_max_pu" in proof.summary.key_results
    assert proof.summary.key_results["v_min_pu"].value == pytest.approx(0.95)
    assert proof.summary.key_results["v_max_pu"].value == pytest.approx(1.02)


def test_p14_voltage_warning_for_out_of_range() -> None:
    """Test that out-of-range voltages generate warning."""
    data = _build_non_converged_input()
    proof = P14PowerFlowProof.generate(data)

    # Should have voltage warning because v_min=0.85 < 0.9 and v_max=1.15 > 1.1
    voltage_warnings = [w for w in proof.summary.warnings if "napięcia" in w.lower()]
    assert len(voltage_warnings) > 0


def test_p14_units_pass() -> None:
    """Test that all unit checks pass."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert all(step.unit_check.passed for step in proof.steps)


def test_p14_json_determinism() -> None:
    """Test that JSON output is deterministic."""
    artifact_id = UUID("12345678-1234-5678-1234-567812345678")
    data = _build_converged_input()

    proof_a = P14PowerFlowProof.generate(data, artifact_id)
    proof_b = P14PowerFlowProof.generate(data, artifact_id)

    json_a = proof_a.to_dict()
    json_b = proof_b.to_dict()

    # Remove non-deterministic fields
    del json_a["document_id"]
    del json_a["created_at"]
    del json_b["document_id"]
    del json_b["created_at"]

    assert json_a == json_b


def test_p14_step_count() -> None:
    """Test that proof has correct number of steps."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    # 4 steps: convergence, P balance, Q balance, voltage check
    assert proof.summary.total_steps == 4


def test_p14_header_content() -> None:
    """Test that header contains correct information."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert proof.header.project_name == "Test Project"
    assert proof.header.case_name == "Test Case P14"
    assert proof.header.solver_version == "1.0.0-test"


def test_p14_overall_status_pass() -> None:
    """Test overall status for successful convergence."""
    data = _build_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert proof.summary.overall_status == "PASS"


def test_p14_overall_status_warn() -> None:
    """Test overall status for non-converged case."""
    data = _build_non_converged_input()
    proof = P14PowerFlowProof.generate(data)

    assert proof.summary.overall_status == "WARN"


# ---------------------------------------------------------------------------
# Karta PACK-ROZPLYW: wejście dowodu bez zegara i bez zapasów
# ---------------------------------------------------------------------------


def _wynik_rozplywu() -> PowerFlowResultV1:
    """Zamrożony wynik rozpływu: szyna wstrzykująca + szyna pobierająca."""
    return PowerFlowResultV1(
        result_version="1.0.0",
        converged=True,
        iterations_count=3,
        tolerance_used=1e-8,
        base_mva=100.0,
        slack_bus_id="bus-slack",
        bus_results=(
            PowerFlowBusResult(
                bus_id="bus-slack",
                v_pu=1.0,
                angle_deg=0.0,
                p_injected_mw=2.5,
                q_injected_mvar=0.8,
            ),
            PowerFlowBusResult(
                bus_id="bus-odbior",
                v_pu=0.98,
                angle_deg=-0.4,
                p_injected_mw=-2.0,
                q_injected_mvar=-0.6,
            ),
        ),
        branch_results=(),
        summary=PowerFlowSummary(
            total_losses_p_mw=0.5,
            total_losses_q_mvar=0.2,
            min_v_pu=0.98,
            max_v_pu=1.0,
            slack_p_mw=2.5,
            slack_q_mvar=0.8,
        ),
    )


def test_wejscie_z_wyniku_bierze_znacznik_z_przebiegu_a_nie_z_zegara() -> None:
    """Pin deklaracji „ZERO ZEGARA" z docstringu ``from_power_flow_result``.

    Znacznik czasu dowodu MUSI być tym, który podał przebieg — inaczej dwa
    pobrania tego samego biegu dałyby różne bajty pakietu.
    """
    znacznik = datetime(2026, 3, 4, 5, 6, 7)

    dane = P14PowerFlowInput.from_power_flow_result(
        _wynik_rozplywu(),
        project_name="Projekt",
        case_name="Przypadek",
        run_timestamp=znacznik,
        solver_version="load-flow-newton-raphson-v1",
        max_mismatch_pu=4e-11,
    )

    assert dane.run_timestamp == znacznik
    assert dane.solver_version == "load-flow-newton-raphson-v1"
    assert dane.max_mismatch_pu == pytest.approx(4e-11)


def test_wejscie_z_wyniku_nie_ma_ani_jednej_wartosci_domyslnej() -> None:
    """Pin deklaracji „każdy argument jest WYMAGANY" (zakaz cichego zapasu).

    Deklaracja bez strażnika jest groźniejsza niż defekt: gdyby któryś argument
    dostał wartość domyślną, dowód mógłby powstać z liczby, której nikt nie
    policzył — i nikt by tego nie zauważył.
    """
    import inspect

    podpis = inspect.signature(P14PowerFlowInput.from_power_flow_result)
    bez_domyslnej = {
        nazwa
        for nazwa, parametr in podpis.parameters.items()
        if parametr.default is inspect.Parameter.empty
    }
    assert bez_domyslnej == {
        "result",
        "project_name",
        "case_name",
        "run_timestamp",
        "solver_version",
        "max_mismatch_pu",
    }


def test_wejscie_z_wyniku_rozdziela_wstrzyk_od_poboru_po_znaku() -> None:
    """Sumy generacji/poboru pochodzą z wierszy wyniku, nie z ponownej fizyki."""
    dane = P14PowerFlowInput.from_power_flow_result(
        _wynik_rozplywu(),
        project_name="Projekt",
        case_name="Przypadek",
        run_timestamp=datetime(2026, 3, 4, 5, 6, 7),
        solver_version="load-flow-newton-raphson-v1",
        max_mismatch_pu=0.0,
    )

    assert dane.p_gen_total_mw == pytest.approx(2.5)
    assert dane.p_load_total_mw == pytest.approx(2.0)
    assert dane.q_gen_total_mvar == pytest.approx(0.8)
    assert dane.q_load_total_mvar == pytest.approx(0.6)
    assert dane.p_losses_total_mw == pytest.approx(0.5)


def test_identyfikatory_krokow_bez_oznaczen_roboczych_projektu() -> None:
    """Kroki dowodu trafiają do POBIERANEGO ``proof.json`` (CLAUDE.md reguła 8).

    Zakaz nazw roboczych obowiązuje eksporty, nie tylko interfejs — a ten dowód
    jest od karty PACK-ROZPLYW realnie pobierany przez projektanta.
    """
    import re

    proof = P14PowerFlowProof.generate(_build_converged_input())

    # `\b` nie odcina `P14_STEP_001` (podkreślenie jest znakiem słowa), więc
    # wzorzec guardu kodenamów przepuszczał oznaczenie robocze w identyfikatorze
    # kroku. Tu wzorzec jest szerszy — inaczej pin byłby fałszywą pewnością.
    wzorzec = re.compile(r"(?<![A-Za-z0-9])[pP](?!0(?![0-9]))\d+(?![0-9])")
    for krok in proof.steps:
        assert not wzorzec.search(krok.step_id), krok.step_id
    assert not wzorzec.search(proof.title_pl)
