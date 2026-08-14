"""Testy rozwiązania nastaw regulacyjnych MCCB (karta D2, nN „runda 8", G-06
rozszerzenie). Formuła REUSE — jedno miejsce dla doboru kandydata
(`nn_device_selection.py`) i weryfikacji aparatu zainstalowanego
(`swz/service.py`, `proof_engine/lv_circuit_verification_binding.py`)."""

from __future__ import annotations

import pytest
from network_model.catalog.lv_mccb_settings_iec60947_2 import resolwuj_nastawy_mccb


class TestResolwujNastawyMccb:
    def test_all_ranges_present_resolve_to_upper_bound(self) -> None:
        ir_a, isd_a, ii_a, tr_s, tsd_s = resolwuj_nastawy_mccb(
            i_n_a=100.0,
            ir_range=(0.4, 1.0),
            isd_range=(1.5, 10.0),
            ii_range=(1.0, 15.0),
            tr_range=(2.0, 24.0),
            tsd_range=(0.05, 0.4),
        )
        assert ir_a == pytest.approx(100.0)  # 1,0 × 100
        assert isd_a == pytest.approx(1000.0)  # 10,0 × Ir(100) = 1000
        assert ii_a == pytest.approx(1500.0)  # 15,0 × 100
        assert tr_s == pytest.approx(24.0)
        assert tsd_s == pytest.approx(0.4)

    def test_accepts_list_form_json_roundtrip(self) -> None:
        """Materializacja serializuje zakresy jako listy 2-elementowe
        (`_float_range_to_list`), nie tuple — konsumowane identycznie."""
        ir_a, isd_a, ii_a, tr_s, tsd_s = resolwuj_nastawy_mccb(
            i_n_a=100.0,
            ir_range=[0.4, 1.0],
            isd_range=[1.5, 10.0],
            ii_range=[1.0, 15.0],
        )
        assert ir_a == pytest.approx(100.0)
        assert isd_a == pytest.approx(1000.0)
        assert ii_a == pytest.approx(1500.0)

    def test_missing_ir_range_gates_ir_and_isd(self) -> None:
        """Isd zależy łańcuchowo od Ir (Isd=isd_range[hi]×Ir) — brak Ir gasi
        Isd NAWET gdy isd_range jest podany."""
        ir_a, isd_a, ii_a, tr_s, tsd_s = resolwuj_nastawy_mccb(
            i_n_a=100.0,
            ir_range=None,
            isd_range=(1.5, 10.0),
            ii_range=(1.0, 15.0),
        )
        assert ir_a is None
        assert isd_a is None
        assert ii_a == pytest.approx(1500.0)  # ii_range zależy WYŁĄCZNIE od In

    def test_missing_ii_range_returns_none_ii_only(self) -> None:
        ir_a, isd_a, ii_a, tr_s, tsd_s = resolwuj_nastawy_mccb(
            i_n_a=100.0,
            ir_range=(0.4, 1.0),
            isd_range=(1.5, 10.0),
            ii_range=None,
        )
        assert ir_a == pytest.approx(100.0)
        assert isd_a == pytest.approx(1000.0)
        assert ii_a is None

    def test_all_ranges_missing_all_none(self) -> None:
        result = resolwuj_nastawy_mccb(i_n_a=100.0, ir_range=None, isd_range=None, ii_range=None)
        assert result == (None, None, None, None, None)

    def test_non_positive_i_n_a_rejected(self) -> None:
        with pytest.raises(ValueError):
            resolwuj_nastawy_mccb(i_n_a=0.0, ir_range=None, isd_range=None, ii_range=None)
        with pytest.raises(ValueError):
            resolwuj_nastawy_mccb(i_n_a=-5.0, ir_range=None, isd_range=None, ii_range=None)

    def test_determinism(self) -> None:
        a = resolwuj_nastawy_mccb(
            i_n_a=100.0, ir_range=(0.4, 1.0), isd_range=(1.5, 10.0), ii_range=(1.0, 15.0)
        )
        b = resolwuj_nastawy_mccb(
            i_n_a=100.0, ir_range=(0.4, 1.0), isd_range=(1.5, 10.0), ii_range=(1.0, 15.0)
        )
        assert a == b
