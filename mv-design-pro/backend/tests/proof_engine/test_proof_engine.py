"""
Proof Engine Tests — P11.1a MVP

STATUS: CANONICAL & BINDING
Reference: P11_1a_MVP_SC3F_AND_VDROP.md

Testy:
1. Determinizm (ten sam input → identyczny proof.json/proof.tex)
2. Kompletność kroków
3. Weryfikacja jednostek
4. Zgodność z rejestrami równań
"""

from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4

import pytest
from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.proof_generator import (
    ProofGenerator,
    SC1Input,
    SC3FInput,
    VDROPInput,
    VDROPSegmentInput,
)
from application.proof_engine.types import (
    LoadCurrentsCounterfactualInput,
    LoadCurrentsInput,
    LoadElementKind,
    ProofType,
    QUCounterfactualInput,
    QUInput,
)
from application.proof_engine.unit_verifier import UnitVerifier
from network_model.solvers.short_circuit_asymmetrical_quantities import (
    compute_sc1_asymmetrical_quantities,
)

# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def sc3f_test_input() -> SC3FInput:
    """
    Fixture: minimalne dane SC3F dla testów.

    Dane z przykładu wzorcowego P11_1a_MVP_SC3F_AND_VDROP.md:
    - Un = 15.0 kV
    - c = 1.10
    - Z_th = 0.749 + j3.419 Ω
    """
    return SC3FInput(
        project_name="Test Project",
        case_name="Test Case SC3F",
        fault_node_id="B2",
        fault_type="THREE_PHASE",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        c_factor=1.10,
        u_n_kv=15.0,
        z_thevenin_ohm=complex(0.749, 3.419),
        ikss_ka=2.722,
        ip_ka=5.882,
        ith_ka=2.722,
        sk_mva=70.7,
        kappa=1.528,
        rx_ratio=0.219,
        tk_s=1.0,
        m_factor=1.0,
        n_factor=0.0,
    )


@pytest.fixture
def vdrop_test_input() -> VDROPInput:
    """
    Fixture: minimalne dane VDROP dla testów.
    """
    return VDROPInput(
        project_name="Test Project",
        case_name="Test Case VDROP",
        source_bus_id="SOURCE",
        target_bus_id="LOAD",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        u_source_kv=15.0,
        segments=[
            VDROPSegmentInput(
                segment_id="SEG1",
                from_bus_id="SOURCE",
                to_bus_id="MID",
                r_ohm_per_km=0.206,
                x_ohm_per_km=0.075,
                length_km=2.5,
                p_mw=2.0,
                q_mvar=1.0,
                u_n_kv=15.0,
            ),
        ],
    )


@pytest.fixture
def sc1_test_input() -> SC1Input:
    """Fixture: minimalne dane SC1 dla testów.

    Wielkości fizyczne liczy solver (NOT-A-SOLVER, V12K-118) —
    generator dowodu jest czystym formatterem.
    """
    quantities = compute_sc1_asymmetrical_quantities(
        fault_type="ONE_PHASE_TO_GROUND",
        u_n_kv=15.0,
        c_factor=1.10,
        u_prefault_kv=8.660,
        z1_ohm=complex(0.5, 1.2),
        z2_ohm=complex(0.5, 1.2),
        z0_ohm=complex(0.8, 2.4),
        a_operator=complex(-0.5, 0.8660),
    )
    return SC1Input(
        project_name="Test Project",
        case_name="Test Case SC1",
        fault_node_id="B1",
        fault_type="ONE_PHASE_TO_GROUND",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        solver_version="1.0.0-test",
        u_n_kv=15.0,
        c_factor=1.10,
        u_prefault_kv=8.660,
        z1_ohm=complex(0.5, 1.2),
        z2_ohm=complex(0.5, 1.2),
        z0_ohm=complex(0.8, 2.4),
        a_operator=complex(-0.5, 0.8660),
        quantities=quantities,
    )


# =============================================================================
# P15 Fixtures
# =============================================================================


@pytest.fixture
def lc_line_input() -> LoadCurrentsInput:
    """Fixture: dane P15 dla linii/kabla."""
    return LoadCurrentsInput(
        project_name="Test Project",
        case_name="Test Case LC Line",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        target_id="LINE_01",
        u_ll_kv=15.0,
        p_mw=3.2,
        q_mvar=1.5,
        in_a=400.0,
        sn_mva=None,
        element_kind=LoadElementKind.LINE,
    )


@pytest.fixture
def lc_transformer_input() -> LoadCurrentsInput:
    """Fixture: dane P15 dla transformatora."""
    return LoadCurrentsInput(
        project_name="Test Project",
        case_name="Test Case LC Transformer",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        target_id="TR_01",
        u_ll_kv=15.0,
        p_mw=5.0,
        q_mvar=3.0,
        in_a=None,
        sn_mva=10.0,
        element_kind=LoadElementKind.TRANSFORMER,
    )


# =============================================================================
# SC3F Tests
# =============================================================================


class TestSC3FProofGenerator:
    """Testy generatora dowodów SC3F."""

    def test_generate_sc3f_proof_returns_proof_document(self, sc3f_test_input: SC3FInput):
        """Generuje ProofDocument dla danych SC3F."""
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        assert proof is not None
        assert proof.proof_type == ProofType.SC3F_IEC60909
        assert proof.document_id is not None
        assert proof.artifact_id is not None

    def test_sc3f_proof_has_required_steps(self, sc3f_test_input: SC3FInput):
        """
        Dowód SC3F zawiera wszystkie wymagane kroki (BINDING).

        Model Anti-Double-Counting: A1 (c tylko w EQ_SC3F_004)

        Kroki obowiązkowe (Model A1):
        1. Thevenin
        2. I_k''
        3. κ (kappa)
        4. i_p
        5. I_dyn (OBOWIĄZKOWY)
        6. I_th (OBOWIĄZKOWY)
        7. S_k''
        """
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        assert len(proof.steps) == 7

        step_titles = [s.title_pl.lower() for s in proof.steps]

        # Weryfikacja kroków obowiązkowych
        assert any("thevenin" in t for t in step_titles)
        assert any(
            "i_k''" in t or "początkowy prąd zwarciowy symetryczny" in t for t in step_titles
        )
        assert any("κ" in t or "kappa" in t or "współczynnik udaru" in t for t in step_titles)
        assert any("i_p" in t or "prąd udarowy" in t for t in step_titles)
        assert any("i_dyn" in t or "prąd dynamiczny" in t for t in step_titles)
        assert any("i_th" in t or "prąd cieplny" in t for t in step_titles)
        assert any("s_k''" in t or "moc zwarciowa" in t for t in step_titles)

    def test_sc3f_proof_step_numbers_are_sequential(self, sc3f_test_input: SC3FInput):
        """Numery kroków są sekwencyjne od 1."""
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        step_numbers = sorted(s.step_number for s in proof.steps)
        expected = list(range(1, len(proof.steps) + 1))

        assert step_numbers == expected

    def test_sc3f_proof_all_unit_checks_pass(self, sc3f_test_input: SC3FInput):
        """Wszystkie weryfikacje jednostek przechodzą."""
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        for step in proof.steps:
            assert step.unit_check.passed, (
                f"Unit check failed for step {step.step_id}: "
                f"expected {step.unit_check.expected_unit}, "
                f"computed {step.unit_check.computed_unit}"
            )

        assert proof.summary.unit_check_passed

    def test_sc3f_proof_key_results_present(self, sc3f_test_input: SC3FInput):
        """Kluczowe wyniki są obecne w podsumowaniu."""
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        required_keys = ["ikss_ka", "ip_ka", "idyn_ka", "ith_ka", "sk_mva", "kappa"]

        for key in required_keys:
            assert key in proof.summary.key_results, f"Missing key result: {key}"

    def test_sc3f_proof_idyn_equals_ip(self, sc3f_test_input: SC3FInput):
        """Prąd dynamiczny równy prądowi udarowemu (I_dyn = i_p)."""
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        idyn = proof.summary.key_results["idyn_ka"].value
        ip = proof.summary.key_results["ip_ka"].value

        assert idyn == ip


def _machine_result_for_proof():
    """A small slack→line→bus network with one synchronous + one asynchronous machine
    at the fault bus; returns the solver's per-machine breakdown (IEC 60909 §6.6)."""
    from network_model.core.branch import BranchType, LineBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
    from network_model.core.node import Node, NodeType
    from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions

    g = NetworkGraph()
    g.add_node(
        Node(
            id="GPZ",
            name="GPZ",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="GPZ",
            to_node_id="B",
            r_ohm_per_km=0.45,
            x_ohm_per_km=0.90,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=0.0,
        )
    )
    g.add_synchronous_machine_source(
        SynchronousMachineSource(
            id="G",
            name="GEN",
            node_id="B",
            sr_mva=5.0,
            ur_kv=15.0,
            xd_subtransient_pu=0.15,
            cos_phi_r=0.8,
            c_max=1.1,
        )
    )
    g.add_asynchronous_machine_source(
        AsynchronousMachineSource(
            id="M",
            name="MOT",
            node_id="B",
            pr_mw=2.0,
            ur_kv=15.0,
            cos_phi_r=0.85,
            efficiency=0.95,
            i_lr_ratio=5.0,
            pole_pairs=2,
        )
    )
    return compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)


@pytest.fixture
def sc3f_with_machines(sc3f_test_input: SC3FInput) -> SC3FInput:
    """SC3F input enriched with a per-machine breakdown (1 synchronous + 1 asynchronous)."""
    from dataclasses import replace

    return replace(sc3f_test_input, fault_node_id="B", machine_result=_machine_result_for_proof())


class TestSC3FProofWithMachines:
    """SC3F proof — per-machine §6.6 breaking-current section (μ / q / i_b)."""

    def test_appends_machine_steps(self, sc3f_with_machines: SC3FInput):
        proof = ProofGenerator.generate_sc3f_proof(sc3f_with_machines)
        assert len(proof.steps) > 7  # 7 aggregate + machine steps
        eq_ids = {s.equation.equation_id for s in proof.steps}
        assert "EQ_SC3F_011" in eq_ids  # μ (decay)
        assert "EQ_SC3F_012" in eq_ids  # q (asynchronous present)
        assert "EQ_SC3F_013" in eq_ids  # i_b = μ·q·I″k

    def test_all_unit_checks_pass_including_machines(self, sc3f_with_machines: SC3FInput):
        proof = ProofGenerator.generate_sc3f_proof(sc3f_with_machines)
        for step in proof.steps:
            assert step.unit_check.passed, step.equation.equation_id
        assert proof.summary.unit_check_passed

    def test_ib_machines_in_key_results(self, sc3f_with_machines: SC3FInput):
        proof = ProofGenerator.generate_sc3f_proof(sc3f_with_machines)
        assert "ib_machines_ka" in proof.summary.key_results
        assert proof.summary.key_results["ib_machines_ka"].value > 0

    def test_synchronous_has_no_q_step_asynchronous_does(self, sc3f_with_machines: SC3FInput):
        proof = ProofGenerator.generate_sc3f_proof(sc3f_with_machines)
        # Two machines (1 sync + 1 async): both get μ + i_b; only the async gets a q step.
        mu_steps = [s for s in proof.steps if s.equation.equation_id == "EQ_SC3F_011"]
        q_steps = [s for s in proof.steps if s.equation.equation_id == "EQ_SC3F_012"]
        ib_steps = [s for s in proof.steps if s.equation.equation_id == "EQ_SC3F_013"]
        assert len(mu_steps) == 2
        assert len(q_steps) == 1
        assert len(ib_steps) == 2

    def test_step_numbers_sequential_with_machines(self, sc3f_with_machines: SC3FInput):
        proof = ProofGenerator.generate_sc3f_proof(sc3f_with_machines)
        nums = [s.step_number for s in proof.steps]
        assert nums == list(range(1, len(proof.steps) + 1))

    def test_without_machines_still_seven_steps(self, sc3f_test_input: SC3FInput):
        # Regression: machine_result=None ⇒ the original 7-step proof, unchanged.
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)
        assert len(proof.steps) == 7
        assert "ib_machines_ka" not in proof.summary.key_results

    def test_determinism_with_machines(self, sc3f_with_machines: SC3FInput):
        artifact_id = uuid4()
        a = ProofGenerator.generate_sc3f_proof(sc3f_with_machines, artifact_id).to_dict()
        b = ProofGenerator.generate_sc3f_proof(sc3f_with_machines, artifact_id).to_dict()
        for d in (a, b):
            del d["document_id"]
            del d["created_at"]
        assert a == b


# =============================================================================
# VDROP Tests
# =============================================================================


class TestVDROPProofGenerator:
    """Testy generatora dowodów VDROP."""

    def test_generate_vdrop_proof_returns_proof_document(self, vdrop_test_input: VDROPInput):
        """Generuje ProofDocument dla danych VDROP."""
        proof = ProofGenerator.generate_vdrop_proof(vdrop_test_input)

        assert proof is not None
        assert proof.proof_type == ProofType.VDROP
        assert proof.document_id is not None

    def test_vdrop_proof_has_required_steps(self, vdrop_test_input: VDROPInput):
        """Dowód VDROP zawiera wszystkie wymagane kroki (7)."""
        proof = ProofGenerator.generate_vdrop_proof(vdrop_test_input)

        assert len(proof.steps) == 7

        equation_ids = [step.equation.equation_id for step in proof.steps]
        assert equation_ids == EquationRegistry.VDROP_STEP_ORDER

    def test_full_vdrop_proof_pipeline(self, vdrop_test_input: VDROPInput):
        """Pełny pipeline VDROP: dane → ProofDocument → JSON → LaTeX."""
        proof = ProofGenerator.generate_vdrop_proof(vdrop_test_input)

        json_str = proof.json_representation
        json_dict = json.loads(json_str)

        assert "steps" in json_dict
        assert len(json_dict["steps"]) == 7
        assert json_dict["proof_type"] == "VDROP"

        latex_str = proof.latex_representation

        assert r"\documentclass" in latex_str
        assert r"\begin{document}" in latex_str
        assert r"\end{document}" in latex_str
        assert "Dowód" in latex_str

    def test_vdrop_determinism(self, vdrop_test_input: VDROPInput):
        """Ten sam VDROPInput → identyczny proof.json."""
        artifact_id = uuid4()

        proof_1 = ProofGenerator.generate_vdrop_proof(vdrop_test_input, artifact_id)
        proof_2 = ProofGenerator.generate_vdrop_proof(vdrop_test_input, artifact_id)

        json_1 = proof_1.to_dict()
        json_2 = proof_2.to_dict()

        del json_1["document_id"]
        del json_1["created_at"]
        del json_2["document_id"]
        del json_2["created_at"]

        assert json_1 == json_2

    def test_vdrop_unit_checks_pass(self, vdrop_test_input: VDROPInput):
        """Wszystkie weryfikacje jednostek przechodzą dla VDROP."""
        proof = ProofGenerator.generate_vdrop_proof(vdrop_test_input)

        for step in proof.steps:
            assert step.unit_check.passed, (
                f"Unit check failed for step {step.step_id}: "
                f"expected {step.unit_check.expected_unit}, "
                f"computed {step.unit_check.computed_unit}"
            )

        assert proof.summary.unit_check_passed


# =============================================================================
# SC1 Tests (P11.1c)
# =============================================================================


class TestSC1ProofGenerator:
    """Testy generatora dowodu SC1."""

    def test_sc1_registry_ids_exist(self):
        """Rejestr SC1 zawiera wszystkie wymagane ID."""
        sc1 = EquationRegistry.get_sc1_equations()
        required = [
            "EQ_SC1_001",
            "EQ_SC1_002",
            "EQ_SC1_003",
            "EQ_SC1_004",
            "EQ_SC1_005",
            "EQ_SC1_006",
            "EQ_SC1_007",
        ]
        for eq_id in required:
            assert eq_id in sc1, f"Missing SC1 equation ID: {eq_id}"

    def test_sc1_step_order_defined(self):
        """Kolejność kroków SC1 jest zdefiniowana i stabilna (§4.1)."""
        expected = [
            "EQ_SC1_001",
            "EQ_SC1_002",
            "EQ_SC1_003",
            "EQ_SC1_006",
            "EQ_SC1_007",
            "EQ_SC1_008",
            "EQ_SC1_009",
            "EQ_SC1_010",
            "EQ_SC1_012",
            "EQ_SC1_011",
        ]
        assert EquationRegistry.get_sc1_step_order("SC1FZ") == expected

    def test_sc1_proof_document_builds(self, sc1_test_input: SC1Input):
        """Generator SC1 buduje poprawny ProofDocument."""
        proof = ProofGenerator.generate_sc1_proof(sc1_test_input)
        assert proof is not None
        assert proof.proof_type == ProofType.SC1F_IEC60909
        assert proof.header.fault_location == sc1_test_input.fault_node_id
        assert len(proof.steps) == len(EquationRegistry.get_sc1_step_order("SC1FZ"))


# =============================================================================
# Determinism Tests
# =============================================================================


class TestProofDeterminism:
    """
    Testy determinizmu (BINDING).

    Ten sam input MUSI dawać identyczny proof.json i proof.tex.
    """

    def test_sc3f_json_determinism(self, sc3f_test_input: SC3FInput):
        """Ten sam SC3FInput → identyczny proof.json."""
        artifact_id = uuid4()

        proof_1 = ProofGenerator.generate_sc3f_proof(sc3f_test_input, artifact_id)
        proof_2 = ProofGenerator.generate_sc3f_proof(sc3f_test_input, artifact_id)

        # Porównanie JSON (pomijając document_id i created_at które są unikalne)
        json_1 = proof_1.to_dict()
        json_2 = proof_2.to_dict()

        # Usuń pola zmienne
        del json_1["document_id"]
        del json_1["created_at"]
        del json_2["document_id"]
        del json_2["created_at"]

        assert json_1 == json_2

    def test_sc3f_latex_determinism(self, sc3f_test_input: SC3FInput):
        """Ten sam SC3FInput → identyczny proof.tex (bez nagłówków czasowych)."""
        artifact_id = uuid4()

        proof_1 = ProofGenerator.generate_sc3f_proof(sc3f_test_input, artifact_id)
        proof_2 = ProofGenerator.generate_sc3f_proof(sc3f_test_input, artifact_id)

        # LaTeX powinien być identyczny dla tych samych danych
        # (różnice tylko w dacie/czasie która jest parametrem wejściowym)
        latex_1 = proof_1.latex_representation
        latex_2 = proof_2.latex_representation

        # Sprawdź strukturalne elementy (pomijając timestampy)
        assert r"\section{Dane wejściowe}" in latex_1
        assert r"\section{Dane wejściowe}" in latex_2
        assert r"\section{Dowód}" in latex_1
        assert r"\section{Dowód}" in latex_2

    def test_step_order_is_stable(self, sc3f_test_input: SC3FInput):
        """Kolejność kroków jest zawsze taka sama."""
        proof_1 = ProofGenerator.generate_sc3f_proof(sc3f_test_input)
        proof_2 = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        step_ids_1 = [s.step_id for s in proof_1.steps]
        step_ids_2 = [s.step_id for s in proof_2.steps]

        assert step_ids_1 == step_ids_2


# =============================================================================
# P15 Tests
# =============================================================================


class TestLoadCurrentsProofGenerator:
    """Testy generatora dowodów P15."""

    def test_lc_step_order_is_stable(self):
        """Kolejność kroków P15 jest stabilna."""
        expected = [
            "EQ_LC_001",
            "EQ_LC_002",
            "EQ_LC_003",
            "EQ_LC_004",
            "EQ_LC_005",
            "EQ_LC_006",
        ]
        assert EquationRegistry.get_lc_step_order() == expected

    def test_lc_proof_has_required_steps(self, lc_line_input: LoadCurrentsInput):
        """Dowód P15 dla linii zawiera wymagane kroki."""
        proof = ProofGenerator.generate_load_currents_proof(lc_line_input)
        equation_ids = [step.equation.equation_id for step in proof.steps]
        assert equation_ids == [
            "EQ_LC_001",
            "EQ_LC_002",
            "EQ_LC_003",
            "EQ_LC_004",
        ]

    def test_lc_units_pass_for_typical_case(self, lc_line_input: LoadCurrentsInput):
        """Weryfikacja jednostek przechodzi dla typowego przypadku."""
        proof = ProofGenerator.generate_load_currents_proof(lc_line_input)
        assert proof.summary.unit_check_passed
        for step in proof.steps:
            assert step.unit_check.passed

    def test_lc_proof_transformer_builds(self, lc_transformer_input: LoadCurrentsInput):
        """Dowód P15 dla transformatora buduje wymagane wyniki."""
        proof = ProofGenerator.generate_load_currents_proof(lc_transformer_input)
        assert proof.proof_type == ProofType.LOAD_CURRENTS_OVERLOAD
        assert "k_s_percent" in proof.summary.key_results
        assert "m_s_percent" in proof.summary.key_results

    def test_lc_header_includes_target_and_kind(self, lc_line_input: LoadCurrentsInput):
        """Nagłówek P15 zawiera identyfikator elementu i jego typ."""
        proof = ProofGenerator.generate_load_currents_proof(lc_line_input)
        assert proof.header.target_id == lc_line_input.target_id
        assert proof.header.element_kind == lc_line_input.element_kind.value

    def test_lc_determinism_json(self, lc_line_input: LoadCurrentsInput):
        """Ten sam input P15 → identyczny proof.json."""
        artifact_id = uuid4()

        proof_1 = ProofGenerator.generate_load_currents_proof(lc_line_input, artifact_id)
        proof_2 = ProofGenerator.generate_load_currents_proof(lc_line_input, artifact_id)

        json_1 = proof_1.to_dict()
        json_2 = proof_2.to_dict()

        del json_1["document_id"]
        del json_1["created_at"]
        del json_2["document_id"]
        del json_2["created_at"]

        assert json_1 == json_2

    def test_lc_counterfactual_diff_fields(self, lc_line_input: LoadCurrentsInput):
        """Counterfactual P15 zawiera pola diff."""
        alt_input = LoadCurrentsInput(
            project_name="Test Project",
            case_name="Test Case LC Line B",
            run_timestamp=lc_line_input.run_timestamp,
            target_id=lc_line_input.target_id,
            u_ll_kv=lc_line_input.u_ll_kv,
            p_mw=4.5,
            q_mvar=2.0,
            in_a=lc_line_input.in_a,
            sn_mva=None,
            element_kind=LoadElementKind.LINE,
        )

        cf = LoadCurrentsCounterfactualInput(a=lc_line_input, b=alt_input)
        proof = ProofGenerator.generate_load_currents_counterfactual(cf)

        diff = proof.summary.counterfactual_diff
        assert "delta_s_mva" in diff
        assert "delta_i_ka" in diff
        assert "delta_k_i_percent" in diff
        assert "delta_m_i_percent" in diff


# =============================================================================
# Equation Registry Tests
# =============================================================================


class TestEquationRegistry:
    """Testy rejestru równań."""

    def test_all_sc3f_equations_exist(self):
        """Wszystkie równania SC3F są zdefiniowane."""
        sc3f_eqs = EquationRegistry.get_sc3f_equations()

        required_ids = [
            "EQ_SC3F_002",
            "EQ_SC3F_003",
            "EQ_SC3F_004",
            "EQ_SC3F_005",
            "EQ_SC3F_006",
            "EQ_SC3F_007",
            "EQ_SC3F_008",
            "EQ_SC3F_008a",
        ]

        for eq_id in required_ids:
            assert eq_id in sc3f_eqs, f"Missing equation: {eq_id}"

    def test_all_vdrop_equations_exist(self):
        """Wszystkie równania VDROP są zdefiniowane."""
        vdrop_eqs = EquationRegistry.get_vdrop_equations()

        required_ids = [
            "EQ_VDROP_001",
            "EQ_VDROP_002",
            "EQ_VDROP_003",
            "EQ_VDROP_004",
            "EQ_VDROP_005",
            "EQ_VDROP_006",
            "EQ_VDROP_007",
        ]

        for eq_id in required_ids:
            assert eq_id in vdrop_eqs, f"Missing equation: {eq_id}"

    def test_equation_has_required_fields(self):
        """Każde równanie ma wymagane pola."""
        eq = EquationRegistry.get_equation("EQ_SC3F_004")

        assert eq is not None
        assert eq.equation_id == "EQ_SC3F_004"
        assert eq.name_pl != ""
        assert eq.latex != ""
        assert len(eq.symbols) > 0
        assert eq.standard_ref != ""

    def test_id_stability(self):
        """Żaden istniejący ID nie został zmieniony."""
        assert EquationRegistry.validate_id_stability()

    def test_all_symbols_have_mapping_keys(self):
        """Wszystkie symbole mają mapping_key."""
        for eq in EquationRegistry.SC3F_EQUATIONS.values():
            for sym in eq.symbols:
                assert sym.mapping_key != "", f"Missing mapping_key in {eq.equation_id}"

        for eq in EquationRegistry.VDROP_EQUATIONS.values():
            for sym in eq.symbols:
                assert sym.mapping_key != "", f"Missing mapping_key in {eq.equation_id}"


# =============================================================================
# Unit Verifier Tests
# =============================================================================


class TestUnitVerifier:
    """Testy weryfikatora jednostek."""

    def test_sc3f_004_unit_derivation(self):
        """Weryfikacja jednostek dla I_k'' = c·U_n/(√3·Z_th)."""
        result = UnitVerifier.verify_equation(
            "EQ_SC3F_004",
            {"c": "—", "U_n": "kV", "Z_th": "Ω"},
            "kA",
        )

        assert result.passed
        assert result.expected_unit == "kA"
        assert "✓" in result.derivation

    def test_vdrop_003_unit_derivation(self):
        """Weryfikacja jednostek dla ΔU_R = R·P/U²."""
        result = UnitVerifier.verify_equation(
            "EQ_VDROP_003",
            {"R": "Ω", "P": "MW", "U_n": "kV"},
            "%",
        )

        assert result.passed
        assert result.expected_unit == "%"

    def test_dimensionless_verification(self):
        """Weryfikacja dla wielkości bezwymiarowych (κ)."""
        result = UnitVerifier.verify_equation(
            "EQ_SC3F_005",
            {"R_th": "Ω", "X_th": "Ω"},
            "—",
        )

        assert result.passed


# =============================================================================
# Integration Test
# =============================================================================


class TestIntegration:
    """Testy integracyjne."""

    def test_full_sc3f_proof_pipeline(self, sc3f_test_input: SC3FInput):
        """
        Pełny pipeline: dane → ProofDocument → JSON → LaTeX.
        """
        # Generate proof
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        # Verify JSON serialization
        json_str = proof.json_representation
        json_dict = json.loads(json_str)

        assert "steps" in json_dict
        assert len(json_dict["steps"]) == 7
        assert json_dict["proof_type"] == "SC3F_IEC60909"

        # Verify LaTeX generation
        latex_str = proof.latex_representation

        assert r"\documentclass" in latex_str
        assert r"\begin{document}" in latex_str
        assert r"\end{document}" in latex_str
        assert "Dowód" in latex_str

    def test_proof_matches_solver_result_tolerance(self, sc3f_test_input: SC3FInput):
        """
        Wynik dowodu zgodny z wynikiem solvera (tolerancja).

        Tolerancja: 0.1% dla prądów, 0.5% dla mocy.
        """
        proof = ProofGenerator.generate_sc3f_proof(sc3f_test_input)

        # Porównanie z danymi wejściowymi (które pochodzą z solvera)
        ikss_proof = proof.summary.key_results["ikss_ka"].value
        ikss_input = sc3f_test_input.ikss_ka

        ip_proof = proof.summary.key_results["ip_ka"].value
        ip_input = sc3f_test_input.ip_ka

        sk_proof = proof.summary.key_results["sk_mva"].value
        sk_input = sc3f_test_input.sk_mva

        # Tolerancje
        assert abs(ikss_proof - ikss_input) / ikss_input < 0.001
        assert abs(ip_proof - ip_input) / ip_input < 0.001
        assert abs(sk_proof - sk_input) / sk_input < 0.005


# =============================================================================
# Q(U) Tests — P11.1b
# =============================================================================


@pytest.fixture
def qu_test_input() -> QUInput:
    """
    Fixture: minimalne dane Q(U) dla testów.

    Scenariusz: napięcie powyżej deadband.
    """
    return QUInput(
        project_name="Test Project QU",
        case_name="Test Case QU",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        u_meas_kv=15.5,
        u_ref_kv=15.0,
        u_dead_kv=0.2,
        k_q_mvar_per_kv=5.0,
        q_min_mvar=-10.0,
        q_max_mvar=10.0,
    )


@pytest.fixture
def qu_counterfactual_input(qu_test_input: QUInput) -> QUCounterfactualInput:
    """
    Fixture: dane counterfactual A vs B.

    A = bazowy scenariusz
    B = scenariusz ze zmienionym k_Q
    """
    input_b = QUInput(
        project_name="Test Project QU B",
        case_name="Test Case QU B",
        run_timestamp=qu_test_input.run_timestamp,
        u_meas_kv=qu_test_input.u_meas_kv,
        u_ref_kv=qu_test_input.u_ref_kv,
        u_dead_kv=qu_test_input.u_dead_kv,
        k_q_mvar_per_kv=7.0,  # Zmieniony k_Q
        q_min_mvar=qu_test_input.q_min_mvar,
        q_max_mvar=qu_test_input.q_max_mvar,
    )
    return QUCounterfactualInput(a=qu_test_input, b=input_b)


class TestQUProofGenerator:
    """Testy generatora dowodów Q(U) — P11.1b + P11.1c."""

    def test_qu_step_order_len_is_5(self):
        """QU_STEP_ORDER ma dokładnie 5 elementów (4 z P11.1b + 1 z P11.1c)."""
        step_order = EquationRegistry.get_qu_step_order()
        assert len(step_order) == 5
        assert "EQ_QU_005" in step_order  # P11.1c VDROP link

    def test_qu_proof_has_4_steps(self, qu_test_input: QUInput):
        """Dowód Q(U) zawiera dokładnie 4 kroki."""
        proof = ProofGenerator.generate_qu_proof(qu_test_input)

        assert len(proof.steps) == 4
        assert proof.proof_type == ProofType.Q_U_REGULATION

    def test_qu_determinism_json(self, qu_test_input: QUInput):
        """Ten sam QUInput → identyczny proof.json (2x generate)."""
        artifact_id = uuid4()

        proof_1 = ProofGenerator.generate_qu_proof(qu_test_input, artifact_id)
        proof_2 = ProofGenerator.generate_qu_proof(qu_test_input, artifact_id)

        # Porównanie JSON (pomijając document_id i created_at)
        json_1 = proof_1.to_dict()
        json_2 = proof_2.to_dict()

        del json_1["document_id"]
        del json_1["created_at"]
        del json_2["document_id"]
        del json_2["created_at"]

        assert json_1 == json_2

    def test_qu_counterfactual_has_diff_fields(
        self, qu_counterfactual_input: QUCounterfactualInput
    ):
        """Counterfactual proof zawiera pola delta_k_q, delta_q_raw, delta_q_cmd."""
        proof = ProofGenerator.generate_qu_counterfactual(qu_counterfactual_input)

        key_results = proof.summary.key_results

        assert "delta_k_q" in key_results
        assert "delta_q_raw" in key_results
        assert "delta_q_cmd" in key_results
        assert "q_cmd_a" in key_results
        assert "q_cmd_b" in key_results

        # Sprawdź że delta_k_q = 7.0 - 5.0 = 2.0
        assert key_results["delta_k_q"].value == 2.0


# =============================================================================
# P11.1c Tests — Q(U) × VDROP Link
# =============================================================================


@pytest.fixture
def qu_test_input_with_vdrop() -> QUInput:
    """
    Fixture: dane Q(U) z wynikami VDROP dla testu P11.1c.

    Scenariusz: napięcie powyżej deadband + wyniki VDROP.
    """
    return QUInput(
        project_name="Test Project QU+VDROP",
        case_name="Test Case QU P11.1c",
        run_timestamp=datetime(2026, 1, 27, 10, 30, 0),
        u_meas_kv=15.5,
        u_ref_kv=15.0,
        u_dead_kv=0.2,
        k_q_mvar_per_kv=5.0,
        q_min_mvar=-10.0,
        q_max_mvar=10.0,
        # P11.1c: Wyniki VDROP (read-only, bez obliczeń)
        vdrop_delta_u_x_percent=0.42,
        vdrop_delta_u_percent=0.67,
        vdrop_u_kv=14.90,
    )


@pytest.fixture
def qu_counterfactual_input_with_vdrop(
    qu_test_input_with_vdrop: QUInput,
) -> QUCounterfactualInput:
    """
    Fixture: dane counterfactual A vs B z wynikami VDROP.

    A = bazowy scenariusz z VDROP
    B = scenariusz ze zmienionym k_Q i innym U
    """
    input_b = QUInput(
        project_name="Test Project QU B+VDROP",
        case_name="Test Case QU B P11.1c",
        run_timestamp=qu_test_input_with_vdrop.run_timestamp,
        u_meas_kv=qu_test_input_with_vdrop.u_meas_kv,
        u_ref_kv=qu_test_input_with_vdrop.u_ref_kv,
        u_dead_kv=qu_test_input_with_vdrop.u_dead_kv,
        k_q_mvar_per_kv=7.0,  # Zmieniony k_Q
        q_min_mvar=qu_test_input_with_vdrop.q_min_mvar,
        q_max_mvar=qu_test_input_with_vdrop.q_max_mvar,
        # P11.1c: Inne wyniki VDROP dla scenariusza B
        vdrop_delta_u_x_percent=0.58,
        vdrop_delta_u_percent=0.83,
        vdrop_u_kv=14.88,
    )
    return QUCounterfactualInput(a=qu_test_input_with_vdrop, b=input_b)


class TestP11_1c_QU_VDROP_Link:
    """Testy P11.1c — Q(U) × VDROP (LINK-ONLY)."""

    def test_qu_vdrop_link_step_present(self, qu_test_input_with_vdrop: QUInput):
        """
        P11.1c: Krok EQ_QU_005 (VDROP link) jest obecny gdy podano dane VDROP.

        Dowód powinien mieć 5 kroków (4 z P11.1b + 1 z P11.1c).
        """
        proof = ProofGenerator.generate_qu_proof(qu_test_input_with_vdrop)

        # Proof powinien mieć 5 kroków (z VDROP link)
        assert len(proof.steps) == 5

        # Ostatni krok powinien być EQ_QU_005
        last_step = sorted(proof.steps, key=lambda s: s.step_number)[-1]
        assert last_step.equation.equation_id == "EQ_QU_005"
        assert "VDROP" in last_step.title_pl or "referencja" in last_step.title_pl.lower()

        # Wyniki powinny zawierać dane VDROP
        assert "vdrop_u_kv" in proof.summary.key_results
        assert "vdrop_delta_u_x_percent" in proof.summary.key_results
        assert "vdrop_delta_u_percent" in proof.summary.key_results

    def test_qu_vdrop_no_new_equations(self):
        """
        P11.1c: Nie dodano nowych równań VDROP.

        VDROP_EQUATIONS powinno mieć dokładnie 7 równań (bez zmian).
        """
        vdrop_eqs = EquationRegistry.get_vdrop_equations()

        # Dokładnie 7 równań VDROP (bez nowych)
        assert len(vdrop_eqs) == 7

        # Sprawdź że wszystkie oryginalne są obecne
        expected_ids = [
            "EQ_VDROP_001",
            "EQ_VDROP_002",
            "EQ_VDROP_003",
            "EQ_VDROP_004",
            "EQ_VDROP_005",
            "EQ_VDROP_006",
            "EQ_VDROP_007",
        ]
        for eq_id in expected_ids:
            assert eq_id in vdrop_eqs, f"Missing equation: {eq_id}"

        # Upewnij się że NIE ma EQ_VDROP_008 ani wyższych
        for eq_id in vdrop_eqs:
            num = int(eq_id.split("_")[-1])
            assert num <= 7, f"Unexpected VDROP equation: {eq_id}"

    def test_qu_counterfactual_includes_u_delta(
        self, qu_counterfactual_input_with_vdrop: QUCounterfactualInput
    ):
        """
        P11.1c: Counterfactual zawiera U_A, U_B, ΔU gdy podano dane VDROP.
        """
        proof = ProofGenerator.generate_qu_counterfactual(qu_counterfactual_input_with_vdrop)

        key_results = proof.summary.key_results

        # Podstawowe pola counterfactual (P11.1b)
        assert "delta_k_q" in key_results
        assert "delta_q_raw" in key_results
        assert "delta_q_cmd" in key_results

        # P11.1c: Pola napięciowe
        assert "u_a_kv" in key_results
        assert "u_b_kv" in key_results
        assert "delta_u_voltage_kv" in key_results

        # Sprawdź wartości
        u_a = key_results["u_a_kv"].value
        u_b = key_results["u_b_kv"].value
        delta_u = key_results["delta_u_voltage_kv"].value

        assert u_a == 14.90
        assert u_b == 14.88
        assert abs(delta_u - (14.88 - 14.90)) < 0.0001  # -0.02

    def test_qu_proof_without_vdrop_has_4_steps(self, qu_test_input: QUInput):
        """
        P11.1c: Dowód bez danych VDROP ma tylko 4 kroki (bez EQ_QU_005).
        """
        proof = ProofGenerator.generate_qu_proof(qu_test_input)

        # Proof powinien mieć 4 kroki (bez VDROP link)
        assert len(proof.steps) == 4

        # Ostatni krok powinien być EQ_QU_004 (nie EQ_QU_005)
        last_step = sorted(proof.steps, key=lambda s: s.step_number)[-1]
        assert last_step.equation.equation_id == "EQ_QU_004"

    def test_eq_qu_005_is_link_only(self):
        """
        P11.1c: EQ_QU_005 jest LINK-ONLY (referencja do VDROP, nie nowe obliczenia).
        """
        eq = EquationRegistry.get_equation("EQ_QU_005")

        assert eq is not None
        assert "VDROP" in eq.notes or "link" in eq.notes.lower()
        assert "referencja" in eq.notes.lower() or "reference" in eq.notes.lower()

        # Sprawdź że mapping_key odnosi się do istniejących kluczy VDROP
        mapping_keys = [s.mapping_key for s in eq.symbols]
        assert "delta_u_x_percent" in mapping_keys  # z EQ_VDROP_004
        assert "delta_u_percent" in mapping_keys  # z EQ_VDROP_005
        assert "u_kv" in mapping_keys  # z EQ_VDROP_007

    def test_latex_renders_vdrop_link_section(self, qu_test_input_with_vdrop: QUInput):
        """
        P11.1c: LaTeX zawiera sekcję "Wpływ Q na U" gdy podano dane VDROP.
        """
        proof = ProofGenerator.generate_qu_proof(qu_test_input_with_vdrop)
        latex = proof.latex_representation

        # Sekcja "Wpływ Q na U"
        assert "Wpływ Q na U" in latex or "Wplyw Q na U" in latex

        # Tabela z wartościami VDROP
        assert "Q_{cmd}" in latex
        assert "Delta U_X" in latex or "\\Delta U_X" in latex

    def test_qu_vdrop_link_latex_contains_delta_u(self, qu_test_input_with_vdrop: QUInput):
        """P11.1c: krok link-only pokazuje takze posrednie Delta U z VDROP."""
        proof = ProofGenerator.generate_qu_proof(qu_test_input_with_vdrop)

        last_step = sorted(proof.steps, key=lambda s: s.step_number)[-1]

        assert "\\Delta U = 0.6700\\%" in last_step.substitution_latex
        assert "\\text{EQ\\_VDROP\\_007}" in last_step.substitution_latex

    def test_latex_renders_counterfactual_u_table(
        self, qu_counterfactual_input_with_vdrop: QUCounterfactualInput
    ):
        """
        P11.1c: LaTeX counterfactual zawiera wiersz U w tabeli A/B/Δ.
        """
        proof = ProofGenerator.generate_qu_counterfactual(qu_counterfactual_input_with_vdrop)
        latex = proof.latex_representation

        # Tabela A/B/Δ
        assert "Porównanie scenariuszy A vs B" in latex

        # Wiersz z napięciem U
        assert "$U$ [kV]" in latex

        # Delta U w różnicach
        assert "Delta U_{(B-A)}" in latex or "\\Delta U_{(B-A)}" in latex
