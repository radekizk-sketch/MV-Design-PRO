"""Biegi dziedziny czestotliwosci BEZ solvera — walidacja opcji i odmowa nazwana.

Karta AB-1d_min krok 2 (program A/B, `docs/plan/PROGRAM_AB_DYNAMIKA_I_JAKOSC_ENERGII_2026-09.md`
§6.10, §7): rodzaje `harmoniczne`, `skan_czestotliwosciowy` i `supraharmoniczne` sa
zarejestrowane w JEDNYM miejscu (`RODZAJE_BIEGOW`), zanim istnieje ich fizyka.

* UTWORZENIE biegu waliduje opcje kontraktami bez wartosci domyslnych
  (`OsCzestotliwosci` — H-41, `SupraharmonicBand` — S-54): brak albo blad =
  `KontraktCzestotliwosciError` (API: 422 z kodem). To jest PIERWSZY konsument obu
  kontraktow. Walidacja jest ODCZYTEM — opcje (a wiec `input_hash`) bez zmian.
* WYKONANIE konczy sie odmowa `domena.solver_nieobecny` (`SolverNieobecnyError`),
  ktora nazywa brakujacy rdzen, przyjete wejscie (os / pasmo) i kamien, ktory
  solver dostarcza. Zadnej liczby zastepczej, zadnego wyniku czesciowego.

Zero fizyki: modul nie liczy niczego — czyta opcje i odmawia.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, NoReturn

from application.solvers.solver_capability_registry import (
    OPCJA_OS_CZESTOTLIWOSCI,
    OPCJA_PASMO_SUPRAHARMONICZNE,
    RODZAJE_BIEGOW,
    RODZAJE_BIEGOW_BEZ_SOLVERA,
    SolverNieobecnyError,
)
from network_model.solvers.harmoniczne import (
    KontraktCzestotliwosciError,
    OsCzestotliwosci,
    SupraharmonicBand,
)
from network_model.solvers.harmoniczne.kontrakty import (
    KOD_OS_NIEPOPRAWNA,
    KOD_PASMO_NIEPOPRAWNE,
)

#: Kontrakt KAZDEGO klucza opcji z `RodzajBiegu.wymagane_opcje` — parser i kod braku.
#: Komplet wobec tabeli rodzajow przypina `tests/application/test_rodzaje_biegow_jedna_lista.py`.
KONTRAKTY_OPCJI: dict[str, tuple[Callable[[Any], OsCzestotliwosci | SupraharmonicBand], str]] = {
    OPCJA_OS_CZESTOTLIWOSCI: (OsCzestotliwosci.z_dict, KOD_OS_NIEPOPRAWNA),
    OPCJA_PASMO_SUPRAHARMONICZNE: (SupraharmonicBand.z_dict, KOD_PASMO_NIEPOPRAWNE),
}


def waliduj_opcje_biegu_czestotliwosciowego(
    analysis_type: str, options: dict[str, Any]
) -> dict[str, OsCzestotliwosci | SupraharmonicBand]:
    """Kontrakty opcji biegu rodzaju dziedziny czestotliwosci (ODCZYT, bez zapisu).

    Zwraca sparsowane kontrakty po kluczu opcji. Brak klucza albo tresc spoza
    kontraktu — `KontraktCzestotliwosciError` z kodem i nazwa pola.
    """
    rodzaj = RODZAJE_BIEGOW[analysis_type]
    kontrakty: dict[str, OsCzestotliwosci | SupraharmonicBand] = {}
    for klucz in rodzaj.wymagane_opcje:
        parser, kod_braku = KONTRAKTY_OPCJI[klucz]
        if klucz not in options:
            raise KontraktCzestotliwosciError(
                kod_braku,
                f"Bieg {analysis_type!r} wymaga opcji {klucz!r} (kontrakt bez wartości "
                "domyślnych — dziedzina częstotliwości nie jest zgadywana)",
            )
        kontrakty[klucz] = parser(options[klucz])
    return kontrakty


def odmow_bieg_bez_solvera(analysis_type: str, options: dict[str, Any]) -> NoReturn:
    """Wykonanie biegu rodzaju bez solvera — odmowa `domena.solver_nieobecny`.

    Komunikat nazywa przyjete wejscie (os czestotliwosci / pasmo supraharmoniczne
    z kontraktu), zeby projektant widzial, ze odmowa NIE wynika z danych, tylko z
    braku rdzenia.
    """
    if analysis_type not in RODZAJE_BIEGOW_BEZ_SOLVERA:
        raise AssertionError(f"Rodzaj {analysis_type!r} ma solver — to nie jest odmowa")
    kontrakty = waliduj_opcje_biegu_czestotliwosciowego(analysis_type, options)
    wejscie_pl = "; ".join(kontrakt.opis_pl() for _, kontrakt in sorted(kontrakty.items()))
    raise SolverNieobecnyError(analysis_type, wejscie_pl=wejscie_pl)


__all__ = [
    "KONTRAKTY_OPCJI",
    "odmow_bieg_bez_solvera",
    "waliduj_opcje_biegu_czestotliwosciowego",
]
