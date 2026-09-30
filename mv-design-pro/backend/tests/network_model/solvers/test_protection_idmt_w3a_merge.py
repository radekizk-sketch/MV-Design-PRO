"""W3-A — konwergencja rodziny A (IDMT) do rdzenia IEC 60255, stan po karcie
BIEG-ZABEZPIECZEN-Z-MODELU.

`network_model.solvers.protection_iec60255` jest JEDYNĄ fizyką krzywych IDMT. Dwa dawne
adaptery z tego pliku zniknęły razem ze swoimi torami: `application.protection_analysis.
engine.compute_iec_inverse_time` (bieg `protection_sn` na syntetycznym urządzeniu z szablonu
przypadku) i `enm.domain_operations_v2._compute_tcc_point` (zepsuta operacja
`validate_selectivity` — pary z kolejności listy, prąd 10 × nastawa). Ocena zabezpieczeń
ma JEDNĄ ścieżkę: `application.analyses.protection.ocena_nadpradowa.czas_stopnia`.

Ten plik dowodzi dla tej ścieżki tego samego, czego dowodził dla adapterów:
  1. czas jest ZGODNY z formułą normy (podstawienie ręczne `t = TMS·A/(M^B − 1)`),
  2. ścieżka FAKTYCZNIE deleguje do rdzenia (monitorowanie wywołań),
  3. iloczyn cech: krzywa (NI/VI/EI/LTI) × M ≤ 1 (brak zadziałania) × M → 1+ ×
     TMS skrajne (0,01 … 10,0).
"""

from __future__ import annotations

import math
from unittest.mock import patch

import pytest
from application.analyses.protection import ocena_nadpradowa
from application.analyses.protection.ocena_nadpradowa import StopienNastaw, czas_stopnia
from network_model.solvers import protection_iec60255 as core

#: (krzywa modelu, A, B) wg IEC 60255-151:2009 tab. 1 — IEC_LI ma stałe „RI" rdzenia.
NORM_CURVES = [
    ("IEC_SI", 0.14, 0.02),
    ("IEC_VI", 13.5, 1.0),
    ("IEC_EI", 80.0, 2.0),
    ("IEC_LI", 120.0, 1.0),
]
TMS_VALUES = [0.01, 0.05, 0.3, 1.0, 1.5, 10.0]
M_VALUES = [1.5, 2.0, 5.0, 10.0, 20.0]
IS_A = 100.0


def _stopien(krzywa: str, tms: float) -> StopienNastaw:
    return StopienNastaw(
        funkcja="overcurrent_51",
        krzywa=krzywa,
        wartosc_progu=IS_A,
        jednostka_progu="A_PIERWOTNY",
        prog_wtorny_a=1.0,
        prog_pierwotny_a=IS_A,
        tms=tms,
        zwloka_s=None,
        slad={},
    )


def _norm_formula(tms: float, a: float, b: float, m: float) -> float:
    """t = TMS·A/(M^B − 1) — wzór WPROST z IEC 60255-151:2009 tab. 1."""
    return tms * a / (math.pow(m, b) - 1.0)


@pytest.mark.parametrize(("krzywa", "a", "b"), NORM_CURVES)
@pytest.mark.parametrize("tms", TMS_VALUES)
@pytest.mark.parametrize("m", M_VALUES)
def test_czas_stopnia_zgodny_z_formula_normy(
    krzywa: str, a: float, b: float, tms: float, m: float
) -> None:
    slad = czas_stopnia(_stopien(krzywa, tms), m * IS_A)
    # Rdzeń zaokrągla czas do 6 miejsc (determinizm).
    assert slad["t_s"] == pytest.approx(_norm_formula(tms, a, b, m), abs=1e-6)


def test_czas_stopnia_deleguje_do_rdzenia() -> None:
    with patch.object(
        ocena_nadpradowa, "compute_curve_trip_time", wraps=core.compute_curve_trip_time
    ) as spy_iec:
        czas_stopnia(_stopien("IEC_VI", 1.0), 5.0 * IS_A)
    assert spy_iec.call_count == 1
    with patch.object(
        ocena_nadpradowa,
        "compute_ieee_c37112_generic",
        wraps=core.compute_ieee_c37112_generic,
    ) as spy_ieee:
        czas_stopnia(_stopien("IEEE_VI", 1.0), 5.0 * IS_A)
    assert spy_ieee.call_count == 1


@pytest.mark.parametrize(("krzywa", "_a", "_b"), NORM_CURVES)
@pytest.mark.parametrize("m", [0.5, 1.0])
def test_brak_zadzialania_przy_m_nie_wiekszym_od_jedynki(
    krzywa: str, _a: float, _b: float, m: float
) -> None:
    slad = czas_stopnia(_stopien(krzywa, 1.0), m * IS_A)
    assert slad["zadziala"] is False
    assert slad["t_s"] is None


@pytest.mark.parametrize(("krzywa", "_a", "_b"), NORM_CURVES)
def test_m_tuz_powyzej_jedynki_daje_czas_skonczony(krzywa: str, _a: float, _b: float) -> None:
    """M → 1+: mianownik rdzenia ma podłogę — czas skończony, nie wyjątek ani brak."""
    slad = czas_stopnia(_stopien(krzywa, 1.0), (1.0 + 1e-12) * IS_A)
    assert slad["zadziala"] is True
    assert slad["t_s"] is not None and math.isfinite(slad["t_s"])
