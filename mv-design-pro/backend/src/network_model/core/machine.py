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

References: IEC 60909-0:2016 — §6.3 (synchronous machines), rozdz. 9 (decay factors μ, q
for the symmetrical breaking current — węzły krzywych t_min z interpolacją liniową), §6.7/§8 (asynchronous motors).
"""

from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field

from network_model.core.modul_zespolony import modul_zespolony
from network_model.core.voltage_factor import (
    TolerancjaNapieciaNn,
    c_for_node,
    zrodlo_c_z_tabeli,
)
from network_model.pochodne import (
    impedancja_z_napiecia_i_pradu_ohm,
    kv_na_v,
    moc_pozorna_maszyny_asynchronicznej_mva,
    prad_znamionowy_a,
    reaktancja_z_jednostek_wzglednych_ohm,
)
from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe


def _pasmo_maszyny(ur_kv: float) -> str:
    """Pasmo napięcia znamionowego maszyny albo nazwana odmowa (bez domysłu wiersza nN).

    Tabele R/X IEC 60909-0 (§6.3 maszyny synchroniczne, §6.7 asynchroniczne) rozróżniają
    maszyny do 1 kV i powyżej; napięcie niefizyczne nie należy do żadnego wiersza, a ciche
    przyjęcie wiersza nN (zachowanie sprzed 2026-09-25) robiło z błędnej danej wiarygodnie
    wyglądające R/X.
    """
    pasmo = pasmo_napieciowe(ur_kv)
    if pasmo is None:
        raise ValueError(
            f"Napięcie znamionowe maszyny {ur_kv!r} kV nie leży w żadnym paśmie napięć — "
            "stosunku R/X (IEC 60909-0, §6.3/§6.7) nie da się dobrać."
        )
    return pasmo


def _synchronous_r_over_x(ur_kv: float, sr_mva: float) -> float:
    """Fictitious R_G/X″d for the peak factor κ (IEC 60909-0:2016 §6.3, eq. for R_Gf).

    R_Gf is a FICTITIOUS resistance used only to obtain ip via κ; it is larger than
    the real R_G so that κ (hence ip) is not overestimated for near-generator faults.

    Raises:
        ValueError: U_rG is not a physical rated voltage (non-finite, zero or negative) —
            the norm has no row for it; the low-voltage row would be a guess.
    """
    if _pasmo_maszyny(ur_kv) == "nN":
        return 0.15  # LV generators (U_rG ≤ 1 kV)
    return 0.05 if sr_mva >= 100.0 else 0.07


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
    # Karta PODSTAWA-Q (rozstrzygnięcie 3): x″d i cos φ_rG bez domyślek — wartość podaje
    # mapowanie ENM po rozstrzygnięciu pierwszeństwa (projektant > tabliczka > propozycja
    # rejestru `network_model.catalog.wartosci_robocze`, jedyne miejsce wartości roboczych).
    xd_subtransient_pu: float = field(kw_only=True)  # x″d [pu], saturated subtransient
    cos_phi_r: float = field(kw_only=True)  # rated power factor cos φ_rG
    un_kv: float | None = field(default=None)  # system nominal voltage U_n [kV]; default U_rG
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: c_max we wzorze K_G to c_max tabeli 1 IEC 60909-0 dla
    # U_n sieci, do której przyłączona jest maszyna — czytany z JEDYNEGO źródła tabeli
    # (`voltage_factor.c_for_node`) z klasą tolerancji sieci nN szyny maszyny
    # (`enm.tolerancja_nn`, wpina mapper). Dawna domyślka c_max = 1,1 była wierszem SN także dla
    # maszyny nN (+6 %: c_max 1,05) — K_G zawyżony o 4,8 %.
    tolerancja_nn: TolerancjaNapieciaNn | None = field(default=None)
    # Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: klasa wyżej jest wartością roboczą rejestru —
    # podstawa c_max we wzorze K_G mówi to wprost (ta sama wyspa co węzeł maszyny).
    tolerancja_nn_robocza: bool = field(default=False)
    r_over_x: float | None = field(default=None)  # R_G/X″d override; else IEC default
    in_service: bool = field(default=True)

    @property
    def x_subtransient_ohm(self) -> float:
        """X″d in ohms: x″d · U²rG / S_rG."""
        return reaktancja_z_jednostek_wzglednych_ohm(
            self.xd_subtransient_pu, self.ur_kv, self.sr_mva
        )

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
    def _un_sieci_kv(self) -> float:
        return self.un_kv if self.un_kv is not None else self.ur_kv

    @property
    def c_max(self) -> float:
        """c_max tabeli 1 IEC 60909-0 dla U_n sieci maszyny (K_G, §6.6.1 eq. 18)."""
        return c_for_node(self._un_sieci_kv, "MAX", tolerancja_nn=self.tolerancja_nn)

    @property
    def c_max_zrodlo(self) -> str:
        """Podstawa c_max we wzorze K_G — brzmienie tabeli 1 (White Box)."""
        return zrodlo_c_z_tabeli(
            self._un_sieci_kv,
            "MAX",
            tolerancja_nn=self.tolerancja_nn,
            tolerancja_nn_robocza=self.tolerancja_nn_robocza,
        )

    @property
    def k_g(self) -> float:
        """Impedance correction factor K_G (IEC 60909-0:2016 §6.3.3)."""
        un = self._un_sieci_kv
        sin_phi = math.sqrt(max(0.0, 1.0 - self.cos_phi_r**2))
        return (un / self.ur_kv) * (self.c_max / (1.0 + self.xd_subtransient_pu * sin_phi))

    @property
    def z_internal_ohm(self) -> complex:
        """Corrected machine SC impedance Z″_GK = K_G·(R_G + jX″d) [Ω]."""
        return self.k_g * complex(self.r_ohm, self.x_subtransient_ohm)

    @property
    def ir_a(self) -> float:
        """Rated current I_rG [A]."""
        return prad_znamionowy_a(self.sr_mva, self.ur_kv)

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
            "c_max": self.c_max,
            "c_max_zrodlo": self.c_max_zrodlo,
            "k_g": self.k_g,
            "z_internal_ohm": z,
            "z_abs_ohm": modul_zespolony(z),
            "ir_a": self.ir_a,
        }


def _asynchronous_r_over_x(ur_kv: float, p_per_pole_mw: float) -> float:
    """R_M/X_M for asynchronous motors (IEC 60909-0:2016 §6.7 / Table).

    Raises:
        ValueError: U_rM is not a physical rated voltage (non-finite, zero or negative).
    """
    if _pasmo_maszyny(ur_kv) == "nN":
        return 0.42  # LV motors / motor groups
    return 0.10 if p_per_pole_mw >= 1.0 else 0.15  # MV motors


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
    # Moc ZNAMIONOWA P_rM całej grupy [MW] (IEC 60909-0:2016 pkt 6.7 i 9.1.2) — nie punkt
    # pracy elementu. Mapowanie ENM rozstrzyga ją rejestrem wartości roboczych (karta
    # PODSTAWA-Q): projektant > tabliczka ``pr_mw`` > S_rM tabliczki·η_r·cos φ_r > propozycja.
    pr_mw: float = field(default=0.0)
    ur_kv: float = field(default=0.0)  # rated voltage U_rM [kV]
    # Karta PODSTAWA-Q (rozstrzygnięcie 3): dane tabliczki maszyny bez domyślek — wartość
    # podaje mapowanie ENM po rozstrzygnięciu pierwszeństwa (projektant > tabliczka >
    # propozycja rejestru `network_model.catalog.wartosci_robocze`).
    cos_phi_r: float = field(kw_only=True)  # rated power factor
    efficiency: float = field(kw_only=True)  # rated efficiency η
    i_lr_ratio: float = field(kw_only=True)  # locked-rotor ratio I_LR/I_rM
    pole_pairs: int = field(kw_only=True)  # p (for P_rM/p)
    # Liczba jednakowych maszyn, które element reprezentuje (``Generator.quantity``): ``pr_mw``
    # jest mocą CAŁEJ grupy (Z_M grupy = Z_M maszyny / n — wkład do I″k sumuje się), a moc na
    # parę biegunów m = P_rM/p (IEC 60909-0:2016 pkt 9.1.2, krzywa q; tabela R_M/X_M pkt 6.7)
    # dotyczy POJEDYNCZEJ maszyny — m z mocy grupy zawyżałoby q i zmieniało wiersz R_M/X_M.
    liczba_jednostek: int = field(kw_only=True)
    # Moc pozorna znamionowa S_rM całej grupy z tabliczki elementu [MVA]. Gdy podana, Z_M
    # liczy się z niej wprost (pkt 6.7 definiuje S_rM jako daną maszyny); bez niej
    # S_rM = P_rM/(η_r·cos φ_r) z ``pr_mw``.
    sr_mva_tabliczki: float | None = field(default=None, kw_only=True)
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
        """Moc pozorna znamionowa S_rM [MVA]: z tabliczki albo P_rM/(η_r·cos φ_r) (pkt 6.7)."""
        if self.sr_mva_tabliczki is not None:
            return self.sr_mva_tabliczki
        return moc_pozorna_maszyny_asynchronicznej_mva(self.pr_mw, self.efficiency, self.cos_phi_r)

    @property
    def ir_a(self) -> float:
        """Rated current I_rM [A]."""
        return prad_znamionowy_a(self.sr_mva, self.ur_kv)

    @property
    def z_abs_ohm(self) -> float:
        """|Z_M| = (1/(I_LR/I_rM))·(U_rM/(√3·I_rM))."""
        return (1.0 / self.i_lr_ratio) * impedancja_z_napiecia_i_pradu_ohm(
            kv_na_v(self.ur_kv), self.ir_a
        )

    @property
    def moc_jednostki_mw(self) -> float:
        """Moc znamionowa P_rM jednej maszyny grupy [MW]."""
        return self.pr_mw / max(1, self.liczba_jednostek)

    @property
    def p_per_pole_mw(self) -> float:
        """Moc czynna na parę biegunów m = P_rM/p JEDNEJ maszyny [MW] (pkt 9.1.2)."""
        return self.moc_jednostki_mw / max(1, self.pole_pairs)

    def r_over_x_zalezy_od_mocy_na_pare(self, m_od_mw: float, m_do_mw: float) -> bool:
        """Czy stosunek R_M/X_M (§6.7) jest różny na końcach zakresu mocy na parę biegunów m.

        Parametr wartości roboczej, od którego zależy m = P_rM/p (liczba par biegunów, moc
        znamionowa P_rM, a przy P_rM wyznaczonej z S_rM tabliczki — η_r i cos φ_r), poza krzywą
        zaniku q (wyłącznie I_b) może zmienić wiersz tabeli R_M/X_M maszyny SN (próg 1 MW na
        parę biegunów), a z nim impedancję Z_M — i wtedy wszystkie prądy zwarciowe punktu.
        Tabela jest schodkowa i monotoniczna w m, więc wystarczy porównać końce zakresu
        (wołający podaje zakres z bramy wartości parametru). Maszyna nN (wiersz stały 0,42)
        i maszyna z jawnym R_M/X_M nie zależą od m w tym sensie.
        """
        if self.r_over_x is not None:
            return False
        return _asynchronous_r_over_x(self.ur_kv, m_od_mw) != _asynchronous_r_over_x(
            self.ur_kv, m_do_mw
        )

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
            "sr_mva_z_tabliczki": self.sr_mva_tabliczki is not None,
            "efficiency": self.efficiency,
            "cos_phi_r": self.cos_phi_r,
            "ur_kv": self.ur_kv,
            "i_lr_ratio": self.i_lr_ratio,
            "ir_a": self.ir_a,
            "liczba_jednostek": self.liczba_jednostek,
            "p_per_pole_mw": self.p_per_pole_mw,
            "r_over_x": self.r_over_x_ratio,
            "z_internal_ohm": z,
            "z_abs_ohm": modul_zespolony(z),
            "pole_pairs": self.pole_pairs,
        }
