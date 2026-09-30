"""Wspólne predykaty blokad rozdzielnicy (jedna prawda dla walidatora i referencji).

Reference Engine V1 §7 (REFERENCE_ENGINE_SPEC_V1.md): reguła blokady
uziemnik ↔ łącznik toru głównego (recenzja NO-GO 2026-07-17 pkt 10, kod
walidatora `bays.earthing_interlock_violation`) jest używana w DWÓCH
miejscach — walidacja na żywo (`enm/validator.py`) i raport zgodności
referencyjnej (`reference_engine/compliance.py`, reguła
`iec62271.interlock.es_vs_main`). Predykat żyje tu, żeby nie powstała
druga, rozjeżdżająca się kopia logiki stanów aparatów.
"""

from __future__ import annotations

from collections.abc import Sequence

from .models import Bay, BayPrimaryDevice, BaySwitchState

# Łączniki toru głównego pola (recenzja NO-GO pkt 10): zamknięty uziemnik
# przy JEDNOCZEŚNIE zamkniętym którymkolwiek z nich = uziemienie toru pod
# napięciem — niedozwolona kombinacja stanów.
MAIN_SWITCH_KINDS: frozenset[str] = frozenset({"CB", "DS", "LOAD_SWITCH", "FUSE"})
EARTHING_SWITCH_KIND = "ES"


def runtime_state_record(bay: Bay, device_ref: str) -> BaySwitchState | None:
    """Rekord stanu aparatu ZE ŹRÓDŁA zapisanego w modelu albo None (brak danych).

    Kolejność źródeł: rekord `switch_state` aparatu pierwotnego pola na migawce
    (`Bay.primary_devices`), a gdy brak — `Bay.runtime_state.primary_device_states`.
    Jedyne miejsce odczytu stanu ruchowego aparatu (karta #135): model odczytu pola,
    walidator (W034), silnik zgodności referencyjnej i reguły telemechaniki.
    """
    for device in bay.primary_devices or []:
        if device.device_ref == device_ref and device.switch_state is not None:
            return device.switch_state
    if bay.runtime_state is not None:
        return bay.runtime_state.primary_device_states.get(device_ref)
    return None


def device_state_record(bay: Bay, device: BayPrimaryDevice) -> BaySwitchState | None:
    """Znany rekord stanu aparatu albo None (brak danych — zero domysłu).

    Rekord samego aparatu ma pierwszeństwo, potem źródło pola (`runtime_state_record`).
    """
    if device.switch_state is not None:
        return device.switch_state
    return runtime_state_record(bay, device.device_ref)


def is_closed(actual_state: str | None) -> bool:
    """Stan „zamknięty" (także z napędem rozbrojonym). Nieznany = NIE zamknięty."""
    return actual_state is not None and actual_state.startswith("zamkniety")


def device_state(bay: Bay, device: BayPrimaryDevice) -> str | None:
    """Znany `actual_state` aparatu albo None (patrz `device_state_record`)."""
    state = device_state_record(bay, device)
    return state.actual_state if state is not None else None


def device_closed(bay: Bay, device: BayPrimaryDevice) -> bool:
    """Stan „zamknięty" aparatu (patrz `device_state`, `is_closed`)."""
    return is_closed(device_state(bay, device))


def blokady_zamkniecia(
    aparaty: Sequence[tuple[str, str, str | None]],
) -> dict[str, bool | None]:
    """Blokada zamknięcia aparatu z reguły uziemnik ↔ łącznik toru głównego (to samo pole).

    Wejście: ``(device_ref, kind, actual_state | None)`` aparatów pola. Wynik dla uziemnika
    i każdego łącznika toru głównego (`MAIN_SWITCH_KINDS`): ``True`` — zamknięcie zablokowane,
    bo aparat przeciwny (dla uziemnika: łącznik toru; dla łącznika: uziemnik) jest zamknięty;
    ``False`` — wszystkie aparaty przeciwne mają znany stan otwarty (albo ich nie ma);
    ``None`` — żaden znany przeciwny nie jest zamknięty, ale co najmniej jednego stan jest
    nieznany (reguła nie rozstrzyga — zero domysłu). Ten sam zbiór rodzajów i to samo
    pojęcie „zamknięty" co `earthing_interlock_violation` (W034).
    """
    stany_uziemnikow = [stan for _, kind, stan in aparaty if kind == EARTHING_SWITCH_KIND]
    stany_toru = [stan for _, kind, stan in aparaty if kind in MAIN_SWITCH_KINDS]

    def blokada(przeciwne: list[str | None]) -> bool | None:
        if any(is_closed(stan) for stan in przeciwne):
            return True
        if any(stan is None for stan in przeciwne):
            return None
        return False

    wynik: dict[str, bool | None] = {}
    for ref, kind, _ in aparaty:
        if kind == EARTHING_SWITCH_KIND:
            wynik[ref] = blokada(stany_toru)
        elif kind in MAIN_SWITCH_KINDS:
            wynik[ref] = blokada(stany_uziemnikow)
    return wynik


def earthing_interlock_violation(
    bay: Bay,
) -> tuple[list[BayPrimaryDevice], list[BayPrimaryDevice]]:
    """Zwraca (zamknięte uziemniki, zamknięte łączniki toru) gdy blokada naruszona.

    Obie listy niepuste ⇔ naruszenie (uziemnik zamknięty przy zamkniętym
    łączniku toru głównego TEGO SAMEGO pola). Puste listy = brak naruszenia
    albo brak danych o stanach.
    """
    devices = bay.primary_devices or []
    closed_es = [d for d in devices if d.kind == EARTHING_SWITCH_KIND and device_closed(bay, d)]
    if not closed_es:
        return ([], [])
    closed_main = [d for d in devices if d.kind in MAIN_SWITCH_KINDS and device_closed(bay, d)]
    if not closed_main:
        return ([], [])
    return (closed_es, closed_main)
