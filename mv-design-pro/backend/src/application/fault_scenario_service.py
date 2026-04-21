"""
Fault Scenario Service — PR-19 + PR-24

Application service for managing fault scenarios.
Handles CRUD, validation, content hash computation,
eligibility checking, and SLD overlay generation.

INVARIANTS:
- ZERO auto-completion of missing data
- ZERO heuristics
- Deterministic content_hash (SHA-256)
- All scenarios sorted deterministically
- Polish error messages
- Copy-on-write updates (PR-24)
- Dependency check before delete (PR-24)
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from domain.eligibility_models import (
    AnalysisEligibilityIssue,
    AnalysisEligibilityResult,
    AnalysisType,
    IssueSeverity,
    build_eligibility_result,
)
from domain.fault_scenario import (
    FaultImpedance,
    FaultLocation,
    FaultMode,
    FaultScenario,
    FaultType,
    ShortCircuitConfig,
    _now_utc_iso,
    compute_scenario_content_hash,
    new_fault_scenario,
    validate_fault_scenario,
)
from enm.fix_actions import FixAction

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class FaultScenarioServiceError(Exception):
    """Base error for fault scenario service."""

    pass


class FaultScenarioNotFoundError(FaultScenarioServiceError):
    """Raised when a fault scenario does not exist."""

    def __init__(self, scenario_id: str) -> None:
        super().__init__(f"Scenariusz zwarcia nie istnieje: {scenario_id}")
        self.scenario_id = scenario_id


class FaultScenarioDuplicateError(FaultScenarioServiceError):
    """Raised when a duplicate scenario (same content_hash) exists."""

    def __init__(self, content_hash: str) -> None:
        super().__init__(
            f"Scenariusz o identycznym content_hash już istnieje: {content_hash[:16]}..."
        )
        self.content_hash = content_hash


class FaultScenarioHasRunsError(FaultScenarioServiceError):
    """Raised when trying to delete a scenario that has associated runs."""

    def __init__(self, scenario_id: str) -> None:
        super().__init__(f"Nie można usunąć scenariusza z powiązanymi przebiegami: {scenario_id}")
        self.scenario_id = scenario_id


# ---------------------------------------------------------------------------
# Fault type → AnalysisType mapping
# ---------------------------------------------------------------------------

_FAULT_TYPE_TO_ANALYSIS_TYPE: dict[FaultType, AnalysisType] = {
    FaultType.SC_3F: AnalysisType.SC_3F,
    FaultType.SC_2F: AnalysisType.SC_2F,
    FaultType.SC_1F: AnalysisType.SC_1F,
}

# ---------------------------------------------------------------------------
# SLD overlay labels (Polish)
# ---------------------------------------------------------------------------

FAULT_TYPE_LABELS_PL: dict[FaultType, str] = {
    FaultType.SC_3F: "3-fazowe",
    FaultType.SC_2F: "2-fazowe",
    FaultType.SC_1F: "1-fazowe",
}

FAULT_MODE_LABELS_PL: dict[FaultMode, str] = {
    FaultMode.METALLIC: "metaliczne",
    FaultMode.IMPEDANCE: "przez impedancję",
}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class FaultScenarioService:
    """
    Application service for fault scenario management.

    Responsibilities:
    - Create validated fault scenarios
    - Update scenarios (copy-on-write)
    - List scenarios for a study case (sorted deterministically)
    - Delete scenarios (with dependency check)
    - Validate scenario invariants
    - Compute content hash
    - Check scenario eligibility
    - Generate SLD overlay for a scenario
    """

    def __init__(self) -> None:
        # In-memory store (no DB persistence yet)
        self._scenarios: dict[UUID, FaultScenario] = {}
        # Index: study_case_id -> list of scenario_ids
        self._case_scenarios: dict[UUID, list[UUID]] = {}
        # Associated run IDs per scenario (scenario_id -> list of run_ids)
        self._scenario_runs: dict[UUID, list[UUID]] = {}

    def create_scenario(
        self,
        *,
        study_case_id: UUID,
        name: str,
        fault_type: str,
        location: dict[str, Any],
        config: dict[str, Any] | None = None,
        fault_mode: str | None = None,
        fault_impedance: dict[str, Any] | None = None,
        arc_params: dict[str, Any] | None = None,
        z0_bus_data: dict[str, Any] | None = None,
    ) -> FaultScenario:
        """
        Create a new fault scenario with validation and content hash.

        Args:
            study_case_id: Parent study case UUID.
            name: User-facing Polish name (required).
            fault_type: "SC_3F", "SC_2F", or "SC_1F".
            location: {"element_ref": str, "location_type": ..., "position": float|None}
            config: Optional short-circuit config overrides.
            fault_mode: "METALLIC" or "IMPEDANCE" (v2, default METALLIC).
            fault_impedance: {"r_ohm": float, "x_ohm": float} (v2, required for IMPEDANCE).
            arc_params: Reserved — unsupported in v2.
            z0_bus_data: Zero-sequence impedance data (required for SC_1F).

        Returns:
            Validated FaultScenario with content_hash.

        Raises:
            FaultScenarioValidationError: If invariants are violated.
            FaultScenarioDuplicateError: If identical scenario already exists.
        """
        ft = FaultType(fault_type)
        loc = FaultLocation.from_dict(location)
        cfg = ShortCircuitConfig.from_dict(config) if config else ShortCircuitConfig()
        fm = FaultMode(fault_mode) if fault_mode else FaultMode.METALLIC
        fi = FaultImpedance.from_dict(fault_impedance) if fault_impedance else None

        scenario = new_fault_scenario(
            study_case_id=study_case_id,
            name=name,
            fault_type=ft,
            location=loc,
            config=cfg,
            fault_mode=fm,
            fault_impedance=fi,
            arc_params=arc_params,
            z0_bus_data=z0_bus_data,
        )

        # Check for duplicate content_hash
        for existing in self._scenarios.values():
            if (
                existing.study_case_id == study_case_id
                and existing.content_hash == scenario.content_hash
            ):
                raise FaultScenarioDuplicateError(scenario.content_hash)

        # Store
        self._scenarios[scenario.scenario_id] = scenario
        if study_case_id not in self._case_scenarios:
            self._case_scenarios[study_case_id] = []
        self._case_scenarios[study_case_id].append(scenario.scenario_id)

        logger.info(
            "Created fault scenario %s: name=%s, type=%s, location=%s, hash=%s",
            scenario.scenario_id,
            scenario.name,
            scenario.fault_type.value,
            scenario.location.element_ref,
            scenario.content_hash[:16],
        )

        return scenario

    def get_scenario(self, scenario_id: UUID) -> FaultScenario:
        """Get a fault scenario by ID."""
        scenario = self._scenarios.get(scenario_id)
        if scenario is None:
            raise FaultScenarioNotFoundError(str(scenario_id))
        return scenario

    def list_scenarios(self, study_case_id: UUID) -> list[FaultScenario]:
        """
        List all fault scenarios for a study case.

        Sorted deterministically by (fault_type, element_ref).
        """
        scenario_ids = self._case_scenarios.get(study_case_id, [])
        scenarios = [self._scenarios[sid] for sid in scenario_ids if sid in self._scenarios]
        scenarios.sort(key=lambda s: (s.fault_type.value, s.location.element_ref))
        return scenarios

    def update_scenario(
        self,
        scenario_id: UUID,
        *,
        name: str | None = None,
        fault_type: str | None = None,
        location: dict[str, Any] | None = None,
        config: dict[str, Any] | None = None,
        fault_mode: str | None = None,
        fault_impedance: dict[str, Any] | None = None,
        arc_params: Any = None,
        z0_bus_data: Any = None,
    ) -> FaultScenario:
        """
        Update a fault scenario using copy-on-write.

        Creates a new immutable FaultScenario with updated fields,
        recomputes content_hash, and replaces the stored scenario.

        Args:
            scenario_id: ID of the scenario to update.
            name: New name (optional).
            fault_type: New fault type (optional).
            location: New location dict (optional).
            config: New config dict (optional).
            fault_mode: New fault mode (optional, v2).
            fault_impedance: New fault impedance (optional, v2).
            arc_params: Reserved — unsupported (v2).
            z0_bus_data: New z0_bus_data (optional).

        Returns:
            Updated FaultScenario with new content_hash and updated_at.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
            FaultScenarioValidationError: If updated invariants are violated.
        """
        existing = self.get_scenario(scenario_id)

        # Build update kwargs for with_updates()
        update_kwargs: dict[str, Any] = {}
        if name is not None:
            update_kwargs["name"] = name
        if fault_type is not None:
            update_kwargs["fault_type"] = FaultType(fault_type)
        if location is not None:
            update_kwargs["location"] = FaultLocation.from_dict(location)
        if config is not None:
            update_kwargs["config"] = ShortCircuitConfig.from_dict(config)
        if fault_mode is not None:
            update_kwargs["fault_mode"] = FaultMode(fault_mode)
        if fault_impedance is not None:
            update_kwargs["fault_impedance"] = FaultImpedance.from_dict(fault_impedance)
        if arc_params is not None:
            update_kwargs["arc_params"] = arc_params
        if z0_bus_data is not None:
            update_kwargs["z0_bus_data"] = z0_bus_data

        # Set updated_at timestamp
        update_kwargs["updated_at"] = _now_utc_iso()

        # Copy-on-write
        updated = existing.with_updates(**update_kwargs)

        # Validate the updated scenario
        validate_fault_scenario(updated)

        # Recompute content hash
        content_hash = compute_scenario_content_hash(updated)
        updated = FaultScenario(
            scenario_id=updated.scenario_id,
            study_case_id=updated.study_case_id,
            name=updated.name,
            fault_type=updated.fault_type,
            location=updated.location,
            config=updated.config,
            fault_impedance_type=updated.fault_impedance_type,
            fault_mode=updated.fault_mode,
            fault_impedance=updated.fault_impedance,
            arc_params=updated.arc_params,
            z0_bus_data=updated.z0_bus_data,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
            content_hash=content_hash,
        )

        # Replace in store
        self._scenarios[scenario_id] = updated

        logger.info(
            "Updated fault scenario %s: name=%s, hash=%s",
            scenario_id,
            updated.name,
            updated.content_hash[:16],
        )

        return updated

    def delete_scenario(self, scenario_id: UUID) -> None:
        """
        Delete a fault scenario.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
            FaultScenarioHasRunsError: If scenario has associated runs.
        """
        scenario = self._scenarios.get(scenario_id)
        if scenario is None:
            raise FaultScenarioNotFoundError(str(scenario_id))

        # Check for associated runs
        if self.has_associated_runs(scenario_id):
            raise FaultScenarioHasRunsError(str(scenario_id))

        # Remove from index
        case_ids = self._case_scenarios.get(scenario.study_case_id, [])
        if scenario_id in case_ids:
            case_ids.remove(scenario_id)

        # Remove from store
        del self._scenarios[scenario_id]

        # Clean up run associations
        self._scenario_runs.pop(scenario_id, None)

        logger.info("Deleted fault scenario %s", scenario_id)

    def has_associated_runs(self, scenario_id: UUID) -> bool:
        """
        Check if a scenario has associated execution runs.

        Returns:
            True if the scenario has at least one associated run.
        """
        runs = self._scenario_runs.get(scenario_id, [])
        return len(runs) > 0

    def register_run(self, scenario_id: UUID, run_id: UUID) -> None:
        """
        Register an execution run as associated with a scenario.

        Args:
            scenario_id: ID of the scenario.
            run_id: ID of the run.
        """
        if scenario_id not in self._scenario_runs:
            self._scenario_runs[scenario_id] = []
        self._scenario_runs[scenario_id].append(run_id)

    def validate_scenario(self, scenario_id: UUID) -> None:
        """
        Re-validate an existing scenario's invariants.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
            FaultScenarioValidationError: If invariants are violated.
        """
        scenario = self.get_scenario(scenario_id)
        validate_fault_scenario(scenario)

    def compute_hash(self, scenario_id: UUID) -> str:
        """
        Recompute content hash for a scenario (for verification).

        Returns:
            SHA-256 content hash.
        """
        scenario = self.get_scenario(scenario_id)
        return compute_scenario_content_hash(scenario)

    def check_scenario_eligibility(self, scenario_id: UUID) -> AnalysisEligibilityResult:
        """
        Check eligibility of a fault scenario for execution.

        Rules:
        - If fault_node_ref is empty -> BLOCKER with NAVIGATE_TO_ELEMENT
        - If SC_1F and no z0_bus_data -> BLOCKER with OPEN_MODAL "Uzupelnij Z0"
        - If SC_2F and no z2 data -> INELIGIBLE with OPEN_MODAL "Uzupelnij Z2"
        - All messages in Polish

        Args:
            scenario_id: ID of the scenario to check.

        Returns:
            AnalysisEligibilityResult with status and issues.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
        """
        scenario = self.get_scenario(scenario_id)
        analysis_type = _FAULT_TYPE_TO_ANALYSIS_TYPE[scenario.fault_type]

        blockers: list[AnalysisEligibilityIssue] = []
        warnings: list[AnalysisEligibilityIssue] = []

        # Rule 1: empty fault_node_ref
        if not scenario.location.element_ref or not scenario.location.element_ref.strip():
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_FAULT_NODE_EMPTY",
                    severity=IssueSeverity.BLOCKER,
                    message_pl="Nie wskazano węzła zwarcia — wybierz element na schemacie",
                    element_ref=None,
                    element_type=None,
                    fix_action=FixAction(
                        action_type="NAVIGATE_TO_ELEMENT",
                    ),
                )
            )

        # Rule 2: SC_1F without z0_bus_data
        if scenario.fault_type == FaultType.SC_1F and scenario.z0_bus_data is None:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC1F_NO_Z0",
                    severity=IssueSeverity.BLOCKER,
                    message_pl="Brak danych impedancji zerowej — wymagane dla zwarcia jednofazowego",
                    element_ref=scenario.location.element_ref,
                    element_type=scenario.location.location_type,
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        modal_type="Uzupełnij Z0",
                    ),
                )
            )

        # Rule 3: SC_2F without z2 data (z0_bus_data used as proxy for z2 in v1)
        if scenario.fault_type == FaultType.SC_2F and scenario.z0_bus_data is None:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_SC2F_NO_Z2",
                    severity=IssueSeverity.BLOCKER,
                    message_pl="Brak danych impedancji składowej przeciwnej (Z2) — wymagane dla zwarcia dwufazowego",
                    element_ref=scenario.location.element_ref,
                    element_type=scenario.location.location_type,
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        modal_type="Uzupełnij Z2",
                    ),
                )
            )

        # v2 Rule 4: IMPEDANCE mode — binding unsupported (PR-25)
        if scenario.fault_mode == FaultMode.IMPEDANCE:
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_BINDING_UNSUPPORTED_FAULT_IMPEDANCE",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Tryb zwarcia przez impedancję (Zf) nie jest jeszcze obsługiwany "
                        "przez adapter obliczeniowy — użyj trybu metalicznego"
                    ),
                    element_ref=scenario.location.element_ref,
                    element_type=scenario.location.location_type,
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        modal_type="Zmień tryb zwarcia",
                        payload_hint={"suggested_mode": "METALLIC"},
                    ),
                )
            )

        # v2 Rule 5: BRANCH_POINT location — binding unsupported (PR-25)
        if scenario.location.location_type == "BRANCH_POINT":
            blockers.append(
                AnalysisEligibilityIssue(
                    code="ELIG_BINDING_UNSUPPORTED_BRANCH_POINT",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=(
                        "Zwarcie w punkcie na gałęzi (BRANCH_POINT) nie jest jeszcze obsługiwane "
                        "przez adapter obliczeniowy — wybierz lokalizację na węźle"
                    ),
                    element_ref=scenario.location.element_ref,
                    element_type=scenario.location.location_type,
                    fix_action=FixAction(
                        action_type="NAVIGATE_TO_ELEMENT",
                        payload_hint={"suggested_location_type": "NODE"},
                    ),
                )
            )

        return build_eligibility_result(
            analysis_type=analysis_type,
            blockers=blockers,
            warnings=warnings,
        )

    def get_scenario_sld_overlay(self, scenario_id: UUID) -> dict[str, Any]:
        """
        Generate SLD overlay payload for a fault scenario.

        Returns a structured overlay payload compatible with PR-16
        SLD overlay protocol.

        Args:
            scenario_id: ID of the scenario.

        Returns:
            Overlay payload dict with elements, legend, and label.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
        """
        scenario = self.get_scenario(scenario_id)

        fault_label = FAULT_TYPE_LABELS_PL.get(scenario.fault_type, scenario.fault_type.value)
        mode_label = FAULT_MODE_LABELS_PL.get(scenario.fault_mode, scenario.fault_mode.value)

        overlay_element: dict[str, Any] = {
            "element_ref": scenario.location.element_ref,
            "element_type": scenario.location.location_type,
            "visual_state": "WARNING",
            "color_token": "warning",
            "stroke_token": "bold",
            "animation_token": "pulse",
            "numeric_badges": {},
        }

        # v2: BRANCH_POINT — include alpha for visual positioning
        if (
            scenario.location.location_type == "BRANCH_POINT"
            and scenario.location.position is not None
        ):
            overlay_element["branch_point_alpha"] = scenario.location.position

        # v2: IMPEDANCE mode — include Zf in overlay metadata
        if scenario.fault_mode == FaultMode.IMPEDANCE and scenario.fault_impedance is not None:
            overlay_element["fault_impedance"] = scenario.fault_impedance.to_dict()

        composite_label = f"Zwarcie: {scenario.name} ({fault_label}, {mode_label})"

        return {
            "scenario_id": str(scenario.scenario_id),
            "overlay_type": "fault_scenario",
            "fault_mode": scenario.fault_mode.value,
            "elements": [overlay_element],
            "legend": [
                {
                    "color_token": "warning",
                    "label": composite_label,
                    "description": "Miejsce zwarcia dla wybranego scenariusza",
                }
            ],
            "label": composite_label,
        }
