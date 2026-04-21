"""
Deterministic solver-input builder.

Transforms ENM (NetworkGraph) + Catalog + StudyCaseConfig into a canonical
SolverInputEnvelope with full provenance trace.

INVARIANTS:
- Identical ENM + identical catalog + identical config → identical output JSON.
- All lists sorted deterministically (by ref_id, lexicographic).
- NO heuristics, NO default physical values, NO data guessing.
- If a required field has no source → DEFAULT_FORBIDDEN blocker, payload partial.
"""

from __future__ import annotations

from typing import Any

from domain.study_case import StudyCaseConfig
from network_model.catalog.repository import CatalogRepository
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from solver_input.contracts import (
    SOLVER_INPUT_CONTRACT_VERSION,
    BranchPayload,
    BusPayload,
    InverterSourcePayload,
    LoadFlowPayload,
    ProvenanceEntrySchema,
    ProvenanceSummarySchema,
    ShortCircuitPayload,
    SolverAnalysisType,
    SolverInputEnvelope,
    SwitchPayload,
    TransformerPayload,
)
from solver_input.eligibility import check_eligibility
from solver_input.provenance import (
    ProvenanceEntry,
    ProvenanceSummary,
    SourceKind,
    SourceRef,
    build_provenance_summary,
    compute_value_hash,
)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _build_bus_payloads(graph: NetworkGraph) -> list[BusPayload]:
    """Build deterministically sorted bus payloads from graph nodes."""
    payloads: list[BusPayload] = []
    for node in sorted(graph.nodes.values(), key=lambda n: n.id):
        payloads.append(
            BusPayload(
                ref_id=node.id,
                name=node.name,
                node_type=node.node_type.value,
                voltage_level_kv=node.voltage_level,
                voltage_magnitude_pu=node.voltage_magnitude,
                voltage_angle_rad=node.voltage_angle,
                active_power_mw=node.active_power,
                reactive_power_mvar=node.reactive_power,
            )
        )
    return payloads


def _build_branch_payloads(
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
    trace_entries: list[ProvenanceEntry],
) -> list[BranchPayload]:
    """Build deterministically sorted branch payloads with provenance trace."""
    payloads: list[BranchPayload] = []

    line_branches = [b for b in graph.branches.values() if isinstance(b, LineBranch)]
    line_branches.sort(key=lambda b: b.id)

    for branch in line_branches:
        # Resolve parameters via canonical precedence
        r = branch.r_ohm_per_km
        x = branch.x_ohm_per_km
        b_us = branch.b_us_per_km
        rated_a = branch.rated_current_a
        source_kind = SourceKind.DERIVED  # will be overridden

        catalog_ref_str: str | None = None

        if branch.impedance_override is not None:
            # OVERRIDE source
            source_kind = SourceKind.OVERRIDE
            if branch.length_km > 0:
                r = branch.impedance_override.r_total_ohm / branch.length_km
                x = branch.impedance_override.x_total_ohm / branch.length_km
                b_us = branch.impedance_override.b_total_us / branch.length_km
            override_reason = "impedance_override provided on instance"
            source_ref = SourceRef(override_reason=override_reason)
        elif branch.type_ref and catalog is not None:
            # CATALOG source
            is_cable = branch.branch_type == BranchType.CABLE
            type_data = (
                catalog.get_cable_type(branch.type_ref)
                if is_cable
                else catalog.get_line_type(branch.type_ref)
            )
            if type_data is not None:
                r = type_data.r_ohm_per_km
                x = type_data.x_ohm_per_km
                b_us = type_data.b_us_per_km
                rated_a = type_data.rated_current_a
                source_kind = SourceKind.CATALOG
                catalog_ref_str = branch.type_ref
                source_ref = SourceRef(
                    catalog_ref=branch.type_ref,
                    catalog_path=f"{'cable' if is_cable else 'line'}_types[{branch.type_ref}]",
                )
            else:
                source_kind = SourceKind.DERIVED
                source_ref = SourceRef(derivation_rule="type_ref_not_found_fallback_to_instance")
        elif branch.type_ref and catalog is None:
            # type_ref present but no catalog — use instance values
            source_kind = SourceKind.DERIVED
            source_ref = SourceRef(derivation_rule="type_ref_present_but_catalog_unavailable")
        else:
            # Instance parameters (no type_ref, no override)
            source_kind = SourceKind.DERIVED
            source_ref = SourceRef(derivation_rule="instance_parameters")

        # Add provenance trace entries for key fields
        for field_name, value, unit in [
            ("r_ohm_per_km", r, "ohm/km"),
            ("x_ohm_per_km", x, "ohm/km"),
            ("b_us_per_km", b_us, "uS/km"),
            ("rated_current_a", rated_a, "A"),
        ]:
            trace_entries.append(
                ProvenanceEntry(
                    element_ref=branch.id,
                    field_path=f"branches[ref_id={branch.id}].{field_name}",
                    source_kind=source_kind,
                    source_ref=source_ref,
                    value_hash=compute_value_hash(value),
                    unit=unit,
                )
            )

        # Length is always DERIVED from topology
        trace_entries.append(
            ProvenanceEntry(
                element_ref=branch.id,
                field_path=f"branches[ref_id={branch.id}].length_km",
                source_kind=SourceKind.DERIVED,
                source_ref=SourceRef(derivation_rule="instance_topology_length"),
                value_hash=compute_value_hash(branch.length_km),
                unit="km",
            )
        )

        payloads.append(
            BranchPayload(
                ref_id=branch.id,
                name=branch.name,
                branch_type=branch.branch_type.value,
                from_bus_ref=branch.from_node_id,
                to_bus_ref=branch.to_node_id,
                r_ohm_per_km=r,
                x_ohm_per_km=x,
                b_us_per_km=b_us,
                length_km=branch.length_km,
                rated_current_a=rated_a,
                in_service=branch.in_service,
                catalog_ref=catalog_ref_str,
            )
        )

    return payloads


def _build_transformer_payloads(
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
    trace_entries: list[ProvenanceEntry],
) -> list[TransformerPayload]:
    """Build deterministically sorted transformer payloads with provenance trace."""
    payloads: list[TransformerPayload] = []

    trafo_branches = [b for b in graph.branches.values() if isinstance(b, TransformerBranch)]
    trafo_branches.sort(key=lambda b: b.id)

    for trafo in trafo_branches:
        rated_power = trafo.rated_power_mva
        v_hv = trafo.voltage_hv_kv
        v_lv = trafo.voltage_lv_kv
        uk = trafo.uk_percent
        pk = trafo.pk_kw
        i0 = trafo.i0_percent
        p0 = trafo.p0_kw
        vg = trafo.vector_group

        catalog_ref_str: str | None = None

        if trafo.type_ref and catalog is not None:
            type_data = catalog.get_transformer_type(trafo.type_ref)
            if type_data is not None:
                rated_power = type_data.rated_power_mva
                v_hv = type_data.voltage_hv_kv
                v_lv = type_data.voltage_lv_kv
                uk = type_data.uk_percent
                pk = type_data.pk_kw
                i0 = type_data.i0_percent
                p0 = type_data.p0_kw
                vg = type_data.vector_group
                source_kind = SourceKind.CATALOG
                catalog_ref_str = trafo.type_ref
                source_ref = SourceRef(
                    catalog_ref=trafo.type_ref,
                    catalog_path=f"transformer_types[{trafo.type_ref}]",
                )
            else:
                source_kind = SourceKind.DERIVED
                source_ref = SourceRef(derivation_rule="type_ref_not_found_fallback_to_instance")
        else:
            source_kind = SourceKind.DERIVED
            source_ref = SourceRef(derivation_rule="instance_parameters")

        for field_name, value, unit in [
            ("rated_power_mva", rated_power, "MVA"),
            ("voltage_hv_kv", v_hv, "kV"),
            ("voltage_lv_kv", v_lv, "kV"),
            ("uk_percent", uk, "%"),
            ("pk_kw", pk, "kW"),
            ("i0_percent", i0, "%"),
            ("p0_kw", p0, "kW"),
        ]:
            trace_entries.append(
                ProvenanceEntry(
                    element_ref=trafo.id,
                    field_path=f"transformers[ref_id={trafo.id}].{field_name}",
                    source_kind=source_kind,
                    source_ref=source_ref,
                    value_hash=compute_value_hash(value),
                    unit=unit,
                )
            )

        payloads.append(
            TransformerPayload(
                ref_id=trafo.id,
                name=trafo.name,
                from_bus_ref=trafo.from_node_id,
                to_bus_ref=trafo.to_node_id,
                rated_power_mva=rated_power,
                voltage_hv_kv=v_hv,
                voltage_lv_kv=v_lv,
                uk_percent=uk,
                pk_kw=pk,
                i0_percent=i0,
                p0_kw=p0,
                vector_group=vg,
                tap_position=trafo.tap_position,
                tap_step_percent=trafo.tap_step_percent,
                in_service=trafo.in_service,
                catalog_ref=catalog_ref_str,
            )
        )

    return payloads


def _build_inverter_payloads(
    graph: NetworkGraph,
    trace_entries: list[ProvenanceEntry],
) -> list[InverterSourcePayload]:
    """Build deterministically sorted inverter source payloads."""
    payloads: list[InverterSourcePayload] = []

    for source in sorted(graph.inverter_sources.values(), key=lambda s: s.id):
        catalog_ref_str = source.type_ref

        if source.type_ref:
            source_kind = SourceKind.CATALOG
            src_ref = SourceRef(
                catalog_ref=source.type_ref,
                catalog_path=f"converter_types[{source.type_ref}]",
            )
        else:
            source_kind = SourceKind.DERIVED
            src_ref = SourceRef(derivation_rule="instance_parameters")

        for field_name, value, unit in [
            ("in_rated_a", source.in_rated_a, "A"),
            ("k_sc", source.k_sc, ""),
        ]:
            trace_entries.append(
                ProvenanceEntry(
                    element_ref=source.id,
                    field_path=f"inverter_sources[ref_id={source.id}].{field_name}",
                    source_kind=source_kind,
                    source_ref=src_ref,
                    value_hash=compute_value_hash(value),
                    unit=unit if unit else None,
                )
            )

        payloads.append(
            InverterSourcePayload(
                ref_id=source.id,
                name=source.name,
                bus_ref=source.node_id,
                converter_kind=(source.converter_kind.value if source.converter_kind else None),
                in_rated_a=source.in_rated_a,
                k_sc=source.k_sc,
                contributes_negative_sequence=source.contributes_negative_sequence,
                contributes_zero_sequence=source.contributes_zero_sequence,
                in_service=source.in_service,
                catalog_ref=catalog_ref_str,
            )
        )

    return payloads


def _build_switch_payloads(graph: NetworkGraph) -> list[SwitchPayload]:
    """Build deterministically sorted switch payloads."""
    payloads: list[SwitchPayload] = []

    for switch in sorted(graph.switches.values(), key=lambda s: s.id):
        payloads.append(
            SwitchPayload(
                ref_id=switch.id,
                name=switch.name,
                switch_type=switch.switch_type.value,
                from_bus_ref=switch.from_node_id,
                to_bus_ref=switch.to_node_id,
                state=switch.state.value,
                in_service=switch.in_service,
            )
        )

    return payloads


def _trace_to_schema(entries: list[ProvenanceEntry]) -> list[ProvenanceEntrySchema]:
    """Convert internal ProvenanceEntry list to Pydantic schema list."""
    # Sort deterministically: by element_ref then field_path
    sorted_entries = sorted(entries, key=lambda e: (e.element_ref, e.field_path))
    return [
        ProvenanceEntrySchema(
            element_ref=e.element_ref,
            field_path=e.field_path,
            source_kind=e.source_kind.value,
            source_ref=e.source_ref.to_dict(),
            value_hash=e.value_hash,
            unit=e.unit,
            note=e.note,
        )
        for e in sorted_entries
    ]


def _summary_to_schema(summary: ProvenanceSummary) -> ProvenanceSummarySchema:
    """Convert internal ProvenanceSummary to Pydantic schema."""
    return ProvenanceSummarySchema(
        catalog_refs_used=list(summary.catalog_refs_used),
        overrides_used_count=summary.overrides_used_count,
        overrides_used_refs=list(summary.overrides_used_refs),
        derived_fields_count=summary.derived_fields_count,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_solver_input(
    *,
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
    case_id: str,
    enm_revision: str,
    analysis_type: SolverAnalysisType,
    config: StudyCaseConfig | None = None,
) -> SolverInputEnvelope:
    """
    Build canonical solver-input envelope from ENM + catalog + case config.

    This is the single entry point for solver-input generation.

    Args:
        graph: NetworkGraph (ENM topology + element instances).
        catalog: CatalogRepository (type library). None = no catalog available.
        case_id: Study case identifier.
        enm_revision: ENM snapshot/revision identifier.
        analysis_type: Target analysis type.
        config: Study case calculation config (optional, defaults used if None).

    Returns:
        SolverInputEnvelope with payload, eligibility, and provenance trace.
    """
    cfg = config or StudyCaseConfig()

    # Step 1: Check eligibility
    eligibility = check_eligibility(graph, catalog, analysis_type)

    # Step 2: Build payload and trace (even if ineligible, for diagnostics)
    trace_entries: list[ProvenanceEntry] = []
    payload_dict: dict[str, Any] = {}

    if analysis_type == SolverAnalysisType.PROTECTION:
        # Protection is stub — empty payload
        payload_dict = {}
    else:
        # Build common element lists
        buses = _build_bus_payloads(graph)
        branches = _build_branch_payloads(graph, catalog, trace_entries)
        transformers = _build_transformer_payloads(graph, catalog, trace_entries)
        inverters = _build_inverter_payloads(graph, trace_entries)
        switches = _build_switch_payloads(graph)

        if analysis_type in (
            SolverAnalysisType.SHORT_CIRCUIT_3F,
            SolverAnalysisType.SHORT_CIRCUIT_1F,
        ):
            sc_payload = ShortCircuitPayload(
                buses=buses,
                branches=branches,
                transformers=transformers,
                inverter_sources=inverters,
                switches=switches,
                c_factor=cfg.c_factor_max,
                thermal_time_seconds=cfg.thermal_time_seconds,
                include_inverter_contribution=cfg.include_inverter_contribution,
            )
            payload_dict = sc_payload.model_dump(mode="json")

        elif analysis_type == SolverAnalysisType.LOAD_FLOW:
            lf_payload = LoadFlowPayload(
                buses=buses,
                branches=branches,
                transformers=transformers,
                inverter_sources=inverters,
                switches=switches,
                base_mva=cfg.base_mva,
                max_iterations=cfg.max_iterations,
                tolerance=cfg.tolerance,
            )
            payload_dict = lf_payload.model_dump(mode="json")

    # Step 3: Build provenance summary
    summary = build_provenance_summary(trace_entries)

    # Step 4: Assemble envelope
    return SolverInputEnvelope(
        solver_input_version=SOLVER_INPUT_CONTRACT_VERSION,
        case_id=case_id,
        enm_revision=enm_revision,
        analysis_type=analysis_type,
        eligibility=eligibility,
        provenance_summary=_summary_to_schema(summary),
        payload=payload_dict,
        trace=_trace_to_schema(trace_entries),
    )
