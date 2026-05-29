"""Testy D-06a/b — projekt uziemienia punktu neutralnego sieci.

Petersen (kompensacja rezonansowa) + rezystor uziemiający (NER). Fizyka pierwszych
zasad — asercje na zgodność ze wzorami są tu poprawne (w odróżnieniu od analiz
oznaczonych jako best-effort). Odrębne od IEEE 80 (_earthing — siatka uziemiająca).
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
)

# XLPE kabel SN: C0 ≈ 0.25 µF/km → b0 = ω·C0.
_B0_PER_KM = 2.0 * math.pi * 50.0 * 0.25e-6


def _cable_network(
    *,
    length_km: float = 30.0,
    nominal_kv: float = 20.0,
    b0: float | None = _B0_PER_KM,
    parameters: dict | None = None,
) -> V126AcademicInput:
    return V126AcademicInput(
        base_frequency_hz=50.0,
        buses=[
            V126BusInput(ref="B1", name="GPZ", nominal_kv=nominal_kv),
            V126BusInput(ref="B2", name="S1", nominal_kv=nominal_kv),
        ],
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="B1",
                to_bus_ref="B2",
                kind="cable",
                length_km=length_km,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.12,
                b0_siemens_per_km=b0,
            )
        ],
        parameters=parameters or {},
    )


def _run(model: V126AcademicInput) -> dict:
    return V126AcademicSolver().run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)


class TestPetersenResonanceTuning:
    def test_coil_inductance_matches_resonance_formula(self) -> None:
        model = _cable_network(parameters={"neutral_earthing_type": "petersen_coil"})
        res = _run(model)["result"]
        omega = 2.0 * math.pi * 50.0
        c0 = res["c0_farad"]
        # L = 1/(3·ω²·C0) — wzór rezonansu Petersena.
        l_expected = 1.0 / (3.0 * omega**2 * c0)
        x_expected = 1.0 / (3.0 * omega * c0)
        assert res["coil_inductance_h"] == pytest.approx(l_expected, rel=1e-6)
        assert res["coil_reactance_ohm"] == pytest.approx(x_expected, rel=1e-6)
        # X_L = ωL — wewnętrzna spójność.
        assert res["coil_reactance_ohm"] == pytest.approx(
            omega * res["coil_inductance_h"], rel=1e-6
        )

    def test_c0_and_ic_match_first_principles(self) -> None:
        model = _cable_network(parameters={"neutral_earthing_type": "petersen_coil"})
        res = _run(model)["result"]
        omega = 2.0 * math.pi * 50.0
        # C0 = B0/ω, B0 = b0·len.
        b0_total = _B0_PER_KM * 30.0
        assert res["c0_farad"] == pytest.approx(b0_total / omega, rel=1e-9)
        # Ic = √3·ω·C0·U_l.
        ic_expected = math.sqrt(3.0) * omega * res["c0_farad"] * 20_000.0
        assert res["capacitive_earth_fault_current_a"] == pytest.approx(ic_expected, rel=1e-6)
        # Równoważnie Ic = 3·ω·C0·U_f.
        u_phase = 20_000.0 / math.sqrt(3.0)
        assert res["capacitive_earth_fault_current_a"] == pytest.approx(
            3.0 * omega * res["c0_farad"] * u_phase, rel=1e-6
        )

    def test_coil_current_rating_equals_ic(self) -> None:
        res = _run(_cable_network(parameters={"neutral_earthing_type": "petersen_coil"}))["result"]
        assert res["coil_current_rating_a"] == pytest.approx(
            res["capacitive_earth_fault_current_a"], rel=1e-9
        )

    def test_residual_zero_at_resonance_grows_with_detuning(self) -> None:
        res = _run(
            _cable_network(
                parameters={"neutral_earthing_type": "petersen_coil", "petersen_detuning": 0.05}
            )
        )["result"]
        ic = res["capacitive_earth_fault_current_a"]
        # Bez tłumienia (d=0): rezonans → 0; rozstrojenie ±5 % → I_res = Ic·0.05.
        assert res["residual_current_at_resonance_a"] == pytest.approx(0.0, abs=1e-9)
        assert res["residual_current_at_detuning_a"] == pytest.approx(0.05 * ic, rel=1e-6)
        assert res["tuning_status"] == "dostrojony"

    def test_residual_grows_monotonically_with_detuning(self) -> None:
        small = _run(
            _cable_network(
                parameters={"neutral_earthing_type": "petersen_coil", "petersen_detuning": 0.02}
            )
        )["result"]["residual_current_at_detuning_a"]
        large = _run(
            _cable_network(
                parameters={"neutral_earthing_type": "petersen_coil", "petersen_detuning": 0.20}
            )
        )["result"]["residual_current_at_detuning_a"]
        assert large > small

    def test_residual_includes_damping_component_at_resonance(self) -> None:
        # Jawny parametr tłumienia d > 0 → resztkowy w rezonansie = Ic·d (nie zgadnięty).
        res = _run(
            _cable_network(
                parameters={
                    "neutral_earthing_type": "petersen_coil",
                    "petersen_residual_damping": 0.03,
                    "petersen_detuning": 0.04,
                }
            )
        )["result"]
        ic = res["capacitive_earth_fault_current_a"]
        assert res["residual_current_at_resonance_a"] == pytest.approx(0.03 * ic, rel=1e-6)
        assert res["residual_current_at_detuning_a"] == pytest.approx(
            ic * math.sqrt(0.03**2 + 0.04**2), rel=1e-6
        )

    def test_plausible_magnitudes_for_20kv_cable_network(self) -> None:
        res = _run(_cable_network(parameters={"neutral_earthing_type": "petersen_coil"}))["result"]
        # 30 km × 0.25 µF/km ⇒ C0 = 7.5 µF.
        assert res["c0_farad"] == pytest.approx(7.5e-6, rel=1e-3)
        # Ic rzędu kilkudziesięciu A dla 20 kV / 30 km kabla.
        assert 50.0 < res["capacitive_earth_fault_current_a"] < 150.0
        # Indukcyjność dławika rzędu dziesiątych części H.
        assert 0.1 < res["coil_inductance_h"] < 2.0


class TestNerResistorSizing:
    def test_resistance_matches_u_over_i(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
            }
        )
        res = _run(model)["result"]
        u_phase = 20_000.0 / math.sqrt(3.0)
        # R = U_f / I_ef.
        assert res["resistor_ohm"] == pytest.approx(u_phase / 300.0, rel=1e-6)

    def test_resultant_current_combines_resistive_and_capacitive(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
            }
        )
        res = _run(model)["result"]
        ic = res["capacitive_earth_fault_current_a"]
        # I_ef_wyp = √((U_f/R)² + Ic²); składowa rezystancyjna = I_ef docelowy.
        i_resistive = res["resistive_component_a"]
        assert i_resistive == pytest.approx(300.0, rel=1e-6)
        assert res["resultant_earth_fault_current_a"] == pytest.approx(
            math.sqrt(300.0**2 + ic**2), rel=1e-6
        )

    def test_thermal_check_passes_with_adequate_rating(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
                "ner_clearing_time_s": 1.0,
                "ner_energy_rating_j": 5.0e6,
            }
        )
        res = _run(model)["result"]
        thermal = res["thermal_check"]
        assert thermal["thermal_ok"] is True
        assert thermal["status"] == "zgodny"
        # E = I_ef²·R·t.
        expected = res["resultant_earth_fault_current_a"] ** 2 * res["resistor_ohm"] * 1.0
        assert thermal["energy_dissipated_j"] == pytest.approx(expected, rel=1e-6)

    def test_thermal_check_trips_when_energy_exceeds_rating(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
                "ner_clearing_time_s": 1.0,
                "ner_energy_rating_j": 100.0,
            }
        )
        res = _run(model)["result"]
        assert res["thermal_check"]["thermal_ok"] is False
        assert res["thermal_check"]["status"] == "niezgodny"


class TestIncompleteData:
    def test_missing_b0_is_incomplete_not_fabricated(self) -> None:
        model = _cable_network(b0=None, parameters={"neutral_earthing_type": "petersen_coil"})
        res = _run(model)["result"]
        assert res["status"] == "dane niekompletne"
        assert "b0_siemens_per_km" in res["missing_fields"]
        assert res["branches_missing_b0"] == ["K1"]
        assert res["sanity"]["status"] == "dane niekompletne"

    def test_missing_target_current_is_incomplete(self) -> None:
        model = _cable_network(parameters={"neutral_earthing_type": "resistor_grounded"})
        res = _run(model)["result"]
        assert res["status"] == "dane niekompletne"
        assert res["missing_fields"] == ["ner_target_earth_fault_current_a"]

    def test_missing_clearing_time_makes_thermal_incomplete(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
                "ner_energy_rating_j": 5.0e6,
            }
        )
        res = _run(model)["result"]
        # Dobór R policzony, ale sprawdzenie cieplne niekompletne (brak t_clear).
        assert res["resistor_ohm"] > 0.0
        assert res["thermal_check"]["status"] == "dane niekompletne"
        assert "ner_clearing_time_s" in res["thermal_check"]["missing_fields"]

    def test_open_branch_excluded_from_c0(self) -> None:
        model = _cable_network(parameters={"neutral_earthing_type": "petersen_coil"})
        model.branches[0].is_open = True
        res = _run(model)["result"]
        # Otwarty łącznik/odcinek nie wnosi pojemności → brak C0 → niekompletne.
        assert res["status"] == "dane niekompletne"


class TestDeterminismAndSanity:
    def test_petersen_deterministic_hash(self) -> None:
        model = _cable_network(parameters={"neutral_earthing_type": "petersen_coil"})
        solver = V126AcademicSolver()
        first = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        second = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        assert first["deterministic_hash"] == second["deterministic_hash"]

    def test_ner_deterministic_hash(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
                "ner_clearing_time_s": 1.0,
                "ner_energy_rating_j": 5.0e6,
            }
        )
        solver = V126AcademicSolver()
        first = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        second = solver.run(V126AnalysisType.NEUTRAL_EARTHING_DESIGN, model)
        assert first["deterministic_hash"] == second["deterministic_hash"]

    def test_petersen_has_white_box_trace(self) -> None:
        model = _cable_network(parameters={"neutral_earthing_type": "petersen_coil"})
        out = _run(model)
        keys = {step["key"] for step in out["white_box_trace"]}
        assert "neutral_earthing_capacitive_current" in keys
        assert "petersen_resonance_tuning" in keys
        assert "petersen_residual_current" in keys
        for step in out["white_box_trace"]:
            assert step["proof_status"] == "complete"
            assert step["formula"]
            assert step["unit_check"]

    def test_ner_has_white_box_trace(self) -> None:
        model = _cable_network(
            parameters={
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
                "ner_clearing_time_s": 1.0,
                "ner_energy_rating_j": 5.0e6,
            }
        )
        out = _run(model)
        keys = {step["key"] for step in out["white_box_trace"]}
        assert "ner_resistance_sizing" in keys
        assert "ner_thermal_withstand" in keys

    def test_sanity_block_present_and_verified(self) -> None:
        petersen = _run(_cable_network(parameters={"neutral_earthing_type": "petersen_coil"}))[
            "result"
        ]
        assert petersen["sanity"]["status"] == "zweryfikowany"
        ner = _run(
            _cable_network(
                parameters={
                    "neutral_earthing_type": "resistor_grounded",
                    "ner_target_earth_fault_current_a": 300.0,
                }
            )
        )["result"]
        assert ner["sanity"]["status"] == "zweryfikowany"

    def test_envelope_contract(self) -> None:
        out = _run(_cable_network(parameters={"neutral_earthing_type": "petersen_coil"}))
        assert out["contract"] == "AcademicAnalysisResultV1"
        assert out["analysis_type"] == "neutral_earthing_design"
        assert "deterministic_hash" in out
