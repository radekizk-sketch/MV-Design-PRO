"""Power flow input assembly — the composite-bus contract of the input layer.

A bus is a COMPOSITE object: it may carry several loads and a source at once
(a prosumer bus is an ordinary renewable network). The solver contract, on the
other hand, holds exactly ONE ``PQSpec`` per node — ``validate_input`` rejects
duplicate ``node_id`` entries and ``build_power_spec_v2`` ASSIGNS, so a second
entry for the same bus is either refused or silently overwritten (V12K-313).
Every caller that emits one entry PER COMPONENT therefore has to fold the bus
before handing it over, and the fold is what makes the components recoverable:

* ``p_mw``/``q_mvar`` ACCUMULATE (never assign) — the bus power is a sum,
* ``inverter_p_mw``/``inverter_q_mvar`` carry the SOURCE's own power next to it,
  so the inverter shaping reads the source and not the bus aggregate,
* ``zip_base_p_mw``/``zip_base_q_mvar`` carry the LOAD-only part, so the load
  voltage polynomial scales the load and not the generation.

Without the source's own power a bus that mixes a constant-power load with a
regulated source is INDISTINGUISHABLE from a source-only bus (V12K-316, debt 5):
the aggregate is not the source's power, but nothing in the data says so, and the
shaping silently derives the source's reactive power from the load. The fields are
additive and optional — a payload that does not carry them keeps the historical
path bit for bit, and a bus with a single component is passed through untouched.

ZERO PHYSICS HERE (Rule #1): this layer only sums declared component powers and
moves them into the fields the solver reads. No per-unit conversion, no cosφ
arithmetic, and no second load-aggregation formula — several load polynomials on
one bus are combined by the solver's own ``aggregate_zip``, the very function the
ENM boundary already uses. A state this contract cannot express is refused
explicitly, never guessed.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from typing import Any

from analysis.power_flow.types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    SlackSpec,
)
from network_model.solvers.power_flow_inverter import inverter_control_from_params
from network_model.solvers.power_flow_zip import (
    ZipCoeffs,
    aggregate_zip,
    declares_zip_split,
    zip_coeffs_from_materialized_params,
)


def _carries_load_model(spec: PQSpec) -> bool:
    """Does this component carry a LOAD model of its own?

    ONE predicate, and it is the solver's own: ``declares_zip_split`` is the single
    source of truth for 'a load base exists apart from the net bus power', and the
    voltage polynomial is the other half of the exact pair
    ``power_flow_inverter.source_injection_pu`` uses to decide that a bus aggregate
    is provably NOT the source's power. A second, independently written condition
    here would be a defect waiting for the first spec the two disagree on."""
    return declares_zip_split(spec) or spec.zip_coeffs is not None


def _source_own_power(source: PQSpec | None) -> tuple[float | None, float | None]:
    """The regulated source's OWN power, in the GENERATION convention.

    ``PQSpec.p_mw``/``q_mvar`` are LOAD convention (positive = consumption) while
    ``inverter_p_mw``/``inverter_q_mvar`` are GENERATION convention (positive =
    injection), exactly like ``InverterControl`` itself — so the source entry is
    negated here, the single conversion point of this layer (the ENM builder does
    the same at its own boundary).

    Returns ``(None, None)`` — i.e. adds NOTHING — when the value cannot be read
    off the component: a component that mixes a load model into the source entry
    does not state the source's power, and this layer does not guess it. The
    solver's refusal in ``source_injection_pu`` stays the one place that rejects
    that state; repeating it here would be a second truth about the same set."""
    if source is None:
        return None, None
    if source.inverter_p_mw is not None or source.inverter_q_mvar is not None:
        return source.inverter_p_mw, source.inverter_q_mvar
    if _carries_load_model(source):
        return None, None
    return -source.p_mw, -source.q_mvar


def _fold_load_model(
    components: list[PQSpec],
) -> tuple[ZipCoeffs | None, float | None, float | None]:
    """The bus load model of a folded bus: one polynomial plus the LOAD-only base.

    Only components that carry a polynomial take part. A constant-power load and
    the generation are voltage-INDEPENDENT and belong to the constant part the
    solver forms as ``spec - base``, which is exactly what giving them the identity
    polynomial would do — and unlike a weighted average it needs no way of telling
    a passive source apart from a load, which a spec does not provide.

    Several polynomials on one bus are combined by the solver's own
    ``aggregate_zip`` — the power-weighted average the ENM boundary already uses,
    reused rather than rewritten. Summing loads is not a contradiction and must not
    be refused (V12K-313). A bus with a SINGLE polynomial keeps that very object:
    the weighted average of one component equals it mathematically but not
    necessarily bitwise, and the historical path must not move by an ulp.

    The base is emitted ONLY together with the polynomial: the set of buses rebased
    onto a load base and the set admitted to the recompute table must agree by
    construction (defect A1), and ``build_zip_table`` admits a bus only when it
    carries coefficients."""
    parts: list[tuple[float, float, ZipCoeffs | None]] = []
    for component in components:
        if component.zip_coeffs is None:
            continue
        base_p = component.zip_base_p_mw
        base_q = component.zip_base_q_mvar
        parts.append(
            (
                component.p_mw if base_p is None else base_p,
                component.q_mvar if base_q is None else base_q,
                component.zip_coeffs,
            )
        )
    if not parts:
        return None, None, None
    coeffs = parts[0][2] if len(parts) == 1 else aggregate_zip(parts)
    if coeffs is None:
        return None, None, None
    return coeffs, math.fsum(p for p, _q, _c in parts), math.fsum(q for _p, q, _c in parts)


def _fold_bus(components: list[PQSpec]) -> PQSpec:
    """Fold the components of ONE bus into the single spec the solver contract holds.

    Sums are taken with ``math.fsum`` (correctly rounded, hence independent of the
    order the components were declared in) so a permutation of the input can never
    move a result by an ulp.

    The one state this contract cannot express is refused explicitly rather than
    resolved by picking a branch: two regulated sources on one bus, because
    ``PQSpec`` holds exactly one characteristic per node and silently keeping one
    of them would delete the other from the model without a trace (the same
    refusal ``enm.canonical_analysis`` makes at its own boundary)."""
    node_id = components[0].node_id
    controlled = [c for c in components if c.inverter_control is not None]
    if len(controlled) > 1:
        raise ValueError(
            f"bus {node_id} carries {len(controlled)} regulated sources; the power flow "
            "input contract holds exactly ONE inverter characteristic per bus"
        )
    own_p, own_q = _source_own_power(controlled[0] if controlled else None)
    if len(components) == 1 and own_p is None and own_q is None:
        # Nothing to fold and nothing to complete: hand back the very object the
        # caller built, so every historical payload stays byte-identical.
        return components[0]
    zip_coeffs, base_p, base_q = _fold_load_model(components)
    return PQSpec(
        node_id=node_id,
        p_mw=math.fsum(c.p_mw for c in components),
        q_mvar=math.fsum(c.q_mvar for c in components),
        zip_coeffs=zip_coeffs,
        zip_base_p_mw=base_p,
        zip_base_q_mvar=base_q,
        inverter_control=controlled[0].inverter_control if controlled else None,
        inverter_p_mw=own_p,
        inverter_q_mvar=own_q,
    )


def merge_bus_components(specs: Iterable[PQSpec]) -> list[PQSpec]:
    """THE composite-bus fold — one voice for every power flow input builder.

    Groups the per-component entries by ``node_id`` (first appearance wins the
    position, so an input without composite buses keeps its order and its objects)
    and folds each group with ``_fold_bus``."""
    groups: dict[str, list[PQSpec]] = {}
    for spec in specs:
        groups.setdefault(spec.node_id, []).append(spec)
    return [_fold_bus(components) for components in groups.values()]


def _coerce_slack_spec(slack: SlackSpec | dict[str, Any]) -> SlackSpec:
    if isinstance(slack, SlackSpec):
        return slack
    return SlackSpec(
        node_id=str(slack.get("node_id") or ""),
        u_pu=float(slack.get("u_pu", 1.0)),
        angle_rad=float(slack.get("angle_rad", 0.0)),
    )


def _opt_float(value: Any) -> float | None:
    """Optional numeric payload key: absent/None stays None (additive field)."""
    return None if value is None else float(value)


def _coerce_pq_specs(
    pq_specs: Iterable[PQSpec | dict[str, Any]] | None, base_mva: float
) -> list[PQSpec]:
    items: list[PQSpec] = []
    for spec in pq_specs or []:
        if isinstance(spec, PQSpec):
            items.append(spec)
            continue
        # ADR-011 (Z-ZIP-04): read ZIP coefficients from a nested "zip_coeffs"
        # dict if present, else from flat ZIP params (None => constant power).
        nested = spec.get("zip_coeffs")
        zip_coeffs = zip_coeffs_from_materialized_params(
            nested if isinstance(nested, dict) else spec
        )
        # ADR-011 §5b: build the inverter/converter U/f-control from a nested
        # "inverter_control" params dict if the source carries one, else from
        # flat control params on the spec (None => constant-PQ, reduce-to-NR).
        control_src = spec.get("inverter_control")
        control_params = control_src if isinstance(control_src, dict) else spec
        inverter_control = inverter_control_from_params(
            control_params, base_mva, control_params.get("sn_mva")
        )
        items.append(
            PQSpec(
                node_id=str(spec.get("node_id") or ""),
                p_mw=float(spec.get("p_mw", 0.0)),
                q_mvar=float(spec.get("q_mvar", 0.0)),
                zip_coeffs=zip_coeffs,
                inverter_control=inverter_control,
                # V12K-316 (debt 5): a payload that already aggregates the bus into
                # ONE entry states the source's own power here, next to the net bus
                # power. Absent => historical path (the fold derives it from a
                # component entry, or the solver falls back to the bus power on a
                # source-only bus) — the keys are additive, never required.
                inverter_p_mw=_opt_float(spec.get("inverter_p_mw")),
                inverter_q_mvar=_opt_float(spec.get("inverter_q_mvar")),
            )
        )
    return items


def _coerce_pv_specs(pv_specs: Iterable[PVSpec | dict[str, Any]] | None) -> list[PVSpec]:
    items: list[PVSpec] = []
    for spec in pv_specs or []:
        if isinstance(spec, PVSpec):
            items.append(spec)
            continue
        items.append(
            PVSpec(
                node_id=str(spec.get("node_id") or ""),
                p_mw=float(spec.get("p_mw", 0.0)),
                u_pu=float(spec.get("u_pu", 1.0)),
                q_min_mvar=float(spec.get("q_min_mvar", -1e6)),
                q_max_mvar=float(spec.get("q_max_mvar", 1e6)),
            )
        )
    return items


def _coerce_options(options: PowerFlowOptions | dict[str, Any] | None) -> PowerFlowOptions:
    if isinstance(options, PowerFlowOptions):
        return options
    return PowerFlowOptions(**(options or {}))


def build_power_flow_input(
    *,
    graph: Any,
    base_mva: float,
    slack: SlackSpec | dict[str, Any],
    pq: Iterable[PQSpec | dict[str, Any]] | None = None,
    pv: Iterable[PVSpec | dict[str, Any]] | None = None,
    options: PowerFlowOptions | dict[str, Any] | None = None,
) -> PowerFlowInput:
    base_mva_f = float(base_mva)
    return PowerFlowInput(
        graph=graph,
        base_mva=base_mva_f,
        slack=_coerce_slack_spec(slack),
        pq=merge_bus_components(_coerce_pq_specs(pq, base_mva_f)),
        pv=_coerce_pv_specs(pv),
        options=_coerce_options(options),
    )
