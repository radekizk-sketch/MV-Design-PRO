"""Testy sanity-bounds rozpływu: napięcia, obciążenia gałęzi, straty — karta W3-G2.

Trzy pure-funkcje (``analysis.sanity_bounds.power_flow_bounds``), siostrzane wobec
``evaluate_short_circuit_current``: ten sam werdykt trójstanowy (w paśmie wiarygodności /
poza zakresem wiarygodności / dane niekompletne). Testy jako ILOCZYN CECH:
{napięcie w paśmie / poza} × {In katalogu obecne / brak} × {straty ≤ / >} —
oraz osobno test, że KAŻDA funkcja daje stan NAZWANY, nigdy werdykt, gdy dane
wejściowe są niekompletne/niefizyczne (brak fabrykacji z braku danych).
"""

from __future__ import annotations

import pytest
from analysis.obciazenie_galezi import obciazenie_galezi, prad_zacisku_od_a
from analysis.sanity_bounds.power_flow_bounds import (
    CREDIBLE,
    DOMYSLNY_PROG_STRAT_PROCENT,
    INCOMPLETE,
    NORMA_NAPIECIA_PL,
    OUT_OF_RANGE,
    PASMO_NAPIECIA_PROCENT,
    UZASADNIENIE_PROGU_STRAT_PL,
    evaluate_branch_loading,
    evaluate_bus_voltage,
    evaluate_network_losses,
)
from network_model.core.branch import BranchType, LineBranch

# =============================================================================
# 1. Napięcia szyn — Un ± 10 %
# =============================================================================


class TestBusVoltageBounds:
    def test_within_band_is_credible(self) -> None:
        v = evaluate_bus_voltage(15.0, 15.2)
        assert v.in_range is True
        assert v.status == CREDIBLE
        assert v.lower_kv == pytest.approx(13.5)
        assert v.upper_kv == pytest.approx(16.5)

    @pytest.mark.parametrize(
        "nominal_kv,actual_kv,in_range",
        [
            (15.0, 13.5, True),  # dolna granica włącznie
            (15.0, 16.5, True),  # górna granica włącznie
            (15.0, 13.499, False),  # tuż poniżej dolnej
            (15.0, 16.501, False),  # tuż powyżej górnej
            (0.4, 0.37, True),  # nN, w paśmie
            (0.4, 0.30, False),  # nN, poza pasmem (-25 %)
            (110.0, 121.0, True),  # WN, górna granica
            (110.0, 130.0, False),  # WN, poza pasmem
        ],
    )
    def test_band_edges(self, nominal_kv: float, actual_kv: float, in_range: bool) -> None:
        v = evaluate_bus_voltage(nominal_kv, actual_kv)
        assert v.in_range is in_range
        assert v.status == (CREDIBLE if in_range else OUT_OF_RANGE)

    def test_out_of_range_is_out_of_range_and_names_deviation(self) -> None:
        v = evaluate_bus_voltage(15.0, 20.0)
        assert v.in_range is False
        assert v.status == OUT_OF_RANGE
        assert v.deviation_pct == pytest.approx(33.3333, rel=1e-3)
        assert "wątpliwy" in v.why_pl

    @pytest.mark.parametrize(
        "nominal_kv,actual_kv",
        [(None, 15.0), (15.0, None), (0.0, 15.0), (-1.0, 15.0)],
    )
    def test_incomplete_inputs(self, nominal_kv: float | None, actual_kv: float | None) -> None:
        v = evaluate_bus_voltage(nominal_kv, actual_kv)
        assert v.status == INCOMPLETE
        assert v.in_range is False
        assert v.lower_kv is None and v.upper_kv is None

    def test_nan_inf_incomplete(self) -> None:
        assert evaluate_bus_voltage(15.0, float("inf")).status == INCOMPLETE
        assert evaluate_bus_voltage(15.0, float("nan")).status == INCOMPLETE
        assert evaluate_bus_voltage(float("nan"), 15.0).status == INCOMPLETE

    def test_determinism_and_serialization(self) -> None:
        a = evaluate_bus_voltage(15.0, 15.2).to_dict()
        b = evaluate_bus_voltage(15.0, 15.2).to_dict()
        assert a == b
        assert set(a.keys()) == {
            "nominal_kv",
            "actual_kv",
            "lower_kv",
            "upper_kv",
            "deviation_pct",
            "in_range",
            "status",
            "why_pl",
        }

    def test_norm_citation_and_band_are_named_constants(self) -> None:
        assert "PN-EN 50160" in NORMA_NAPIECIA_PL
        assert "10" in NORMA_NAPIECIA_PL
        assert PASMO_NAPIECIA_PROCENT == 10.0


# =============================================================================
# 2. Obciążenie gałęzi — prądy obu zacisków wobec prądów znamionowych zacisków
# =============================================================================
#
# Kanon od decyzji O-51 (klasa P9): wejściem oceny jest wynik JEDNEJ funkcji obciążenia
# (`analysis/obciazenie_galezi.py`), nie para (prąd jednej strony, In katalogu). Intencje
# dawnych testów zachowane: 25 % / 100 % / 125 % dla In = 400 A, granica włącznie, moduł
# prądu, brak In = stan nazwany (nigdy 0/inf), brak prądu = stan nazwany, NaN/inf = brak.
# Iloczyn rodzaj gałęzi × zacisk decydujący × próg — `test_obciazenie_zaciskow_miejsca.py`.


def _kabel_400a() -> LineBranch:
    return LineBranch(
        id="k1",
        name="Kabel k1",
        branch_type=BranchType.CABLE,
        from_node_id="a",
        to_node_id="b",
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.1,
        b_us_per_km=80.0,
        length_km=1.0,
        rated_current_a=400.0,
    )


def _ocena(prad_od_ka: float | None, prad_do_ka: float | None, *, in_a: float | None = 400.0):
    galaz = _kabel_400a()
    galaz.rated_current_a = in_a if in_a is not None else 0.0
    return evaluate_branch_loading(
        obciazenie_galezi(
            galaz,
            prad_od_a=prad_zacisku_od_a(prad_od_ka),
            prad_do_a=prad_zacisku_od_a(prad_do_ka),
        )
    )


class TestBranchLoadingBounds:
    def test_below_rated_current_is_credible(self) -> None:
        v = _ocena(0.1, 0.09)
        assert v.in_range is True
        assert v.status == CREDIBLE
        assert v.loading_pct == pytest.approx(25.0)
        assert v.zacisk_decydujacy == "od"

    def test_at_rated_current_is_credible(self) -> None:
        # In = 400 A = 0.4 kA — obciążenie DOKŁADNIE 100 % jest jeszcze wiarygodne
        # (granica włącznie, jak w short_circuit_bounds).
        v = _ocena(0.4, 0.39)
        assert v.in_range is True
        assert v.status == CREDIBLE
        assert v.loading_pct == 100.0

    def test_above_rated_current_is_out_of_range(self) -> None:
        v = _ocena(0.5, 0.49)
        assert v.in_range is False
        assert v.status == OUT_OF_RANGE
        assert v.loading_pct == pytest.approx(125.0)
        assert "wątpliwy" in v.why_pl

    def test_decyduje_zacisk_z_wiekszym_pradem(self) -> None:
        """Kabel z susceptancją: prąd strony `do` większy — ocena z NIEGO (dawniej
        wyłącznie strona `from`, co zaniżało obciążenie)."""
        v = _ocena(0.38, 0.42)
        assert v.zacisk_decydujacy == "do"
        assert v.status == OUT_OF_RANGE
        assert v.current_ka == pytest.approx(0.42)
        assert v.current_od_ka == pytest.approx(0.38)
        assert v.current_do_ka == pytest.approx(0.42)
        assert "zacisk do" in v.why_pl

    def test_negative_current_uses_magnitude(self) -> None:
        v = _ocena(-0.1, 0.09)
        assert v.in_range is True
        assert v.loading_pct == pytest.approx(25.0)

    @pytest.mark.parametrize("rated_current_a", [None, 0.0, -10.0])
    def test_missing_or_invalid_catalog_current_is_incomplete_not_zero_or_inf(
        self, rated_current_a: float | None
    ) -> None:
        """Brak In katalogu → stan NAZWANY, nigdy podstawienie 0/inf za brak danych."""
        v = _ocena(0.1, 0.1, in_a=rated_current_a)
        assert v.status == INCOMPLETE
        assert v.in_range is False
        assert v.loading_pct is None
        assert "znamionowego" in v.why_pl

    def test_missing_current_is_incomplete(self) -> None:
        v = _ocena(None, 0.1)
        assert v.status == INCOMPLETE
        assert v.loading_pct is None
        assert "prądu zacisku" in v.why_pl

    def test_nan_inf_current_incomplete(self) -> None:
        assert _ocena(float("inf"), 0.1).status == INCOMPLETE
        assert _ocena(float("nan"), 0.1).status == INCOMPLETE
        assert _ocena(0.1, float("nan")).status == INCOMPLETE

    def test_determinism_and_serialization(self) -> None:
        a = _ocena(0.1, 0.09).to_dict()
        b = _ocena(0.1, 0.09).to_dict()
        assert a == b
        assert set(a.keys()) == {
            "current_ka",
            "rated_current_a",
            "loading_pct",
            "in_range",
            "status",
            "why_pl",
            "zacisk_decydujacy",
            "current_od_ka",
            "current_do_ka",
            "rated_current_od_a",
            "rated_current_do_a",
        }


# =============================================================================
# 3. Straty czynne sieci — wobec sumy mocy czynnej odbiorów
# =============================================================================


class TestNetworkLossesBounds:
    def test_below_threshold_is_credible(self) -> None:
        v = evaluate_network_losses(0.2, 10.0)  # 2 %
        assert v.in_range is True
        assert v.status == CREDIBLE
        assert v.losses_pct_of_load == pytest.approx(2.0)
        assert v.threshold_pct == DOMYSLNY_PROG_STRAT_PROCENT

    def test_at_threshold_is_credible(self) -> None:
        v = evaluate_network_losses(1.0, 10.0)  # dokładnie 10 %
        assert v.in_range is True
        assert v.status == CREDIBLE

    def test_above_threshold_is_out_of_range(self) -> None:
        v = evaluate_network_losses(2.0, 10.0)  # 20 %
        assert v.in_range is False
        assert v.status == OUT_OF_RANGE
        assert "wątpliwy" in v.why_pl

    def test_explicit_threshold_parameter_overrides_default(self) -> None:
        """Próg jest JAWNYM parametrem — wywołujący może go nazwać inaczej niż
        domyślny (nie zaszyta stała bez źródła)."""
        v = evaluate_network_losses(0.5, 10.0, threshold_pct=3.0)  # 5 % > próg 3 %
        assert v.threshold_pct == 3.0
        assert v.in_range is False
        assert v.status == OUT_OF_RANGE

    @pytest.mark.parametrize(
        "losses_active_mw,load_active_total_mw",
        [(None, 10.0), (0.5, None), (None, None)],
    )
    def test_missing_inputs_are_incomplete_not_zero(
        self, losses_active_mw: float | None, load_active_total_mw: float | None
    ) -> None:
        v = evaluate_network_losses(losses_active_mw, load_active_total_mw)
        assert v.status == INCOMPLETE
        assert v.losses_pct_of_load is None
        assert v.in_range is False

    def test_zero_load_is_incomplete_not_division_error_or_zero_pct(self) -> None:
        v = evaluate_network_losses(0.1, 0.0)
        assert v.status == INCOMPLETE
        assert v.losses_pct_of_load is None

    def test_nan_inf_incomplete(self) -> None:
        assert evaluate_network_losses(float("nan"), 10.0).status == INCOMPLETE
        assert evaluate_network_losses(0.5, float("inf")).status == INCOMPLETE

    def test_threshold_rationale_is_always_present_never_bare_number(self) -> None:
        """Karta: 'próg jako JAWNY parametr z uzasadnieniem inżynierskim, nie
        zaszyta stała bez źródła' — uzasadnienie towarzyszy KAŻDEMU werdyktowi,
        także niekompletnemu."""
        for v in (
            evaluate_network_losses(0.2, 10.0),
            evaluate_network_losses(2.0, 10.0),
            evaluate_network_losses(None, None),
        ):
            assert v.threshold_why_pl == UZASADNIENIE_PROGU_STRAT_PL
            assert len(v.threshold_why_pl) > 20

    def test_determinism_and_serialization(self) -> None:
        a = evaluate_network_losses(0.2, 10.0).to_dict()
        b = evaluate_network_losses(0.2, 10.0).to_dict()
        assert a == b
        assert set(a.keys()) == {
            "losses_active_mw",
            "load_active_total_mw",
            "losses_pct_of_load",
            "threshold_pct",
            "threshold_why_pl",
            "in_range",
            "status",
            "why_pl",
        }


# =============================================================================
# Iloczyn cech jawny (DoD karty W3-G2): {napięcie w paśmie / poza} ×
# {In katalogu obecne / brak} × {straty ≤ / >} — trzy NIEZALEŻNE osie, każda
# funkcja czytana z osobna (predykaty parami: wejście warunkuje TYLKO własny
# werdykt, nigdy werdykt sąsiedniej osi — dowiedzione już na poziomie serwisu
# aplikacyjnego w test_sanity_bounds_service.py, tu — czyste kombinacje wejść).
# =============================================================================


@pytest.mark.parametrize("napiecie_w_pasmie", [True, False])
@pytest.mark.parametrize("in_katalogu_obecne", [True, False])
@pytest.mark.parametrize("straty_w_progu", [True, False])
def test_iloczyn_cech_trzech_niezaleznych_osi(
    napiecie_w_pasmie: bool,
    in_katalogu_obecne: bool,
    straty_w_progu: bool,
) -> None:
    napiecie = evaluate_bus_voltage(15.0, 15.2 if napiecie_w_pasmie else 25.0)
    obciazenie = _ocena(0.1, 0.09, in_a=400.0 if in_katalogu_obecne else None)
    straty = evaluate_network_losses(1.0 if straty_w_progu else 5.0, 10.0)

    assert napiecie.status == (CREDIBLE if napiecie_w_pasmie else OUT_OF_RANGE)
    assert obciazenie.status == (CREDIBLE if in_katalogu_obecne else INCOMPLETE)
    assert straty.status == (CREDIBLE if straty_w_progu else OUT_OF_RANGE)
