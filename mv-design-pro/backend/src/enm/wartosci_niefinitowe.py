"""Kontrakt liczb wyniku biegu (§35): wykrywanie i podmiana wartości niefinitowych.

JEDYNE miejsce mechaniki „NaN/±inf w kontrakcie JSON biegu" — wołane przez tor
zwarciowy (wiersz wyniku, ślad WHITE BOX biegu) i tor rozpływu (napięcia węzłów,
prądy gałęzi) w ``enm/canonical_analysis.py``. Polityki (co oznaczyć, jak nazwać
ograniczenie) zostają w budowniczych kontraktów; tu jest wyłącznie mechanika.

PERF-SC-50 (2026-09-09, kolejność właściciela W-4, krok 1): poprzednia postać
(``_niefinitowe_na_none``) budowała REKURENCYJNĄ KOPIĘ całej struktury przy KAŻDYM
wywołaniu — także wtedy, gdy nie było czego podmieniać (bieg zdrowy = 100 %
wywołań w praktyce), a wynik kopii był odrzucany, bo wołający zwracał oryginał.
Na sieci 50 stacji dawało to 41,8 mln wywołań rekurencyjnych i alokację kopii
wiersza z 11 506 wpisami wkładów per punkt zwarcia (411 punktów). Teraz: najpierw
SKAN bez alokacji (``sciezki_niefinitowe``), kopia z podmianą WYŁĄCZNIE dla
struktury, która faktycznie niesie wartość niefinitową (``podmien_niefinitowe``).
Semantyka wyjścia bit w bit ta sama: te same ścieżki, te same podmiany na ``None``;
struktura zdrowa wraca jako TEN SAM obiekt (wołający i tak nie mutuje wyniku).
"""

from __future__ import annotations

import math
from typing import TypeVar, cast

__all__ = ["sciezki_niefinitowe", "podmien_niefinitowe"]

#: Struktura wejściowa wraca w TYM SAMYM typie (ten sam obiekt albo kopia o tym samym
#: kształcie) — funkcje są generyczne, nie „Any” (zapadka `test_no_any_in_domain_types`).
T = TypeVar("T")


def sciezki_niefinitowe(obiekt: object, sciezka: str = "$") -> list[str]:
    """Ścieżki JSON (``$.a[2].b``) wszystkich wartości ``float`` niefinitowych.

    Skan bez alokacji struktur pośrednich: nie kopiuje słowników ani list, nie
    tworzy nowych obiektów poza listą ścieżek (pustą dla struktury zdrowej).
    ``bool`` nie jest liczbą kontraktu (nie jest podklasą ``float``); ``int``
    zawsze finitowy; podklasy ``float`` (np. ``numpy.float64``) są liczbami.
    """
    wynik: list[str] = []
    _zbierz_sciezki(obiekt, sciezka, wynik)
    return wynik


def _zbierz_sciezki(obiekt: object, sciezka: str, wynik: list[str]) -> None:
    if isinstance(obiekt, dict):
        for klucz, wartosc in obiekt.items():
            # Szybka ścieżka dla skalarów (większość liści): bez wejścia w rekursję.
            if isinstance(wartosc, float):
                if not math.isfinite(wartosc):
                    wynik.append(f"{sciezka}.{klucz}")
            elif isinstance(wartosc, dict | list | tuple):
                _zbierz_sciezki(wartosc, f"{sciezka}.{klucz}", wynik)
        return
    if isinstance(obiekt, list | tuple):
        for indeks, wartosc in enumerate(obiekt):
            if isinstance(wartosc, float):
                if not math.isfinite(wartosc):
                    wynik.append(f"{sciezka}[{indeks}]")
            elif isinstance(wartosc, dict | list | tuple):
                _zbierz_sciezki(wartosc, f"{sciezka}[{indeks}]", wynik)
        return
    if isinstance(obiekt, float) and not math.isfinite(obiekt):
        wynik.append(sciezka)


def podmien_niefinitowe(obiekt: T, sciezka: str = "$") -> tuple[T, list[str]]:
    """(struktura z NaN/±inf → ``None``, ścieżki podmian) — kopia TYLKO gdy trzeba.

    Struktura bez wartości niefinitowych wraca jako ten sam obiekt z pustą listą
    (zero alokacji). W przeciwnym razie zwracana jest nowa struktura (kopia
    słowników/list z podmianami; krotki → listy, jak dotąd), a oryginał pozostaje
    nietknięty.
    """
    sciezki = sciezki_niefinitowe(obiekt, sciezka)
    if not sciezki:
        return obiekt, []
    return _kopia_z_podmiana(obiekt), sciezki


def _kopia_z_podmiana(obiekt: T) -> T:
    if isinstance(obiekt, dict):
        return cast(T, {klucz: _kopia_z_podmiana(wartosc) for klucz, wartosc in obiekt.items()})
    if isinstance(obiekt, list | tuple):
        return cast(T, [_kopia_z_podmiana(wartosc) for wartosc in obiekt])
    if isinstance(obiekt, float) and not math.isfinite(obiekt):
        return cast(T, None)
    return obiekt
