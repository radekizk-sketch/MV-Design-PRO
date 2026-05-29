"""Testy analizy adekwatnosci mocy biernej (D-06d) — warstwa interpretacji.

Pokrycie: rezerwa Q per zrodlo (arytmetyka headroom dokladnie), nasycenie,
naruszenia napiecia, bilans bierny, "dane niekompletne", determinizm, wywod
White Box, proweniencja ESTIMATED (z realnej karty katalogowej, jak SSCI).

Modul konsumuje plain dataclass'y (NIE importuje solvera — arch_guard zabrania
analysis -> solvers). Napiecia |V| pochodza z gotowego wyniku power-flow,
granice Q z karty/regulatora.
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime

import pytest
from analysis.reactive_adequacy import (
    DEFAULT_U_MAX_PU,
    DEFAULT_U_MIN_PU,
    VERDICT_ADEQUATE,
    VERDICT_EXHAUSTED,
    VERDICT_NO_DATA,
    BusVoltageInput,
    LoadReactiveInput,
    ReactiveAdequacyBuilder,
    ReactiveAdequacyContext,
    SourceReactiveInput,
)
from network_model.catalog.repository import get_default_mv_catalog
from solver_input.provenance import (
    CardFieldStatus,
    FieldQuality,
    resolve_card_field_quality_map,
)


def _ctx() -> ReactiveAdequacyContext:
    return ReactiveAdequacyContext(
        project_name="P",
        case_name="LF_BAZOWY",
        run_timestamp=datetime(2026, 5, 29, tzinfo=UTC),
        snapshot_id="snap-1",
        trace_id="trace-1",
    )


# ---------------------------------------------------------------------------
# Adekwatna rezerwa
# ---------------------------------------------------------------------------


class TestAdequate:
    def test_adequate_when_within_limits_and_voltages_in_band(self) -> None:
        buses = [
            BusVoltageInput("BUS_A", 1.00, 0.95, 1.05),
            BusVoltageInput("BUS_B", 0.98, 0.95, 1.05),
        ]
        sources = [
            SourceReactiveInput(
                "INV1", "BUS_A", q_actual_mvar=0.5, q_min_mvar=-2.0, q_max_mvar=2.0
            ),
            SourceReactiveInput(
                "INV2", "BUS_B", q_actual_mvar=-0.5, q_min_mvar=-1.0, q_max_mvar=1.0
            ),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)

        assert v.verdict == VERDICT_ADEQUATE
        assert v.is_adequate is True
        assert v.summary.saturated_source_count == 0
        assert v.summary.voltage_violation_count == 0
        # Rezerwa systemowa (suma z nienasyconych): w gore = 1.5 + 1.5 = 3.0,
        # w dol = 2.5 + 0.5 = 3.0.
        assert v.summary.network_headroom_up_mvar == 3.0
        assert v.summary.network_headroom_down_mvar == 3.0
        assert v.missing_data == ()

    def test_headroom_arithmetic_exact(self) -> None:
        # ΔQ↑ = Q_max − Q_actual; ΔQ↓ = Q_actual − Q_min (czysta interpretacja).
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.5, q_min_mvar=-2.0, q_max_mvar=2.0),
        ]
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        s = ReactiveAdequacyBuilder().build(buses, sources).sources[0]
        assert s.headroom_up_mvar == 1.5  # 2.0 − 0.5
        assert s.headroom_down_mvar == 2.5  # 0.5 − (−2.0)
        assert s.is_saturated is False
        assert s.at_limit_pl is None

    def test_default_voltage_band_applied_when_bus_has_no_limits(self) -> None:
        # Wezel bez wlasnego pasma -> domyslne 0.95–1.05; 1.0 mieszi sie.
        buses = [BusVoltageInput("B", 1.0)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0)
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.verdict == VERDICT_ADEQUATE
        assert v.default_u_min_pu == DEFAULT_U_MIN_PU
        assert v.default_u_max_pu == DEFAULT_U_MAX_PU


# ---------------------------------------------------------------------------
# Nasycenie zrodla
# ---------------------------------------------------------------------------


class TestSaturated:
    def test_source_at_qmax_is_saturated_and_binding(self) -> None:
        buses = [BusVoltageInput("B", 1.02, 0.95, 1.05)]
        sources = [
            # Przy Q_max = 2.0; rezerwa w gore = 0 -> nasycenie.
            SourceReactiveInput("INV1", "B", q_actual_mvar=2.0, q_min_mvar=-2.0, q_max_mvar=2.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)

        assert v.verdict == VERDICT_EXHAUSTED
        assert v.is_adequate is False
        s = v.sources[0]
        assert s.is_saturated is True
        assert s.at_limit_pl == "Q_max"
        assert s.headroom_up_mvar == 0.0
        assert s.headroom_down_mvar == 4.0
        assert v.summary.saturated_source_refs == ("INV1",)
        # Werdykt raportuje wiazace zrodlo.
        assert "INV1" in v.why_pl
        # Rezerwa systemowa w gore = brak (jedyne zrodlo nasycone w gore).
        assert v.summary.network_headroom_up_mvar is None

    def test_source_at_qmin_is_saturated(self) -> None:
        buses = [BusVoltageInput("B", 0.99, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=-1.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        s = v.sources[0]
        assert s.is_saturated is True
        assert s.at_limit_pl == "Q_min"
        assert s.headroom_down_mvar == 0.0
        assert v.verdict == VERDICT_EXHAUSTED

    def test_one_saturated_among_many_still_reports_systemwide_headroom(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("SAT", "B", q_actual_mvar=2.0, q_min_mvar=-2.0, q_max_mvar=2.0),
            SourceReactiveInput("OK", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.verdict == VERDICT_EXHAUSTED
        assert v.summary.saturated_source_refs == ("SAT",)
        # Rezerwa systemowa liczona tylko z nienasyconego "OK": up=1.0, down=1.0.
        assert v.summary.network_headroom_up_mvar == 1.0
        assert v.summary.network_headroom_down_mvar == 1.0


# ---------------------------------------------------------------------------
# Naruszenie napiecia
# ---------------------------------------------------------------------------


class TestVoltageViolation:
    def test_bus_above_umax_is_flagged(self) -> None:
        buses = [
            BusVoltageInput("HOT", 1.08, 0.95, 1.05),
            BusVoltageInput("OK", 1.00, 0.95, 1.05),
        ]
        sources = [
            SourceReactiveInput("INV1", "HOT", q_actual_mvar=0.0, q_min_mvar=-2.0, q_max_mvar=2.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.verdict == VERDICT_EXHAUSTED
        assert v.summary.voltage_violation_count == 1
        viol = v.voltage_violations[0]
        assert viol.bus_ref == "HOT"
        assert viol.kind_pl == "przekroczenie U_max"
        assert viol.deviation_pu == pytest.approx(0.03)
        assert v.summary.violated_bus_refs == ("HOT",)
        assert "HOT" in v.why_pl

    def test_bus_below_umin_is_flagged_negative_deviation(self) -> None:
        buses = [BusVoltageInput("LOW", 0.90, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "LOW", q_actual_mvar=0.0, q_min_mvar=-2.0, q_max_mvar=2.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        viol = v.voltage_violations[0]
        assert viol.kind_pl == "ponizej U_min"
        assert viol.deviation_pu == pytest.approx(-0.05)

    def test_unsolved_bus_voltage_not_evaluated(self) -> None:
        # Wezel nierozwiazany (v_pu=None) nie wchodzi do naruszen, ale samo to nie
        # blokuje werdyktu, bo inny wezel ma rozwiazane |V|.
        buses = [
            BusVoltageInput("OK", 1.0, 0.95, 1.05),
            BusVoltageInput("DEAD", None, 0.95, 1.05),
        ]
        sources = [
            SourceReactiveInput("INV1", "OK", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.summary.voltage_violation_count == 0
        assert v.verdict == VERDICT_ADEQUATE


# ---------------------------------------------------------------------------
# Bilans bierny
# ---------------------------------------------------------------------------


class TestReactiveBalance:
    def test_balance_splits_generated_absorbed_and_load(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("GEN", "B", q_actual_mvar=1.5, q_min_mvar=-2.0, q_max_mvar=2.0),
            SourceReactiveInput("ABS", "B", q_actual_mvar=-0.5, q_min_mvar=-1.0, q_max_mvar=1.0),
        ]
        loads = [LoadReactiveInput("LOAD1", 0.8), LoadReactiveInput("LOAD2", 0.2)]
        b = ReactiveAdequacyBuilder().build(buses, sources, loads).balance
        assert b.q_generated_mvar == 1.5  # tylko dodatnie Q_actual
        assert b.q_absorbed_by_sources_mvar == 0.5  # |−0.5|
        assert b.net_source_q_mvar == 1.0  # 1.5 + (−0.5)
        assert b.q_load_mvar == 1.0  # 0.8 + 0.2

    def test_balance_none_when_no_q_data(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        # Zrodlo bez Q_actual -> brak danych do bilansu i tak.
        sources = [
            SourceReactiveInput("S", "B", q_actual_mvar=None, q_min_mvar=-1.0, q_max_mvar=1.0)
        ]
        b = ReactiveAdequacyBuilder().build(buses, sources).balance
        assert b.q_generated_mvar is None
        assert b.net_source_q_mvar is None


# ---------------------------------------------------------------------------
# "dane niekompletne"
# ---------------------------------------------------------------------------


class TestMissingData:
    def test_no_power_flow_voltages_is_no_data(self) -> None:
        # Brak rozwiazanego |V| w zadnym wezle -> "dane niekompletne".
        buses = [BusVoltageInput("B", None, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0)
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.verdict == VERDICT_NO_DATA
        assert v.is_adequate is False
        assert "bus_voltages" in v.missing_data

    def test_not_converged_is_no_data(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0)
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources, power_flow_converged=False)
        assert v.verdict == VERDICT_NO_DATA
        assert "power_flow_not_converged" in v.missing_data

    def test_no_controllable_sources_is_no_data(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        v = ReactiveAdequacyBuilder().build(buses, [])
        assert v.verdict == VERDICT_NO_DATA
        assert "controllable_sources" in v.missing_data

    def test_source_missing_limits_marked_not_computed(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("BAD", "B", q_actual_mvar=0.5, q_min_mvar=None, q_max_mvar=2.0),
            SourceReactiveInput("OK", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        bad = next(s for s in v.sources if s.ref == "BAD")
        assert bad.missing_data == ("q_min_mvar",)
        assert bad.headroom_up_mvar is None
        assert bad.white_box == ()
        assert "Dane niekompletne" in bad.why_pl
        assert v.summary.not_computed_source_count == 1
        # Z kompletnym zrodlem "OK" w obszarze regulacji werdykt jest adekwatny.
        assert v.verdict == VERDICT_ADEQUATE

    def test_inconsistent_limits_qmin_gt_qmax(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("BAD", "B", q_actual_mvar=0.0, q_min_mvar=2.0, q_max_mvar=-2.0),
        ]
        s = ReactiveAdequacyBuilder().build(buses, sources).sources[0]
        assert s.missing_data == ("q_limits_inconsistent",)
        assert s.is_saturated is False


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


class TestDeterminism:
    def _inputs(self) -> tuple[list[BusVoltageInput], list[SourceReactiveInput]]:
        buses = [
            BusVoltageInput("B2", 1.0, 0.95, 1.05),
            BusVoltageInput("B1", 1.08, 0.95, 1.05),
        ]
        sources = [
            SourceReactiveInput("S2", "B2", q_actual_mvar=2.0, q_min_mvar=-2.0, q_max_mvar=2.0),
            SourceReactiveInput("S1", "B1", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0),
        ]
        return buses, sources

    def test_identical_id_on_repeat(self) -> None:
        buses, sources = self._inputs()
        a = ReactiveAdequacyBuilder().build(buses, sources, context=_ctx())
        b = ReactiveAdequacyBuilder().build(buses, sources, context=_ctx())
        assert a.analysis_id == b.analysis_id
        assert len(a.analysis_id) == 64
        assert a.to_dict() == b.to_dict()

    def test_id_independent_of_input_order(self) -> None:
        buses, sources = self._inputs()
        a = ReactiveAdequacyBuilder().build(buses, sources, context=_ctx())
        b = ReactiveAdequacyBuilder().build(
            list(reversed(buses)), list(reversed(sources)), context=_ctx()
        )
        assert a.analysis_id == b.analysis_id

    def test_id_changes_with_verdict(self) -> None:
        buses, sources = self._inputs()
        saturated = ReactiveAdequacyBuilder().build(buses, sources, context=_ctx())
        # Rozluznij granice tak, by zadne zrodlo nie bylo nasycone, a napiecia w band.
        relaxed_buses = [
            BusVoltageInput("B1", 1.0, 0.95, 1.05),
            BusVoltageInput("B2", 1.0, 0.95, 1.05),
        ]
        relaxed_sources = [
            SourceReactiveInput("S1", "B1", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0),
            SourceReactiveInput("S2", "B2", q_actual_mvar=0.0, q_min_mvar=-2.0, q_max_mvar=2.0),
        ]
        adequate = ReactiveAdequacyBuilder().build(relaxed_buses, relaxed_sources, context=_ctx())
        assert saturated.verdict == VERDICT_EXHAUSTED
        assert adequate.verdict == VERDICT_ADEQUATE
        assert saturated.analysis_id != adequate.analysis_id


# ---------------------------------------------------------------------------
# White Box + serializacja
# ---------------------------------------------------------------------------


class TestWhiteBoxAndSerialization:
    def test_white_box_present_for_computed_source(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.5, q_min_mvar=-2.0, q_max_mvar=2.0)
        ]
        s = ReactiveAdequacyBuilder().build(buses, sources).sources[0]
        symbols = [step.symbol for step in s.white_box]
        assert symbols == ["ΔQ↑", "ΔQ↓", "nasycenie"]
        for step in s.white_box:
            assert step.formula_latex and step.result_pl and step.unit_check_pl

    def test_violation_white_box_present(self) -> None:
        buses = [BusVoltageInput("HOT", 1.08, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "HOT", q_actual_mvar=0.0, q_min_mvar=-2.0, q_max_mvar=2.0)
        ]
        viol = ReactiveAdequacyBuilder().build(buses, sources).voltage_violations[0]
        assert viol.white_box
        assert viol.white_box[0].formula_latex and viol.white_box[0].unit_check_pl

    def test_to_dict_structure(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.5, q_min_mvar=-2.0, q_max_mvar=2.0)
        ]
        d = ReactiveAdequacyBuilder().build(buses, sources, context=_ctx()).to_dict()
        assert set(d.keys()) == {
            "analysis_id",
            "context",
            "saturation_tol_mvar",
            "default_u_min_pu",
            "default_u_max_pu",
            "verdict",
            "is_adequate",
            "why_pl",
            "sources",
            "voltage_violations",
            "balance",
            "summary",
            "provenance",
            "missing_data",
        }
        assert d["sources"][0]["headroom_up_mvar"] == 1.5
        assert isinstance(d["sources"][0]["white_box"], list)


# ---------------------------------------------------------------------------
# Proweniencja (kompozycja jak SSCI) — z realnej karty katalogowej
# ---------------------------------------------------------------------------


def _reactive_card():
    """Karta przekształtnika z katalogu, ktora ma ustawione qmin_mvar/qmax_mvar."""
    repo = get_default_mv_catalog()
    for c in repo.list_converter_types():
        if c.qmin_mvar is not None and c.qmax_mvar is not None:
            return c
    raise AssertionError("brak karty z granicami Q w katalogu")


def _limits_quality(card) -> FieldQuality:
    """Najgorsza jakosc pol Q-granic karty (jak liczyloby to application)."""
    from analysis.reactive_adequacy import worst_field_quality

    qmap = resolve_card_field_quality_map(card)
    quals = [qmap[name].quality for name in ("qmin_mvar", "qmax_mvar") if name in qmap]
    worst = worst_field_quality(quals)
    assert worst is not None
    return worst


class TestProvenance:
    def test_datasheet_card_limits_tagged_datasheet(self) -> None:
        # Karta z ustawionymi qmin/qmax -> pola Q-granic sa DATASHEET (rating).
        card = _reactive_card()
        quality = _limits_quality(card)
        assert quality is FieldQuality.DATASHEET
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput(
                "INV1",
                "B",
                q_actual_mvar=0.0,
                q_min_mvar=card.qmin_mvar,
                q_max_mvar=card.qmax_mvar,
                limits_field_quality=quality,
            )
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.provenance is not None
        assert v.provenance.worst_quality == FieldQuality.DATASHEET.value
        assert v.provenance.is_estimated is False
        assert "oszacowanych" not in v.why_pl

    def test_estimated_limits_tag_carried_and_composed(self) -> None:
        # Wymus ESTIMATED dla pol Q-granic karty (jak SSCI: override card_field_status)
        # i sprawdz, ze worst-case proweniencji jest ESTIMATED + znacznik w why_pl.
        card = _reactive_card()
        override = {
            "qmin_mvar": CardFieldStatus(field_name="qmin_mvar", quality=FieldQuality.ESTIMATED),
            "qmax_mvar": CardFieldStatus(field_name="qmax_mvar", quality=FieldQuality.ESTIMATED),
        }
        estimated_card = dataclasses.replace(card, card_field_status=override)
        quality = _limits_quality(estimated_card)
        assert quality is FieldQuality.ESTIMATED

        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput(
                "INV1",
                "B",
                q_actual_mvar=0.0,
                q_min_mvar=card.qmin_mvar,
                q_max_mvar=card.qmax_mvar,
                limits_field_quality=quality,
            )
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.provenance is not None
        assert v.provenance.worst_quality == FieldQuality.ESTIMATED.value
        assert v.provenance.is_estimated is True
        # Estymata NIE blokuje werdyktu (tylko tag).
        assert v.verdict == VERDICT_ADEQUATE
        # Znacznik proweniencji wkomponowany w uzasadnienie.
        assert "oszacowanych granicach mocy biernej" in v.why_pl

    def test_worst_case_is_estimated_when_mixed(self) -> None:
        # Jedno zrodlo ESTIMATED wsrod DATASHEET ciagnie worst-case do ESTIMATED.
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput(
                "DS",
                "B",
                q_actual_mvar=0.0,
                q_min_mvar=-1.0,
                q_max_mvar=1.0,
                limits_field_quality=FieldQuality.DATASHEET,
            ),
            SourceReactiveInput(
                "EST",
                "B",
                q_actual_mvar=0.0,
                q_min_mvar=-1.0,
                q_max_mvar=1.0,
                limits_field_quality=FieldQuality.ESTIMATED,
            ),
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.provenance is not None
        assert v.provenance.worst_quality == FieldQuality.ESTIMATED.value

    def test_no_provenance_when_no_quality_supplied(self) -> None:
        buses = [BusVoltageInput("B", 1.0, 0.95, 1.05)]
        sources = [
            SourceReactiveInput("INV1", "B", q_actual_mvar=0.0, q_min_mvar=-1.0, q_max_mvar=1.0)
        ]
        v = ReactiveAdequacyBuilder().build(buses, sources)
        assert v.provenance is None


# ---------------------------------------------------------------------------
# Walidacja konfiguracji buildera
# ---------------------------------------------------------------------------


class TestValidation:
    def test_invalid_voltage_band_raises(self) -> None:
        with pytest.raises(ValueError):
            ReactiveAdequacyBuilder(default_u_min_pu=1.05, default_u_max_pu=0.95)

    def test_negative_tolerance_raises(self) -> None:
        with pytest.raises(ValueError):
            ReactiveAdequacyBuilder(saturation_tol_mvar=-0.1)

    def test_empty_voltages_and_sources_is_no_data(self) -> None:
        v = ReactiveAdequacyBuilder().build([], [])
        assert v.verdict == VERDICT_NO_DATA
        assert "bus_voltages" in v.missing_data
        assert "controllable_sources" in v.missing_data
