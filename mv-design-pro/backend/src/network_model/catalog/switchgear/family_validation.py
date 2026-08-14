"""Walidator zgodności rodziny rozdzielnicy — JEDNO źródło prawdy.

`docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §4: zgodność pola, aparatu,
napięcia, prądu i zwarcia wynika z KATALOGU rodziny, nie z dowolnego dropdownu.
Kombinacja spoza katalogu kończy się twardym błędem z polskim zdaniem
(`NiezgodnoscKonfiguracjiError`) — nigdy cichym przycięciem listy ani
podstawieniem wartości domyślnej.

REGUŁA WSPÓLNA DLA WSZYSTKICH SPRAWDZEŃ: rodzina, której katalog nie potwierdza
źródłem (`status='requires_catalog'`), NIE wchodzi do konfiguratora. Predykat
„wolno budować" ma jedno źródło — `list_offered_switchgear_families()` — więc
nie da się wejść bocznymi drzwiami przez pojedyncze sprawdzenie.
"""

from __future__ import annotations

from .complete_mv_bay_template import BayKind, CompleteMvBayTemplate
from .device_instance import ApparatusKind, StatusWyposazenia
from .errors import NiezgodnoscKonfiguracjiError
from .factory_configuration import FactoryConfiguration
from .families import (
    SWITCHGEAR_FAMILY_REGISTRY,
    list_offered_switchgear_families,
)
from .switchgear_family import SwitchgearFamily


def get_family_or_raise(switchgear_family_ref: str) -> SwitchgearFamily:
    """Rodzina z rejestru albo twardy błąd po polsku."""
    family = SWITCHGEAR_FAMILY_REGISTRY.get(switchgear_family_ref)
    if family is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina rozdzielnicy {switchgear_family_ref!r} nie istnieje w katalogu."
        )
    return family


def wymagaj_rodziny_oferowanej(switchgear_family_ref: str) -> SwitchgearFamily:
    """Rodzina dopuszczona do budowania konfiguracji albo twardy błąd.

    Zapadka polityki danych: rodzina bez potwierdzonej karty katalogowej
    istnieje w katalogu (nie niszczymy wiedzy o portfolio producenta), ale nie
    wolno na niej niczego zbudować.
    """
    family = get_family_or_raise(switchgear_family_ref)
    oferowane = {f.switchgear_family_ref for f in list_offered_switchgear_families()}
    if family.switchgear_family_ref not in oferowane:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} ({family.manufacturer_ref}) nie ma "
            "potwierdzonych parametrow karta katalogowa (status "
            f"{family.status!r}) — nie mozna na niej budowac konfiguracji."
        )
    if family.tor_konfiguracji is None:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie deklaruje konstrukcji, wiec nie "
            "da sie ustalic toru konfiguracji (modularny albo blok RMU) — "
            "uzupelnij karte katalogowa."
        )
    return family


def family_supports_bay_kind(switchgear_family_ref: str, bay_kind: BayKind) -> None:
    """Rodzina przewiduje pole tej funkcji (inaczej twardy błąd)."""
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if bay_kind not in family.allowed_bay_kinds:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie przewiduje pola typu "
            f"{bay_kind!r} (typy katalogowe: {sorted(family.allowed_bay_kinds)})."
        )


def family_supports_apparatus(switchgear_family_ref: str, apparatus_kind: str) -> None:
    """Rodzina dopuszcza ten aparat w swoich polach (inaczej twardy błąd)."""
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if apparatus_kind not in family.allowed_apparatus_kinds:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie dopuszcza aparatu "
            f"{apparatus_kind!r} (slownik rodziny: "
            f"{sorted(family.allowed_apparatus_kinds)})."
        )


def family_supports_voltage(switchgear_family_ref: str, voltage_kv: float) -> None:
    """Napięcie mieści się w klasach katalogowych rodziny."""
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if voltage_kv not in family.voltage_levels:
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie obsluguje napiecia {voltage_kv} kV "
            f"(klasy katalogowe: {list(family.voltage_levels)})."
        )


def family_supports_current(switchgear_family_ref: str, current_a: int) -> None:
    """Prąd nie przekracza największej klasy prądowej szyn rodziny."""
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if current_a > max(family.rated_current_options):
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie obsluguje pradu szyn {current_a} A "
            f"(maksimum katalogowe: {max(family.rated_current_options)} A)."
        )


def family_supports_short_circuit(switchgear_family_ref: str, ik_ka: float) -> None:
    """Prąd zwarciowy nie przekracza wytrzymałości katalogowej rodziny."""
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if ik_ka > max(family.short_time_current_options):
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie obsluguje pradu zwarciowego "
            f"{ik_ka} kA (wytrzymalosc katalogowa: "
            f"{max(family.short_time_current_options)} kA)."
        )


def family_supports_bay_template(
    switchgear_family_ref: str, template: CompleteMvBayTemplate
) -> None:
    """Szablon pola należy do TEJ rodziny i jest polem, które ona przewiduje.

    Zakaz składania fikcyjnego pola „rodzina A + celka B": zgodność wynika z
    katalogu, nie z dropdownu.
    """
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if template.switchgear_family_ref != family.switchgear_family_ref:
        rodzima = template.switchgear_family_ref or "brak rodziny (szablon kanoniczny)"
        raise NiezgodnoscKonfiguracjiError(
            f"Pole {template.template_ref} nalezy do rodziny {rodzima}, nie do "
            f"{family.family_name} — katalog producenta nie przewiduje takiej "
            "kombinacji."
        )
    family_supports_bay_kind(switchgear_family_ref, template.bay_kind)


def bay_template_supports_apparatus(
    template: CompleteMvBayTemplate, apparatus_kind: ApparatusKind
) -> StatusWyposazenia:
    """Status aparatu w polu: FABRYCZNY albo OPCJA; spoza listy = twardy błąd.

    „Wszystko poza listą jest NIEDOPUSZCZALNE" nie jest wartością statusu,
    tylko brakiem wpisu — dlatego pytanie o aparat, którego pole nie
    przewiduje, kończy się błędem, a nie odpowiedzią „nie ma".
    """
    for instance in template.device_instances:
        if instance.apparatus_kind == apparatus_kind:
            return instance.status_wyposazenia
    raise NiezgodnoscKonfiguracjiError(
        f"Pole {template.template_ref} nie przewiduje elementu "
        f"{apparatus_kind!r} — katalog rodziny go nie dopuszcza."
    )


def family_supports_factory_configuration(configuration: FactoryConfiguration) -> None:
    """Blok fabryczny jest zgodny z rodziną, do której się przypisuje.

    Sprawdza łącznie: rodzina istnieje i jest oferowana, prowadzi TOREM
    BLOKOWYM (blok fabryczny w rodzinie modułowej to sprzeczność), a każda
    jednostka bloku ma funkcję i aparaturę ze słownika tej rodziny.
    """
    family = wymagaj_rodziny_oferowanej(configuration.switchgear_family_ref)
    if family.tor_konfiguracji != "BLOK_RMU":
        raise NiezgodnoscKonfiguracjiError(
            f"Konfiguracja fabryczna {configuration.code} przypisana do rodziny "
            f"{family.family_name}, ktora jest skladana z pojedynczych pol "
            f"(tor {family.tor_konfiguracji}) — bloki fabryczne maja tylko "
            "rodziny RMU."
        )
    for unit in configuration.units:
        if unit.bay_kind not in family.allowed_bay_kinds:
            raise NiezgodnoscKonfiguracjiError(
                f"Jednostka {unit.unit_code} ({unit.unit_name_pl}) bloku "
                f"{configuration.code} ma funkcje {unit.bay_kind!r}, ktorej "
                f"rodzina {family.family_name} nie przewiduje "
                f"(typy katalogowe: {sorted(family.allowed_bay_kinds)})."
            )
        for apparatus_kind in unit.apparatus_kinds:
            if apparatus_kind not in family.allowed_apparatus_kinds:
                raise NiezgodnoscKonfiguracjiError(
                    f"Jednostka {unit.unit_code} ({unit.unit_name_pl}) bloku "
                    f"{configuration.code} wymaga aparatu {apparatus_kind!r} "
                    f"spoza slownika rodziny {family.family_name} "
                    f"({sorted(family.allowed_apparatus_kinds)})."
                )
