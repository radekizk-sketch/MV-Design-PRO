"""
Eligibility gating for solver-input generation.

Determines whether a given analysis can be run based on the ENM state,
catalog completeness, and diagnostic preflight results. Reuses existing
diagnostic codes where possible.

NO physics calculations. NO heuristics. NO default values.
"""

from __future__ import annotations

from network_model.catalog.repository import CatalogRepository
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import NodeType
from network_model.core.switch import SwitchType
from solver_input.contracts import (
    AnalysisEligibilityEntry,
    EligibilityMap,
    EligibilityResult,
    SolverAnalysisType,
    SolverInputIssue,
    SolverInputIssueSeverity,
)


def _check_common_blockers(
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
) -> tuple[list[SolverInputIssue], list[SolverInputIssue]]:
    """Check blockers/warnings common to all analysis types."""
    blockers: list[SolverInputIssue] = []
    warnings: list[SolverInputIssue] = []

    # E-D01: At least one source (SLACK node) required
    slack_nodes = [n for n in graph.nodes.values() if n.node_type == NodeType.SLACK]
    if not slack_nodes:
        blockers.append(
            SolverInputIssue(
                code="E-D01",
                severity=SolverInputIssueSeverity.BLOCKER,
                message="No SLACK (grid supply) node in network",
            )
        )

    # Check branches for catalog_ref completeness
    for branch in sorted(graph.branches.values(), key=lambda b: b.id):
        if isinstance(branch, LineBranch):
            if branch.type_ref is None and branch.impedance_override is None:
                # Line/cable without catalog_ref and without override
                if branch.r_ohm_per_km == 0.0 and branch.x_ohm_per_km == 0.0:
                    blockers.append(
                        SolverInputIssue(
                            code="SI-001",
                            severity=SolverInputIssueSeverity.BLOCKER,
                            message=(
                                f"Branch '{branch.id}' has no catalog_ref, "
                                f"no impedance_override, and zero impedance"
                            ),
                            element_ref=branch.id,
                            field_path=f"branches[ref_id={branch.id}].type_ref",
                        )
                    )
                else:
                    warnings.append(
                        SolverInputIssue(
                            code="SI-002",
                            severity=SolverInputIssueSeverity.WARNING,
                            message=(
                                f"Branch '{branch.id}' uses instance parameters "
                                f"without catalog_ref (not catalog-first)"
                            ),
                            element_ref=branch.id,
                            field_path=f"branches[ref_id={branch.id}].type_ref",
                        )
                    )
            elif branch.type_ref is not None and catalog is not None:
                # Verify catalog_ref resolves
                is_cable = branch.branch_type == BranchType.CABLE
                found = (
                    catalog.get_cable_type(branch.type_ref)
                    if is_cable
                    else catalog.get_line_type(branch.type_ref)
                )
                if found is None:
                    blockers.append(
                        SolverInputIssue(
                            code="SI-003",
                            severity=SolverInputIssueSeverity.BLOCKER,
                            message=(
                                f"Branch '{branch.id}' catalog_ref "
                                f"'{branch.type_ref}' not found in catalog"
                            ),
                            element_ref=branch.id,
                            field_path=f"branches[ref_id={branch.id}].type_ref",
                        )
                    )

        elif isinstance(branch, TransformerBranch):
            if branch.type_ref is None:
                if branch.rated_power_mva <= 0 or branch.uk_percent <= 0:
                    blockers.append(
                        SolverInputIssue(
                            code="SI-004",
                            severity=SolverInputIssueSeverity.BLOCKER,
                            message=(
                                f"Transformer '{branch.id}' has no catalog_ref "
                                f"and invalid nameplate parameters"
                            ),
                            element_ref=branch.id,
                            field_path=f"transformers[ref_id={branch.id}].type_ref",
                        )
                    )
                else:
                    warnings.append(
                        SolverInputIssue(
                            code="SI-005",
                            severity=SolverInputIssueSeverity.WARNING,
                            message=(
                                f"Transformer '{branch.id}' uses instance "
                                f"parameters without catalog_ref"
                            ),
                            element_ref=branch.id,
                            field_path=f"transformers[ref_id={branch.id}].type_ref",
                        )
                    )
            elif catalog is not None:
                found = catalog.get_transformer_type(branch.type_ref)
                if found is None:
                    blockers.append(
                        SolverInputIssue(
                            code="SI-006",
                            severity=SolverInputIssueSeverity.BLOCKER,
                            message=(
                                f"Transformer '{branch.id}' catalog_ref "
                                f"'{branch.type_ref}' not found in catalog"
                            ),
                            element_ref=branch.id,
                            field_path=f"transformers[ref_id={branch.id}].type_ref",
                        )
                    )

    # Check connectivity
    if graph.nodes and not graph.is_connected():
        warnings.append(
            SolverInputIssue(
                code="SI-007",
                severity=SolverInputIssueSeverity.WARNING,
                message="Network graph is not fully connected (islands detected)",
            )
        )

    return blockers, warnings


def check_eligibility(
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
    analysis_type: SolverAnalysisType,
) -> EligibilityResult:
    """
    Check eligibility for a specific analysis type.

    Returns EligibilityResult with eligible=True only if no BLOCKER issues exist.
    """
    blockers, warnings = _check_common_blockers(graph, catalog)

    if analysis_type == SolverAnalysisType.PROTECTION:
        # Protection analysis (overcurrent v1, IEC 60255 IDMT) consumes SC results
        # read-only — see docs/analysis/PROTECTION_CONTRACTS.md.
        #
        # Eligibility prerequisites (NetworkGraph-level, no heuristics):
        #   1. At least one BREAKER or RECLOSER apparatus exists in the graph
        #      (something to protect with). Switches of type DISCONNECTOR /
        #      LOAD_SWITCH / FUSE / EARTH_SWITCH do not interrupt fault current
        #      and therefore do not count as protected apparatus for overcurrent
        #      analysis.
        #   2. SLACK (grid supply) node exists — already enforced by E-D01 in
        #      _check_common_blockers above.
        #
        # Per-assignment validation (relay settings, CT/VT bindings, curve
        # parameters) is performed at run-time by protection_engine_v1, not at
        # eligibility gating — because eligibility runs before catalog binding /
        # materialization for the protection device tree (ProtectionAssignment
        # lives in ENM, not in NetworkGraph).
        protectable_apparatus = [
            switch
            for switch in graph.switches.values()
            if switch.switch_type in (SwitchType.BREAKER, SwitchType.RECLOSER)
        ]
        if not protectable_apparatus:
            blockers.append(
                SolverInputIssue(
                    code="SI-100",
                    severity=SolverInputIssueSeverity.BLOCKER,
                    message=(
                        "Protection analysis requires at least one BREAKER or "
                        "RECLOSER apparatus in the network (no protectable "
                        "switching device found)"
                    ),
                )
            )

    # Sort issues deterministically
    blockers.sort(key=lambda i: (i.code, i.element_ref or "", i.message))
    warnings.sort(key=lambda i: (i.code, i.element_ref or "", i.message))

    return EligibilityResult(
        eligible=len(blockers) == 0,
        blockers=blockers,
        warnings=warnings,
    )


def build_eligibility_map(
    graph: NetworkGraph,
    catalog: CatalogRepository | None,
) -> EligibilityMap:
    """Build eligibility map for all analysis types."""
    entries: list[AnalysisEligibilityEntry] = []
    for at in sorted(SolverAnalysisType, key=lambda t: t.value):
        result = check_eligibility(graph, catalog, at)
        entries.append(
            AnalysisEligibilityEntry(
                analysis_type=at,
                eligible=result.eligible,
                blockers=result.blockers,
                warnings=result.warnings,
            )
        )
    return EligibilityMap(entries=entries)
