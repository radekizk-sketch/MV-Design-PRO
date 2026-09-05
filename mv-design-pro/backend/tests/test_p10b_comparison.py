"""
P10b Comparison Tests — Deterministic Case A/B Comparison

TESTS:
1. NumericDelta computation determinism
2. ComplexDelta computation determinism
3. ShortCircuitComparison construction
4. PowerFlowComparison construction
5. RunComparisonResult serialization
6. Comparison exceptions
7. Edge cases (zero values, identical values)
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from domain.results import (
    AnalysisTypeMismatchError,
    BusVoltageComparison,
    ComplexDelta,
    NumericDelta,
    PowerFlowComparison,
    ProjectMismatchError,
    ResultNotFoundError,
    RunComparisonResult,
    RunNotFoundError,
    RunResultState,
    ShortCircuitComparison,
)


class TestRunResultState:
    """Test RunResultState enum (P10b)."""

    def test_result_state_values(self):
        """RunResultState must have canonical values."""
        assert RunResultState.NONE.value == "NONE"
        assert RunResultState.FRESH.value == "FRESH"
        assert RunResultState.OUTDATED.value == "OUTDATED"

    def test_result_state_string_conversion(self):
        """RunResultState must be string-convertible."""
        # Kanon py3.11 StrEnum (UP042): str(member) zwraca wartosc czlonu,
        # nie "Klasa.CZLON" jak dawne (str, Enum). Intencja testu (string-convertible
        # + rownosc z wartoscia) zachowana; produkcja uzywa .value/porownania, nie repr.
        assert str(RunResultState.NONE) == "NONE"
        assert RunResultState.FRESH == "FRESH"


class TestNumericDelta:
    """Test NumericDelta computation (P10b)."""

    def test_positive_delta(self):
        """Positive delta when B > A."""
        delta = NumericDelta.compute(100.0, 150.0)
        assert delta.value_a == 100.0
        assert delta.value_b == 150.0
        assert delta.delta == 50.0
        assert delta.percent == pytest.approx(50.0)
        assert delta.sign == 1

    def test_negative_delta(self):
        """Negative delta when B < A."""
        delta = NumericDelta.compute(100.0, 80.0)
        assert delta.delta == -20.0
        assert delta.percent == pytest.approx(-20.0)
        assert delta.sign == -1

    def test_zero_delta(self):
        """Zero delta when A == B."""
        delta = NumericDelta.compute(100.0, 100.0)
        assert delta.delta == 0.0
        assert delta.percent == pytest.approx(0.0)
        assert delta.sign == 0

    def test_percent_none_when_a_zero(self):
        """Percent should be None when A is zero."""
        delta = NumericDelta.compute(0.0, 50.0)
        assert delta.percent is None
        assert delta.sign == 1

    def test_determinism_same_inputs(self):
        """Same inputs must produce identical results."""
        delta1 = NumericDelta.compute(123.456, 789.012)
        delta2 = NumericDelta.compute(123.456, 789.012)
        assert delta1 == delta2

    def test_to_dict_serialization(self):
        """NumericDelta must serialize to dict."""
        delta = NumericDelta.compute(100.0, 150.0)
        d = delta.to_dict()
        assert d["value_a"] == 100.0
        assert d["value_b"] == 150.0
        assert d["delta"] == 50.0
        assert d["percent"] == pytest.approx(50.0)
        assert d["sign"] == 1


class TestComplexDelta:
    """Test ComplexDelta computation (P10b)."""

    def test_complex_delta_computation(self):
        """ComplexDelta should compute component-wise differences."""
        a = complex(3.0, 4.0)  # magnitude = 5
        b = complex(6.0, 8.0)  # magnitude = 10
        delta = ComplexDelta.compute(a, b)

        assert delta.re_a == 3.0
        assert delta.im_a == 4.0
        assert delta.re_b == 6.0
        assert delta.im_b == 8.0
        assert delta.delta_re == 3.0
        assert delta.delta_im == 4.0
        assert delta.magnitude_a == pytest.approx(5.0)
        assert delta.magnitude_b == pytest.approx(10.0)
        assert delta.delta_magnitude == pytest.approx(5.0)
        assert delta.percent_magnitude == pytest.approx(100.0)

    def test_complex_delta_zero_magnitude_a(self):
        """Percent should be None when magnitude A is zero."""
        a = complex(0.0, 0.0)
        b = complex(1.0, 1.0)
        delta = ComplexDelta.compute(a, b)
        assert delta.percent_magnitude is None

    def test_complex_delta_determinism(self):
        """Same complex inputs must produce identical results."""
        a = complex(1.234, 5.678)
        b = complex(9.012, 3.456)
        delta1 = ComplexDelta.compute(a, b)
        delta2 = ComplexDelta.compute(a, b)
        assert delta1 == delta2

    def test_to_dict_serialization(self):
        """ComplexDelta must serialize to dict."""
        delta = ComplexDelta.compute(complex(3.0, 4.0), complex(6.0, 8.0))
        d = delta.to_dict()
        assert "re_a" in d
        assert "im_a" in d
        assert "delta_magnitude" in d


class TestShortCircuitComparison:
    """Test ShortCircuitComparison construction (P10b)."""

    def test_construction_from_deltas(self):
        """ShortCircuitComparison should be constructable from deltas."""
        ikss = NumericDelta.compute(10000.0, 12000.0)
        sk = NumericDelta.compute(100.0, 120.0)
        zth = ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4))
        ip = NumericDelta.compute(25000.0, 30000.0)
        ith = NumericDelta.compute(11000.0, 13200.0)

        comp = ShortCircuitComparison(
            ikss_delta=ikss,
            sk_delta=sk,
            zth_delta=zth,
            ip_delta=ip,
            ith_delta=ith,
        )

        assert comp.ikss_delta == ikss
        assert comp.sk_delta == sk
        assert comp.zth_delta == zth

    def test_to_dict_serialization(self):
        """ShortCircuitComparison must serialize to dict."""
        ikss = NumericDelta.compute(10000.0, 12000.0)
        sk = NumericDelta.compute(100.0, 120.0)
        zth = ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4))
        ip = NumericDelta.compute(25000.0, 30000.0)
        ith = NumericDelta.compute(11000.0, 13200.0)

        comp = ShortCircuitComparison(
            ikss_delta=ikss,
            sk_delta=sk,
            zth_delta=zth,
            ip_delta=ip,
            ith_delta=ith,
        )

        d = comp.to_dict()
        assert "ikss_delta" in d
        assert "sk_delta" in d
        assert "zth_delta" in d
        assert "ip_delta" in d
        assert "ith_delta" in d
        # Karta S-C: pola addytywne zawsze w słowniku; bez danych → None.
        assert d["xr_ratio_delta"] is None
        assert d["i2t_delta"] is None


class TestShortCircuitFullBalanceDeltas:
    """Karta S-C (2026-07-22): addytywne delty X/R oraz I²t w P10b.

    Delty Rk/Xk/|Zk| pełnego bilansu niesie zth_delta (delta_re/delta_im/
    delta_magnitude) — tu weryfikujemy nowe pochodne z tej samej klasy
    przekształceń (X/R = 1/(R/X), I²t = (Ith/1000)²·tk).
    """

    @staticmethod
    def _service():
        from application.comparison.service import ComparisonService

        return ComparisonService(uow_factory=lambda: None)

    @staticmethod
    def _results(payload):
        return [{"result_type": "short_circuit", "payload": payload}]

    def test_full_payloads_produce_xr_and_i2t_deltas(self):
        service = self._service()
        payload_a = {
            "ikss_a": 10000.0,
            "sk_mva": 100.0,
            "ip_a": 25000.0,
            "ith_a": 11000.0,
            "tk_s": 1.0,
            "rx_ratio": 0.25,
            "zkk_ohm": {"re": 0.3, "im": 0.4},
        }
        payload_b = {
            "ikss_a": 12000.0,
            "sk_mva": 120.0,
            "ip_a": 30000.0,
            "ith_a": 22000.0,
            "tk_s": 1.0,
            "rx_ratio": 0.5,
            "zkk_ohm": {"re": 0.6, "im": 0.8},
        }

        comp = service._compare_short_circuit(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )

        assert comp.xr_ratio_delta is not None
        assert comp.xr_ratio_delta.value_a == pytest.approx(4.0)
        assert comp.xr_ratio_delta.value_b == pytest.approx(2.0)
        assert comp.i2t_delta is not None
        assert comp.i2t_delta.value_a == pytest.approx(121.0)
        assert comp.i2t_delta.value_b == pytest.approx(484.0)
        # Delty Rk/Xk/|Zk| — przez zth_delta (bez duplikacji pól).
        assert comp.zth_delta.delta_re == pytest.approx(0.3)
        assert comp.zth_delta.delta_im == pytest.approx(0.4)
        assert comp.zth_delta.delta_magnitude == pytest.approx(0.5)

    def test_older_payload_without_sources_gives_none(self):
        service = self._service()
        older = {"ikss_a": 10000.0, "sk_mva": 100.0, "ip_a": 25000.0, "ith_a": 11000.0}
        newer = {
            "ikss_a": 12000.0,
            "sk_mva": 120.0,
            "ip_a": 30000.0,
            "ith_a": 22000.0,
            "tk_s": 1.0,
            "rx_ratio": 0.5,
            "zkk_ohm": {"re": 0.6, "im": 0.8},
        }

        comp = service._compare_short_circuit(
            self._results(older), self._results(newer), uuid4(), uuid4()
        )

        # Uczciwy brak: jedna strona bez pól źródłowych → delta None.
        assert comp.xr_ratio_delta is None
        assert comp.i2t_delta is None
        d = comp.to_dict()
        assert d["xr_ratio_delta"] is None
        assert d["i2t_delta"] is None


class TestShortCircuitComparisonMissingCoreFields:
    """FAB-E (E1): brak pola RDZENIA (ikss_a/sk_mva/zkk_ohm/ip_a/ith_a) w
    KTORYMKOLWIEK payloadzie -> odpowiednia delta None, nigdy fabrykowana od
    milczącego 0 (ShortCircuitResult FROZEN nie ma tu odpowiednika "naprawdę
    zero" — patrz `network_model/solvers/short_circuit_iec60909.py`)."""

    @staticmethod
    def _service():
        from application.comparison.service import ComparisonService

        return ComparisonService(uow_factory=lambda: None)

    @staticmethod
    def _results(payload):
        return [{"result_type": "short_circuit", "payload": payload}]

    _KOMPLETNY = {
        "ikss_a": 10000.0,
        "sk_mva": 100.0,
        "ip_a": 25000.0,
        "ith_a": 11000.0,
        "zkk_ohm": {"re": 0.3, "im": 0.4},
    }

    @pytest.mark.parametrize(
        "brakujace_pole,nazwa_delty",
        [
            ("ikss_a", "ikss_delta"),
            ("sk_mva", "sk_delta"),
            ("zkk_ohm", "zth_delta"),
            ("ip_a", "ip_delta"),
            ("ith_a", "ith_delta"),
        ],
    )
    def test_missing_field_on_either_side_gives_none_not_zero(self, brakujace_pole, nazwa_delty):
        service = self._service()
        payload_b = dict(self._KOMPLETNY)
        del payload_b[brakujace_pole]

        comp = service._compare_short_circuit(
            self._results(self._KOMPLETNY), self._results(payload_b), uuid4(), uuid4()
        )
        assert getattr(comp, nazwa_delty) is None
        assert comp.to_dict()[nazwa_delty] is None

    def test_complete_payloads_regression_all_deltas_present(self):
        """Regresja: komplet danych po obu stronach -> te same liczby co dziś."""
        service = self._service()
        payload_b = {**self._KOMPLETNY, "ikss_a": 12000.0}

        comp = service._compare_short_circuit(
            self._results(self._KOMPLETNY), self._results(payload_b), uuid4(), uuid4()
        )
        assert comp.ikss_delta is not None
        assert comp.ikss_delta.value_a == pytest.approx(10000.0)
        assert comp.ikss_delta.value_b == pytest.approx(12000.0)
        assert comp.sk_delta is not None
        assert comp.zth_delta is not None
        assert comp.ip_delta is not None
        assert comp.ith_delta is not None


class TestPowerFlowComparisonMissingFields:
    """FAB-E (E1): brak klucza rozplywu w KTORYMKOLWIEK payloadzie -> delta
    None, nigdy fabrykowane 0.0 (wygladaloby jak zerowe straty/zerowy bilans
    szyny bilansujacej/zerowe napiecie/zerowy przeplyw galezi)."""

    @staticmethod
    def _service():
        from application.comparison.service import ComparisonService

        return ComparisonService(uow_factory=lambda: None)

    @staticmethod
    def _results(payload):
        return [{"result_type": "power_flow", "payload": payload}]

    def test_missing_losses_total_pu_gives_none_not_zero(self):
        service = self._service()
        payload_a = {
            "losses_total_pu": {"re": 0.01, "im": 0.02},
            "slack_power_pu": {"re": 1.0, "im": 0.5},
        }
        payload_b = {"slack_power_pu": {"re": 1.05, "im": 0.55}}  # brak losses_total_pu

        comp = service._compare_power_flow(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )
        assert comp.total_losses_p_delta is None
        assert comp.total_losses_q_delta is None
        # slack (kompletny po obu stronach) nadal liczy się normalnie.
        assert comp.slack_p_delta is not None
        assert comp.slack_q_delta is not None

    def test_missing_slack_power_pu_gives_none_not_zero(self):
        service = self._service()
        payload_a = {
            "losses_total_pu": {"re": 0.01, "im": 0.02},
            "slack_power_pu": {"re": 1.0, "im": 0.5},
        }
        payload_b = {"losses_total_pu": {"re": 0.012, "im": 0.025}}  # brak slack_power_pu

        comp = service._compare_power_flow(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )
        assert comp.slack_p_delta is None
        assert comp.slack_q_delta is None
        assert comp.total_losses_p_delta is not None

    def test_node_present_only_on_one_side_gives_none_voltage_delta(self):
        service = self._service()
        payload_a = {
            "node_voltage_kv": {"bus-1": 20.0, "bus-2": 20.1},
            "node_u_mag_pu": {"bus-1": 1.0, "bus-2": 1.005},
        }
        payload_b = {
            "node_voltage_kv": {"bus-1": 19.8},
            "node_u_mag_pu": {"bus-1": 0.99},
        }  # brak bus-2

        comp = service._compare_power_flow(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )
        by_bus = {nv.bus_id: nv for nv in comp.node_voltages}
        assert by_bus["bus-2"].u_kv_delta is None
        assert by_bus["bus-2"].u_pu_delta is None
        # bus-1 (obecny po obu stronach) nadal liczy się normalnie.
        assert by_bus["bus-1"].u_kv_delta is not None

    def test_branch_present_only_on_one_side_gives_none_power_delta(self):
        service = self._service()
        payload_a = {
            "branch_s_from_mva": {"br-1": {"re": 1.0, "im": 0.2}, "br-2": {"re": 2.0, "im": 0.3}}
        }
        payload_b = {"branch_s_from_mva": {"br-1": {"re": 1.1, "im": 0.25}}}  # brak br-2

        comp = service._compare_power_flow(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )
        by_branch = {bp.branch_id: bp for bp in comp.branch_powers}
        assert by_branch["br-2"].p_mw_delta is None
        assert by_branch["br-2"].q_mvar_delta is None
        assert by_branch["br-1"].p_mw_delta is not None


class TestProtectionComparisonMissingFields:
    """FAB-E (E1): brak t_trip_s (mimo TRIPS/TRIPS) albo brak "summary" w
    KTORYMKOLWIEK payloadzie -> delta None, nigdy fabrykowany czas 0 s /
    fabrykowane 0 zadzialan."""

    @staticmethod
    def _service():
        from application.comparison.service import ComparisonService

        return ComparisonService(uow_factory=lambda: None)

    @staticmethod
    def _results(payload):
        return [{"result_type": "protection", "payload": payload}]

    def test_trips_without_t_trip_s_gives_none_not_zero(self):
        service = self._service()
        payload_a = {
            "evaluations": [
                {"protected_element_ref": "f1", "trip_state": "TRIPS", "t_trip_s": 0.5}
            ],
            "summary": {"trips_count": 1, "no_trip_count": 0, "invalid_count": 0},
        }
        payload_b = {
            "evaluations": [
                {"protected_element_ref": "f1", "trip_state": "TRIPS"}  # brak t_trip_s
            ],
            "summary": {"trips_count": 1, "no_trip_count": 0, "invalid_count": 0},
        }

        comp = service._compare_protection(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )
        assert comp.evaluations[0].t_trip_delta is None
        # count-delty (summary kompletne po obu stronach) nadal licza sie normalnie.
        assert comp.trip_count_delta is not None

    def test_missing_summary_gives_none_counts_not_zero(self):
        service = self._service()
        payload_a = {
            "evaluations": [],
            "summary": {"trips_count": 2, "no_trip_count": 3, "invalid_count": 0},
        }
        payload_b = {"evaluations": []}  # brak "summary" w ogole

        comp = service._compare_protection(
            self._results(payload_a), self._results(payload_b), uuid4(), uuid4()
        )
        assert comp.trip_count_delta is None
        assert comp.no_trip_count_delta is None
        assert comp.invalid_count_delta is None


class TestPowerFlowComparison:
    """Test PowerFlowComparison construction (P10b)."""

    def test_construction_with_bus_voltages(self):
        """PowerFlowComparison should include per-bus voltages."""
        bus1 = BusVoltageComparison(
            bus_id="bus-1",
            u_kv_delta=NumericDelta.compute(20.0, 19.8),
            u_pu_delta=NumericDelta.compute(1.0, 0.99),
        )
        bus2 = BusVoltageComparison(
            bus_id="bus-2",
            u_kv_delta=NumericDelta.compute(20.0, 20.1),
            u_pu_delta=NumericDelta.compute(1.0, 1.005),
        )

        comp = PowerFlowComparison(
            total_losses_p_delta=NumericDelta.compute(0.01, 0.012),
            total_losses_q_delta=NumericDelta.compute(0.02, 0.025),
            slack_p_delta=NumericDelta.compute(1.0, 1.05),
            slack_q_delta=NumericDelta.compute(0.5, 0.55),
            node_voltages=(bus1, bus2),
            branch_powers=(),
        )

        assert len(comp.node_voltages) == 2
        assert comp.node_voltages[0].bus_id == "bus-1"

    def test_to_dict_serialization(self):
        """PowerFlowComparison must serialize to dict."""
        comp = PowerFlowComparison(
            total_losses_p_delta=NumericDelta.compute(0.01, 0.012),
            total_losses_q_delta=NumericDelta.compute(0.02, 0.025),
            slack_p_delta=NumericDelta.compute(1.0, 1.05),
            slack_q_delta=NumericDelta.compute(0.5, 0.55),
            node_voltages=(),
            branch_powers=(),
        )

        d = comp.to_dict()
        assert "total_losses_p_delta" in d
        assert "node_voltages" in d
        assert "branch_powers" in d


class TestRunComparisonResult:
    """Test RunComparisonResult construction (P10b)."""

    def test_construction_with_short_circuit(self):
        """RunComparisonResult should include short circuit comparison."""
        run_a_id = uuid4()
        run_b_id = uuid4()
        project_id = uuid4()

        sc_comp = ShortCircuitComparison(
            ikss_delta=NumericDelta.compute(10000.0, 12000.0),
            sk_delta=NumericDelta.compute(100.0, 120.0),
            zth_delta=ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4)),
            ip_delta=NumericDelta.compute(25000.0, 30000.0),
            ith_delta=NumericDelta.compute(11000.0, 13200.0),
        )

        result = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
            short_circuit=sc_comp,
        )

        assert result.run_a_id == run_a_id
        assert result.run_b_id == run_b_id
        assert result.project_id == project_id
        assert result.short_circuit is not None
        assert result.power_flow is None

    def test_to_dict_serialization(self):
        """RunComparisonResult must serialize to dict."""
        run_a_id = uuid4()
        run_b_id = uuid4()
        project_id = uuid4()

        result = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
        )

        d = result.to_dict()
        assert d["run_a_id"] == str(run_a_id)
        assert d["run_b_id"] == str(run_b_id)
        assert d["project_id"] == str(project_id)
        assert d["analysis_type"] == "short_circuit"
        assert "compared_at" in d


class TestComparisonExceptions:
    """Test comparison exception classes (P10b)."""

    def test_project_mismatch_error(self):
        """ProjectMismatchError should contain both project IDs."""
        proj_a = uuid4()
        proj_b = uuid4()
        err = ProjectMismatchError(proj_a, proj_b)

        assert err.run_a_project == proj_a
        assert err.run_b_project == proj_b
        assert str(proj_a) in str(err)
        assert str(proj_b) in str(err)

    def test_analysis_type_mismatch_error(self):
        """AnalysisTypeMismatchError should contain both types."""
        err = AnalysisTypeMismatchError("short_circuit", "power_flow")

        assert err.type_a == "short_circuit"
        assert err.type_b == "power_flow"
        assert "short_circuit" in str(err)
        assert "power_flow" in str(err)

    def test_run_not_found_error(self):
        """RunNotFoundError should contain run ID."""
        run_id = uuid4()
        err = RunNotFoundError(run_id)

        assert err.run_id == run_id
        assert str(run_id) in str(err)

    def test_result_not_found_error(self):
        """ResultNotFoundError should contain run ID and result type."""
        run_id = uuid4()
        err = ResultNotFoundError(run_id, "short_circuit")

        assert err.run_id == run_id
        assert err.result_type == "short_circuit"


class TestDeterminismRequirements:
    """Test determinism requirements for comparison (P10b)."""

    def test_numeric_delta_deterministic_across_calls(self):
        """Multiple calls with same inputs must produce identical results."""
        results = [NumericDelta.compute(12345.6789, 98765.4321) for _ in range(10)]
        first = results[0]
        for r in results[1:]:
            assert r == first

    def test_complex_delta_deterministic_across_calls(self):
        """Multiple calls with same complex inputs must produce identical results."""
        a = complex(1.23456789, 9.87654321)
        b = complex(5.55555555, 4.44444444)
        results = [ComplexDelta.compute(a, b) for _ in range(10)]
        first = results[0]
        for r in results[1:]:
            assert r == first

    def test_comparison_result_deterministic_serialization(self):
        """Serialization must be deterministic."""
        run_a_id = uuid4()
        run_b_id = uuid4()
        project_id = uuid4()
        fixed_time = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)

        sc_comp = ShortCircuitComparison(
            ikss_delta=NumericDelta.compute(10000.0, 12000.0),
            sk_delta=NumericDelta.compute(100.0, 120.0),
            zth_delta=ComplexDelta.compute(complex(0.1, 0.5), complex(0.08, 0.4)),
            ip_delta=NumericDelta.compute(25000.0, 30000.0),
            ith_delta=NumericDelta.compute(11000.0, 13200.0),
        )

        result1 = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
            compared_at=fixed_time,
            short_circuit=sc_comp,
        )
        result2 = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=project_id,
            analysis_type="short_circuit",
            compared_at=fixed_time,
            short_circuit=sc_comp,
        )

        assert result1.to_dict() == result2.to_dict()


class TestEdgeCases:
    """Test edge cases for comparison (P10b)."""

    def test_identical_values_zero_delta(self):
        """Identical values should produce zero delta."""
        delta = NumericDelta.compute(12345.6789, 12345.6789)
        assert delta.delta == 0.0
        assert delta.sign == 0

    def test_very_small_differences(self):
        """Very small differences should be handled correctly."""
        # Within default tolerance
        delta = NumericDelta.compute(1.0, 1.0 + 1e-10)
        assert delta.sign == 0  # Should be treated as zero

        # Outside default tolerance
        delta = NumericDelta.compute(1.0, 1.0 + 1e-8)
        assert delta.sign == 1  # Should be positive

    def test_negative_values(self):
        """Negative values should be handled correctly."""
        delta = NumericDelta.compute(-100.0, -50.0)
        assert delta.delta == 50.0
        assert delta.sign == 1  # -50 > -100

    def test_mixed_sign_values(self):
        """Mixed positive/negative values should be handled correctly."""
        delta = NumericDelta.compute(-100.0, 100.0)
        assert delta.delta == 200.0
        assert delta.sign == 1


class TestComparisonApiResponseModelsAcceptMissingDeltas:
    """FAB-E (E1): api/comparison.py — warstwa API ma WLASNE (pydantic) modele
    odpowiedzi, osobne od `domain.results` (drugie miejsce tej samej klasy
    mechanizmu, KLASA-NIE-INSTANCJA). `compare_runs` zwraca `result.to_dict()`
    surowo, ktore FastAPI waliduje przez `response_model=RunComparisonResponse`
    — gdyby te pola pydantic zostaly required (jak przed naprawa), naprawiony
    serwis zwracajacy `None` dla brakujacych delt wywolalby 500
    (ResponseValidationError) zamiast uczciwego wyniku z brakiem. Test buduje
    modele wprost (bez pelnego setupu HTTP/UnitOfWork) — celowo lekki, mierzy
    DOKLADNIE ryzyko odkryte przy tej karcie."""

    def test_short_circuit_response_accepts_none_deltas(self):
        from api.comparison import ShortCircuitComparisonResponse

        model = ShortCircuitComparisonResponse(
            ikss_delta=None, sk_delta=None, zth_delta=None, ip_delta=None, ith_delta=None
        )
        assert model.ikss_delta is None

    def test_power_flow_response_accepts_none_deltas(self):
        from api.comparison import PowerFlowComparisonResponse

        model = PowerFlowComparisonResponse(
            total_losses_p_delta=None,
            total_losses_q_delta=None,
            slack_p_delta=None,
            slack_q_delta=None,
            bus_voltages=[],
            branch_powers=[],
        )
        assert model.total_losses_p_delta is None

    def test_bus_voltage_and_branch_power_responses_accept_none_deltas(self):
        from api.comparison import BranchPowerComparisonResponse, BusVoltageComparisonResponse

        bus = BusVoltageComparisonResponse(bus_id="bus-1", u_kv_delta=None, u_pu_delta=None)
        branch = BranchPowerComparisonResponse(branch_id="br-1", p_mw_delta=None, q_mvar_delta=None)
        assert bus.u_kv_delta is None
        assert branch.p_mw_delta is None

    def test_protection_response_accepts_none_count_deltas(self):
        from api.comparison import ProtectionComparisonResponse

        model = ProtectionComparisonResponse(
            evaluations=[],
            trip_count_delta=None,
            no_trip_count_delta=None,
            invalid_count_delta=None,
        )
        assert model.trip_count_delta is None

    def test_run_comparison_response_round_trips_service_to_dict_with_missing_fields(self):
        """Dowod end-to-end warstwy API: prawdziwy `ComparisonService` na
        niekompletnym payloadzie -> `to_dict()` -> waliduje sie przez
        `RunComparisonResponse` (dokladnie to, co robi endpoint `compare_runs`)."""
        from api.comparison import RunComparisonResponse
        from application.comparison.service import ComparisonService

        service = ComparisonService(uow_factory=lambda: None)
        payload_a = {"ikss_a": 10000.0, "sk_mva": 100.0, "ip_a": 25000.0, "ith_a": 11000.0}
        payload_b = {"sk_mva": 120.0, "ip_a": 30000.0, "ith_a": 22000.0}  # brak ikss_a
        results_a = [{"result_type": "short_circuit", "payload": payload_a}]
        results_b = [{"result_type": "short_circuit", "payload": payload_b}]
        run_a_id, run_b_id = uuid4(), uuid4()

        sc_comparison = service._compare_short_circuit(results_a, results_b, run_a_id, run_b_id)
        full = RunComparisonResult(
            run_a_id=run_a_id,
            run_b_id=run_b_id,
            project_id=uuid4(),
            analysis_type="short_circuit",
            short_circuit=sc_comparison,
        )

        # To NIE moze podniesc pydantic ValidationError — to byla by regresja
        # dokladnie tej klasy naprawionej w tej karcie.
        response = RunComparisonResponse.model_validate(full.to_dict())
        assert response.short_circuit is not None
        assert response.short_circuit.ikss_delta is None
        assert response.short_circuit.sk_delta is not None
