"""Testy sanity-bounds Ik'' per poziom napięcia (DEF-01 / K-08)."""

from __future__ import annotations

import pytest
from analysis.sanity_bounds import (
    CREDIBLE,
    INCOMPLETE,
    OUT_OF_RANGE,
    evaluate_short_circuit_current,
)


class TestShortCircuitBounds:
    def test_def01_116ka_on_sn_15kv_is_out_of_range_and_blocks_osd(self) -> None:
        # Dokładny defekt DEF-01: 116 kA na SN 15 kV musi być złapane.
        v = evaluate_short_circuit_current(15.0, 116.92)
        assert v.in_range is False
        assert v.status == OUT_OF_RANGE
        assert v.blocks_osd_package is True
        assert v.voltage_band == "SN"
        assert "przekracza" in v.why_pl

    def test_typical_sn_value_is_credible(self) -> None:
        v = evaluate_short_circuit_current(15.0, 12.5)
        assert v.in_range is True
        assert v.status == CREDIBLE
        assert v.blocks_osd_package is False

    @pytest.mark.parametrize(
        "kv,ka,band,in_range",
        [
            (0.4, 25.0, "nN", True),
            (0.4, 200.0, "nN", False),
            (15.0, 25.0, "SN", True),
            (20.0, 60.0, "SN", False),
            (110.0, 40.0, "WN", True),
            (110.0, 90.0, "WN", False),
            (220.0, 50.0, "NN", True),
        ],
    )
    def test_bands(self, kv: float, ka: float, band: str, in_range: bool) -> None:
        v = evaluate_short_circuit_current(kv, ka)
        assert v.voltage_band == band
        assert v.in_range is in_range
        assert v.status == (CREDIBLE if in_range else OUT_OF_RANGE)

    def test_below_lower_bound_flagged(self) -> None:
        v = evaluate_short_circuit_current(15.0, 0.0)
        # Ik''=0 → traktowane jako brak danych (≤0 niefizyczne wejście)
        assert v.status in {OUT_OF_RANGE, INCOMPLETE}
        v2 = evaluate_short_circuit_current(15.0, 0.05)
        assert v2.in_range is False and v2.status == OUT_OF_RANGE

    @pytest.mark.parametrize("kv,ka", [(None, 12.0), (15.0, None), (-1.0, 12.0), (0.0, 12.0)])
    def test_incomplete_inputs(self, kv: float | None, ka: float | None) -> None:
        v = evaluate_short_circuit_current(kv, ka)
        assert v.status == INCOMPLETE
        assert v.blocks_osd_package is False

    def test_nan_inf_incomplete(self) -> None:
        assert evaluate_short_circuit_current(15.0, float("inf")).status == INCOMPLETE
        assert evaluate_short_circuit_current(15.0, float("nan")).status == INCOMPLETE

    def test_determinism_and_serialization(self) -> None:
        a = evaluate_short_circuit_current(15.0, 12.5).to_dict()
        b = evaluate_short_circuit_current(15.0, 12.5).to_dict()
        assert a == b
        assert set(a.keys()) == {
            "voltage_kv",
            "ikss_ka",
            "voltage_band",
            "lower_ka",
            "upper_ka",
            "in_range",
            "status",
            "why_pl",
            "blocks_osd_package",
        }
