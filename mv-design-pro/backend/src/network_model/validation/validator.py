"""
Network Validator module — PowerFactory-grade.

Industrial-grade validation that must pass before solver execution.
Validates graph connectivity, element presence, parameter validity,
voltage level consistency, and transformer polarity.

This is NOT a solver — it's a pre-check layer (Application Layer).

Diagnostic format aligned with DIgSILENT PowerFactory "Check Network Data":
- code: machine-readable identifier (e.g., "network.disconnected")
- message: human-readable description (Polish for UI)
- severity: ERROR (blocking) or WARNING (non-blocking)
- element_id: affected element UUID
- field: affected field name
- suggested_fix: actionable Polish-language fix suggestion
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from network_model.core.graph import NetworkGraph


class Severity(Enum):
    """Validation issue severity."""

    ERROR = "ERROR"  # Blocking — solver cannot run
    WARNING = "WARNING"  # Non-blocking — solver can run with caution


@dataclass
class ValidationIssue:
    """
    Single validation issue (PowerFactory-grade diagnostic).

    Attributes:
        code: Machine-readable issue code (e.g., "network.disconnected").
        message: Human-readable description (Polish for UI display).
        severity: ERROR (blocking) or WARNING (non-blocking).
        element_id: ID of the element with the issue (if applicable).
        field: Field name with the issue (if applicable).
        suggested_fix: Actionable fix suggestion (Polish).
    """

    code: str
    message: str
    severity: Severity = Severity.ERROR
    element_id: str | None = None
    field: str | None = None
    suggested_fix: str | None = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "code": self.code,
            "message": self.message,
            "severity": self.severity.value,
            "element_id": self.element_id,
            "field": self.field,
            "suggested_fix": self.suggested_fix,
        }


@dataclass
class ValidationReport:
    """
    Collection of validation issues.

    Immutable pattern — use with_error/with_warning to add issues.
    """

    issues: tuple = field(default_factory=tuple)

    @property
    def is_valid(self) -> bool:
        """
        Check if validation passed (no blocking errors).

        Returns:
            True if no ERROR-level issues, False otherwise.
        """
        return not any(i.severity == Severity.ERROR for i in self.issues)

    @property
    def errors(self) -> list[ValidationIssue]:
        """Get all ERROR-level issues."""
        return [i for i in self.issues if i.severity == Severity.ERROR]

    @property
    def warnings(self) -> list[ValidationIssue]:
        """Get all WARNING-level issues."""
        return [i for i in self.issues if i.severity == Severity.WARNING]

    def with_error(self, issue: ValidationIssue) -> "ValidationReport":
        """
        Add an error issue.

        Args:
            issue: ValidationIssue with severity=ERROR.

        Returns:
            New ValidationReport with the added issue.
        """
        return ValidationReport(
            issues=self.issues
            + (
                ValidationIssue(
                    code=issue.code,
                    message=issue.message,
                    severity=Severity.ERROR,
                    element_id=issue.element_id,
                    field=issue.field,
                    suggested_fix=issue.suggested_fix,
                ),
            )
        )

    def with_warning(self, issue: ValidationIssue) -> "ValidationReport":
        """
        Add a warning issue.

        Args:
            issue: ValidationIssue with severity=WARNING.

        Returns:
            New ValidationReport with the added issue.
        """
        return ValidationReport(
            issues=self.issues
            + (
                ValidationIssue(
                    code=issue.code,
                    message=issue.message,
                    severity=Severity.WARNING,
                    element_id=issue.element_id,
                    field=issue.field,
                    suggested_fix=issue.suggested_fix,
                ),
            )
        )

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "is_valid": self.is_valid,
            "issues": [i.to_dict() for i in self.issues],
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
        }


class NetworkValidator:
    """
    PowerFactory-grade network validator.

    Validates network model before solver execution.
    If validation fails (ERROR-level issues), solver execution is BLOCKED.

    Validation rules (PowerFactory "Check Network Data" equivalent):
    1. Empty network check
    2. Graph connectivity (single island for solver)
    3. Source presence (SLACK node or inverter source)
    4. Dangling elements (branches with invalid endpoints)
    5. Bus voltage validity (voltage_level > 0)
    6. Branch endpoint validity (both endpoints exist, no self-loops)
    7. Transformer voltage mismatch (HV != LV, both > 0)
    8. SLACK node presence and uniqueness (exactly 1)
    9. Switch endpoint validity
    10. Inverter source bus validity
    11. Branch impedance validity (non-zero impedance for lines/cables)
    12. Transformer HV/LV polarity (HV bus voltage >= LV bus voltage)
    13. Voltage level consistency across connected buses

    This is NOT a solver — it performs no physics calculations.
    """

    def validate(self, graph: "NetworkGraph") -> ValidationReport:
        """
        Run all validation rules on the network graph.

        Args:
            graph: NetworkGraph instance to validate.

        Returns:
            ValidationReport with all issues found.
        """
        report = ValidationReport()

        # Rule 1: Check if network is empty
        report = self._check_empty_network(graph, report)

        # Rule 2: Check graph connectivity
        report = self._check_connectivity(graph, report)

        # Rule 3: Check source presence
        report = self._check_source_presence(graph, report)

        # Rule 4: Check for dangling elements
        report = self._check_dangling_elements(graph, report)

        # Rule 5: Check bus voltages
        report = self._check_bus_voltages(graph, report)

        # Rule 6: Check branch endpoints
        report = self._check_branch_endpoints(graph, report)

        # Rule 7: Check transformer voltages
        report = self._check_transformer_voltages(graph, report)

        # Rule 8: Check for SLACK node
        report = self._check_slack_node(graph, report)

        # Rule 9: Check switch endpoints
        report = self._check_switch_endpoints(graph, report)

        # Rule 10: Check inverter source buses
        report = self._check_inverter_source_buses(graph, report)

        # Rule 11: Check branch impedance (non-zero)
        report = self._check_branch_impedance(graph, report)

        # Rule 12: Check transformer HV/LV polarity vs bus voltages
        report = self._check_transformer_polarity(graph, report)

        # Rule 13: Check voltage level consistency on lines/cables
        report = self._check_voltage_consistency(graph, report)

        return report

    # =========================================================================
    # Rule 1: Empty network
    # =========================================================================

    def _check_empty_network(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """Check if network has any nodes."""
        if not graph.nodes:
            return report.with_error(
                ValidationIssue(
                    code="network.empty",
                    message="Sieć nie zawiera żadnych szyn (węzłów)",
                    suggested_fix="Dodaj co najmniej jedną szynę do modelu sieci",
                )
            )
        return report

    # =========================================================================
    # Rule 2: Connectivity
    # =========================================================================

    def _check_connectivity(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check if network graph is connected.

        A disconnected network cannot be solved as a single system.
        """
        if not graph.nodes:
            return report

        if not graph.is_connected():
            islands = graph.find_islands()
            return report.with_error(
                ValidationIssue(
                    code="network.disconnected",
                    message=(
                        f"Sieć jest niespójna — wykryto {len(islands)} wysp(y). "
                        f"Solver wymaga jednej spójnej topologii"
                    ),
                    suggested_fix=(
                        "Połącz wszystkie wyspy gałęziami lub łącznikami, "
                        "albo usuń odłączone elementy"
                    ),
                )
            )
        return report

    # =========================================================================
    # Rule 3: Source presence
    # =========================================================================

    def _check_source_presence(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check if at least one source is present.

        Network needs at least one source for power flow.
        """
        # Check for inverter sources
        if hasattr(graph, "inverter_sources") and graph.inverter_sources:
            return report

        # Check for SLACK node (acts as source)
        for node in graph.nodes.values():
            from network_model.core.node import NodeType

            if node.node_type == NodeType.SLACK:
                return report

        return report.with_error(
            ValidationIssue(
                code="network.no_source",
                message="Sieć nie ma źródła zasilania (brak szyny SLACK lub źródła falownikowego)",
                suggested_fix="Dodaj szynę typu SLACK lub źródło falownikowe (OZE)",
            )
        )

    # =========================================================================
    # Rule 4: Dangling elements
    # =========================================================================

    def _check_dangling_elements(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check for dangling elements (branches with invalid endpoints).
        """
        node_ids = set(graph.nodes.keys())

        for branch_id, branch in graph.branches.items():
            if branch.from_node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="branch.dangling_from",
                        message=(
                            f"Gałąź '{branch.name}' — szyna początkowa "
                            f"'{branch.from_node_id}' nie istnieje"
                        ),
                        element_id=branch_id,
                        field="from_node_id",
                        suggested_fix="Podłącz gałąź do istniejącej szyny lub usuń gałąź",
                    )
                )
            if branch.to_node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="branch.dangling_to",
                        message=(
                            f"Gałąź '{branch.name}' — szyna końcowa "
                            f"'{branch.to_node_id}' nie istnieje"
                        ),
                        element_id=branch_id,
                        field="to_node_id",
                        suggested_fix="Podłącz gałąź do istniejącej szyny lub usuń gałąź",
                    )
                )

        return report

    # =========================================================================
    # Rule 5: Bus voltages
    # =========================================================================

    def _check_bus_voltages(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check if all bus voltages are valid (> 0).
        """
        for node_id, node in graph.nodes.items():
            if node.voltage_level <= 0:
                report = report.with_error(
                    ValidationIssue(
                        code="bus.voltage_invalid",
                        message=(
                            f"Szyna '{node.name}' — napięcie znamionowe musi być > 0, "
                            f"aktualnie: {node.voltage_level} kV"
                        ),
                        element_id=node_id,
                        field="voltage_level",
                        suggested_fix="Ustaw prawidłowy poziom napięcia znamionowego (np. 15, 20, 110 kV)",
                    )
                )
        return report

    # =========================================================================
    # Rule 6: Branch endpoints
    # =========================================================================

    def _check_branch_endpoints(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check if all branch endpoints exist and are valid.
        """
        node_ids = set(graph.nodes.keys())

        for branch_id, branch in graph.branches.items():
            if branch.from_node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="branch.from_missing",
                        message=f"Gałąź '{branch.name}' — brak szyny początkowej w modelu",
                        element_id=branch_id,
                        field="from_node_id",
                        suggested_fix="Podłącz gałąź do istniejącej szyny",
                    )
                )
            if branch.to_node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="branch.to_missing",
                        message=f"Gałąź '{branch.name}' — brak szyny końcowej w modelu",
                        element_id=branch_id,
                        field="to_node_id",
                        suggested_fix="Podłącz gałąź do istniejącej szyny",
                    )
                )
            if branch.from_node_id == branch.to_node_id:
                report = report.with_error(
                    ValidationIssue(
                        code="branch.self_loop",
                        message=f"Gałąź '{branch.name}' — nie może łączyć szyny samej ze sobą",
                        element_id=branch_id,
                        suggested_fix="Zmień szynę początkową lub końcową gałęzi",
                    )
                )
        return report

    # =========================================================================
    # Rule 7: Transformer voltages
    # =========================================================================

    def _check_transformer_voltages(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check transformer HV/LV voltages are different and positive.
        """
        from network_model.core.branch import BranchType, TransformerBranch

        for branch_id, branch in graph.branches.items():
            if branch.branch_type == BranchType.TRANSFORMER:
                if isinstance(branch, TransformerBranch):
                    if branch.voltage_hv_kv == branch.voltage_lv_kv:
                        report = report.with_error(
                            ValidationIssue(
                                code="transformer.voltage_equal",
                                message=(
                                    f"Transformator '{branch.name}' — napięcie GN i DN "
                                    f"muszą się różnić ({branch.voltage_hv_kv} kV = "
                                    f"{branch.voltage_lv_kv} kV)"
                                ),
                                element_id=branch_id,
                                suggested_fix=(
                                    "Ustaw różne napięcia po stronie GN i DN transformatora"
                                ),
                            )
                        )
                    if branch.voltage_hv_kv <= 0:
                        report = report.with_error(
                            ValidationIssue(
                                code="transformer.hv_invalid",
                                message=(
                                    f"Transformator '{branch.name}' — napięcie strony GN "
                                    f"musi być > 0, aktualnie: {branch.voltage_hv_kv} kV"
                                ),
                                element_id=branch_id,
                                field="voltage_hv_kv",
                                suggested_fix="Ustaw prawidłowe napięcie strony górnej (GN)",
                            )
                        )
                    if branch.voltage_lv_kv <= 0:
                        report = report.with_error(
                            ValidationIssue(
                                code="transformer.lv_invalid",
                                message=(
                                    f"Transformator '{branch.name}' — napięcie strony DN "
                                    f"musi być > 0, aktualnie: {branch.voltage_lv_kv} kV"
                                ),
                                element_id=branch_id,
                                field="voltage_lv_kv",
                                suggested_fix="Ustaw prawidłowe napięcie strony dolnej (DN)",
                            )
                        )
        return report

    # =========================================================================
    # Rule 8: SLACK node
    # =========================================================================

    def _check_slack_node(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check for exactly one SLACK node for power flow.
        """
        from network_model.core.node import NodeType

        slack_nodes = [
            node_id for node_id, node in graph.nodes.items() if node.node_type == NodeType.SLACK
        ]

        if len(slack_nodes) == 0:
            return report.with_error(
                ValidationIssue(
                    code="network.no_slack",
                    message=(
                        "Sieć nie ma szyny bilansującej (SLACK) — " "wymagana do rozpływu mocy"
                    ),
                    suggested_fix="Ustaw jedną szynę jako typ SLACK (węzeł referencyjny)",
                )
            )

        if len(slack_nodes) > 1:
            return report.with_error(
                ValidationIssue(
                    code="network.multiple_slack",
                    message=(
                        f"Sieć ma {len(slack_nodes)} szyn SLACK — "
                        f"dozwolona jest dokładnie jedna"
                    ),
                    suggested_fix="Zmień nadmiarowe szyny SLACK na typ PQ lub PV",
                )
            )

        return report

    # =========================================================================
    # Rule 9: Switch endpoints (NEW — PowerFactory-grade)
    # =========================================================================

    def _check_switch_endpoints(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check if all switch endpoints exist in the network.
        """
        if not hasattr(graph, "switches"):
            return report

        node_ids = set(graph.nodes.keys())

        for switch_id, switch in graph.switches.items():
            if switch.from_node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="switch.from_missing",
                        message=(
                            f"Łącznik '{switch.name}' — szyna początkowa "
                            f"'{switch.from_node_id}' nie istnieje"
                        ),
                        element_id=switch_id,
                        field="from_node_id",
                        suggested_fix="Podłącz łącznik do istniejącej szyny",
                    )
                )
            if switch.to_node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="switch.to_missing",
                        message=(
                            f"Łącznik '{switch.name}' — szyna końcowa "
                            f"'{switch.to_node_id}' nie istnieje"
                        ),
                        element_id=switch_id,
                        field="to_node_id",
                        suggested_fix="Podłącz łącznik do istniejącej szyny",
                    )
                )
            if switch.from_node_id == switch.to_node_id:
                report = report.with_error(
                    ValidationIssue(
                        code="switch.self_loop",
                        message=(
                            f"Łącznik '{switch.name}' — nie może łączyć " f"szyny samej ze sobą"
                        ),
                        element_id=switch_id,
                        suggested_fix="Zmień szynę początkową lub końcową łącznika",
                    )
                )

        return report

    # =========================================================================
    # Rule 10: Inverter source buses (NEW — PowerFactory-grade)
    # =========================================================================

    def _check_inverter_source_buses(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check if all inverter source buses exist in the network.
        """
        if not hasattr(graph, "inverter_sources"):
            return report

        node_ids = set(graph.nodes.keys())

        for source_id, source in graph.inverter_sources.items():
            if source.node_id not in node_ids:
                report = report.with_error(
                    ValidationIssue(
                        code="source.bus_missing",
                        message=(
                            f"Źródło falownikowe '{source.name}' — szyna "
                            f"'{source.node_id}' nie istnieje w modelu"
                        ),
                        element_id=source_id,
                        field="node_id",
                        suggested_fix="Podłącz źródło do istniejącej szyny",
                    )
                )

        return report

    # =========================================================================
    # Rule 11: Branch impedance (non-zero for lines/cables) (NEW)
    # =========================================================================

    def _check_branch_impedance(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check that line/cable branches have non-zero impedance.

        Zero impedance causes singular Y-bus matrix.
        """
        from network_model.core.branch import BranchType, LineBranch

        for branch_id, branch in graph.branches.items():
            if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
                if isinstance(branch, LineBranch):
                    # Skip branches with type_ref (params come from catalog)
                    if branch.type_ref is not None:
                        continue
                    # Skip branches with impedance override
                    if branch.impedance_override is not None:
                        continue
                    if branch.r_ohm_per_km == 0 and branch.x_ohm_per_km == 0:
                        report = report.with_warning(
                            ValidationIssue(
                                code="branch.impedance_zero",
                                message=(
                                    f"Gałąź '{branch.name}' — impedancja zerowa "
                                    f"(R=0, X=0). Może spowodować błąd solvera"
                                ),
                                element_id=branch_id,
                                suggested_fix=(
                                    "Ustaw parametry R i/lub X > 0, " "lub przypisz typ z katalogu"
                                ),
                            )
                        )
                    if branch.length_km <= 0:
                        report = report.with_warning(
                            ValidationIssue(
                                code="branch.length_zero",
                                message=(
                                    f"Gałąź '{branch.name}' — długość ≤ 0 "
                                    f"({branch.length_km} km)"
                                ),
                                element_id=branch_id,
                                field="length_km",
                                suggested_fix="Ustaw długość gałęzi > 0 km",
                            )
                        )

        return report

    # =========================================================================
    # Rule 12: Transformer HV/LV polarity vs bus voltages (NEW)
    # =========================================================================

    def _check_transformer_polarity(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check that transformer HV side connects to higher voltage bus.

        PowerFactory requirement: from_node_id (HV) bus must have voltage_level
        >= to_node_id (LV) bus voltage_level.
        """
        from network_model.core.branch import BranchType, TransformerBranch

        for branch_id, branch in graph.branches.items():
            if branch.branch_type == BranchType.TRANSFORMER:
                if isinstance(branch, TransformerBranch):
                    from_node = graph.nodes.get(branch.from_node_id)
                    to_node = graph.nodes.get(branch.to_node_id)
                    if from_node is None or to_node is None:
                        continue  # dangling endpoints handled by other rules
                    if (
                        from_node.voltage_level > 0
                        and to_node.voltage_level > 0
                        and from_node.voltage_level < to_node.voltage_level
                    ):
                        report = report.with_warning(
                            ValidationIssue(
                                code="transformer.polarity_reversed",
                                message=(
                                    f"Transformator '{branch.name}' — strona GN "
                                    f"({from_node.voltage_level} kV) podłączona do "
                                    f"szyny o niższym napięciu niż strona DN "
                                    f"({to_node.voltage_level} kV). "
                                    f"Sprawdź kierunek podłączenia"
                                ),
                                element_id=branch_id,
                                suggested_fix=(
                                    "Zamień szyny from/to transformatora, aby strona "
                                    "GN była podłączona do szyny wyższego napięcia"
                                ),
                            )
                        )

        return report

    # =========================================================================
    # Rule 13: Voltage level consistency on lines/cables (NEW)
    # =========================================================================

    def _check_voltage_consistency(
        self, graph: "NetworkGraph", report: ValidationReport
    ) -> ValidationReport:
        """
        Check that lines/cables connect buses at the same voltage level.

        Lines and cables should connect buses at the same nominal voltage.
        A mismatch indicates a modeling error (transformer may be needed).
        """
        from network_model.core.branch import BranchType

        for branch_id, branch in graph.branches.items():
            if branch.branch_type in (BranchType.LINE, BranchType.CABLE):
                from_node = graph.nodes.get(branch.from_node_id)
                to_node = graph.nodes.get(branch.to_node_id)
                if from_node is None or to_node is None:
                    continue  # dangling endpoints handled by other rules
                if (
                    from_node.voltage_level > 0
                    and to_node.voltage_level > 0
                    and from_node.voltage_level != to_node.voltage_level
                ):
                    report = report.with_warning(
                        ValidationIssue(
                            code="branch.voltage_mismatch",
                            message=(
                                f"Gałąź '{branch.name}' łączy szyny o różnych "
                                f"napięciach znamionowych: "
                                f"{from_node.voltage_level} kV i "
                                f"{to_node.voltage_level} kV"
                            ),
                            element_id=branch_id,
                            suggested_fix=(
                                "Linie/kable powinny łączyć szyny o tym samym "
                                "napięciu. Jeśli potrzebna jest zmiana napięcia, "
                                "użyj transformatora"
                            ),
                        )
                    )

        return report


def validate_network(graph) -> ValidationReport:
    """
    Convenience function to validate a network graph.

    Args:
        graph: NetworkGraph instance.

    Returns:
        ValidationReport with all issues.
    """
    validator = NetworkValidator()
    return validator.validate(graph)
