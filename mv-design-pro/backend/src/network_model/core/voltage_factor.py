"""IEC 60909-0 Table 1 — voltage factor c, single shared source of truth.

Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4):
c is selected PER FAULT-NODE VOLTAGE BAND, never per study/globally:

    band            c_max   c_min
    <=1.0 kV (nN)   1.05    0.95
    >1.0 kV (SN/WN) 1.10    1.00

The band boundary itself is NOT encoded here: IEC 60909-0 Table 1 defines "low
voltage" by reference to IEC 60038 Table 1 (100 V to 1 000 V inclusive), i.e. the
same nN band as the rest of the product, so the selection uses the single band
source ``network_model.pochodne.pasma_napieciowe.pasmo_napieciowe``. A node whose nominal
voltage lies in no band (missing, non-finite, zero or negative) is REFUSED with a named
error: Table 1 has no row for it, and silently taking the low-voltage row (the behaviour
before 2026-09-25) was a guess that turned invalid input into a plausible-looking c.

This module is the ONE place that encodes the c values of the table. ``TransformerBranch.
get_voltage_factor_c_max``/``get_voltage_factor_c_min`` (network_model/core/
branch.py) delegate here instead of duplicating the thresholds, and
``application/solvers/short_circuit_binding.py`` uses ``c_for_node`` directly
to pick c for the actual short-circuit fault node.

NOT a solver: pure lookup, no physics computation, no network state.
"""

from __future__ import annotations

from typing import Literal

from network_model.pochodne.pasma_napieciowe import pasmo_napieciowe

Scenario = Literal["MAX", "MIN"]

# IEC 60909-0 Table 1 (voltage factor c) — values.
LV_C_MAX = 1.05  # <=1.0 kV (nN, e.g. 230/400 V systems, tolerance +6 %)
LV_C_MIN = 0.95
MV_HV_C_MAX = 1.10  # >1.0 kV (SN/WN)
MV_HV_C_MIN = 1.00


def c_for_node(voltage_kv: float, scenario: Scenario) -> float:
    """Return the IEC 60909-0 Table 1 voltage factor c for a node.

    Args:
        voltage_kv: Nominal voltage of the node [kV].
        scenario: "MAX" (for Ik''max, Ip, Ith) or "MIN" (for Ik''min).

    Returns:
        c per Table 1: 1.05/0.95 for voltage_kv <= 1.0 kV, else 1.10/1.00.

    Raises:
        ValueError: scenario is neither "MAX" nor "MIN", or voltage_kv is not a physical
            nominal voltage (non-finite, zero or negative) — no row of Table 1 applies.
    """
    if scenario not in ("MAX", "MIN"):
        raise ValueError(f"Nieznany scenariusz współczynnika c: {scenario!r} (oczekiwano MAX/MIN)")
    pasmo = pasmo_napieciowe(voltage_kv)
    if pasmo is None:
        raise ValueError(
            f"Napięcie znamionowe {voltage_kv!r} kV nie leży w żadnym paśmie napięć — "
            "współczynnika napięciowego c (IEC 60909-0, tabela 1) nie da się dobrać."
        )
    if scenario == "MAX":
        return LV_C_MAX if pasmo == "nN" else MV_HV_C_MAX
    return LV_C_MIN if pasmo == "nN" else MV_HV_C_MIN
