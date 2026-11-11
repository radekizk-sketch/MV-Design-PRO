"""Nazwy słowników kontraktu werdyktu W TEKŚCIE: każda wartość zamkniętego słownika ma polską
nazwę (status maszynowy NIE ma mapy poza ``werdykt.etykiety`` — zdanie walidatora niesie
etykietę rekordu; walidatory rekordu, blok dokumentu i wyjaśnienie czytają te same mapy z
``werdykt.kontrakt``), a nazwa nie powtarza kodu."""

from __future__ import annotations

from typing import get_args

import pytest
from werdykt.kontrakt import (
    NAZWA_DZIEDZINY_PL,
    NAZWA_METODY_PL,
    NAZWA_RELACJI_PL,
    NAZWA_RODZAJU_PODSTAWY_PL,
    NAZWA_STANU_ZRODLA_PL,
    DziedzinaFizyki,
    KompletnoscDowodu,
    KrokRegulyK,
    KrokRegulyW,
    MetodaDowodu,
    Relacja,
    RodzajPodstawy,
    StanZrodla,
    nazwa_kompletnosci,
    nazwa_kroku_reguly,
)

_PARY = [
    ("metoda", NAZWA_METODY_PL, set(get_args(MetodaDowodu))),
    ("relacja", NAZWA_RELACJI_PL, set(get_args(Relacja))),
    ("dziedzina", NAZWA_DZIEDZINY_PL, set(get_args(DziedzinaFizyki))),
    ("rodzaj podstawy", NAZWA_RODZAJU_PODSTAWY_PL, set(get_args(RodzajPodstawy))),
    ("stan źródła", NAZWA_STANU_ZRODLA_PL, set(get_args(StanZrodla))),
]


@pytest.mark.parametrize(("opis", "mapa", "slownik"), _PARY, ids=[p[0] for p in _PARY])
def test_kazda_wartosc_slownika_ma_nazwe_bez_kodu(
    opis: str, mapa: dict[str, str], slownik: set[str]
) -> None:
    assert set(mapa) == slownik, opis
    for kod, nazwa in mapa.items():
        assert "_" not in nazwa and nazwa != kod and not nazwa.isupper(), (opis, kod, nazwa)


def test_kompletnosc_ma_nazwe_bez_kodu() -> None:
    nazwy = {k: nazwa_kompletnosci(k) for k in get_args(KompletnoscDowodu)}
    assert nazwy == {"PELNY": "pełny", "NIEPELNY": "niepełny", "NIE_DOTYCZY": "nie dotyczy"}


def test_kazdy_krok_reguly_ma_nazwe_bez_kodu() -> None:
    for krok in set(get_args(KrokRegulyK)) | set(get_args(KrokRegulyW)):
        nazwa = nazwa_kroku_reguly(krok)
        assert "_" not in nazwa and not nazwa.isupper(), (krok, nazwa)
