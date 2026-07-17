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

from .models import Bay, BayPrimaryDevice, BaySwitchState

# Łączniki toru głównego pola (recenzja NO-GO pkt 10): zamknięty uziemnik
# przy JEDNOCZEŚNIE zamkniętym którymkolwiek z nich = uziemienie toru pod
# napięciem — niedozwolona kombinacja stanów.
MAIN_SWITCH_KINDS: frozenset[str] = frozenset({"CB", "DS", "LOAD_SWITCH", "FUSE"})


def device_state_record(bay: Bay, device: BayPrimaryDevice) -> BaySwitchState | None:
    """Znany rekord stanu aparatu albo None (brak danych — zero domysłu).

    Kolejność źródeł: `BayPrimaryDevice.switch_state`, a gdy brak —
    `Bay.runtime_state.primary_device_states[device_ref]`. Jedna prawda dla
    walidatora (W034), silnika zgodności referencyjnej i reguł telemechaniki
    (control_mode).
    """
    state = device.switch_state
    if state is None and bay.runtime_state is not None:
        state = bay.runtime_state.primary_device_states.get(device.device_ref)
    return state


def device_state(bay: Bay, device: BayPrimaryDevice) -> str | None:
    """Znany `actual_state` aparatu albo None (patrz `device_state_record`)."""
    state = device_state_record(bay, device)
    return state.actual_state if state is not None else None


def device_closed(bay: Bay, device: BayPrimaryDevice) -> bool:
    """Stan „zamknięty" aparatu (patrz `device_state`). Nieznany = NIE zamknięty."""
    actual = device_state(bay, device)
    return actual is not None and actual.startswith("zamkniety")


def earthing_interlock_violation(
    bay: Bay,
) -> tuple[list[BayPrimaryDevice], list[BayPrimaryDevice]]:
    """Zwraca (zamknięte uziemniki, zamknięte łączniki toru) gdy blokada naruszona.

    Obie listy niepuste ⇔ naruszenie (uziemnik zamknięty przy zamkniętym
    łączniku toru głównego TEGO SAMEGO pola). Puste listy = brak naruszenia
    albo brak danych o stanach.
    """
    devices = bay.primary_devices or []
    closed_es = [d for d in devices if d.kind == "ES" and device_closed(bay, d)]
    if not closed_es:
        return ([], [])
    closed_main = [d for d in devices if d.kind in MAIN_SWITCH_KINDS and device_closed(bay, d)]
    if not closed_main:
        return ([], [])
    return (closed_es, closed_main)
