"""Per-voltage-level absurdity guard for Ik'' (D-14, interpretation layer).

WHY
---
The initial symmetrical short-circuit current Ik'' = c·Un / (√3·Z) becomes
absurd when the source impedance or network data is wrong — the canonical
example being "116 kA on a 15 kV MV bus", which is ~2× the highest short-circuit
current any standardised MV switchgear is built for. A solver that emits such a
value and a report that prints it as fact is exactly the failure mode this guard
exists to catch.

This is an INTERPRETATION-layer check. It reads the frozen short-circuit result
(Ik'' and the nominal voltage) and returns a verdict; it never recomputes or
corrects the physics (no heuristics in solvers, frozen Result API respected).

The credible ceilings per voltage band are grounded in standardised equipment
short-circuit ratings (IEC 62271-100 for HV/MV, IEC 60947-2 for LV). They are
deliberately conservative: only genuinely implausible values are flagged.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from analysis.short_circuit_plausibility.models import (
    PlausibilityViolation,
    ShortCircuitPlausibilityVerdict,
)

_ERROR = "error"
_WARNING = "warning"


@dataclass(frozen=True)
class VoltageBand:
    code: str
    label_pl: str
    max_nominal_kv: float  # inclusive upper bound of this band
    ceiling_high_ka: float  # above -> suspect (podejrzany)
    ceiling_max_ka: float  # above -> implausible (niewiarygodny)
    basis_pl: str


# Ordered ascending by nominal voltage. Ceilings reflect the highest standardised
# short-circuit current ratings of switching equipment in each band.
VOLTAGE_BANDS: tuple[VoltageBand, ...] = (
    VoltageBand(
        "nN",
        "niskie napięcie (nN)",
        1.0,
        100.0,
        200.0,
        "IEC 60947-2: zdolność zwarciowa aparatury nN sięga ~150 kA.",
    ),
    VoltageBand(
        "SN",
        "średnie napięcie (SN)",
        52.0,
        50.0,
        63.0,
        "IEC 62271-100: znormalizowane prądy zwarciowe SN do 50 kA (skrajnie 63 kA).",
    ),
    VoltageBand(
        "WN",
        "wysokie napięcie (WN)",
        245.0,
        63.0,
        100.0,
        "IEC 62271-100: prądy wyłączalne WN typowo do 63 kA (skrajnie 100 kA).",
    ),
    VoltageBand(
        "NN",
        "najwyższe napięcie (NN)",
        math.inf,
        80.0,
        125.0,
        "IEC 62271-100: prądy wyłączalne NN do 80 kA (skrajnie 125 kA).",
    ),
)

_UNDETERMINED = VoltageBand("nieokreślone", "napięcie nieokreślone", math.inf, 0.0, 0.0, "—")


def _band_for(nominal_kv: float) -> VoltageBand:
    for band in VOLTAGE_BANDS:
        if nominal_kv <= band.max_nominal_kv:
            return band
    return VOLTAGE_BANDS[-1]


def evaluate_ikss_plausibility(
    *,
    ikss_a: float,
    nominal_voltage_v: float,
) -> ShortCircuitPlausibilityVerdict:
    """Evaluate whether Ik'' is physically credible for its voltage level.

    Args:
        ikss_a: initial symmetrical short-circuit current Ik'' [A].
        nominal_voltage_v: line-to-line nominal voltage at the fault point [V].
    """
    violations: list[PlausibilityViolation] = []

    voltage_valid = math.isfinite(nominal_voltage_v) and nominal_voltage_v > 0
    nominal_kv = nominal_voltage_v / 1000.0 if voltage_valid else 0.0
    band = _band_for(nominal_kv) if voltage_valid else _UNDETERMINED

    ikss_finite = math.isfinite(ikss_a)
    ikss_ka = ikss_a / 1000.0 if ikss_finite else ikss_a

    if not voltage_valid:
        violations.append(
            PlausibilityViolation(
                "SC-IK-UN-INVALID",
                _ERROR,
                f"Napięcie znamionowe w punkcie zwarcia ({nominal_voltage_v}) jest niepoprawne — "
                "nie można ocenić wiarygodności Ik''.",
                "Ik'' = c·Un/(√3·Z): napięcie znamionowe musi być dodatnie i skończone.",
                ikss_ka if ikss_finite else float("nan"),
                None,
            )
        )

    if not ikss_finite:
        violations.append(
            PlausibilityViolation(
                "SC-IK-NAN",
                _ERROR,
                "Prąd zwarciowy Ik'' nie jest liczbą skończoną (NaN/inf) — wynik niewiarygodny.",
                "Ik'' musi być skończony; NaN/inf wskazuje na osobliwą impedancję lub błąd obliczeń.",
                ikss_a,
                None,
            )
        )
    elif ikss_a <= 0:
        violations.append(
            PlausibilityViolation(
                "SC-IK-NONPOS",
                _ERROR,
                f"Prąd zwarciowy Ik'' = {ikss_ka:g} kA jest niedodatni — w miejscu zwarcia musi płynąć prąd.",
                "Zwarcie wymusza dodatni prąd Ik''; wartość ≤ 0 oznacza błąd danych lub obliczeń.",
                ikss_ka,
                0.0,
            )
        )
    elif voltage_valid:
        if ikss_ka > band.ceiling_max_ka:
            violations.append(
                PlausibilityViolation(
                    "SC-IK-ABSURD",
                    _ERROR,
                    (
                        f"Ik'' = {ikss_ka:g} kA dla {nominal_kv:g} kV ({band.code}) przekracza maksymalny "
                        f"znormalizowany prąd {band.ceiling_max_ka:g} kA — wartość niewiarygodna "
                        "(sprawdź impedancję źródła i dane sieci)."
                    ),
                    band.basis_pl,
                    ikss_ka,
                    band.ceiling_max_ka,
                )
            )
        elif ikss_ka > band.ceiling_high_ka:
            violations.append(
                PlausibilityViolation(
                    "SC-IK-HIGH",
                    _WARNING,
                    (
                        f"Ik'' = {ikss_ka:g} kA dla {nominal_kv:g} kV ({band.code}) przekracza najwyższy typowy "
                        f"prąd {band.ceiling_high_ka:g} kA — zweryfikuj dobór aparatury i dane źródła."
                    ),
                    band.basis_pl,
                    ikss_ka,
                    band.ceiling_high_ka,
                )
            )

    if any(item.severity == _ERROR for item in violations):
        status = "niewiarygodny"
    elif any(item.severity == _WARNING for item in violations):
        status = "podejrzany"
    else:
        status = "wiarygodny"

    return ShortCircuitPlausibilityVerdict(
        status=status,
        voltage_band=band.code,
        voltage_band_label_pl=band.label_pl,
        nominal_kv=round(nominal_kv, 6),
        ikss_ka=round(ikss_ka, 6) if ikss_finite else ikss_ka,
        ceiling_high_ka=band.ceiling_high_ka,
        ceiling_max_ka=band.ceiling_max_ka,
        violations=tuple(violations),
    )
