"""
Rotating-machine short-circuit source models for IEC 60909-0:2016.

UNLIKE inverter-based sources (``InverterSource``, a bounded current source per
§6.7), a rotating machine is a VOLTAGE source behind an internal impedance Z″. In
the Z-bus method this is a shunt admittance Y″ = 1/Z″ at the machine's node — added
to the Y-bus exactly as the slack bus is grounded — so the FROZEN short-circuit core
(which inverts the Y-bus and reads the Thévenin element) incorporates the machine
WITHOUT being modified. These models expose every intermediate value (WHITE BOX):
the per-unit reactance, the rated current, the IEC impedance-correction factor, and
the final complex Z″ — all auditable, all pinned to a standard clause.

References: IEC 60909-0:2016 — §6.3 (synchronous machines), §6.6 (decay factors μ, q
for the symmetrical breaking current), §6.7/§8 (asynchronous motors).
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field

_SQRT3 = math.sqrt(3.0)


def _synchronous_r_over_x(ur_kv: float, sr_mva: float) -> float:
    """Fictitious R_G/X″d for the peak factor κ (IEC 60909-0:2016 §6.3, eq. for R_Gf).

    R_Gf is a FICTITIOUS resistance used only to obtain ip via κ; it is larger than
    the real R_G so that κ (hence ip) is not overestimated for near-generator faults.
    """
    if ur_kv > 1.0:
        return 0.05 if sr_mva >= 100.0 else 0.07
    return 0.15  # LV generators (U_rG ≤ 1 kV)


@dataclass
class SynchronousMachineSource:
    """Synchronous generator/motor as a voltage-behind-Z″ SC source (IEC 60909 §6.3).

    Z″_G = K_G·(R_G + jX″d), with the subtransient reactance X″d = x″d·U²rG/SrG and
    the impedance-correction factor K_G = (U_n/U_rG)·(c_max/(1 + x″d·sinφrG)) (§6.3.3),
    which accounts for the machine's pre-fault operating point.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_id: str = field(default="")
    sr_mva: float = field(default=0.0)  # rated apparent power S_rG [MVA]
    ur_kv: float = field(default=0.0)  # rated voltage U_rG [kV]
    xd_subtransient_pu: float = field(default=0.15)  # x″d [pu], saturated subtransient
    cos_phi_r: float = field(default=0.8)  # rated power factor cos φ_rG
    un_kv: float | None = field(default=None)  # system nominal voltage U_n [kV]; default U_rG
    c_max: float = field(default=1.1)  # voltage factor c_max (for K_G)
    r_over_x: float | None = field(default=None)  # R_G/X″d override; else IEC default
    in_service: bool = field(default=True)

    @property
    def x_subtransient_ohm(self) -> float:
        """X″d in ohms: x″d · U²rG / S_rG."""
        return self.xd_subtransient_pu * (self.ur_kv**2) / self.sr_mva

    @property
    def r_over_x_ratio(self) -> float:
        return (
            self.r_over_x
            if self.r_over_x is not None
            else _synchronous_r_over_x(self.ur_kv, self.sr_mva)
        )

    @property
    def r_ohm(self) -> float:
        """Fictitious R_G for κ (R_Gf/X″d · X″d)."""
        return self.r_over_x_ratio * self.x_subtransient_ohm

    @property
    def k_g(self) -> float:
        """Impedance correction factor K_G (IEC 60909-0:2016 §6.3.3)."""
        un = self.un_kv if self.un_kv is not None else self.ur_kv
        sin_phi = math.sqrt(max(0.0, 1.0 - self.cos_phi_r**2))
        return (un / self.ur_kv) * (self.c_max / (1.0 + self.xd_subtransient_pu * sin_phi))

    @property
    def z_internal_ohm(self) -> complex:
        """Corrected machine SC impedance Z″_GK = K_G·(R_G + jX″d) [Ω]."""
        return self.k_g * complex(self.r_ohm, self.x_subtransient_ohm)

    @property
    def ir_a(self) -> float:
        """Rated current I_rG [A]."""
        return self.sr_mva * 1.0e6 / (_SQRT3 * self.ur_kv * 1.0e3)

    def white_box(self) -> dict[str, float | complex | str]:
        """Auditable derivation (WHITE BOX) — every factor pinned to a clause."""
        z = self.z_internal_ohm
        return {
            "model": "IEC 60909-0:2016 §6.3 — maszyna synchroniczna (źródło za Z″)",
            "sr_mva": self.sr_mva,
            "ur_kv": self.ur_kv,
            "xd_subtransient_pu": self.xd_subtransient_pu,
            "x_subtransient_ohm": self.x_subtransient_ohm,
            "r_over_x": self.r_over_x_ratio,
            "r_ohm": self.r_ohm,
            "k_g": self.k_g,
            "z_internal_ohm": z,
            "z_abs_ohm": abs(z),
            "ir_a": self.ir_a,
        }


def _asynchronous_r_over_x(ur_kv: float, p_per_pole_mw: float) -> float:
    """R_M/X_M for asynchronous motors (IEC 60909-0:2016 §6.7 / Table)."""
    if ur_kv > 1.0:
        return 0.10 if p_per_pole_mw >= 1.0 else 0.15  # MV motors
    return 0.42  # LV motors / motor groups


@dataclass
class AsynchronousMachineSource:
    """Asynchronous (induction) machine as a SC source (IEC 60909-0:2016 §6.7, §8).

    Z_M = (1/(I_LR/I_rM))·(U_rM/(√3·I_rM)). Carries the data needed for the §6.6.3
    breaking-current decay factor q (active power per pole pair) and the small-motor
    omission rule (rated current).
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = field(default="")
    node_id: str = field(default="")
    pr_mw: float = field(default=0.0)  # rated mechanical power P_rM [MW]
    ur_kv: float = field(default=0.0)  # rated voltage U_rM [kV]
    cos_phi_r: float = field(default=0.85)  # rated power factor
    efficiency: float = field(default=0.95)  # rated efficiency η
    i_lr_ratio: float = field(default=5.0)  # locked-rotor ratio I_LR/I_rM
    pole_pairs: int = field(default=1)  # p (for P_rM/p)
    r_over_x: float | None = field(default=None)  # R_M/X_M override; else IEC default
    # DFIG (wind Type 3) marker. A doubly-fed induction generator has a partial-scale
    # rotor converter; on a severe fault the crowbar fires (rotor shorted) and the
    # machine behaves as a squirrel-cage induction generator — so it is modelled HERE
    # as an asynchronous source behind Z_M (§6.7), with the converter contribution
    # neglected (conservative for I″k,max). This flag only RELABELS the contribution
    # "DFIG" and documents the crowbar assumption; the μ·q decay math is unchanged.
    wind_type_3: bool = field(default=False)
    in_service: bool = field(default=True)

    @property
    def sr_mva(self) -> float:
        """Rated apparent power S_rM = P_rM/(η·cos φ_rM) [MVA]."""
        return self.pr_mw / (self.efficiency * self.cos_phi_r)

    @property
    def ir_a(self) -> float:
        """Rated current I_rM [A]."""
        return self.sr_mva * 1.0e6 / (_SQRT3 * self.ur_kv * 1.0e3)

    @property
    def z_abs_ohm(self) -> float:
        """|Z_M| = (1/(I_LR/I_rM))·(U_rM/(√3·I_rM))."""
        return (1.0 / self.i_lr_ratio) * (self.ur_kv * 1.0e3 / (_SQRT3 * self.ir_a))

    @property
    def p_per_pole_mw(self) -> float:
        return self.pr_mw / max(1, self.pole_pairs)

    @property
    def r_over_x_ratio(self) -> float:
        return (
            self.r_over_x
            if self.r_over_x is not None
            else _asynchronous_r_over_x(self.ur_kv, self.p_per_pole_mw)
        )

    @property
    def z_internal_ohm(self) -> complex:
        """Z_M = R_M + jX_M, split from |Z_M| via the R/X ratio."""
        ratio = self.r_over_x_ratio
        x = self.z_abs_ohm / math.sqrt(1.0 + ratio**2)
        return complex(ratio * x, x)

    def white_box(self) -> dict[str, float | complex | str]:
        z = self.z_internal_ohm
        return {
            "model": (
                "IEC 60909-0:2016 §6.7 — DFIG (Typ 3): crowbar → maszyna asynchroniczna za Z_M"
                if self.wind_type_3
                else "IEC 60909-0:2016 §6.7 — maszyna asynchroniczna (źródło za Z_M)"
            ),
            "wind_type_3": self.wind_type_3,
            "pr_mw": self.pr_mw,
            "sr_mva": self.sr_mva,
            "ur_kv": self.ur_kv,
            "i_lr_ratio": self.i_lr_ratio,
            "ir_a": self.ir_a,
            "p_per_pole_mw": self.p_per_pole_mw,
            "r_over_x": self.r_over_x_ratio,
            "z_internal_ohm": z,
            "z_abs_ohm": abs(z),
            "pole_pairs": self.pole_pairs,
        }
