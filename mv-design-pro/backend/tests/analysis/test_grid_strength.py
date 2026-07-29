"""Testy analizy siły sieci (SCR/WSCR) — §8C.4 / K-30.

Pokrycie: klasyfikacja SCR per węzeł, formuła WSCR (ERCOT), determinizm,
braki danych, wywód White Box, serializacja, walidacja progów.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from analysis.grid_strength import (
    DEFAULT_VERY_WEAK_THRESHOLD,
    DEFAULT_WEAK_THRESHOLD,
    BusStrengthInput,
    GridStrengthBuilder,
    GridStrengthContext,
)


def _ctx() -> GridStrengthContext:
    return GridStrengthContext(
        project_name="P",
        case_name="ZWARCIOWY_MAKS",
        case_id=None,
        run_timestamp=datetime(2026, 5, 28, tzinfo=UTC),
        snapshot_hash="snap-1",
        run_id="trace-1",
    )


class TestScrClassification:
    def test_strong_grid(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("BUS", 15.0, 500.0, 100.0)])
        e = v.entries[0]
        assert e.scr == 5.0
        assert e.verdict == "mocna"
        assert e.is_weak is False
        assert e.missing_data == ()

    def test_weak_grid(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("BUS", 15.0, 250.0, 100.0)])
        e = v.entries[0]
        assert e.scr == 2.5
        assert e.verdict == "słaba"
        assert e.is_weak is True

    def test_very_weak_grid(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("BUS", 15.0, 150.0, 100.0)])
        e = v.entries[0]
        assert e.scr == 1.5
        assert e.verdict == "bardzo słaba"
        assert e.is_weak is True

    def test_boundary_scr_equals_weak_threshold_is_strong(self) -> None:
        # SCR == 3.0 nie jest < 3.0 → sieć mocna (granica włączona do "mocna").
        v = GridStrengthBuilder().build([BusStrengthInput("BUS", 15.0, 300.0, 100.0)])
        assert v.entries[0].scr == 3.0
        assert v.entries[0].verdict == "mocna"

    def test_boundary_scr_equals_very_weak_threshold_is_weak(self) -> None:
        # SCR == 2.0 nie jest < 2.0 → "słaba" (nie "bardzo słaba").
        v = GridStrengthBuilder().build([BusStrengthInput("BUS", 15.0, 200.0, 100.0)])
        assert v.entries[0].scr == 2.0
        assert v.entries[0].verdict == "słaba"


class TestMissingData:
    @pytest.mark.parametrize(
        "s_sc,s_inst,expect_missing",
        [
            (None, 100.0, ("s_sc_mva",)),
            (0.0, 100.0, ("s_sc_mva",)),
            (300.0, None, ("s_installed_mva",)),
            (300.0, 0.0, ("s_installed_mva",)),
            (None, None, ("s_sc_mva", "s_installed_mva")),
        ],
    )
    def test_missing_inputs_yield_no_data(
        self, s_sc: float | None, s_inst: float | None, expect_missing: tuple[str, ...]
    ) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("BUS", 15.0, s_sc, s_inst)])
        e = v.entries[0]
        assert e.scr is None
        assert e.verdict == "brak danych"
        assert e.is_weak is False
        assert e.missing_data == expect_missing
        assert e.white_box == ()
        assert "Dane niekompletne" in e.why_pl


class TestWscr:
    def test_wscr_ercot_formula(self) -> None:
        # WSCR = Σ(S_sc·S_n) / (Σ S_n)²
        # = (500·100 + 150·100 + 250·100) / (300)² = 90000/90000 = 1.0
        v = GridStrengthBuilder().build(
            [
                BusStrengthInput("A", 15.0, 500.0, 100.0),
                BusStrengthInput("B", 15.0, 150.0, 100.0),
                BusStrengthInput("C", 15.0, 250.0, 100.0),
            ]
        )
        assert v.summary.wscr == 1.0
        assert v.summary.wscr_verdict == "bardzo słaba"

    def test_wscr_single_source_equals_scr(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("A", 15.0, 500.0, 100.0)])
        assert v.summary.wscr == v.entries[0].scr == 5.0

    def test_wscr_excludes_incomplete_bus(self) -> None:
        # Węzeł bez danych nie wchodzi do WSCR.
        v = GridStrengthBuilder().build(
            [
                BusStrengthInput("A", 15.0, 500.0, 100.0),
                BusStrengthInput("Z", 15.0, None, 100.0),
            ]
        )
        assert v.summary.wscr == 5.0  # tylko A
        assert v.summary.not_computed_count == 1

    def test_wscr_none_when_no_valid_bus(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("Z", 15.0, None, None)])
        assert v.summary.wscr is None
        assert v.summary.wscr_verdict == "brak danych"


class TestSummaryAndDeterminism:
    def _inputs(self) -> list[BusStrengthInput]:
        return [
            BusStrengthInput("BUS_B", 15.0, 150.0, 100.0),
            BusStrengthInput("BUS_A", 15.0, 500.0, 100.0),
            BusStrengthInput("BUS_C", 15.0, 250.0, 100.0),
            BusStrengthInput("BUS_D", 15.0, None, 100.0),
        ]

    def test_entries_sorted_by_bus_ref(self) -> None:
        v = GridStrengthBuilder().build(self._inputs())
        assert [e.bus_ref for e in v.entries] == ["BUS_A", "BUS_B", "BUS_C", "BUS_D"]

    def test_summary_counts(self) -> None:
        v = GridStrengthBuilder().build(self._inputs())
        assert v.summary.total_buses == 4
        assert v.summary.weak_bus_count == 2  # B, C
        assert v.summary.not_computed_count == 1  # D

    def test_determinism_independent_of_order(self) -> None:
        a = GridStrengthBuilder().build(self._inputs(), _ctx())
        b = GridStrengthBuilder().build(list(reversed(self._inputs())), _ctx())
        assert a.analysis_id == b.analysis_id
        assert len(a.analysis_id) == 64

    def test_analysis_id_changes_with_threshold(self) -> None:
        a = GridStrengthBuilder().build(self._inputs(), _ctx())
        b = GridStrengthBuilder(weak_threshold=4.0).build(self._inputs(), _ctx())
        assert a.analysis_id != b.analysis_id


class TestWhiteBoxAndSerialization:
    def test_white_box_present_for_computed_entry(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("A", 15.0, 250.0, 100.0)])
        steps = v.entries[0].white_box
        assert len(steps) == 2
        assert steps[0].symbol == "SCR"
        assert "S_{sc}" in steps[0].formula_latex
        assert steps[1].symbol == "werdykt"

    def test_to_dict_structure(self) -> None:
        v = GridStrengthBuilder().build([BusStrengthInput("A", 15.0, 250.0, 100.0)], _ctx())
        d = v.to_dict()
        assert set(d.keys()) == {
            "analysis_id",
            "context",
            "weak_threshold",
            "very_weak_threshold",
            "entries",
            "summary",
        }
        entry = d["entries"][0]
        assert entry["bus_ref"] == "A"
        assert entry["scr"] == 2.5
        assert entry["verdict"] == "słaba"
        assert isinstance(entry["white_box"], list)
        assert d["summary"]["wscr"] == 2.5

    def test_defaults_exposed(self) -> None:
        assert DEFAULT_WEAK_THRESHOLD == 3.0
        assert DEFAULT_VERY_WEAK_THRESHOLD == 2.0


class TestValidation:
    def test_invalid_thresholds_raise(self) -> None:
        with pytest.raises(ValueError):
            GridStrengthBuilder(weak_threshold=2.0, very_weak_threshold=3.0)

    def test_empty_inputs_produce_empty_view(self) -> None:
        v = GridStrengthBuilder().build([])
        assert v.entries == ()
        assert v.summary.total_buses == 0
        assert v.summary.wscr is None
