"""Mapa rodzaj analizy → dziedzina fizyki — ZAPADKA kompletności (karta AB-H0 §0.13).

Każda wartość każdego enumu rodzaju analizy ma wpis (dziedziny albo powód „poza
dziedzinami"); wpis bez wartości w żadnym enumie to martwy klucz (czerwień w obie strony).
"""

from __future__ import annotations

from enum import Enum
from typing import get_args

from diagnostics.models import AnalysisType as DiagnostykaAnalysisType
from domain.eligibility_models import AnalysisType as EligibilityAnalysisType
from domain.execution import ExecutionAnalysisType
from dziedziny.dziedzina_analizy import MAPA_DZIEDZIN, PozaDziedzinami, dziedziny_rodzaju
from solver_input.contracts import SolverAnalysisType
from solver_input.v126_contracts import V126AnalysisType
from werdykt.kontrakt import DziedzinaFizyki

ENUMY: tuple[type[Enum], ...] = (
    ExecutionAnalysisType,
    V126AnalysisType,
    SolverAnalysisType,
    EligibilityAnalysisType,
    DiagnostykaAnalysisType,
)


def _wartosci() -> set[str]:
    return {str(czlon.value) for enum in ENUMY for czlon in enum}


def test_kazda_wartosc_kazdego_enumu_ma_wpis() -> None:
    brak = sorted(_wartosci() - set(MAPA_DZIEDZIN))
    assert not brak, f"rodzaje analizy bez wpisu w mapie dziedzin: {brak}"


def test_mapa_nie_ma_martwych_kluczy() -> None:
    martwe = sorted(set(MAPA_DZIEDZIN) - _wartosci())
    assert not martwe, f"klucze mapy bez wartości w żadnym enumie: {martwe}"


def test_wpisy_sa_posortowanymi_krotkami_dziedzin_albo_powodem() -> None:
    dziedziny = set(get_args(DziedzinaFizyki))
    for rodzaj, wpis in MAPA_DZIEDZIN.items():
        if isinstance(wpis, PozaDziedzinami):
            assert wpis.powod_pl.strip(), rodzaj
            continue
        assert wpis, f"{rodzaj}: pusta krotka dziedzin"
        assert set(wpis) <= dziedziny, rodzaj
        assert list(wpis) == sorted(set(wpis)), f"{rodzaj}: krotka nieposortowana/powtórzona"


def test_wpisy_nazwane_w_karcie() -> None:
    assert dziedziny_rodzaju("power_quality_harmonics") == ("HARMONIC_FREQUENCY_DOMAIN",)
    assert dziedziny_rodzaju("ssci_impedance") == ("HARMONIC_FREQUENCY_DOMAIN",)
    assert dziedziny_rodzaju("SC_3F") == ("SHORT_CIRCUIT",)
    assert dziedziny_rodzaju("LOAD_FLOW") == ("POWER_FLOW",)
    assert dziedziny_rodzaju("DYNAMIKA_RMS") == ("RMS_DYNAMICS",)
    for rodzaj in ("insulation_coordination", "transient_trv"):
        wpis = dziedziny_rodzaju(rodzaj)
        assert isinstance(wpis, PozaDziedzinami)
        assert "przebieg chwilowy" in wpis.powod_pl
    niezawodnosc = dziedziny_rodzaju("reliability_contingency")
    assert isinstance(niezawodnosc, PozaDziedzinami)
    assert "statystyka niezawodności" in niezawodnosc.powod_pl


def test_rodzaj_spoza_mapy_to_odmowa_nazwana() -> None:
    try:
        dziedziny_rodzaju("NIEISTNIEJACY")
    except KeyError as blad:
        assert "nie ma wpisu w mapie dziedzin" in str(blad)
    else:  # pragma: no cover — obrona testu
        raise AssertionError("rodzaj spoza mapy nie może dostać domyślnej dziedziny")
