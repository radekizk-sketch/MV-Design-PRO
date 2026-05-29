"""Tests for the per-voltage-level Ik'' plausibility guard (D-14)."""

from __future__ import annotations

import math

import pytest
from analysis.short_circuit_plausibility import evaluate_ikss_plausibility


def _codes(verdict) -> list[str]:
    return [violation.code for violation in verdict.violations]


# ---------------------------------------------------------------------------
# The canonical motivating case: 116 kA on a 15 kV MV bus is absurd.
# ---------------------------------------------------------------------------


def test_116_ka_on_15_kv_is_implausible() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=116_000.0, nominal_voltage_v=15_000.0)
    assert verdict.status == "niewiarygodny"
    assert verdict.voltage_band == "SN"
    assert "SC-IK-ABSURD" in _codes(verdict)
    assert verdict.violations[0].severity == "error"
    assert verdict.violations[0].bound_ka == 63.0


def test_credible_mv_fault_current_is_plausible() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=9_620.0, nominal_voltage_v=15_000.0)
    assert verdict.status == "wiarygodny"
    assert verdict.voltage_band == "SN"
    assert verdict.violations == ()


def test_mv_above_common_rating_is_suspect() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=55_000.0, nominal_voltage_v=15_000.0)
    assert verdict.status == "podejrzany"
    assert "SC-IK-HIGH" in _codes(verdict)
    assert verdict.violations[0].severity == "warning"


# ---------------------------------------------------------------------------
# Per-voltage-level band behaviour.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "ikss_a, un_v, expected_band, expected_status",
    [
        (50_000.0, 400.0, "nN", "wiarygodny"),
        (150_000.0, 400.0, "nN", "podejrzany"),
        (250_000.0, 400.0, "nN", "niewiarygodny"),
        (10_000.0, 15_000.0, "SN", "wiarygodny"),
        (64_000.0, 15_000.0, "SN", "niewiarygodny"),
        (40_000.0, 110_000.0, "WN", "wiarygodny"),
        (120_000.0, 110_000.0, "WN", "niewiarygodny"),
        (80_000.0, 400_000.0, "NN", "wiarygodny"),
        (130_000.0, 400_000.0, "NN", "niewiarygodny"),
    ],
)
def test_band_classification_and_status(ikss_a, un_v, expected_band, expected_status) -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=ikss_a, nominal_voltage_v=un_v)
    assert verdict.voltage_band == expected_band
    assert verdict.status == expected_status


@pytest.mark.parametrize(
    "un_v, expected_band",
    [
        (1_000.0, "nN"),
        (1_001.0, "SN"),
        (52_000.0, "SN"),
        (52_001.0, "WN"),
        (245_000.0, "WN"),
        (245_001.0, "NN"),
    ],
)
def test_band_boundaries(un_v, expected_band) -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=1_000.0, nominal_voltage_v=un_v)
    assert verdict.voltage_band == expected_band


# ---------------------------------------------------------------------------
# Degenerate / non-physical inputs.
# ---------------------------------------------------------------------------


def test_non_positive_current_is_implausible() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=-5.0, nominal_voltage_v=15_000.0)
    assert verdict.status == "niewiarygodny"
    assert "SC-IK-NONPOS" in _codes(verdict)


def test_zero_current_is_implausible() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=0.0, nominal_voltage_v=15_000.0)
    assert verdict.status == "niewiarygodny"
    assert "SC-IK-NONPOS" in _codes(verdict)


def test_non_finite_current_is_implausible() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=math.inf, nominal_voltage_v=15_000.0)
    assert verdict.status == "niewiarygodny"
    assert "SC-IK-NAN" in _codes(verdict)


def test_invalid_voltage_is_flagged() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=10_000.0, nominal_voltage_v=0.0)
    assert verdict.status == "niewiarygodny"
    assert verdict.voltage_band == "nieokreślone"
    assert "SC-IK-UN-INVALID" in _codes(verdict)


# ---------------------------------------------------------------------------
# Contract / determinism.
# ---------------------------------------------------------------------------


def test_to_dict_contract() -> None:
    verdict = evaluate_ikss_plausibility(ikss_a=9_620.0, nominal_voltage_v=15_000.0)
    payload = verdict.to_dict()
    assert payload["contract"] == "ShortCircuitPlausibilityV1"
    assert set(payload) == {
        "contract",
        "status",
        "voltage_band",
        "voltage_band_label_pl",
        "nominal_kv",
        "ikss_ka",
        "ceiling_high_ka",
        "ceiling_max_ka",
        "violations",
    }


def test_determinism() -> None:
    a = evaluate_ikss_plausibility(ikss_a=116_000.0, nominal_voltage_v=15_000.0)
    b = evaluate_ikss_plausibility(ikss_a=116_000.0, nominal_voltage_v=15_000.0)
    assert a.to_dict() == b.to_dict()
