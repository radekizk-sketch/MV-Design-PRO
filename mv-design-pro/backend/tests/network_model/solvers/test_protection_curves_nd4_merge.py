"""N-D4 — scalenie dwóch ścieżek fizyki krzywych IDMT (karta P0.7, §0.1).

`network_model.solvers.protection_iec60255` jest JEDYNĄ fizyką krzywych IDMT
(silnik `compute_idmt_generic`/`compute_ieee_c37112_generic`);
`protection.curves.{iec,ieee}_curves` są cienkimi adapterami delegującymi do
niej. Ten plik dowodzi DWÓCH rzeczy razem (test 5 karty P0.7):

  1. Wartości liczbowe punktów krzywych IDMT są NIEZMIENIONE względem
     formuły normy (porównanie z ręcznym podstawieniem do wzoru — nie z
     implementacją) dla obu adapterów (IEC, IEEE).
  2. Adaptery FAKTYCZNIE delegują do generycznego silnika (dowód przez
     monitorowanie wywołań) — nie reimplementują pętli lokalnie.
"""

from __future__ import annotations

import math
from unittest.mock import patch

import pytest
from network_model.solvers import protection_iec60255 as core
from protection.curves import iec_curves, ieee_curves
from protection.curves.iec_curves import IECCurveParams, IECCurveType, calculate_iec_tripping_time
from protection.curves.ieee_curves import (
    IEEECurveParams,
    IEEECurveType,
    calculate_ieee_tripping_time,
)

# =============================================================================
# 1. WARTOŚCI LICZBOWE — wzór wprost z normy, nie z implementacji
# =============================================================================


@pytest.mark.parametrize(
    ("curve_type", "a", "b"),
    [
        (IECCurveType.STANDARD_INVERSE, 0.14, 0.02),
        (IECCurveType.VERY_INVERSE, 13.5, 1.0),
        (IECCurveType.EXTREMELY_INVERSE, 80.0, 2.0),
        (IECCurveType.LONG_TIME_INVERSE, 120.0, 1.0),
    ],
)
@pytest.mark.parametrize("tms", [0.1, 0.5, 1.0, 2.0])
@pytest.mark.parametrize("m", [2.0, 5.0, 10.0])
def test_iec_adapter_matches_norm_formula(
    curve_type: IECCurveType, a: float, b: float, tms: float, m: float
) -> None:
    """t = TMS * A / (M^B - 1) — wzór IEC 60255-151:2009 Tabela 1, podstawiony
    wprost (nie przez wywołanie implementacji), porównany z adapterem."""
    pickup = 100.0
    i_fault = pickup * m
    expected = tms * a / (math.pow(m, b) - 1.0)

    params = IECCurveParams.get_standard_params(curve_type)
    result = calculate_iec_tripping_time(
        fault_current_a=i_fault,
        pickup_current_a=pickup,
        curve_params=params,
        time_multiplier=tms,
    )
    assert result.tripping_time_s == pytest.approx(expected, rel=1e-9)


@pytest.mark.parametrize(
    ("curve_type", "a", "b", "p"),
    [
        (IEEECurveType.MODERATELY_INVERSE, 0.0515, 0.114, 0.02),
        (IEEECurveType.VERY_INVERSE, 19.61, 0.491, 2.0),
        (IEEECurveType.EXTREMELY_INVERSE, 28.2, 0.1217, 2.0),
        (IEEECurveType.SHORT_TIME_INVERSE, 0.00342, 0.00262, 0.02),
    ],
)
@pytest.mark.parametrize("td", [0.1, 0.5, 1.0, 2.0])
@pytest.mark.parametrize("m", [2.0, 5.0, 10.0])
def test_ieee_adapter_matches_norm_formula(
    curve_type: IEEECurveType, a: float, b: float, p: float, td: float, m: float
) -> None:
    """t = TD * (A / (M^p - 1) + B) — wzór IEEE C37.112-2018, podstawiony
    wprost, porównany z adapterem (z uwzględnieniem clampu adaptera)."""
    pickup = 100.0
    i_fault = pickup * m
    expected_raw = td * (a / (math.pow(m, p) - 1.0) + b)
    expected = max(0.001, min(expected_raw, 1000.0))

    params = IEEECurveParams.get_standard_params(curve_type)
    result = calculate_ieee_tripping_time(
        fault_current_a=i_fault,
        pickup_current_a=pickup,
        curve_params=params,
        time_dial=td,
    )
    assert result.tripping_time_s == pytest.approx(expected, rel=1e-9)


# =============================================================================
# 2. DOWÓD DELEGACJI — adaptery WOŁAJĄ generyczny silnik, nie liczą lokalnie
# =============================================================================


def test_iec_adapter_delegates_to_generic_engine() -> None:
    with patch.object(iec_curves, "compute_idmt_generic", wraps=core.compute_idmt_generic) as spy:
        params = IECCurveParams.get_standard_params(IECCurveType.VERY_INVERSE)
        calculate_iec_tripping_time(
            fault_current_a=500.0,
            pickup_current_a=100.0,
            curve_params=params,
            time_multiplier=1.0,
        )
    spy.assert_called_once()
    _, kwargs = spy.call_args
    assert kwargs["a"] == 13.5
    assert kwargs["b"] == 1.0


def test_ieee_adapter_delegates_to_generic_engine() -> None:
    with patch.object(
        ieee_curves, "compute_ieee_c37112_generic", wraps=core.compute_ieee_c37112_generic
    ) as spy:
        params = IEEECurveParams.get_standard_params(IEEECurveType.VERY_INVERSE)
        calculate_ieee_tripping_time(
            fault_current_a=500.0,
            pickup_current_a=100.0,
            curve_params=params,
            time_dial=1.0,
        )
    spy.assert_called_once()
    _, kwargs = spy.call_args
    assert kwargs["a"] == 19.61
    assert kwargs["p"] == 2.0


def test_solver_compute_curve_trip_time_also_delegates_to_generic_engine() -> None:
    """`compute_curve_trip_time` (konsument solwerowy — czas_wylaczenia_galezi/pola)
    RÓWNIEŻ deleguje do generycznego silnika — TRZECI konsument, ta sama fizyka."""
    with patch.object(core, "compute_idmt_generic", wraps=core.compute_idmt_generic) as spy:
        core.compute_curve_trip_time(
            curve_type=core.IEC60255CurveType.NI,
            i_fault_a=500.0,
            is_pickup_a=100.0,
            tms=1.0,
        )
    spy.assert_called_once()


# =============================================================================
# 3. RÓWNOWAŻNOŚĆ TRZECH KONSUMENTÓW — te same stałe (A,B) dają IDENTYCZNY
#    punkt krzywej niezależnie od tego, który z trzech konsumentów pyta.
# =============================================================================


@pytest.mark.parametrize("m", [1.5, 2.0, 5.0, 20.0])
def test_solver_and_iec_adapter_agree_on_equivalent_curve_ni_si(m: float) -> None:
    """NI (solver) i SI (adapter) mają IDENTYCZNE stałe (0,14; 0,02) — muszą
    dać ten sam punkt krzywej (dowód, że to JEDNA fizyka pod dwiema nazwami)."""
    pickup = 100.0
    i_fault = pickup * m

    solver_result = core.compute_curve_trip_time(
        curve_type=core.IEC60255CurveType.NI,
        i_fault_a=i_fault,
        is_pickup_a=pickup,
        tms=1.0,
    )
    adapter_params = IECCurveParams.get_standard_params(IECCurveType.STANDARD_INVERSE)
    adapter_result = calculate_iec_tripping_time(
        fault_current_a=i_fault,
        pickup_current_a=pickup,
        curve_params=adapter_params,
        time_multiplier=1.0,
    )
    # Solver zaokrągla `calculated_time_s` do 6 miejsc (WHITE BOX prezentacja),
    # adapter nie zaokrągla (tylko clampuje) — porównanie z tolerancją
    # odpowiadającą temu zaokrągleniu, nie z pełną precyzją float.
    assert solver_result.calculated_time_s == pytest.approx(
        adapter_result.tripping_time_s, abs=5e-7, rel=1e-6
    )
