from __future__ import annotations

from dataclasses import dataclass

from network_model.pochodne import (
    impedancja_z_napiecia_i_mocy_ohm,
    prad_z_mocy_pozornej_ka,
)


@dataclass(frozen=True)
class BaseQuantities:
    """Base quantities for per-unit conversions.

    All values are expressed in engineering units:
    - Ubase in kV (line-to-line)
    - Sbase in MVA
    """

    u_base_kv: float
    s_base_mva: float

    def __post_init__(self) -> None:
        if self.u_base_kv <= 0:
            raise ValueError("Ubase must be positive (kV).")
        if self.s_base_mva <= 0:
            raise ValueError("Sbase must be positive (MVA).")

    @property
    def z_base_ohm(self) -> float:
        return impedancja_z_napiecia_i_mocy_ohm(self.u_base_kv, self.s_base_mva)

    @property
    def i_base_ka(self) -> float:
        return prad_z_mocy_pozornej_ka(self.s_base_mva, self.u_base_kv)


@dataclass(frozen=True)
class UnitSystem:
    base: BaseQuantities

    def voltage_pu(self, voltage_kv: float) -> float:
        return voltage_kv / self.base.u_base_kv

    def voltage_kv(self, voltage_pu: float) -> float:
        return voltage_pu * self.base.u_base_kv

    def power_pu(self, power_mva: float) -> float:
        return power_mva / self.base.s_base_mva

    def power_mva(self, power_pu: float) -> float:
        return power_pu * self.base.s_base_mva

    def current_pu(self, current_ka: float) -> float:
        return current_ka / self.base.i_base_ka

    def current_ka(self, current_pu: float) -> float:
        return current_pu * self.base.i_base_ka

    def impedance_pu(self, impedance_ohm: float) -> float:
        return impedance_ohm / self.base.z_base_ohm

    def impedance_ohm(self, impedance_pu: float) -> float:
        return impedance_pu * self.base.z_base_ohm
