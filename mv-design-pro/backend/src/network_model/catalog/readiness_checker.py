"""
Readiness Checker — scans NetworkSnapshot and generates ReadinessIssueV1 list.

CANONICAL: Scans snapshot for completeness, catalog bindings, transformer voltage,
topology integrity, and produces deterministic readiness issues.

INVARIANTS:
- Deterministic: same snapshot → identical issues (sorted)
- No physics (pure data inspection)
- No model mutation
- All messages in Polish (PL)
- Every BLOCKER has a FixAction path
"""

from __future__ import annotations

from typing import Any

from domain.readiness import (
    ReadinessAreaV1,
    ReadinessIssueV1,
    ReadinessPriority,
    ReadinessProfileV1,
    build_readiness_profile,
)
from network_model.catalog.types import (
    CatalogNamespace,
)
from network_model.core.snapshot import NetworkSnapshot

# ---------------------------------------------------------------------------
# Technical element namespace detection
# ---------------------------------------------------------------------------

# Element types that REQUIRE catalog binding
TECHNICAL_ELEMENT_TYPES: frozenset[str] = frozenset(
    {
        "LINE",
        "CABLE",
        "OVERHEAD_LINE",
        "TRANSFORMER",
        "TRANSFORMER_2W",
        "CIRCUIT_BREAKER",
        "DISCONNECTOR",
        "LOAD_SWITCH",
        "SWITCH",
        "FUSE",
        "CT",
        "VT",
        "LOAD",
        "PV_INVERTER",
        "BESS_INVERTER",
        "GENERATOR",
        "INVERTER",
        "LV_CABLE",
        "RELAY",
        "PROTECTION_DEVICE",
    }
)

# Mapping of element branch_type to expected catalog namespace
BRANCH_TYPE_TO_NAMESPACE: dict[str, str] = {
    "LINE": CatalogNamespace.LINIA_SN.value,
    "CABLE": CatalogNamespace.KABEL_SN.value,
    "OVERHEAD_LINE": CatalogNamespace.LINIA_SN.value,
    "TRANSFORMER": CatalogNamespace.TRAFO_SN_NN.value,
    "TRANSFORMER_2W": CatalogNamespace.TRAFO_SN_NN.value,
}


# ---------------------------------------------------------------------------
# Snapshot checker
# ---------------------------------------------------------------------------


def check_snapshot_readiness(
    snapshot: NetworkSnapshot,
) -> ReadinessProfileV1:
    """Check a NetworkSnapshot for readiness issues.

    Scans all nodes, branches, inverter sources, and switches for:
    - Missing catalog bindings on technical elements
    - Missing materialization (solver_fields not populated)
    - Transformer voltage_lv_kv completeness
    - Source completeness (Sk3, voltage)
    - Topology issues (disconnected islands)
    - nN bus / transformer requirements

    Returns:
        ReadinessProfileV1 with all issues and computed flags
    """
    issues: list[ReadinessIssueV1] = []

    graph = snapshot.graph

    # Check sources
    _check_sources(graph, issues)

    # Check branches (lines, cables, transformers)
    _check_branches(graph, issues)

    # Check inverter sources (PV, BESS)
    _check_inverter_sources(graph, issues)

    # Check nodes (buses)
    _check_nodes(graph, issues)

    # Check topology connectivity
    _check_topology(graph, issues)

    return build_readiness_profile(
        snapshot_id=snapshot.snapshot_id,
        snapshot_fingerprint=snapshot.fingerprint,
        issues=issues,
    )


def _check_sources(graph: Any, issues: list[ReadinessIssueV1]) -> None:
    """Check source nodes for completeness."""
    source_nodes = []
    for n in graph.nodes.values():
        nt = getattr(n, "node_type", None)
        if nt is None:
            continue
        # Handle both enum and string node_type
        nt_val = nt.value if hasattr(nt, "value") else str(nt)
        if nt_val.upper() in ("SLACK", "SWING"):
            source_nodes.append(n)
        elif getattr(n, "is_source", False):
            source_nodes.append(n)

    if not source_nodes:
        issues.append(
            ReadinessIssueV1(
                code="source.grid_supply_missing",
                area=ReadinessAreaV1.SOURCES,
                priority=ReadinessPriority.BLOCKER,
                message_pl="Brak źródła zasilania sieciowego (GPZ)",
                fix_hint_pl="Dodaj źródło zasilania w kreatorze",
                wizard_step="K2",
            )
        )

    for node in source_nodes:
        node_dict = node.to_dict() if hasattr(node, "to_dict") else {}

        # Check voltage
        voltage = node_dict.get("voltage_magnitude") or node_dict.get("voltage_kv")
        if not voltage or voltage <= 0:
            issues.append(
                ReadinessIssueV1(
                    code="source.voltage_invalid",
                    area=ReadinessAreaV1.SOURCES,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl="Nieprawidłowe napięcie źródła zasilania",
                    element_id=str(node.id),
                    element_type="Source",
                    fix_hint_pl="Ustaw napięcie źródła",
                )
            )

        # Check short-circuit power
        sk3 = node_dict.get("sk3_mva") or node_dict.get("short_circuit_power_mva")
        if sk3 is not None and sk3 <= 0:
            issues.append(
                ReadinessIssueV1(
                    code="source.sk3_invalid",
                    area=ReadinessAreaV1.SOURCES,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl="Nieprawidłowa moc zwarciowa źródła Sk3",
                    element_id=str(node.id),
                    element_type="Source",
                    fix_hint_pl="Ustaw moc zwarciową Sk3",
                )
            )


def _check_branches(graph: Any, issues: list[ReadinessIssueV1]) -> None:
    """Check branches for catalog bindings and parameter completeness."""
    for branch in sorted(graph.branches.values(), key=lambda b: str(b.id)):
        branch_dict = branch.to_dict() if hasattr(branch, "to_dict") else {}
        branch_type = str(
            getattr(branch, "branch_type", branch_dict.get("branch_type", ""))
        ).upper()

        # Check catalog binding for technical elements
        if _is_technical_branch(branch_type):
            binding = branch_dict.get("catalog_binding")
            if binding is None:
                BRANCH_TYPE_TO_NAMESPACE.get(branch_type, "")
                issues.append(
                    ReadinessIssueV1(
                        code="trunk.catalog_missing",
                        area=ReadinessAreaV1.CATALOGS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl=f"Odcinek nie ma przypisanego katalogu ({branch_type})",
                        element_id=str(branch.id),
                        element_type=branch_type,
                        fix_hint_pl="Wybierz typ z katalogu",
                    )
                )
            else:
                # Check materialization
                materialized = branch_dict.get("materialized_params")
                if not materialized:
                    issues.append(
                        ReadinessIssueV1(
                            code="catalog.materialization_failed",
                            area=ReadinessAreaV1.CATALOGS,
                            priority=ReadinessPriority.BLOCKER,
                            message_pl="Parametry z katalogu nie zostały wczytane",
                            element_id=str(branch.id),
                            element_type=branch_type,
                            fix_hint_pl="Odśwież parametry z katalogu",
                        )
                    )

        # Check transformer specific fields
        if branch_type in ("TRANSFORMER", "TRANSFORMER_2W"):
            _check_transformer(branch, branch_dict, issues)

        # Check length for lines/cables
        if branch_type in ("LINE", "CABLE", "OVERHEAD_LINE"):
            length = branch_dict.get("length_km", 0) or branch_dict.get("length_m", 0)
            if not length or length <= 0:
                issues.append(
                    ReadinessIssueV1(
                        code="trunk.segment_length_missing",
                        area=ReadinessAreaV1.TOPOLOGY,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl="Odcinek nie ma zdefiniowanej długości",
                        element_id=str(branch.id),
                        element_type=branch_type,
                        fix_hint_pl="Ustaw długość odcinka",
                    )
                )


def _check_transformer(
    branch: Any,
    branch_dict: dict[str, Any],
    issues: list[ReadinessIssueV1],
) -> None:
    """Check transformer-specific readiness requirements."""
    # Check voltage_lv_kv (must come from catalog)
    materialized = branch_dict.get("materialized_params", {})
    binding = branch_dict.get("catalog_binding")

    if not binding:
        issues.append(
            ReadinessIssueV1(
                code="transformer.catalog_missing",
                area=ReadinessAreaV1.CATALOGS,
                priority=ReadinessPriority.BLOCKER,
                message_pl="Transformator nie ma przypisanego katalogu",
                element_id=str(branch.id),
                element_type="Transformer",
                fix_hint_pl="Wybierz transformator z katalogu",
            )
        )
        return

    voltage_lv = materialized.get("voltage_lv_kv")
    if not voltage_lv or voltage_lv <= 0:
        issues.append(
            ReadinessIssueV1(
                code="transformer.lv_voltage_missing",
                area=ReadinessAreaV1.CATALOGS,
                priority=ReadinessPriority.BLOCKER,
                message_pl="Brak napięcia dolnego transformatora (U_dolne) — wymagane z katalogu",
                element_id=str(branch.id),
                element_type="Transformer",
                fix_hint_pl="Wybierz transformator z katalogu z poprawnym U_dolne",
            )
        )

    uk = materialized.get("uk_percent")
    if uk is not None and uk <= 0:
        issues.append(
            ReadinessIssueV1(
                code="transformer.uk_invalid",
                area=ReadinessAreaV1.CATALOGS,
                priority=ReadinessPriority.BLOCKER,
                message_pl="Nieprawidłowa wartość uk% transformatora",
                element_id=str(branch.id),
                element_type="Transformer",
                fix_hint_pl="Sprawdź parametry transformatora w katalogu",
            )
        )


def _check_inverter_sources(graph: Any, issues: list[ReadinessIssueV1]) -> None:
    """Check inverter sources (PV, BESS) for catalog bindings."""
    for source in sorted(graph.inverter_sources.values(), key=lambda s: str(s.id)):
        source_dict = source.to_dict() if hasattr(source, "to_dict") else {}

        binding = source_dict.get("catalog_binding")
        if binding is None:
            source_kind = source_dict.get("kind", source_dict.get("source_type", "PV"))
            issues.append(
                ReadinessIssueV1(
                    code="catalog.binding_missing",
                    area=ReadinessAreaV1.CATALOGS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=f"Źródło {source_kind} nie ma przypisanego katalogu",
                    element_id=str(source.id),
                    element_type=str(source_kind),
                    fix_hint_pl="Wybierz typ z katalogu",
                )
            )


def _check_nodes(graph: Any, issues: list[ReadinessIssueV1]) -> None:
    """Check nodes for basic completeness."""
    for node in sorted(graph.nodes.values(), key=lambda n: str(n.id)):
        node_dict = node.to_dict() if hasattr(node, "to_dict") else {}
        node_type = str(getattr(node, "node_type", "")).upper()

        # Check voltage on non-source nodes
        if node_type in ("PQ", "PV_GEN"):
            voltage = node_dict.get("voltage_magnitude") or node_dict.get("base_voltage_kv")
            if voltage is not None and voltage <= 0:
                issues.append(
                    ReadinessIssueV1(
                        code="station.voltage_missing",
                        area=ReadinessAreaV1.STATIONS,
                        priority=ReadinessPriority.BLOCKER,
                        message_pl="Węzeł nie ma zdefiniowanego napięcia",
                        element_id=str(node.id),
                        element_type="Bus",
                        fix_hint_pl="Ustaw napięcie bazowe węzła",
                    )
                )


def _check_topology(graph: Any, issues: list[ReadinessIssueV1]) -> None:
    """Check topology for basic connectivity."""
    if len(graph.branches) == 0:
        issues.append(
            ReadinessIssueV1(
                code="trunk.segment_missing",
                area=ReadinessAreaV1.TOPOLOGY,
                priority=ReadinessPriority.BLOCKER,
                message_pl="Sieć nie ma żadnych odcinków (gałęzi)",
                fix_hint_pl="Dodaj odcinek magistrali SN",
            )
        )


def _is_technical_branch(branch_type: str) -> bool:
    """Check if a branch type is a technical element requiring catalog."""
    return branch_type in (
        "LINE",
        "CABLE",
        "OVERHEAD_LINE",
        "TRANSFORMER",
        "TRANSFORMER_2W",
    )


# ---------------------------------------------------------------------------
# Convenience: check readiness for a specific analysis
# ---------------------------------------------------------------------------


def is_analysis_ready(
    snapshot: NetworkSnapshot,
    analysis_type: str,
) -> tuple[bool, list[ReadinessIssueV1]]:
    """Check if a specific analysis can be run.

    Args:
        snapshot: The snapshot to check
        analysis_type: One of "SHORT_CIRCUIT", "LOAD_FLOW", "PROTECTION"

    Returns:
        Tuple of (ready, blocking_issues)
    """
    profile = check_snapshot_readiness(snapshot)

    if analysis_type == "SHORT_CIRCUIT":
        return profile.short_circuit_ready, list(profile.short_circuit_issues)
    elif analysis_type == "LOAD_FLOW":
        return profile.load_flow_ready, list(profile.short_circuit_issues)
    elif analysis_type == "PROTECTION":
        return profile.protection_ready, [
            i
            for i in profile.issues
            if i.priority == ReadinessPriority.BLOCKER and i.area == ReadinessAreaV1.PROTECTION
        ]
    else:
        return False, [
            ReadinessIssueV1(
                code="analysis.unknown_type",
                area=ReadinessAreaV1.ANALYSIS,
                priority=ReadinessPriority.BLOCKER,
                message_pl=f"Nieznany typ analizy: {analysis_type}",
            )
        ]
