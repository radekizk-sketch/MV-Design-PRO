"""
Eligibility gating for solver-input generation.

Determines whether a given analysis can be run based on the ENM state,
catalog completeness, and diagnostic preflight results. Reuses existing
diagnostic codes where possible.

NO physics calculations. NO heuristics. NO default values.
"""

from __future__ import annotations

from typing import Any

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


def _resolve_transformer_nameplate_source(
    branch: TransformerBranch, catalog: CatalogRepository | None
) -> TransformerBranch | Any | None:
    """Skąd czytać i0_percent/p0_kw/vector_group dla TEGO transformatora.

    Zwraca `branch` samą siebie (brak `type_ref` — dane instancji rządzą),
    rozwiązany `TransformerType` (`type_ref` trafia w katalog), albo `None`
    gdy transformator jest JUŻ zablokowany gdzie indziej (brak `type_ref` i
    nieprawidłowe znamiona instancji — SI-004; `type_ref` nie trafia w katalog
    — SI-006) — sprawdzanie i0/p0/vector_group takiego transformatora
    dokładałoby drugi komunikat do czegoś, co i tak nie policzy się w ogóle.
    """
    if branch.type_ref is None:
        if branch.rated_power_mva <= 0 or branch.uk_percent <= 0:
            return None
        return branch
    if catalog is None:
        return None
    return catalog.get_transformer_type(branch.type_ref)


def _check_transformer_no_load_params(
    branch: TransformerBranch,
    source: TransformerBranch | Any,
    warnings: list[SolverInputIssue],
) -> None:
    """D2: gałąź magnesująca (i0/p0) nieznana != cichy 0.0 — WARNING, nie blokada.

    Dotyczy WSZYSTKICH typów analizy jednakowo (IEC 60909 zwarć jej nie
    potrzebuje; rozpływ traci wyłącznie dokładność strat jałowych) — w
    odróżnieniu od `vector_group`, który blokuje TYLKO analizy zależne od
    składowej zerowej (patrz `check_eligibility`, SHORT_CIRCUIT_1F).
    """
    if source.i0_percent is None or source.p0_kw is None:
        warnings.append(
            SolverInputIssue(
                code="transformer.no_load_params_missing",
                severity=SolverInputIssueSeverity.WARNING,
                message=(
                    f"Transformer '{branch.id}' has no i0_percent/p0_kw — "
                    "magnetizing branch is not represented in the load-flow input"
                ),
                element_ref=branch.id,
                field_path=f"transformers[ref_id={branch.id}].i0_percent",
            )
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

            # D2: gałąź magnesująca nieznana — jednakowo dla wszystkich typów
            # analizy (WARNING, nie blokada). Pomijana, gdy transformator jest
            # już zablokowany powyżej (SI-004/SI-006) — patrz docstring resolvera.
            nameplate_source = _resolve_transformer_nameplate_source(branch, catalog)
            if nameplate_source is not None:
                _check_transformer_no_load_params(branch, nameplate_source, warnings)

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

    if analysis_type == SolverAnalysisType.SHORT_CIRCUIT_1F:
        # D2: grupa połączeń transformatora BLOKUJE wyłącznie analizy zależne
        # od składowej zerowej (zwarcie 1-fazowe doziemne) — SHORT_CIRCUIT_3F
        # (skladowa zgodna, zbalansowana) i LOAD_FLOW jej nie potrzebują.
        for branch in sorted(graph.branches.values(), key=lambda b: b.id):
            if not isinstance(branch, TransformerBranch):
                continue
            source = _resolve_transformer_nameplate_source(branch, catalog)
            if source is not None and source.vector_group is None:
                blockers.append(
                    SolverInputIssue(
                        code="transformer.vector_group_missing",
                        severity=SolverInputIssueSeverity.BLOCKER,
                        message=(
                            f"Transformer '{branch.id}' has no vector_group — "
                            "1-phase (earth fault) short circuit cannot determine "
                            "zero-sequence behaviour"
                        ),
                        element_ref=branch.id,
                        field_path=f"transformers[ref_id={branch.id}].vector_group",
                    )
                )

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
