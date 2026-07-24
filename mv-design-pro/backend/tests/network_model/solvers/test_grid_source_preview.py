import math

import pytest
from network_model.solvers.grid_source_preview import (
    GridSourcePreviewInput,
    compute_grid_source_preview,
)
from network_model.solvers.short_circuit_core import _thermal_mn_factors


def test_grid_source_preview_uses_iec60909_core_values() -> None:
    """RE-BASELINE (audyt fizyki, fala G, 2026-07): ``ith_ka == ik3_ka`` utrwalało
    defekt W1/W9 rdzennego solvera (``short_circuit_core.py``, naprawiony w tej samej
    delcie) — poprzednia formuła ``ith_a = ikss*sqrt(tk_s)`` dawała PRZYPADKOWO
    ``ith == ikss`` przy tk_s=1,0 s, niezależnie od kappa. Poprawna formuła IEC
    60909-0 §4.7/§12 (``I_th = I_k''*sqrt(m+n)``) daje ``I_th > I_k''`` (m>0 dla
    kappa>1,02). Rachunek kontrolny (kappa=1,02+0,98*exp(-0,36)=1,70372...,
    tk_s=1,0 s, f=50 Hz, postać zamknięta m z ``_thermal_mn_factors``):
    m≈0,028460, n=1,0 (daleko od generatora) → I_th/I_k''=sqrt(1,028460)≈1,014130
    (≈+1,41%, NIE 0%)."""
    result = compute_grid_source_preview(
        GridSourcePreviewInput(
            voltage_kv=15.0,
            short_circuit_mode="SHORT_CIRCUIT_POWER",
            sk3_mva=310.0,
            rx_ratio=0.12,
            zero_sequence_enabled=True,
            z0_z1_ratio=3.2,
            tk_s=1.0,
        )
    )

    expected_kappa = 1.02 + 0.98 * math.exp(-0.36)
    expected_m, expected_n = _thermal_mn_factors(expected_kappa, 1.0)
    expected_ith_ka = result.ik3_ka * math.sqrt(expected_m + expected_n)

    assert result.sk_mva == pytest.approx(310.0)
    assert result.ik3_ka == pytest.approx(310.0 / ((3.0**0.5) * 15.0))
    assert result.kappa == pytest.approx(expected_kappa)
    assert result.ip_ka > result.ik3_ka
    # I_th > I_k'' (skladowa DC niezerowa, m>0) — BEZ rownosci (stary defekt).
    assert result.ith_ka > result.ik3_ka
    assert result.ith_ka == pytest.approx(expected_ith_ka, rel=1e-9)
    assert result.ith_ka == pytest.approx(result.ik3_ka * 1.014130, rel=2e-5)
    assert result.ik1_ka is not None
    assert result.z0_ohm is not None
    assert result.z0_ohm.real == pytest.approx((result.z1_ohm * 3.2).real)
    assert result.z0_ohm.imag == pytest.approx((result.z1_ohm * 3.2).imag)
