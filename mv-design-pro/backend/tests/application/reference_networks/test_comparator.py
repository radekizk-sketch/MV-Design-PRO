"""Tests for comparator engine (PF / SC / overall validation)."""

from __future__ import annotations

from application.reference_networks.comparator import (
    ElementComparison,
    build_validation_report,
    compare_power_flow,
    compare_short_circuit,
)
from application.reference_networks.expected_values import (
    ExpectedBusPF,
    ExpectedShortCircuit,
    ExpectedValues,
)


class TestComparePowerFlow:
    """Per-bus PF comparison logic."""

    def test_matching_voltages_pass(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0, rtol=1e-3),),
        )
        actual = {"BUS-1": {"v_pu": 1.0, "angle_deg": 0.0}}
        result = compare_power_flow(actual, expected)
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "PASS"

    def test_out_of_tolerance_fails(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0, rtol=1e-3),),
        )
        actual = {"BUS-1": {"v_pu": 1.5, "angle_deg": 0.0}}  # 50% off
        result = compare_power_flow(actual, expected)
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "FAIL"

    def test_missing_bus_in_actual_fails(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0),),
        )
        actual: dict[str, dict[str, float]] = {}
        result = compare_power_flow(actual, expected)
        assert all(c.status == "FAIL" for c in result)

    def test_missing_v_pu_field_is_incomparable_not_zero(self) -> None:
        """FAB-E (E1): brak POLA v_pu (szyna OBECNA) to NIEPOROWNYWALNY, nie FAIL od 0.0.

        Rozroznienie od `test_missing_bus_in_actual_fails`: tutaj szyna JEST w
        wyniku aktualnym, ale bez klucza 'v_pu' — porownanie fabrykowanego 0.0
        z oczekiwana wartoscia dawaloby losowy/mylacy status FAIL zamiast
        uczciwie zaznaczyc niewykonalnosc porownania.
        """
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.0),),
        )
        actual = {"BUS-1": {"angle_deg": 0.0}}  # v_pu celowo brak
        result = compare_power_flow(actual, expected)
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "NIEPOROWNYWALNY"
        assert "v_pu" in v_comp.note
        # angle_deg jest OBECNE i musi zostac ocenione niezaleznie (nie
        # ukryte przez brak v_pu).
        angle_comp = next(c for c in result if c.quantity == "angle_deg")
        assert angle_comp.status == "PASS"

    def test_missing_angle_deg_field_is_incomparable_not_zero(self) -> None:
        """FAB-E (E1): brak POLA angle_deg to NIEPOROWNYWALNY, nie FAIL od 0.0."""
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=5.0),),
        )
        actual = {"BUS-1": {"v_pu": 1.0}}  # angle_deg celowo brak
        result = compare_power_flow(actual, expected)
        angle_comp = next(c for c in result if c.quantity == "angle_deg")
        assert angle_comp.status == "NIEPOROWNYWALNY"
        assert "angle_deg" in angle_comp.note
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "PASS"

    def test_no_expected_angle_skips_comparison_not_fabricates_zero(self) -> None:
        """FAB-E (E1): brak OCZEKIWANEGO kata w wyroczni nie generuje wiersza.

        Autor fikstury moze celowo nie podac oczekiwanego kata (interesuje go
        tylko modul napiecia) — to NIE jest oczekiwanie "0 stopni": zamiast
        fabrykowac porownanie, angle_deg po prostu nie pojawia sie w wyniku.
        """
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=None),),
        )
        actual = {"BUS-1": {"v_pu": 1.0, "angle_deg": 47.0}}  # solver policzyl realny kat
        result = compare_power_flow(actual, expected)
        assert not any(c.quantity == "angle_deg" for c in result)
        v_comp = next(c for c in result if c.quantity == "v_pu")
        assert v_comp.status == "PASS"

    def test_angle_comparison_lenient_near_zero(self) -> None:
        """Small expected angles should tolerate 0.5° absolute."""
        expected = ExpectedValues(
            network_id="test",
            source="test",
            power_flow=(ExpectedBusPF(bus_id="BUS-1", v_pu=1.0, angle_deg=0.1, rtol=1e-3),),
        )
        actual = {"BUS-1": {"v_pu": 1.0, "angle_deg": 0.3}}  # 0.2° off, small angle
        result = compare_power_flow(actual, expected)
        angle_comp = next(c for c in result if c.quantity == "angle_deg")
        assert angle_comp.status == "PASS"


class TestCompareShortCircuit:
    """Per-fault SC comparison logic."""

    def test_matching_ikss_passes(self) -> None:
        expected = ExpectedValues(
            network_id="test",
            source="test",
            short_circuit=(
                ExpectedShortCircuit(
                    fault_node_id="BUS-1",
                    sc_type="3F",
                    ikss_a=10000.0,
                    ip_a=25000.0,
                    ith_a=12000.0,
                    sk_mva=500.0,
                    rtol=2e-2,
                ),
            ),
        )
        actual = {
            "BUS-1__3F": {"ikss_a": 10100.0, "ip_a": 25200.0, "ith_a": 12100.0, "sk_mva": 505.0},
        }
        result = compare_short_circuit(actual, expected)
        # All values within 2% tolerance - all PASS
        assert all(c.status == "PASS" for c in result)


class TestBuildValidationReport:
    """Aggregate report logic."""

    def test_all_pass_gives_overall_pass(self) -> None:
        pf_comp = (ElementComparison("B1", "v_pu", 1.0, 1.0, 1e-3, 0.0, 0.0, "PASS"),)
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test Network",
            source="test source",
            solver_version="v1",
            pf_comparisons=pf_comp,
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        assert report.overall_status == "PASS"
        assert report.pf_pass_count == 1
        assert report.pf_fail_count == 0

    def test_any_fail_gives_overall_fail(self) -> None:
        pf_comp = (
            ElementComparison("B1", "v_pu", 1.0, 1.0, 1e-3, 0.0, 0.0, "PASS"),
            ElementComparison("B2", "v_pu", 1.5, 1.0, 1e-3, 0.5, 0.5, "FAIL"),
        )
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test Network",
            source="test source",
            solver_version="v1",
            pf_comparisons=pf_comp,
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        assert report.overall_status == "FAIL"
        assert report.pf_pass_count == 1
        assert report.pf_fail_count == 1

    def test_incomparable_item_gives_overall_fail_not_silent_pass(self) -> None:
        """FAB-E (E1): pozycja NIEPOROWNYWALNA nie moze cicho dac overall PASS.

        Bez tej poprawki: NIEPOROWNYWALNY nie pasowal do licznika PASS ani
        FAIL, wiec `pf_fail_count == 0` i overall wychodzil PASS — certyfikacja
        „zgodnosci" sieci, ktorej w rzeczywistosci NIE dalo sie zweryfikowac.
        """
        pf_comp = (
            ElementComparison(
                "B1",
                "v_pu",
                float("nan"),
                1.0,
                1e-3,
                float("nan"),
                float("nan"),
                "NIEPOROWNYWALNY",
                "Brak pola 'v_pu' w wyniku aktualnym — porownanie niewykonalne.",
            ),
        )
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test Network",
            source="test source",
            solver_version="v1",
            pf_comparisons=pf_comp,
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        assert report.overall_status == "FAIL"
        assert report.pf_incomparable_count == 1
        assert report.pf_fail_count == 0
        assert report.pf_pass_count == 0

    def test_report_serializes_to_dict(self) -> None:
        report = build_validation_report(
            network_id="test",
            network_name_pl="Test",
            source="src",
            solver_version="v1",
            pf_comparisons=(),
            pf_branch_comparisons=(),
            sc_comparisons=(),
        )
        d = report.to_dict()
        assert d["network_id"] == "test"
        assert d["overall_status"] == "PASS"
        assert "pf_comparisons" in d
