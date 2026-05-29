"""
Unit conversions: ENM domain units <-> SI (the CIM convention).

Single source of truth so that the round-trip is exact:
  - export converts ENM units -> SI for the EQ/TP profiles
  - import converts SI -> ENM units
Because the same factors are used both ways and per-km quantities are recovered
by dividing the SI total by the (preserved) length, the conversion is lossless
within float precision.

CIM SI conventions used here:
  voltage   : kV   -> V   (x 1e3)
  power     : MVA  -> VA  (x 1e6)   / MW -> W (x 1e6)
  impedance : Ohm/km * length_km -> Ohm total
  susceptance (line shunt): S/km * length_km -> S total (CIM ACLineSegment.bch is S)
  length    : km   -> m   (x 1e3)

ZERO physics: these are pure unit scalings, no network calculations.
This module imports neither solvers nor analysis.
"""

from __future__ import annotations

from typing import Final

# ---------------------------------------------------------------------------
# Scaling factors (SI per ENM unit)
# ---------------------------------------------------------------------------

_KV_TO_V: Final[float] = 1.0e3
_MVA_TO_VA: Final[float] = 1.0e6
_MW_TO_W: Final[float] = 1.0e6
_KM_TO_M: Final[float] = 1.0e3

# ---------------------------------------------------------------------------
# Deterministic float formatter
# ---------------------------------------------------------------------------
#
# A single fixed formatter for every numeric attribute written to XML. ``.10g``
# gives a stable, round-trip-safe textual representation (10 significant
# digits) and never emits locale-specific separators. float(fmt(x)) recovers
# x for all values produced by the conversions below.


def fmt_float(value: float) -> str:
    """Format a float deterministically for XML emission (10 significant figs)."""
    return f"{float(value):.10g}"


# ---------------------------------------------------------------------------
# Forward conversions: ENM -> SI
# ---------------------------------------------------------------------------


def kv_to_v(kv: float) -> float:
    return float(kv) * _KV_TO_V


def mva_to_va(mva: float) -> float:
    return float(mva) * _MVA_TO_VA


def mw_to_w(mw: float) -> float:
    return float(mw) * _MW_TO_W


def km_to_m(km: float) -> float:
    return float(km) * _KM_TO_M


def per_km_to_total_ohm(value_per_km: float, length_km: float) -> float:
    """Ohm/km * km -> total Ohm."""
    return float(value_per_km) * float(length_km)


def per_km_to_total_siemens(value_per_km: float, length_km: float) -> float:
    """S/km * km -> total S."""
    return float(value_per_km) * float(length_km)


# ---------------------------------------------------------------------------
# Inverse conversions: SI -> ENM
# ---------------------------------------------------------------------------


def v_to_kv(v: float) -> float:
    return float(v) / _KV_TO_V


def va_to_mva(va: float) -> float:
    return float(va) / _MVA_TO_VA


def w_to_mw(w: float) -> float:
    return float(w) / _MW_TO_W


def m_to_km(m: float) -> float:
    return float(m) / _KM_TO_M


def total_ohm_to_per_km(total_ohm: float, length_km: float) -> float:
    """Total Ohm / km -> Ohm/km. length_km must be > 0."""
    if length_km == 0:
        raise ZeroDivisionError("Cannot recover per-km impedance: length_km is zero")
    return float(total_ohm) / float(length_km)


def total_siemens_to_per_km(total_s: float, length_km: float) -> float:
    """Total S / km -> S/km. length_km must be > 0."""
    if length_km == 0:
        raise ZeroDivisionError("Cannot recover per-km susceptance: length_km is zero")
    return float(total_s) / float(length_km)
