"""Data models for the short-circuit Ik'' plausibility guard (D-14).

Interpretation-layer verdicts only — these models never carry or modify any
solver physics. They describe whether a computed initial symmetrical
short-circuit current Ik'' is physically credible for its voltage level.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PlausibilityViolation:
    """A single crossed plausibility bound."""

    code: str
    severity: str  # "error" (niewiarygodny) | "warning" (podejrzany)
    message_pl: str
    basis_pl: str
    value_ka: float
    bound_ka: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "message_pl": self.message_pl,
            "basis_pl": self.basis_pl,
            "value_ka": self.value_ka,
            "bound_ka": self.bound_ka,
        }


@dataclass(frozen=True)
class ShortCircuitPlausibilityVerdict:
    """Per-voltage-level absurdity verdict for an initial short-circuit current.

    status:
        ``wiarygodny``    — Ik'' within credible bounds for the voltage level.
        ``podejrzany``    — above the highest common equipment rating; verify.
        ``niewiarygodny`` — physically impossible / beyond any standard rating
                            (e.g. 116 kA on a 15 kV MV bus).
    """

    status: str
    voltage_band: str
    voltage_band_label_pl: str
    nominal_kv: float
    ikss_ka: float
    ceiling_high_ka: float
    ceiling_max_ka: float
    violations: tuple[PlausibilityViolation, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "contract": "ShortCircuitPlausibilityV1",
            "status": self.status,
            "voltage_band": self.voltage_band,
            "voltage_band_label_pl": self.voltage_band_label_pl,
            "nominal_kv": self.nominal_kv,
            "ikss_ka": self.ikss_ka,
            "ceiling_high_ka": self.ceiling_high_ka,
            "ceiling_max_ka": self.ceiling_max_ka,
            "violations": [violation.to_dict() for violation in self.violations],
        }
