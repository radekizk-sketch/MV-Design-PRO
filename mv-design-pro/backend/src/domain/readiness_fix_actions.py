"""
Readiness FixAction Resolver — maps readiness codes to FixAction suggestions.

Every BLOCKER readiness code MUST have a FixAction leading to a repair path.
WARNING/INFO codes MAY have FixActions.

This module is the SINGLE SOURCE OF TRUTH for code→FixAction mapping.
It bridges ReadinessIssueV1 (domain) with FixAction (ENM) without coupling.

INVARIANTS:
- Deterministic: same code + element → same FixAction
- No physics
- No model mutation
- All modal_type values MUST correspond to frontend ModalRegistry entries
"""

from __future__ import annotations

from collections.abc import Callable

from enm.fix_actions import FixAction

#: Fabryka FixAction: (element_id, element_type) -> FixAction. Typ byl dotad zapisany
#: TYLKO w komentarzu obok `type[object] | object`, wiec `resolve_fix_action` wolal
#: cos, co dla analizy nie bylo wolalne (`"object" not callable`).
FixActionFactory = Callable[[str | None, str | None], FixAction]

# ---------------------------------------------------------------------------
# Code → FixAction factory mapping
# ---------------------------------------------------------------------------


def resolve_fix_action(
    code: str,
    element_id: str | None = None,
    element_type: str | None = None,
) -> FixAction | None:
    """Resolve a FixAction for a given readiness code.

    Returns None if no FixAction is defined for the code.
    """
    factory = _FIX_ACTION_MAP.get(code)
    if factory is None:
        # Try prefix match for parametric codes (e.g., field.device_missing.cb)
        for prefix, pfx_factory in _PREFIX_FIX_ACTION_MAP.items():
            if code.startswith(prefix):
                return pfx_factory(element_id, element_type)
        return None
    return factory(element_id, element_type)


# ---------------------------------------------------------------------------
# Generator validation codes
# ---------------------------------------------------------------------------


def _fix_catalog_ref_missing(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="SELECT_CATALOG",
        element_ref=element_id,
        modal_type="CatalogPicker",
        payload_hint={"required": "catalog_ref"},
    )


def _fix_generator_connection_variant(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="GeneratorModal",
        payload_hint={"required": "connection_variant"},
    )


def _fix_generator_station_ref(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="GeneratorModal",
        payload_hint={"required": "station_ref"},
    )


def _fix_generator_block_transformer(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="TransformerModal",
        payload_hint={"required": "blocking_transformer_ref"},
    )


# ---------------------------------------------------------------------------
# Station field validation codes
# ---------------------------------------------------------------------------


def _fix_station_nn_without_transformer(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="ADD_MISSING_DEVICE",
        element_ref=element_id,
        modal_type="TransformerModal",
        payload_hint={"required": "transformer_field"},
    )


def _fix_field_device_missing(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="ADD_MISSING_DEVICE",
        element_ref=element_id,
        modal_type="FieldDeviceModal",
        payload_hint={"required": "apparatus"},
    )


def _fix_protection_binding_missing(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="ProtectionBindingModal",
        payload_hint={"required": "relay_to_cb_binding"},
    )


# ---------------------------------------------------------------------------
# Topology validation codes (W005-W008)
# ---------------------------------------------------------------------------


def _fix_topology_ref_invalid(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="NAVIGATE_TO_ELEMENT",
        element_ref=element_id,
        payload_hint={"action": "inspect_and_fix_references"},
    )


def _fix_graph_island(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="NAVIGATE_TO_ELEMENT",
        element_ref=element_id,
        payload_hint={"action": "connect_island_to_source"},
    )


# ---------------------------------------------------------------------------
# Load flow validation codes
# ---------------------------------------------------------------------------


def _fix_lf_convergence(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="StudyCaseSettings",
        payload_hint={"required": "convergence_settings"},
    )


def _fix_lf_damping(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="StudyCaseSettings",
        payload_hint={"required": "solver_damping"},
    )


# ---------------------------------------------------------------------------
# BranchPointSN validation codes
# ---------------------------------------------------------------------------


def _fix_branch_point_invalid_medium(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="NAVIGATE_TO_ELEMENT",
        element_ref=element_id,
        payload_hint={"action": "remove_or_replace_on_correct_segment_type"},
    )


def _fix_branch_point_catalog_ref(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="SELECT_CATALOG",
        element_ref=element_id,
        modal_type="BranchPointCatalogPicker",
        payload_hint={"required": "catalog_ref"},
    )


def _fix_branch_point_switch_state(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="BranchPointSwitchStateModal",
        payload_hint={"required": "switch_state"},
    )


def _fix_branch_point_port_occupied(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="NAVIGATE_TO_ELEMENT",
        element_ref=element_id,
        payload_hint={"action": "select_free_branch_port"},
    )


def _fix_branch_point_required_port(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="BranchPointPortsModal",
        payload_hint={"required": "branch_port_count"},
    )


def _fix_zksn_branch_count(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="InsertZksnForm",
        payload_hint={"required": "branch_ports_count"},
    )


def _fix_branch_connection_invalid_port(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="StartBranchModal",
        payload_hint={"required": "valid_branch_port"},
    )


def _fix_branch_connection_not_capable(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="NAVIGATE_TO_ELEMENT",
        element_ref=element_id,
        payload_hint={"action": "use_branch_capable_source_object"},
    )


def _fix_oze_transformer_required(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="AddTransformerModal",
        payload_hint={"required": "block_transformer_for_oze"},
    )


def _fix_bess_transformer_required(
    element_id: str | None,
    _et: str | None,
) -> FixAction:
    return FixAction(
        action_type="OPEN_MODAL",
        element_ref=element_id,
        modal_type="AddTransformerModal",
        payload_hint={"required": "block_transformer_for_bess"},
    )


# ---------------------------------------------------------------------------
# Mapping tables
# ---------------------------------------------------------------------------

_FIX_ACTION_MAP: dict[
    str,
    FixActionFactory,
] = {
    # Generator validation
    "catalog.ref_missing": _fix_catalog_ref_missing,
    "generator.connection_variant_missing": _fix_generator_connection_variant,
    "generator.station_ref_missing": _fix_generator_station_ref,
    "generator.station_ref_invalid": _fix_generator_station_ref,
    "generator.block_transformer_missing": _fix_generator_block_transformer,
    "generator.block_transformer_invalid": _fix_generator_block_transformer,
    "generator.connection_variant_invalid": _fix_generator_connection_variant,
    # Station field validation
    "station.nn_without_transformer": _fix_station_nn_without_transformer,
    "protection.binding_missing": _fix_protection_binding_missing,
    # Station field — generator variants
    "generator.nn_variant_requires_station_transformer": _fix_station_nn_without_transformer,
    "generator.block_variant_requires_block_transformer": _fix_generator_block_transformer,
    "generator.block_transformer_catalog_missing": _fix_catalog_ref_missing,
    # BranchPointSN validation
    "branch_point.invalid_parent_medium": _fix_branch_point_invalid_medium,
    "branch_point.catalog_ref_missing": _fix_branch_point_catalog_ref,
    "branch_point.switch_state_missing": _fix_branch_point_switch_state,
    "branch_point.branch_port_occupied": _fix_branch_point_port_occupied,
    "branch_point.required_port_missing": _fix_branch_point_required_port,
    "zksn.branch_count_invalid": _fix_zksn_branch_count,
    "branch_connection.invalid_source_port": _fix_branch_connection_invalid_port,
    "branch_connection.invalid_segment_family": _fix_branch_point_invalid_medium,
    "branch_connection.source_not_branch_capable": _fix_branch_connection_not_capable,
    # OZE / BESS
    "oze.transformer_required": _fix_oze_transformer_required,
    "bess.transformer_required": _fix_bess_transformer_required,
    # Topology warnings
    "E003": _fix_graph_island,
    "W005": _fix_topology_ref_invalid,
    "W006": _fix_topology_ref_invalid,
    "W007": _fix_topology_ref_invalid,
    "W008": _fix_topology_ref_invalid,
    # Load flow
    "LF_CONVERGENCE_TOLERANCE_INVALID": _fix_lf_convergence,
    "LF_CONVERGENCE_ITER_LIMIT_INVALID": _fix_lf_convergence,
    "LF_SOLVER_DAMPING_INVALID": _fix_lf_damping,
}

_PREFIX_FIX_ACTION_MAP: dict[
    str,
    FixActionFactory,
] = {
    "field.device_missing.": _fix_field_device_missing,
}


# ---------------------------------------------------------------------------
# Completeness check (for CI guard)
# ---------------------------------------------------------------------------

# All BLOCKER readiness codes that MUST have a FixAction
KNOWN_BLOCKER_CODES: frozenset[str] = frozenset(
    {
        # ENMValidator (already have FixAction in ValidationIssue)
        "E001",
        "E002",
        "E003",
        "E004",
        "E005",
        "E006",
        "E007",
        "sources.no_short_circuit_params",
        "E009",
        "E010",
        # Generator validation
        "catalog.ref_missing",
        "generator.connection_variant_missing",
        "generator.station_ref_missing",
        "generator.station_ref_invalid",
        "generator.block_transformer_missing",
        "generator.block_transformer_invalid",
        "generator.connection_variant_invalid",
        # Station field validation
        "station.nn_without_transformer",
        "protection.binding_missing",
        "generator.nn_variant_requires_station_transformer",
        "generator.block_variant_requires_block_transformer",
        "generator.block_transformer_catalog_missing",
        # Eligibility (already have FixAction in eligibility_service)
        "ELIG_SC3_MISSING_SOURCE",
        "ELIG_SC3_MISSING_BUSES",
        "ELIG_SC3_MISSING_CATALOG_REF",
        "ELIG_SC3_MISSING_IMPEDANCE",
        "ELIG_SC3_SOURCE_NO_SC_PARAMS",
        "ELIG_SC1_MISSING_Z0",
        "ELIG_LF_NO_LOADS_OR_GENERATORS",
        "ELIG_LF_BUS_NO_VOLTAGE",
        # Load flow
        "LF_SLACK_SINGLE_MISSING_SPEC",
        "LF_SLACK_SINGLE_EMPTY_NODE_ID",
        "LF_SLACK_DISTRIBUTED_MISSING_SPEC",
        "LF_SLACK_DISTRIBUTED_EMPTY",
        "LF_CUSTOM_INITIAL_EMPTY",
        # BranchPointSN (branch_pole / ZKSN)
        "branch_point.invalid_parent_medium",
        "branch_point.catalog_ref_missing",
        "branch_point.switch_state_missing",
        "branch_point.branch_port_occupied",
        "branch_point.required_port_missing",
        "zksn.branch_count_invalid",
        "branch_connection.invalid_source_port",
        "branch_connection.invalid_segment_family",
        "branch_connection.source_not_branch_capable",
        # OZE / BESS
        "oze.transformer_required",
        "bess.transformer_required",
    }
)

# Codes prefixes for device_missing (parametric)
KNOWN_BLOCKER_PREFIXES: frozenset[str] = frozenset(
    {
        "field.device_missing.",
    }
)


def check_blocker_fix_action_coverage() -> list[str]:
    """Check that all known BLOCKER codes have FixActions.

    Returns list of codes WITHOUT FixAction (should be empty for CI pass).
    """
    missing: list[str] = []
    for code in sorted(KNOWN_BLOCKER_CODES):
        result = resolve_fix_action(code, element_id="test")
        if result is None:
            # Check if ENMValidator already provides it (E001-E010, W001-W004)
            # Those have FixAction in ValidationIssue directly — skip them
            enm_validator_codes = {
                "E001",
                "E002",
                "E004",
                "E005",
                "E006",
                "E007",
                "sources.no_short_circuit_params",
                "E009",
                "E010",
            }
            eligibility_codes = {
                "ELIG_SC3_MISSING_SOURCE",
                "ELIG_SC3_MISSING_BUSES",
                "ELIG_SC3_MISSING_CATALOG_REF",
                "ELIG_SC3_MISSING_IMPEDANCE",
                "ELIG_SC3_SOURCE_NO_SC_PARAMS",
                "ELIG_SC1_MISSING_Z0",
                "ELIG_LF_NO_LOADS_OR_GENERATORS",
                "ELIG_LF_BUS_NO_VOLTAGE",
            }
            lf_with_fix = {
                "LF_SLACK_SINGLE_MISSING_SPEC",
                "LF_SLACK_SINGLE_EMPTY_NODE_ID",
                "LF_SLACK_DISTRIBUTED_MISSING_SPEC",
                "LF_SLACK_DISTRIBUTED_EMPTY",
                "LF_CUSTOM_INITIAL_EMPTY",
            }
            if code not in enm_validator_codes | eligibility_codes | lf_with_fix:
                missing.append(code)
    return missing
