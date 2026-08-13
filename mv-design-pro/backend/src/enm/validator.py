"""
ENMValidator — walidacja energetyczna modelu sieci (readiness gate).

To NIE jest walidacja API (HTTP 400). To walidacja PROJEKTU SIECI.
Komunikaty po polsku.
"""

from __future__ import annotations

import math
import os

import networkx as nx
from pydantic import BaseModel

from .fix_actions import FixAction
from .interlock_rules import earthing_interlock_violation
from .models import (
    GEN_TYPES_PRZEKSZTALTNIKOWE,
    Cable,
    EnergyNetworkModel,
    OverheadLine,
    SwitchBranch,
)
from .pole_transformatorowe import (
    PASMO_NN_MAX_KV,
    PASMO_SN_MAX_KV,
    komunikat_braku_pola,
    pasmo_napieciowe,
    transformatory_bez_pola_sn,
)
from .severity import (
    SEVERITY_BLOCKER,
    SEVERITY_IMPORTANT,
    SEVERITY_INFO,
    STATUS_FAIL,
    STATUS_OK,
    STATUS_WARN,
    ValidationSeverity,
    ValidationStatus,
    is_blocking_severity,
    is_warning_severity,
    severity_rank,
)

# V12S-007: voltage band thresholds (kV).
# Pasma napieciowe domeny:
#   nN : voltage_kv < 1.0
#   SN : 1.0 <= voltage_kv <= 60.0
#   WN : voltage_kv > 60.0
#
# KOMPLETNOSC-POLA-TR: progi i funkcja pasma PRZENIESIONE do
# `enm/pole_transformatorowe.py` — predykat pola transformatorowego pyta o to
# samo pasmo („strona gorna na szynie SN"), a dwie kopie granicy 60 kV byłyby
# dwoma zrodlami prawdy czekajacymi na rozjazd (regula KLASA §3). Walidator jest
# tu KONSUMENTEM definicji, nie jej wlascicielem.
_VOLTAGE_BAND_NN_MAX = PASMO_NN_MAX_KV
_VOLTAGE_BAND_SN_MAX = PASMO_SN_MAX_KV
_voltage_band = pasmo_napieciowe


_STRICT_PORT_BINDING_ENV = "ENM_STRICT_PORT_BINDING"


def _strict_port_binding_enabled() -> bool:
    """True gdy walidator wymusza obecność `endpoint_a_port` / `endpoint_b_port`.

    Domyślnie False — migracja `enm.migrations.endpoint_ports` jest
    konserwatywna i pozostawia luki tam gdzie operator musi świadomie wybrać
    port. Flaga włącza twardy gate E030 dla projektów po zmigrowanych
    fixture'ach (PR 1.b).
    """
    return os.environ.get(_STRICT_PORT_BINDING_ENV, "0").lower() in ("1", "true", "yes", "on")


class ValidationIssue(BaseModel):
    code: str
    severity: ValidationSeverity
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
    status: ValidationStatus
    issues: list[ValidationIssue] = []
    analysis_available: AnalysisAvailability = AnalysisAvailability()


class ReadinessResult(BaseModel):
    ready: bool
    blockers: list[ValidationIssue] = []


class ENMValidator:
    """Walidator energetyczny modelu sieci."""

    def validate(self, enm: EnergyNetworkModel) -> ValidationResult:
        issues: list[ValidationIssue] = []

        self._check_blockers(enm, issues)
        self._check_catalog_first(enm, issues)
        self._check_warnings(enm, issues)
        self._check_info(enm, issues)
        self._check_topology_entities(enm, issues)
        self._check_shunt_capacitors(enm, issues)
        # V12S-007: pasmo napieciowe + ciaglosc przez stacje przelotowa
        self._check_voltage_band_consistency(enm, issues)
        self._check_through_station_continuity(enm, issues)
        # KOMPLETNOSC-POLA-TR: transformator na szynie SN bez pola roli TR
        self._check_transformer_sn_bay(enm, issues)

        # Deterministic sort: severity_rank → code → first element_ref
        issues.sort(
            key=lambda i: (
                severity_rank(i.severity),
                i.code,
                i.element_refs[0] if i.element_refs else "",
            )
        )

        has_blockers = any(is_blocking_severity(i.severity) for i in issues)
        has_warnings = any(is_warning_severity(i.severity) for i in issues)

        if has_blockers:
            status: ValidationStatus = STATUS_FAIL
        elif has_warnings:
            status = STATUS_WARN
        else:
            status = STATUS_OK

        availability = self._compute_availability(enm, issues)

        return ValidationResult(
            status=status,
            issues=issues,
            analysis_available=availability,
        )

    def readiness(self, validation: ValidationResult) -> ReadinessResult:
        blockers = [i for i in validation.issues if is_blocking_severity(i.severity)]
        ready = validation.status != STATUS_FAIL and len(blockers) == 0
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
                    severity=SEVERITY_BLOCKER,
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
                    severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_BLOCKER,
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
                            severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_BLOCKER,
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

        # E028: DER (inverter generator) bez connection_variant
        # Phase 0C operator-grade SLD plan v2: każdy DER musi mieć jawnie
        # zdefiniowany connection_variant — bez tego SLD nie wie jak
        # narysować drzewo połączeń (LV_BEHIND_STATION_TRANSFORMER vs
        # DEDICATED_MV_CONNECTION vs SOURCE_CONNECTION_STATION vs
        # nn_side / block_transformer).
        # Jedno zrodlo prawdy predykatu DER: enm/models.py (obok Literalu gen_type).
        _INVERTER_GEN_TYPES = GEN_TYPES_PRZEKSZTALTNIKOWE
        for gen in enm.generators:
            gen_type = getattr(gen, "gen_type", None)
            if gen_type not in _INVERTER_GEN_TYPES:
                continue
            connection_variant = getattr(gen, "connection_variant", None)
            if not connection_variant:
                issues.append(
                    ValidationIssue(
                        code="E028",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"DER '{gen.ref_id}' (typ {gen_type}) nie ma "
                            f"`connection_variant`. Każdy falownik wymaga jawnego "
                            f"określenia toru przyłączenia "
                            f"(nn_side / block_transformer / SOURCE_CONNECTION_STATION)."
                        ),
                        element_refs=[gen.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Wybierz wariant przyłączenia DER '{gen.name or gen.ref_id}': "
                            f"nN za transformatorem stacji, dedykowany transformator blokowy, "
                            f"lub osobna stacja źródłowa SN."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=gen.ref_id,
                            modal_type="GeneratorModal",
                            payload_hint={"required": "connection_variant"},
                        ),
                    )
                )

        # E029: DER (inverter generator) bezpośrednio na szynie SN — niedozwolone
        # Decision #11 + #12 + #14 (BINDING): falownik (pv_inverter, wind_inverter,
        # fw_*, bess) jest ZAWSZE elementem nN.
        #
        # E029 strzela TYLKO gdy:
        #   - bus_ref jest SN (>1 kV)
        #   - connection_variant ∈ {nn_side, LV_BEHIND_STATION_TRANSFORMER, None}
        #     (warianty bez explicit trafo blokowego w schemacie ENM)
        #
        # E029 NIE strzela dla:
        #   - block_transformer (Decision #14: trafo blokowy w schemacie ENM —
        #     bus_ref może być SN bo blocking_transformer_ref wskazuje na trafo
        #     LV→MV w torze)
        #   - DEDICATED_MV_CONNECTION (analogicznie)
        #   - SOURCE_CONNECTION_STATION (osobna stacja źródłowa SN/nN)
        _SN_DIRECT_FORBIDDEN_VARIANTS = {None, "nn_side", "LV_BEHIND_STATION_TRANSFORMER"}
        bus_voltage_map: dict[str, float] = {}
        for b in enm.buses:
            if b.voltage_kv is not None:
                bus_voltage_map[b.ref_id] = float(b.voltage_kv)

        for gen in enm.generators:
            gen_type = getattr(gen, "gen_type", None)
            if gen_type not in _INVERTER_GEN_TYPES:
                continue
            connection_variant = getattr(gen, "connection_variant", None)
            if connection_variant not in _SN_DIRECT_FORBIDDEN_VARIANTS:
                # Wariant deklaruje trafo w torze (block_transformer / DEDICATED_MV /
                # SOURCE_CONNECTION_STATION) — bus_ref może być SN bez naruszenia.
                continue
            bus_ref = getattr(gen, "bus_ref", None)
            if not bus_ref:
                continue
            bus_voltage = bus_voltage_map.get(bus_ref)
            if bus_voltage is not None and bus_voltage > 1.0:
                issues.append(
                    ValidationIssue(
                        code="E029",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Falownik '{gen.ref_id}' (typ {gen_type}) "
                            f"jest podłączony bezpośrednio do szyny SN "
                            f"({bus_ref}, U={bus_voltage} kV). "
                            f"Każdy falownik energoelektroniczny jest elementem nN — "
                            f"wymagany transformator nn/SN w torze przyłączenia."
                        ),
                        element_refs=[gen.ref_id, bus_ref],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Przepnij falownik na szynę nN i dodaj transformator nn/SN "
                            f"łączący ją z aktualną szyną SN ({bus_ref}). "
                            f"Lub użyj connection_variant='block_transformer' z trafem blokowym."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=gen.ref_id,
                            modal_type="GeneratorModal",
                            payload_hint={"required": "nn_bus_ref_with_transformer"},
                        ),
                    )
                )

        # E009: Brak referencji katalogowej (CATALOG-FIRST)
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable) and not branch.catalog_ref:
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_BLOCKER,
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

        # E030: Połączenie SN bez wskazanego portu endpointu
        # PR 1 rebuild SLD: każdy Cable / OverheadLine musi mieć
        # endpoint_a_port i endpoint_b_port wskazujące kompatybilny Port pola
        # na obu szynach. Konserwatywna automigracja `enm.migrations.endpoint_ports`
        # przypisuje port automatycznie tylko gdy jest dokładnie jeden kandydat;
        # pozostałe przypadki muszą zostać domknięte ręcznie w E-12 (segment SN).
        #
        # Gating: flaga `ENM_STRICT_PORT_BINDING=1` aktywuje walidację dla
        # wszystkich projektów. Domyślnie wyłączona, by stopniowo migrować
        # historyczne dane (PR 1.b włącza flagę po pełnej migracji fixture).
        if _strict_port_binding_enabled():
            self._check_endpoint_ports(enm, issues)

    def _check_endpoint_ports(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        """E030: jawny port endpointu wymagany dla Cable / OverheadLine."""
        for branch in enm.branches:
            if not isinstance(branch, OverheadLine | Cable):
                continue
            missing_endpoints: list[str] = []
            if branch.endpoint_a_port is None:
                missing_endpoints.append("a")
            if branch.endpoint_b_port is None:
                missing_endpoints.append("b")
            if not missing_endpoints:
                continue
            sides_pl = " i ".join(
                "wejściowy (A)" if e == "a" else "wyjściowy (B)" for e in missing_endpoints
            )
            issues.append(
                ValidationIssue(
                    code="E030",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"Połączenie '{branch.ref_id}' nie ma wskazanego portu "
                        f"endpointu {sides_pl}. Wskaż port pola SN na właściwej "
                        f"szynie w karcie odcinka."
                    ),
                    element_refs=[branch.ref_id],
                    wizard_step_hint="E-12",
                    suggested_fix=(
                        "Otwórz kartę odcinka SN (E-12) i przypisz port pola "
                        "liniowego/odgałęźnego po obu stronach kabla/linii."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=branch.ref_id,
                        modal_type="SegmentSnModal",
                        payload_hint={
                            "required": "endpoint_ports",
                            "missing_endpoints": missing_endpoints,
                        },
                    ),
                )
            )

    # ------------------------------------------------------------------
    # WARNINGS (W001-W004)
    # ------------------------------------------------------------------

    def _check_warnings(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        # W033 (recenzja NO-GO 2026-07-17 pkt 2): spójność Sk''/Ik''/U źródła.
        # Gdy źródło niesie JEDNOCZEŚNIE Sk'' i Ik'' oraz stoi na szynie ze
        # znanym napięciem, musi zachodzić Ik'' = Sk''/(√3·U) — rozjazd > 5%
        # oznacza, że dane pochodzą z RÓŻNYCH stron transformatora (podwójne
        # liczenie impedancji TR) albo napięcie odniesienia jest błędne.
        # IMPORTANT (nie blocker): model policzalny, ale prezentacja/dobór
        # aparatury na takich danych byłyby fałszywe.
        buses_by_ref = {bus.ref_id: bus for bus in enm.buses}
        for source in enm.sources:
            if not (source.sk3_mva and source.sk3_mva > 0 and source.ik3_ka and source.ik3_ka > 0):
                continue
            bus = buses_by_ref.get(source.bus_ref) if source.bus_ref else None
            if bus is None or not bus.voltage_kv or bus.voltage_kv <= 0:
                continue
            expected_ik_ka = source.sk3_mva / (math.sqrt(3.0) * bus.voltage_kv)
            if abs(source.ik3_ka - expected_ik_ka) / expected_ik_ka > 0.05:
                issues.append(
                    ValidationIssue(
                        code="sources.sk_ik_voltage_inconsistent",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"Źródło '{source.ref_id}': Ik''={source.ik3_ka:.2f} kA nie zgadza się "
                            f"z Sk''={source.sk3_mva:.0f} MVA przy U={bus.voltage_kv:g} kV "
                            f"(oczekiwane Ik''=Sk''/(√3·U)={expected_ik_ka:.2f} kA). "
                            f"Dane zwarciowe i napięcie odniesienia muszą dotyczyć TEJ SAMEJ szyny."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix=(
                            "Podaj Sk'' i Ik'' wyznaczone dla szyny, na której stoi źródło "
                            "(bez podwójnego liczenia impedancji transformatora)."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "short_circuit_params_consistent"},
                        ),
                    )
                )

        # W034 (recenzja NO-GO 2026-07-17 pkt 10): blokada uziemnik ↔ łącznik
        # główny. Uziemnik ZAMKNIĘTY przy JEDNOCZEŚNIE zamkniętym łączniku
        # toru głównego TEGO SAMEGO pola (CB/DS/LOAD_SWITCH) = niedozwolona
        # kombinacja stanów (uziemienie toru pod napięciem) — klasyczna
        # blokada mechaniczna/logiczna rozdzielnicy. Predykat wspólny z
        # silnikiem zgodności referencyjnej: `enm/interlock_rules.py`
        # (REFERENCE_ENGINE_SPEC_V1 §7 — jedna prawda logiki stanów).
        for bay in enm.bays:
            closed_es, closed_main = earthing_interlock_violation(bay)
            if not closed_es or not closed_main:
                continue
            issues.append(
                ValidationIssue(
                    code="bays.earthing_interlock_violation",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=(
                        f"Pole '{bay.ref_id}': uziemnik "
                        f"({', '.join(d.device_ref for d in closed_es)}) ZAMKNIĘTY przy "
                        f"jednocześnie zamkniętym łączniku toru głównego "
                        f"({', '.join(d.device_ref for d in closed_main)}) — niedozwolona "
                        f"kombinacja stanów (uziemienie toru pod napięciem, blokada "
                        f"rozdzielnicy)."
                    ),
                    element_refs=[bay.ref_id],
                    wizard_step_hint="K5",
                    suggested_fix=(
                        "Otwórz łącznik główny pola przed zamknięciem uziemnika "
                        "(albo skoryguj stany aparatów w danych pola)."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=bay.ref_id,
                        modal_type="BayModal",
                        payload_hint={"required": "earthing_interlock"},
                    ),
                )
            )

        # W035 (Reference Engine V1, spec §6, V12K-060): walidacja referencyjna
        # NA ŻYWO — profile pól IEC 62271 (required/one_of/forbidden/kolejność/
        # aparat boczny w osi) + rodziny producentów dla pól związanych przez
        # bay_template_ref. Tylko ścieżka danych (primary_devices niepuste);
        # konwencja rysunkowa jest z definicji zgodna (parytet spec §8).
        # Import LENIWY: reference_engine importuje enm.models — import
        # modułowy tutaj tworzyłby cykl przy imporcie reference_engine przed
        # pakietem enm (enm/__init__ importuje ten walidator).
        from reference_engine.validation import reference_validation_issues

        for finding in reference_validation_issues(enm):
            issues.append(
                ValidationIssue(
                    code=finding.code,
                    severity=SEVERITY_IMPORTANT,
                    message_pl=finding.message_pl,
                    element_refs=[finding.element_ref],
                    wizard_step_hint="K5",
                    suggested_fix=finding.suggested_fix,
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=finding.element_ref,
                        modal_type="BayModal",
                        payload_hint={"required": "reference_profile_compliance"},
                    ),
                )
            )

        # W001: Brak Z₀ na linii
        for branch in enm.branches:
            if isinstance(branch, OverheadLine | Cable):
                if branch.r0_ohm_per_km is None and branch.x0_ohm_per_km is None:
                    issues.append(
                        ValidationIssue(
                            code="W001",
                            severity=SEVERITY_IMPORTANT,
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
                        severity=SEVERITY_IMPORTANT,
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
                    severity=SEVERITY_IMPORTANT,
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
                        severity=SEVERITY_IMPORTANT,
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
                        severity=SEVERITY_BLOCKER,
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
                        severity=SEVERITY_INFO,
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
                        severity=SEVERITY_INFO,
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
                            severity=SEVERITY_IMPORTANT,
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
                            severity=SEVERITY_IMPORTANT,
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
                        severity=SEVERITY_IMPORTANT,
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
                        severity=SEVERITY_IMPORTANT,
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
                        severity=SEVERITY_IMPORTANT,
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
                            severity=SEVERITY_IMPORTANT,
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
                            severity=SEVERITY_IMPORTANT,
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
            meta = sub.meta if isinstance(sub.meta, dict) else {}
            field_specs = meta.get("field_specs")
            nn_field_specs = meta.get("nn_field_specs")
            has_field_specs = (
                isinstance(field_specs, list)
                and any(isinstance(spec, dict) and spec.get("field_ref") for spec in field_specs)
            ) or (
                isinstance(nn_field_specs, list)
                and any(isinstance(spec, dict) and spec.get("field_ref") for spec in nn_field_specs)
            )
            if has_field_specs:
                substations_with_bays.add(sub.ref_id)
        for sub in enm.substations:
            if sub.ref_id not in substations_with_bays:
                issues.append(
                    ValidationIssue(
                        code="I003",
                        severity=SEVERITY_INFO,
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
                        severity=SEVERITY_INFO,
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
                        severity=SEVERITY_INFO,
                        message_pl=(
                            f"Magistrala pierścieniowa '{corr.ref_id}' nie ma "
                            f"zdefiniowanego punktu normalnie otwartego (NO)."
                        ),
                        element_refs=[corr.ref_id],
                        wizard_step_hint="K4",
                    )
                )

    # ------------------------------------------------------------------
    # Pole transformatorowe SN (W041)
    # ------------------------------------------------------------------

    def _check_transformer_sn_bay(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        """W041: transformator na szynie SN stacji BEZ pola roli TR.

        Odejścia od szyn rozdzielni realizuje się POLAMI — transformator
        przyłączony wprost do szyny SN, bez pola transformatorowego, jest
        konfiguracją NIEKOMPLETNĄ (dyspozycja recenzenta-właściciela
        2026-08-12 §7). Poziom IMPORTANT, nie BLOCKER: stan jest legalnym
        stanem ROBOCZYM (projektant może świadomie zrezygnować z pola na
        etapie koncepcji), więc nie blokuje ani pracy, ani obliczeń — blokuje
        wyłącznie drogę do dokumentacji wykonawczej
        (`application/dokumentacja_wykonawcza/gotowosc.py`).

        Predykat pochodzi z JEDNEGO źródła (`enm/pole_transformatorowe.py`),
        wspólnego z markerem rysunku — parytet pilnuje wspólna tablica
        decyzyjna `backend/schemas/pole_transformatorowe_parytet_v1.json`.
        """
        for znalezisko in transformatory_bez_pola_sn(enm):
            issues.append(
                ValidationIssue(
                    code="W041",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=komunikat_braku_pola(znalezisko),
                    element_refs=[znalezisko.transformer_ref, znalezisko.station_ref],
                    wizard_step_hint="K5",
                    suggested_fix=(
                        "Dodaj do rozdzielni SN tej stacji pole transformatorowe "
                        "(rola TR) i przypisz do niego transformator."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=znalezisko.station_ref,
                        modal_type="add_sn_bay",
                        payload_hint={"bay_role": "TR"},
                    ),
                )
            )

    # ------------------------------------------------------------------
    # Shunt capacitor banks (E040-E042, W040)
    # ------------------------------------------------------------------

    def _check_shunt_capacitors(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        """Walidacja stałych baterii kondensatorów (kompensacja mocy biernej).

        E040: bus_ref nie istnieje.
        E041: rated_mvar <= 0 (brak / niepoprawna moc bierna — nie zgadujemy).
        E042: rated_kv <= 0 (brak / niepoprawne napięcie znamionowe).
        W040: rated_kv niespójne z napięciem szyny (>5% różnicy).
        """
        bus_by_ref = {b.ref_id: b for b in enm.buses}
        for cap in enm.shunt_capacitors:
            if cap.bus_ref not in bus_by_ref:
                issues.append(
                    ValidationIssue(
                        code="E040",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Bateria kondensatorów '{cap.ref_id}' referencja do "
                            f"nieistniejącej szyny '{cap.bus_ref}'."
                        ),
                        element_refs=[cap.ref_id, cap.bus_ref],
                        wizard_step_hint="K6",
                        suggested_fix="Przypisz baterię kondensatorów do istniejącej szyny.",
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=cap.ref_id,
                            modal_type="ShuntCapacitorModal",
                            payload_hint={"required": "bus_ref"},
                        ),
                    )
                )

            if cap.rated_mvar is None or cap.rated_mvar <= 0:
                issues.append(
                    ValidationIssue(
                        code="E041",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Bateria kondensatorów '{cap.ref_id}' nie ma dodatniej "
                            f"mocy znamionowej (rated_mvar <= 0)."
                        ),
                        element_refs=[cap.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Wprowadź moc bierną znamionową baterii '{cap.name}' [Mvar]."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=cap.ref_id,
                            modal_type="ShuntCapacitorModal",
                            payload_hint={"required": "rated_mvar"},
                        ),
                    )
                )

            if cap.rated_kv is None or cap.rated_kv <= 0:
                issues.append(
                    ValidationIssue(
                        code="E042",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Bateria kondensatorów '{cap.ref_id}' nie ma dodatniego "
                            f"napięcia znamionowego (rated_kv <= 0)."
                        ),
                        element_refs=[cap.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(f"Wprowadź napięcie znamionowe baterii '{cap.name}' [kV]."),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=cap.ref_id,
                            modal_type="ShuntCapacitorModal",
                            payload_hint={"required": "rated_kv"},
                        ),
                    )
                )
                continue

            bus = bus_by_ref.get(cap.bus_ref)
            if (
                bus is not None
                and bus.voltage_kv
                and bus.voltage_kv > 0
                and cap.rated_kv > 0
                and abs(cap.rated_kv - bus.voltage_kv) / bus.voltage_kv > 0.05
            ):
                issues.append(
                    ValidationIssue(
                        code="W040",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"Bateria kondensatorów '{cap.ref_id}' ma napięcie "
                            f"znamionowe {cap.rated_kv} kV niespójne z napięciem "
                            f"szyny '{cap.bus_ref}' ({bus.voltage_kv} kV)."
                        ),
                        element_refs=[cap.ref_id, cap.bus_ref],
                        wizard_step_hint="K6",
                        suggested_fix=("Dostosuj napięcie znamionowe baterii do napięcia szyny."),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=cap.ref_id,
                            modal_type="ShuntCapacitorModal",
                            payload_hint={"required": "rated_kv"},
                        ),
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
                        severity=SEVERITY_BLOCKER,
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
        has_blockers = any(is_blocking_severity(i.severity) for i in issues)

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

    # ------------------------------------------------------------------
    # V12S-007: voltage band consistency on branch endpoints
    # ------------------------------------------------------------------

    def _check_voltage_band_consistency(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        """E020: galaz laczy szyny w roznych pasmach napieciowych.

        Galaz typu OverheadLine, Cable, SwitchBranch lub FuseBranch nie moze
        przechodzic miedzy pasmami napieciowymi (nN/SN/WN). Jedynym dozwolonym
        elementem cross-band jest Transformer (V12S-007).
        """
        bus_by_ref = {b.ref_id: b for b in enm.buses}
        for branch in enm.branches:
            from_bus = bus_by_ref.get(branch.from_bus_ref)
            to_bus = bus_by_ref.get(branch.to_bus_ref)
            if from_bus is None or to_bus is None:
                continue  # missing-ref errors are reported by other checks
            if from_bus.voltage_kv <= 0 or to_bus.voltage_kv <= 0:
                continue  # zero-voltage errors reported by E004
            band_from = _voltage_band(from_bus.voltage_kv)
            band_to = _voltage_band(to_bus.voltage_kv)
            if band_from == band_to:
                continue
            issues.append(
                ValidationIssue(
                    code="E020",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"Galaz '{branch.ref_id}' laczy pasma napieciowe "
                        f"{band_from} ({from_bus.voltage_kv} kV) i "
                        f"{band_to} ({to_bus.voltage_kv} kV). Galaz nie moze "
                        f"przechodzic miedzy pasmami - jedynym dozwolonym "
                        f"przejsciem jest transformator."
                    ),
                    element_refs=[
                        branch.ref_id,
                        from_bus.ref_id,
                        to_bus.ref_id,
                    ],
                    wizard_step_hint="K4",
                    suggested_fix=(
                        "Wstaw transformator miedzy szynami w roznych pasmach "
                        "albo zmien przypisanie szyn galezi."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=branch.ref_id,
                        modal_type="BranchModal",
                        payload_hint={"required": "voltage_band_consistency"},
                    ),
                )
            )

    # ------------------------------------------------------------------
    # V12S-007: through-station MV continuity
    # ------------------------------------------------------------------

    def _check_through_station_continuity(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        """E021: ciaglosc SN przez stacje przelotowa.

        Stacja przelotowa (substation z polem IN i polem OUT) musi miec oba
        pola podpiete do tej samej szyny SN. SN nie moze 'przejsc' przez
        strone nN ani przez transformator. Ciaglosc realizowana jest WYLACZNIE
        przez wspolna magistrala SN stacji.
        """
        bus_by_ref = {b.ref_id: b for b in enm.buses}

        # Group bays by substation_ref
        bays_by_station: dict[str, list] = {}
        for bay in enm.bays:
            bays_by_station.setdefault(bay.substation_ref, []).append(bay)

        for sub in enm.substations:
            sub_bays = bays_by_station.get(sub.ref_id, [])
            in_bays = [b for b in sub_bays if b.bay_role == "IN"]
            out_bays = [b for b in sub_bays if b.bay_role == "OUT"]
            # Stacja przelotowa: ma co najmniej 1 IN i 1 OUT
            if not in_bays or not out_bays:
                continue

            # Wszystkie pola IN/OUT musza siedziec na szynie SN; w tym samym
            # pasmie napieciowym; podpiete do tej samej szyny.
            mv_buses_used: set[str] = set()
            offending_bays: list[str] = []
            for bay in [*in_bays, *out_bays]:
                bus = bus_by_ref.get(bay.bus_ref)
                if bus is None or bus.voltage_kv <= 0:
                    continue
                band = _voltage_band(bus.voltage_kv)
                if band != "SN":
                    offending_bays.append(bay.ref_id)
                    continue
                mv_buses_used.add(bay.bus_ref)

            if offending_bays:
                issues.append(
                    ValidationIssue(
                        code="E021",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Stacja przelotowa '{sub.ref_id}': pola IN/OUT "
                            f"({', '.join(sorted(offending_bays))}) nie sa "
                            f"podpiete do szyny SN. Ciaglosc SN nie moze "
                            f"przechodzic przez strone nN ani transformator."
                        ),
                        element_refs=[sub.ref_id, *offending_bays],
                        wizard_step_hint="K3",
                        suggested_fix=(
                            "Przypisz pola IN i OUT do magistrali SN stacji " "(wspolna szyna SN)."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=sub.ref_id,
                            modal_type="SubstationModal",
                            payload_hint={"required": "through_station_mv_bus"},
                        ),
                    )
                )
                continue

            if len(mv_buses_used) > 1:
                issues.append(
                    ValidationIssue(
                        code="E021",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Stacja przelotowa '{sub.ref_id}': pola IN i OUT "
                            f"podpiete do roznych szyn SN "
                            f"({', '.join(sorted(mv_buses_used))}). "
                            f"Ciaglosc SN przez stacje przelotowa wymaga "
                            f"wspolnej magistrali SN."
                        ),
                        element_refs=[sub.ref_id, *sorted(mv_buses_used)],
                        wizard_step_hint="K3",
                        suggested_fix=("Podlacz pola IN i OUT do tej samej szyny SN stacji."),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=sub.ref_id,
                            modal_type="SubstationModal",
                            payload_hint={"required": "through_station_mv_bus"},
                        ),
                    )
                )
