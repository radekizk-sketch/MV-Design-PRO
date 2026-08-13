"""
Reguły diagnostyczne E-Dxx (v4.2).

Każda reguła przyjmuje NetworkGraph i zwraca listę DiagnosticIssue.
Reguły NIE mutują grafu — są czysto odczytowe.

Kody:
    E-D01..E-D05, E-D07 — BLOCKER (blokuje solwer)
    E-D06, W-D01..W-D03 — WARN (ograniczenie analiz)
    I-D01..I-D02 — INFO (informacyjne)

Numeracja ma lukę na E-D08 celowo. Pod tym kodem żyła ZAŚLEPKA
(`rule_e_d08_frequency_conflict`) — deklarowała kontrolę sprzecznych
częstotliwości, ale zwracała pustą listę ZAWSZE, bo reguły dostają
`NetworkGraph`, który częstotliwości nie przenosi. Warunek jest realny i ma
realnego odbiorcę (kontrakt V12.6 bierze częstotliwość bazową z pierwszej
szyny), więc został WDROŻONY tam, gdzie leżą dane: `ENMValidator`, kod W009.
Jeden warunek = jeden kod, dlatego kod E-D08 nie wraca.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .models import DiagnosticIssue, DiagnosticSeverity

if TYPE_CHECKING:
    from network_model.core.graph import NetworkGraph


# ---------------------------------------------------------------------------
# BLOCKER rules (E-Dxx)
# ---------------------------------------------------------------------------


def rule_e_d01_no_source(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D01: Brak źródła zasilania (SLACK lub falownik)."""
    from network_model.core.node import NodeType

    has_slack = any(n.node_type == NodeType.SLACK for n in graph.nodes.values())
    has_inverter = bool(hasattr(graph, "inverter_sources") and graph.inverter_sources)

    if not has_slack and not has_inverter:
        return [
            DiagnosticIssue(
                code="E-D01",
                severity=DiagnosticSeverity.BLOCKER,
                message_pl=(
                    "Sieć nie posiada żadnego źródła zasilania. "
                    "Wymagana jest co najmniej jedna szyna SLACK "
                    "lub źródło falownikowe"
                ),
                hints=(
                    "Dodaj szynę typu SLACK (węzeł referencyjny)",
                    "Lub dodaj źródło falownikowe (OZE)",
                ),
            )
        ]
    return []


def rule_e_d02_voltage_mismatch(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D02: Niespójne poziomy napięć na połączeniu linia/kabel."""
    from network_model.core.branch import BranchType

    issues: list[DiagnosticIssue] = []
    for branch_id, branch in sorted(graph.branches.items()):
        if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
            from_node = graph.nodes.get(branch.from_node_id)
            to_node = graph.nodes.get(branch.to_node_id)
            if from_node is None or to_node is None:
                continue
            if (
                from_node.voltage_level > 0
                and to_node.voltage_level > 0
                and from_node.voltage_level != to_node.voltage_level
            ):
                issues.append(
                    DiagnosticIssue(
                        code="E-D02",
                        severity=DiagnosticSeverity.BLOCKER,
                        message_pl=(
                            f"Gałąź '{branch.name}' łączy szyny o różnych "
                            f"napięciach: {from_node.voltage_level} kV i "
                            f"{to_node.voltage_level} kV"
                        ),
                        affected_refs=(branch_id, branch.from_node_id, branch.to_node_id),
                        hints=(
                            "Wyrównaj napięcia znamionowe szyn",
                            "Jeśli potrzebna zmiana napięcia — użyj transformatora",
                        ),
                    )
                )
    return issues


def rule_e_d03_disconnected_islands(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D03: Brak ciągłości topologicznej (izolowane wyspy)."""
    if not graph.nodes:
        return []

    if graph.is_connected():
        return []

    islands = graph.find_islands()
    isolated_node_ids: list[str] = []
    for island in islands[1:]:  # skip the main island
        isolated_node_ids.extend(island)

    return [
        DiagnosticIssue(
            code="E-D03",
            severity=DiagnosticSeverity.BLOCKER,
            message_pl=(
                f"Sieć jest niespójna — wykryto {len(islands)} wysp. "
                f"Izolowane węzły: {len(isolated_node_ids)}"
            ),
            affected_refs=tuple(sorted(isolated_node_ids)),
            hints=(
                "Połącz wyspy gałęziami lub łącznikami",
                "Albo usuń odłączone elementy z modelu",
            ),
        )
    ]


def rule_e_d04_transformer_missing_sides(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D04: Transformator bez strony GN lub DN."""
    from network_model.core.branch import BranchType, TransformerBranch

    issues: list[DiagnosticIssue] = []
    node_ids = set(graph.nodes.keys())

    for branch_id, branch in sorted(graph.branches.items()):
        if branch.branch_type == BranchType.TRANSFORMER:
            missing_sides: list[str] = []
            if branch.from_node_id not in node_ids:
                missing_sides.append("GN (from_node)")
            if branch.to_node_id not in node_ids:
                missing_sides.append("DN (to_node)")
            if isinstance(branch, TransformerBranch):
                if branch.voltage_hv_kv <= 0:
                    missing_sides.append("napięcie GN")
                if branch.voltage_lv_kv <= 0:
                    missing_sides.append("napięcie DN")
            if missing_sides:
                issues.append(
                    DiagnosticIssue(
                        code="E-D04",
                        severity=DiagnosticSeverity.BLOCKER,
                        message_pl=(
                            f"Transformator '{branch.name}' — brak: " f"{', '.join(missing_sides)}"
                        ),
                        affected_refs=(branch_id,),
                        hints=("Uzupełnij brakujące parametry transformatora",),
                    )
                )
    return issues


def rule_e_d05_line_no_impedance(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D05: Linia/kabel bez impedancji (Z1 = 0)."""
    from network_model.core.branch import BranchType, LineBranch

    issues: list[DiagnosticIssue] = []
    for branch_id, branch in sorted(graph.branches.items()):
        if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
            if isinstance(branch, LineBranch):
                if branch.type_ref is not None:
                    continue
                if branch.impedance_override is not None:
                    continue
                if branch.r_ohm_per_km == 0 and branch.x_ohm_per_km == 0:
                    issues.append(
                        DiagnosticIssue(
                            code="E-D05",
                            severity=DiagnosticSeverity.BLOCKER,
                            message_pl=(
                                f"Gałąź '{branch.name}' — impedancja zerowa "
                                f"(R=0, X=0). Macierz admitancji będzie osobliwa"
                            ),
                            affected_refs=(branch_id,),
                            hints=(
                                "Ustaw R i/lub X > 0 [Ω/km]",
                                "Lub przypisz typ z katalogu",
                            ),
                        )
                    )
    return issues


def rule_e_d06_sc1f_no_zero_sequence(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D06: Zwarcie jednofazowe niedostępne — brak Z0 w torze.

    Severity: WARN (nie BLOCKER) — blokuje TYLKO SC 1F, nie cały system.
    """
    from network_model.core.branch import BranchType, LineBranch

    lines_without_z0: list[str] = []
    for branch_id, branch in sorted(graph.branches.items()):
        if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
            if isinstance(branch, LineBranch):
                # Z0 data is not modeled in the current LineBranch —
                # absence means SC 1F is blocked
                has_z0 = False
                if branch.type_ref is not None:
                    # Catalog types may have Z0 — assume available
                    has_z0 = True
                if not has_z0:
                    lines_without_z0.append(branch_id)

    if lines_without_z0:
        return [
            DiagnosticIssue(
                code="E-D06",
                severity=DiagnosticSeverity.WARN,
                message_pl=(
                    f"Zwarcie jednofazowe niedostępne — "
                    f"{len(lines_without_z0)} gałęzi bez danych Z0 (impedancja zerowa)"
                ),
                affected_refs=tuple(sorted(lines_without_z0)),
                hints=(
                    "Uzupełnij dane impedancji zerowej (R0, X0) dla gałęzi",
                    "Lub przypisz typ z katalogu zawierający dane Z0",
                ),
            )
        ]
    return []


def rule_e_d07_open_switches_isolate(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """E-D07: Otwarte łączniki izolują część sieci."""
    if not hasattr(graph, "switches") or not graph.switches:
        return []

    # Check if any open switches cause disconnection
    open_switch_ids: list[str] = []
    for switch_id, switch in sorted(graph.switches.items()):
        if switch.is_open and switch.in_service:
            open_switch_ids.append(switch_id)

    if not open_switch_ids:
        return []

    # If network is already disconnected and has open switches, flag them
    if not graph.is_connected():
        return [
            DiagnosticIssue(
                code="E-D07",
                severity=DiagnosticSeverity.BLOCKER,
                message_pl=(
                    f"Otwarte łączniki ({len(open_switch_ids)}) mogą izolować "
                    f"część sieci. Sieć jest niespójna"
                ),
                affected_refs=tuple(sorted(open_switch_ids)),
                hints=(
                    "Zamknij łączniki potrzebne do zachowania ciągłości",
                    "Lub dodaj alternatywne połączenia",
                ),
            )
        ]
    return []


# ---------------------------------------------------------------------------
# WARNING rules (W-Dxx)
# ---------------------------------------------------------------------------


def rule_w_d01_no_zero_sequence_data(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """W-D01: Brak danych Z0 — ograniczenie analiz."""
    from network_model.core.branch import BranchType, LineBranch

    count = 0
    refs: list[str] = []
    for branch_id, branch in sorted(graph.branches.items()):
        if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
            if isinstance(branch, LineBranch):
                if branch.type_ref is None:
                    count += 1
                    refs.append(branch_id)

    if count > 0:
        return [
            DiagnosticIssue(
                code="W-D01",
                severity=DiagnosticSeverity.WARN,
                message_pl=(
                    f"{count} gałęzi bez danych impedancji zerowej (Z0). "
                    f"Analiza zwarcia jednofazowego może być niedostępna"
                ),
                affected_refs=tuple(sorted(refs)),
                hints=("Uzupełnij dane Z0 lub przypisz typy z katalogu",),
            )
        ]
    return []


def rule_w_d02_extreme_parameters(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """W-D02: Parametry graniczne poza typowymi zakresami."""
    from network_model.core.branch import BranchType, LineBranch

    issues: list[DiagnosticIssue] = []
    for branch_id, branch in sorted(graph.branches.items()):
        if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
            if isinstance(branch, LineBranch):
                if branch.length_km > 100:
                    issues.append(
                        DiagnosticIssue(
                            code="W-D02",
                            severity=DiagnosticSeverity.WARN,
                            message_pl=(
                                f"Gałąź '{branch.name}' — długość "
                                f"{branch.length_km} km przekracza typowy "
                                f"zakres dla sieci SN"
                            ),
                            affected_refs=(branch_id,),
                            hints=("Sprawdź poprawność długości gałęzi",),
                        )
                    )
                if branch.r_ohm_per_km > 10:
                    issues.append(
                        DiagnosticIssue(
                            code="W-D02",
                            severity=DiagnosticSeverity.WARN,
                            message_pl=(
                                f"Gałąź '{branch.name}' — rezystancja "
                                f"{branch.r_ohm_per_km} Ω/km jest nietypowo wysoka"
                            ),
                            affected_refs=(branch_id,),
                            hints=("Sprawdź poprawność parametru R [Ω/km]",),
                        )
                    )

    # Check bus voltages for extreme values
    for node_id, node in sorted(graph.nodes.items()):
        if node.voltage_level > 400:
            issues.append(
                DiagnosticIssue(
                    code="W-D02",
                    severity=DiagnosticSeverity.WARN,
                    message_pl=(
                        f"Szyna '{node.name}' — napięcie {node.voltage_level} kV "
                        f"przekracza typowy zakres systemu SN/WN"
                    ),
                    affected_refs=(node_id,),
                    hints=("Sprawdź poprawność napięcia znamionowego",),
                )
            )

    return issues


def rule_w_d03_multiple_sources(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """W-D03: Nadmiar źródeł bez koordynacji."""
    from network_model.core.node import NodeType

    slack_count = sum(1 for n in graph.nodes.values() if n.node_type == NodeType.SLACK)
    inverter_count = len(graph.inverter_sources) if hasattr(graph, "inverter_sources") else 0
    total_sources = slack_count + inverter_count

    if total_sources > 5:
        return [
            DiagnosticIssue(
                code="W-D03",
                severity=DiagnosticSeverity.WARN,
                message_pl=(
                    f"Sieć zawiera {total_sources} źródeł zasilania "
                    f"({slack_count} SLACK + {inverter_count} falownikowych). "
                    f"Sprawdź koordynację"
                ),
                hints=(
                    "Zweryfikuj koordynację zabezpieczeń przy wielu źródłach",
                    "Upewnij się, że jest dokładnie jedna szyna SLACK",
                ),
            )
        ]
    return []


# ---------------------------------------------------------------------------
# INFO rules (I-Dxx)
# ---------------------------------------------------------------------------


def rule_i_d01_full_analysis_available(
    blockers: list[DiagnosticIssue],
) -> list[DiagnosticIssue]:
    """I-D01: Analizy dostępne w pełnym zakresie."""
    if not blockers:
        return [
            DiagnosticIssue(
                code="I-D01",
                severity=DiagnosticSeverity.INFO,
                message_pl="Wszystkie analizy dostępne — model jest kompletny",
            )
        ]
    return []


def rule_i_d02_topology_type(graph: NetworkGraph) -> list[DiagnosticIssue]:
    """I-D02: Sieć radialna / oczkowa (informacyjnie)."""
    if not graph.nodes or not graph.branches:
        return []

    node_count = len(graph.nodes)
    edge_count = len([b for b in graph.branches.values() if getattr(b, "in_service", True)])
    switch_edges = 0
    if hasattr(graph, "switches"):
        switch_edges = len([s for s in graph.switches.values() if s.is_closed and s.in_service])
    total_edges = edge_count + switch_edges

    # Radial: edges == nodes - 1; Mesh: edges > nodes - 1
    if total_edges <= node_count - 1:
        topology = "radialna"
    else:
        topology = "oczkowa (pierścieniowa)"

    return [
        DiagnosticIssue(
            code="I-D02",
            severity=DiagnosticSeverity.INFO,
            message_pl=(
                f"Topologia sieci: {topology} " f"({node_count} szyn, {total_edges} połączeń)"
            ),
        )
    ]


# ---------------------------------------------------------------------------
# Rule registry (ordered, deterministic)
# ---------------------------------------------------------------------------


ALL_BLOCKER_RULES = [
    rule_e_d01_no_source,
    rule_e_d02_voltage_mismatch,
    rule_e_d03_disconnected_islands,
    rule_e_d04_transformer_missing_sides,
    rule_e_d05_line_no_impedance,
    rule_e_d07_open_switches_isolate,
]

ALL_WARN_RULES = [
    rule_e_d06_sc1f_no_zero_sequence,
    rule_w_d01_no_zero_sequence_data,
    rule_w_d02_extreme_parameters,
    rule_w_d03_multiple_sources,
]

ALL_INFO_GRAPH_RULES = [
    rule_i_d02_topology_type,
]
