"""Reference Networks — walidacja solverów vs publikowane benchmarki.

Moduł odrębny od `reference_patterns/` (wzorce protection methodology).

Eksportuje:
- ReferenceNetwork (z library.py) — registry frozen dataclass
- ExpectedValues (z expected_values.py) — hardcoded values from literature
- ValidationReport (z comparator.py) — PASS/FAIL diff report

Zobacz docs/reference-networks/source-citations.md dla pełnej bibliografii.
"""

from application.reference_networks.comparator import (
    ElementComparison,
    ValidationReport,
    build_validation_report,
    compare_power_flow,
    compare_short_circuit,
)
from application.reference_networks.expected_values import (
    ExpectedBranchPF,
    ExpectedBusPF,
    ExpectedShortCircuit,
    ExpectedValues,
    load_expected_values_from_json,
)
from application.reference_networks.library import (
    REFERENCE_NETWORK_REGISTRY,
    ReferenceNetwork,
    get_reference_network,
    list_reference_networks,
)

__all__ = [
    "ElementComparison",
    "ExpectedBranchPF",
    "ExpectedBusPF",
    "ExpectedShortCircuit",
    "ExpectedValues",
    "REFERENCE_NETWORK_REGISTRY",
    "ReferenceNetwork",
    "ValidationReport",
    "build_validation_report",
    "compare_power_flow",
    "compare_short_circuit",
    "get_reference_network",
    "list_reference_networks",
    "load_expected_values_from_json",
]
