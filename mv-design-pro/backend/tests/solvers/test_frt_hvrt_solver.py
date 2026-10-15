"""Testy kontraktu i adaptera solvera FRT/HVRT (`network_model/solvers/frt_hvrt`).

Decyzja B-01 z 2026-09-30 (pozycja (i) planu A/B §12.2): solver `stability_rms` skasowany
razem ze swoimi testami (klasa `TestStabilitySolverAdapter`, dawniej w tym pliku pod nazwą
`tests/solvers/test_pr15_pr16_solvers.py`). Testy FRT/HVRT zostają: kasacja `frt_hvrt/**`
należy do AB-1c po migracji ekranu toru T3, a ta klasa jest jedynym testem kontraktu
adaptera na poziomie solvera.

Karta S-3 (W6-0): dawna druga część tego pliku (PR-16, `TestNcRfgComplianceChecker`
— drugi silnik zgodności NC RfG `application/ncrfg_compliance/checker.py`, T1–T18,
`no_module`) skasowana razem z silnikiem; jedyna implementacja zgodności NC RfG to
solver kanoniczny `network_model/solvers/ncrfg_ptpiree` (testy: `tests/enm/
test_ncrfg_model_bridge.py`, `tests/api/test_ncrfg_ptpiree_api.py`).
"""

from __future__ import annotations

from network_model.solvers.frt_hvrt import (
    FrtHvrtResult,
    FrtHvrtSolverAdapter,
    FrtHvrtSolverInput,
    FrtScenario,
)

# ---------------------------------------------------------------------------
# PR-16: FRT/HVRT solver adapter
# ---------------------------------------------------------------------------


class TestFrtHvrtSolverAdapter:
    def test_run_returns_ok_status_with_real_simulation(self) -> None:
        """PR-16-impl: solver zwraca 'ok' z trajektorią V/Iq/P."""
        adapter = FrtHvrtSolverAdapter()
        valid_input = FrtHvrtSolverInput(
            enm_ref="snap_1",
            scenarios=[
                FrtScenario(
                    scenario_id="lvrt_1",
                    test_kind="lvrt",
                    voltage_dip_depth_pu=0.05,
                    fault_duration_s=0.15,
                    target_der_ref="pv_1",
                ),
            ],
        )
        result = adapter.run(valid_input)
        assert isinstance(result, FrtHvrtResult)
        assert result.status == "ok"
        assert len(result.scenario_results) == 1
        sc_result = result.scenario_results[0]
        # Scenario powinien mieć trajektorię
        assert len(sc_result.trajectory) > 0
        # margin_to_curve_pu obliczone
        assert sc_result.margin_to_curve_pu is not None

    def test_validate_lvrt_voltage_range(self) -> None:
        adapter = FrtHvrtSolverAdapter()
        # LVRT z voltage_dip_depth > 1 jest invalid
        invalid = FrtHvrtSolverInput(
            enm_ref="x",
            scenarios=[
                FrtScenario(
                    scenario_id="bad_lvrt",
                    test_kind="lvrt",
                    voltage_dip_depth_pu=1.5,  # invalid for LVRT
                    fault_duration_s=0.1,
                    target_der_ref="pv_1",
                ),
            ],
        )
        valid, errors = adapter.validate_input(invalid)
        assert not valid
        assert any("LVRT" in e for e in errors)

    def test_validate_hvrt_voltage_range(self) -> None:
        adapter = FrtHvrtSolverAdapter()
        invalid = FrtHvrtSolverInput(
            enm_ref="x",
            scenarios=[
                FrtScenario(
                    scenario_id="bad_hvrt",
                    test_kind="hvrt",
                    voltage_dip_depth_pu=0.5,  # invalid for HVRT (must be >1)
                    fault_duration_s=0.1,
                    target_der_ref="pv_1",
                ),
            ],
        )
        valid, errors = adapter.validate_input(invalid)
        assert not valid
        assert any("HVRT" in e for e in errors)

    def test_no_scenarios_input_invalid(self) -> None:
        adapter = FrtHvrtSolverAdapter()
        result = adapter.run(FrtHvrtSolverInput(enm_ref="x", scenarios=[]))
        assert result.status == "input_invalid"
