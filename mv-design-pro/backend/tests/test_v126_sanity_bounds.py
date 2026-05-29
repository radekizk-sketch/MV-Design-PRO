"""Unit tests for the V12.6 absurdity barriers (D-14, K-08).

These cover the pure sanity-bound functions in isolation: a plausible result
must pass, and every physically impossible / implausible value must be flagged
with the right code and status.
"""

from __future__ import annotations

import math

from network_model.solvers.v126_sanity import (
    MINUTES_PER_YEAR,
    opf_loss_sanity,
    reliability_sanity,
    uncertainty_sanity,
)


class _Bus:
    def __init__(self, load_mw=0.0, load_mvar=0.0, generation_mw=0.0, generation_mvar=0.0):
        self.load_mw = load_mw
        self.load_mvar = load_mvar
        self.generation_mw = generation_mw
        self.generation_mvar = generation_mvar


class _Model:
    def __init__(self, buses):
        self.buses = buses


def _codes(verdict) -> list[str]:
    return [item["code"] for item in verdict["violations"]]


# ---------------------------------------------------------------------------
# Reliability
# ---------------------------------------------------------------------------


def _reliability_payload(saidi=10.8, saifi=0.015, caidi=720.0, loadings=None):
    ranking = [{"contingency": "K1", "max_loading_percent": v} for v in (loadings or [17.6])]
    return {
        "indices": {
            "saidi_min_per_year": saidi,
            "saifi_per_year": saifi,
            "caidi_min_per_interruption": caidi,
        },
        "contingency_ranking": ranking,
    }


def test_reliability_plausible_is_credible() -> None:
    verdict = reliability_sanity(_reliability_payload(), _Model([]))
    assert verdict["status"] == "wiarygodny"
    assert verdict["violations"] == []
    assert verdict["contract"] == "AbsurdityBarrierV1"
    assert verdict["checks_total"] >= 1


def test_reliability_negative_saidi_is_implausible() -> None:
    verdict = reliability_sanity(_reliability_payload(saidi=-1.0), _Model([]))
    assert verdict["status"] == "niewiarygodny"
    assert "REL-SAIDI-NEG" in _codes(verdict)


def test_reliability_saidi_exceeding_year_is_implausible() -> None:
    verdict = reliability_sanity(_reliability_payload(saidi=MINUTES_PER_YEAR + 1.0), _Model([]))
    assert verdict["status"] == "niewiarygodny"
    assert "REL-SAIDI-MAX" in _codes(verdict)


def test_reliability_saifi_per_minute_is_implausible() -> None:
    verdict = reliability_sanity(_reliability_payload(saifi=MINUTES_PER_YEAR + 1.0), _Model([]))
    assert verdict["status"] == "niewiarygodny"
    assert "REL-SAIFI-MAX" in _codes(verdict)


def test_reliability_high_saifi_is_suspect() -> None:
    verdict = reliability_sanity(_reliability_payload(saifi=9000.0), _Model([]))
    assert verdict["status"] == "podejrzany"
    assert "REL-SAIFI-HIGH" in _codes(verdict)


def test_reliability_caidi_exceeding_year_is_implausible() -> None:
    verdict = reliability_sanity(_reliability_payload(caidi=MINUTES_PER_YEAR + 1.0), _Model([]))
    assert "REL-CAIDI-MAX" in _codes(verdict)


def test_reliability_nan_saidi_is_implausible() -> None:
    verdict = reliability_sanity(_reliability_payload(saidi=math.nan), _Model([]))
    assert verdict["status"] == "niewiarygodny"
    assert "REL-SAIDI-NAN" in _codes(verdict)


def test_reliability_negative_loading_is_implausible() -> None:
    verdict = reliability_sanity(_reliability_payload(loadings=[-3.0]), _Model([]))
    assert "REL-LOAD-NEG" in _codes(verdict)


def test_reliability_absurd_loading_is_suspect() -> None:
    verdict = reliability_sanity(_reliability_payload(loadings=[500_000.0]), _Model([]))
    assert "REL-LOAD-ABSURD" in _codes(verdict)


# ---------------------------------------------------------------------------
# OPF / losses / LCC
# ---------------------------------------------------------------------------


def _opf_payload(total=23.4, branches=None, kwh=93_600.0, lcc=1000.0, co2=50.0):
    return {
        "total_losses_kw": total,
        "branch_losses": (
            branches if branches is not None else [{"branch_ref": "K1", "loss_kw": 5.1}]
        ),
        "annual_losses_kwh": kwh,
        "lcc_loss_opex_pv_pln": lcc,
        "annual_co2_kg": co2,
    }


def _supply_model():
    return _Model([_Bus(load_mw=1.4, load_mvar=0.45, generation_mw=0.3)])


def test_opf_plausible_is_credible() -> None:
    verdict = opf_loss_sanity(_opf_payload(), _supply_model())
    assert verdict["status"] == "wiarygodny"
    assert verdict["violations"] == []


def test_opf_negative_total_losses_is_implausible() -> None:
    verdict = opf_loss_sanity(_opf_payload(total=-1.0), _supply_model())
    assert verdict["status"] == "niewiarygodny"
    assert "OPF-LOSS-NEG" in _codes(verdict)


def test_opf_negative_branch_loss_is_implausible() -> None:
    payload = _opf_payload(branches=[{"branch_ref": "K2", "loss_kw": -0.1}])
    verdict = opf_loss_sanity(payload, _supply_model())
    assert "OPF-BRANCH-LOSS-NEG" in _codes(verdict)


def test_opf_negative_energy_cost_co2_are_implausible() -> None:
    verdict = opf_loss_sanity(_opf_payload(kwh=-1.0, lcc=-1.0, co2=-1.0), _supply_model())
    codes = _codes(verdict)
    assert "OPF-ENERGY-NEG" in codes
    assert "OPF-LCC-NEG" in codes
    assert "OPF-CO2-NEG" in codes


def test_opf_losses_exceeding_supply_are_suspect() -> None:
    # Supply ~ hypot(1.4,0.45)+0.3 ≈ 1.77 MVA → 1770 kW. Losses 5000 kW > supply.
    verdict = opf_loss_sanity(_opf_payload(total=5000.0), _supply_model())
    assert verdict["status"] == "podejrzany"
    assert "OPF-LOSS-RATIO" in _codes(verdict)


def test_opf_nan_total_losses_is_implausible() -> None:
    verdict = opf_loss_sanity(_opf_payload(total=math.inf), _supply_model())
    assert "OPF-LOSS-NAN" in _codes(verdict)


# ---------------------------------------------------------------------------
# Uncertainty
# ---------------------------------------------------------------------------


def test_uncertainty_plausible_is_credible() -> None:
    verdict = uncertainty_sanity({"expanded_uncertainty_percent_k2": 2.17}, None)
    assert verdict["status"] == "wiarygodny"
    assert verdict["violations"] == []


def test_uncertainty_negative_is_implausible() -> None:
    verdict = uncertainty_sanity({"expanded_uncertainty_percent_k2": -1.0}, None)
    assert verdict["status"] == "niewiarygodny"
    assert "UNC-NEG" in _codes(verdict)


def test_uncertainty_over_100_is_suspect() -> None:
    verdict = uncertainty_sanity({"expanded_uncertainty_percent_k2": 150.0}, None)
    assert verdict["status"] == "podejrzany"
    assert "UNC-OVER-100" in _codes(verdict)


def test_uncertainty_over_1000_is_implausible() -> None:
    verdict = uncertainty_sanity({"expanded_uncertainty_percent_k2": 2500.0}, None)
    assert verdict["status"] == "niewiarygodny"
    assert "UNC-ABSURD" in _codes(verdict)


def test_uncertainty_nan_is_implausible() -> None:
    verdict = uncertainty_sanity({"expanded_uncertainty_percent_k2": math.nan}, None)
    assert "UNC-NAN" in _codes(verdict)


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


def test_sanity_verdicts_are_deterministic() -> None:
    assert reliability_sanity(_reliability_payload(), _Model([])) == reliability_sanity(
        _reliability_payload(), _Model([])
    )
    assert opf_loss_sanity(_opf_payload(), _supply_model()) == opf_loss_sanity(
        _opf_payload(), _supply_model()
    )
    assert uncertainty_sanity(
        {"expanded_uncertainty_percent_k2": 2.17}, None
    ) == uncertainty_sanity({"expanded_uncertainty_percent_k2": 2.17}, None)
