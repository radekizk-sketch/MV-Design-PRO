"""Testy solvera krzywych aparatów nN (karta P0.7, §0.2/G-07).

Wartości normatywne z TABLIC (IEC 60898-1 §9.10, IEC 60269-1), nie z
implementacji — test 1 karty P0.7. Test 2: pasmo, nie linia (zapytanie w
środku pasma zwraca nieoznaczoność). Determinizm: dwa wywołania z tymi
samymi argumentami dają identyczny wynik.
"""

from __future__ import annotations

import pytest
from network_model.catalog.lv_mcb_bands_iec60898 import PASMA_MAGNETYCZNE
from network_model.solvers import protection_lv_curves
from network_model.solvers.protection_lv_curves import (
    FUSE_GG_IF_MULTIPLIER,
    FUSE_GG_INF_MULTIPLIER,
    GwarancjaNormy,
    bramka_t_wymagany_gg_a,
    compute_fuse_gg_gate,
    compute_mcb_magnetic_point,
    compute_mcb_thermal_point,
    compute_mccb_point,
)

# =============================================================================
# MCB — próg cieplny (przeciążeniowy), IEC 60898-1 §9.10
# =============================================================================


class TestMcbThermal:
    def test_1_13_x_in_brak_wyzwolenia_gwarantowany(self) -> None:
        """1,13×In — norma gwarantuje BRAK zadziałania w czasie umownym."""
        r = compute_mcb_thermal_point(i_query_a=1.13 * 16.0, in_a=16.0)
        assert r.gwarancja == GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY

    def test_1_45_x_in_wyzwolenie_gwarantowane_do_63a_1h(self) -> None:
        """1,45×In dla In<=63A — zadziałanie gwarantowane w czasie umownym 1h."""
        r = compute_mcb_thermal_point(i_query_a=1.45 * 32.0, in_a=32.0)
        assert r.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        assert r.t_umowny_s == 3600.0

    def test_1_45_x_in_wyzwolenie_gwarantowane_powyzej_63a_2h(self) -> None:
        """1,45×In dla In>63A — zadziałanie gwarantowane w czasie umownym 2h."""
        r = compute_mcb_thermal_point(i_query_a=1.45 * 100.0, in_a=100.0)
        assert r.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        assert r.t_umowny_s == 7200.0

    def test_miedzy_progami_nieokreslony(self) -> None:
        """Prąd między 1,13×In a 1,45×In — pasmo, nie linia: nieoznaczoność."""
        r = compute_mcb_thermal_point(i_query_a=1.3 * 16.0, in_a=16.0)
        assert r.gwarancja == GwarancjaNormy.NIEOKRESLONY
        assert r.t_umowny_s is None

    def test_boundary_niezalezny_od_klasy_b_c_d(self) -> None:
        """Próg cieplny jest WSPÓLNY dla B/C/D — nie przyjmuje curve_class."""
        r1 = compute_mcb_thermal_point(i_query_a=1.45 * 16.0, in_a=16.0)
        assert r1.curve_class is None

    def test_raises_on_non_positive_in(self) -> None:
        with pytest.raises(ValueError):
            compute_mcb_thermal_point(i_query_a=10.0, in_a=0.0)

    def test_raises_on_negative_query(self) -> None:
        with pytest.raises(ValueError):
            compute_mcb_thermal_point(i_query_a=-1.0, in_a=16.0)


# =============================================================================
# MCB — pasmo magnetyczne (zwarciowe), IEC 60898-1 Tabela 3
# =============================================================================


@pytest.mark.parametrize(
    ("klasa", "min_x_in", "max_x_in"),
    [("B", 3.0, 5.0), ("C", 5.0, 10.0), ("D", 10.0, 20.0)],
)
class TestMcbMagneticBandEdges:
    def test_gorna_granica_wyzwolenie_gwarantowane(
        self, klasa: str, min_x_in: float, max_x_in: float
    ) -> None:
        r = compute_mcb_magnetic_point(i_query_a=max_x_in * 20.0, in_a=20.0, curve_class=klasa)
        assert r.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        assert r.t_umowny_s == pytest.approx(0.1)

    def test_ponizej_dolnej_granicy_brak_wyzwolenia(
        self, klasa: str, min_x_in: float, max_x_in: float
    ) -> None:
        r = compute_mcb_magnetic_point(
            i_query_a=(min_x_in - 0.5) * 20.0, in_a=20.0, curve_class=klasa
        )
        assert r.gwarancja == GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY

    def test_wewnatrz_pasma_nieokreslony(
        self, klasa: str, min_x_in: float, max_x_in: float
    ) -> None:
        """Pasmo, nie linia: środek pasma B/C/D zwraca nieoznaczoność (test 2)."""
        srodek = (min_x_in + max_x_in) / 2.0
        r = compute_mcb_magnetic_point(i_query_a=srodek * 20.0, in_a=20.0, curve_class=klasa)
        assert r.gwarancja == GwarancjaNormy.NIEOKRESLONY


def test_pasma_magnetyczne_reuse_lv_mcb_bands_iec60898() -> None:
    """REUSE — pasma pochodzą z `lv_mcb_bands_iec60898`, nie z lokalnej kopii."""
    for klasa, pasmo in PASMA_MAGNETYCZNE.items():
        r = compute_mcb_magnetic_point(
            i_query_a=pasmo.max_x_in * 10.0, in_a=10.0, curve_class=klasa
        )
        assert r.prog_gorny_a == pasmo.max_x_in * 10.0
        assert r.prog_dolny_a == pasmo.min_x_in * 10.0


def test_mcb_magnetic_unknown_class_raises() -> None:
    with pytest.raises(ValueError):
        compute_mcb_magnetic_point(i_query_a=100.0, in_a=16.0, curve_class="Z")


# =============================================================================
# FUSE_GG — bramki I-t, IEC 60269-1 (G-D2)
# =============================================================================


class TestFuseGgGate:
    def test_inf_brak_wyzwolenia_gwarantowany(self) -> None:
        """Inf=1,25×In — norma gwarantuje BRAK stopienia w czasie umownym."""
        r = compute_fuse_gg_gate(i_query_a=FUSE_GG_INF_MULTIPLIER * 63.0, in_a=63.0)
        assert r.gwarancja == GwarancjaNormy.BRAK_WYZWOLENIA_GWARANTOWANY
        assert r.t_umowny_s == 3600.0

    def test_if_wyzwolenie_gwarantowane(self) -> None:
        """If=1,6×In — norma gwarantuje stopienie w czasie umownym."""
        r = compute_fuse_gg_gate(i_query_a=FUSE_GG_IF_MULTIPLIER * 63.0, in_a=63.0)
        assert r.gwarancja == GwarancjaNormy.WYZWOLENIE_GWARANTOWANE
        assert r.t_umowny_s == 3600.0

    def test_miedzy_bramkami_nieokreslony(self) -> None:
        """Pasmo, nie linia: między Inf i If — nieoznaczoność (test 2)."""
        r = compute_fuse_gg_gate(i_query_a=1.4 * 63.0, in_a=63.0)
        assert r.gwarancja == GwarancjaNormy.NIEOKRESLONY

    @pytest.mark.parametrize(
        ("in_a", "t_umowny_s"),
        [
            (25.0, 3600.0),
            (63.0, 3600.0),
            (80.0, 7200.0),
            (160.0, 7200.0),
            (200.0, 10800.0),
            (250.0, 10800.0),
        ],
    )
    def test_czas_umowny_per_zakres_in(self, in_a: float, t_umowny_s: float) -> None:
        """Czasy umowne per zakres In — zgodnie z zakresem katalogu WKLADKA_NN (25-250A)."""
        r = compute_fuse_gg_gate(i_query_a=FUSE_GG_IF_MULTIPLIER * in_a, in_a=in_a)
        assert r.t_umowny_s == t_umowny_s

    def test_in_below_16a_out_of_verified_scope_raises(self) -> None:
        """Zakres In<=16A NIE jest zweryfikowany podwójnie w tej karcie — jawny błąd."""
        with pytest.raises(ValueError):
            compute_fuse_gg_gate(i_query_a=10.0, in_a=10.0)

    def test_raises_on_non_positive_in(self) -> None:
        with pytest.raises(ValueError):
            compute_fuse_gg_gate(i_query_a=10.0, in_a=0.0)

    def test_raises_on_negative_query(self) -> None:
        with pytest.raises(ValueError):
            compute_fuse_gg_gate(i_query_a=-1.0, in_a=63.0)

    def test_determinism_two_calls_identical(self) -> None:
        r1 = compute_fuse_gg_gate(i_query_a=90.0, in_a=63.0)
        r2 = compute_fuse_gg_gate(i_query_a=90.0, in_a=63.0)
        assert r1.to_dict() == r2.to_dict()


# =============================================================================
# MCCB_ELECTRONIC — klasyfikacja trójstopniowa (definite-time)
# =============================================================================


class TestMccbElectronic:
    def test_ponizej_ir_brak(self) -> None:
        r = compute_mccb_point(
            i_query_a=50.0, ir_a=100.0, isd_a=800.0, ii_a=1200.0, tr_s=10.0, tsd_s=0.1
        )
        assert r.stopien == "brak"
        assert r.t_wyzwolenia_s is None

    def test_dlugozwloczny(self) -> None:
        r = compute_mccb_point(
            i_query_a=150.0, ir_a=100.0, isd_a=800.0, ii_a=1200.0, tr_s=10.0, tsd_s=0.1
        )
        assert r.stopien == "dlugozwloczny"
        assert r.t_wyzwolenia_s == 10.0
        assert r.zalozenie_pl is not None  # ZALOZENIE definite-time nazwane wprost

    def test_krotkozwloczny(self) -> None:
        r = compute_mccb_point(
            i_query_a=900.0, ir_a=100.0, isd_a=800.0, ii_a=1200.0, tr_s=10.0, tsd_s=0.1
        )
        assert r.stopien == "krotkozwloczny"
        assert r.t_wyzwolenia_s == 0.1

    def test_zwarciowy_natychmiastowy(self) -> None:
        r = compute_mccb_point(
            i_query_a=1300.0, ir_a=100.0, isd_a=800.0, ii_a=1200.0, tr_s=10.0, tsd_s=0.1
        )
        assert r.stopien == "zwarciowy"
        assert r.t_wyzwolenia_s == 0.1

    def test_brak_nastawy_dlugozwlocznej_pasmo_nieznane(self) -> None:
        """Brak Ir/tr — pasmo NIEZNANE (zero fabrykacji domyślnego In)."""
        r = compute_mccb_point(
            i_query_a=150.0, ir_a=None, isd_a=None, ii_a=None, tr_s=None, tsd_s=None
        )
        assert r.stopien == "brak_danych"
        assert r.t_wyzwolenia_s is None

    def test_only_ir_tr_resolved(self) -> None:
        """Isd/Ii mogą być None — tylko stopień długozwłoczny oceniany."""
        r = compute_mccb_point(
            i_query_a=500.0, ir_a=100.0, isd_a=None, ii_a=None, tr_s=10.0, tsd_s=None
        )
        assert r.stopien == "dlugozwloczny"


# =============================================================================
# FUSE_GG — bramka przy t_wymagany dokładnym (karta D2, G-06 rozszerzenie)
# =============================================================================


class TestFuseGgBramkaTWymagany:
    def test_default_registry_empty_returns_none(self) -> None:
        """Rejestr domyślnie PUSTY (karta D2 §0 pkt 1b/1c — brak podwójnie
        zweryfikowanego źródła) — zero fabrykacji, nigdy zgadnięta wartość."""
        assert protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER == {}
        assert bramka_t_wymagany_gg_a(t_wymagany_s=0.4, in_a=25.0) is None
        assert bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=100.0) is None

    def test_injected_entry_resolves_absolute_current(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 5.0, 2.5)
        assert bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=100.0) == pytest.approx(250.0)
        # Inny czas, bez wpisu, wciąż None — bramka jest PER t_wymagany, nie
        # globalna dla wszystkich czasów naraz.
        assert bramka_t_wymagany_gg_a(t_wymagany_s=0.4, in_a=100.0) is None

    def test_removed_entry_reverts_to_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 5.0, 2.5)
        assert bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=100.0) is not None
        monkeypatch.delitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 5.0)
        assert bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=100.0) is None

    def test_in_a_must_be_positive(self) -> None:
        with pytest.raises(ValueError):
            bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=0.0)

    def test_determinism(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 5.0, 2.5)
        a = bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=100.0)
        b = bramka_t_wymagany_gg_a(t_wymagany_s=5.0, in_a=100.0)
        assert a == b
