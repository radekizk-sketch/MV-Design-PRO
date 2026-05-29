"""
V12.6 Absurdity Barriers — sanity bounds for academic analyses (D-14 / K-08).

PURPOSE
-------
Several V12.6 analyses return numbers without an "absurdity barrier": a working
analysis can emit a physically impossible value (negative SAIDI, losses larger
than the delivered power, an expanded uncertainty wider than the value itself)
and present it as a fact. A wrong value reported as fact is more dangerous than
a missing module — this is the same class of problem as "116 kA on 15 kV MV".

These functions implement K-08 sanity-bounds for the reliability, OPF/loss/LCC
and uncertainty analyses. They are an INTERPRETATION layer over the solver
output:

- They DO NOT modify any computed physics value (no heuristics, no corrections).
- They only ATTACH a verdict: are the numbers physically plausible?
- Every bound is documented with its physical/normative basis so the check is
  auditable (WHITE BOX).

STATUS VALUES (Polish, consistent with the rest of the V12.6 solver):
- ``wiarygodny``    — all values inside physical bounds.
- ``podejrzany``    — a value is grossly implausible but not strictly impossible.
- ``niewiarygodny`` — a value is physically impossible (sign error, non-finite,
                      beyond a hard physical ceiling).

Determinism: pure arithmetic, fixed iteration order — same input, same verdict.
"""

from __future__ import annotations

import math
from typing import Any

JsonDict = dict[str, Any]

# Minutes in a (non-leap) year: 8760 h * 60 min. Hard physical ceiling for any
# customer-average interruption index expressed in minutes/year (IEEE 1366).
MINUTES_PER_YEAR = 8760.0 * 60.0  # 525 600

# One interruption per hour averaged over a full year — already far beyond any
# real distribution network; used as the "suspect" ceiling for SAIFI.
INTERRUPTIONS_PER_HOUR_YEAR = 8760.0

# Severity tokens (machine-readable). Human text lives in ``message_pl``.
_ERROR = "error"
_WARNING = "warning"


def _is_finite(value: Any) -> bool:
    return isinstance(value, int | float) and math.isfinite(float(value))


def _violation(
    code: str,
    severity: str,
    quantity: str,
    value: Any,
    bound: float | None,
    bound_kind: str,
    message_pl: str,
    basis_pl: str,
) -> JsonDict:
    return {
        "code": code,
        "severity": severity,
        "quantity": quantity,
        "value": value,
        "bound": bound,
        "bound_kind": bound_kind,
        "message_pl": message_pl,
        "basis_pl": basis_pl,
    }


def _verdict(checks_total: int, bounds: JsonDict, violations: list[JsonDict]) -> JsonDict:
    if any(item["severity"] == _ERROR for item in violations):
        status = "niewiarygodny"
    elif any(item["severity"] == _WARNING for item in violations):
        status = "podejrzany"
    else:
        status = "wiarygodny"
    return {
        "status": status,
        "checks_total": checks_total,
        "bounds": bounds,
        "violations": violations,
        "contract": "AbsurdityBarrierV1",
    }


def _check_non_negative_finite(
    *,
    value: Any,
    quantity: str,
    code_prefix: str,
    label_pl: str,
    basis_pl: str,
    violations: list[JsonDict],
) -> float | None:
    """Validate a value as finite and non-negative.

    Returns the value as ``float`` when usable, or ``None`` (after recording a
    violation) when it is non-finite or negative.
    """
    if not _is_finite(value):
        violations.append(
            _violation(
                f"{code_prefix}-NAN",
                _ERROR,
                quantity,
                value,
                None,
                "finite",
                f"{label_pl} nie jest liczbą skończoną (NaN/inf) — wynik niewiarygodny.",
                basis_pl,
            )
        )
        return None
    numeric = float(value)
    if numeric < 0:
        violations.append(
            _violation(
                f"{code_prefix}-NEG",
                _ERROR,
                quantity,
                numeric,
                0.0,
                "min",
                f"{label_pl} jest ujemna ({numeric:g}) — wartość fizycznie niemożliwa.",
                basis_pl,
            )
        )
        return None
    return numeric


# ---------------------------------------------------------------------------
# Reliability (SAIDI / SAIFI / CAIDI + contingency loading)
# ---------------------------------------------------------------------------


def reliability_sanity(result: JsonDict, model: Any) -> JsonDict:
    """Absurdity barrier for reliability indices and contingency loading."""
    indices = result.get("indices", {})
    violations: list[JsonDict] = []
    checks = 0

    saidi = indices.get("saidi_min_per_year")
    saifi = indices.get("saifi_per_year")
    caidi = indices.get("caidi_min_per_interruption")

    # SAIDI — minutes/year, must be in [0, minutes in a year].
    checks += 2
    saidi_value = _check_non_negative_finite(
        value=saidi,
        quantity="saidi_min_per_year",
        code_prefix="REL-SAIDI",
        label_pl="SAIDI",
        basis_pl="IEEE 1366; SAIDI to średni czas przerw na klienta i nie może przekroczyć liczby minut w roku.",
        violations=violations,
    )
    if saidi_value is not None and saidi_value > MINUTES_PER_YEAR:
        violations.append(
            _violation(
                "REL-SAIDI-MAX",
                _ERROR,
                "saidi_min_per_year",
                saidi_value,
                MINUTES_PER_YEAR,
                "max",
                f"SAIDI {saidi_value:g} min/rok przekracza liczbę minut w roku ({MINUTES_PER_YEAR:g}) — niemożliwe.",
                "IEEE 1366: roczny czas przerw nie może być dłuższy niż rok (8760 h).",
            )
        )

    # SAIFI — interruptions/year, must be >= 0; >1/h-avg suspect, >1/min impossible.
    checks += 2
    saifi_value = _check_non_negative_finite(
        value=saifi,
        quantity="saifi_per_year",
        code_prefix="REL-SAIFI",
        label_pl="SAIFI",
        basis_pl="IEEE 1366; SAIFI to średnia liczba przerw na klienta w roku.",
        violations=violations,
    )
    if saifi_value is not None:
        if saifi_value > MINUTES_PER_YEAR:
            violations.append(
                _violation(
                    "REL-SAIFI-MAX",
                    _ERROR,
                    "saifi_per_year",
                    saifi_value,
                    MINUTES_PER_YEAR,
                    "max",
                    f"SAIFI {saifi_value:g}/rok oznacza ponad jedną przerwę na minutę — fizycznie niemożliwe.",
                    "IEEE 1366: liczba przerw podtrzymanych ograniczona liczbą minut w roku.",
                )
            )
        elif saifi_value > INTERRUPTIONS_PER_HOUR_YEAR:
            violations.append(
                _violation(
                    "REL-SAIFI-HIGH",
                    _WARNING,
                    "saifi_per_year",
                    saifi_value,
                    INTERRUPTIONS_PER_HOUR_YEAR,
                    "max",
                    f"SAIFI {saifi_value:g}/rok (ponad 1 przerwa na godzinę średnio) — sprawdź dane awaryjności.",
                    "Wartość znacząco poza realnym zakresem sieci dystrybucyjnej (typowo <50/rok).",
                )
            )

    # CAIDI — minutes/interruption, must be in [0, minutes in a year].
    checks += 2
    caidi_value = _check_non_negative_finite(
        value=caidi,
        quantity="caidi_min_per_interruption",
        code_prefix="REL-CAIDI",
        label_pl="CAIDI",
        basis_pl="IEEE 1366; CAIDI = SAIDI/SAIFI to średni czas trwania pojedynczej przerwy.",
        violations=violations,
    )
    if caidi_value is not None and caidi_value > MINUTES_PER_YEAR:
        violations.append(
            _violation(
                "REL-CAIDI-MAX",
                _ERROR,
                "caidi_min_per_interruption",
                caidi_value,
                MINUTES_PER_YEAR,
                "max",
                f"CAIDI {caidi_value:g} min przekracza długość roku — wartość niemożliwa.",
                "IEEE 1366: czas trwania przerwy nie może przekroczyć roku.",
            )
        )

    # Contingency loading — must be finite and non-negative (overload >100% is legal).
    checks += 1
    for row in result.get("contingency_ranking", []):
        loading = row.get("max_loading_percent")
        if loading is None:
            continue
        if not _is_finite(loading) or float(loading) < 0:
            violations.append(
                _violation(
                    "REL-LOAD-NEG",
                    _ERROR,
                    "max_loading_percent",
                    loading,
                    0.0,
                    "min",
                    f"Obciążenie {row.get('contingency')} = {loading} % jest ujemne lub nieskończone — błąd danych.",
                    "Obciążenie procentowe (I/Iz) nie może być ujemne ani nieskończone.",
                )
            )
            break
        if float(loading) > 100_000.0:
            violations.append(
                _violation(
                    "REL-LOAD-ABSURD",
                    _WARNING,
                    "max_loading_percent",
                    float(loading),
                    100_000.0,
                    "max",
                    f"Obciążenie {row.get('contingency')} = {float(loading):g} % (>100000%) sugeruje obciążalność bliską zeru.",
                    "Obciążenie tysiące razy powyżej znamionowego wskazuje na błędną obciążalność gałęzi.",
                )
            )
            break

    bounds = {
        "saidi_min_per_year": {"min": 0.0, "max": MINUTES_PER_YEAR},
        "saifi_per_year": {
            "min": 0.0,
            "suspect_above": INTERRUPTIONS_PER_HOUR_YEAR,
            "max": MINUTES_PER_YEAR,
        },
        "caidi_min_per_interruption": {"min": 0.0, "max": MINUTES_PER_YEAR},
        "max_loading_percent": {"min": 0.0, "suspect_above": 100_000.0},
    }
    return _verdict(checks, bounds, violations)


# ---------------------------------------------------------------------------
# OPF / losses / LCC
# ---------------------------------------------------------------------------


def opf_loss_sanity(result: JsonDict, model: Any) -> JsonDict:
    """Absurdity barrier for loss / LCC figures."""
    violations: list[JsonDict] = []
    checks = 0

    total_losses = result.get("total_losses_kw")
    checks += 1
    losses_value = _check_non_negative_finite(
        value=total_losses,
        quantity="total_losses_kw",
        code_prefix="OPF-LOSS",
        label_pl="Straty całkowite ΔP",
        basis_pl="Straty Joule'a ΔP = 3·I²·R są zawsze nieujemne; wartość ujemna oznacza błąd znaku.",
        violations=violations,
    )

    # Per-branch losses must each be non-negative.
    checks += 1
    for row in result.get("branch_losses", []):
        loss = row.get("loss_kw")
        if not _is_finite(loss) or float(loss) < 0:
            violations.append(
                _violation(
                    "OPF-BRANCH-LOSS-NEG",
                    _ERROR,
                    "branch_losses[].loss_kw",
                    loss,
                    0.0,
                    "min",
                    f"Strata gałęzi {row.get('branch_ref')} = {loss} kW jest ujemna lub nieskończona — błąd.",
                    "Strata pojedynczej gałęzi (3·I²·R) nie może być ujemna.",
                )
            )
            break

    # Energy / cost / CO2 must be non-negative.
    for quantity, prefix, label, basis in (
        (
            "annual_losses_kwh",
            "OPF-ENERGY",
            "Roczna energia strat",
            "Energia strat = moc strat × czas; nie może być ujemna.",
        ),
        (
            "lcc_loss_opex_pv_pln",
            "OPF-LCC",
            "LCC OPEX (PV) strat",
            "Zdyskontowany koszt strat nie może być ujemny.",
        ),
        (
            "annual_co2_kg",
            "OPF-CO2",
            "Roczna emisja CO₂ strat",
            "Emisja CO₂ wynikająca ze strat nie może być ujemna.",
        ),
    ):
        checks += 1
        _check_non_negative_finite(
            value=result.get(quantity),
            quantity=quantity,
            code_prefix=prefix,
            label_pl=label,
            basis_pl=basis,
            violations=violations,
        )

    # Loss ratio: total losses larger than total connected power (load + generation)
    # is grossly implausible (efficiency < 50%). Not strictly impossible because
    # the slack/grid infeed is implicit, hence WARNING rather than ERROR.
    total_supply_kw = 0.0
    for bus in getattr(model, "buses", []):
        total_supply_kw += math.hypot(bus.load_mw, bus.load_mvar) * 1000.0
        total_supply_kw += math.hypot(bus.generation_mw, bus.generation_mvar) * 1000.0
    checks += 1
    if losses_value is not None and total_supply_kw > 0 and losses_value > total_supply_kw:
        violations.append(
            _violation(
                "OPF-LOSS-RATIO",
                _WARNING,
                "total_losses_kw",
                losses_value,
                total_supply_kw,
                "max",
                (
                    f"Straty {losses_value:g} kW przewyższają moc przyłączoną "
                    f"{total_supply_kw:g} kW (sprawność < 50%) — sprawdź dane."
                ),
                "W stanie ustalonym straty są ułamkiem mocy przesyłanej (typowo 1–10%).",
            )
        )

    bounds = {
        "total_losses_kw": {"min": 0.0, "suspect_above_kw": round(total_supply_kw, 6)},
        "annual_losses_kwh": {"min": 0.0},
        "lcc_loss_opex_pv_pln": {"min": 0.0},
        "annual_co2_kg": {"min": 0.0},
    }
    return _verdict(checks, bounds, violations)


# ---------------------------------------------------------------------------
# Uncertainty (expanded uncertainty k=2)
# ---------------------------------------------------------------------------

# Above 100% the ± band crosses zero for an inherently positive quantity; above
# 10× the value the propagation is clearly broken.
UNCERTAINTY_SUSPECT_PERCENT = 100.0
UNCERTAINTY_MAX_PERCENT = 1000.0


def uncertainty_sanity(result: JsonDict, model: Any) -> JsonDict:
    """Absurdity barrier for the expanded uncertainty (k=2)."""
    violations: list[JsonDict] = []
    checks = 0

    expanded = result.get("expanded_uncertainty_percent_k2")
    checks += 1
    expanded_value = _check_non_negative_finite(
        value=expanded,
        quantity="expanded_uncertainty_percent_k2",
        code_prefix="UNC",
        label_pl="Niepewność rozszerzona k=2",
        basis_pl="GUM/JCGM 100; U = 2·σ jest nieujemne.",
        violations=violations,
    )
    if expanded_value is not None:
        checks += 1
        if expanded_value > UNCERTAINTY_MAX_PERCENT:
            violations.append(
                _violation(
                    "UNC-ABSURD",
                    _ERROR,
                    "expanded_uncertainty_percent_k2",
                    expanded_value,
                    UNCERTAINTY_MAX_PERCENT,
                    "max",
                    f"Niepewność rozszerzona {expanded_value:g}% (>{UNCERTAINTY_MAX_PERCENT:g}%) — propagacja zawodzi.",
                    "Niepewność dziesięciokrotnie większa od wartości oznacza błąd modelu niepewności.",
                )
            )
        elif expanded_value > UNCERTAINTY_SUSPECT_PERCENT:
            violations.append(
                _violation(
                    "UNC-OVER-100",
                    _WARNING,
                    "expanded_uncertainty_percent_k2",
                    expanded_value,
                    UNCERTAINTY_SUSPECT_PERCENT,
                    "max",
                    (
                        f"Niepewność rozszerzona {expanded_value:g}% przekracza wartość nominalną — "
                        "przedział ± obejmuje zero."
                    ),
                    "GUM: dla wielkości dodatniej U > 100% daje nieinterpretowalny przedział.",
                )
            )

    bounds = {
        "expanded_uncertainty_percent_k2": {
            "min": 0.0,
            "suspect_above": UNCERTAINTY_SUSPECT_PERCENT,
            "max": UNCERTAINTY_MAX_PERCENT,
        }
    }
    return _verdict(checks, bounds, violations)
