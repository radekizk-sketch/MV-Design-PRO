"""
ENMValidator — walidacja energetyczna modelu sieci (readiness gate).

To NIE jest walidacja API (HTTP 400). To walidacja PROJEKTU SIECI.
Komunikaty po polsku.
"""

from __future__ import annotations

from typing import Literal

import networkx as nx
from pydantic import BaseModel

from .fix_actions import FixAction
from .models import (
    Cable,
    EnergyNetworkModel,
    OverheadLine,
    SwitchBranch,
)


class ValidationIssue(BaseModel):
    code: str
    severity: Literal["BLOCKER", "IMPORTANT", "INFO"]
    message_pl: str
    element_refs: list[str] = []
    wizard_step_hint: str = ""
    suggested_fix: str | None = None
    fix_action: FixAction | None = None


class AnalysisAvailability(BaseModel):
    short_circuit_3f: bool = False
    short_circuit_1f: bool = False
    load_flow: bool = False


class ValidationResult(BaseModel):
    status: Literal["OK", "WARN", "FAIL"]
    issues: list[ValidationIssue] = []
    analysis_available: AnalysisAvailability = AnalysisAvailability()


class ReadinessResult(BaseModel):
    ready: bool
    blockers: list[ValidationIssue] = []


class ENMValidator:
    """Walidator energetyczny modelu sieci."""

    _SEVERITY_RANK = {"BLOCKER": 0, "IMPORTANT": 1, "INFO": 2}

    def validate(self, enm: EnergyNetworkModel) -> ValidationResult:
        issues: list[ValidationIssue] = []

        self._check_blockers(enm, issues)
        self._check_catalog_first(enm, issues)
        self._check_warnings(enm, issues)
        self._check_info(enm, issues)
        self._check_topology_entities(enm, issues)

        # Deterministic sort: severity_rank → code → first element_ref
        issues.sort(
            key=lambda i: (
                self._SEVERITY_RANK.get(i.severity, 9),
                i.code,
                i.element_refs[0] if i.element_refs else "",
            )
        )

        has_blockers = any(i.severity == "BLOCKER" for i in issues)
        has_warnings = any(i.severity == "IMPORTANT" for i in issues)

        if has_blockers:
            status: Literal["OK", "WARN", "FAIL"] = "FAIL"
        elif has_warnings:
            status = "WARN"
        else:
            status = "OK"

        availability = self._compute_availability(enm, issues)

        return ValidationResult(
            status=status,
            issues=issues,
            analysis_available=availability,
        )

    def readiness(self, validation: ValidationResult) -> ReadinessResult:
        blockers = [i for i in validation.issues if i.severity == "BLOCKER"]
        ready = validation.status != "FAIL" and len(blockers) == 0
        return ReadinessResult(ready=ready, blockers=blockers)

    # ------------------------------------------------------------------
    # BLOCKERS (E001-E009)
    # ------------------------------------------------------------------

    def _check_blockers(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        # E001: Brak źródła zasilania
        if not enm.sources:
            issues.append(
                ValidationIssue(
                    code="E001",
                    severity="BLOCKER",
                    message_pl="Brak źródła zasilania w modelu sieci.",
                    wizard_step_hint="K2",
                    suggested_fix="Dodaj źródło zasilania (sieć zewnętrzna lub Thevenin) na szynie głównej.",
                    fix_action=FixAction(
                        action_type="ADD_MISSING_DEVICE",
                        modal_type="SourceModal",
                        payload_hint={"required": "source"},
                    ),
                )
            )

        # E002: Brak szyn
        if not enm.buses:
            issues.append(
                ValidationIssue(
                    code="E002",
                    severity="BLOCKER",
                    message_pl="Brak szyn (węzłów) w modelu sieci.",
                    wizard_step_hint="K3",
                    suggested_fix="Dodaj przynajmniej jedną szynę w kroku K2 lub K3.",
                    fix_action=FixAction(
                        action_type="ADD_MISSING_DEVICE",
                        modal_type="NodeModal",
                        payload_hint={"required": "bus"},
                    ),
                )
            )

        # E003: Graf niespójny (wyspy odcięte od źródła)
        if len(enm.buses) > 1:
            self._check_graph_connectivity(enm, issues)

        # E004: Szyna bez napięcia znamionowego
        for bus in enm.buses:
            if bus.voltage_kv <= 0:
                issues.append(
                    ValidationIssue(
                        code="E004",
                        severity="BLOCKER",
                        message_pl=f"Szyna '{bus.ref_id}' nie ma napięcia znamionowego (voltage_kv <= 0).",
                        element_refs=[bus.ref_id],
                        wizard_step_hint="K3",
                        suggested_fix=f"Ustaw napięcie znamionowe szyny '{bus.name}'.",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=bus.ref_id,
                            modal_type="NodeModal",
                            payload_hint={"required": "voltage_kv"},
                        ),
                    )
                )

        # E005: Gałąź bez impedancji
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable):
                if branch.r_ohm_per_km == 0 and branch.x_ohm_per_km == 0:
                    issues.append(
                        ValidationIssue(
                            code="E005",
                            severity="BLOCKER",
                            message_pl=(
                                f"Gałąź '{branch.ref_id}' ma zerową impedancję "
                                f"(R=0 i X=0 Ω/km)."
                            ),
                            element_refs=[branch.ref_id],
                            wizard_step_hint="K4",
                            suggested_fix=f"Wprowadź parametry impedancji gałęzi '{branch.name}'.",
                            fix_action=FixAction(
                                action_type="OPEN_MODAL",
                                element_ref=branch.ref_id,
                                modal_type="BranchModal",
                                payload_hint={"required": "impedance"},
                            ),
                        )
                    )

        # E006: Transformator bez napięcia zwarcia
        for trafo in enm.transformers:
            if trafo.uk_percent <= 0:
                issues.append(
                    ValidationIssue(
                        code="E006",
                        severity="BLOCKER",
                        message_pl=(
                            f"Transformator '{trafo.ref_id}' nie ma napięcia zwarcia (uk% <= 0)."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix=f"Wprowadź uk% transformatora '{trafo.name}'.",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "uk_percent"},
                        ),
                    )
                )

        # E007: Transformator hv = lv
        for trafo in enm.transformers:
            if trafo.hv_bus_ref == trafo.lv_bus_ref:
                issues.append(
                    ValidationIssue(
                        code="E007",
                        severity="BLOCKER",
                        message_pl=(
                            f"Transformator '{trafo.ref_id}': strona HV i LV "
                            f"podłączone do tej samej szyny '{trafo.hv_bus_ref}'."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix="Podłącz strony HV i LV do różnych szyn.",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "bus_assignment"},
                        ),
                    )
                )

        # E008: Źródło bez parametrów zwarciowych
        for source in enm.sources:
            has_sk = source.sk3_mva is not None and source.sk3_mva > 0
            has_rx = (
                source.r_ohm is not None
                and source.x_ohm is not None
                and (source.r_ohm > 0 or source.x_ohm > 0)
            )
            has_ik = source.ik3_ka is not None and source.ik3_ka > 0
            if not (has_sk or has_rx or has_ik):
                issues.append(
                    ValidationIssue(
                        code="sources.no_short_circuit_params",
                        severity="BLOCKER",
                        message_pl=(
                            f"Źródło '{source.ref_id}' nie ma parametrów zwarciowych "
                            f"(brak Sk'', Ik'' lub R/X)."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix=(
                            f"Wprowadź moc zwarciową Sk'' lub impedancję R+jX "
                            f"źródła '{source.name}'."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "short_circuit_params"},
                        ),
                    )
                )

        # E009: Brak referencji katalogowej (CATALOG-FIRST)
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable) and not branch.catalog_ref:
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity="BLOCKER",
                        message_pl=(
                            f"Gałąź '{branch.ref_id}' nie ma referencji katalogowej "
                            f"(catalog_ref)."
                        ),
                        element_refs=[branch.ref_id],
                        wizard_step_hint="K4",
                        suggested_fix="Przypisz element z katalogu i zapisz catalog_ref.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=branch.ref_id,
                            modal_type="BranchModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

        for trafo in enm.transformers:
            if not trafo.catalog_ref:
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity="BLOCKER",
                        message_pl=(
                            f"Transformator '{trafo.ref_id}' nie ma referencji katalogowej "
                            f"(catalog_ref)."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix="Przypisz transformator z katalogu i zapisz catalog_ref.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

        for source in enm.sources:
            if not source.catalog_ref:
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity="BLOCKER",
                        message_pl=(
                            f"Źródło '{source.ref_id}' nie ma referencji katalogowej "
                            f"(catalog_ref)."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix="Wybierz źródło systemowe z katalogu i zapisz catalog_ref.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

    # ------------------------------------------------------------------
    # WARNINGS (W001-W004)
    # ------------------------------------------------------------------

    def _check_warnings(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        # W001: Brak Z₀ na linii
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable):
                if branch.r0_ohm_per_km is None and branch.x0_ohm_per_km is None:
                    issues.append(
                        ValidationIssue(
                            code="W001",
                            severity="IMPORTANT",
                            message_pl=(
                                f"Gałąź '{branch.ref_id}' nie ma składowej zerowej (Z₀) — "
                                f"zwarcia 1F/2F-Z niedostępne."
                            ),
                            element_refs=[branch.ref_id],
                            wizard_step_hint="K7",
                            suggested_fix="Wprowadź parametry R₀/X₀ w kroku K7.",
                            fix_action=FixAction(
                                action_type="OPEN_MODAL",
                                element_ref=branch.ref_id,
                                modal_type="BranchModal",
                                payload_hint={"required": "zero_sequence"},
                            ),
                        )
                    )

        # W002: Brak Z₀ źródła
        for source in enm.sources:
            has_z0 = (
                source.r0_ohm is not None and source.x0_ohm is not None
            ) or source.z0_z1_ratio is not None
            if not has_z0:
                issues.append(
                    ValidationIssue(
                        code="W002",
                        severity="IMPORTANT",
                        message_pl=(
                            f"Źródło '{source.ref_id}' nie ma składowej zerowej (Z₀) — "
                            f"zwarcia 1F/2F-Z niedostępne."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix="Wprowadź parametry R₀/X₀ lub Z₀/Z₁ źródła.",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "zero_sequence"},
                        ),
                    )
                )

        # W003: Brak odbiorów/generacji
        if not enm.loads and not enm.generators:
            issues.append(
                ValidationIssue(
                    code="W003",
                    severity="IMPORTANT",
                    message_pl="Brak odbiorów i generatorów — rozpływ mocy będzie pusty.",
                    wizard_step_hint="K6",
                    suggested_fix="Dodaj odbiory lub generatory w kroku K6.",
                    fix_action=FixAction(
                        action_type="ADD_MISSING_DEVICE",
                        modal_type="LoadModal",
                        payload_hint={"required": "load_or_generator"},
                    ),
                )
            )

        # W004: Transformator bez grupy połączeń
        for trafo in enm.transformers:
            if not trafo.vector_group:
                issues.append(
                    ValidationIssue(
                        code="W004",
                        severity="IMPORTANT",
                        message_pl=(
                            f"Transformator '{trafo.ref_id}' nie ma grupy "
                            f"połączeń (vector_group)."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix="Wprowadź grupę połączeń (np. Dyn11).",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "vector_group"},
                        ),
                    )
                )

    # ------------------------------------------------------------------
    # CATALOG-FIRST checks (E010)
    # ------------------------------------------------------------------

    def _check_catalog_first(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        # E009 for branches + transformers is in _check_blockers (canonical).

        # E010: Overrides bez parameter_source=OVERRIDE
        all_elements = [
            *enm.branches,
            *enm.transformers,
            *enm.loads,
            *enm.generators,
            *enm.measurements,
            *enm.protection_assignments,
        ]
        for elem in all_elements:
            overrides = getattr(elem, "overrides", [])
            param_source = getattr(elem, "parameter_source", None)
            if overrides and param_source != "OVERRIDE":
                issues.append(
                    ValidationIssue(
                        code="E010",
                        severity="BLOCKER",
                        message_pl=(
                            f"Element '{elem.ref_id}' ma overrides, ale "
                            f"parameter_source != 'OVERRIDE'."
                        ),
                        element_refs=[elem.ref_id],
                        wizard_step_hint="K4",
                        suggested_fix="Ustaw parameter_source='OVERRIDE' lub usuń overrides.",
                        fix_action=FixAction(
                            action_type="NAVIGATE_TO_ELEMENT",
                            element_ref=elem.ref_id,
                            payload_hint={"required": "parameter_source"},
                        ),
                    )
                )

    # ------------------------------------------------------------------
    # INFO (I001-I002)
    # ------------------------------------------------------------------

    def _check_info(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        # I001: Łącznik otwarty
        for branch in enm.branches:
            if isinstance(branch, SwitchBranch) and branch.status == "open":
                issues.append(
                    ValidationIssue(
                        code="I001",
                        severity="INFO",
                        message_pl=(
                            f"Łącznik '{branch.ref_id}' w stanie 'open' — " f"odcina część sieci."
                        ),
                        element_refs=[branch.ref_id],
                        wizard_step_hint="K3",
                    )
                )

        # I002: Gałąź bez katalogu
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable) and not branch.catalog_ref:
                issues.append(
                    ValidationIssue(
                        code="I002",
                        severity="INFO",
                        message_pl=(
                            f"Gałąź '{branch.ref_id}' bez katalogu — "
                            f"parametry wprowadzone ręcznie."
                        ),
                        element_refs=[branch.ref_id],
                        wizard_step_hint="K4",
                    )
                )

    # ------------------------------------------------------------------
    # Topology entity checks (W005-W008, I003-I005)
    # ------------------------------------------------------------------

    def _check_topology_entities(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        bus_refs = {b.ref_id for b in enm.buses}
        branch_refs = {b.ref_id for b in enm.branches}
        trafo_refs = {t.ref_id for t in enm.transformers}
        substation_refs = {s.ref_id for s in enm.substations}

        # W005: Stacja referencja do nieistniejącej szyny
        for sub in enm.substations:
            for br in sub.bus_refs:
                if br not in bus_refs:
                    issues.append(
                        ValidationIssue(
                            code="W005",
                            severity="IMPORTANT",
                            message_pl=(
                                f"Stacja '{sub.ref_id}' zawiera referencję do "
                                f"nieistniejącej szyny '{br}'."
                            ),
                            element_refs=[sub.ref_id, br],
                            wizard_step_hint="K3",
                            suggested_fix="Usuń niepoprawną referencję lub dodaj brakującą szynę.",
                        )
                    )
            for tr in sub.transformer_refs:
                if tr not in trafo_refs:
                    issues.append(
                        ValidationIssue(
                            code="W005",
                            severity="IMPORTANT",
                            message_pl=(
                                f"Stacja '{sub.ref_id}' zawiera referencję do "
                                f"nieistniejącego transformatora '{tr}'."
                            ),
                            element_refs=[sub.ref_id, tr],
                            wizard_step_hint="K5",
                            suggested_fix=(
                                "Usuń niepoprawną referencję lub dodaj brakujący transformator."
                            ),
                        )
                    )

        # W006: Pole (Bay) referencja do nieistniejącej stacji lub szyny
        for bay in enm.bays:
            if bay.substation_ref not in substation_refs:
                issues.append(
                    ValidationIssue(
                        code="W006",
                        severity="IMPORTANT",
                        message_pl=(
                            f"Pole '{bay.ref_id}' referencja do nieistniejącej "
                            f"stacji '{bay.substation_ref}'."
                        ),
                        element_refs=[bay.ref_id, bay.substation_ref],
                        wizard_step_hint="K3",
                        suggested_fix="Przypisz pole do istniejącej stacji.",
                    )
                )
            if bay.bus_ref not in bus_refs:
                issues.append(
                    ValidationIssue(
                        code="W006",
                        severity="IMPORTANT",
                        message_pl=(
                            f"Pole '{bay.ref_id}' referencja do nieistniejącej "
                            f"szyny '{bay.bus_ref}'."
                        ),
                        element_refs=[bay.ref_id, bay.bus_ref],
                        wizard_step_hint="K3",
                        suggested_fix="Przypisz pole do istniejącej szyny.",
                    )
                )

        # W007: Junction z mniej niż 3 gałęziami
        for junc in enm.junctions:
            if len(junc.connected_branch_refs) < 3:
                issues.append(
                    ValidationIssue(
                        code="W007",
                        severity="IMPORTANT",
                        message_pl=(
                            f"Węzeł T '{junc.ref_id}' ma {len(junc.connected_branch_refs)} "
                            f"gałęzi — wymagane minimum 3."
                        ),
                        element_refs=[junc.ref_id],
                        wizard_step_hint="K4",
                        suggested_fix="Dodaj brakujące gałęzie do węzła T.",
                    )
                )
            for br_ref in junc.connected_branch_refs:
                if br_ref not in branch_refs:
                    issues.append(
                        ValidationIssue(
                            code="W007",
                            severity="IMPORTANT",
                            message_pl=(
                                f"Węzeł T '{junc.ref_id}' referencja do "
                                f"nieistniejącej gałęzi '{br_ref}'."
                            ),
                            element_refs=[junc.ref_id, br_ref],
                            wizard_step_hint="K4",
                            suggested_fix="Usuń niepoprawną referencję lub dodaj brakującą gałąź.",
                        )
                    )

        # W008: Corridor z nieistniejącymi segmentami
        for corr in enm.corridors:
            for seg_ref in corr.ordered_segment_refs:
                if seg_ref not in branch_refs:
                    issues.append(
                        ValidationIssue(
                            code="W008",
                            severity="IMPORTANT",
                            message_pl=(
                                f"Magistrala '{corr.ref_id}' referencja do "
                                f"nieistniejącego segmentu '{seg_ref}'."
                            ),
                            element_refs=[corr.ref_id, seg_ref],
                            wizard_step_hint="K4",
                            suggested_fix="Usuń niepoprawną referencję lub dodaj brakujący segment.",
                        )
                    )

        # I003: Stacja bez pól (bayów)
        substations_with_bays = {bay.substation_ref for bay in enm.bays}
        for sub in enm.substations:
            if sub.ref_id not in substations_with_bays:
                issues.append(
                    ValidationIssue(
                        code="I003",
                        severity="INFO",
                        message_pl=(
                            f"Stacja '{sub.ref_id}' nie ma przypisanych pól rozdzielczych."
                        ),
                        element_refs=[sub.ref_id],
                        wizard_step_hint="K3",
                    )
                )

        # I004: Pusta magistrala (corridor bez segmentów)
        for corr in enm.corridors:
            if not corr.ordered_segment_refs:
                issues.append(
                    ValidationIssue(
                        code="I004",
                        severity="INFO",
                        message_pl=(f"Magistrala '{corr.ref_id}' nie ma segmentów."),
                        element_refs=[corr.ref_id],
                        wizard_step_hint="K4",
                    )
                )

        # I005: Pierścień bez punktu NO
        for corr in enm.corridors:
            if corr.corridor_type == "ring" and not corr.no_point_ref:
                issues.append(
                    ValidationIssue(
                        code="I005",
                        severity="INFO",
                        message_pl=(
                            f"Magistrala pierścieniowa '{corr.ref_id}' nie ma "
                            f"zdefiniowanego punktu normalnie otwartego (NO)."
                        ),
                        element_refs=[corr.ref_id],
                        wizard_step_hint="K4",
                    )
                )

    # ------------------------------------------------------------------
    # Graph connectivity check
    # ------------------------------------------------------------------

    def _check_graph_connectivity(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        g = nx.Graph()
        bus_refs = {b.ref_id for b in enm.buses}
        for ref in bus_refs:
            g.add_node(ref)

        for branch in enm.branches:
            if branch.status == "closed":
                if branch.from_bus_ref in bus_refs and branch.to_bus_ref in bus_refs:
                    g.add_edge(branch.from_bus_ref, branch.to_bus_ref)

        for trafo in enm.transformers:
            if trafo.hv_bus_ref in bus_refs and trafo.lv_bus_ref in bus_refs:
                g.add_edge(trafo.hv_bus_ref, trafo.lv_bus_ref)

        source_bus_refs = {s.bus_ref for s in enm.sources if s.bus_ref in bus_refs}

        components = list(nx.connected_components(g))
        if len(components) <= 1:
            return

        for comp in components:
            if not comp.intersection(source_bus_refs):
                island_refs = sorted(comp)
                issues.append(
                    ValidationIssue(
                        code="E003",
                        severity="BLOCKER",
                        message_pl=(
                            f"Wyspa sieci odcięta od źródła zasilania: "
                            f"{', '.join(island_refs[:5])}"
                            f"{'...' if len(island_refs) > 5 else ''}."
                        ),
                        element_refs=island_refs[:10],
                        wizard_step_hint="K4",
                        suggested_fix="Połącz odizolowane szyny z resztą sieci.",
                    )
                )

    # ------------------------------------------------------------------
    # Analysis availability
    # ------------------------------------------------------------------

    def _compute_availability(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> AnalysisAvailability:
        has_blockers = any(i.severity == "BLOCKER" for i in issues)

        if has_blockers:
            return AnalysisAvailability(
                short_circuit_3f=False,
                short_circuit_1f=False,
                load_flow=False,
            )

        # SC 1F requires Z₀ on all lines and sources
        has_z0_warnings = any(i.code in ("W001", "W002") for i in issues)
        sc_1f = not has_z0_warnings

        # Load flow requires at least one load or generator
        has_loads = bool(enm.loads) or bool(enm.generators)

        return AnalysisAvailability(
            short_circuit_3f=True,
            short_circuit_1f=sc_1f,
            load_flow=has_loads,
        )
