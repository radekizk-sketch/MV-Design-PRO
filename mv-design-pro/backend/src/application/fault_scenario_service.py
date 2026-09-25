"""
Fault Scenario Service — PR-19 + PR-24 + C6-PERSIST

Application service for managing fault scenarios.
Handles CRUD, validation, content hash computation,
eligibility checking, and SLD overlay generation.

TRWAŁOŚĆ (karta C6-PERSIST, 2026-09-05). Scenariusze zwarciowe są teraz
scenariuszami roboczymi NAZWANYMI (`enm.scenariusze.OperatingScenario` z
`kind=FAULT_STUDY`, `fault_spec=<FaultScenario>`) w magazynie scenariuszy per
projekt (`enm/scenariusze.py`: `zapisz_scenariusz`, `wczytaj_scenariusz`,
`lista_scenariuszy`, `usun_scenariusz`) — restart procesu backendu NIE gubi
scenariuszy (poprzednio: słownik w pamięci `_scenarios`/`_case_scenarios`/
`_scenario_runs`, wymazywany przy każdym restarcie). Serwis jest odtąd
BEZSTANOWY wobec danych: nie trzyma żadnego scenariusza w atrybucie instancji,
tylko dostaje `klucz` (klucz magazynu Canonical Project Twin) jako argument
KAŻDEJ metody, dokładnie tak samo, jak `enm.canonical_analysis.create_run`
dostaje `klucz_twin`. Tłumaczenie `case_id -> klucz` dzieje się WYŁĄCZNIE na
granicy API (`api/klucz_twin_dep.klucz_twin_z_sciezki`) — ten moduł nigdy nie
widzi surowego `case_id`.

„Ma powiązane biegi" (blokada usunięcia) jest odtąd WYPROWADZANA z rejestru
biegów kanonicznych (koperta biegu niesie `scenario_ref`), nie zapisywana w
osobnym rejestrze — `register_run` (jedyne miejsce zapisu tamtego rejestru)
został usunięty razem z rejestrem: druga prawda o tym samym fakcie (bieg
istnieje) była defektem oczekującym na rozjazd, nie funkcją.

INVARIANTS:
- ZERO auto-completion of missing data
- ZERO heuristics
- Deterministic content_hash (SHA-256)
- All scenarios sorted deterministically
- Polish error messages
- Copy-on-write updates (PR-24)
- Dependency check before delete (PR-24), wyprowadzona z koperty biegu (C6-PERSIST)
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from domain.canonical_operations import READINESS_CODES
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
from enm.scenariusze import (
    OperatingScenario,
    RodzajScenariusza,
    ScenariuszNieistniejeError,
    lista_scenariuszy,
    opcje_biegu_ze_scenariusza,
    usun_scenariusz,
    wczytaj_scenariusz,
    zapisz_scenariusz,
)

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

#: Typy lokalizacji na gałęzi — adapter obliczeniowy nie ma dziś sposobu
#: rozdzielenia modelu w punkcie pośrednim (jeden kod gotowości dla obu, karta
#: C6-PERSIST — to ta sama klasa ograniczenia bindingu, nie dwa warunki).
_LOKALIZACJE_NA_GALEZI: frozenset[str] = frozenset({"BRANCH", "BRANCH_POINT"})


def _operating_scenario_z_fault(scenario: FaultScenario) -> OperatingScenario:
    """Opakuj `FaultScenario` w scenariusz roboczy `kind=FAULT_STUDY` — JEDEN
    byt (§0 karty C6-PERSIST), bez nadpisań modelu. JEDNO miejsce tego
    opakowania — używane zarówno przez zapis w magazynie (`FaultScenarioService.
    _wpis`), jak i przez `solver_input_for_scenario` (funkcja modułowa, bez
    dostępu do metody instancji)."""
    return OperatingScenario(
        scenario_id=str(scenario.scenario_id),
        name=scenario.name,
        kind=RodzajScenariusza.FAULT_STUDY,
        fault_spec=scenario,
    )


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

    BEZSTANOWY (karta C6-PERSIST): żadna metoda nie czyta ani nie zapisuje
    atrybutu instancji z treścią scenariusza — treść żyje wyłącznie w magazynie
    scenariuszy (`enm/scenariusze.py`), adresowanym `klucz` (klucz magazynu
    Canonical Project Twin) przekazanym jawnie do każdej metody.

    Responsibilities:
    - Create validated fault scenarios
    - Update scenarios (copy-on-write, nowa rewizja w magazynie)
    - List scenarios for a study case (sorted deterministically)
    - Delete scenarios (dependency check wyprowadzony z koperty biegu)
    - Validate scenario invariants
    - Compute content hash
    - Check scenario eligibility
    - Generate SLD overlay for a scenario
    """

    def _wpis(self, scenario: FaultScenario) -> OperatingScenario:
        """Opakuj `FaultScenario` w scenariusz roboczy do zapisu w magazynie."""
        return _operating_scenario_z_fault(scenario)

    def create_scenario(
        self,
        *,
        klucz: str,
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
            klucz: Klucz magazynu scenariuszy (Canonical Project Twin), przetłumaczony
                z `study_case_id` przez wołającego (`api/klucz_twin_dep.py`).
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

        # Check for duplicate content_hash — scope: TEN SAM przypadek (parytet
        # z zachowaniem sprzed C6-PERSIST, kiedy indeks w pamięci był per case_id).
        for existing in self.list_scenarios(klucz, study_case_id):
            if existing.content_hash == scenario.content_hash:
                raise FaultScenarioDuplicateError(scenario.content_hash)

        zapisz_scenariusz(klucz, self._wpis(scenario))

        logger.info(
            "Created fault scenario %s: name=%s, type=%s, location=%s, hash=%s",
            scenario.scenario_id,
            scenario.name,
            scenario.fault_type.value,
            scenario.location.element_ref,
            scenario.content_hash[:16],
        )

        return scenario

    def get_scenario_ze_wpisem(self, klucz: str, scenario_id: UUID) -> OperatingScenario:
        """Scenariusz roboczy KOMPLETNY (z rewizją magazynu), do budowy biegu.

        `get_scenario` (niżej) zwraca tylko `FaultScenario` — wystarczające dla
        kontraktu CRUD/API. Budowa biegu (`enm.canonical_analysis.create_run
        (scenariusz=...)`) potrzebuje CAŁEGO wpisu, bo koperta biegu niesie
        `OperatingScenario.revision` z magazynu, nie tylko treść zwarcia
        (karta C6-PERSIST — `api/fault_scenarios.py::create_run_from_scenario`,
        `application/batch_execution_service.py::execute_batch`).
        """
        try:
            wpis = wczytaj_scenariusz(klucz, str(scenario_id))
        except ScenariuszNieistniejeError as exc:
            raise FaultScenarioNotFoundError(str(scenario_id)) from exc
        if wpis.kind != RodzajScenariusza.FAULT_STUDY or wpis.fault_spec is None:
            # Magazyn scenariuszy jest wspólny dla wszystkich rodzajów (N-1,
            # MAX_LOAD, ...) — identyfikator istnieje, ale NIE jest scenariuszem
            # zwarciowym: z perspektywy tego serwisu to uczciwy brak, nie awaria.
            raise FaultScenarioNotFoundError(str(scenario_id))
        return wpis

    def get_scenario(self, klucz: str, scenario_id: UUID) -> FaultScenario:
        """Get a fault scenario by ID (najnowsza, nieusunięta rewizja magazynu)."""
        wpis = self.get_scenario_ze_wpisem(klucz, scenario_id)
        assert wpis.fault_spec is not None  # gwarantowane przez get_scenario_ze_wpisem
        return wpis.fault_spec

    def list_scenarios(self, klucz: str, study_case_id: UUID) -> list[FaultScenario]:
        """
        List all fault scenarios for a study case.

        Sorted deterministically by (fault_type, element_ref).
        """
        scenarios = [
            wpis.fault_spec
            for wpis in lista_scenariuszy(klucz)
            if wpis.kind == RodzajScenariusza.FAULT_STUDY
            and wpis.fault_spec is not None
            and wpis.fault_spec.study_case_id == study_case_id
        ]
        scenarios.sort(key=lambda s: (s.fault_type.value, s.location.element_ref))
        return scenarios

    def update_scenario(
        self,
        klucz: str,
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

        Creates a new immutable FaultScenario with updated fields, recomputes
        content_hash, and zapisuje NOWĄ REWIZJĘ w magazynie scenariuszy (numer
        rewizji nadaje magazyn — `enm.scenariusze.zapisz_scenariusz`; zapis treści
        identycznej z ostatnią rewizją nie tworzy nowej rewizji).

        Args:
            klucz: Klucz magazynu scenariuszy.
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
        existing = self.get_scenario(klucz, scenario_id)

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

        zapisz_scenariusz(klucz, self._wpis(updated))

        logger.info(
            "Updated fault scenario %s: name=%s, hash=%s",
            scenario_id,
            updated.name,
            updated.content_hash[:16],
        )

        return updated

    def delete_scenario(self, klucz: str, scenario_id: UUID) -> None:
        """
        Delete a fault scenario.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
            FaultScenarioHasRunsError: If scenario has associated runs.
        """
        existing = self.get_scenario(klucz, scenario_id)

        if self.has_associated_runs(existing.study_case_id, scenario_id):
            raise FaultScenarioHasRunsError(str(scenario_id))

        usun_scenariusz(klucz, str(scenario_id))

        logger.info("Deleted fault scenario %s", scenario_id)

    def has_associated_runs(self, study_case_id: UUID, scenario_id: UUID) -> bool:
        """
        Check if a scenario has associated execution runs.

        WYPROWADZONE z rejestru biegów kanonicznych (karta C6-PERSIST), nie
        zapisywane osobno: prawda jest JEDNA — istnieje `CanonicalRun` przypadku,
        którego koperta niesie referencję do tego scenariusza (dowolnej rewizji).
        `register_run` (dawny zapis „drugiej prawdy" w pamięci) został usunięty.

        Returns:
            True if the scenario has at least one associated run.
        """
        from enm.canonical_analysis import list_runs_for_case  # noqa: PLC0415

        cel = str(scenario_id)
        for run in list_runs_for_case(str(study_case_id)):
            koperta = run.koperta
            if koperta is not None and koperta.scenario_ref is not None:
                if koperta.scenario_ref[0] == cel:
                    return True
        return False

    def validate_scenario(self, klucz: str, scenario_id: UUID) -> None:
        """
        Re-validate an existing scenario's invariants.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
            FaultScenarioValidationError: If invariants are violated.
        """
        scenario = self.get_scenario(klucz, scenario_id)
        validate_fault_scenario(scenario)

    def compute_hash(self, klucz: str, scenario_id: UUID) -> str:
        """
        Recompute content hash for a scenario (for verification).

        Returns:
            SHA-256 content hash.
        """
        scenario = self.get_scenario(klucz, scenario_id)
        return compute_scenario_content_hash(scenario)

    def check_scenario_eligibility(
        self, klucz: str, scenario_id: UUID
    ) -> AnalysisEligibilityResult:
        """
        Check eligibility of a fault scenario for execution.

        Rules:
        - If fault_node_ref is empty -> BLOCKER with NAVIGATE_TO_ELEMENT
        - If SC_1F and no z0_bus_data -> BLOCKER with OPEN_MODAL "Uzupelnij Z0"
        - If SC_2F and no z2 data -> INELIGIBLE with OPEN_MODAL "Uzupelnij Z2"
        - Lokalizacja na gałęzi (BRANCH/BRANCH_POINT) -> BLOCKER (kod gotowości
          kanonu, karta C6-PERSIST — adapter obliczeniowy liczy wyłącznie węzeł)
        - All messages in Polish

        Args:
            klucz: Klucz magazynu scenariuszy.
            scenario_id: ID of the scenario to check.

        Returns:
            AnalysisEligibilityResult with status and issues.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
        """
        scenario = self.get_scenario(klucz, scenario_id)
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

        # v2 Rule 5 (karta C6-PERSIST): lokalizacja NA GAŁĘZI (BRANCH/BRANCH_POINT)
        # — binding unsupported. JEDEN kod kanonu dla obu typów lokalizacji
        # gałęziowej (rejestr `domain/canonical_operations.py::READINESS_CODES`) —
        # to samo ograniczenie bindingu czyta TEN SAM komunikat, którym odmawia
        # `enm.canonical_analysis._execute_short_circuit`, gdyby ktoś ominął tę
        # bramkę (jedno źródło prawdy, nie dwa niezależne teksty).
        if scenario.location.location_type in _LOKALIZACJE_NA_GALEZI:
            spec = READINESS_CODES["fault.location_on_branch_requires_assembler"]
            blockers.append(
                AnalysisEligibilityIssue(
                    code=spec.code,
                    severity=IssueSeverity.BLOCKER,
                    message_pl=spec.message_pl,
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

    def get_scenario_sld_overlay(self, klucz: str, scenario_id: UUID) -> dict[str, Any]:
        """
        Generate SLD overlay payload for a fault scenario.

        Returns a structured overlay payload compatible with PR-16
        SLD overlay protocol.

        Args:
            klucz: Klucz magazynu scenariuszy.
            scenario_id: ID of the scenario.

        Returns:
            Overlay payload dict with elements, legend, and label.

        Raises:
            FaultScenarioNotFoundError: If scenario does not exist.
        """
        scenario = self.get_scenario(klucz, scenario_id)

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


# ---------------------------------------------------------------------------
# Wejście solvera ze scenariusza — JEDNO źródło prawdy (karta BATCH-ROUTER)
# ---------------------------------------------------------------------------


def solver_input_for_scenario(scenario: FaultScenario) -> dict[str, Any]:
    """Zbuduj wejście solvera biegu kanonicznego ze scenariusza zwarciowego.

    Cienki alias `enm.scenariusze.opcje_biegu_ze_scenariusza` (karta C6-PERSIST
    — JEDNA prawda projekcji scenariusza na opcje biegu, dzielona z magazynem
    scenariuszy; `FaultScenario` jest tu opakowywany w `OperatingScenario`
    tylko po to, żeby dwa niezależne wywołujące tego pliku (pojedynczy bieg
    `POST /api/execution/fault-scenarios/{id}/runs` oraz seria `POST /api/
    execution/study-cases/{id}/batches` — reguła KLASA, NIE INSTANCJA) nie
    musiały same znać kształtu `OperatingScenario`.
    """
    return opcje_biegu_ze_scenariusza(_operating_scenario_z_fault(scenario))
