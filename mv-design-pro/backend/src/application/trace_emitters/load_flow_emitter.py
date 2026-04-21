"""
TraceEmitterLoadFlow — PowerFlowTrace + ResultV1 → TraceArtifactV2 (PR-36B).

Maps existing PowerFlowTrace and PowerFlowResultV1 to TraceArtifactV2 format.
Does NOT modify the solver or ResultSet v1.

Trace shows:
- Explicit assumptions: slack_definition, init_method, tolerance, iteration_limit
- Solver steps: iteration_count, convergence, P/Q balance
- Per-node: U, angle
- Per-branch: flows, losses
- origin: solver vs adapter
- No heuristics, no guessing
"""

from __future__ import annotations

from typing import Any

from application.trace_emitters.deterministic_ids import deterministic_trace_id
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


def _fmt(x: float) -> str:
    return f"{x:.6g}"


def _convergence_substitution(mismatch: float, converged: bool, tolerance: float) -> str:
    comp = "<" if converged else r"\geq"
    return r"\max(|\Delta P|, |\Delta Q|) = " + _fmt(mismatch) + " " + comp + " " + _fmt(tolerance)


def _bus_voltage_substitution(bus_id: str, v_pu: float, angle_deg: float) -> str:
    return f"U_{{{bus_id}}} = {_fmt(v_pu)}" + r" \angle " + f"{_fmt(angle_deg)}" + r"°"


class TraceEmitterLoadFlow:
    """Emit TraceArtifactV2 from PowerFlowTrace + PowerFlowResultV1."""

    def __init__(self, registry: EquationRegistryV2 | None = None) -> None:
        self._registry = registry or EquationRegistryV2.default()

    def emit(
        self,
        *,
        snapshot_hash: str,
        analysis_input: dict[str, Any],
        pf_trace_dict: dict[str, Any],
        pf_result_dict: dict[str, Any],
        math_spec_version: str = CURRENT_MATH_SPEC_VERSION,
    ) -> TraceArtifactV2:
        """Build TraceArtifactV2 from PowerFlowTrace + PowerFlowResultV1.

        Args:
            snapshot_hash: SHA-256 of NetworkSnapshot
            analysis_input: Canonical solver input dict
            pf_trace_dict: PowerFlowTrace.to_dict()
            pf_result_dict: PowerFlowResultV1.to_dict()
            math_spec_version: MathSpecVersion string
        """
        run_hash = compute_run_hash(snapshot_hash, analysis_input, math_spec_version)

        inputs = self._build_inputs(pf_trace_dict, pf_result_dict)
        steps = self._build_steps(pf_trace_dict, pf_result_dict)
        outputs = self._build_outputs(pf_result_dict)

        trace_id = deterministic_trace_id(
            analysis_type=AnalysisTypeV2.LOAD_FLOW.value,
            snapshot_hash=snapshot_hash,
            run_hash=run_hash,
            inputs=inputs,
            equation_steps=steps,
            outputs=outputs,
        )

        return build_trace_artifact_v2(
            trace_id=trace_id,
            analysis_type=AnalysisTypeV2.LOAD_FLOW,
            math_spec_version=math_spec_version,
            snapshot_hash=snapshot_hash,
            run_hash=run_hash,
            inputs=inputs,
            equation_steps=steps,
            outputs=outputs,
        )

    def _build_inputs(
        self,
        trace: dict[str, Any],
        result: dict[str, Any],
    ) -> dict[str, TraceValue]:
        inputs: dict[str, TraceValue] = {}
        inputs["solver_version"] = TraceValue(
            name="solver_version",
            value=trace.get("solver_version", "1.0.0"),
            unit="—",
            label_pl="Wersja solvera",
        )
        inputs["init_method"] = TraceValue(
            name="init_method",
            value=trace.get("init_method", "flat"),
            unit="—",
            label_pl="Metoda inicjalizacji",
        )
        inputs["tolerance"] = TraceValue(
            name="tolerance",
            value=canonical_float(trace.get("tolerance", 1e-6)),
            unit="p.u.",
            label_pl="Tolerancja zbieżności",
        )
        inputs["max_iterations"] = TraceValue(
            name="max_iterations",
            value=trace.get("max_iterations", 100),
            unit="—",
            label_pl="Limit iteracji",
        )
        inputs["base_mva"] = TraceValue(
            name="base_mva",
            value=canonical_float(trace.get("base_mva", 100.0)),
            unit="MVA",
            label_pl="Moc bazowa",
        )
        inputs["slack_bus_id"] = TraceValue(
            name="slack_bus_id",
            value=trace.get("slack_bus_id", ""),
            unit="—",
            label_pl="Węzeł bilansujący",
        )
        inputs["input_hash"] = TraceValue(
            name="input_hash",
            value=trace.get("input_hash", ""),
            unit="—",
            label_pl="Hash wejścia",
        )
        return inputs

    def _build_steps(
        self,
        trace: dict[str, Any],
        result: dict[str, Any],
    ) -> list[TraceEquationStep]:
        steps: list[TraceEquationStep] = []
        step_counter = 0

        slack_bus = trace.get("slack_bus_id", "network")
        converged = trace.get("converged", False)
        iter_count = trace.get("final_iterations_count", 0)

        # Step 1: Convergence
        step_counter += 1
        eq_conv = self._registry.get("LF_CONVERGENCE")
        tolerance = trace.get("tolerance", 1e-6)
        iterations = trace.get("iterations", [])
        last_mismatch = 0.0
        if iterations:
            last_iter = iterations[-1]
            last_mismatch = last_iter.get("max_mismatch_pu", last_iter.get("norm_mismatch", 0.0))

        steps.append(
            TraceEquationStep(
                step_id=f"LF_CONV_{step_counter:04d}",
                subject_id=slack_bus,
                eq_id="LF_CONVERGENCE",
                label_pl=eq_conv.label_pl,
                symbolic_latex=eq_conv.latex_symbolic,
                substituted_latex=_convergence_substitution(last_mismatch, converged, tolerance),
                inputs_used=("convergence", "iterations", "tolerance"),
                intermediate_values={
                    "converged": TraceValue(
                        name="converged",
                        value=str(converged),
                        unit="—",
                        label_pl="Zbieżność",
                    ),
                    "iteration_count": TraceValue(
                        name="iteration_count",
                        value=iter_count,
                        unit="—",
                        label_pl="Liczba iteracji",
                    ),
                    "final_mismatch": TraceValue(
                        name="final_mismatch",
                        value=canonical_float(last_mismatch),
                        unit="p.u.",
                        label_pl="Końcowy mismatch",
                    ),
                    "tolerance": TraceValue(
                        name="tolerance",
                        value=canonical_float(tolerance),
                        unit="p.u.",
                        label_pl="Tolerancja",
                    ),
                },
                result=TraceValue(
                    name="converged",
                    value=str(converged),
                    unit="—",
                    label_pl="Status zbieżności",
                ),
                origin="solver",
            )
        )

        # Step 2: Power balance P
        summary = result.get("summary", {})
        total_losses_p = summary.get("total_losses_p_mw", 0.0)
        slack_p = summary.get("slack_p_mw", 0.0)

        step_counter += 1
        eq_pb_p = self._registry.get("LF_POWER_BALANCE_P")
        steps.append(
            TraceEquationStep(
                step_id=f"LF_PB_P_{step_counter:04d}",
                subject_id=slack_bus,
                eq_id="LF_POWER_BALANCE_P",
                label_pl=eq_pb_p.label_pl,
                symbolic_latex=eq_pb_p.latex_symbolic,
                substituted_latex=(
                    f"P_{{loss}} = {_fmt(total_losses_p)} \\text{{ MW}}, "
                    f"P_{{slack}} = {_fmt(slack_p)} \\text{{ MW}}"
                ),
                inputs_used=("total_losses_p_mw", "slack_p_mw"),
                intermediate_values={
                    "total_losses_p_mw": TraceValue(
                        name="total_losses_p_mw",
                        value=canonical_float(total_losses_p),
                        unit="MW",
                        label_pl="Straty P",
                    ),
                    "slack_p_mw": TraceValue(
                        name="slack_p_mw",
                        value=canonical_float(slack_p),
                        unit="MW",
                        label_pl="P slack",
                    ),
                },
                result=TraceValue(
                    name="total_losses_p_mw",
                    value=canonical_float(total_losses_p),
                    unit="MW",
                    label_pl="Całkowite straty P",
                ),
                origin="solver",
            )
        )

        # Step 3: Power balance Q
        total_losses_q = summary.get("total_losses_q_mvar", 0.0)
        slack_q = summary.get("slack_q_mvar", 0.0)

        step_counter += 1
        eq_pb_q = self._registry.get("LF_POWER_BALANCE_Q")
        steps.append(
            TraceEquationStep(
                step_id=f"LF_PB_Q_{step_counter:04d}",
                subject_id=slack_bus,
                eq_id="LF_POWER_BALANCE_Q",
                label_pl=eq_pb_q.label_pl,
                symbolic_latex=eq_pb_q.latex_symbolic,
                substituted_latex=(
                    f"Q_{{loss}} = {_fmt(total_losses_q)} \\text{{ Mvar}}, "
                    f"Q_{{slack}} = {_fmt(slack_q)} \\text{{ Mvar}}"
                ),
                inputs_used=("total_losses_q_mvar", "slack_q_mvar"),
                intermediate_values={
                    "total_losses_q_mvar": TraceValue(
                        name="total_losses_q_mvar",
                        value=canonical_float(total_losses_q),
                        unit="Mvar",
                        label_pl="Straty Q",
                    ),
                    "slack_q_mvar": TraceValue(
                        name="slack_q_mvar",
                        value=canonical_float(slack_q),
                        unit="Mvar",
                        label_pl="Q slack",
                    ),
                },
                result=TraceValue(
                    name="total_losses_q_mvar",
                    value=canonical_float(total_losses_q),
                    unit="Mvar",
                    label_pl="Całkowite straty Q",
                ),
                origin="solver",
            )
        )

        # Per-bus voltage steps
        eq_bus_v = self._registry.get("LF_BUS_VOLTAGE")
        for bus in sorted(result.get("bus_results", []), key=lambda b: b.get("bus_id", "")):
            step_counter += 1
            bus_id = bus["bus_id"]
            v_pu = bus.get("v_pu", 0.0)
            angle_deg = bus.get("angle_deg", 0.0)

            steps.append(
                TraceEquationStep(
                    step_id=f"LF_BUS_{step_counter:04d}",
                    subject_id=bus_id,
                    eq_id="LF_BUS_VOLTAGE",
                    label_pl=f"{eq_bus_v.label_pl} — {bus_id}",
                    symbolic_latex=eq_bus_v.latex_symbolic,
                    substituted_latex=_bus_voltage_substitution(bus_id, v_pu, angle_deg),
                    inputs_used=("bus_id",),
                    intermediate_values={
                        "v_pu": TraceValue(
                            name="v_pu",
                            value=canonical_float(v_pu),
                            unit="p.u.",
                            label_pl="Napięcie",
                        ),
                        "angle_deg": TraceValue(
                            name="angle_deg",
                            value=canonical_float(angle_deg),
                            unit="°",
                            label_pl="Kąt",
                        ),
                    },
                    result=TraceValue(
                        name="v_pu",
                        value=canonical_float(v_pu),
                        unit="p.u.",
                        label_pl="Napięcie węzła",
                    ),
                    origin="solver",
                )
            )

        # Per-branch flow + losses steps
        eq_branch = self._registry.get("LF_BRANCH_FLOW")
        eq_losses = self._registry.get("LF_BRANCH_LOSSES")
        for br in sorted(result.get("branch_results", []), key=lambda b: b.get("branch_id", "")):
            branch_id = br["branch_id"]

            step_counter += 1
            p_from = br.get("p_from_mw", 0.0)
            q_from = br.get("q_from_mvar", 0.0)
            p_to = br.get("p_to_mw", 0.0)
            q_to = br.get("q_to_mvar", 0.0)

            steps.append(
                TraceEquationStep(
                    step_id=f"LF_BRF_{step_counter:04d}",
                    subject_id=branch_id,
                    eq_id="LF_BRANCH_FLOW",
                    label_pl=f"{eq_branch.label_pl} — {branch_id}",
                    symbolic_latex=eq_branch.latex_symbolic,
                    substituted_latex=(
                        f"S_{{from}} = {_fmt(p_from)} + j{_fmt(q_from)} \\text{{ MVA}}, "
                        f"S_{{to}} = {_fmt(p_to)} + j{_fmt(q_to)} \\text{{ MVA}}"
                    ),
                    inputs_used=("branch_id",),
                    intermediate_values={
                        "p_from_mw": TraceValue(
                            name="p_from_mw",
                            value=canonical_float(p_from),
                            unit="MW",
                            label_pl="P from",
                        ),
                        "q_from_mvar": TraceValue(
                            name="q_from_mvar",
                            value=canonical_float(q_from),
                            unit="Mvar",
                            label_pl="Q from",
                        ),
                        "p_to_mw": TraceValue(
                            name="p_to_mw", value=canonical_float(p_to), unit="MW", label_pl="P to"
                        ),
                        "q_to_mvar": TraceValue(
                            name="q_to_mvar",
                            value=canonical_float(q_to),
                            unit="Mvar",
                            label_pl="Q to",
                        ),
                    },
                    result=TraceValue(
                        name="s_from_mva",
                        value=f"{_fmt(p_from)}+j{_fmt(q_from)}",
                        unit="MVA",
                        label_pl="Przepływ",
                    ),
                    origin="solver",
                )
            )

            step_counter += 1
            losses_p = br.get("losses_p_mw", 0.0)
            losses_q = br.get("losses_q_mvar", 0.0)

            steps.append(
                TraceEquationStep(
                    step_id=f"LF_BRL_{step_counter:04d}",
                    subject_id=branch_id,
                    eq_id="LF_BRANCH_LOSSES",
                    label_pl=f"{eq_losses.label_pl} — {branch_id}",
                    symbolic_latex=eq_losses.latex_symbolic,
                    substituted_latex=(
                        f"\\Delta P = {_fmt(losses_p)} \\text{{ MW}}, "
                        f"\\Delta Q = {_fmt(losses_q)} \\text{{ Mvar}}"
                    ),
                    inputs_used=("branch_id",),
                    intermediate_values={
                        "losses_p_mw": TraceValue(
                            name="losses_p_mw",
                            value=canonical_float(losses_p),
                            unit="MW",
                            label_pl="Straty P",
                        ),
                        "losses_q_mvar": TraceValue(
                            name="losses_q_mvar",
                            value=canonical_float(losses_q),
                            unit="Mvar",
                            label_pl="Straty Q",
                        ),
                    },
                    result=TraceValue(
                        name="losses_p_mw",
                        value=canonical_float(losses_p),
                        unit="MW",
                        label_pl="Straty gałęzi",
                    ),
                    origin="solver",
                )
            )

        return steps

    def _build_outputs(self, result: dict[str, Any]) -> dict[str, TraceValue]:
        outputs: dict[str, TraceValue] = {}
        summary = result.get("summary", {})

        outputs["converged"] = TraceValue(
            name="converged",
            value=str(result.get("converged", False)),
            unit="—",
            label_pl="Zbieżność",
        )
        outputs["iterations_count"] = TraceValue(
            name="iterations_count",
            value=result.get("iterations_count", 0),
            unit="—",
            label_pl="Liczba iteracji",
        )
        outputs["total_losses_p_mw"] = TraceValue(
            name="total_losses_p_mw",
            value=canonical_float(summary.get("total_losses_p_mw", 0.0)),
            unit="MW",
            label_pl="Całkowite straty P",
        )
        outputs["total_losses_q_mvar"] = TraceValue(
            name="total_losses_q_mvar",
            value=canonical_float(summary.get("total_losses_q_mvar", 0.0)),
            unit="Mvar",
            label_pl="Całkowite straty Q",
        )
        outputs["min_v_pu"] = TraceValue(
            name="min_v_pu",
            value=canonical_float(summary.get("min_v_pu", 0.0)),
            unit="p.u.",
            label_pl="Minimum napięcia",
        )
        outputs["max_v_pu"] = TraceValue(
            name="max_v_pu",
            value=canonical_float(summary.get("max_v_pu", 0.0)),
            unit="p.u.",
            label_pl="Maksimum napięcia",
        )
        return outputs
