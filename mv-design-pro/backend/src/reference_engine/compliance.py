"""Reference Engine V1 — silnik zgodności + Reference Score.

REFERENCE_ENGINE_SPEC_V1.md §7 (V12K-060, pkt 7/8 dyrektywy właściciela).
Czysta interpretacja danych ENM — zero fizyki, zero mutacji, deterministyczny
raport (ten sam ENM ⇒ identyczny wynik).

JEDNA implementacja sprawdzeń: walidacja NA ŻYWO (`validation.py`) wyprowadza
ostrzeżenia z TYCH SAMYCH sprawdzeń (mapowanie rule_code → kod walidatora) —
nie istnieje druga kopia logiki (pkt 10/12 dyrektywy).
"""

from __future__ import annotations

from collections.abc import Sequence

from enm.interlock_rules import device_state, earthing_interlock_violation
from enm.models import Bay, BayPrimaryDevice, EnergyNetworkModel, Substation
from network_model.catalog.switchgear import SwitchgearFamily
from network_model.catalog.switchgear.apparatus_vocabulary import (
    FAMILY_APPARATUS_FOR_ENM_KIND,
)

from .models import (
    ComplianceCheck,
    PackComplianceReport,
    ReferenceComplianceReport,
    ReferenceFieldProfile,
    ReferencePack,
)
from .registry import (
    FIELD_PROFILE_PACK_ID,
    family_for_pack,
    field_profile_for_bay,
    get_reference_pack,
    list_reference_packs,
)

# Nazwy PL aparatów — z JEDYNEGO słownika symboli (pakiet iec60617).
_KIND_NAME_PL: dict[str, str] = {
    entry.kind: entry.symbol_name_pl for entry in get_reference_pack("iec60617").symbol_map
}

# Mapowanie kind aparatu (ENM) → słownik aparatów rodziny rozdzielnicy —
# JEDNO źródło: catalog/switchgear/apparatus_vocabulary.py (to samo mapowanie
# filtruje szablony rodzin w kreatorze — canonical_fallback.py). TRANSFORMER_
# DEVICE i kindy DER leżą POZA celką — pomijane w sprawdzeniu słownika (§7).
_KIND_TO_FAMILY_APPARATUS: dict[str, str] = FAMILY_APPARATUS_FOR_ENM_KIND

# Mapowanie roli pola (ENM Bay.bay_role) → typ pola rodziny
# (`SwitchgearFamily.allowed_bay_kinds`). OZE → liniowe dopływowe (pole
# źródłowe realizowane jako pole liniowe rozdzielnicy — spec §7); FEEDER
# (rezerwowe / potrzeb własnych) bez jednoznacznego mapowania — pomijane.
_BAY_ROLE_TO_FAMILY_BAY_KIND: dict[str, str] = {
    "IN": "liniowe_doplywowe",
    "OUT": "liniowe_odplywowe",
    "TR": "transformatorowe",
    "MEASUREMENT": "pomiarowe",
    "COUPLER": "sprzeglowe_poprzeczne",
    "OZE": "liniowe_doplywowe",
}

# Placement aparatów z definicji bocznych (§18.1): poza osią toru.
_LATERAL_PLACEMENTS = frozenset({"GROUND_BRANCH", "OFF_PATH"})


def _kind_pl(kind: str) -> str:
    return _KIND_NAME_PL.get(kind, kind)


def _is_subsequence(seq: Sequence[str], template: Sequence[str]) -> bool:
    """Czy `seq` jest podciągiem `template` (zachowana kolejność, dozwolone luki)."""
    it = iter(template)
    return all(any(item == t for t in it) for item in seq)


def _sorted_bays(enm: EnergyNetworkModel) -> list[Bay]:
    return sorted(enm.bays, key=lambda b: b.ref_id)


def _station_type_of(bay: Bay, substations_by_ref: dict[str, Substation]) -> str | None:
    station = substations_by_ref.get(bay.substation_ref)
    return station.station_type if station is not None else None


# ---------------------------------------------------------------------------
# Sprawdzenia normowe (profil pola — pakiet iec62271)
# ---------------------------------------------------------------------------


def _profile_checks_for_bay(
    bay: Bay, profile: ReferenceFieldProfile, pack_id: str
) -> list[ComplianceCheck]:
    devices: list[BayPrimaryDevice] = list(bay.primary_devices or [])
    kinds = [d.kind for d in devices]
    present = set(kinds)
    checks: list[ComplianceCheck] = []

    def add(rule_code: str, ok: bool, message_pl: str) -> None:
        checks.append(
            ComplianceCheck(
                element_ref=bay.ref_id,
                pack_id=pack_id,
                rule_code=rule_code,
                status="pass" if ok else "fail",
                message_pl=message_pl,
            )
        )

    for req in profile.required:
        ok = req in present
        add(
            f"profile.required.{req}",
            ok,
            (
                f"Aparat wymagany obecny: {_kind_pl(req)}."
                if ok
                else f"Brak wymaganego aparatu: {_kind_pl(req)} " f"(profil „{profile.name_pl}”)."
            ),
        )

    for group in profile.one_of_groups:
        ok = any(kind in present for kind in group)
        names = " / ".join(_kind_pl(k) for k in group)
        add(
            "profile.one_of." + "|".join(group),
            ok,
            (
                f"Funkcja łączeniowa toru obecna ({names})."
                if ok
                else f"Brak funkcji łączeniowej toru: wymagany jeden z aparatów {names} "
                f"(profil „{profile.name_pl}”)."
            ),
        )

    forbidden_found = sorted(present.intersection(profile.forbidden))
    add(
        "profile.forbidden",
        not forbidden_found,
        (
            "Brak aparatów zakazanych dla profilu."
            if not forbidden_found
            else "Aparat zakazany dla profilu „"
            + profile.name_pl
            + "”: "
            + ", ".join(_kind_pl(k) for k in forbidden_found)
            + "."
        ),
    )

    lateral = set(profile.lateral_only)
    main_kinds = [k for k in kinds if k not in lateral and _kind_is_field_apparatus(k)]
    canonical_main = [k for k in profile.canonical_order if k not in lateral]
    order_ok = _is_subsequence(main_kinds, canonical_main)
    add(
        "profile.order",
        order_ok,
        (
            "Kolejność aparatów toru głównego zgodna z kolejnością kanoniczną."
            if order_ok
            else "Błędna kolejność aparatów toru głównego: "
            + " → ".join(_kind_pl(k) for k in main_kinds)
            + " (kanon od szyny w dół: "
            + " → ".join(_kind_pl(k) for k in canonical_main)
            + ")."
        ),
    )

    for device in devices:
        if device.kind not in lateral:
            continue
        ok = device.placement in _LATERAL_PLACEMENTS
        add(
            f"profile.lateral_placement.{device.kind}",
            ok,
            (
                f"Aparat boczny {_kind_pl(device.kind)} ('{device.device_ref}') "
                f"poza osią toru (placement {device.placement})."
                if ok
                else f"Aparat {_kind_pl(device.kind)} ('{device.device_ref}') leży W OSI "
                f"toru (placement {device.placement}) — ES/VT/SA są z definicji boczne "
                f"(SLD_CAD_SPEC_V3 §18.1)."
            ),
        )

    return checks


def _kind_is_field_apparatus(kind: str) -> bool:
    """Aparat POLA (uczestniczy w sprawdzeniu kolejności toru); kindy DER — nie."""
    return kind in _KIND_TO_FAMILY_APPARATUS or kind == "TRANSFORMER_DEVICE"


def _interlock_checks_for_bay(bay: Bay, pack_id: str) -> list[ComplianceCheck]:
    """Blokada uziemnika (wspólny predykat z W034 — enm/interlock_rules.py).

    Sprawdzenie STOSOWALNE tylko, gdy pole niesie uziemnik ze ZNANYM stanem
    (brak danych stanów ≠ sztuczny pass — uczciwy score, spec §7).
    """
    devices = list(bay.primary_devices or [])
    es_with_state = [d for d in devices if d.kind == "ES" and device_state(bay, d) is not None]
    if not es_with_state:
        return []
    closed_es, closed_main = earthing_interlock_violation(bay)
    violated = bool(closed_es and closed_main)
    message = (
        "Blokada uziemnika naruszona: uziemnik ("
        + ", ".join(d.device_ref for d in closed_es)
        + ") zamknięty przy zamkniętym łączniku toru ("
        + ", ".join(d.device_ref for d in closed_main)
        + ")."
        if violated
        else "Blokada uziemnik ↔ łącznik toru głównego zachowana."
    )
    return [
        ComplianceCheck(
            element_ref=bay.ref_id,
            pack_id=pack_id,
            rule_code="iec62271.interlock.es_vs_main",
            status="fail" if violated else "pass",
            message_pl=message,
        )
    ]


# ---------------------------------------------------------------------------
# Sprawdzenia producenckie (dane rodziny z katalogu — jedno źródło)
# ---------------------------------------------------------------------------


def _cell_match_check_for_bay(
    bay: Bay, pack: ReferencePack, family: SwitchgearFamily
) -> list[ComplianceCheck]:
    """Dopasowanie pola do konfiguracji celki z katalogu producenta (spec §7).

    Bramka danych: brak `cell_configurations` w pakiecie ALBO brak
    `primary_devices` pola = sprawdzenie nie istnieje. Celka pasuje, gdy jej
    aparaty STANDARDOWE ⊆ aparaty pola ORAZ aparaty pola ⊆ standard+opcje
    (porównanie na aparatach objętych słownikiem rodziny — transformator
    pola i kindy DER leżą poza celką). Kandydatami są celki o zgodnym
    `bay_kind` (albo bez przypisanej funkcji).
    """
    if not pack.cell_configurations or not bay.primary_devices:
        return []
    bay_kinds = {d.kind for d in bay.primary_devices if d.kind in _KIND_TO_FAMILY_APPARATUS}
    if not bay_kinds:
        return []
    mapped_bay_kind = _BAY_ROLE_TO_FAMILY_BAY_KIND.get(bay.bay_role)
    candidates = [
        cell
        for cell in pack.cell_configurations
        if cell.bay_kind is None or cell.bay_kind == mapped_bay_kind
    ]
    if not candidates:
        return []
    matched = None
    for cell in candidates:
        standard = {a.kind for a in cell.apparatus if a.requirement == "standard"}
        allowed = {a.kind for a in cell.apparatus}
        if standard.issubset(bay_kinds) and bay_kinds.issubset(allowed):
            matched = cell
            break
    message = (
        f"Skład pola odpowiada celce {matched.cell_code} "
        f"({matched.name_pl}) rodziny {family.family_name}."
        if matched
        else "Skład pola ("
        + ", ".join(_kind_pl(k) for k in sorted(bay_kinds))
        + f") nie odpowiada żadnej konfiguracji celki rodziny "
        f"{family.family_name} (kandydaci: " + ", ".join(c.cell_code for c in candidates) + ")."
    )
    return [
        ComplianceCheck(
            element_ref=bay.ref_id,
            pack_id=pack.pack_id,
            rule_code="family.cell_match",
            status="pass" if matched else "fail",
            message_pl=message,
        )
    ]


def _family_checks_for_bay(
    bay: Bay,
    family: SwitchgearFamily,
    pack_id: str,
    buses_voltage_kv: dict[str, float],
) -> list[ComplianceCheck]:
    checks: list[ComplianceCheck] = []

    def add(rule_code: str, ok: bool, message_pl: str) -> None:
        checks.append(
            ComplianceCheck(
                element_ref=bay.ref_id,
                pack_id=pack_id,
                rule_code=rule_code,
                status="pass" if ok else "fail",
                message_pl=message_pl,
            )
        )

    bay_kind = _BAY_ROLE_TO_FAMILY_BAY_KIND.get(bay.bay_role)
    if bay_kind is not None and family.allowed_bay_kinds:
        ok = bay_kind in family.allowed_bay_kinds
        add(
            "family.bay_kind",
            ok,
            (
                f"Typ pola „{bay_kind}” dostępny w rodzinie {family.family_name}."
                if ok
                else f"Typ pola „{bay_kind}” niedostępny w rodzinie "
                f"{family.family_name} (dozwolone: " + ", ".join(family.allowed_bay_kinds) + ")."
            ),
        )

    if family.allowed_apparatus_kinds:
        for device in bay.primary_devices or []:
            family_kind = _KIND_TO_FAMILY_APPARATUS.get(device.kind)
            if family_kind is None:
                continue  # TRANSFORMER_DEVICE / DER — poza celką rozdzielnicy
            ok = family_kind in family.allowed_apparatus_kinds
            add(
                f"family.apparatus.{device.kind}",
                ok,
                (
                    f"Aparat {_kind_pl(device.kind)} ('{device.device_ref}') "
                    f"w słowniku rodziny {family.family_name}."
                    if ok
                    else f"Aparat {_kind_pl(device.kind)} ('{device.device_ref}') "
                    f"SPOZA słownika rodziny {family.family_name} "
                    f"(brak „{family_kind}” w allowed_apparatus_kinds)."
                ),
            )

    voltage = buses_voltage_kv.get(bay.bus_ref)
    if voltage is not None and voltage > 0 and family.voltage_levels:
        # Reguła doboru: napięcie znamionowe rozdzielnicy ≥ napięcie sieci
        # (np. sieć 15 kV ⇒ rozdzielnica 17,5 kV) — spec §7.
        ok = max(family.voltage_levels) >= voltage - 1e-9
        add(
            "family.voltage",
            ok,
            (
                f"Napięcie sieci {voltage:g} kV mieści się w poziomach rodziny "
                f"{family.family_name} (do {max(family.voltage_levels):g} kV)."
                if ok
                else f"Napięcie sieci {voltage:g} kV przekracza najwyższe napięcie "
                f"znamionowe rodziny {family.family_name} "
                f"({max(family.voltage_levels):g} kV)."
            ),
        )

    return checks


# ---------------------------------------------------------------------------
# Sprawdzenia OSD (station_rules)
# ---------------------------------------------------------------------------

# Typy stacji SN/nN objęte regułą stacji kompaktowej prefabrykowanej.
_OSD_STATION_TYPES = frozenset({"mv_lv", "customer"})
_OSD_PREFERRED_CONSTRUCTION = frozenset({"kontenerowa", "prefabrykowana"})


def _osd_checks_for_station(station: Substation, pack: ReferencePack) -> list[ComplianceCheck]:
    checks: list[ComplianceCheck] = []
    implemented_rules = {r.rule_id for r in pack.station_rules if r.implemented}
    if (
        "osd_enea.station.prefabricated_compact_preferred" in implemented_rules
        and station.station_type in _OSD_STATION_TYPES
        and station.construction_type is not None
    ):
        ok = station.construction_type in _OSD_PREFERRED_CONSTRUCTION
        checks.append(
            ComplianceCheck(
                element_ref=station.ref_id,
                pack_id=pack.pack_id,
                rule_code="osd_enea.station.prefabricated_compact_preferred",
                status="pass" if ok else "fail",
                message_pl=(
                    f"Stacja SN/nN o konstrukcji „{station.construction_type}” — "
                    "zgodna z rozwiązaniem podstawowym standardu (stacja "
                    "kompaktowa prefabrykowana)."
                    if ok
                    else f"Stacja SN/nN o konstrukcji „{station.construction_type}” — "
                    "standard Enea Operator (Zeszyt 1/2) wskazuje stację kompaktową "
                    "prefabrykowaną jako rozwiązanie podstawowe dla nowych stacji."
                ),
            )
        )
    return checks


# ---------------------------------------------------------------------------
# Silnik
# ---------------------------------------------------------------------------


def _checks_for_pack(
    pack: ReferencePack,
    enm: EnergyNetworkModel,
    substations_by_ref: dict[str, Substation],
    buses_voltage_kv: dict[str, float],
) -> list[ComplianceCheck]:
    checks: list[ComplianceCheck] = []
    bays = _sorted_bays(enm)

    if pack.pack_id == FIELD_PROFILE_PACK_ID:
        for bay in bays:
            if not bay.primary_devices:
                continue  # konwencja rysunkowa — zgodna z definicji (spec §6)
            profile = field_profile_for_bay(
                bay.bay_role,
                _station_type_of(bay, substations_by_ref),
                (d.kind for d in bay.primary_devices),
            )
            if profile is None:
                continue
            checks.extend(_profile_checks_for_bay(bay, profile, pack.pack_id))
            checks.extend(_interlock_checks_for_bay(bay, pack.pack_id))

    elif pack.pack_id == "iec60617":
        mapped_kinds = {entry.kind for entry in pack.symbol_map}
        for bay in bays:
            if not bay.primary_devices:
                continue
            unknown = sorted({d.kind for d in bay.primary_devices} - mapped_kinds)
            checks.append(
                ComplianceCheck(
                    element_ref=bay.ref_id,
                    pack_id=pack.pack_id,
                    rule_code="iec60617.symbols_mapped",
                    status="fail" if unknown else "pass",
                    message_pl=(
                        "Wszystkie aparaty pola mają symbol w słowniku IEC 60617."
                        if not unknown
                        else "Aparaty bez symbolu w słowniku IEC 60617: " + ", ".join(unknown) + "."
                    ),
                )
            )

    elif pack.kind == "manufacturer":
        family = family_for_pack(pack)
        if family is not None:
            for bay in bays:
                checks.extend(_family_checks_for_bay(bay, family, pack.pack_id, buses_voltage_kv))
                checks.extend(_cell_match_check_for_bay(bay, pack, family))

    elif pack.kind == "osd":
        for station in sorted(enm.substations, key=lambda s: s.ref_id):
            checks.extend(_osd_checks_for_station(station, pack))

    return sorted(checks, key=lambda c: (c.element_ref, c.rule_code, c.message_pl))


def evaluate_enm(
    enm: EnergyNetworkModel, pack_ids: list[str] | None = None
) -> ReferenceComplianceReport:
    """Raport zgodności referencyjnej + Reference Score (spec §7/§8).

    `pack_ids=None` ⇒ wszystkie pakiety rejestru (tabela score per referencja,
    pkt 8 dyrektywy). Deterministyczny: sortowanie pakietów po `pack_id`,
    sprawdzeń po (element_ref, rule_code, message_pl).
    """
    if pack_ids is None:
        packs = list_reference_packs()
    else:
        packs = sorted(
            (get_reference_pack(pack_id) for pack_id in pack_ids),
            key=lambda p: p.pack_id,
        )

    substations_by_ref = {s.ref_id: s for s in enm.substations}
    buses_voltage_kv = {
        bus.ref_id: bus.voltage_kv
        for bus in enm.buses
        if bus.voltage_kv is not None and bus.voltage_kv > 0
    }

    reports: list[PackComplianceReport] = []
    for pack in packs:
        checks = _checks_for_pack(pack, enm, substations_by_ref, buses_voltage_kv)
        passed = sum(1 for c in checks if c.status == "pass")
        failed = len(checks) - passed
        score = round(100 * passed / len(checks)) if checks else None
        reports.append(
            PackComplianceReport(
                pack_id=pack.pack_id,
                name_pl=pack.name_pl,
                kind=pack.kind,
                version=pack.version,
                applicable=len(checks),
                passed=passed,
                failed=failed,
                score_percent=score,
                checks=checks,
            )
        )
    return ReferenceComplianceReport(packs=reports)
