"""
TraceEmitterSC — SC (IEC 60909) → TraceArtifactV2 (PR-35).

INVARIANTS:
- Does NOT touch the solver (reads ShortCircuitResult only)
- Does NOT modify ResultSet v1
- Anti-double-counting c: c_factor appears once (in SC_IKSS step)
- I_th and I_dyn always present
- origin distinguishes solver vs adapter
- No heuristics: if data unavailable, no guessing
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
    """Format float for substitution LaTeX."""
    return f"{x:.6g}"


def _complex_fmt(z: complex) -> str:
    """Format complex for substitution LaTeX."""
    r, i = z.real, z.imag
    sign = "+" if i >= 0 else ""
    return f"{r:.6g}{sign}j{i:.6g}"


class TraceEmitterSC:
    """Emit TraceArtifactV2 from ShortCircuitResult (read-only).

    Input: Snapshot hash + SC solver input + ShortCircuitResult + MathSpecVersion
    Output: TraceArtifactV2
    """

    def __init__(self, registry: EquationRegistryV2 | None = None) -> None:
        self._registry = registry or EquationRegistryV2.default()

    def emit(
        self,
        *,
        snapshot_hash: str,
        analysis_input: dict[str, Any],
        sc_result_dict: dict[str, Any],
        math_spec_version: str = CURRENT_MATH_SPEC_VERSION,
    ) -> TraceArtifactV2:
        """Build TraceArtifactV2 from SC result.

        Args:
            snapshot_hash: SHA-256 of NetworkSnapshot
            analysis_input: Canonical solver input dict
            sc_result_dict: ShortCircuitResult.to_dict()
            math_spec_version: MathSpecVersion string
        """
        run_hash = compute_run_hash(snapshot_hash, analysis_input, math_spec_version)
        fault_node_id = sc_result_dict["fault_node_id"]
        sc_type = sc_result_dict["short_circuit_type"]

        # Build inputs
        inputs = self._build_inputs(sc_result_dict)

        # Build equation steps from white_box_trace
        steps = self._build_steps(sc_result_dict, fault_node_id, sc_type)

        # Build outputs
        outputs = self._build_outputs(sc_result_dict)

        trace_id = deterministic_trace_id(
            analysis_type=AnalysisTypeV2.SC.value,
            snapshot_hash=snapshot_hash,
            run_hash=run_hash,
            inputs=inputs,
            equation_steps=steps,
            outputs=outputs,
        )

        return build_trace_artifact_v2(
            trace_id=trace_id,
            analysis_type=AnalysisTypeV2.SC,
            math_spec_version=math_spec_version,
            snapshot_hash=snapshot_hash,
            run_hash=run_hash,
            inputs=inputs,
            equation_steps=steps,
            outputs=outputs,
        )

    def _build_inputs(self, r: dict[str, Any]) -> dict[str, TraceValue]:
        """Extract input TraceValues from SC result."""
        inputs: dict[str, TraceValue] = {}
        inputs["fault_node_id"] = TraceValue(
            name="fault_node_id",
            value=r["fault_node_id"],
            unit="—",
            label_pl="Węzeł zwarcia",
        )
        inputs["short_circuit_type"] = TraceValue(
            name="short_circuit_type",
            value=r["short_circuit_type"],
            unit="—",
            label_pl="Typ zwarcia",
        )
        inputs["c_factor"] = TraceValue(
            name="c_factor",
            value=canonical_float(r["c_factor"]),
            unit="—",
            label_pl="Współczynnik napięciowy c",
        )
        inputs["un_v"] = TraceValue(
            name="un_v",
            value=canonical_float(r["un_v"]),
            unit="V",
            label_pl="Napięcie znamionowe",
        )
        inputs["tk_s"] = TraceValue(
            name="tk_s",
            value=canonical_float(r["tk_s"]),
            unit="s",
            label_pl="Czas trwania zwarcia",
        )
        inputs["tb_s"] = TraceValue(
            name="tb_s",
            value=canonical_float(r["tb_s"]),
            unit="s",
            label_pl="Czas Ib",
        )
        return inputs

    def _build_steps(
        self,
        r: dict[str, Any],
        fault_node_id: str,
        sc_type: str,
    ) -> list[TraceEquationStep]:
        """Build equation steps from white_box_trace."""
        wb_trace = r.get("white_box_trace", [])
        steps: list[TraceEquationStep] = []

        # Map SC type to ZK equation
        zk_eq_map = {
            "THREE_PHASE": "SC_ZK_3F",
            "TWO_PHASE": "SC_ZK_2F",
            "SINGLE_PHASE_GROUND": "SC_ZK_1F",
            "TWO_PHASE_GROUND": "SC_ZK_2FG",
        }

        step_configs = [
            ("Zk", zk_eq_map.get(sc_type, "SC_ZK_3F"), "SC_ZK_001"),
            ("Ikss", "SC_IKSS", "SC_IKSS_002"),
            ("kappa", "SC_KAPPA", "SC_KAPPA_003"),
            ("Ip", "SC_IP", "SC_IP_004"),
            ("Ib", "SC_IB", "SC_IB_005"),
            ("Ith", "SC_ITH", "SC_ITH_006"),
            ("Sk", "SC_SK", "SC_SK_007"),
        ]

        wb_by_key = {step["key"]: step for step in wb_trace if "key" in step}

        for wb_key, eq_id, step_id in step_configs:
            wb_step = wb_by_key.get(wb_key)
            if wb_step is None:
                continue

            eq = self._registry.get(eq_id)

            # Build intermediate values from wb_step inputs
            intermediates: dict[str, TraceValue] = {}
            for k, v in sorted(wb_step.get("inputs", {}).items()):
                val = v
                unit = "—"
                if "ohm" in k:
                    unit = "\\Omega"
                    if isinstance(val, complex):
                        val = str(val)
                elif k == "c_factor":
                    unit = "—"
                elif "_v" in k or "un_v" in k:
                    unit = "V"
                elif "_a" in k:
                    unit = "A"
                elif "_s" in k:
                    unit = "s"
                intermediates[k] = TraceValue(
                    name=k,
                    value=canonical_float(val) if isinstance(val, int | float) else str(val),
                    unit=unit,
                    label_pl=k,
                )

            # Extract result
            result_dict = wb_step.get("result", {})
            result_key = next(iter(result_dict), "result")
            result_val = result_dict.get(result_key, 0.0)
            result_unit = "—"
            if "_a" in result_key:
                result_unit = "A"
            elif "_ohm" in result_key:
                result_unit = "\\Omega"
            elif "_mva" in result_key:
                result_unit = "MVA"
            elif "kappa" in result_key:
                result_unit = "—"

            result_tv = TraceValue(
                name=result_key,
                value=(
                    canonical_float(result_val)
                    if isinstance(result_val, int | float)
                    else str(result_val)
                ),
                unit=result_unit,
                label_pl=eq.label_pl,
            )

            steps.append(
                TraceEquationStep(
                    step_id=step_id,
                    subject_id=fault_node_id,
                    eq_id=eq_id,
                    label_pl=eq.label_pl,
                    symbolic_latex=eq.latex_symbolic,
                    substituted_latex=wb_step.get("substitution", ""),
                    inputs_used=tuple(sorted(wb_step.get("inputs", {}).keys())),
                    intermediate_values=intermediates,
                    result=result_tv,
                    origin="solver",
                    derived_in_adapter=False,
                )
            )

        # I_dyn step (adapter-derived, always present)
        r.get("ikss_a", 0.0)
        ip_a = r.get("ip_a", 0.0)
        if self._registry.contains("SC_IDYN"):
            eq_idyn = self._registry.get("SC_IDYN")
            steps.append(
                TraceEquationStep(
                    step_id="SC_IDYN_008",
                    subject_id=fault_node_id,
                    eq_id="SC_IDYN",
                    label_pl=eq_idyn.label_pl,
                    symbolic_latex=eq_idyn.latex_symbolic,
                    substituted_latex=f"I_{{dyn}} = {_fmt(ip_a)}",
                    inputs_used=("ip_a",),
                    intermediate_values={
                        "ip_a": TraceValue(
                            name="ip_a",
                            value=canonical_float(ip_a),
                            unit="A",
                            label_pl="Prąd udarowy",
                        ),
                    },
                    result=TraceValue(
                        name="idyn_a",
                        value=canonical_float(ip_a),
                        unit="A",
                        label_pl="Prąd dynamiczny",
                    ),
                    origin="adapter",
                    derived_in_adapter=True,
                )
            )

        return steps

    def _build_outputs(self, r: dict[str, Any]) -> dict[str, TraceValue]:
        """Extract output TraceValues from SC result."""
        outputs: dict[str, TraceValue] = {}
        out_fields = [
            ("ikss_a", "A", "Prąd zwarciowy początkowy"),
            ("ip_a", "A", "Prąd udarowy"),
            ("ith_a", "A", "Prąd zastępczy cieplny"),
            ("ib_a", "A", "Prąd zwarciowy Ib"),
            ("sk_mva", "MVA", "Moc zwarciowa"),
            ("kappa", "—", "Współczynnik udaru"),
        ]
        for key, unit, label in out_fields:
            val = r.get(key)
            if val is not None:
                outputs[key] = TraceValue(
                    name=key,
                    value=canonical_float(val) if isinstance(val, int | float) else str(val),
                    unit=unit,
                    label_pl=label,
                )

        # I_dyn always present (= ip_a)
        ip = r.get("ip_a", 0.0)
        outputs["idyn_a"] = TraceValue(
            name="idyn_a",
            value=canonical_float(ip),
            unit="A",
            label_pl="Prąd dynamiczny",
        )

        return outputs
