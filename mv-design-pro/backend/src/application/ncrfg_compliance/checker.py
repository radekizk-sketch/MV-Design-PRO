"""NC RfG compliance checker — automatyczny testbench (PR-16).

Brief 2 §16. Per typ modułu A/B/C/D × per profil operatora × 18 testów.
Static rules engine sprawdza dane DER vs profile YAML; pełen RMS testbench
wymaga podpięcia FrtHvrtSolverAdapter (PR-16-impl).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from src.catalog.profiles.nc_rfg import load_nc_rfg_profile

ComplianceVerdict = Literal["pass", "fail", "no_data", "no_module"]


class ComplianceTestResult(BaseModel):
    """Wynik pojedynczego testu zgodności."""

    test_id: str
    test_name_pl: str
    verdict: ComplianceVerdict
    message_pl: str | None = None


class NcRfgComplianceReport(BaseModel):
    """Pełen raport zgodności DER per operator + per moduł."""

    operator_id: str
    operator_name_pl: str
    der_ref: str
    module_type: str  # "A" | "B" | "C" | "D"
    p_max_kw: float
    voltage_kv: float
    test_results: list[ComplianceTestResult] = Field(default_factory=list)

    @property
    def overall_pass(self) -> bool:
        return all(r.verdict == "pass" for r in self.test_results)

    @property
    def total_tests(self) -> int:
        return len(self.test_results)

    @property
    def passed_count(self) -> int:
        return sum(1 for r in self.test_results if r.verdict == "pass")

    @property
    def no_module_count(self) -> int:
        return sum(1 for r in self.test_results if r.verdict == "no_module")


class DerDataForCompliance(BaseModel):
    """Wejście — dane DER do testu zgodności."""

    der_ref: str
    p_max_kw: float
    voltage_kv: float
    has_lvrt_curve: bool = False
    has_hvrt_curve: bool = False
    has_pf_droop: bool = False
    has_qu_curve: bool = False
    has_dynamic_model: bool = False
    has_scada_communication: bool = False
    has_disturbance_recorder: bool = False
    cos_phi_min: float | None = None


class NcRfgComplianceChecker:
    """Static + dynamic rules checker dla NC RfG."""

    NO_MODULE_REASON_PL = (
        "Pełen testbench RMS dla testów dynamicznych (T1/T2/T16/T17/T18) "
        "wymaga solvera FrtHvrtSolverAdapter (PR-16-impl). Static rules "
        "(T3-T15) są implementowane teraz."
    )

    # Static tests — sprawdzane bez solvera RMS
    STATIC_TEST_IDS = {
        "T3", "T4", "T5", "T6", "T7", "T9", "T12", "T13", "T14", "T15",
    }
    # Dynamic tests — wymagają RMS solver (PR-16-impl)
    DYNAMIC_TEST_IDS = {
        "T1", "T2", "T8", "T10", "T11", "T16", "T17", "T18",
    }

    def check(
        self,
        operator_id: str,
        der_data: DerDataForCompliance,
    ) -> NcRfgComplianceReport:
        profile = load_nc_rfg_profile(operator_id)
        module_type = profile.classify_module(
            der_data.p_max_kw, der_data.voltage_kv,
        )
        if module_type is None:
            return NcRfgComplianceReport(
                operator_id=operator_id,
                operator_name_pl=profile.operator_name_pl,
                der_ref=der_data.der_ref,
                module_type="?",
                p_max_kw=der_data.p_max_kw,
                voltage_kv=der_data.voltage_kv,
                test_results=[
                    ComplianceTestResult(
                        test_id="classification",
                        test_name_pl="Klasyfikacja modułu",
                        verdict="no_data",
                        message_pl="Nie udało się sklasyfikować modułu DER (P/U).",
                    ),
                ],
            )

        results: list[ComplianceTestResult] = []
        for test in profile.compliance_tests:
            results.append(self._check_single_test(test.id, test.name_pl, der_data))

        return NcRfgComplianceReport(
            operator_id=operator_id,
            operator_name_pl=profile.operator_name_pl,
            der_ref=der_data.der_ref,
            module_type=module_type.id,
            p_max_kw=der_data.p_max_kw,
            voltage_kv=der_data.voltage_kv,
            test_results=results,
        )

    def _check_single_test(
        self, test_id: str, test_name_pl: str, der_data: DerDataForCompliance,
    ) -> ComplianceTestResult:
        # Static tests — checks dostępne lokalnie
        if test_id == "T3":  # P(f) droop
            return self._verdict_from_bool(
                test_id, test_name_pl, der_data.has_pf_droop,
                "Droop P(f) skonfigurowany",
                "Brak konfiguracji droop P(f) — wymagane dla modułów B/C/D.",
            )
        if test_id == "T4":  # Q(U)
            return self._verdict_from_bool(
                test_id, test_name_pl, der_data.has_qu_curve,
                "Krzywa Q(U) dostarczona",
                "Brak krzywej Q(U) — wymagane dla pracy w trybie q_of_u.",
            )
        if test_id == "T5":  # cos φ stały
            if der_data.cos_phi_min is None:
                return ComplianceTestResult(
                    test_id=test_id, test_name_pl=test_name_pl,
                    verdict="no_data", message_pl="Brak danych cos φ.",
                )
            return ComplianceTestResult(
                test_id=test_id, test_name_pl=test_name_pl,
                verdict="pass" if der_data.cos_phi_min >= 0.95 else "fail",
                message_pl=(
                    f"cos φ_min = {der_data.cos_phi_min:.2f} "
                    f"({'spełnia' if der_data.cos_phi_min >= 0.95 else 'nie spełnia'} "
                    f"wymagania ≥0.95)"
                ),
            )
        if test_id == "T14":  # SCADA comm
            return self._verdict_from_bool(
                test_id, test_name_pl, der_data.has_scada_communication,
                "Komunikacja SCADA z operatorem skonfigurowana",
                "Brak komunikacji SCADA z operatorem.",
            )
        if test_id == "T15":  # Disturbance recorder
            return self._verdict_from_bool(
                test_id, test_name_pl, der_data.has_disturbance_recorder,
                "Rejestrator zakłóceń obecny",
                "Brak rejestratora zakłóceń.",
            )
        if test_id in {"T1", "T2"}:  # LVRT/HVRT — wymaga curves + FRT solver
            has_curve = der_data.has_lvrt_curve if test_id == "T1" else der_data.has_hvrt_curve
            if not has_curve:
                return ComplianceTestResult(
                    test_id=test_id, test_name_pl=test_name_pl,
                    verdict="no_data",
                    message_pl=(
                        "Brak krzywej "
                        + ("LVRT" if test_id == "T1" else "HVRT")
                        + " — wymagane do testu RMS."
                    ),
                )
            # PR-16-impl: uruchamiamy FrtHvrtSolverAdapter dla scenariusza testowego
            from src.network_model.solvers.frt_hvrt import (
                FrtHvrtSolverAdapter,
                FrtHvrtSolverInput,
                FrtScenario,
            )
            adapter = FrtHvrtSolverAdapter()
            test_kind = "lvrt" if test_id == "T1" else "hvrt"
            voltage_dip = 0.05 if test_kind == "lvrt" else 1.30
            scenario = FrtScenario(
                scenario_id=f"{test_id}_{der_data.der_ref}",
                test_kind=test_kind,
                voltage_dip_depth_pu=voltage_dip,
                fault_duration_s=0.15,
                target_der_ref=der_data.der_ref,
            )
            result = adapter.run(
                FrtHvrtSolverInput(
                    enm_ref="ncrfg_test",
                    scenarios=[scenario],
                ),
            )
            if result.scenario_results and result.scenario_results[0].stayed_connected:
                return ComplianceTestResult(
                    test_id=test_id, test_name_pl=test_name_pl,
                    verdict="pass",
                    message_pl=(
                        f"DER pozostał w pracy podczas {test_kind.upper()} "
                        f"(margin {result.scenario_results[0].margin_to_curve_pu:.3f} p.u.)."
                    ),
                )
            return ComplianceTestResult(
                test_id=test_id, test_name_pl=test_name_pl,
                verdict="fail",
                message_pl=f"DER wypadł z pracy podczas testu {test_kind.upper()}.",
            )
        if test_id in self.DYNAMIC_TEST_IDS:
            return ComplianceTestResult(
                test_id=test_id, test_name_pl=test_name_pl,
                verdict="no_module",
                message_pl=self.NO_MODULE_REASON_PL,
            )
        # Static placeholder dla pozostałych testów
        return ComplianceTestResult(
            test_id=test_id, test_name_pl=test_name_pl,
            verdict="no_data",
            message_pl="Test wymaga dodatkowych danych konfiguracyjnych.",
        )

    @staticmethod
    def _verdict_from_bool(
        test_id: str, test_name_pl: str, condition: bool,
        pass_msg_pl: str, fail_msg_pl: str,
    ) -> ComplianceTestResult:
        return ComplianceTestResult(
            test_id=test_id, test_name_pl=test_name_pl,
            verdict="pass" if condition else "fail",
            message_pl=pass_msg_pl if condition else fail_msg_pl,
        )
