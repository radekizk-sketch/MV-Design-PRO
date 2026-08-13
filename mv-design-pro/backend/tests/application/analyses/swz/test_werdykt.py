"""Testy werdyktu SWZ 3-stanowego (karta P0.6, G-06)."""

from __future__ import annotations

import pytest
from application.analyses.swz.werdykt import (
    AparatZabezpieczajacy,
    SwzStatus,
    ocen_swz,
)


class TestOcenSwzMcbSpelnia:
    def test_short_circuit_with_short_low_impedance_route_trips(self) -> None:
        """MCB B16 (Ia=80A), Ik1_min wysoki (krótki obwód) → spełnia."""
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
        )
        assert result.status == SwzStatus.SPELNIA
        assert result.ia_wymagane_a == pytest.approx(80.0)
        assert result.margines == pytest.approx(500.0 / 80.0)
        assert result.t_wymagany_s == pytest.approx(0.4)
        assert "≥" in result.przyczyna_pl


class TestOcenSwzMcbNieSpelnia:
    def test_long_route_low_ik1_min_does_not_trip(self) -> None:
        """MCB C63 (Ia=630A), Ik1_min niski (długi obwód) → nie spełnia."""
        result = ocen_swz(
            ik1_min_a=100.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=63.0, klasa_mcb="C"),
        )
        assert result.status == SwzStatus.NIE_SPELNIA
        assert result.ia_wymagane_a == pytest.approx(630.0)
        assert "<" in result.przyczyna_pl


class TestOcenSwzNierozstrzygalne:
    def test_gg_fuse_link_always_undecided(self) -> None:
        """Wkładka gG bez bramek I-t (G-D2) → NIEROZSTRZYGALNE, nigdy PASS."""
        result = ocen_swz(
            ik1_min_a=99999.0,  # nawet ogromny prąd nie zmienia werdyktu
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE
        assert result.ia_wymagane_a is None
        assert "G-D2" in result.przyczyna_pl

    def test_mcb_missing_class_undecided(self) -> None:
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb=None),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE

    def test_unsupported_device_type_undecided(self) -> None:
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCCB_ELECTRONIC", in_a=100.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE


class TestPasmoIRodzajObwodu:
    def test_final_circuit_band_120_230(self) -> None:
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
        )
        assert result.pasmo_u0 == "120<U0<=230"
        assert result.rodzaj_obwodu == "odbiorczy"
        assert result.t_wymagany_s == pytest.approx(0.4)

    def test_distribution_circuit_forced_explicitly(self) -> None:
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
            rodzaj_obwodu="rozdzielczy",
        )
        assert result.rodzaj_obwodu == "rozdzielczy"
        assert result.t_wymagany_s == pytest.approx(5.0)

    def test_high_current_device_defaults_to_distribution(self) -> None:
        result = ocen_swz(
            ik1_min_a=5000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=100.0, klasa_mcb="C"),
        )
        assert result.rodzaj_obwodu == "rozdzielczy"
        assert result.t_wymagany_s == pytest.approx(5.0)


class TestOcenSwzWalidacja:
    def test_negative_ik1_min_rejected(self) -> None:
        with pytest.raises(ValueError):
            ocen_swz(
                ik1_min_a=-1.0,
                u0_v=230.0,
                aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
            )

    def test_invalid_rodzaj_obwodu_rejected(self) -> None:
        with pytest.raises(ValueError):
            ocen_swz(
                ik1_min_a=500.0,
                u0_v=230.0,
                aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
                rodzaj_obwodu="nieznany",
            )


class TestDeterminism:
    def test_same_input_same_output(self) -> None:
        aparat = AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B")
        a = ocen_swz(ik1_min_a=500.0, u0_v=230.0, aparat=aparat)
        b = ocen_swz(ik1_min_a=500.0, u0_v=230.0, aparat=aparat)
        assert a == b
