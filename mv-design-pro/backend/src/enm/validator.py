"""
ENMValidator — walidacja energetyczna modelu sieci (readiness gate).

To NIE jest walidacja API (HTTP 400). To walidacja PROJEKTU SIECI.
Komunikaty po polsku.
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from catalog.profiles.nc_rfg import load_nc_rfg_profile
from network_model.catalog.governance import (
    brakuje_wymaganej_referencji,
    wymagalnosc_katalogu,
)
from network_model.core.uziemienie import (
    ETYKIETA_PL_PUNKTU_NEUTRALNEGO,
    ETYKIETA_PL_UZIEMIENIA_EKRANU,
)
from network_model.pochodne import prad_z_mocy_pozornej_ka
from network_model.pochodne.pasma_napieciowe import (
    pasmo_napieciowe,
    powyzej_pasma_nn,
    w_pasmie_nn,
)
from pydantic import BaseModel

from .fix_actions import FixAction
from .grupa_polaczen import GRUPY_POLACZEN_IEC60076, grupa_polaczen_poprawna, parsuj_grupe_polaczen
from .interlock_rules import earthing_interlock_violation
from .migrations.nn_field_specs_promocja import (
    META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA,
)
from .models import (
    GEN_TYPES_PRZEKSZTALTNIKOWE,
    Cable,
    EnergyNetworkModel,
    OverheadLine,
    SwitchBranch,
)
from .pole_transformatorowe import komunikat_braku_pola, transformatory_bez_pola_sn
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
from .slownik_komunikatow import (
    NAZWY_WARIANTOW_PRZYLACZENIA_ZRODLA_PL,
    nazwa_rodzaju_generatora,
    opis_elementu,
    opis_obiektu,
    pole,
)
from .topology import derive
from .uklad_sieci_nn import transformatory_bez_ukladu_nn
from .uziemienie import blad_konfiguracji_uziemienia, uziemienie_grounded
from .zrodlo_zwarcie import PASMO_U_SET_PU, dane_zwarciowe_zrodla, u_set_pu_w_pasmie

_STRICT_PORT_BINDING_ENV = "ENM_STRICT_PORT_BINDING"


def _oznaczenia_aparatow(aparaty: Sequence[object]) -> str:
    """Aparaty pola w treści komunikatu: oznaczenie operatorskie (Q0, QE1), nie
    identyfikator aparatu; aparat bez oznaczenia opisuje jego rodzaj (karta #142)."""
    return ", ".join(
        str(getattr(aparat, "designation", None) or "aparat bez oznaczenia") for aparat in aparaty
    )


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
        # V12S-007: pasmo napieciowe + ciaglosc przez stację przelotową
        self._check_voltage_band_consistency(enm, issues)
        self._check_frequency_consistency(enm, issues)
        self._check_through_station_continuity(enm, issues)
        # KOMPLETNOSC-POLA-TR: transformator na szynie SN bez pola roli TR
        self._check_transformer_sn_bay(enm, issues)
        # P0.1 nN (karta P0.1, C §5): topologia obwodow nN — E060-E064/W060/W062
        self._check_nn_topology(enm, issues)
        # W5-A: jedna reprezentacja uziemienia — E-W5-01..03, W-W5-01
        self._check_uziemienie_w5(enm, issues)

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
                    suggested_fix="Dodaj przynajmniej jedną szynę (źródło zasilania albo stację).",
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
                        message_pl=(
                            f"{opis_obiektu(bus, 'Szyna')} nie ma napięcia znamionowego "
                            "(napięcie ≤ 0 kV)."
                        ),
                        element_refs=[bus.ref_id],
                        wizard_step_hint="K3",
                        suggested_fix=(f"Ustaw napięcie znamionowe: {opis_obiektu(bus, 'szyna')}."),
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
                                f"{opis_obiektu(branch, 'Gałąź')} ma zerową impedancję "
                                f"(R=0 i X=0 Ω/km)."
                            ),
                            element_refs=[branch.ref_id],
                            wizard_step_hint="K4",
                            suggested_fix=(
                                "Wprowadź parametry impedancji: "
                                f"{opis_obiektu(branch, 'gałąź')}."
                            ),
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
                            f"{opis_obiektu(trafo, 'Transformator')} nie ma napięcia zwarcia "
                            "(uk ≤ 0 %)."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix=(
                            f"Wprowadź napięcie zwarcia uk: {opis_obiektu(trafo, 'transformator')}."
                        ),
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
                            f"{opis_obiektu(trafo, 'Transformator')}: strona górnego i dolnego "
                            "napięcia podłączona do tej samej szyny "
                            f"({opis_elementu(enm, trafo.hv_bus_ref, 'szyna')})."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix=(
                            "Podłącz strony górnego i dolnego napięcia do różnych szyn."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "bus_assignment"},
                        ),
                    )
                )

        # sources.bus_missing: Źródło bez istniejącej szyny (odbiór CV-3.3-B).
        # Jedyny emiter kanonicznego `source.connection_missing` był w skasowanym
        # torze R2 (`analysis_run/service.py`), a assembler kanoniczny
        # (`enm/mapping.py`) POMIJAŁ takie źródło bez śladu — sieć liczyła się
        # bez zasilania, którego projektant nie widział. Most gotowości odwzorowuje
        # ten kod na kanon (`domain/readiness_bridge.py`).
        bus_refs_zrodel = {b.ref_id for b in enm.buses}
        for source in enm.sources:
            if source.bus_ref and source.bus_ref in bus_refs_zrodel:
                continue
            issues.append(
                ValidationIssue(
                    code="sources.bus_missing",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(source, 'Źródło zasilania')} nie jest podłączone "
                        "do istniejącej szyny."
                    ),
                    element_refs=[source.ref_id],
                    wizard_step_hint="K2",
                    suggested_fix="Podłącz źródło do istniejącej szyny.",
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=source.ref_id,
                        modal_type="SourceModal",
                        payload_hint={"required": "bus_assignment"},
                    ),
                )
            )

        # E008: Źródło bez parametrów zwarciowych — predykat z JEDNEGO źródła prawdy
        # (`enm/zrodlo_zwarcie.py`, ten sam, którego używa mapper; CV-4.3 K7).
        for source in enm.sources:
            if not dane_zwarciowe_zrodla(source).policzalne:
                issues.append(
                    ValidationIssue(
                        code="sources.no_short_circuit_params",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')} nie ma parametrów "
                            f"zwarciowych (brak Sk'', Ik'' lub R/X)."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix=(
                            f"Wprowadź moc zwarciową Sk'' lub impedancję R+jX: "
                            f"{opis_obiektu(source, 'źródło zasilania')}."
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
                            f"{opis_obiektu(gen, 'Źródło DER')} ({nazwa_rodzaju_generatora(gen_type)}) "
                            f"nie ma określonego pola {pole('connection_variant')}. Każdy "
                            "falownik wymaga jawnego określenia toru przyłączenia (po stronie "
                            "nN za transformatorem stacji, dedykowane pole SN z transformatorem "
                            "przyłączeniowym albo osobna stacja przyłączeniowa źródła)."
                        ),
                        element_refs=[gen.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Wybierz sposób przyłączenia: {opis_obiektu(gen, 'źródło DER')} — "
                            "nN za transformatorem stacji, dedykowany transformator blokowy "
                            "albo osobna stacja źródłowa SN."
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
            if powyzej_pasma_nn(bus_voltage):
                issues.append(
                    ValidationIssue(
                        code="E029",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(gen, 'Falownik')} ({nazwa_rodzaju_generatora(gen_type)}) "
                            f"jest podłączony bezpośrednio do szyny SN "
                            f"({opis_elementu(enm, bus_ref, 'szyna')}, U={bus_voltage:g} kV). "
                            f"Każdy falownik energoelektroniczny jest elementem nN — "
                            f"wymagany transformator nN/SN w torze przyłączenia."
                        ),
                        element_refs=[gen.ref_id, bus_ref],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Przepnij falownik na szynę nN i dodaj transformator nN/SN "
                            f"łączący ją z aktualną szyną SN "
                            f"({opis_elementu(enm, bus_ref, 'szyna')}) albo wybierz sposób "
                            "przyłączenia "
                            f"„{NAZWY_WARIANTOW_PRZYLACZENIA_ZRODLA_PL['block_transformer']}” "
                            "z transformatorem blokowym."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=gen.ref_id,
                            modal_type="GeneratorModal",
                            payload_hint={"required": "nn_bus_ref_with_transformer"},
                        ),
                    )
                )

        # generators.voltage_control_incomplete (karta CV-4.1b, A3-04): generator w
        # trybie regulacji napięcia — DOWOLNY gen_type (AVR generatora synchronicznego
        # reguluje napięcie tak samo jak falownik w tym trybie; ten tryb nie jest
        # ograniczony do DER, w przeciwieństwie do E028/E029 wyżej) — bez kompletnej
        # nastawy. Bez tej blokady tor kanoniczny (`enm/mapping.py`) budowałby węzeł
        # PV z brakującą albo niefizyczną nastawą napięcia, którą solver FROZEN
        # (węzeł PV) wymaga jako DANEJ WEJŚCIOWEJ — nigdy jako wartości domyślnej.
        for gen in enm.generators:
            meta = getattr(gen, "meta", None) or {}
            if str(meta.get("control_mode") or "").strip() != "REGULACJA_NAPIECIA":
                continue
            u_set_pu = meta.get("u_set_pu")
            u_set_valid = (
                isinstance(u_set_pu, int | float)
                and not isinstance(u_set_pu, bool)
                and 0.9 <= float(u_set_pu) <= 1.1
            )
            q_min_mvar = meta.get("q_min_mvar")
            q_max_mvar = meta.get("q_max_mvar")
            q_bounds_valid = (
                isinstance(q_min_mvar, int | float)
                and not isinstance(q_min_mvar, bool)
                and isinstance(q_max_mvar, int | float)
                and not isinstance(q_max_mvar, bool)
                and float(q_min_mvar) < float(q_max_mvar)
            )
            if u_set_valid and q_bounds_valid:
                continue
            braki: list[str] = []
            if not u_set_valid:
                braki.append(f"{pole('u_set_pu')} w paśmie [0,9; 1,1] pu")
            if not q_bounds_valid:
                braki.append(f"granice mocy biernej {pole('q_min_mvar')} < {pole('q_max_mvar')}")
            issues.append(
                ValidationIssue(
                    code="generators.voltage_control_incomplete",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(gen, 'Generator')} w trybie regulacji napięcia "
                        f"nie ma: {'; '.join(braki)}."
                    ),
                    element_refs=[gen.ref_id],
                    wizard_step_hint="K6",
                    suggested_fix=(
                        f"Uzupełnij {pole('u_set_pu')} i granice mocy biernej "
                        f"({pole('q_min_mvar')}, {pole('q_max_mvar')}): "
                        f"{opis_obiektu(gen, 'generator')}."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=gen.ref_id,
                        modal_type="GeneratorModal",
                        payload_hint={"required": "voltage_setpoint"},
                    ),
                )
            )

        # sources.u_set_pu_out_of_range: napięcie zadane szyny bilansującej poza pasmem
        # `PASMO_U_SET_PU` (ten sam predykat co operacja domenowa — predykaty parami);
        # model spoza operacji (import XLSX/CGMES/ZIP) nie może wnieść do solvera
        # nastawy 0 p.u. albo 10 p.u. jako „napięcia zadanego".
        for source in enm.sources:
            if source.u_set_pu is None or u_set_pu_w_pasmie(source.u_set_pu):
                continue
            issues.append(
                ValidationIssue(
                    code="sources.u_set_pu_out_of_range",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(source, 'Źródło zasilania')}: napięcie zadane szyny "
                        f"bilansującej {source.u_set_pu:g} p.u. leży poza pasmem "
                        f"{PASMO_U_SET_PU[0]:g}–{PASMO_U_SET_PU[1]:g} p.u."
                    ),
                    element_refs=[source.ref_id],
                    wizard_step_hint="K2",
                    suggested_fix=(
                        "Podaj napięcie zadane w p.u. napięcia znamionowego szyny "
                        "(np. 1,0 = znamionowe) albo usuń nastawę."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=source.ref_id,
                        modal_type="SourceModal",
                        payload_hint={"required": "u_set_pu_in_band"},
                    ),
                )
            )

        # sources.sk_min_exceeds_max (CV-4.3 K7): dane scenariusza MIN sprzeczne z MAX.
        # Z definicji S''_kQmin ≤ S''_kQmax i I''_kQmin ≤ I''_kQmax (IEC 60909-0:2016 §6.2.1:
        # minimum to najsłabszy stan zasilania); odwrotność oznacza zamienione pola albo
        # dane z różnych szyn — BLOCKER, bo bieg MIN dałby prąd WIĘKSZY niż MAX.
        for source in enm.sources:
            sprzeczne: list[str] = []
            if (
                source.sk3_min_mva is not None
                and source.sk3_mva is not None
                and source.sk3_mva > 0
                and source.sk3_min_mva > source.sk3_mva
            ):
                sprzeczne.append(
                    f"Sk''min={source.sk3_min_mva:g} MVA > Sk''max={source.sk3_mva:g} MVA"
                )
            if (
                source.ik3_min_ka is not None
                and source.ik3_ka is not None
                and source.ik3_ka > 0
                and source.ik3_min_ka > source.ik3_ka
            ):
                sprzeczne.append(f"Ik''min={source.ik3_min_ka:g} kA > Ik''max={source.ik3_ka:g} kA")
            if sprzeczne:
                issues.append(
                    ValidationIssue(
                        code="sources.sk_min_exceeds_max",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')}: dane scenariusza "
                            f"minimalnego przekraczają maksymalne ({'; '.join(sprzeczne)}) — "
                            "bieg MIN dałby prąd większy niż MAX."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix=(
                            "Podaj Sk''min ≤ Sk''max (albo Ik''min ≤ Ik''max) z warunków "
                            "przyłączenia OSD dla tej samej szyny."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "sk_min_le_sk_max"},
                        ),
                    )
                )

        # generators.voltage_control_profile_missing / generators.voltage_control_not_permitted
        # (domknięcie CV-4.1b przy odbiorze, 2026-09-05): kreator OZE bramkuje tryb
        # REGULACJA_NAPIECIA profilem NC RfG operatora (`reactive_power.
        # voltage_control_modes` zawiera `voltage_control`). Bramka WYŁĄCZNIE w UI
        # byłaby fantomem: model przyjmowałby stan, którego UI nie pokazuje (reguła
        # zero fabrykacji — każda kontrolka UI ma odpowiednik w backendzie). Tryb i
        # profil trafiają do modelu DWIEMA operacjami (`add_converter_source` →
        # `update_der_bindings`), więc jedynym miejscem, które widzi oba naraz, jest
        # walidator modelu — nie operacja zapisu. Profil czytany z tego samego
        # magazynu, do którego pisze `update_der_bindings` (`materialized_params.
        # profiles.nc_rfg_profile_ref` — nie `meta`). Pomiar katalogu 2026-09-05:
        # wszystkie 5 profili operatorów (enea/energa/pge/pse/tauron) dopuszcza
        # `voltage_control`, więc dziś blokuje wyłącznie brak/nieznany profil — reguła
        # jest funkcją danych katalogu, nie zaszytej listy.
        for gen in enm.generators:
            meta = getattr(gen, "meta", None) or {}
            if str(meta.get("control_mode") or "").strip() != "REGULACJA_NAPIECIA":
                continue
            # CV-4.3 K1 (2026-09-06): bramka NC RfG operatora dotyczy TECHNOLOGII
            # DER podłączonej przez przekształtnik (kreator OZE, `add_converter_source`
            # — pv_inverter/wind_inverter/fw_*/bess), nie generatora SYNCHRONICZNEGO
            # (`add_generator_sn` — blok wytwórczy przyłączony wprost, np. IEEE/CIGRE
            # generator w sieci referencyjnej). Warunek sprawdzał WYŁĄCZNIE tryb
            # regulacji, ignorując `gen_type` — luka nigdy nie ujawniona, bo PRZED tą
            # kartą żadna operacja nie tworzyła generatora `synchronous` w trybie
            # REGULACJA_NAPIECIA (`add_genset_nn` nie ma trybu regulacji wcale).
            # Katalog profili operatorów (enea/energa/pge/pse/tauron) jest z natury
            # regulacją PRZYŁĄCZENIA DER, nie generacji klasycznej w sieci akademickiej
            # (IEEE/CIGRE) — wymaganie go tam byłoby fabrykacją zgodności bez treści.
            if gen.gen_type == "synchronous":
                continue
            materialized = getattr(gen, "materialized_params", None) or {}
            profile = materialized.get("profiles") if isinstance(materialized, dict) else None
            profile_ref_raw = (
                profile.get("nc_rfg_profile_ref") if isinstance(profile, dict) else None
            )
            profile_ref = str(profile_ref_raw or "").strip()
            fix_action = FixAction(
                action_type="OPEN_MODAL",
                element_ref=gen.ref_id,
                modal_type="GeneratorModal",
                payload_hint={"required": "nc_rfg_profile_ref"},
            )
            if not profile_ref:
                issues.append(
                    ValidationIssue(
                        code="generators.voltage_control_profile_missing",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(gen, 'Generator')} w trybie regulacji napięcia "
                            "nie ma profilu NC RfG operatora — tryb wymaga profilu "
                            "dopuszczającego regulację napięcia."
                        ),
                        element_refs=[gen.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Wybierz profil NC RfG operatora w polu {pole('nc_rfg_profile_ref')}: "
                            f"{opis_obiektu(gen, 'generator')} (krok „zgodność” kreatora OZE)."
                        ),
                        fix_action=fix_action,
                    )
                )
                continue
            try:
                nc_rfg_profile = load_nc_rfg_profile(profile_ref)
            except FileNotFoundError:
                issues.append(
                    ValidationIssue(
                        code="generators.voltage_control_profile_missing",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(gen, 'Generator')} w trybie regulacji napięcia "
                            "wskazuje profil NC RfG operatora, którego nie ma w katalogu "
                            "operatorów."
                        ),
                        element_refs=[gen.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            "Wybierz istniejący profil NC RfG operatora: "
                            f"{opis_obiektu(gen, 'generator')}."
                        ),
                        fix_action=fix_action,
                    )
                )
                continue
            if "voltage_control" not in nc_rfg_profile.reactive_power.voltage_control_modes:
                issues.append(
                    ValidationIssue(
                        code="generators.voltage_control_not_permitted",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            "Profil NC RfG operatora "
                            f"„{nc_rfg_profile.operator_name_pl}” nie dopuszcza trybu "
                            "„Regulacja napięcia (U = const)” dla: "
                            f"{opis_obiektu(gen, 'generator')}."
                        ),
                        element_refs=[gen.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            f"Zmień {pole('control_mode')} albo wybierz profil operatora "
                            "dopuszczający regulację napięcia: "
                            f"{opis_obiektu(gen, 'generator')}."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=gen.ref_id,
                            modal_type="GeneratorModal",
                            payload_hint={"required": "control_mode"},
                        ),
                    )
                )

        # E009: Brak referencji katalogowej (CATALOG-FIRST) — predykat „czy ten
        # rodzaj wymaga katalogu" czytany z JEDYNEGO źródła prawdy
        # (`catalog.governance.wymagalnosc_katalogu`, karta W3-I) zamiast
        # trzech niezależnych, dosłownie powielonych warunków. Poziomy
        # (BLOCKER dla linii/kabli/transformatorów/źródeł, wyjątek
        # `MANUAL_EQUIVALENT` dla źródeł) są DOKŁADNIE te same, jakie ta
        # reguła sprawdzała przed kartą — konwergencja miejsca, nie polityki.
        for branch in enm.branches:
            if not isinstance(branch, OverheadLine | Cable):
                continue
            if brakuje_wymaganej_referencji(
                wymagalnosc_katalogu(branch.type).walidacja, branch.catalog_ref
            ):
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(branch, 'Gałąź')} nie ma przypisanej pozycji "
                            "katalogowej."
                        ),
                        element_refs=[branch.ref_id],
                        wizard_step_hint="K4",
                        suggested_fix="Przypisz typ z katalogu do tej gałęzi.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=branch.ref_id,
                            modal_type="BranchModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

        for trafo in enm.transformers:
            if brakuje_wymaganej_referencji(
                wymagalnosc_katalogu("transformer").walidacja, trafo.catalog_ref
            ):
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(trafo, 'Transformator')} nie ma przypisanej pozycji "
                            "katalogowej."
                        ),
                        element_refs=[trafo.ref_id],
                        wizard_step_hint="K5",
                        suggested_fix="Przypisz typ transformatora z katalogu.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=trafo.ref_id,
                            modal_type="TransformerModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

        for source in enm.sources:
            # CV-4.3 K1 (2026-09-06): `parameter_source="MANUAL_EQUIVALENT"` jest
            # TRZECIM, jawnie zamodelowanym stanem pola (patrz `Source.parameter_source`
            # w `enm/models.py` — Literal["CATALOG","OVERRIDE","MANUAL_EQUIVALENT"]),
            # ustawianym przez `add_grid_source_sn` dla źródła z jawnym Sk''/RX bez
            # pozycji katalogowej — udokumentowana, zamierzona ścieżka (K1.2 tej karty:
            # "source manual_equivalent with explicit Sk/RX"), nie luka do wypełnienia.
            # Wyjątek żyje TERAZ w `wymagalnosc_katalogu` (karta W3-I) — ta sama
            # tabela, którą czyta bramka ZIP i CGMES, więc nie może się już od nich
            # rozjechać (CGMES tego wyjątku nie znał przed kartą — naprawione tam).
            poziom = wymagalnosc_katalogu(
                "source", parameter_source=source.parameter_source
            ).walidacja
            if brakuje_wymaganej_referencji(poziom, source.catalog_ref):
                issues.append(
                    ValidationIssue(
                        code="E009",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')} nie ma przypisanej "
                            "pozycji katalogowej."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix="Wybierz typ źródła systemowego z katalogu.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )

        # W010: Generator przekształtnikowy bez ŻADNEJ referencji katalogowej —
        # karta W3-I (§0.15 karty konwergencji fizyki), NOWY kod. Przed tą kartą
        # E009 milczał dla generatorów (nie iterował `enm.generators` wcale),
        # mimo że tworzenie generatora przekształtnikowego bez katalogu odmawia
        # (422 `catalog.ref_required`) i gotowość zwarciowa go blokuje
        # (`inverter.k_sc_missing`, `application/calculation_readiness/
        # service.py:264-275`) — trzy poziomy w trzech miejscach bez wspólnego
        # źródła. IMPORTANT (nie BLOCKER): brak KATALOGU nie blokuje modelu jako
        # całości (rozpływ i inne analizy nadal policzalne) — blokuje WYŁĄCZNIE
        # gotowość obliczeniową zwarcia DLA TEGO generatora (osobny, niezmieniony
        # kod `inverter.k_sc_missing`, BLOCKER na tamtej osi). Bez katalogu brakuje
        # CAŁEJ tabliczki znamionowej źródła zwarciowego (nie tylko k_sc) — to NIE
        # jest przypadek „katalog jest, ale bez k_sc" (`inverter.k_sc_assumed`,
        # WARNING, 1,1 przyjęte); ten komunikat nie obiecuje założenia, bo go nie
        # będzie — kanon tej samej sytuacji: `domain/readiness_bridge.py::
        # ODWZOROWANIE_WALIDATOR_NA_KANON["W010"]`.
        for generator in enm.generators:
            poziom = wymagalnosc_katalogu("generator", gen_type=generator.gen_type).walidacja
            if brakuje_wymaganej_referencji(poziom, generator.catalog_ref):
                issues.append(
                    ValidationIssue(
                        code="W010",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"{opis_obiektu(generator, 'Generator przekształtnikowy')} nie ma "
                            "przypisanej pozycji katalogowej. Model pozostaje ogólnie "
                            "użyteczny, ale obliczenia zwarciowe dla tego generatora są "
                            "zablokowane w gotowości obliczeniowej do czasu przypisania typu "
                            "z katalogu."
                        ),
                        element_refs=[generator.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            "Przypisz typ przekształtnika z katalogu, żeby zwarcie liczyło się "
                            "z udziałem zwarciowym k_sc z karty katalogowej."
                        ),
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=generator.ref_id,
                            modal_type="GeneratorModal",
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
                        f"{opis_obiektu(branch, 'Połączenie')} nie ma wskazanego portu "
                        f"końca {sides_pl}. Wskaż port pola SN na właściwej "
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
            expected_ik_ka = prad_z_mocy_pozornej_ka(source.sk3_mva, bus.voltage_kv)
            if abs(source.ik3_ka - expected_ik_ka) / expected_ik_ka > 0.05:
                issues.append(
                    ValidationIssue(
                        code="sources.sk_ik_voltage_inconsistent",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')}: "
                            f"Ik''={source.ik3_ka:.2f} kA nie zgadza się "
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
                        f"{opis_obiektu(bay, 'Pole')}: uziemnik "
                        f"({_oznaczenia_aparatow(closed_es)}) ZAMKNIĘTY przy "
                        f"jednocześnie zamkniętym łączniku toru głównego "
                        f"({_oznaczenia_aparatow(closed_main)}) — niedozwolona "
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

        # W033 dla scenariusza MIN (CV-4.3 K7): ta sama reguła 5 % dla pary Sk''min/Ik''min.
        for source in enm.sources:
            if not (
                source.sk3_min_mva
                and source.sk3_min_mva > 0
                and source.ik3_min_ka
                and source.ik3_min_ka > 0
            ):
                continue
            bus = buses_by_ref.get(source.bus_ref) if source.bus_ref else None
            if bus is None or not bus.voltage_kv or bus.voltage_kv <= 0:
                continue
            expected_ik_min_ka = prad_z_mocy_pozornej_ka(source.sk3_min_mva, bus.voltage_kv)
            if abs(source.ik3_min_ka - expected_ik_min_ka) / expected_ik_min_ka > 0.05:
                issues.append(
                    ValidationIssue(
                        code="sources.sk_min_ik_min_voltage_inconsistent",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')}: "
                            f"Ik''min={source.ik3_min_ka:.2f} kA nie "
                            f"zgadza się z Sk''min={source.sk3_min_mva:.0f} MVA przy "
                            f"U={bus.voltage_kv:g} kV (oczekiwane "
                            f"Ik''min=Sk''min/(√3·U)={expected_ik_min_ka:.2f} kA). "
                            f"Dane scenariusza minimalnego muszą dotyczyć TEJ SAMEJ szyny."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K2",
                        suggested_fix=(
                            "Podaj Sk''min i Ik''min wyznaczone dla szyny, na której stoi źródło."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=source.ref_id,
                            modal_type="SourceModal",
                            payload_hint={"required": "short_circuit_min_params_consistent"},
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
                                f"{opis_obiektu(branch, 'Gałąź')} nie ma składowej zerowej "
                                f"(Z₀) — zwarcia 1F/2F-Z niedostępne."
                            ),
                            element_refs=[branch.ref_id],
                            wizard_step_hint="K7",
                            suggested_fix="Wprowadź parametry składowej zerowej R₀/X₀ gałęzi.",
                            fix_action=FixAction(
                                action_type="OPEN_MODAL",
                                element_ref=branch.ref_id,
                                modal_type="BranchModal",
                                payload_hint={"required": "zero_sequence"},
                            ),
                        )
                    )

        # W002: Brak Z₀ źródła — predykat `dane_zerowe` z `enm/zrodlo_zwarcie.py` (K7).
        for source in enm.sources:
            if not dane_zwarciowe_zrodla(source).z0:
                issues.append(
                    ValidationIssue(
                        code="W002",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')} nie ma składowej "
                            f"zerowej (Z₀) — zwarcia 1F/2F-Z niedostępne."
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
                    suggested_fix="Dodaj odbiory lub generatory.",
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
                            f"{opis_obiektu(trafo, 'Transformator')} nie ma grupy połączeń."
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
                            f"{opis_obiektu(elem, 'Element')} ma nadpisane parametry, ale nie "
                            "jest oznaczony jako element z parametrami nadpisanymi względem "
                            "katalogu."
                        ),
                        element_refs=[elem.ref_id],
                        wizard_step_hint="K4",
                        suggested_fix=(
                            "Oznacz źródło parametrów elementu jako nadpisanie katalogu albo "
                            "usuń nadpisane parametry."
                        ),
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
                            f"{opis_obiektu(branch, 'Łącznik')} jest otwarty — odcina część "
                            "sieci."
                        ),
                        element_refs=[branch.ref_id],
                        wizard_step_hint="K3",
                    )
                )

        # I002: Gałąź bez katalogu — sama para (rodzaj, brak catalog_ref) co
        # E009 wyżej (osobny kod INFO, informacyjny odpowiednik BLOCKER-a),
        # czytana z tej samej tabeli (`catalog.governance`, karta W3-I).
        for branch in enm.branches:
            if not isinstance(branch, OverheadLine | Cable):
                continue
            if brakuje_wymaganej_referencji(
                wymagalnosc_katalogu(branch.type).walidacja, branch.catalog_ref
            ):
                issues.append(
                    ValidationIssue(
                        code="I002",
                        severity=SEVERITY_INFO,
                        message_pl=(
                            f"{opis_obiektu(branch, 'Gałąź')} bez katalogu — "
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
                                f"{opis_obiektu(sub, 'Stacja')} odwołuje się do szyny, której "
                                "nie ma w modelu sieci."
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
                                f"{opis_obiektu(sub, 'Stacja')} odwołuje się do transformatora, "
                                "którego nie ma w modelu sieci."
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
                            f"{opis_obiektu(bay, 'Pole')} odwołuje się do stacji, której nie ma "
                            "w modelu sieci."
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
                            f"{opis_obiektu(bay, 'Pole')} odwołuje się do szyny, której nie ma "
                            "w modelu sieci."
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
                            f"{opis_obiektu(junc, 'Węzeł T')} ma "
                            f"{len(junc.connected_branch_refs)} gałęzi — wymagane minimum 3."
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
                                f"{opis_obiektu(junc, 'Węzeł T')} odwołuje się do gałęzi, której "
                                "nie ma w modelu sieci."
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
                                f"{opis_obiektu(corr, 'Magistrala')} odwołuje się do odcinka, "
                                "którego nie ma w modelu sieci."
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
                            f"{opis_obiektu(sub, 'Stacja')} nie ma przypisanych pól "
                            "rozdzielczych."
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
                        message_pl=f"{opis_obiektu(corr, 'Magistrala')} nie ma odcinków.",
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
                            f"{opis_obiektu(corr, 'Magistrala pierścieniowa')} nie ma "
                            f"zdefiniowanego punktu normalnie otwartego (NOP)."
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
                        "i przypisz do niego transformator."
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
                            f"{opis_obiektu(cap, 'Bateria kondensatorów')} odwołuje się do "
                            "szyny, której nie ma w modelu sieci."
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
                            f"{opis_obiektu(cap, 'Bateria kondensatorów')} nie ma dodatniej "
                            "mocy znamionowej (moc ≤ 0 Mvar)."
                        ),
                        element_refs=[cap.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            "Wprowadź moc bierną znamionową [Mvar]: "
                            f"{opis_obiektu(cap, 'bateria kondensatorów')}."
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
                            f"{opis_obiektu(cap, 'Bateria kondensatorów')} nie ma dodatniego "
                            "napięcia znamionowego (napięcie ≤ 0 kV)."
                        ),
                        element_refs=[cap.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix=(
                            "Wprowadź napięcie znamionowe [kV]: "
                            f"{opis_obiektu(cap, 'bateria kondensatorów')}."
                        ),
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
                            f"{opis_obiektu(cap, 'Bateria kondensatorów')} ma napięcie "
                            f"znamionowe {cap.rated_kv:g} kV niespójne z napięciem "
                            f"szyny ({opis_obiektu(bus, 'szyna')}, {bus.voltage_kv:g} kV)."
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
        # Jedyny serwis topologii (CV-4.3): wyspy z ``enm.topology.derive`` — ta sama
        # definicja krawędzi (gałąź ``closed`` + transformator) co w mapowaniu ENM → IR.
        widok = derive(enm)
        if len(widok.wyspy) <= 1:
            return

        # Szyny nazywa ich nazwa z modelu (karta #142) — indeks raz na przebieg, nie
        # przeszukanie całego modelu dla każdej szyny każdej wyspy.
        szyny_wg_ref = {b.ref_id: b for b in enm.buses}
        for wyspa in widok.wyspy:
            if not wyspa.zasilona:
                island_refs = list(wyspa.szyny)
                issues.append(
                    ValidationIssue(
                        code="E003",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"Wyspa sieci odcięta od źródła zasilania: "
                            f"{', '.join(opis_obiektu(szyny_wg_ref.get(ref), 'szyna') for ref in island_refs[:5])}"
                            f"{f' i {len(island_refs) - 5} więcej' if len(island_refs) > 5 else ''}."
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

    def _check_frequency_consistency(
        self, enm: EnergyNetworkModel, issues: list[ValidationIssue]
    ) -> None:
        """W009: szyna deklaruje inna czestotliwosc niz czestotliwosc studium.

        DLACZEGO TA KONTROLA ISTNIEJE (karta DIAGNOZA-PRZEBIEGU). Model niesie
        czestotliwosc na DWOCH poziomach: `header.defaults.frequency_hz` (jedna
        czestotliwosc studium, `models.py:121`) oraz opcjonalnie na szynie
        (`Bus.frequency_hz`, `models.py:181`). Solwery rozplywu i zwarciowe
        czytaja wylacznie poziom studium (`enm/assembler.py::czestotliwosc_studium_hz`),
        ale kontrakt V12.6 bierze czestotliwosc bazowa Z PIERWSZEJ SZYNY
        (`solver_input/v126_contracts.py:555`: `enm.buses[0].frequency_hz or 50.0`).
        Model z szyna 60 Hz w studium 50 Hz jest wiec wewnetrznie sprzeczny, a
        analiza harmoniczna zostaje sparametryzowana wartoscia z DOWOLNIE
        wybranej szyny — po cichu, bez ostrzezenia.

        Waga IMPORTANT, nie BLOCKER: rozplyw i zwarcia licza sie poprawnie
        (biora czestotliwosc studium), wiec blokowanie ich byloby nieuczciwe.
        Sprzeczna deklaracja musi jednak byc widoczna, bo falszuje V12.6.

        Ta kontrola zastapila zaslepke `rule_e_d08_frequency_conflict`
        (`diagnostics/rules.py`), ktora deklarowala kod E-D08, ale zwracala
        pusta liste ZAWSZE — dzialala na `NetworkGraph`, ktory czestotliwosci
        w ogole nie przenosi. Jeden warunek ma miec jeden kod, wiec zaslepka
        zostala usunieta, a warunek zyje TU, gdzie sa dane.
        """
        czestotliwosc_studium = enm.header.defaults.frequency_hz
        for bus in enm.buses:
            if bus.frequency_hz is None:
                continue
            if bus.frequency_hz == czestotliwosc_studium:
                continue
            issues.append(
                ValidationIssue(
                    code="W009",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=(
                        f"{opis_obiektu(bus, 'Szyna')} deklaruje częstotliwość "
                        f"{bus.frequency_hz:g} Hz, a studium liczone jest dla "
                        f"{czestotliwosc_studium:g} Hz — model jest wewnętrznie sprzeczny."
                    ),
                    element_refs=[bus.ref_id],
                    wizard_step_hint="K3",
                    suggested_fix=(
                        "Wyrównaj częstotliwość szyny z częstotliwością studium "
                        "albo usuń deklarację z szyny."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=bus.ref_id,
                        modal_type="NodeModal",
                        payload_hint={"required": "frequency_hz"},
                    ),
                )
            )

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
            band_from = pasmo_napieciowe(from_bus.voltage_kv)
            band_to = pasmo_napieciowe(to_bus.voltage_kv)
            if band_from == band_to:
                continue
            issues.append(
                ValidationIssue(
                    code="E020",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(branch, 'Gałąź')} łączy pasma napięciowe "
                        f"{band_from} ({from_bus.voltage_kv:g} kV) i "
                        f"{band_to} ({to_bus.voltage_kv:g} kV). Gałąź nie może "
                        f"przechodzić między pasmami — jedynym dozwolonym "
                        f"przejściem jest transformator."
                    ),
                    element_refs=[
                        branch.ref_id,
                        from_bus.ref_id,
                        to_bus.ref_id,
                    ],
                    wizard_step_hint="K4",
                    suggested_fix=(
                        "Wstaw transformator między szynami w różnych pasmach "
                        "albo zmień przypisanie szyn gałęzi."
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
        """E021: ciaglosc SN przez stację przelotową.

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
                band = pasmo_napieciowe(bus.voltage_kv)
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
                            f"{opis_obiektu(sub, 'Stacja przelotowa')}: pola liniowe wejściowe "
                            "i wyjściowe ("
                            f"{', '.join(sorted(opis_elementu(enm, ref, 'pole') for ref in offending_bays))}"
                            ") nie są podpięte do szyny SN. Ciągłość SN nie może "
                            "przechodzić przez stronę nN ani transformator."
                        ),
                        element_refs=[sub.ref_id, *offending_bays],
                        wizard_step_hint="K3",
                        suggested_fix=(
                            "Przypisz pola liniowe wejściowe i wyjściowe do magistrali SN stacji "
                            "(wspólna szyna SN)."
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
                            f"{opis_obiektu(sub, 'Stacja przelotowa')}: pola liniowe wejściowe "
                            "i wyjściowe podpięte do różnych szyn SN ("
                            f"{', '.join(sorted(opis_elementu(enm, ref, 'szyna') for ref in mv_buses_used))}"
                            "). Ciągłość SN przez stację przelotową wymaga wspólnej magistrali SN."
                        ),
                        element_refs=[sub.ref_id, *sorted(mv_buses_used)],
                        wizard_step_hint="K3",
                        suggested_fix=(
                            "Podłącz pola liniowe wejściowe i wyjściowe do tej samej szyny SN "
                            "stacji."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=sub.ref_id,
                            modal_type="SubstationModal",
                            payload_hint={"required": "through_station_mv_bus"},
                        ),
                    )
                )

    # ------------------------------------------------------------------
    # P0.1 nN: topologia obwodow nN (E060-E064, W060, W062)
    # ------------------------------------------------------------------

    def _check_uziemienie_w5(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        """W5-A: spojnosc jednej reprezentacji uziemienia punktu neutralnego.

        E-W5-01 - konfiguracja punktu neutralnego niespojna z fizyka, ktora ja
               czyta (JEDEN predykat `enm/uziemienie.py`, ten sam co operacje
               domenowe i model skladowej zerowej): rezystor bez R_N, dlawik bez
               X_N (zrodlo, hv_neutral, lv_neutral); zrodlo SN opisane jako
               `isolated` z podanym SKONCZONYM Z0 (r0/x0 albo z0/z1) — opis i
               liczby mowia co innego; zrodlo SN opisane jako uziemione bez
               zadnych liczb Z0 — solver 1F pominalby bocznik zerowy, czyli
               liczyl siec izolowana wbrew opisowi.
        E-W5-02 - grupa polaczen transformatora spoza slownika IEC 60076-1
               (`enm/grupa_polaczen.py`; ten sam slownik czyta OpenAPI i front).
        E-W5-03 - uziemienie (typ uziemiony) na uzwojeniu, ktorego litera grupy nie
               wyprowadza punktu neutralnego (bez N/n, np. `D`, `Y`, `Z`) — brak
               fizycznego zacisku do uziemienia; decyzja F-4: litera rozstrzyga.
        W-W5-01 - kabel z zadeklarowanym ukladem uziemienia ekranu innym niz uklad
               odniesienia katalogowych r0/x0 (`materialized_params.z0_reference_bonding`)
               albo katalog bez ukladu odniesienia — skladowa zerowa kabla NIE jest
               przeliczana (brak geometrii ulozenia), rozjazd jest nazwany.
        """
        bus_by_ref = {b.ref_id: b for b in enm.buses}

        def _fix(ref: str, modal: str, pole: str) -> FixAction:
            return FixAction(
                action_type="OPEN_MODAL",
                element_ref=ref,
                modal_type=modal,
                payload_hint={"required": pole},
            )

        # --- zrodla: Source.neutral_grounding vs r0/x0 | z0_z1 ---------------
        for source in enm.sources:
            cfg = source.neutral_grounding
            if cfg is None:
                continue
            blad = blad_konfiguracji_uziemienia(cfg.type, cfg.r_ohm, cfg.x_ohm)
            if blad is not None:
                issues.append(
                    ValidationIssue(
                        code="E-W5-01",
                        severity=SEVERITY_BLOCKER,
                        message_pl=f"{opis_obiektu(source, 'Źródło zasilania')}: {blad}.",
                        element_refs=[source.ref_id],
                        wizard_step_hint="K1",
                        suggested_fix="Uzupełnij impedancję punktu neutralnego źródła.",
                        fix_action=_fix(source.ref_id, "SourceModal", "neutral_grounding"),
                    )
                )
                continue
            bus = bus_by_ref.get(source.bus_ref)
            po_stronie_sn = (
                source.source_side != "HV_110"
                and bus is not None
                and pasmo_napieciowe(bus.voltage_kv) == "SN"
            )
            if not po_stronie_sn:
                continue
            ma_z0 = (
                source.r0_ohm is not None
                or source.x0_ohm is not None
                or source.z0_z1_ratio is not None
            )
            if cfg.type == "isolated" and ma_z0:
                issues.append(
                    ValidationIssue(
                        code="E-W5-01",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')}: punkt neutralny "
                            "opisany jako izolowany, a podano skończoną impedancję zerową "
                            "(R0/X0 albo Z0/Z1) — opis i liczby są sprzeczne (sieć izolowana "
                            "nie ma bocznika zerowego)."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K1",
                        suggested_fix=(
                            "Usuń R0/X0 (Z0/Z1) źródła albo zmień typ punktu neutralnego."
                        ),
                        fix_action=_fix(source.ref_id, "SourceModal", "neutral_grounding"),
                    )
                )
            elif uziemienie_grounded(cfg.type) and not ma_z0:
                issues.append(
                    ValidationIssue(
                        code="E-W5-01",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(source, 'Źródło zasilania')}: punkt neutralny "
                            "opisany jako uziemiony "
                            f"({ETYKIETA_PL_PUNKTU_NEUTRALNEGO.get(cfg.type, 'uziemiony')}), "
                            "a źródło nie ma impedancji zerowej (R0/X0 albo Z0/Z1) — zwarcie 1F "
                            "liczyłoby sieć bez bocznika zerowego źródła, wbrew opisowi."
                        ),
                        element_refs=[source.ref_id],
                        wizard_step_hint="K1",
                        suggested_fix=(
                            "Podaj R0/X0 (Z0/Z1) źródła albo zbuduj GPZ kreatorem z "
                            "transformatorem WN/SN — Z0 zostanie wyprowadzone z opisu punktu "
                            "neutralnego."
                        ),
                        fix_action=_fix(source.ref_id, "SourceModal", "zero_sequence"),
                    )
                )

        # --- transformatory: grupa polaczen, punkty neutralne -----------------
        for trafo in enm.transformers:
            grupa = None
            if trafo.vector_group is not None:
                if not grupa_polaczen_poprawna(trafo.vector_group):
                    issues.append(
                        ValidationIssue(
                            code="E-W5-02",
                            severity=SEVERITY_BLOCKER,
                            message_pl=(
                                f"{opis_obiektu(trafo, 'Transformator')}: grupa połączeń "
                                f"„{trafo.vector_group}” spoza słownika IEC 60076-1 "
                                f"({len(GRUPY_POLACZEN_IEC60076)} grup)."
                            ),
                            element_refs=[trafo.ref_id],
                            wizard_step_hint="K6",
                            suggested_fix="Wybierz grupę połączeń ze słownika IEC 60076-1.",
                            fix_action=_fix(trafo.ref_id, "TransformerModal", "vector_group"),
                        )
                    )
                else:
                    grupa = parsuj_grupe_polaczen(trafo.vector_group)
            for strona, cfg, klucz_uzwojenia in (
                ("górnego (SN/WN)", trafo.hv_neutral, "hv_neutral"),
                ("dolnego (nN/SN)", trafo.lv_neutral, "lv_neutral"),
            ):
                if cfg is None:
                    continue
                blad = blad_konfiguracji_uziemienia(cfg.type, cfg.r_ohm, cfg.x_ohm)
                if blad is not None:
                    issues.append(
                        ValidationIssue(
                            code="E-W5-01",
                            severity=SEVERITY_BLOCKER,
                            message_pl=(
                                f"{opis_obiektu(trafo, 'Transformator')}, punkt neutralny "
                                f"uzwojenia {strona}: {blad}."
                            ),
                            element_refs=[trafo.ref_id],
                            wizard_step_hint="K6",
                            suggested_fix="Uzupełnij impedancję punktu neutralnego.",
                            fix_action=_fix(trafo.ref_id, "TransformerModal", klucz_uzwojenia),
                        )
                    )
                    continue
                if grupa is None or not uziemienie_grounded(cfg.type):
                    continue
                punkt_dostepny = (
                    grupa.gn_punkt_neutralny
                    if klucz_uzwojenia == "hv_neutral"
                    else grupa.dn_punkt_neutralny
                )
                litera = grupa.gn_typ if klucz_uzwojenia == "hv_neutral" else grupa.dn_typ
                if not punkt_dostepny:
                    issues.append(
                        ValidationIssue(
                            code="E-W5-03",
                            severity=SEVERITY_BLOCKER,
                            message_pl=(
                                f"{opis_obiektu(trafo, 'Transformator')}: uziemienie "
                                f"({ETYKIETA_PL_PUNKTU_NEUTRALNEGO.get(cfg.type, 'uziemiony')}) "
                                f"uzwojenia {strona}, którego litera grupy „{litera}” "
                                f"({trafo.vector_group}) nie wyprowadza punktu neutralnego — "
                                "brak zacisku N do uziemienia."
                            ),
                            element_refs=[trafo.ref_id],
                            wizard_step_hint="K6",
                            suggested_fix=(
                                "Wybierz grupę z wyprowadzonym punktem neutralnym (YN/yn/ZN/zn) "
                                "albo usuń konfigurację uziemienia tej strony."
                            ),
                            fix_action=_fix(trafo.ref_id, "TransformerModal", klucz_uzwojenia),
                        )
                    )

        # --- kable: uklad uziemienia ekranu vs uklad odniesienia katalogu -----
        for branch in enm.branches:
            if not isinstance(branch, Cable) or branch.screen_bonding is None:
                continue
            params = (
                branch.materialized_params if isinstance(branch.materialized_params, dict) else {}
            )
            odniesienie = params.get("z0_reference_bonding")
            if odniesienie == branch.screen_bonding:
                continue
            issues.append(
                ValidationIssue(
                    code="W-W5-01",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=(
                        f"{opis_obiektu(branch, 'Kabel')}: zadeklarowany układ uziemienia ekranu "
                        f"„{ETYKIETA_PL_UZIEMIENIA_EKRANU.get(str(branch.screen_bonding), 'inny')}” "
                        + (
                            "różni się od układu odniesienia katalogowych R0/X0 "
                            f"„{ETYKIETA_PL_UZIEMIENIA_EKRANU.get(str(odniesienie), 'inny')}”"
                            if odniesienie is not None
                            else "bez układu odniesienia katalogowych R0/X0 (typ kabla nie "
                            "deklaruje układu uziemienia ekranu, dla którego podano R0/X0)"
                        )
                        + " — składowa zerowa kabla nie jest przeliczana; wynik 1F/2FG "
                        "obowiązuje dla układu odniesienia."
                    ),
                    element_refs=[branch.ref_id],
                    wizard_step_hint="K3",
                    suggested_fix=(
                        "Dobierz typ kabla z R0/X0 dla tego układu ekranu albo zmień deklarację."
                    ),
                    fix_action=_fix(branch.ref_id, "BranchModal", "screen_bonding"),
                )
            )

    def _check_nn_topology(self, enm: EnergyNetworkModel, issues: list[ValidationIssue]) -> None:
        """P0.1 nN (karta P0.1; C §5; D LV-INV-01/03/11/12).

        E060 - odbior/generator na szynie nN bez ciaglej sciezki (przez zamkniete
               galezie + transformatory) do zadnego zrodla (LV-INV-01). Zrodlem
               energizacji jest KAZDY `Source` w modelu (SN lub nN) — upstream SN
               energizuje nN przez transformator w TYM SAMYM grafie (LV-INV-05);
               Generator NIE jest tu zrodlem energizacji (analogicznie do
               istniejacego E003 — Generator moze zniknac z case'u jako stan
               laczników, Source jest siecia).
        E061 - galaz z OBOMA koncami w pasmie nN bez wiazania katalogowego
               KABEL_NN/APARAT_NN (catalog_ref); wyjatek: galaz z automigracji
               promocji pol nN (meta `nn_promocja_bez_wiazania_katalogowej`,
               `enm/migrations/nn_field_specs_promocja.py`) bez wiazania -> W061
               (LV-INV-12, C §4.2 — dane historyczne, ktorych katalog nie widzial).
        E062 - dwie szyny nN o ROZNYCH napieciach znamionowych polaczone galezia
               NIE-transformatorowa. Zaostrzenie E020 WEWNATRZ pasma nN: E020
               grupuje CALE pasmo „nN" (do 1 kV wlacznie) jako JEDNO pasmo (0,4 kV i 0,69 kV
               nalezą do tego samego pasma), wiec nie wykrywa mieszania
               poziomow WEWNATRZ pasma (LV-INV-11).
        E063 - transformator SN/nN stacji zasilajacej odbiory/generatory nN bez
               ukladu uziemienia sieci nN (`Transformer.lv_earthing_system`, W5-A
               §1 p. 2 — JEDEN predykat `enm/uklad_sieci_nn.py`, ten sam co
               ELIG_FLNN_MISSING_EARTHING_SYSTEM) — wymagane dla kryterium
               SWZ/ochrony przeciwporazeniowej (IEC 60364-4-41).
        E064 - ProtectionAssignment.breaker_ref wskazuje galaz, ktorej NIE MA w
               modelu (LV-INV-03 — zabezpieczenie musi byc fizycznie w torze;
               kontrola ogolna, nie ograniczona do pasma nN — dowolna dolaczajaca
               operacja usuwajaca galaz z przypisanym zabezpieczeniem musi albo
               odlaczyc zabezpieczenie, albo zostawic slad wykrywalny tutaj).
        W060 - odcinek KABLOWY nN (Cable, oba konce nN) bez meta.
               cable_laying_conditions — obciazalnosc liczona wg zalozenia
               katalogowego (jawne ostrzezenie, nie cichy domysl).
        W062 - co najmniej dwa zrodla/generatory nN BEZPOSREDNIO na TEJ SAMEJ
               szynie — rownolegla praca bez sprzegla/logiki SZR miedzy nimi.
        """
        bus_by_ref = {b.ref_id: b for b in enm.buses}

        def _bus_w_pasmie_nn(bus_ref: str) -> bool:
            bus = bus_by_ref.get(bus_ref)
            return bus is not None and w_pasmie_nn(bus.voltage_kv)

        # --- E060: ciaglosc zasilania odbiorow/generatorow nN ---------------
        # Jedyny serwis topologii (CV-4.3): te same wyspy co E003 i mapowanie ENM → IR.
        source_bus_refs = {s.bus_ref for s in enm.sources if s.bus_ref in bus_by_ref}
        skladowa_wezla: dict[str, frozenset[str]] = {}
        for wyspa in derive(enm).wyspy:
            zamrozona = frozenset(wyspa.szyny)
            for ref in wyspa.szyny:
                skladowa_wezla[ref] = zamrozona

        def _ma_sciezke_do_zrodla(bus_ref: str) -> bool:
            skladowa = skladowa_wezla.get(bus_ref)
            if skladowa is None:
                return False
            return bool(skladowa & source_bus_refs)

        for load in enm.loads:
            if not _bus_w_pasmie_nn(load.bus_ref):
                continue
            if _ma_sciezke_do_zrodla(load.bus_ref):
                continue
            issues.append(
                ValidationIssue(
                    code="E060",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(load, 'Odbiór nN')} na szynie "
                        f"({opis_obiektu(bus_by_ref.get(load.bus_ref), 'szyna')}) nie ma ciągłej ścieżki "
                        "(przez zamknięte gałęzie/transformatory) do żadnego źródła zasilania."
                    ),
                    element_refs=[load.ref_id, load.bus_ref],
                    wizard_step_hint="K6",
                    suggested_fix=(
                        "Zamknij łącznik na trasie do źródła albo połącz odpływ z "
                        "zasilaną częścią sieci."
                    ),
                    fix_action=FixAction(
                        action_type="NAVIGATE_TO_ELEMENT",
                        element_ref=load.ref_id,
                        modal_type="LoadModal",
                        payload_hint={"required": "continuous_path_to_source"},
                    ),
                )
            )

        for gen in enm.generators:
            if not _bus_w_pasmie_nn(gen.bus_ref):
                continue
            if _ma_sciezke_do_zrodla(gen.bus_ref):
                continue
            issues.append(
                ValidationIssue(
                    code="E060",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(gen, 'Źródło nN')} na szynie "
                        f"({opis_obiektu(bus_by_ref.get(gen.bus_ref), 'szyna')}) nie ma ciągłej ścieżki "
                        "(przez zamknięte gałęzie/transformatory) do reszty sieci zasilanej."
                    ),
                    element_refs=[gen.ref_id, gen.bus_ref],
                    wizard_step_hint="K6",
                    suggested_fix=(
                        "Zamknij łącznik na trasie do reszty sieci albo sprawdź "
                        "przyłączenie źródła."
                    ),
                    fix_action=FixAction(
                        action_type="NAVIGATE_TO_ELEMENT",
                        element_ref=gen.ref_id,
                        modal_type="GeneratorModal",
                        payload_hint={"required": "continuous_path_to_source"},
                    ),
                )
            )

        # --- E061/W061: wiazanie katalogowe galezi W PASMIE nN ---------------
        for branch in enm.branches:
            if not (_bus_w_pasmie_nn(branch.from_bus_ref) and _bus_w_pasmie_nn(branch.to_bus_ref)):
                continue
            if branch.catalog_ref:
                continue
            branch_meta = branch.meta if isinstance(branch.meta, dict) else {}
            if branch_meta.get(META_KLUCZ_NN_PROMOCJA_BEZ_WIAZANIA):
                issues.append(
                    ValidationIssue(
                        code="W061",
                        severity=SEVERITY_IMPORTANT,
                        message_pl=(
                            f"{opis_obiektu(branch, 'Gałąź nN')} (z automigracji pól nN) nie ma "
                            "wiązania z katalogiem kabli nN albo aparatów nN — dane "
                            "katalogowe pola źródłowego nie były dostępne przy migracji."
                        ),
                        element_refs=[branch.ref_id],
                        wizard_step_hint="K6",
                        suggested_fix="Przypisz element z katalogu kabli nN albo aparatów nN.",
                        fix_action=FixAction(
                            action_type="SELECT_CATALOG",
                            element_ref=branch.ref_id,
                            modal_type="BranchModal",
                            payload_hint={"required": "catalog_ref"},
                        ),
                    )
                )
                continue
            issues.append(
                ValidationIssue(
                    code="E061",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(branch, 'Gałąź nN')} nie ma wiązania z katalogiem "
                        "kabli nN albo aparatów nN."
                    ),
                    element_refs=[branch.ref_id],
                    wizard_step_hint="K6",
                    suggested_fix="Przypisz element z katalogu kabli nN albo aparatów nN.",
                    fix_action=FixAction(
                        action_type="SELECT_CATALOG",
                        element_ref=branch.ref_id,
                        modal_type="BranchModal",
                        payload_hint={"required": "catalog_ref"},
                    ),
                )
            )

        # --- E062: mieszanie poziomow napiecia WEWNATRZ pasma nN --------------
        for branch in enm.branches:
            from_bus = bus_by_ref.get(branch.from_bus_ref)
            to_bus = bus_by_ref.get(branch.to_bus_ref)
            if from_bus is None or to_bus is None:
                continue
            if from_bus.voltage_kv <= 0 or to_bus.voltage_kv <= 0:
                continue
            if not (w_pasmie_nn(from_bus.voltage_kv) and w_pasmie_nn(to_bus.voltage_kv)):
                continue
            if abs(from_bus.voltage_kv - to_bus.voltage_kv) <= 1e-9:
                continue
            issues.append(
                ValidationIssue(
                    code="E062",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(branch, 'Gałąź')} łączy dwie szyny nN o różnych "
                        f"napięciach znamionowych ({from_bus.voltage_kv:g} kV i "
                        f"{to_bus.voltage_kv:g} kV) bez transformatora."
                    ),
                    element_refs=[branch.ref_id, from_bus.ref_id, to_bus.ref_id],
                    wizard_step_hint="K6",
                    suggested_fix=(
                        "Wstaw transformator między poziomami nN albo popraw "
                        "przypisanie szyn gałęzi."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=branch.ref_id,
                        modal_type="BranchModal",
                        payload_hint={"required": "nn_voltage_level_consistency"},
                    ),
                )
            )

        # --- E063: uklad uziemienia sieci nN transformatora stacji z odbiorami nN
        for sub, trafo in transformatory_bez_ukladu_nn(enm):
            issues.append(
                ValidationIssue(
                    code="E063",
                    severity=SEVERITY_BLOCKER,
                    message_pl=(
                        f"{opis_obiektu(trafo, 'Transformator')} ({opis_obiektu(sub, 'stacja')}) "
                        "zasila odbiory nN, ale nie deklaruje układu uziemienia sieci nN "
                        f"(pole {pole('lv_earthing_system')})."
                    ),
                    element_refs=[trafo.ref_id, sub.ref_id],
                    wizard_step_hint="K6",
                    suggested_fix="Wybierz układ uziemienia sieci nN (TN-S/TN-C/TN-C-S/TT/IT).",
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=trafo.ref_id,
                        modal_type="TransformerModal",
                        payload_hint={"required": "lv_earthing_system"},
                    ),
                )
            )

        # --- E064: zabezpieczenie wskazujace nieistniejaca galaz --------------
        branch_refs = {b.ref_id for b in enm.branches}
        for pa in enm.protection_assignments:
            if pa.breaker_ref and pa.breaker_ref not in branch_refs:
                issues.append(
                    ValidationIssue(
                        code="E064",
                        severity=SEVERITY_BLOCKER,
                        message_pl=(
                            f"{opis_obiektu(pa, 'Zabezpieczenie')} wskazuje wyłącznik, którego "
                            "nie ma w modelu sieci."
                        ),
                        element_refs=[pa.ref_id, pa.breaker_ref],
                        wizard_step_hint="K7",
                        suggested_fix=(
                            "Przypisz zabezpieczenie do istniejącej gałęzi łącznikowej."
                        ),
                        fix_action=FixAction(
                            action_type="OPEN_MODAL",
                            element_ref=pa.ref_id,
                            modal_type="ProtectionModal",
                            payload_hint={"required": "breaker_ref"},
                        ),
                    )
                )

        # --- W060: odcinek kablowy nN bez warunkow ulozenia -------------------
        for branch in enm.branches:
            if not isinstance(branch, Cable):
                continue
            if not (_bus_w_pasmie_nn(branch.from_bus_ref) and _bus_w_pasmie_nn(branch.to_bus_ref)):
                continue
            branch_meta = branch.meta if isinstance(branch.meta, dict) else {}
            if branch_meta.get("cable_laying_conditions"):
                continue
            issues.append(
                ValidationIssue(
                    code="W060",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=(
                        f"{opis_obiektu(branch, 'Kabel nN')} nie ma zadeklarowanych warunków "
                        "ułożenia — obciążalność liczona wg założenia katalogowego."
                    ),
                    element_refs=[branch.ref_id],
                    wizard_step_hint="K6",
                    suggested_fix=(
                        "Zadeklaruj warunki ułożenia kabla (sposób, grunt, grupowanie)."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=branch.ref_id,
                        modal_type="BranchModal",
                        payload_hint={"required": "cable_laying_conditions"},
                    ),
                )
            )

        # --- W062: rownolegle zrodla nN na jednej szynie bez sprzegla ---------
        zrodla_na_szynie: dict[str, list[str]] = {}
        for source in enm.sources:
            if _bus_w_pasmie_nn(source.bus_ref):
                zrodla_na_szynie.setdefault(source.bus_ref, []).append(source.ref_id)
        for gen in enm.generators:
            if _bus_w_pasmie_nn(gen.bus_ref):
                zrodla_na_szynie.setdefault(gen.bus_ref, []).append(gen.ref_id)
        for bus_ref, refs in zrodla_na_szynie.items():
            if len(refs) < 2:
                continue
            issues.append(
                ValidationIssue(
                    code="W062",
                    severity=SEVERITY_IMPORTANT,
                    message_pl=(
                        f"{opis_elementu(enm, bus_ref, 'Szyna nN')} ma {len(refs)} "
                        "źródła/generatory ("
                        f"{', '.join(sorted(opis_elementu(enm, ref, 'źródło') for ref in refs))}"
                        ") bezpośrednio na tej samej szynie — brak sprzęgła/logiki SZR "
                        "rozdzielającej równoległą pracę."
                    ),
                    element_refs=[bus_ref, *sorted(refs)],
                    wizard_step_hint="K6",
                    suggested_fix=(
                        "Rozdziel źródła na osobne sekcje szyn ze sprzęgłem albo "
                        "wprowadź logikę SZR."
                    ),
                    fix_action=FixAction(
                        action_type="OPEN_MODAL",
                        element_ref=bus_ref,
                        modal_type="SubstationModal",
                        payload_hint={"required": "nn_parallel_sources"},
                    ),
                )
            )
