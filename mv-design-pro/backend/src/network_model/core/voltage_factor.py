"""IEC 60909-0 Table 1 — voltage factor c, single shared source of truth.

Karta P0.3 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3, docs/nn/D_KONTRAKT_SN_NN_V1.md §4):
c is selected PER FAULT-NODE VOLTAGE BAND, never per study/globally:

    band            c_max   c_min
    <=1.0 kV (nN)   1.05    0.95
    >1.0 kV (SN/WN) 1.10    1.00

This module is the ONE place that encodes the table. ``TransformerBranch.
get_voltage_factor_c_max``/``get_voltage_factor_c_min`` (network_model/core/
branch.py) delegate here instead of duplicating the thresholds, and
``application/solvers/short_circuit_binding.py`` uses ``c_for_node`` directly
to pick c for the actual short-circuit fault node.

NOT a solver: pure lookup, no physics computation, no network state.
"""

from __future__ import annotations

from typing import Literal

Scenario = Literal["MAX", "MIN"]

# IEC 60909-0 Table 1 (voltage factor c) — thresholds and values.
LV_BAND_LIMIT_KV = 1.0

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
        ValueError: scenario is neither "MAX" nor "MIN".
    """
    if scenario == "MAX":
        return LV_C_MAX if voltage_kv <= LV_BAND_LIMIT_KV else MV_HV_C_MAX
    if scenario == "MIN":
        return LV_C_MIN if voltage_kv <= LV_BAND_LIMIT_KV else MV_HV_C_MIN
    raise ValueError(f"Nieznany scenariusz współczynnika c: {scenario!r} (oczekiwano MAX/MIN)")
