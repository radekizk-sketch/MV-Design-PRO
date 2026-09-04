"""Kanonizacja liczb kontraktu projekcji nN (ADR-018, M0-2) — test KLASY.

Dowód z CI (2026-09-02): 7/18 fixtur miało inny `projection_hash` w CI niż
lokalnie przez różnice 1 ULP w liczbach z odwrócenia Zbus (jądro BLAS).
Ten test sprawdza, że kwantyzacja: (1) jest idempotentna na KAŻDEJ fixturze,
(2) jest odporna na zaburzenie ±1 ULP KAŻDEJ liczby w KAŻDEJ fixturze (symulacja
szumu międzyplatformowego: ten sam odcisk po zaburzeniu), (3) nie zmienia
liczb całkowitych, wartości logicznych, tekstu ani `None`, (4) normalizuje
`-0.0`, (5) fixtury w repozytorium są już w postaci kanonicznej.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import pytest
from application.analyses.kontrakt_liczb import (
    CYFRY_ZNACZACE,
    KontraktNiefinitowyError,
    kanoniczna_liczba,
    kwantyzuj_kontrakt,
)
from application.analyses.lv_domain.projection_v1 import _canonical_hash

FIXTURY = sorted(
    (
        Path(__file__).resolve().parents[5]
        / "frontend"
        / "src"
        / "ui"
        / "sld"
        / "v3"
        / "lv-domain"
        / "fixtures"
        / "generated"
    ).glob("*.json")
)


def _zaburz(obiekt: Any, kierunek: float) -> Any:
    """Zaburz każdą liczbę zmiennoprzecinkową o 1 ULP w zadanym kierunku."""
    if isinstance(obiekt, bool):
        return obiekt
    if isinstance(obiekt, float):
        return math.nextafter(obiekt, kierunek) if obiekt != 0.0 else obiekt
    if isinstance(obiekt, dict):
        return {k: _zaburz(v, kierunek) for k, v in obiekt.items()}
    if isinstance(obiekt, list):
        return [_zaburz(v, kierunek) for v in obiekt]
    return obiekt


def _liczby(obiekt: Any) -> int:
    if isinstance(obiekt, bool):
        return 0
    if isinstance(obiekt, float):
        return 1
    if isinstance(obiekt, dict):
        return sum(_liczby(v) for v in obiekt.values())
    if isinstance(obiekt, list):
        return sum(_liczby(v) for v in obiekt)
    return 0


def test_fixtury_istnieja() -> None:
    assert len(FIXTURY) == 18, [p.name for p in FIXTURY]


@pytest.mark.parametrize("sciezka", FIXTURY, ids=lambda p: p.stem)
def test_fixtura_jest_kanoniczna_i_idempotentna(sciezka: Path) -> None:
    dane = json.loads(sciezka.read_text(encoding="utf-8"))
    assert kwantyzuj_kontrakt(dane) == dane, "fixtura w repo nie jest w postaci kanonicznej"
    odcisk = dane.pop("projection_hash")
    assert _canonical_hash(dane) == odcisk


@pytest.mark.parametrize("sciezka", FIXTURY, ids=lambda p: p.stem)
@pytest.mark.parametrize("kierunek", [math.inf, -math.inf], ids=["+1ULP", "-1ULP"])
def test_zaburzenie_1_ulp_nie_zmienia_odcisku(sciezka: Path, kierunek: float) -> None:
    dane = json.loads(sciezka.read_text(encoding="utf-8"))
    odcisk = dane.pop("projection_hash")
    assert _liczby(dane) > 0, "fixtura bez liczb nie testuje klasy"
    zaburzone = _zaburz(dane, kierunek)
    assert zaburzone != dane or _liczby(dane) == 0
    assert _canonical_hash(kwantyzuj_kontrakt(zaburzone)) == odcisk


def test_kanoniczna_liczba_wlasnosci() -> None:
    assert kanoniczna_liczba(0.19999999999999998) == 0.2
    assert kanoniczna_liczba(7.111111111111113e-05) == kanoniczna_liczba(7.111111111111112e-05)
    assert kanoniczna_liczba(485.38743446700545) == kanoniczna_liczba(485.38743446700533)
    assert kanoniczna_liczba(-0.0) == 0.0 and math.copysign(1.0, kanoniczna_liczba(-0.0)) == 1.0
    assert kanoniczna_liczba(123456789.0) == 123456789.0
    assert kanoniczna_liczba(1234567891.0) == 1234567890.0
    assert kanoniczna_liczba(math.pi) == 3.14159265  # dokładnie CYFRY_ZNACZACE cyfr
    assert CYFRY_ZNACZACE == 9
    assert math.isinf(kanoniczna_liczba(math.inf))
    assert math.isnan(kanoniczna_liczba(math.nan))


def test_kwantyzuj_kontrakt_nie_zmienia_typow_nieliczbowych() -> None:
    wejscie = {
        "a": 1,
        "b": True,
        "c": "0.1",
        "d": None,
        "e": [1.23456789012, (2, 0.5)],
        "f": {"g": -0.0},
    }
    wynik = kwantyzuj_kontrakt(wejscie)
    assert wynik["a"] == 1 and isinstance(wynik["a"], int)
    assert wynik["b"] is True
    assert wynik["c"] == "0.1" and wynik["d"] is None
    assert wynik["e"][0] == 1.23456789 and wynik["e"][1] == (2, 0.5)
    assert wynik["f"]["g"] == 0.0 and math.copysign(1.0, wynik["f"]["g"]) == 1.0
    assert wejscie["e"][0] == 1.23456789012, "wejście nie może być mutowane"


# --- Polityka §35 (docs/architecture/COMPUTATIONAL_BOUNDARY.md §5) — testy klasy ---


@pytest.mark.parametrize(
    ("ladunek", "fragment_sciezki"),
    [
        ({"a": {"b": [1.0, math.nan]}}, "$.a.b[1]"),
        ({"u_kv": math.inf}, "$.u_kv"),
        ({"x": [{"y": -math.inf}]}, "$.x[0].y"),
        ({"z": complex(1.0, 2.0)}, "$.z"),
        ((0.5, math.nan), "$[1]"),
    ],
)
def test_tryb_scisly_odrzuca_niefinity_i_zespolone_ze_sciezka(
    ladunek: object, fragment_sciezki: str
) -> None:
    """NaN/±inf/complex w kontrakcie wyjściowym = jawny błąd ze ścieżką pola, nie
    niepoprawny JSON po stronie klienta."""
    with pytest.raises(KontraktNiefinitowyError) as blad:
        kwantyzuj_kontrakt(ladunek)
    assert fragment_sciezki in str(blad.value)


def test_tryb_luzny_przepuszcza_niefinity_bez_zmian() -> None:
    """Tryb `scisle=False` istnieje dla diagnostyki producenta ładunku — nie dla kontraktu."""
    wynik = kwantyzuj_kontrakt({"a": math.nan, "b": math.inf}, scisle=False)
    assert math.isnan(wynik["a"]) and math.isinf(wynik["b"])


def test_klasa_rownowaznosci_odcisku_9_cyfr() -> None:
    """Para wartości różnych o 1e-12 względnie KOLIDUJE (szum ULP), para różna o 1e-8
    względnie NIE koliduje — klasa równoważności odcisku jest zamierzona i zmierzona."""
    baza = 485.38743446700545
    assert kanoniczna_liczba(baza) == kanoniczna_liczba(baza * (1 + 1e-12))
    assert kanoniczna_liczba(baza) != kanoniczna_liczba(baza * (1 + 1e-8))


def test_porzadek_kluczy_nieistotny_a_porzadek_list_semantyczny() -> None:
    """`sort_keys` czyni odcisk niezależnym od kolejności kluczy; lista niesie kolejność."""
    a = {"x": 1.0, "y": [1.0, 2.0]}
    b = {"y": [1.0, 2.0], "x": 1.0}
    c = {"x": 1.0, "y": [2.0, 1.0]}
    assert _canonical_hash(kwantyzuj_kontrakt(a)) == _canonical_hash(kwantyzuj_kontrakt(b))
    assert _canonical_hash(kwantyzuj_kontrakt(a)) != _canonical_hash(kwantyzuj_kontrakt(c))


@pytest.mark.parametrize("skala", [1e-6, 1e-3, 1.0, 1e3, 1e6])
def test_kwantyzacja_wzgledna_niezalezna_od_skali_jednostki(skala: float) -> None:
    """Ta sama liczba cyfr znaczących niezależnie od jednostki (Ω, kV, MVA, mΩ)."""
    wartosc = 0.19999999999999998 * skala
    assert abs(kanoniczna_liczba(wartosc) - 0.2 * skala) <= abs(0.2 * skala) * 1e-12


def test_int_i_bool_nie_sa_kwantyzowane() -> None:
    assert kwantyzuj_kontrakt({"n": 1, "f": True, "s": "x", "z": None}) == {
        "n": 1,
        "f": True,
        "s": "x",
        "z": None,
    }
