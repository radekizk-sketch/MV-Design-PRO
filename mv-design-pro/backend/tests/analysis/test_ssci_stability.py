"""Tests for the D-03 SSCI VERDICT (analysis layer) — impedance-based stability.

The PHYSICS half (the SSCI solver emitting Z_grid(f)/Z_conv(f)/L(f)) is tested in
``tests/test_v126_ssci_impedance.py``. Here we test the ANALYSIS-layer verdict:
the Nyquist / impedance-ratio stability classification per Sun (2011) and Wen
(2016), built by feeding the SERIALIZED solver payload to ``SsciStabilityBuilder``.

Two literature-anchored cases (built with the Huawei reference card so the
controller bandwidths / filter are the cited ESTIMATED values):
  - STRONG grid (SCR ~ 50): Sun 2011 unconditional stability (|Z_grid| < |Z_conv|
    for every frequency, max|L| < 1) -> "stabilny".
  - WEAK grid (SCR ~ 1.5): Wen 2016 PLL-induced weak-grid SSCI (the impedance
    magnitudes intersect, max|L| >= 1, phase difference deep in the -1 half-plane)
    -> "ryzyko SSCI"/"niestabilny" with an offending frequency reported.

The verdict module consumes the serialized result dict (it does NOT import the
solver — arch_guard forbids analysis -> solvers).
"""

from __future__ import annotations

import dataclasses

from analysis.ssci_stability import (
    SOLVER_INCOMPLETE_STATUS,
    SSCI_MANDATORY_FIELDS,
    VERDICT_NO_DATA,
    VERDICT_RISK,
    VERDICT_STABLE,
    VERDICT_UNSTABLE,
    SsciStabilityBuilder,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.provenance import CardFieldStatus, FieldQuality
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126ConverterInput,
)

_HUAWEI_CARD_ID = "conv-pv-card-huawei-sun2000-215ktl"


def _reference_card(card_id: str = _HUAWEI_CARD_ID):
    repo = get_default_mv_catalog()
    by_id = {c.id: c for c in repo.list_converter_types()}
    return by_id[card_id]


def _converter_from_card(card) -> V126ConverterInput:
    return V126ConverterInput(
        ref="INV1",
        bus_ref="CONV",
        mode="GFL",
        rated_mva=card.sn_mva,
        rated_kv=card.un_kv,
        current_loop_bandwidth_hz=card.current_loop_bandwidth_hz,
        voltage_loop_bandwidth_hz=card.voltage_loop_bandwidth_hz,
        pll_bandwidth_hz=card.pll_bandwidth_hz,
        control_delay_ms=card.control_delay_ms,
        filter_l_pu=card.filter_l_pu,
        filter_r_pu=card.filter_r_pu,
        p_mw=0.2,
        q_mvar=0.0,
    )


def _model_with_grid(card, *, scr: float) -> V126AcademicInput:
    fault_level_mva = scr * card.sn_mva
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref="PCC", name="PCC", nominal_kv=card.un_kv, fault_level_mva=fault_level_mva
            ),
            V126BusInput(ref="CONV", name="Konwerter", nominal_kv=card.un_kv),
        ],
        branches=[
            V126BranchInput(
                ref="L1",
                from_bus_ref="PCC",
                to_bus_ref="CONV",
                kind="cable",
                length_km=0.05,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.08,
            )
        ],
        converters=[_converter_from_card(card)],
    )


def _ssci_payload(card, *, scr: float) -> dict:
    result = V126AcademicSolver().run(
        V126AnalysisType.SSCI_IMPEDANCE, _model_with_grid(card, scr=scr)
    )
    return result["result"]


# ---------------------------------------------------------------------------
# Case 1: STRONG grid (Sun 2011 unconditional stability)
# ---------------------------------------------------------------------------


def test_strong_grid_is_stable() -> None:
    card = _reference_card()
    payload = _ssci_payload(card, scr=50.0)
    view = SsciStabilityBuilder().build(payload, converter=card)
    v = view.verdict

    assert v.verdict == VERDICT_STABLE, v.verdict
    assert v.is_risk is False
    # Sun 2011 strong-grid: impedance magnitudes never intersect (max|L| < 1).
    assert v.max_minor_loop_gain is not None and v.max_minor_loop_gain < 1.0, v.max_minor_loop_gain
    assert v.has_magnitude_crossover is False
    assert v.gain_crossover is None
    # No offending frequency on a stable verdict.
    assert v.offending_frequency_hz is None
    # Healthy distance from the -1 point.
    assert v.nearest_to_minus_one is not None
    assert v.nearest_to_minus_one.distance_to_minus_one > 0.5, v.nearest_to_minus_one
    assert v.encirclement_count == 0
    # White-box trace present and shaped (Formula -> Data -> ... -> UnitCheck).
    assert v.white_box
    for step in v.white_box:
        assert step.formula_latex and step.result_pl and step.unit_check_pl


# ---------------------------------------------------------------------------
# Case 2: WEAK grid (Wen 2016 PLL-induced weak-grid SSCI)
# ---------------------------------------------------------------------------


def test_weak_grid_flags_ssci_risk_with_offending_frequency() -> None:
    card = _reference_card()
    payload = _ssci_payload(card, scr=1.5)
    view = SsciStabilityBuilder().build(payload, converter=card)
    v = view.verdict

    # Literature-anchored expectation: weak grid is NOT unconditionally stable.
    assert v.verdict in (VERDICT_RISK, VERDICT_UNSTABLE), v.verdict
    assert v.is_risk is True
    # Impedance magnitudes intersect (max|L| >= 1) -> conditional stability (Sun 2011).
    assert v.max_minor_loop_gain is not None and v.max_minor_loop_gain >= 1.0, v.max_minor_loop_gain
    assert v.has_magnitude_crossover is True
    # An offending frequency is reported, inside the swept SSCI band.
    assert v.offending_frequency_hz is not None
    f_min = float(payload["frequencies_hz"][0])
    f_max = float(payload["frequencies_hz"][-1])
    assert f_min <= v.offending_frequency_hz <= f_max, v.offending_frequency_hz
    # The phase difference at the magnitude crossover is deep in the -1 half-plane.
    assert v.gain_crossover is not None
    assert abs(v.gain_crossover.phase_l_deg) > 90.0, v.gain_crossover
    # Closer approach to -1 than the strong grid.
    strong = SsciStabilityBuilder().build(_ssci_payload(card, scr=50.0), converter=card).verdict
    assert v.nearest_to_minus_one is not None and strong.nearest_to_minus_one is not None
    assert (
        v.nearest_to_minus_one.distance_to_minus_one
        < strong.nearest_to_minus_one.distance_to_minus_one
    )


def test_weak_grid_offending_frequency_matches_worst_in_band_margin() -> None:
    """The reported offending frequency is the worst in-band phase-margin point
    (closest to the -1 condition among |L| >= 1)."""
    card = _reference_card()
    view = SsciStabilityBuilder().build(_ssci_payload(card, scr=1.5), converter=card)
    v = view.verdict
    assert v.offending_frequency_hz == v.worst_phase_margin_f_hz
    assert v.worst_phase_margin_deg is not None and v.worst_phase_margin_deg > 0.0


# ---------------------------------------------------------------------------
# "brak danych" passthrough
# ---------------------------------------------------------------------------


def test_incomplete_solver_payload_is_brak_danych() -> None:
    card = _reference_card()
    model = _model_with_grid(card, scr=4.0)
    model.converters = []  # solver returns "dane niekompletne"
    payload = V126AcademicSolver().run(V126AnalysisType.SSCI_IMPEDANCE, model)["result"]
    assert payload["status"] == SOLVER_INCOMPLETE_STATUS

    view = SsciStabilityBuilder().build(payload, converter=None)
    v = view.verdict
    assert v.verdict == VERDICT_NO_DATA
    assert v.is_risk is False
    assert v.max_minor_loop_gain is None
    assert v.offending_frequency_hz is None
    assert v.white_box == ()
    # The verdict carries the real missing field reported by the solver.
    assert v.missing_data == ("converter",)


def test_missing_card_fields_payload_is_brak_danych() -> None:
    """A converter missing a mandatory SSCI field surfaces solver
    'dane niekompletne'; the verdict passes that through as 'brak danych'."""
    card = _reference_card()
    converter = _converter_from_card(card)
    converter.pll_bandwidth_hz = None  # mandatory for Z_conv
    model = _model_with_grid(card, scr=1.5)
    model.converters = [converter]
    payload = V126AcademicSolver().run(V126AnalysisType.SSCI_IMPEDANCE, model)["result"]
    assert payload["status"] == SOLVER_INCOMPLETE_STATUS

    v = SsciStabilityBuilder().build(payload, converter=None).verdict
    assert v.verdict == VERDICT_NO_DATA
    assert "pll_bandwidth_hz" in v.missing_data


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


def test_verdict_id_is_deterministic() -> None:
    card = _reference_card()
    payload = _ssci_payload(card, scr=1.5)
    first = SsciStabilityBuilder().build(payload, converter=card)
    second = SsciStabilityBuilder().build(payload, converter=card)
    assert first.analysis_id == second.analysis_id
    assert first.to_dict() == second.to_dict()


def test_verdict_id_changes_with_grid_strength() -> None:
    card = _reference_card()
    weak = SsciStabilityBuilder().build(_ssci_payload(card, scr=1.5), converter=card)
    strong = SsciStabilityBuilder().build(_ssci_payload(card, scr=50.0), converter=card)
    assert weak.analysis_id != strong.analysis_id


# ---------------------------------------------------------------------------
# Provenance worst-case
# ---------------------------------------------------------------------------


def test_reference_card_verdict_tagged_estimated() -> None:
    """Reference-card bandwidths seed to ESTIMATED, so the worst-case provenance
    is ESTIMATED and the verdict carries the Polish 'estimated bandwidths' tag."""
    card = _reference_card()
    view = SsciStabilityBuilder().build(_ssci_payload(card, scr=1.5), converter=card)
    prov = view.verdict.provenance
    assert prov is not None
    assert prov.worst_quality == FieldQuality.ESTIMATED.value
    assert prov.is_estimated is True
    assert prov.tag_pl == "werdykt oparty na oszacowanych pasmach regulatora"
    # The estimated tag composes into the human-readable rationale.
    assert "oszacowanych pasmach regulatora" in view.verdict.why_pl
    # All mandatory consumed fields are declared in the provenance.
    for name in SSCI_MANDATORY_FIELDS:
        assert name in prov.consumed_fields


def test_datasheet_card_verdict_tagged_datasheet() -> None:
    """If every consumed field were datasheet-grade, the worst-case provenance is
    DATASHEET (the estimated tag disappears) — proves the worst-case ordering."""
    card = _reference_card()
    consumed = (
        "current_loop_bandwidth_hz",
        "pll_bandwidth_hz",
        "filter_l_pu",
        "voltage_loop_bandwidth_hz",
        "control_delay_ms",
        "filter_r_pu",
    )
    override = {
        name: CardFieldStatus(
            field_name=name, quality=FieldQuality.DATASHEET, source_ref="datasheet:test"
        )
        for name in consumed
    }
    datasheet_card = dataclasses.replace(card, card_field_status=override)

    view = SsciStabilityBuilder().build(_ssci_payload(card, scr=1.5), converter=datasheet_card)
    prov = view.verdict.provenance
    assert prov is not None
    assert prov.worst_quality == FieldQuality.DATASHEET.value
    assert prov.is_estimated is False
    assert "oszacowanych" not in view.verdict.why_pl


def test_worst_case_is_lowest_quality_when_mixed() -> None:
    """A single ESTIMATED field among otherwise DATASHEET fields drags the
    worst-case down to ESTIMATED (DATASHEET > ESTIMATED > SYSTEM_DEFAULT)."""
    card = _reference_card()
    consumed = (
        "current_loop_bandwidth_hz",
        "pll_bandwidth_hz",
        "filter_l_pu",
        "voltage_loop_bandwidth_hz",
        "control_delay_ms",
        "filter_r_pu",
    )
    override = {
        name: CardFieldStatus(field_name=name, quality=FieldQuality.DATASHEET, source_ref="ds")
        for name in consumed
    }
    # Leave the PLL bandwidth estimated.
    override["pll_bandwidth_hz"] = CardFieldStatus(
        field_name="pll_bandwidth_hz", quality=FieldQuality.ESTIMATED
    )
    mixed_card = dataclasses.replace(card, card_field_status=override)

    prov = (
        SsciStabilityBuilder()
        .build(_ssci_payload(card, scr=1.5), converter=mixed_card)
        .verdict.provenance
    )
    assert prov is not None
    assert prov.worst_quality == FieldQuality.ESTIMATED.value
