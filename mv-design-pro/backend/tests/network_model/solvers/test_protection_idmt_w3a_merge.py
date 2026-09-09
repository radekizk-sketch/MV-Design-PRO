"""W3-A — konwergencja rodziny A (IDMT) do jądra `compute_idmt_generic`.

`network_model.solvers.protection_iec60255` jest JEDYNĄ fizyką krzywych IDMT
(silnik `compute_idmt_generic`); karta P0.7 (`f4a822bb`) już scaliła
`protection.curves.{iec,ieee}_curves` (patrz `test_protection_curves_nd4_merge.py`).
Ten plik dowodzi TEGO SAMEGO dla dwóch POZOSTAŁYCH żywych konsumentów
skonsolidowanych kartą W3-A:

  - `application.protection_analysis.engine.compute_iec_inverse_time`
    (tor kanoniczny `protection_sn` — jedyny realny tor biegu ochrony)
  - `enm.domain_operations_v2._compute_tcc_point`
    (operacja domenowa `validate_selectivity`; alias lokalny "LTI" = "RI"
    jądra — te same stałe K=120,0/alpha=1,0, inna nazwa historyczna)

Trzy rzeczy razem, dla OBU adapterów:

  1. Wartości liczbowe punktów krzywych IDMT są ZGODNE z formułą normy
     (podstawienie ręczne — `t = TMS*A/(M^B-1)`, IEC 60255-151:2009 Tabela 1 —
     nie porównanie dwóch implementacji ze sobą).
  2. Adaptery FAKTYCZNIE delegują do generycznego silnika (dowód przez
     monitorowanie wywołań, jak `test_protection_curves_nd4_merge.py`).
  3. Iloczyn cech (KLASA NIE INSTANCJA, CLAUDE.md): krzywa (NI/VI/EI/RI) ×
     M <= 1 (brak wyzwolenia) × M -> 1+ (epsilon graniczny mianownika) × TMS
     skrajne (0,01 .. 10,0) — nie tylko przykład z karty.
"""

from __future__ import annotations

import math
from unittest.mock import patch

# Import PRZED `enm.domain_operations_v2`: `enm/domain_operations.py` (linia
# ~10326) i `enm/domain_operations_v2.py` (linia ~43) importuja sie WZAJEMNIE
# (dlug preegzystujacy, nie wprowadzony karta W3-A) — modul `domain_operations`
# musi zdazyc dojsc do WLASNEGO konca (gdzie dopiero importuje `_v2`) zanim
# `domain_operations_v2` sam zacznie sie ladowac, inaczej `from enm import
# domain_operations_v2` jako PIERWSZY dotyk `enm.*` w procesie konczy sie
# `ImportError: cannot import name 'ALL_V2_HANDLERS' from partially
# initialized module` (potwierdzone w izolacji tego pliku bez tej linii).
import enm.domain_operations  # noqa: F401,E402
import pytest
from application.protection_analysis import engine as pa_engine  # noqa: E402
from application.protection_analysis.engine import compute_iec_inverse_time  # noqa: E402
from enm import domain_operations_v2  # noqa: E402
from network_model.solvers import protection_iec60255 as core  # noqa: E402

# (A, B) per IEC 60255-151:2009 Tabela 1 — NI/VI/EI, i RI (alias lokalny "LTI"
# w domain_operations_v2.IEC_CURVES).
NORM_CURVES = [
    ("NI", 0.14, 0.02),
    ("VI", 13.5, 1.0),
    ("EI", 80.0, 2.0),
    ("RI", 120.0, 1.0),
]
# Klucze lokalne odpowiadające NORM_CURVES w enm.domain_operations_v2.IEC_CURVES
# (alias "LTI" = "RI" jądra — udokumentowany w komentarzu przy IEC_CURVES).
TCC_CURVE_KEYS = ["SI", "VI", "EI", "LTI"]

TMS_VALUES = [0.01, 0.05, 0.3, 1.0, 1.5, 10.0]  # skrajne wlaczone (0.01, 10.0)
M_VALUES = [1.5, 2.0, 5.0, 10.0, 20.0]


def _norm_formula(tms: float, a: float, b: float, m: float) -> float:
    """t = TMS * A / (M^B - 1) — wzor WPROST z IEC 60255-151:2009 Tabela 1,
    podstawiony recznie (nie przez wywolanie zadnej implementacji z repo)."""
    return tms * a / (math.pow(m, b) - 1.0)


# =============================================================================
# 1. WARTOŚCI LICZBOWE — wzór wprost z normy, nie z implementacji
# =============================================================================


@pytest.mark.parametrize(("_name", "a", "b"), NORM_CURVES)
@pytest.mark.parametrize("tms", TMS_VALUES)
@pytest.mark.parametrize("m", M_VALUES)
def test_compute_iec_inverse_time_matches_norm_formula(
    _name: str, a: float, b: float, tms: float, m: float
) -> None:
    """`protection_analysis.engine.compute_iec_inverse_time` (tor kanoniczny
    protection_sn) — podstawienie do wzoru normy."""
    pickup = 100.0
    i_fault = pickup * m
    expected = round(_norm_formula(tms, a, b, m), 6)  # funkcja zaokragla do 6 mc (determinizm)

    result = compute_iec_inverse_time(i_fault_a=i_fault, i_pickup_a=pickup, tms=tms, a=a, b=b)

    assert result == pytest.approx(expected, rel=1e-9)


@pytest.mark.parametrize("curve_key, norm", zip(TCC_CURVE_KEYS, NORM_CURVES, strict=True))
@pytest.mark.parametrize("tms", TMS_VALUES)
@pytest.mark.parametrize("m", M_VALUES)
def test_compute_tcc_point_matches_norm_formula(curve_key, norm, tms: float, m: float) -> None:
    """`domain_operations_v2._compute_tcc_point` (operacja validate_selectivity)
    — podstawienie do wzoru normy. Funkcja NIE zaokragla wyniku (w
    odroznieniu od compute_iec_inverse_time) — zachowanie sprzed W3-A."""
    _name, a, b = norm
    expected = _norm_formula(tms, a, b, m)

    result = domain_operations_v2._compute_tcc_point(m, tms, curve_key)

    assert result == pytest.approx(expected, rel=1e-9)


# =============================================================================
# 2. DOWÓD DELEGACJI — adaptery WOŁAJĄ generyczny silnik, nie liczą lokalnie
# =============================================================================


def test_compute_iec_inverse_time_delegates_to_generic_engine() -> None:
    with patch.object(pa_engine, "compute_idmt_generic", wraps=core.compute_idmt_generic) as spy:
        compute_iec_inverse_time(i_fault_a=500.0, i_pickup_a=100.0, tms=1.0, a=13.5, b=1.0)
    spy.assert_called_once()
    _, kwargs = spy.call_args
    assert kwargs["a"] == 13.5
    assert kwargs["b"] == 1.0
    assert kwargs["is_pickup_a"] == 100.0
    assert kwargs["i_fault_a"] == 500.0
    assert kwargs["denom_guard"] == 1e-10


def test_compute_tcc_point_delegates_to_generic_engine() -> None:
    with patch.object(
        domain_operations_v2, "compute_idmt_generic", wraps=core.compute_idmt_generic
    ) as spy:
        domain_operations_v2._compute_tcc_point(5.0, 1.0, "VI")
    spy.assert_called_once()
    _, kwargs = spy.call_args
    assert kwargs["a"] == 13.5
    assert kwargs["b"] == 1.0
    # `_compute_tcc_point` dostaje juz GOTOWY stosunek `i_ratio` (nie prady
    # bezwzgledne) — do jadra przekazywane jest is_pickup_a=1.0, wiec
    # M = i_fault_a/1.0 = i_ratio bez zmiany fizyki.
    assert kwargs["is_pickup_a"] == 1.0
    assert kwargs["i_fault_a"] == 5.0
    assert kwargs["denom_guard"] == 1e-10


def test_validate_selectivity_operation_uses_compute_tcc_point() -> None:
    """`validate_selectivity` (operacja domenowa, jedyny wołający
    `_compute_tcc_point` w produkcji) faktycznie ćwiczy skonsolidowaną ścieżkę
    — nie tylko funkcja pomocnicza w izolacji."""
    enm: dict = {
        "protection_assignments": [
            {
                "ref_id": "REL-DOWN",
                "settings": {"Ipickup_a": 100.0, "time_dial": 0.3, "curve_type": "SI"},
            },
            {
                "ref_id": "REL-UP",
                "settings": {"Ipickup_a": 100.0, "time_dial": 0.6, "curve_type": "SI"},
            },
        ]
    }
    with patch.object(
        domain_operations_v2, "compute_idmt_generic", wraps=core.compute_idmt_generic
    ) as spy:
        result = domain_operations_v2.validate_selectivity(enm, {"test_current_a": 1000.0})
    assert spy.call_count == 2  # downstream + upstream
    selectivity_results = result["snapshot"]["meta"]["selectivity_results"]
    assert len(selectivity_results) == 1
    assert selectivity_results[0]["t_downstream_s"] > 0
    assert selectivity_results[0]["t_upstream_s"] > selectivity_results[0]["t_downstream_s"]


# =============================================================================
# 3. ILOCZYN CECH — krzywa × M<=1 (brak wyzwolenia) × M->1+ (epsilon) × TMS
# =============================================================================


@pytest.mark.parametrize(("_name", "a", "b"), NORM_CURVES)
@pytest.mark.parametrize("m", [0.1, 0.5, 1.0])
def test_compute_iec_inverse_time_no_trip_at_or_below_pickup(
    _name: str, a: float, b: float, m: float
) -> None:
    pickup = 100.0
    result = compute_iec_inverse_time(i_fault_a=pickup * m, i_pickup_a=pickup, tms=1.0, a=a, b=b)
    assert result is None


@pytest.mark.parametrize("curve_key", TCC_CURVE_KEYS)
@pytest.mark.parametrize("m", [0.1, 0.5, 1.0])
def test_compute_tcc_point_no_trip_at_or_below_pickup(curve_key: str, m: float) -> None:
    assert domain_operations_v2._compute_tcc_point(m, 1.0, curve_key) is None


@pytest.mark.parametrize(("_name", "a", "b"), NORM_CURVES)
def test_compute_iec_inverse_time_m_to_one_plus_epsilon_floors_not_none(
    _name: str, a: float, b: float
) -> None:
    """M tuz nad progiem (1 + 1e-12, ponizej denom_guard=1e-10) — PO W3-A
    zwraca skonczona, dluga wartosc (floor), NIE None. PRZED W3-A ten
    adapter mial WLASNY test `denominator <= 0: return None` (bez floora) —
    to jest UDOKUMENTOWANA zmiana zachowania w tej wąskiej, fizycznie
    nierealnej szczelinie (patrz komentarz w compute_iec_inverse_time i
    meldunek karty), zamierzona bo ujednolica epsilon ze wszystkimi innymi
    konsumentami tej samej fizyki."""
    pickup = 100.0
    epsilon_m = 1.0 + 1e-12
    result = compute_iec_inverse_time(
        i_fault_a=pickup * epsilon_m, i_pickup_a=pickup, tms=1.0, a=a, b=b
    )
    assert result is not None
    assert math.isfinite(result)
    assert result == pytest.approx(round(a / 1e-10, 6), rel=1e-6)


@pytest.mark.parametrize("curve_key, norm", zip(TCC_CURVE_KEYS, NORM_CURVES, strict=True))
def test_compute_tcc_point_m_to_one_plus_epsilon_floors_not_none(curve_key, norm) -> None:
    """Jak wyżej, dla `_compute_tcc_point` — PRZED W3-A miała TEN SAM brak
    floora (`denominator <= 0: return None`)."""
    _name, a, _b = norm
    epsilon_m = 1.0 + 1e-12
    result = domain_operations_v2._compute_tcc_point(epsilon_m, 1.0, curve_key)
    assert result is not None
    assert math.isfinite(result)
    assert result == pytest.approx(a / 1e-10, rel=1e-6)


@pytest.mark.parametrize("curve_key, norm", zip(TCC_CURVE_KEYS, NORM_CURVES, strict=True))
def test_engine_and_tcc_point_agree_at_epsilon_boundary_after_consolidation(
    curve_key, norm
) -> None:
    """Dowod ZBIEŻNOŚCI: PRZED kartą W3-A `protection_analysis/engine.py` i
    `domain_operations_v2._compute_tcc_point` miały każdy WŁASNY, ale ZA TO
    ZGODNY MIĘDZY SOBĄ epsilon (`denominator <= 0: return None`, bez floora)
    — RÓŻNY od kanonu/`iec_curves.py` (floor=1e-10). Rodzina A dawała więc
    DWA różne progi „brak wyzwolenia" na 4 konsumentów (patrz raport
    inwentarza). PO W3-A oba dzielą floor=1e-10 z kanonem — WSZYSTKIE żywe
    tory zgadzają się na TYM SAMYM progu."""
    _name, a, b = norm
    pickup = 100.0
    epsilon_m = 1.0 + 1e-12

    t_engine = compute_iec_inverse_time(
        i_fault_a=pickup * epsilon_m, i_pickup_a=pickup, tms=1.0, a=a, b=b
    )
    t_tcc = domain_operations_v2._compute_tcc_point(epsilon_m, 1.0, curve_key)

    assert t_engine is not None and t_tcc is not None
    assert t_engine == pytest.approx(t_tcc, rel=1e-6)


@pytest.mark.parametrize("tms_extreme", [0.01, 10.0])
def test_compute_iec_inverse_time_extreme_tms_matches_norm(tms_extreme: float) -> None:
    pickup = 100.0
    m = 5.0
    a, b = 0.14, 0.02
    expected = round(_norm_formula(tms_extreme, a, b, m), 6)
    result = compute_iec_inverse_time(
        i_fault_a=pickup * m, i_pickup_a=pickup, tms=tms_extreme, a=a, b=b
    )
    assert result == pytest.approx(expected, rel=1e-9)


@pytest.mark.parametrize("tms_extreme", [0.01, 10.0])
def test_compute_tcc_point_extreme_tms_matches_norm(tms_extreme: float) -> None:
    m = 5.0
    a, b = 0.14, 0.02
    expected = _norm_formula(tms_extreme, a, b, m)
    result = domain_operations_v2._compute_tcc_point(m, tms_extreme, "SI")
    assert result == pytest.approx(expected, rel=1e-9)


# =============================================================================
# 4. ALIAS "LTI" (lokalny) = "RI" (jądro) — te same stałe, inna nazwa
# =============================================================================


def test_lti_alias_matches_ri_constants_in_canonical_table() -> None:
    """`enm.domain_operations_v2.IEC_CURVES["LTI"]` (K=120,0, alpha=1,0) musi
    zgadzać się LICZBOWO z `IEC60255_CURVE_PARAMS[RI]` w jądrze — to JEDNA
    fizyka pod dwiema nazwami, nie dwie niezależne stałe, które „dziś się
    zgadzają" (reguła KLASA NIE INSTANCJA, predykaty parami)."""
    lti = domain_operations_v2.IEC_CURVES["LTI"]
    ri_a, ri_b = core.IEC60255_CURVE_PARAMS[core.IEC60255CurveType.RI]
    assert lti["K"] == ri_a
    assert lti["alpha"] == ri_b
