"""
TraceEmitterProtection — Protection v1 → TraceArtifactV2 (PR-36).

Maps existing protection white-box trace to TraceArtifactV2 format.
Does NOT modify the protection engine or ResultSet v1.

Equation steps:
- CT conversion (PROT_CT_CONVERSION)
- M = I/Ipickup (PROT_MULTIPLE_M)
- t = TMS*A/(M^B - 1) (PROT_IEC_IDMT)
- Trip decision F50 (PROT_F50_TRIP)
"""

from __future__ import annotations

from typing import Any

from application.trace_emitters.deterministic_ids import deterministic_trace_id
from application.trace_emitters.wynik import fmt as _fmt
from application.trace_emitters.wynik import wynik as _wynik
from domain.trace_v2.artifact import (
    AnalysisTypeV2,
    TraceArtifactV2,
    TraceEquationStep,
    TraceValue,
    build_trace_artifact_v2,
    canonical_float,
    compute_run_hash,
)
from domain.trace_v2.equation_registry_v2 import EquationRegistryV2
from domain.trace_v2.math_spec_version import CURRENT_MATH_SPEC_VERSION


class TraceEmitterProtection:
    """Emit TraceArtifactV2 from ProtectionResultSetV1."""

    def __init__(self, registry: EquationRegistryV2 | None = None) -> None:
        self._registry = registry or EquationRegistryV2.default()

    def emit(
        self,
        *,
        snapshot_hash: str,
        analysis_input: dict[str, Any],
        protection_result_dict: dict[str, Any],
        math_spec_version: str = CURRENT_MATH_SPEC_VERSION,
    ) -> TraceArtifactV2:
        """Build TraceArtifactV2 from ProtectionResultSetV1.to_dict()."""
        run_hash = compute_run_hash(snapshot_hash, analysis_input, math_spec_version)

        inputs = self._build_inputs(protection_result_dict)
        steps = self._build_steps(protection_result_dict)
        outputs = self._build_outputs(protection_result_dict)

        trace_id = deterministic_trace_id(
            analysis_type=AnalysisTypeV2.PROTECTION.value,
            snapshot_hash=snapshot_hash,
            run_hash=run_hash,
            inputs=inputs,
            equation_steps=steps,
            outputs=outputs,
        )

        return build_trace_artifact_v2(
            trace_id=trace_id,
            analysis_type=AnalysisTypeV2.PROTECTION,
            math_spec_version=math_spec_version,
            snapshot_hash=snapshot_hash,
            run_hash=run_hash,
            inputs=inputs,
            equation_steps=steps,
            outputs=outputs,
        )

    def _build_inputs(self, r: dict[str, Any]) -> dict[str, TraceValue]:
        inputs: dict[str, TraceValue] = {}
        inputs["analysis_type"] = TraceValue(
            name="analysis_type",
            value="PROTECTION",
            unit="—",
            label_pl="Typ analizy",
        )
        relay_results = r.get("relay_results", [])
        inputs["relay_count"] = TraceValue(
            name="relay_count",
            value=len(relay_results),
            unit="—",
            label_pl="Liczba przekaźników",
        )
        total_tp = sum(len(rr.get("test_points", [])) for rr in relay_results)
        inputs["total_test_points"] = TraceValue(
            name="total_test_points",
            value=total_tp,
            unit="—",
            label_pl="Liczba punktów testowych",
        )
        return inputs

    @staticmethod
    def _f50_substitution(
        i_sec: float | str, i_pickup: float | str, picked_up: bool, result_str: str
    ) -> str:
        comp = ">" if picked_up else r"\leq"
        return f"{_fmt(i_sec)} {comp} {_fmt(i_pickup)}" + r" \Rightarrow \text{" + result_str + "}"

    def _build_steps(self, r: dict[str, Any]) -> list[TraceEquationStep]:
        steps: list[TraceEquationStep] = []
        step_counter = 0

        for relay_result in sorted(r.get("relay_results", []), key=lambda x: x.get("relay_id", "")):
            relay_id = relay_result.get("relay_id", "unknown")

            for tp in sorted(
                relay_result.get("test_points", []), key=lambda x: x.get("point_id", "")
            ):
                point_id = tp.get("point_id", "unknown")
                trace = tp.get("trace", {})
                subject_id = f"{relay_id}:{point_id}"

                # CT conversion step
                i_primary = tp.get("i_a_primary", 0.0)
                i_secondary = trace.get("I_secondary", tp.get("i_a_secondary", 0.0))

                if i_primary > 0 and i_secondary > 0:
                    step_counter += 1
                    eq_ct = self._registry.get("PROT_CT_CONVERSION")
                    ct_ratio_val = i_primary / i_secondary if i_secondary else 0
                    steps.append(
                        TraceEquationStep(
                            step_id=f"PROT_CT_{step_counter:04d}",
                            subject_id=subject_id,
                            eq_id="PROT_CT_CONVERSION",
                            label_pl=eq_ct.label_pl,
                            symbolic_latex=eq_ct.latex_symbolic,
                            substituted_latex=(
                                f"I_{{sec}} = {_fmt(i_primary)} \\cdot "
                                f"\\frac{{1}}{{{_fmt(ct_ratio_val)}}}"
                                f" = {_fmt(i_secondary)}"
                            ),
                            inputs_used=("i_a_primary", "ct_ratio"),
                            intermediate_values={
                                "i_a_primary": TraceValue(
                                    name="i_a_primary",
                                    value=canonical_float(i_primary),
                                    unit="A",
                                    label_pl="Prąd pierwotny",
                                ),
                                "ct_ratio": TraceValue(
                                    name="ct_ratio",
                                    value=canonical_float(ct_ratio_val),
                                    unit="—",
                                    label_pl="Przekładnia CT",
                                ),
                            },
                            result=TraceValue(
                                name="i_a_secondary",
                                value=canonical_float(i_secondary),
                                unit="A",
                                label_pl="Prąd wtórny",
                            ),
                            origin="solver",
                        )
                    )

                # Process function traces (F50 and F51)
                for func_result in sorted(
                    tp.get("function_results", []), key=lambda x: x.get("function", "")
                ):
                    func_trace = func_result.get("trace", {})
                    function = func_trace.get("function", func_result.get("function", ""))

                    if function == "51":
                        steps.extend(
                            self._emit_f51_steps(
                                func_trace,
                                subject_id,
                                step_counter,
                            )
                        )
                        step_counter += 2  # M step + IDMT step
                    elif function == "50":
                        step_counter += 1
                        steps.extend(
                            self._emit_f50_steps(
                                func_trace,
                                subject_id,
                                step_counter,
                            )
                        )

        return steps

    def _emit_f51_steps(
        self,
        trace: dict[str, Any],
        subject_id: str,
        base_counter: int,
    ) -> list[TraceEquationStep]:
        """Emit M calculation + IDMT time steps for F51."""
        steps: list[TraceEquationStep] = []

        i_sec = _wynik(trace.get("I_secondary"))
        i_pickup = _wynik(trace.get("I_pickup_secondary"))
        m_val = _wynik(trace.get("M"))
        tms = _wynik(trace.get("TMS"))
        a_val = _wynik(trace.get("A"))
        b_val = _wynik(trace.get("B"))
        m_power_b = _wynik(trace.get("M_power_B"))
        denominator = _wynik(trace.get("denominator"))
        base_time = _wynik(trace.get("base_time_s"))
        trip_time = trace.get("trip_time_s")
        curve_type = trace.get("curve_type", "")
        curve_label = trace.get("curve_label_pl", "")

        # Step: M = I/Ipickup
        eq_m = self._registry.get("PROT_MULTIPLE_M")
        steps.append(
            TraceEquationStep(
                step_id=f"PROT_M_{base_counter + 1:04d}",
                subject_id=subject_id,
                eq_id="PROT_MULTIPLE_M",
                label_pl=eq_m.label_pl,
                symbolic_latex=eq_m.latex_symbolic,
                substituted_latex=f"M = \\frac{{{_fmt(i_sec)}}}{{{_fmt(i_pickup)}}} = {_fmt(m_val)}",
                inputs_used=("I_secondary", "I_pickup_secondary"),
                intermediate_values={
                    "I_secondary": TraceValue(
                        name="I_secondary",
                        value=i_sec,
                        unit="A",
                        label_pl="Prąd wtórny",
                    ),
                    "I_pickup_secondary": TraceValue(
                        name="I_pickup_secondary",
                        value=i_pickup,
                        unit="A",
                        label_pl="Nastawa rozruchowa",
                    ),
                },
                result=TraceValue(
                    name="M",
                    value=m_val,
                    unit="—",
                    label_pl="Krotność prądu",
                ),
                origin="solver",
            )
        )

        # Step: t = TMS * A / (M^B - 1)
        eq_idmt = self._registry.get("PROT_IEC_IDMT")
        trip_val = canonical_float(trip_time) if trip_time is not None else "NO_TRIP"
        substituted = (
            f"t = {_fmt(tms)} \\cdot \\frac{{{_fmt(a_val)}}}"
            f"{{{_fmt(m_val)}^{{{_fmt(b_val)}}} - 1}}"
        )
        if trip_time is not None:
            substituted += f" = {_fmt(trip_time)}"

        steps.append(
            TraceEquationStep(
                step_id=f"PROT_IDMT_{base_counter + 2:04d}",
                subject_id=subject_id,
                eq_id="PROT_IEC_IDMT",
                label_pl=f"{eq_idmt.label_pl} ({curve_label})" if curve_label else eq_idmt.label_pl,
                symbolic_latex=eq_idmt.latex_symbolic,
                substituted_latex=substituted,
                inputs_used=("A", "B", "M", "TMS"),
                intermediate_values={
                    "A": TraceValue(name="A", value=a_val, unit="—", label_pl="Stała A"),
                    "B": TraceValue(name="B", value=b_val, unit="—", label_pl="Wykładnik B"),
                    "TMS": TraceValue(name="TMS", value=tms, unit="—", label_pl="Mnożnik czasowy"),
                    "M": TraceValue(name="M", value=m_val, unit="—", label_pl="Krotność"),
                    "M_power_B": TraceValue(
                        name="M_power_B",
                        value=m_power_b,
                        unit="—",
                        label_pl="M^B",
                    ),
                    "denominator": TraceValue(
                        name="denominator",
                        value=denominator,
                        unit="—",
                        label_pl="M^B - 1",
                    ),
                    "base_time_s": TraceValue(
                        name="base_time_s",
                        value=base_time,
                        unit="s",
                        label_pl="Czas bazowy",
                    ),
                    "curve_type": TraceValue(
                        name="curve_type",
                        value=curve_type,
                        unit="—",
                        label_pl="Typ krzywej",
                    ),
                },
                result=TraceValue(
                    name="trip_time_s",
                    value=trip_val,
                    unit="s",
                    label_pl="Czas zadziałania",
                ),
                origin="solver",
            )
        )

        return steps

    def _emit_f50_steps(
        self,
        trace: dict[str, Any],
        subject_id: str,
        counter: int,
    ) -> list[TraceEquationStep]:
        """Emit F50 trip decision step."""
        i_sec = _wynik(trace.get("I_secondary"))
        i_pickup = _wynik(trace.get("pickup_a_secondary"))
        picked_up = trace.get("picked_up", False)
        result_str = trace.get("result", "NO_TRIP")
        t_trip = trace.get("t_trip_s")

        eq_f50 = self._registry.get("PROT_F50_TRIP")

        trip_val: float | str
        if result_str == "TRIP":
            trip_val = _wynik(t_trip)
        else:
            trip_val = result_str

        return [
            TraceEquationStep(
                step_id=f"PROT_F50_{counter:04d}",
                subject_id=subject_id,
                eq_id="PROT_F50_TRIP",
                label_pl=eq_f50.label_pl,
                symbolic_latex=eq_f50.latex_symbolic,
                substituted_latex=self._f50_substitution(i_sec, i_pickup, picked_up, result_str),
                inputs_used=("I_secondary", "pickup_a_secondary"),
                intermediate_values={
                    "I_secondary": TraceValue(
                        name="I_secondary",
                        value=i_sec,
                        unit="A",
                        label_pl="Prąd wtórny",
                    ),
                    "pickup_a_secondary": TraceValue(
                        name="pickup_a_secondary",
                        value=i_pickup,
                        unit="A",
                        label_pl="Nastawa I>>",
                    ),
                    "picked_up": TraceValue(
                        name="picked_up",
                        value=str(picked_up),
                        unit="—",
                        label_pl="Pobudzenie",
                    ),
                },
                result=TraceValue(
                    name="trip_result",
                    value=trip_val,
                    unit="s" if result_str == "TRIP" else "—",
                    label_pl="Wynik F50",
                ),
                origin="solver",
            )
        ]

    def _build_outputs(self, r: dict[str, Any]) -> dict[str, TraceValue]:
        outputs: dict[str, TraceValue] = {}
        relay_results = r.get("relay_results", [])
        total_trips_f50 = 0
        total_trips_f51 = 0
        for rr in relay_results:
            for tp in rr.get("test_points", []):
                for fr in tp.get("function_results", []):
                    func = fr.get("function", "")
                    trace = fr.get("trace", {})
                    result = trace.get("result", "")
                    if func == "50" and result == "TRIP":
                        total_trips_f50 += 1
                    elif func == "51" and result == "TRIP":
                        total_trips_f51 += 1

        outputs["total_f50_trips"] = TraceValue(
            name="total_f50_trips",
            value=total_trips_f50,
            unit="—",
            label_pl="Zadziałania F50",
        )
        outputs["total_f51_trips"] = TraceValue(
            name="total_f51_trips",
            value=total_trips_f51,
            unit="—",
            label_pl="Zadziałania F51",
        )

        sig = r.get("deterministic_signature", "")
        outputs["deterministic_signature"] = TraceValue(
            name="deterministic_signature",
            value=sig,
            unit="—",
            label_pl="Sygnatura deterministyczna",
        )
        return outputs
