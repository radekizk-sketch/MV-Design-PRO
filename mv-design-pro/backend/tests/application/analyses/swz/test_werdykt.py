"""Testy werdyktu SWZ 3-stanowego (karta P0.6, G-06)."""

from __future__ import annotations

import pytest
from application.analyses.swz.werdykt import (
    AparatZabezpieczajacy,
    SwzStatus,
    ocen_swz,
)
from network_model.solvers import protection_lv_curves


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

    def test_mccb_missing_ii_undecided(self) -> None:
        """Karta D1: typ='MCCB' bez `ii_a` (nastawa nierozwiązana) — trzeci
        stan, NIE fabrykacja domyślnej nastawy."""
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCCB", in_a=100.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE
        assert result.ia_wymagane_a is None


class TestOcenSwzMccbKartaD1:
    """Karta D1 (nN, „runda 8 — PEŁNY WERDYKT nN"): `typ="MCCB"`, Ia z
    nastawy Ii (magnetycznej/bezzwłocznej) — bez interpolacji pasma (Ii jest
    KONKRETNĄ nastawą, nie normatywnym przedziałem klasy B/C/D)."""

    def test_spelnia(self) -> None:
        result = ocen_swz(
            ik1_min_a=7000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCCB", in_a=400.0, ii_a=6000.0),
        )
        assert result.status == SwzStatus.SPELNIA
        assert result.ia_wymagane_a == pytest.approx(6000.0)
        assert result.margines == pytest.approx(7000.0 / 6000.0)

    def test_nie_spelnia(self) -> None:
        result = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCCB", in_a=400.0, ii_a=6000.0),
        )
        assert result.status == SwzStatus.NIE_SPELNIA
        assert result.ia_wymagane_a == pytest.approx(6000.0)

    def test_istniejace_werdykty_mcb_gg_nietkniete(self) -> None:
        """Zakaz karty D1: MCB/WKLADKA_GG werdykty NIEZMIENIONE (piny zielone
        bez modyfikacji asercji) — dowód, że nowa gałąź MCCB nic nie zmienia
        w istniejących ścieżkach."""
        mcb = ocen_swz(
            ik1_min_a=500.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="MCB", in_a=16.0, klasa_mcb="B"),
        )
        assert mcb.status == SwzStatus.SPELNIA
        assert mcb.ia_wymagane_a == pytest.approx(80.0)
        gg = ocen_swz(
            ik1_min_a=99999.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert gg.status == SwzStatus.NIEROZSTRZYGALNE


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


class TestOcenSwzWkladkaGgKartaD2:
    """Karta D2 (nN, „runda 8", 2026-08-14): SWZ decyzyjne dla gG z bramek
    normatywnych konwencjonalnych (Inf/If) — iloczyn cech: Ik1_min < Inf →
    nie spełnia (rozstrzygalne); Inf<=Ik1_min<bramka_t_wymagany →
    nierozstrzygalne warunkowe; Ik1_min>=bramka_t_wymagany → spełnia,
    WYŁĄCZNIE jeśli bramka jest zasilona (domyślnie rejestr PUSTY — patrz
    `protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER`)."""

    def test_ik1_min_below_inf_nie_spelnia_resolvable(self) -> None:
        """Ik1_min <= Inf=1,25×In=31,25A (In=25A) → NIE SPEŁNIA, rozstrzygalne
        bez żadnej bramki przy t_wymagany (monotoniczność charakterystyki)."""
        result = ocen_swz(
            ik1_min_a=20.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.NIE_SPELNIA
        assert result.ia_wymagane_a == pytest.approx(31.25)
        assert result.margines == pytest.approx(20.0 / 31.25)
        assert "Inf" in result.przyczyna_pl
        assert "IEC 60269-1" in result.przyczyna_pl

    def test_ik1_min_at_inf_boundary_nie_spelnia(self) -> None:
        """Ik1_min == Inf dokładnie → nadal NIE SPEŁNIA (Inf jest progiem
        GWARANTOWANEGO braku zadziałania — <=, nie <)."""
        result = ocen_swz(
            ik1_min_a=31.25,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.NIE_SPELNIA

    def test_ik1_min_between_inf_and_if_nierozstrzygalne_warunkowe(self) -> None:
        """Inf=31,25A < Ik1_min=35A < If=40A (In=25A) → NIEROZSTRZYGALNE —
        norma nie gwarantuje ani braku, ani wystąpienia stopienia nawet w
        czasie umownym; przyczyna nazywa strefę pośrednią."""
        result = ocen_swz(
            ik1_min_a=35.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE
        assert result.ia_wymagane_a is None
        assert "bramki" in result.przyczyna_pl.lower()

    def test_ik1_min_above_if_no_t_wym_gate_nierozstrzygalne_warunkowe(self) -> None:
        """Ik1_min=1000A >> If=40A (In=25A) — norma gwarantuje stopienie w
        CZASIE UMOWNYM (1h/2h/3h/4h), NIE w t_wymagany SWZ (0,4 s) — brak
        podwójnie potwierdzonej bramki przy t_wymagany ⇒ NIEROZSTRZYGALNE,
        NIGDY 'spełnia' fabrykowane z bramek konwencjonalnych."""
        result = ocen_swz(
            ik1_min_a=1000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE
        assert result.ia_wymagane_a is None
        assert "t_wymagany" in result.przyczyna_pl
        assert "0.4" in result.przyczyna_pl or "0,4" in result.przyczyna_pl

    def test_in_below_16a_out_of_verified_scope_nierozstrzygalne(self) -> None:
        """In=10A <= 16A — poza zweryfikowanym zakresem G-D2 (mnożniki innych
        dla In<=16A) — NIEROZSTRZYGALNE, nie crash, nie fabrykacja mnożnika."""
        result = ocen_swz(
            ik1_min_a=1000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=10.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE
        assert result.ia_wymagane_a is None
        assert "16" in result.przyczyna_pl

    def test_in_missing_nierozstrzygalne(self) -> None:
        result = ocen_swz(
            ik1_min_a=1000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=None),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE
        assert result.ia_wymagane_a is None

    def test_white_box_trace_names_gate_source(self) -> None:
        """Każdy krok werdyktu nazywa źródło bramki (§ karty D2) — solver
        trace (Inf/If, IEC 60269-1, `FUSE_GG_GATE_SOURCE_PL`) jest zagnieżdżony
        w śladzie, nie zgubiony po drodze."""
        result = ocen_swz(
            ik1_min_a=1000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        trace_blob = str(result.white_box_trace)
        assert "IEC 60269-1" in trace_blob
        assert "inf_a" in trace_blob
        assert "if_a" in trace_blob

    def test_determinism(self) -> None:
        aparat = AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0)
        a = ocen_swz(ik1_min_a=35.0, u0_v=230.0, aparat=aparat)
        b = ocen_swz(ik1_min_a=35.0, u0_v=230.0, aparat=aparat)
        assert a == b


class TestOcenSwzWkladkaGgIniekcjaBramkiTWymaganego:
    """Iniekcja (karta D2 §TESTY): dodanie/usunięcie bramki t_wymagany w
    rejestrze `protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER`
    przełącza werdykt między rozstrzygalnym a trzecim stanem — dowód, że
    mechanizm żyje i konsumuje rejestr NAPRAWDĘ (nie fasada)."""

    def test_injected_gate_makes_verdict_spelnia(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # t_wymagany dla obwodu odbiorczego 230V = 0,4 s (Tab. 41.1, pasmo
        # 120<U0<=230). Bramka wstrzyknięta: 2,0×In = 50 A dla In=25 A.
        monkeypatch.setitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 0.4, 2.0)
        result = ocen_swz(
            ik1_min_a=1000.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.SPELNIA
        assert result.ia_wymagane_a == pytest.approx(50.0)
        assert result.margines == pytest.approx(1000.0 / 50.0)

    def test_injected_gate_makes_verdict_nie_spelnia_below_gate(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 0.4, 2.0)
        # Ik1_min=45A: powyżej If=40A (WYZWOLENIE_GWARANTOWANE w czasie
        # umownym), ale PONIŻEJ bramki wstrzykniętej 50A przy t_wymagany —
        # wciąż NIEROZSTRZYGALNE (bramka NIE osiągnięta), nie 'spełnia'.
        result = ocen_swz(
            ik1_min_a=45.0,
            u0_v=230.0,
            aparat=AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0),
        )
        assert result.status == SwzStatus.NIEROZSTRZYGALNE

    def test_removing_injected_gate_reverts_to_third_state(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Usunięcie bramki t_wymagany z rejestru (powrót do stanu domyślnego
        — PUSTY rejestr, patrz karta D2 §0 pkt 1b/1c) → werdykt wraca do
        warunkowego trzeciego stanu dla dokładnie TEGO SAMEGO wejścia, które
        chwilę wcześniej dawało 'spełnia' z bramką wstrzykniętą — dowód, że
        rejestr jest JEDYNYM źródłem rozstrzygalności powyżej Inf."""
        aparat = AparatZabezpieczajacy(typ="WKLADKA_GG", in_a=25.0)

        monkeypatch.setitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 0.4, 2.0)
        with_gate = ocen_swz(ik1_min_a=1000.0, u0_v=230.0, aparat=aparat)
        assert with_gate.status == SwzStatus.SPELNIA

        monkeypatch.delitem(protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER, 0.4)
        assert protection_lv_curves.FUSE_GG_BRAMKA_T_WYMAGANY_MULTIPLIER == {}
        without_gate = ocen_swz(ik1_min_a=1000.0, u0_v=230.0, aparat=aparat)
        assert without_gate.status == SwzStatus.NIEROZSTRZYGALNE
        assert without_gate.ia_wymagane_a is None
