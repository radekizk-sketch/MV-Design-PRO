"""
Protection Sanity Checks Module — API.

CANONICAL API:
    run_sanity_checks(
        functions: list[ProtectionFunctionSummary],
        base_values: BaseValues,
        element_context: ElementContext
    ) -> list[ProtectionSanityCheckResult]

DETERMINISM:
    Wyniki sortowane po: element_id, severity (ERROR > WARN > INFO), code.

100% POLISH MESSAGES.
"""

from __future__ import annotations

from application.analyses.protection.base_values.models import BaseValues
from application.analyses.protection.sanity_checks.models import (
    SANITY_CHECK_CODE_LABELS_PL,
    SEVERITY_LABELS_PL,
    ProtectionSanityCheckResult,
    SanityCheckCode,
    SanityCheckSeverity,
)
from application.analyses.protection.sanity_checks.rules import (
    ALL_RULES,
    ElementContext,
    ProtectionFunctionSummary,
)

__all__ = [
    # API
    "run_sanity_checks",
    # Models
    "ProtectionSanityCheckResult",
    "SanityCheckCode",
    "SanityCheckSeverity",
    "ProtectionFunctionSummary",
    "ElementContext",
    # Labels
    "SANITY_CHECK_CODE_LABELS_PL",
    "SEVERITY_LABELS_PL",
]


def run_sanity_checks(
    functions: list[ProtectionFunctionSummary],
    base_values: BaseValues,
    element_context: ElementContext,
) -> list[ProtectionSanityCheckResult]:
    """
    Uruchom wszystkie reguly walidacji na funkcjach zabezpieczeniowych.

    Args:
        functions: lista funkcji zabezpieczeniowych do walidacji
        base_values: rozwiazane wartosci bazowe (Un/In)
        element_context: kontekst elementu (id, typ)

    Returns:
        Lista wynikow walidacji, posortowana deterministycznie:
        1. element_id (asc)
        2. severity (ERROR > WARN > INFO)
        3. code (asc)

    Example:
        >>> from application.analyses.protection.sanity_checks import (
        ...     run_sanity_checks,
        ...     ProtectionFunctionSummary,
        ...     ElementContext,
        ... )
        >>> from application.analyses.protection.base_values.models import (
        ...     BaseValues,
        ...     BaseValueSourceUn,
        ...     BaseValueSourceIn,
        ...     ProtectionSetpoint,
        ...     ProtectionSetpointBasis,
        ...     ProtectionSetpointOperator,
        ... )
        >>>
        >>> ctx = ElementContext(element_id="line-001", element_type="LINE")
        >>> base = BaseValues(
        ...     un_kv=15.0,
        ...     in_a=503.0,
        ...     source_un=BaseValueSourceUn.BUS,
        ...     source_in=BaseValueSourceIn.LINE,
        ... )
        >>> functions = [
        ...     ProtectionFunctionSummary(
        ...         code="OVERCURRENT_TIME",
        ...         ansi=("51",),
        ...         label_pl="Nadpradowa czasowa (I>)",
        ...         setpoint=ProtectionSetpoint(
        ...             basis=ProtectionSetpointBasis.IN,
        ...             operator=ProtectionSetpointOperator.GT,
        ...             multiplier=1.2,
        ...             unit="pu",
        ...             display_pl="1,2×In",
        ...         ),
        ...     ),
        ... ]
        >>> results = run_sanity_checks(functions, base, ctx)
    """
    results: list[ProtectionSanityCheckResult] = []

    # Uruchom wszystkie reguly
    for rule_fn in ALL_RULES:
        rule_results = rule_fn(functions, base_values, element_context)
        results.extend(rule_results)

    # Sortuj deterministycznie
    results.sort(key=_sort_key)

    return results


def _sort_key(result: ProtectionSanityCheckResult) -> tuple[str, int, str]:
    """
    Klucz sortowania dla wynikow.

    Kolejnosc:
    1. element_id (asc)
    2. severity (ERROR=0, WARN=1, INFO=2)
    3. code (asc)
    """
    severity_order = {
        SanityCheckSeverity.ERROR: 0,
        SanityCheckSeverity.WARN: 1,
        SanityCheckSeverity.INFO: 2,
    }
    return (
        result.element_id,
        severity_order[result.severity],
        result.code.value,
    )
