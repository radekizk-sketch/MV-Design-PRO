import math

import pytest

from src.domain.units import BaseQuantities, UnitSystem


def test_base_quantities_computes_z_and_i_base() -> None:
    base = BaseQuantities(u_base_kv=15.0, s_base_mva=10.0)

    assert base.z_base_ohm == pytest.approx(22.5)
    assert base.i_base_ka == pytest.approx(10.0 / (15.0 * math.sqrt(3)))


def test_unit_system_round_trip() -> None:
    system = UnitSystem(base=BaseQuantities(u_base_kv=20.0, s_base_mva=5.0))

    assert system.voltage_kv(system.voltage_pu(10.0)) == pytest.approx(10.0)
    assert system.power_mva(system.power_pu(2.5)) == pytest.approx(2.5)
    assert system.current_ka(system.current_pu(0.6)) == pytest.approx(0.6)
    assert system.impedance_ohm(system.impedance_pu(3.3)) == pytest.approx(3.3)


def test_base_quantities_validation() -> None:
    with pytest.raises(ValueError, match="Ubase must be positive"):
        BaseQuantities(u_base_kv=0.0, s_base_mva=10.0)

    with pytest.raises(ValueError, match="Sbase must be positive"):
        BaseQuantities(u_base_kv=10.0, s_base_mva=-5.0)
