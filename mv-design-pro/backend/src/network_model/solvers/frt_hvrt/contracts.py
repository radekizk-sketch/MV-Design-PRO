"""Kontrakty solvera FRT/HVRT RMS time-domain (PR-16). FROZEN API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FrtScenario(BaseModel):
    """Scenariusz testu FRT/HVRT — pojedyncze zakłócenie napięciowe."""

    scenario_id: str
    test_kind: Literal["lvrt", "hvrt"]
    voltage_dip_depth_pu: float  # 0.0–1.0 (LVRT) lub 1.10–1.30 (HVRT)
    fault_duration_s: float
    target_der_ref: str  # ref do generator/source w ENM
    pre_fault_p_pu: float = 1.0  # P przed zwarciem (p.u.)


class FrtHvrtSolverInput(BaseModel):
    """Wejście solvera FRT/HVRT RMS."""

    enm_ref: str
    scenarios: list[FrtScenario] = Field(default_factory=list)
    integration_step_s: float = 0.001
    simulation_duration_s: float = 5.0


FrtHvrtStatus = Literal[
    "ok",
    "der_dropped",        # DER wypadł z synchronizacji
    "no_module",
    "input_invalid",
]


class FrtTrajectoryPoint(BaseModel):
    time_s: float
    voltage_pu: float
    iq_reactive_pu: float
    p_active_pu: float


class FrtScenarioResult(BaseModel):
    scenario_id: str
    status: FrtHvrtStatus
    stayed_connected: bool
    trajectory: list[FrtTrajectoryPoint] = Field(default_factory=list)
    margin_to_curve_s: float | None = None  # margines do krzywej profilu
    margin_to_curve_pu: float | None = None
    p_recovery_time_s: float | None = None  # czas odzysku P po zakłóceniu


class FrtHvrtResult(BaseModel):
    """FROZEN API solvera FRT/HVRT (PR-16)."""

    status: FrtHvrtStatus
    no_module_reason_pl: str | None = None
    scenario_results: list[FrtScenarioResult] = Field(default_factory=list)
    white_box_trace_path: str | None = None


class FrtHvrtSolverAdapter:
    """Adapter solvera FRT/HVRT. Status no_module dopóki PR-16-impl pending."""

    NO_MODULE_REASON_PL = (
        "Solver FRT/HVRT RMS time-domain (czasowo-domeny dla LVRT 0–80% Un + "
        "HVRT 110–130% Un wg krzywej profilu operatora) nie jest podpięty w "
        "aktualnym module obliczeniowym. Schema FrtHvrtSolverInput + krzywe "
        "FRT/HVRT w 5 profilach NC RfG (PSE/Energa/Tauron/Enea/PGE, PR-9) + "
        "12 turbin wiatrowych w katalogu (PR-11) + UI cards (PR-9/10/11) — "
        "wszystkie gotowe do podpięcia. Pełna implementacja numeryczna RMS "
        "w osobnej sesji eksperta solver (~18 osobodni)."
    )

    def validate_input(
        self, solver_input: FrtHvrtSolverInput,
    ) -> tuple[bool, list[str]]:
        errors: list[str] = []
        if solver_input.simulation_duration_s <= 0:
            errors.append("Czas symulacji <= 0.")
        if solver_input.integration_step_s <= 0:
            errors.append("Krok integracji <= 0.")
        if not solver_input.scenarios:
            errors.append("Lista scenariuszy pusta.")
        for sc in solver_input.scenarios:
            if sc.fault_duration_s <= 0:
                errors.append(f"Scenariusz {sc.scenario_id}: duration <= 0.")
            if sc.test_kind == "lvrt":
                if not (0.0 <= sc.voltage_dip_depth_pu <= 1.0):
                    errors.append(
                        f"Scenariusz {sc.scenario_id}: LVRT voltage_dip_depth_pu "
                        f"poza zakresem 0..1."
                    )
            elif sc.test_kind == "hvrt":
                if not (1.0 < sc.voltage_dip_depth_pu <= 1.5):
                    errors.append(
                        f"Scenariusz {sc.scenario_id}: HVRT voltage_dip_depth_pu "
                        f"poza zakresem 1.0..1.5."
                    )
        return len(errors) == 0, errors

    def run(self, solver_input: FrtHvrtSolverInput) -> FrtHvrtResult:
        valid, errors = self.validate_input(solver_input)
        if not valid:
            return FrtHvrtResult(
                status="input_invalid",
                no_module_reason_pl="Walidacja wejścia: " + "; ".join(errors),
            )
        # PR-16-impl: realne wyniki numeryczne (MVP voltage dip simulation)
        from src.network_model.solvers.frt_hvrt.engine import run_frt_hvrt
        return run_frt_hvrt(solver_input)
