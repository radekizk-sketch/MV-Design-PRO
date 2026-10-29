"""
Tests for FaultLoopSolver — P0.5 / IEC 60364-4-41 MVP.

Verifies:
- FaultLoopResult dataclass contract (frozen, serialization, immutability)
- compute_fault_loop math (Z_loop summation, Ik = c·U/|Z|)
- WHITE BOX trace audyt
- Validation reguły (no heuristics, polskie błędy)
- TT/IT: dyspozycja do `petla_zwarcia_tt_it` (karta W5-E-TTIT); tu pinujemy odmowę nazwaną bez danych TT/IT
"""

import math

import pytest
from network_model.core.voltage_factor import c_for_node
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    FaultLoopResult,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
)


def _make_typical_tn_s_input() -> FaultLoopInput:
    """
    Typowa stacja SN/NN 400 kVA z kablem nN AYY-Hz 4x35 mm² 30 m.

    Parametry przybliżone:
    - TR 400 kVA, U_k=4%, Z_TR_LV ≈ 16 mΩ
    - Kabel L: 30 m × 0.524 Ω/km ≈ 15.7 mΩ + 30 m × 0.075 Ω/km ≈ 2.3 mΩ
    - PE: identyczny przekrój (TN-S, oddzielny przewód)
    - U_n = 230 V (fazowe)
    """
    return FaultLoopInput(
        tolerancja_nn="PLUS_6",
        fault_node_id="bus_LV_outgoing",
        u_nom_v=230.0,
        phase_conductor=LoopImpedanceComponent(
            label="Kabel L (AYY-Hz 4x35, 30 m)",
            r_ohm=0.0157,
            x_ohm=0.0023,
        ),
        return_conductor=LoopImpedanceComponent(
            label="Przewód PE (4x35, 30 m, TN-S)",
            r_ohm=0.0157,
            x_ohm=0.0023,
        ),
        transformer_impedance=LoopImpedanceComponent(
            label="Transformator SN/NN 400 kVA (Z LV)",
            r_ohm=0.005,
            x_ohm=0.015,
        ),
        network_type=NetworkType.TN_S,
        protection_arrangement=ProtectionArrangement.PE,
    )


class TestLoopImpedanceComponent:
    def test_magnitude_pythagorean(self) -> None:
        c = LoopImpedanceComponent(label="test", r_ohm=3.0, x_ohm=4.0)
        assert c.magnitude_ohm == pytest.approx(5.0)

    def test_as_complex(self) -> None:
        c = LoopImpedanceComponent(label="test", r_ohm=1.5, x_ohm=2.0)
        assert c.as_complex == complex(1.5, 2.0)

    def test_zero_impedance_allowed(self) -> None:
        c = LoopImpedanceComponent(label="zero", r_ohm=0.0, x_ohm=0.0)
        assert c.magnitude_ohm == 0.0

    def test_frozen(self) -> None:
        c = LoopImpedanceComponent(label="x", r_ohm=1.0, x_ohm=2.0)
        with pytest.raises(Exception):
            c.r_ohm = 99.0  # type: ignore[misc]


class TestComputeFaultLoopTNS:
    def test_typical_tn_s_station_400kva(self) -> None:
        result = compute_fault_loop(_make_typical_tn_s_input())
        assert isinstance(result, FaultLoopResult)
        assert result.network_type == NetworkType.TN_S
        assert result.protection_arrangement == ProtectionArrangement.PE
        # Z_loop = phase + return + tr = 0.0157+0.0157+0.005 + j(0.0023+0.0023+0.015)
        # |Z| ≈ sqrt(0.0364² + 0.0196²) ≈ 0.0413 Ω
        assert result.z_loop_magnitude_ohm == pytest.approx(0.0413, abs=1e-3)
        # I_k_min ≈ 0.95 * 230 / 0.0413 ≈ 5290 A
        assert result.ik_min_a == pytest.approx(5290, rel=0.05)
        # I_k_max ≈ 1.05 * 230 / 0.0413 ≈ 5847 A
        assert result.ik_max_a == pytest.approx(5847, rel=0.05)

    def test_z_loop_summation(self) -> None:
        """Z_loop = Σ(R+jX) — wszystkie komponenty zsumowane R + X osobno."""
        data = _make_typical_tn_s_input()
        result = compute_fault_loop(data)
        expected_r = (
            data.phase_conductor.r_ohm
            + data.return_conductor.r_ohm
            + data.transformer_impedance.r_ohm
        )
        expected_x = (
            data.phase_conductor.x_ohm
            + data.return_conductor.x_ohm
            + data.transformer_impedance.x_ohm
        )
        assert result.z_loop_ohm.real == pytest.approx(expected_r)
        assert result.z_loop_ohm.imag == pytest.approx(expected_x)

    def test_c_factors_match_iec_60909_lv(self) -> None:
        """IEC 60909-0 tab. 1, sieć nN +6 %: c_min = 0,95, c_max = 1,05 — wynik pętli niesie
        c z jedynego źródła tabeli (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK) i jego podstawę."""
        result = compute_fault_loop(_make_typical_tn_s_input())
        assert result.c_min == c_for_node(0.23, "MIN", tolerancja_nn="PLUS_6") == 0.95
        assert result.c_max == c_for_node(0.23, "MAX", tolerancja_nn="PLUS_6") == 1.05
        assert result.c_zrodlo_min == "IEC 60909-0 tab. 1, pasmo nN, tolerancja +6 %, MIN"
        assert result.c_zrodlo_max == "IEC 60909-0 tab. 1, pasmo nN, tolerancja +6 %, MAX"

    def test_nierozstrzygnieta_tolerancja_to_blad_programu(self) -> None:
        """Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: solver pętli nie wybiera klasy tolerancji —
        rozstrzyga ją wołający (deklaracja albo wartość robocza rejestru). Klasa nierozstrzy-
        gnięta przy U_0 w paśmie nN to błąd PROGRAMU wołającego (``ValueError``), nie odmowa
        dziedziny i nigdy wiersz tabeli wybrany po cichu."""
        dane = _make_typical_tn_s_input()
        bez_tolerancji = FaultLoopInput(
            tolerancja_nn=None,
            fault_node_id=dane.fault_node_id,
            u_nom_v=dane.u_nom_v,
            phase_conductor=dane.phase_conductor,
            return_conductor=dane.return_conductor,
            transformer_impedance=dane.transformer_impedance,
        )
        with pytest.raises(ValueError) as blad:
            compute_fault_loop(bez_tolerancji)
        assert not isinstance(blad.value, OdmowaDanychError)

    @pytest.mark.parametrize(
        ("tolerancja", "robocza", "c_max", "c_min"),
        [
            ("PLUS_6", False, 1.05, 0.95),
            ("PLUS_10", False, 1.10, 0.90),
            ("PLUS_10", True, 1.10, 0.90),
        ],
    )
    def test_wartosc_robocza_w_podstawie_c_i_znaczniku(
        self, tolerancja: str, robocza: bool, c_max: float, c_min: float
    ) -> None:
        """{deklaracja +6 %, deklaracja +10 %, wartość robocza +10 %} × {MAX, MIN}: c z tabeli,
        podstawa nazywa wartość roboczą, znacznik wyniku (i klucz `to_dict`) tylko przy niej."""
        dane = _make_typical_tn_s_input()
        wynik = compute_fault_loop(
            FaultLoopInput(
                tolerancja_nn=tolerancja,
                tolerancja_nn_robocza=robocza,
                fault_node_id=dane.fault_node_id,
                u_nom_v=dane.u_nom_v,
                phase_conductor=dane.phase_conductor,
                return_conductor=dane.return_conductor,
                transformer_impedance=dane.transformer_impedance,
            )
        )
        assert (wynik.c_max, wynik.c_min) == (c_max, c_min)
        etykieta = "+6 %" if tolerancja == "PLUS_6" else "+10 %"
        dopisek = " (wartość robocza)" if robocza else ""
        for scenariusz, zrodlo in (("MAX", wynik.c_zrodlo_max), ("MIN", wynik.c_zrodlo_min)):
            assert zrodlo == (
                f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {etykieta}{dopisek}, {scenariusz}"
            )
        assert wynik.tolerancja_nn_robocza is robocza
        assert ("tolerancja_nn_robocza" in wynik.to_dict()) is robocza

    def test_ik_max_greater_than_ik_min(self) -> None:
        result = compute_fault_loop(_make_typical_tn_s_input())
        assert result.ik_max_a > result.ik_min_a

    def test_upstream_impedance_increases_z_loop(self) -> None:
        """Dodanie Z upstream (SN side) zwiększa Z_loop i zmniejsza Ik."""
        base = _make_typical_tn_s_input()
        with_upstream = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id=base.fault_node_id,
            u_nom_v=base.u_nom_v,
            phase_conductor=base.phase_conductor,
            return_conductor=base.return_conductor,
            transformer_impedance=base.transformer_impedance,
            upstream_impedance=LoopImpedanceComponent(
                label="Sieć SN (Thevenin)",
                r_ohm=0.001,
                x_ohm=0.010,
            ),
            network_type=base.network_type,
            protection_arrangement=base.protection_arrangement,
        )
        r_base = compute_fault_loop(base)
        r_up = compute_fault_loop(with_upstream)
        assert r_up.z_loop_magnitude_ohm > r_base.z_loop_magnitude_ohm
        assert r_up.ik_min_a < r_base.ik_min_a


class TestWhiteBoxTrace:
    def test_trace_has_two_steps_for_mvp(self) -> None:
        result = compute_fault_loop(_make_typical_tn_s_input())
        steps = [t["step"] for t in result.white_box_trace]
        assert "sum_components" in steps
        assert "compute_ik" in steps

    def test_trace_includes_method_strings(self) -> None:
        result = compute_fault_loop(_make_typical_tn_s_input())
        sum_step = next(t for t in result.white_box_trace if t["step"] == "sum_components")
        ik_step = next(t for t in result.white_box_trace if t["step"] == "compute_ik")
        assert "method" in sum_step
        assert "Σ" in sum_step["method"]
        assert "method" in ik_step
        assert "c * U_n" in ik_step["method"]

    def test_trace_audytowalne(self) -> None:
        """Trace zawiera wszystkie komponenty + c_factors + Z + Ik."""
        result = compute_fault_loop(_make_typical_tn_s_input())
        sum_step = next(t for t in result.white_box_trace if t["step"] == "sum_components")
        assert len(sum_step["components"]) == 3  # phase + return + transformer
        ik_step = next(t for t in result.white_box_trace if t["step"] == "compute_ik")
        assert ik_step["c_min"] == 0.95
        assert ik_step["c_max"] == 1.05
        assert ik_step["u_nom_v"] == 230.0


class TestValidation:
    def test_zero_voltage_rejected(self) -> None:
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=0.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.01, x_ohm=0.001),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.01, x_ohm=0.001),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.005, x_ohm=0.015),
        )
        with pytest.raises(
            ValueError, match="Napięcie znamionowe sieci w punkcie zwarcia musi być > 0 V"
        ):
            compute_fault_loop(bad)

    def test_negative_impedance_rejected(self) -> None:
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=-0.01, x_ohm=0.001),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.01, x_ohm=0.001),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.005, x_ohm=0.015),
        )
        with pytest.raises(ValueError, match="ujemną R lub X"):
            compute_fault_loop(bad)

    def test_tt_bez_danych_petli_doziemnej_odmawia_nazwanie(self) -> None:
        """W5-E-TTIT: układ TT bez R_A/R_B/I_Δn = odmowa nazwana (nigdy NotImplementedError,
        nigdy wartość zastępcza)."""
        data = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.01, x_ohm=0.001),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.0, x_ohm=0.0),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.005, x_ohm=0.015),
            network_type=NetworkType.TT,
            protection_arrangement=ProtectionArrangement.NONE,
        )
        with pytest.raises(OdmowaDanychError, match="Układ TT"):
            compute_fault_loop(data)

    def test_it_bez_danych_sieci_it_odmawia_nazwanie(self) -> None:
        data = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.01, x_ohm=0.001),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.01, x_ohm=0.001),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.005, x_ohm=0.015),
            network_type=NetworkType.IT,
            protection_arrangement=ProtectionArrangement.NONE,
        )
        with pytest.raises(OdmowaDanychError, match="Układ IT"):
            compute_fault_loop(data)

    def test_tn_z_danymi_tt_it_odmawia(self) -> None:
        """Dane pętli doziemnej przy układzie TN to sprzeczność wejścia — odmowa, nie ciche
        zignorowanie (predykaty parami: TT/IT wymaga danych, TN ich zabrania)."""
        from network_model.solvers.petla_zwarcia_tt_it import DaneTtIt

        data = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.01, x_ohm=0.001),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.01, x_ohm=0.001),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.005, x_ohm=0.015),
            network_type=NetworkType.TN_S,
            dane_tt_it=DaneTtIt(r_a_ohm=20.0, r_b_ohm=2.0, i_delta_n_a=0.03),
        )
        with pytest.raises(OdmowaDanychError, match="nie mają zastosowania"):
            compute_fault_loop(data)

    def test_zero_loop_impedance_rejected(self) -> None:
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.0, x_ohm=0.0),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.0, x_ohm=0.0),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.0, x_ohm=0.0),
        )
        with pytest.raises(ValueError, match=r"degenerated case"):
            compute_fault_loop(bad)

    def test_cr_fix_tiny_z_loop_rejected(self) -> None:
        """CR-FIX (code review KRYTYCZNE #2): Z_loop < 1 µΩ rejected.

        Bez tego guard'a ekstremalnie małe Z dawały Ik >> 100 kA (fizycznie
        niemożliwe dla LV) i overflow serializacji JSON.
        """
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=1e-15, x_ohm=1e-15),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=1e-15, x_ohm=1e-15),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=1e-15, x_ohm=1e-15),
        )
        with pytest.raises(ValueError, match=r"fizycznie niemożliwa|degenerated case"):
            compute_fault_loop(bad)


class TestErrorLogging:
    """AUDIT FIX #3 (observability): each reject emits logger.warning
    z fault_node_id + reason — batch fault scan ma audit trail bez
    try/except scaffold."""

    def test_invalid_u_nom_emits_warning_with_node_id(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="bus_LV_42",
            u_nom_v=0.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.1, x_ohm=0.05),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.1, x_ohm=0.05),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.01, x_ohm=0.04),
        )
        with caplog.at_level("WARNING", logger="network_model.solvers.fault_loop_iec60364"):
            with pytest.raises(ValueError):
                compute_fault_loop(bad)
        # exactly one warning emitted
        warnings = [r for r in caplog.records if r.levelname == "WARNING"]
        assert len(warnings) == 1
        assert "u_nom_v" in warnings[0].message
        assert getattr(warnings[0], "fault_node_id", None) == "bus_LV_42"

    def test_tt_bez_danych_emits_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        from network_model.solvers.fault_loop_iec60364 import NetworkType

        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="bus_TT_1",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.1, x_ohm=0.05),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.0, x_ohm=0.0),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.01, x_ohm=0.04),
            network_type=NetworkType.TT,
        )
        with caplog.at_level("WARNING", logger="network_model.solvers.fault_loop_iec60364"):
            with pytest.raises(OdmowaDanychError):
                compute_fault_loop(bad)
        warnings = [r for r in caplog.records if r.levelname == "WARNING"]
        assert len(warnings) == 1
        assert getattr(warnings[0], "network_type", None) == "TT"

    def test_tiny_z_emits_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="bus_x",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=1e-15, x_ohm=0),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=1e-15, x_ohm=0),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=1e-15, x_ohm=0),
        )
        with caplog.at_level("WARNING", logger="network_model.solvers.fault_loop_iec60364"):
            with pytest.raises(ValueError):
                compute_fault_loop(bad)
        warnings = [r for r in caplog.records if r.levelname == "WARNING"]
        assert len(warnings) == 1
        assert "Z_loop" in warnings[0].message or "z_magnitude" in str(
            getattr(warnings[0], "z_magnitude_ohm", "")
        )

    def test_negative_impedance_emits_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        bad = FaultLoopInput(
            tolerancja_nn="PLUS_6",
            fault_node_id="bus_y",
            u_nom_v=230.0,
            phase_conductor=LoopImpedanceComponent(label="L", r_ohm=-0.1, x_ohm=0.05),
            return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.1, x_ohm=0.05),
            transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.01, x_ohm=0.04),
        )
        with caplog.at_level("WARNING", logger="network_model.solvers.fault_loop_iec60364"):
            with pytest.raises(ValueError):
                compute_fault_loop(bad)
        warnings = [r for r in caplog.records if r.levelname == "WARNING"]
        assert len(warnings) == 1
        assert getattr(warnings[0], "component", None) == "phase_conductor"

    def test_success_path_emits_no_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        """Happy path nie powinien logować — tylko reject paths logują."""
        with caplog.at_level("WARNING", logger="network_model.solvers.fault_loop_iec60364"):
            compute_fault_loop(_make_typical_tn_s_input())
        assert [r for r in caplog.records if r.levelname == "WARNING"] == []


class TestSerialization:
    def test_to_dict_v12_pattern(self) -> None:
        """Per V12.xx canonical pattern: complex → {re, im, magnitude}."""
        result = compute_fault_loop(_make_typical_tn_s_input())
        d = result.to_dict()
        assert d["fault_node_id"] == "bus_LV_outgoing"
        assert d["network_type"] == "TN-S"
        assert d["protection_arrangement"] == "PE"
        assert "z_loop_ohm" in d
        assert "re" in d["z_loop_ohm"]
        assert "im" in d["z_loop_ohm"]
        assert "magnitude" in d["z_loop_ohm"]
        assert len(d["components"]) == 3
        assert "white_box_trace" in d
        assert len(d["white_box_trace"]) == 2  # 2 steps

    def test_components_serialized_with_magnitudes(self) -> None:
        result = compute_fault_loop(_make_typical_tn_s_input())
        d = result.to_dict()
        for comp in d["components"]:
            assert "label" in comp
            assert "r_ohm" in comp
            assert "x_ohm" in comp
            assert "magnitude_ohm" in comp
            assert comp["magnitude_ohm"] == pytest.approx(
                math.sqrt(comp["r_ohm"] ** 2 + comp["x_ohm"] ** 2),
            )


class TestDeterminism:
    def test_same_input_same_output(self) -> None:
        """Same input → identical FaultLoopResult JSON."""
        data = _make_typical_tn_s_input()
        r1 = compute_fault_loop(data)
        r2 = compute_fault_loop(data)
        assert r1.to_dict() == r2.to_dict()

    def test_result_is_frozen(self) -> None:
        result = compute_fault_loop(_make_typical_tn_s_input())
        with pytest.raises(Exception):
            result.ik_min_a = 99999.0  # type: ignore[misc]
