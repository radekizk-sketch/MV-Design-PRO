"""Dziedzina fizyki rodzaju analizy — JEDNA mapa dla każdego wyniku (karta AB-H0 §0.13).

Każda wartość każdego enumu rodzaju analizy w produkcie (``ExecutionAnalysisType``,
``V126AnalysisType``, ``SolverAnalysisType``, ``domain.eligibility_models.AnalysisType``,
``diagnostics.models.AnalysisType``) ma tu wpis: krotkę dziedzin fizyki, w których wynik
jest ważny, ALBO ``PozaDziedzinami`` z powodem (przebieg chwilowy, statystyka
niezawodności, analiza wtórna wobec innego biegu). Test kompletności
(``tests/dziedziny/test_dziedzina_analizy.py``) jest zapadką: nowa wartość enumu bez wpisu
= czerwień. Liść nie importuje enumów (warstwy ``domain``/``solver_input``/``diagnostics``
leżą nad nim) — klucze to wartości tekstowe enumów, a parytet pilnuje test.

Pole ``dziedzina_fizyki`` w kopertach biegów API jest WYPROWADZANE z tej mapy i nie jest
zapisywane w ``ResultSetV1`` ani w wynikach FROZEN (sygnatury deterministyczne bez zmian).
Rekordy werdyktu (``ZakresWaznosci.rodzaj_analizy``) biorą wartość wyłącznie stąd.

IMPORTY: stdlib, pydantic, ``werdykt.kontrakt``, ``dziedziny.kanon``.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType

from dziedziny.kanon import KontraktDziedziny
from werdykt.kontrakt import DziedzinaFizyki, Tekst


class PozaDziedzinami(KontraktDziedziny):
    """Rodzaj analizy, którego wynik nie należy do żadnej z sześciu dziedzin produktu."""

    powod_pl: Tekst


_PRZEBIEG_CHWILOWY = PozaDziedzinami(
    powod_pl="przebieg chwilowy (dziedzina czasu EMT) — poza sześcioma dziedzinami produktu"
)
_ANALIZA_WTORNA = PozaDziedzinami(
    powod_pl=(
        "analiza wtórna wobec innych biegów — dziedzina wyniku jest dziedziną analizy "
        "bazowej, nie tej analizy"
    )
)

#: Wartość tekstowa rodzaju analizy → dziedziny fizyki (krotka posortowana) albo powód.
MAPA_DZIEDZIN: Mapping[str, tuple[DziedzinaFizyki, ...] | PozaDziedzinami] = MappingProxyType(
    {
        # --- ExecutionAnalysisType, eligibility AnalysisType, diagnostics AnalysisType ---
        "SC_3F": ("SHORT_CIRCUIT",),
        # Zwarcia niesymetryczne liczone metodą składowych symetrycznych (Z₁, Z₂, Z₀).
        "SC_1F": ("SEQUENCE_DOMAIN", "SHORT_CIRCUIT"),
        "SC_2F": ("SEQUENCE_DOMAIN", "SHORT_CIRCUIT"),
        "SC_2F_G": ("SEQUENCE_DOMAIN", "SHORT_CIRCUIT"),
        "LOAD_FLOW": ("POWER_FLOW",),
        "LF": ("POWER_FLOW",),
        # Rozpływ niesymetryczny (fazowy) z asymetrią wyrażaną w składowych.
        "PF_UNBALANCED": ("POWER_FLOW", "SEQUENCE_DOMAIN"),
        # Stan fazowy SN — wartości fazowe A/B/C w stanie ustalonym scenariusza radialnego.
        "PHASE_STATE_SN": ("POWER_FLOW", "SEQUENCE_DOMAIN"),
        "DYNAMIC_STABILITY": ("RMS_DYNAMICS",),
        "DYNAMIKA_RMS": ("RMS_DYNAMICS",),
        # Koordynacja zabezpieczeń nadprądowych — czasy zadziałania z prądów zwarciowych.
        "PROTECTION": ("SHORT_CIRCUIT",),
        # Pętla zwarcia nN (IEC 60364-4-41) i samoczynne wyłączenie zasilania.
        "FAULT_LOOP_NN": ("SHORT_CIRCUIT",),
        "SWZ_NN": ("SHORT_CIRCUIT",),
        # --- SolverAnalysisType ---
        "short_circuit_3f": ("SHORT_CIRCUIT",),
        "short_circuit_1f": ("SEQUENCE_DOMAIN", "SHORT_CIRCUIT"),
        "load_flow": ("POWER_FLOW",),
        "protection": ("SHORT_CIRCUIT",),
        # --- V126AnalysisType ---
        "power_quality_harmonics": ("HARMONIC_FREQUENCY_DOMAIN",),
        "ssci_impedance": ("HARMONIC_FREQUENCY_DOMAIN",),
        # Krzywe PV/QV — ciąg rozpływów quasi-statycznych.
        "voltage_stability": ("POWER_FLOW",),
        "reliability_contingency": PozaDziedzinami(
            powod_pl="statystyka niezawodności — wskaźniki probabilistyczne, nie wielkość fizyczna"
        ),
        # Napięcia rażeniowe z prądu zwarcia doziemnego (składowa zerowa).
        "earthing_safety": ("SEQUENCE_DOMAIN", "SHORT_CIRCUIT"),
        "insulation_coordination": _PRZEBIEG_CHWILOWY,
        # Detekcja zwarć doziemnych w sieci SN — wielkości składowej zerowej.
        "earth_fault_detection": ("SEQUENCE_DOMAIN",),
        "transient_trv": _PRZEBIEG_CHWILOWY,
        # Rozruch silnika — zapad napięcia w stanie quasi-ustalonym (impedancja zahamowania).
        "motor_starting": ("POWER_FLOW",),
        "hosting_capacity": ("POWER_FLOW",),
        "opf_loss_lcc": ("POWER_FLOW",),
        "benchmark_validation": _ANALIZA_WTORNA,
        "uncertainty_sensitivity": _ANALIZA_WTORNA,
        # Dobór punktu neutralnego — prąd pojemnościowy doziemny (składowa zerowa).
        "neutral_earthing_design": ("SEQUENCE_DOMAIN",),
    }
)


def dziedziny_rodzaju(rodzaj: str) -> tuple[DziedzinaFizyki, ...] | PozaDziedzinami:
    """Dziedziny fizyki rodzaju analizy albo powód „poza dziedzinami".

    Rodzaj spoza mapy = odmowa nazwana (``KeyError``) — nigdy domyślna dziedzina.
    """
    try:
        return MAPA_DZIEDZIN[rodzaj]
    except KeyError:
        raise KeyError(
            f"Rodzaj analizy {rodzaj!r} nie ma wpisu w mapie dziedzin fizyki — dopisz wpis "
            "(dziedziny albo powód „poza dziedzinami”) w dziedziny/dziedzina_analizy.py."
        ) from None


__all__ = ["MAPA_DZIEDZIN", "PozaDziedzinami", "dziedziny_rodzaju"]
