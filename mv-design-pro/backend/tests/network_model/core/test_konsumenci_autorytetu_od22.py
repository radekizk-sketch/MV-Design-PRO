"""OD-22 (O-59, 2026-09-30): ``k_sc`` falownika pozostaje DEFAULT_FORBIDDEN.

Test KLASY kodów blokady autorytetu. Zbiór kodów pochodzi z JEDNEGO źródła
prawdy (`KODY_BLOKADY_AUTORYTETU`), nie z listy w teście:

- zamknięcie: każda stała ``KOD_BLOKADY_*`` modułu zdolności jest w zbiorze
  i odwrotnie (nowa stała bez wpisu = czerwień);
- wyzwalacz: każdy kod ze zbioru ma jawną proweniencję, która go wywołuje
  (nowy kod bez wyzwalacza = czerwień — test jest otwarty na dopisanie kodów
  z ADR-021 K2 i OD-14, ale nie przepuści kodu, którego nie umie wywołać);
- iloczyn: każda zdolność ZALEŻNA × każdy kod → blokada z dokładnie tym kodem;
  każda zdolność NIEZALEŻNA × każdy kod → brak blokady (wynik roboczy).
"""

from __future__ import annotations

from collections.abc import Callable

import network_model.core.zdolnosci_wkladu_zwarciowego as zdolnosci
import pytest
from network_model.core.autorytet_wyniku_zwarciowego import (
    ProweniencjaWynikuZwarciowego,
    blokady_autorytetu,
)
from network_model.core.wklad_zwarciowy_przeksztaltnika import (
    K_SC_ZRODLO_DOMYSLNE,
    K_SC_ZRODLO_NIEPOPRAWNE,
    K_SC_ZRODLO_POZA_DZIEDZINA,
    K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
)
from network_model.core.zdolnosci_wkladu_zwarciowego import (
    KODY_BLOKADY_AUTORYTETU,
    ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO,
    kod_blokady_dla_pochodzenia,
)


def _wyzwalacze() -> dict[str, Callable[[], ProweniencjaWynikuZwarciowego]]:
    wynik: dict[str, Callable[[], ProweniencjaWynikuZwarciowego]] = {}
    for znacznik in (
        K_SC_ZRODLO_DOMYSLNE,
        K_SC_ZRODLO_NIEPOPRAWNE,
        K_SC_ZRODLO_POZA_DZIEDZINA,
        K_SC_ZRODLO_PRAD_NIEPOPRAWNY,
    ):
        wynik[kod_blokady_dla_pochodzenia(znacznik)] = (
            lambda z=znacznik: ProweniencjaWynikuZwarciowego.ze_znacznikow([z])
        )
    wynik[zdolnosci.KOD_BLOKADY_WYNIK_BEZ_SLADU] = ProweniencjaWynikuZwarciowego.bez_sladu
    wynik[zdolnosci.KOD_BLOKADY_WYNIK_Z_PAYLOADU] = ProweniencjaWynikuZwarciowego.payload_klienta
    wynik[zdolnosci.KOD_BLOKADY_ZNACZNIK_NIEZNANY] = (
        lambda: ProweniencjaWynikuZwarciowego.ze_znacznikow(["ZNACZNIK_SPOZA_LISTY"])
    )
    return wynik


WYZWALACZE = _wyzwalacze()


def test_zbior_kodow_domkniety_wobec_stalych_modulu() -> None:
    stale = {
        wartosc
        for nazwa, wartosc in vars(zdolnosci).items()
        if nazwa.startswith("KOD_BLOKADY_") and isinstance(wartosc, str)
    }
    assert stale == set(KODY_BLOKADY_AUTORYTETU)


def test_kazdy_kod_ma_wyzwalacz() -> None:
    assert set(WYZWALACZE) == set(KODY_BLOKADY_AUTORYTETU)


@pytest.mark.parametrize("kod", sorted(KODY_BLOKADY_AUTORYTETU))
@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_zdolnosc_zalezna_x_kod_blokuje(zdolnosc: zdolnosci.ZdolnoscMiarodajna, kod: str) -> None:
    blokady = blokady_autorytetu(zdolnosc, WYZWALACZE[kod]())
    assert [b.kod for b in blokady] == [kod]
    assert all(b.zdolnosc is zdolnosc and b.komunikat_pl for b in blokady)


@pytest.mark.parametrize("kod", sorted(KODY_BLOKADY_AUTORYTETU))
@pytest.mark.parametrize("zdolnosc", sorted(ZDOLNOSCI_NIEZALEZNE_OD_WKLADU_ZWARCIOWEGO))
def test_zdolnosc_niezalezna_x_kod_nie_blokuje(
    zdolnosc: zdolnosci.ZdolnoscMiarodajna, kod: str
) -> None:
    assert blokady_autorytetu(zdolnosc, WYZWALACZE[kod]()) == ()
