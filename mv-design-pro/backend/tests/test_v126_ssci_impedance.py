"""Tests for the D-03 SSCI impedance-based stability solver (PHYSICS half).

Covers Steps 0-3 of D-03 SSCI (solver layer only; the Nyquist/minor-loop verdict
is a separate analysis-layer follow-up and is NOT exercised here):

- Z_conv(jw) small-signal output-impedance sanity limits:
    * high-frequency: Z_conv -> Z_f = R_f + jwL_f (controller terms roll off);
    * inside the current-loop band: |Z_conv| is large (current-source-like);
    * below the PLL bandwidth: a region with Re(Z_conv) < 0 (negative resistance)
      exists — the operating-point-dependent SSCI mechanism;
- determinism: identical deterministic_hash on repeat;
- qualitative minor-loop check: L(f) = Z_grid/Z_conv approaches the -1 region
  (|L| -> O(1), phase rotating toward +-180 deg) on a WEAK grid (low fault level)
  but stays clear on a STRONG grid — using a reference card so the bandwidths are
  the cited ESTIMATED values;
- missing mandatory card fields surface as "dane niekompletne" (no fabrication).

Reference for the Z_conv model: Sun 2011 (IEEE TPEL 26-11); Cespedes & Sun 2014
(IEEE TPEL 29-3); Wen et al. 2016 (IEEE TPEL 31-1).
"""

from __future__ import annotations

import cmath
import math

from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.v126_academic import V126AcademicSolver
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


def _converter_from_card(
    card,
    *,
    ref: str = "INV1",
    bus_ref: str = "CONV",
    p_mw: float = 0.2,
    q_mvar: float = 0.0,
) -> V126ConverterInput:
    """Build a solver-input converter from a catalog reference card so the
    controller bandwidths / filter values are the cited ESTIMATED card values."""
    return V126ConverterInput(
        ref=ref,
        bus_ref=bus_ref,
        mode="GFL",
        rated_mva=card.sn_mva,
        rated_kv=card.un_kv,
        current_loop_bandwidth_hz=card.current_loop_bandwidth_hz,
        voltage_loop_bandwidth_hz=card.voltage_loop_bandwidth_hz,
        pll_bandwidth_hz=card.pll_bandwidth_hz,
        control_delay_ms=card.control_delay_ms,
        filter_l_pu=card.filter_l_pu,
        filter_r_pu=card.filter_r_pu,
        p_mw=p_mw,
        q_mvar=q_mvar,
    )


def _model_with_grid(
    card, *, fault_level_mva: float | None = None, scr: float | None = None
) -> V126AcademicInput:
    """Two-bus model: a grid bus (carrying the fault level) and the converter bus,
    joined by a short cable. The grid strength is set either by an absolute
    ``fault_level_mva`` or by a short-circuit ratio ``scr`` relative to the card's
    rating (fault_level = scr * Sn) — the physically meaningful measure of grid
    weakness for THIS converter."""
    if fault_level_mva is None:
        assert scr is not None
        fault_level_mva = scr * card.sn_mva
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref="PCC",
                name="PCC",
                nominal_kv=card.un_kv,
                fault_level_mva=fault_level_mva,
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


# ---------------------------------------------------------------------------
# Z_conv(jw) sanity limits (computed directly from the solver helper)
# ---------------------------------------------------------------------------


def test_z_conv_high_frequency_approaches_filter() -> None:
    """As w -> inf the controller terms roll off and Z_conv -> Z_f = R_f + jwL_f."""
    card = _reference_card()
    converter = _converter_from_card(card)
    solver = V126AcademicSolver()
    z_base = card.un_kv**2 / card.sn_mva
    w_base = 2.0 * math.pi * 50.0
    for f_hz in (50_000.0, 200_000.0):
        z_conv, _ = solver._z_conv_components(converter, f_hz)
        w_pu = (2.0 * math.pi * f_hz) / w_base
        z_f_ohm = complex(card.filter_r_pu, w_pu * card.filter_l_pu) * z_base
        # |Z_conv| converges to |Z_f| (the filter) within a small relative tolerance.
        rel = abs(abs(z_conv) - abs(z_f_ohm)) / abs(z_f_ohm)
        assert rel < 0.05, (f_hz, abs(z_conv), abs(z_f_ohm), rel)


def test_z_conv_in_band_is_high_impedance() -> None:
    """Well inside the current-loop band, |Z_conv| >> |Z_f| (current-source-like)."""
    card = _reference_card()
    converter = _converter_from_card(card)
    solver = V126AcademicSolver()
    z_base = card.un_kv**2 / card.sn_mva
    w_base = 2.0 * math.pi * 50.0
    # A frequency well inside the current loop (f_ci=900 Hz) and above the PLL band.
    f_hz = 150.0
    z_conv, _ = solver._z_conv_components(converter, f_hz)
    w_pu = (2.0 * math.pi * f_hz) / w_base
    z_f_ohm = complex(card.filter_r_pu, w_pu * card.filter_l_pu) * z_base
    assert abs(z_conv) > 3.0 * abs(z_f_ohm), (abs(z_conv), abs(z_f_ohm))


def test_z_conv_negative_resistance_region_below_pll() -> None:
    """Below the PLL bandwidth there is a region with Re(Z_conv) < 0 — the SSCI
    negative-resistance mechanism (operating-point-dependent PLL coupling)."""
    card = _reference_card()
    converter = _converter_from_card(card)
    solver = V126AcademicSolver()
    f_pll = card.pll_bandwidth_hz
    # Scan sub-PLL frequencies; at least one must show negative real part.
    sub_pll = [f for f in (0.5, 1.0, 2.0, 3.0, 5.0) if f < f_pll]
    re_parts = [solver._z_conv_components(converter, f)[0].real for f in sub_pll]
    assert any(re < 0.0 for re in re_parts), list(zip(sub_pll, re_parts, strict=False))
    # And well ABOVE the PLL band the real part is positive (passive-like).
    re_above = solver._z_conv_components(converter, 5.0 * f_pll)[0].real
    assert re_above > 0.0, re_above


def test_z_conv_requires_mandatory_card_fields() -> None:
    """Missing any of {current_loop_bandwidth_hz, pll_bandwidth_hz, filter_l_pu}
    raises a clear error — no fabricated fallback value."""
    solver = V126AcademicSolver()
    base = {"ref": "X", "bus_ref": "B", "rated_mva": 1.0, "rated_kv": 0.69}
    for missing in ("current_loop_bandwidth_hz", "pll_bandwidth_hz", "filter_l_pu"):
        kwargs = dict(
            base,
            current_loop_bandwidth_hz=900.0,
            pll_bandwidth_hz=30.0,
            filter_l_pu=0.08,
        )
        kwargs[missing] = None
        converter = V126ConverterInput(**kwargs)
        try:
            solver._z_conv_components(converter, 10.0)
        except ValueError as exc:
            assert missing in str(exc)
        else:  # pragma: no cover - defensive
            raise AssertionError(f"expected ValueError for missing {missing}")


# ---------------------------------------------------------------------------
# Full solver envelope: shape + determinism
# ---------------------------------------------------------------------------


def test_ssci_envelope_shape_and_arrays() -> None:
    card = _reference_card()
    model = _model_with_grid(card, fault_level_mva=4.0)
    result = V126AcademicSolver().run(V126AnalysisType.SSCI_IMPEDANCE, model)

    assert result["contract"] == "AcademicAnalysisResultV1"
    assert result["analysis_type"] == "ssci_impedance"
    payload = result["result"]
    for key in ("z_grid", "z_conv", "minor_loop_gain", "frequencies_hz"):
        assert key in payload, key
    n = len(payload["frequencies_hz"])
    assert n >= 40
    assert len(payload["z_grid"]) == n
    assert len(payload["z_conv"]) == n
    assert len(payload["minor_loop_gain"]) == n
    # Each array entry exposes {f_hz, re, im, mag, phase_deg}.
    for arr in ("z_grid", "z_conv", "minor_loop_gain"):
        row = payload[arr][0]
        assert set(row) == {"f_hz", "re", "im", "mag", "phase_deg"}
    # The white-box trace documents the model + the two sweeps.
    keys = {step["key"] for step in result["white_box_trace"]}
    assert "ssci_zconv_model" in keys
    assert "ssci_zgrid_sweep" in keys
    assert "ssci_minor_loop_gain" in keys
    # Negative-resistance region reported and present for a generation converter.
    assert payload["z_conv_negative_resistance"]["present"] is True


def test_ssci_is_deterministic() -> None:
    card = _reference_card()
    model = _model_with_grid(card, fault_level_mva=4.0)
    solver = V126AcademicSolver()
    first = solver.run(V126AnalysisType.SSCI_IMPEDANCE, model)
    second = solver.run(V126AnalysisType.SSCI_IMPEDANCE, model)
    assert first["deterministic_hash"] == second["deterministic_hash"]


def test_ssci_missing_converter_is_incomplete_not_fabricated() -> None:
    card = _reference_card()
    model = _model_with_grid(card, fault_level_mva=4.0)
    model.converters = []  # remove the converter
    result = V126AcademicSolver().run(V126AnalysisType.SSCI_IMPEDANCE, model)
    assert result["result"]["status"] == "dane niekompletne"
    # No fabricated arrays produced.
    assert "z_conv" not in result["result"]


# ---------------------------------------------------------------------------
# Qualitative minor-loop behaviour: weak vs strong grid (the SSCI mechanism)
# ---------------------------------------------------------------------------


def _closest_to_minus_one(rows: list[dict]) -> tuple[float, float]:
    """Return (min |L+1|, f_hz at that minimum) over the minor-loop array."""
    best = (math.inf, 0.0)
    for row in rows:
        d = abs(complex(row["re"] + 1.0, row["im"]))
        if d < best[0]:
            best = (d, row["f_hz"])
    return best


def test_weak_grid_approaches_instability_strong_grid_stays_clear() -> None:
    """SSCI mechanism: a WEAK grid (low fault level => high |Z_grid|) drives the
    minor-loop gain L = Z_grid/Z_conv toward the -1 region (|L| -> O(1)), while a
    STRONG grid (high fault level) keeps |L| small and far from -1.

    Uses the Huawei reference card so the controller bandwidths / filter are the
    cited ESTIMATED values (not ad-hoc test numbers).
    """
    card = _reference_card()
    solver = V126AcademicSolver()

    # Grid weakness is relative to the converter rating (SCR = S_sc / Sn). A weak
    # grid is SCR ~ 1.5; a strong grid is SCR ~ 50.
    weak = solver.run(V126AnalysisType.SSCI_IMPEDANCE, _model_with_grid(card, scr=1.5))["result"]
    strong = solver.run(V126AnalysisType.SSCI_IMPEDANCE, _model_with_grid(card, scr=50.0))["result"]

    max_l_weak = max(row["mag"] for row in weak["minor_loop_gain"])
    max_l_strong = max(row["mag"] for row in strong["minor_loop_gain"])
    near_weak, _ = _closest_to_minus_one(weak["minor_loop_gain"])
    near_strong, _ = _closest_to_minus_one(strong["minor_loop_gain"])

    # Weak grid drives a materially larger minor-loop gain than the strong grid
    # (the gain ratio tracks the grid-strength ratio).
    assert max_l_weak > 5.0 * max_l_strong, (max_l_weak, max_l_strong)
    # Weak grid pushes |L| to order unity (approaching the unit-magnitude locus)...
    assert max_l_weak >= 1.0, max_l_weak
    # ...and gets materially closer to the -1 point than the strong grid.
    assert near_weak < near_strong, (near_weak, near_strong)
    # Strong grid stays clear: minor-loop gain well below unity.
    assert max_l_strong < 0.5, max_l_strong


def test_minor_loop_phase_rotates_toward_180_for_weak_grid() -> None:
    """On the weak grid the minor-loop gain phase rotates well away from 0 deg
    (toward the +-180 deg half-plane) where -1 lives — a precondition for the
    Nyquist verdict the analysis half will compute."""
    card = _reference_card()
    weak = V126AcademicSolver().run(
        V126AnalysisType.SSCI_IMPEDANCE, _model_with_grid(card, scr=1.5)
    )["result"]
    # The point of largest |L| (most influential on the Nyquist locus) sits well
    # into the second/third quadrant (|phase| > 90 deg).
    dominant = max(weak["minor_loop_gain"], key=lambda r: r["mag"])
    assert abs(dominant["phase_deg"]) > 90.0, dominant


def test_minor_loop_equals_zgrid_over_zconv() -> None:
    """L(f) is exactly Z_grid(f)/Z_conv(f) at every frequency (no hidden term)."""
    card = _reference_card()
    payload = V126AcademicSolver().run(
        V126AnalysisType.SSCI_IMPEDANCE, _model_with_grid(card, fault_level_mva=4.0)
    )["result"]
    for zg, zc, lrow in zip(
        payload["z_grid"], payload["z_conv"], payload["minor_loop_gain"], strict=True
    ):
        expected = complex(zg["re"], zg["im"]) / complex(zc["re"], zc["im"])
        got = complex(lrow["re"], lrow["im"])
        assert cmath.isclose(expected, got, rel_tol=1e-4, abs_tol=1e-6), (
            zg["f_hz"],
            expected,
            got,
        )
