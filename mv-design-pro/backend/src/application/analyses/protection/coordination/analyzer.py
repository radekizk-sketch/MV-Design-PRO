"""
Overcurrent Protection Coordination Analyzer

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Analysis layer (NOT-A-SOLVER)
- ARCHITECTURE.md: Interpretation layer

NOT-A-SOLVER RULE (BINDING):
    This module is an ANALYSIS/INTERPRETATION layer component.
    It does NOT perform any physics calculations.
    All physics data (fault currents, operating currents) comes from:
    - Power Flow solver (operating currents)
    - Short Circuit IEC 60909 solver (fault currents)
    This module ONLY interprets pre-computed results.

WHITE BOX:
    Full trace of all evaluation steps is recorded.
    Every intermediate value is exposed for audit.

DETERMINISM:
    Same inputs → identical outputs.
    No randomness, no timestamps in calculations.

LAYER BOUNDARY:
    Input: PF results + SC results + device settings
    Output: Coordination verdicts + TCC data
    NO model mutation, NO solver calls
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from domain.protection_device import (
    VERDICT_LABELS_PL,
    CoordinationVerdict,
    CurveStandard,
    OverloadCheck,
    SelectivityCheck,
    SensitivityCheck,
)
from protection.curves.curve_calculator import (
    CurveDefinition,
    calculate_curve_points,
    calculate_trip_time,
)
from protection.curves.curve_calculator import (
    CurveStandard as CurveCurveStandard,
)

from .models import (
    CoordinationAnalysisResult,
    CoordinationConfig,
    CoordinationInput,
    FaultCurrentData,
    FaultMarker,
    OperatingCurrentData,
    TCCCurve,
    TCCPoint,
)

# Color palette for TCC curves
CURVE_COLORS = [
    "#2563eb",  # blue
    "#dc2626",  # red
    "#16a34a",  # green
    "#9333ea",  # purple
    "#ea580c",  # orange
    "#0891b2",  # cyan
    "#4f46e5",  # indigo
    "#be123c",  # rose
]


@dataclass
class OvercurrentCoordinationAnalyzer:
    """
    Analyzer for overcurrent protection coordination.

    Performs:
    - Sensitivity checks (will device trip for min fault?)
    - Selectivity checks (proper time grading between devices?)
    - Overload checks (won't trip on normal current?)
    - TCC curve generation for visualization
    """

    config: CoordinationConfig = field(default_factory=CoordinationConfig)

    def analyze(
        self,
        input_data: CoordinationInput,
    ) -> CoordinationAnalysisResult:
        """
        Perform complete coordination analysis.

        Args:
            input_data: CoordinationInput with devices, fault/operating currents

        Returns:
            CoordinationAnalysisResult with all checks and TCC data
        """
        run_id = str(uuid4())
        project_id = input_data.project_id or ""
        trace_steps: list[dict[str, Any]] = []

        # Step 1: Index currents by location
        trace_steps.append(
            {
                "step": "index_currents",
                "description_pl": "Indeksowanie prądów według lokalizacji",
                "inputs": {
                    "fault_locations": len(input_data.fault_currents),
                    "operating_locations": len(input_data.operating_currents),
                },
                "outputs": {},
            }
        )

        fault_by_location = {f.location_id: f for f in input_data.fault_currents}
        operating_by_location = {o.location_id: o for o in input_data.operating_currents}

        # Step 2: Perform sensitivity checks
        sensitivity_checks = self._check_sensitivity(
            devices=input_data.devices,
            fault_currents=fault_by_location,
            trace_steps=trace_steps,
        )

        # Step 3: Perform overload checks
        overload_checks = self._check_overload(
            devices=input_data.devices,
            operating_currents=operating_by_location,
            trace_steps=trace_steps,
        )

        # Step 4: Perform selectivity checks
        selectivity_checks = self._check_selectivity(
            devices=input_data.devices,
            fault_currents=fault_by_location,
            trace_steps=trace_steps,
        )

        # Step 5: Generate TCC curves
        tcc_curves = self._generate_tcc_curves(
            devices=input_data.devices,
            trace_steps=trace_steps,
        )

        # Step 6: Generate fault markers
        fault_markers = self._generate_fault_markers(
            fault_currents=input_data.fault_currents,
            trace_steps=trace_steps,
        )

        # Step 7: Calculate overall verdict
        overall_verdict = self._calculate_overall_verdict(
            sensitivity_checks=sensitivity_checks,
            selectivity_checks=selectivity_checks,
            overload_checks=overload_checks,
        )

        # Step 8: Build summary
        summary = self._build_summary(
            devices=input_data.devices,
            sensitivity_checks=sensitivity_checks,
            selectivity_checks=selectivity_checks,
            overload_checks=overload_checks,
            overall_verdict=overall_verdict,
        )

        trace_steps.append(
            {
                "step": "finalize",
                "description_pl": "Finalizacja wyników analizy",
                "inputs": {},
                "outputs": {
                    "overall_verdict": overall_verdict,
                    "total_checks": len(sensitivity_checks)
                    + len(selectivity_checks)
                    + len(overload_checks),
                },
            }
        )

        return CoordinationAnalysisResult(
            run_id=run_id,
            project_id=project_id,
            devices=input_data.devices,
            sensitivity_checks=tuple(sensitivity_checks),
            selectivity_checks=tuple(selectivity_checks),
            overload_checks=tuple(overload_checks),
            tcc_curves=tuple(tcc_curves),
            fault_markers=tuple(fault_markers),
            overall_verdict=overall_verdict,
            summary=summary,
            trace_steps=tuple(trace_steps),
            pf_run_id=input_data.pf_run_id,
            sc_run_id=input_data.sc_run_id,
            created_at=datetime.now(UTC),
        )

    def _check_sensitivity(
        self,
        devices: tuple[Any, ...],
        fault_currents: dict[str, FaultCurrentData],
        trace_steps: list[dict[str, Any]],
    ) -> list[SensitivityCheck]:
        """
        Check sensitivity for all devices.

        Sensitivity = I_fault_min / I_pickup >= threshold
        """
        checks: list[SensitivityCheck] = []

        trace_steps.append(
            {
                "step": "check_sensitivity_start",
                "description_pl": "Rozpoczęcie sprawdzania czułości zabezpieczeń",
                "inputs": {"device_count": len(devices)},
                "outputs": {},
            }
        )

        for device in devices:
            device_id = str(device.id)
            location_id = device.location_element_id

            # Get fault current at device location
            fault_data = fault_currents.get(location_id)
            if fault_data is None:
                checks.append(
                    SensitivityCheck(
                        device_id=device_id,
                        i_fault_min_a=0.0,
                        i_pickup_a=device.settings.stage_51.pickup_current_a,
                        margin_percent=0.0,
                        verdict=CoordinationVerdict.ERROR,
                        notes_pl=f"Brak danych o prądzie zwarciowym dla lokalizacji {location_id}",
                    )
                )
                continue

            # Get pickup current from stage 51 (I>)
            i_pickup = device.settings.stage_51.pickup_current_a
            i_fault_min = fault_data.ik_min_3f_a

            # Calculate margin
            if i_pickup > 0:
                ratio = i_fault_min / i_pickup
                margin_percent = (ratio - 1.0) * 100.0
            else:
                ratio = 0.0
                margin_percent = -100.0

            # Determine verdict
            if ratio >= self.config.sensitivity_margin_pass:
                verdict = CoordinationVerdict.PASS
                notes_pl = f"Czułość wystarczająca: I_min/I_pickup = {ratio:.2f} >= {self.config.sensitivity_margin_pass}"
            elif ratio >= self.config.sensitivity_margin_marginal:
                verdict = CoordinationVerdict.MARGINAL
                notes_pl = f"Czułość marginalna: I_min/I_pickup = {ratio:.2f}, zalecane >= {self.config.sensitivity_margin_pass}"
            else:
                verdict = CoordinationVerdict.FAIL
                notes_pl = f"Niewystarczająca czułość: I_min/I_pickup = {ratio:.2f} < {self.config.sensitivity_margin_marginal}"

            checks.append(
                SensitivityCheck(
                    device_id=device_id,
                    i_fault_min_a=i_fault_min,
                    i_pickup_a=i_pickup,
                    margin_percent=margin_percent,
                    verdict=verdict,
                    notes_pl=notes_pl,
                )
            )

            trace_steps.append(
                {
                    "step": f"sensitivity_{device_id[:8]}",
                    "description_pl": f"Sprawdzenie czułości: {device.name}",
                    "inputs": {
                        "i_fault_min_a": i_fault_min,
                        "i_pickup_a": i_pickup,
                    },
                    "outputs": {
                        "ratio": ratio,
                        "margin_percent": margin_percent,
                        "verdict": verdict.value,
                    },
                }
            )

        return checks

    def _check_overload(
        self,
        devices: tuple[Any, ...],
        operating_currents: dict[str, OperatingCurrentData],
        trace_steps: list[dict[str, Any]],
    ) -> list[OverloadCheck]:
        """
        Check overload protection for all devices.

        Overload margin = I_pickup / I_operating >= threshold
        """
        checks: list[OverloadCheck] = []

        trace_steps.append(
            {
                "step": "check_overload_start",
                "description_pl": "Rozpoczęcie sprawdzania przeciążalności",
                "inputs": {"device_count": len(devices)},
                "outputs": {},
            }
        )

        for device in devices:
            device_id = str(device.id)
            location_id = device.location_element_id

            # Get operating current at device location
            operating_data = operating_currents.get(location_id)
            if operating_data is None:
                checks.append(
                    OverloadCheck(
                        device_id=device_id,
                        i_operating_a=0.0,
                        i_pickup_a=device.settings.stage_51.pickup_current_a,
                        margin_percent=0.0,
                        verdict=CoordinationVerdict.ERROR,
                        notes_pl=f"Brak danych o prądzie roboczym dla lokalizacji {location_id}",
                    )
                )
                continue

            # Get pickup current from stage 51 (I>)
            i_pickup = device.settings.stage_51.pickup_current_a
            i_operating = operating_data.i_operating_a

            # Calculate margin
            if i_operating > 0:
                ratio = i_pickup / i_operating
                margin_percent = (ratio - 1.0) * 100.0
            else:
                ratio = float("inf")
                margin_percent = 100.0

            # Determine verdict
            if ratio >= self.config.overload_margin_pass:
                verdict = CoordinationVerdict.PASS
                notes_pl = f"Przeciążalność prawidłowa: I_pickup/I_rob = {ratio:.2f} >= {self.config.overload_margin_pass}"
            elif ratio >= self.config.overload_margin_marginal:
                verdict = CoordinationVerdict.MARGINAL
                notes_pl = f"Przeciążalność marginalna: I_pickup/I_rob = {ratio:.2f}, zalecane >= {self.config.overload_margin_pass}"
            else:
                verdict = CoordinationVerdict.FAIL
                notes_pl = f"Ryzyko fałszywego zadziałania: I_pickup/I_rob = {ratio:.2f} < {self.config.overload_margin_marginal}"

            checks.append(
                OverloadCheck(
                    device_id=device_id,
                    i_operating_a=i_operating,
                    i_pickup_a=i_pickup,
                    margin_percent=margin_percent,
                    verdict=verdict,
                    notes_pl=notes_pl,
                )
            )

            trace_steps.append(
                {
                    "step": f"overload_{device_id[:8]}",
                    "description_pl": f"Sprawdzenie przeciążalności: {device.name}",
                    "inputs": {
                        "i_operating_a": i_operating,
                        "i_pickup_a": i_pickup,
                    },
                    "outputs": {
                        "ratio": ratio if ratio != float("inf") else "inf",
                        "margin_percent": margin_percent,
                        "verdict": verdict.value,
                    },
                }
            )

        return checks

    def _check_selectivity(
        self,
        devices: tuple[Any, ...],
        fault_currents: dict[str, FaultCurrentData],
        trace_steps: list[dict[str, Any]],
    ) -> list[SelectivityCheck]:
        """
        Check selectivity (time grading) between device pairs.

        For each adjacent pair (downstream, upstream), verify:
        t_upstream - t_downstream >= CTI (Coordination Time Interval)
        """
        checks: list[SelectivityCheck] = []

        if len(devices) < 2:
            trace_steps.append(
                {
                    "step": "check_selectivity_skip",
                    "description_pl": "Pominięto sprawdzenie selektywności (mniej niż 2 urządzenia)",
                    "inputs": {"device_count": len(devices)},
                    "outputs": {},
                }
            )
            return checks

        trace_steps.append(
            {
                "step": "check_selectivity_start",
                "description_pl": "Rozpoczęcie sprawdzania selektywności czasowej",
                "inputs": {"device_count": len(devices)},
                "outputs": {},
            }
        )

        min_cti = self.config.get_minimum_grading_margin_s()

        # Compare adjacent devices (assuming ordered downstream to upstream)
        for i in range(len(devices) - 1):
            downstream = devices[i]
            upstream = devices[i + 1]

            downstream_id = str(downstream.id)
            upstream_id = str(upstream.id)

            # Get fault current at downstream location (worst case)
            downstream_location = downstream.location_element_id
            fault_data = fault_currents.get(downstream_location)

            if fault_data is None:
                checks.append(
                    SelectivityCheck(
                        upstream_device_id=upstream_id,
                        downstream_device_id=downstream_id,
                        analysis_current_a=0.0,
                        t_upstream_s=0.0,
                        t_downstream_s=0.0,
                        margin_s=0.0,
                        required_margin_s=min_cti,
                        verdict=CoordinationVerdict.ERROR,
                        notes_pl=f"Brak danych o prądzie zwarciowym dla lokalizacji {downstream_location}",
                    )
                )
                continue

            # Use maximum fault current for selectivity analysis
            analysis_current = fault_data.ik_max_3f_a

            # Calculate trip times
            t_downstream = self._calculate_device_trip_time(downstream, analysis_current)
            t_upstream = self._calculate_device_trip_time(upstream, analysis_current)

            # Calculate margin
            if t_downstream == float("inf") or t_upstream == float("inf"):
                margin_s = float("inf")
                verdict = CoordinationVerdict.ERROR
                notes_pl = "Nie można obliczyć czasu zadziałania jednego z zabezpieczeń"
            else:
                margin_s = t_upstream - t_downstream

                # Determine verdict
                if margin_s >= min_cti * self.config.cti_margin_factor:
                    verdict = CoordinationVerdict.PASS
                    notes_pl = f"Selektywność prawidłowa: Δt = {margin_s:.3f}s >= {min_cti * self.config.cti_margin_factor:.3f}s"
                elif margin_s >= min_cti:
                    verdict = CoordinationVerdict.MARGINAL
                    notes_pl = f"Selektywność marginalna: Δt = {margin_s:.3f}s, zalecane >= {min_cti * self.config.cti_margin_factor:.3f}s"
                elif margin_s > 0:
                    verdict = CoordinationVerdict.FAIL
                    notes_pl = f"Niewystarczający margines: Δt = {margin_s:.3f}s < {min_cti:.3f}s"
                else:
                    verdict = CoordinationVerdict.FAIL
                    notes_pl = f"Brak selektywności! Zabezpieczenie nadrzędne zadziała przed podrzędnym (Δt = {margin_s:.3f}s)"

            checks.append(
                SelectivityCheck(
                    upstream_device_id=upstream_id,
                    downstream_device_id=downstream_id,
                    analysis_current_a=analysis_current,
                    t_upstream_s=t_upstream if t_upstream != float("inf") else 999.999,
                    t_downstream_s=t_downstream if t_downstream != float("inf") else 999.999,
                    margin_s=margin_s if margin_s != float("inf") else 999.999,
                    required_margin_s=min_cti,
                    verdict=verdict,
                    notes_pl=notes_pl,
                )
            )

            trace_steps.append(
                {
                    "step": f"selectivity_{downstream_id[:8]}_{upstream_id[:8]}",
                    "description_pl": f"Selektywność: {downstream.name} → {upstream.name}",
                    "inputs": {
                        "analysis_current_a": analysis_current,
                        "min_cti_s": min_cti,
                    },
                    "outputs": {
                        "t_downstream_s": t_downstream if t_downstream != float("inf") else "inf",
                        "t_upstream_s": t_upstream if t_upstream != float("inf") else "inf",
                        "margin_s": margin_s if margin_s != float("inf") else "inf",
                        "verdict": verdict.value,
                    },
                }
            )

        return checks

    def _calculate_device_trip_time(
        self,
        device: Any,  # ProtectionDevice
        fault_current_a: float,
    ) -> float:
        """
        Calculate trip time for a device at given fault current.

        Uses stage 51 (I>) curve if enabled.
        """
        stage_51 = device.settings.stage_51
        if not stage_51.enabled:
            return float("inf")

        # Check if current is above pickup
        if fault_current_a < stage_51.pickup_current_a:
            return float("inf")

        # If definite time, use it directly
        if stage_51.time_s is not None:
            return stage_51.time_s

        # If curve-based, calculate using curve
        if stage_51.curve_settings is None:
            return float("inf")

        curve_settings = stage_51.curve_settings

        # Map to CurveDefinition for calculation
        standard_map = {
            CurveStandard.IEC: CurveCurveStandard.IEC,
            CurveStandard.IEEE: CurveCurveStandard.IEEE,
        }
        standard = standard_map.get(curve_settings.standard, CurveCurveStandard.IEC)

        curve_def = CurveDefinition(
            id=str(device.id),
            name_pl=device.name,
            standard=standard,
            curve_type=curve_settings.variant,
            pickup_current_a=curve_settings.pickup_current_a,
            time_multiplier=curve_settings.time_multiplier,
            definite_time_s=curve_settings.definite_time_s,
        )

        return calculate_trip_time(curve_def, fault_current_a)

    def _generate_tcc_curves(
        self,
        devices: tuple[Any, ...],
        trace_steps: list[dict[str, Any]],
    ) -> list[TCCCurve]:
        """
        Generate TCC curves for all devices.
        """
        curves: list[TCCCurve] = []

        trace_steps.append(
            {
                "step": "generate_tcc_curves",
                "description_pl": "Generowanie krzywych czasowo-prądowych (TCC)",
                "inputs": {"device_count": len(devices)},
                "outputs": {},
            }
        )

        for idx, device in enumerate(devices):
            stage_51 = device.settings.stage_51
            if not stage_51.enabled or stage_51.curve_settings is None:
                continue

            curve_settings = stage_51.curve_settings

            # Map standard
            standard_map = {
                CurveStandard.IEC: CurveCurveStandard.IEC,
                CurveStandard.IEEE: CurveCurveStandard.IEEE,
            }
            standard = standard_map.get(curve_settings.standard, CurveCurveStandard.IEC)

            # Create CurveDefinition
            curve_def = CurveDefinition(
                id=str(device.id),
                name_pl=device.name,
                standard=standard,
                curve_type=curve_settings.variant,
                pickup_current_a=curve_settings.pickup_current_a,
                time_multiplier=curve_settings.time_multiplier,
                definite_time_s=curve_settings.definite_time_s,
                color=CURVE_COLORS[idx % len(CURVE_COLORS)],
            )

            # Calculate points
            points = calculate_curve_points(curve_def)

            tcc_points = tuple(
                TCCPoint(
                    current_a=p.current_a,
                    current_multiple=p.current_multiple,
                    time_s=p.time_s,
                )
                for p in points
            )

            curves.append(
                TCCCurve(
                    device_id=str(device.id),
                    device_name=device.name,
                    curve_type=f"{curve_settings.standard.value}_{curve_settings.variant}",
                    pickup_current_a=curve_settings.pickup_current_a,
                    time_multiplier=curve_settings.time_multiplier,
                    points=tcc_points,
                    color=CURVE_COLORS[idx % len(CURVE_COLORS)],
                )
            )

        return curves

    def _generate_fault_markers(
        self,
        fault_currents: tuple[FaultCurrentData, ...],
        trace_steps: list[dict[str, Any]],
    ) -> list[FaultMarker]:
        """
        Generate fault current markers for TCC chart.
        """
        markers: list[FaultMarker] = []

        trace_steps.append(
            {
                "step": "generate_fault_markers",
                "description_pl": "Generowanie znaczników prądów zwarciowych",
                "inputs": {"location_count": len(fault_currents)},
                "outputs": {},
            }
        )

        for fault_data in fault_currents:
            # Maximum 3-phase fault
            markers.append(
                FaultMarker(
                    id=f"{fault_data.location_id}_ik_max_3f",
                    label_pl=f'Ik"max 3F ({fault_data.location_id})',
                    current_a=fault_data.ik_max_3f_a,
                    fault_type="3F",
                    location=fault_data.location_id,
                )
            )

            # Minimum 3-phase fault
            markers.append(
                FaultMarker(
                    id=f"{fault_data.location_id}_ik_min_3f",
                    label_pl=f'Ik"min 3F ({fault_data.location_id})',
                    current_a=fault_data.ik_min_3f_a,
                    fault_type="3F",
                    location=fault_data.location_id,
                )
            )

            # Minimum 1-phase fault if available
            if fault_data.ik_min_1f_a:
                markers.append(
                    FaultMarker(
                        id=f"{fault_data.location_id}_ik_min_1f",
                        label_pl=f'Ik"min 1F ({fault_data.location_id})',
                        current_a=fault_data.ik_min_1f_a,
                        fault_type="1F",
                        location=fault_data.location_id,
                    )
                )

        return markers

    def _calculate_overall_verdict(
        self,
        sensitivity_checks: list[SensitivityCheck],
        selectivity_checks: list[SelectivityCheck],
        overload_checks: list[OverloadCheck],
    ) -> str:
        """
        Calculate overall coordination verdict.

        FAIL if any check fails.
        MARGINAL if any check is marginal and none fail.
        PASS if all checks pass.
        """
        all_verdicts = (
            [c.verdict for c in sensitivity_checks]
            + [c.verdict for c in selectivity_checks]
            + [c.verdict for c in overload_checks]
        )

        if any(v == CoordinationVerdict.FAIL for v in all_verdicts):
            return CoordinationVerdict.FAIL.value
        if any(v == CoordinationVerdict.ERROR for v in all_verdicts):
            return CoordinationVerdict.FAIL.value
        if any(v == CoordinationVerdict.MARGINAL for v in all_verdicts):
            return CoordinationVerdict.MARGINAL.value
        return CoordinationVerdict.PASS.value

    def _build_summary(
        self,
        devices: tuple[Any, ...],
        sensitivity_checks: list[SensitivityCheck],
        selectivity_checks: list[SelectivityCheck],
        overload_checks: list[OverloadCheck],
        overall_verdict: str,
    ) -> dict[str, Any]:
        """
        Build summary statistics.
        """

        def count_verdicts(checks: list) -> dict[str, int]:
            return {
                "pass": sum(1 for c in checks if c.verdict == CoordinationVerdict.PASS),
                "marginal": sum(1 for c in checks if c.verdict == CoordinationVerdict.MARGINAL),
                "fail": sum(1 for c in checks if c.verdict == CoordinationVerdict.FAIL),
                "error": sum(1 for c in checks if c.verdict == CoordinationVerdict.ERROR),
            }

        return {
            "total_devices": len(devices),
            "total_checks": len(sensitivity_checks)
            + len(selectivity_checks)
            + len(overload_checks),
            "sensitivity": count_verdicts(sensitivity_checks),
            "selectivity": count_verdicts(selectivity_checks),
            "overload": count_verdicts(overload_checks),
            "overall_verdict": overall_verdict,
            "overall_verdict_pl": VERDICT_LABELS_PL.get(overall_verdict, overall_verdict),
        }
