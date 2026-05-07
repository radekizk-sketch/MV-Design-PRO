import math

import pytest

from network_model.solvers.grid_source_preview import (
    GridSourcePreviewInput,
    compute_grid_source_preview,
)


def test_grid_source_preview_uses_iec60909_core_values() -> None:
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

    assert result.sk_mva == pytest.approx(310.0)
    assert result.ik3_ka == pytest.approx(310.0 / ((3.0**0.5) * 15.0))
    assert result.kappa == pytest.approx(1.02 + 0.98 * math.exp(-0.36))
    assert result.ip_ka > result.ik3_ka
    assert result.ith_ka == pytest.approx(result.ik3_ka)
    assert result.ik1_ka is not None
    assert result.z0_ohm is not None
    assert result.z0_ohm.real == pytest.approx((result.z1_ohm * 3.2).real)
    assert result.z0_ohm.imag == pytest.approx((result.z1_ohm * 3.2).imag)
