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


#: Tolerancja porównania napięć [kV]. Napięcia katalogowe i napięcia szyn są
#: wartościami ZNAMIONOWYMI zapisanymi jako `float` (15.0, 17.5, 24.0), więc
#: jedyne czego tu potrzeba, to odporność na reprezentację binarną — NIE jest
#: to margines inżynierski i nie wolno go do tego użyć.
_TOLERANCJA_NAPIECIA_KV = 1e-9


def czy_rodzina_obsluguje_napiecie(family: SwitchgearFamily, voltage_kv: float) -> bool:
    """Czy rodzina pasuje do szyny o napięciu znamionowym `voltage_kv`.

    JEDNO ŹRÓDŁO PRAWDY dla pytania „czy ta rozdzielnica może stać na tej
    szynie". Zarówno twarda walidacja operacji domenowej
    (`family_supports_voltage`), jak i lista sprawdzeń Reference Engine V1
    (`reference_engine/compliance.py`) czytają TĘ funkcję — dwa niezależne
    warunki, które „dziś się zgadzają", byłyby defektem czekającym na dane
    brzegowe.

    REGUŁA (karta K-J, 2026-08-14):

    1. Gdy karta producenta wymienia napięcia SIECI (`network_voltages_kv`) —
       rozstrzyga ta lista: `voltage_kv` musi być jednym z wymienionych napięć.
       Producent nazwał sieci, dla których robi wyrób, i katalog rozstrzyga
       (§4 `KONFIGURATOR_ROZDZIELNIC_SN_RMU.md`), a nie domysł o zapasie
       izolacji. Rotoblok VCB deklarowany na sieć 20 kV nie wchodzi do sieci
       15 kV, choć jego izolacja by to wytrzymała — bo karta go tam nie oferuje.
    2. Gdy karta napięć sieci NIE podaje (lista pusta), rozstrzyga klasa
       urządzenia: wystarczy JEDNA klasa `Um >= voltage_kv`. Podstawa normowa:
       PN-EN 62271-1 definiuje napięcie znamionowe urządzenia jako GÓRNĄ
       granicę najwyższego napięcia sieci, dla której urządzenie zaprojektowano
       — więc aparat klasy 24 kV pracuje w sieci 15 i 20 kV, ale nie w 30 kV.
    3. Gdy karta nie podaje ŻADNEJ z dwóch wielkości, rodzina nie ma czym
       potwierdzić zgodności — odpowiedź brzmi „nie", a nie „może". Cicha zgoda
       przy braku danych to fabrykacja zgodności.

    Napięcie niedodatnie nie jest napięciem szyny — zwraca `False`, żeby brak
    danych o szynie nie przechodził jako zgodność.
    """
    if not voltage_kv > 0:
        return False
    if family.network_voltages_kv:
        return any(
            abs(napiecie_sieci - voltage_kv) <= _TOLERANCJA_NAPIECIA_KV
            for napiecie_sieci in family.network_voltages_kv
        )
    return any(
        klasa_um + _TOLERANCJA_NAPIECIA_KV >= voltage_kv for klasa_um in family.um_classes_kv
    )


def opis_napiec_rodziny_pl(family: SwitchgearFamily) -> str:
    """Polskie zdanie o tym, co karta rodziny deklaruje w sprawie napięcia.

    Używane w komunikacie błędu i w liście sprawdzeń V1, żeby projektant
    czytał POWÓD odrzucenia (co katalog deklaruje), a nie samą odmowę.
    """
    if family.network_voltages_kv:
        wartosci = ", ".join(f"{napiecie:g}" for napiecie in family.network_voltages_kv)
        return f"karta deklaruje napiecia sieci: {wartosci} kV"
    if family.um_classes_kv:
        wartosci = ", ".join(f"{klasa:g}" for klasa in family.um_classes_kv)
        return f"karta deklaruje klasy napieciowe urzadzenia (Um): {wartosci} kV"
    return "karta nie deklaruje ani napiec sieci, ani klas napieciowych urzadzenia"


def family_supports_voltage(switchgear_family_ref: str, voltage_kv: float) -> None:
    """Napięcie szyny mieści się w deklaracji napięciowej rodziny (albo błąd).

    Twarda brama operacji domenowych. Reguła — jej uzasadnienie normowe i
    zachowanie przy braku danych — siedzi w `czy_rodzina_obsluguje_napiecie`;
    tutaj jest tylko zamiana odpowiedzi `False` na twardy błąd po polsku.
    """
    family = wymagaj_rodziny_oferowanej(switchgear_family_ref)
    if not czy_rodzina_obsluguje_napiecie(family, voltage_kv):
        raise NiezgodnoscKonfiguracjiError(
            f"Rodzina {family.family_name} nie obsluguje napiecia {voltage_kv:g} kV "
            f"({opis_napiec_rodziny_pl(family)})."
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
