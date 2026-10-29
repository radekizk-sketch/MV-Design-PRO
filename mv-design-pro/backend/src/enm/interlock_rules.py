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

from collections.abc import Mapping, Sequence

from network_model.catalog.rodzaje_aparatury import (
    RODZAJ_UZIEMNIKA,
    RODZAJE_LACZNIKOW_TORU,
    STANY_OTWARTE_W_TORZE,
    laczniki_drogi_uziemnika,
)

from .models import Bay, BayPrimaryDevice, BaySwitchState

# Łączniki toru pola (recenzja NO-GO pkt 10): zamknięty uziemnik przy JEDNOCZEŚNIE zamkniętym
# łączniku z nim skojarzonym (`pary_blokad`; pole bez portów — którymkolwiek łącznikiem toru)
# = uziemienie toru pod napięciem — niedozwolona kombinacja stanów. Zbiór z JEDNEGO źródła
# (`rodzaje_aparatury.RODZAJE_LACZNIKOW_TORU`: CB, DS, LOAD_SWITCH, FUSE i łącznik
# trójpołożeniowy — w położeniu „zamknięty" przewodzi w torze jak odłącznik szynowy).
#
# Łącznik trójpołożeniowy w położeniu „uziemiony" NIE jest uziemnikiem tej reguły: uziemia
# stronę wyłącznika przy odciętej szynie, a uziemienie kabla przez ZAMKNIĘTY wyłącznik jest
# dopuszczone (ENEA Zeszyt 1 §13, druk s.24). Dla reguły jest łącznikiem toru OTWARTYM
# (`STANY_OTWARTE_W_TORZE`). Zgodę na samo uziemienie (strona wyłącznika bez napięcia na całej
# topologii wynikowej) rozstrzyga walidacja łączeń na topologii, nie ta reguła pola.
MAIN_SWITCH_KINDS: frozenset[str] = RODZAJE_LACZNIKOW_TORU
EARTHING_SWITCH_KIND = RODZAJ_UZIEMNIKA


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


def is_open(actual_state: str | None) -> bool:
    """WYŁĄCZNIE jednoznaczne położenie otwarte w torze (`STANY_OTWARTE_W_TORZE`: otwarty,
    otwarty z napędem rozbrojonym, uziemiony łącznik trójpołożeniowy). Stan nieznany, awaria
    i brak rekordu NIE potwierdzają otwarcia i nie zwalniają blokady (zero domysłu)."""
    return actual_state in STANY_OTWARTE_W_TORZE


def device_state(bay: Bay, device: BayPrimaryDevice) -> str | None:
    """Znany `actual_state` aparatu albo None (patrz `device_state_record`)."""
    state = device_state_record(bay, device)
    return state.actual_state if state is not None else None


def device_closed(bay: Bay, device: BayPrimaryDevice) -> bool:
    """Stan „zamknięty" aparatu (patrz `device_state`, `is_closed`)."""
    return is_closed(device_state(bay, device))


def pary_blokad(
    aparaty: Sequence[tuple[str, str, Mapping[str, str | None]]],
) -> dict[str, frozenset[str]]:
    """Pary blokady uziemnik → łączniki toru z nim skojarzone — JEDNO źródło obu kierunków.

    Wejście: ``(device_ref, kind, {port_id: węzeł})`` aparatów pola. Uziemnik z drogą do szyny
    wyprowadzoną z portów (`rodzaje_aparatury.laczniki_drogi_uziemnika`: łączniki do pierwszego
    odłączającego włącznie) wiąże WYŁĄCZNIE te łączniki — łącznik odgałęzienia przekładnika
    napięciowego nie blokuje uziemnika toru i odwrotnie. Uziemnik bez takiej drogi (pole bez
    portów, droga niejednoznaczna) wiąże KAŻDY łącznik toru pola (reguła sprzed kontraktu
    portów — zero domysłu, która część pola jest odłączona).
    """
    drogi = laczniki_drogi_uziemnika(aparaty)
    tor = frozenset(ref for ref, kind, _ in aparaty if kind in MAIN_SWITCH_KINDS)
    return {ref: drogi.get(ref, tor) for ref, kind, _ in aparaty if kind == EARTHING_SWITCH_KIND}


def blokady_zamkniecia(
    aparaty: Sequence[tuple[str, str, str | None, Mapping[str, str | None]]],
) -> dict[str, bool | None]:
    """Blokada zamknięcia aparatu z reguły uziemnik ↔ skojarzony łącznik toru (to samo pole).

    Wejście: ``(device_ref, kind, actual_state | None, {port_id: węzeł})`` aparatów pola.
    Pary z `pary_blokad`. Wynik dla uziemnika i każdego łącznika toru (`MAIN_SWITCH_KINDS`):
    ``True`` — zamknięcie zablokowane, bo aparat przeciwny (dla uziemnika: skojarzony łącznik
    toru; dla łącznika: uziemnik, z którym jest skojarzony) jest zamknięty; ``False`` —
    wszystkie aparaty przeciwne mają potwierdzone położenie otwarte (`is_open`) albo ich nie
    ma; ``None`` — żaden przeciwny nie jest zamknięty, ale co najmniej jednego położenie
    otwarte nie jest potwierdzone (brak rekordu, nieznany, awaria — reguła nie rozstrzyga, zero
    domysłu). Te same pary i to samo pojęcie „zamknięty" co `earthing_interlock_violation`.
    """
    stany = {ref: stan for ref, _, stan, _ in aparaty}
    pary = pary_blokad([(ref, kind, porty) for ref, kind, _, porty in aparaty])

    def blokada(przeciwne: list[str | None]) -> bool | None:
        if any(is_closed(stan) for stan in przeciwne):
            return True
        if any(not is_open(stan) for stan in przeciwne):
            return None
        return False

    wynik: dict[str, bool | None] = {}
    for ref, kind, _, _ in aparaty:
        if kind == EARTHING_SWITCH_KIND:
            wynik[ref] = blokada([stany[s] for s in sorted(pary[ref])])
        elif kind in MAIN_SWITCH_KINDS:
            wynik[ref] = blokada([stany[e] for e in sorted(pary) if ref in pary[e]])
    return wynik


def porty_aparatu(device: BayPrimaryDevice) -> dict[str, str | None]:
    """Porty aparatu pola jako ``{port_id: węzeł}`` (wejście reguł z portów)."""
    return {p.port_id: p.wezel for p in device.ports or []}


def earthing_interlock_violation(
    bay: Bay,
) -> tuple[list[BayPrimaryDevice], list[BayPrimaryDevice]]:
    """Zwraca (zamknięte uziemniki, zamknięte łączniki toru) gdy blokada naruszona.

    Obie listy niepuste ⇔ naruszenie: uziemnik zamknięty przy zamkniętym łączniku toru z nim
    skojarzonym (`pary_blokad`) TEGO SAMEGO pola. Puste listy = brak naruszenia albo brak
    danych o stanach.
    """
    devices = bay.primary_devices or []
    pary = pary_blokad([(d.device_ref, d.kind, porty_aparatu(d)) for d in devices])
    zamkniete = {d.device_ref for d in devices if device_closed(bay, d)}
    closed_es = [
        d
        for d in devices
        if d.kind == EARTHING_SWITCH_KIND
        and d.device_ref in zamkniete
        and pary[d.device_ref] & zamkniete
    ]
    if not closed_es:
        return ([], [])
    naruszone = frozenset().union(*(pary[d.device_ref] for d in closed_es))
    closed_main = [
        d
        for d in devices
        if d.kind in MAIN_SWITCH_KINDS and d.device_ref in zamkniete and d.device_ref in naruszone
    ]
    return (closed_es, closed_main)
