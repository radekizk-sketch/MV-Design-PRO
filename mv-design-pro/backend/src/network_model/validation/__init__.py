"""
Network model validation module.

PowerFactory-style validation that must pass before solver execution.
Validates graph connectivity, element presence, and parameter validity.

This is NOT a solver - it's a pre-check layer.
"""

from .oze_validators import (
    all_generator_types_have_handlers,
    get_nn_validators_for_type,
    get_sn_validators_for_type,
    validate_bess_parameters,
    validate_generator_nn_parameters,
    validate_power_limit,
    validate_pv_has_transformer,
    validate_voltage_compatibility,
)
from .semantic_rules import SEMANTIC_RULES
from .semantic_validator import validate_semantic, validate_semantic_as_dicts
from .validator import (
    NetworkValidator,
    Severity,
    ValidationIssue,
    ValidationReport,
    validate_network,
)

__all__ = [
    "NetworkValidator",
    "ValidationReport",
    "ValidationIssue",
    "Severity",
    "validate_network",
    # Semantic validators (PR-C)
    "SEMANTIC_RULES",
    "validate_semantic",
    "validate_semantic_as_dicts",
    # OZE validators
    "validate_pv_has_transformer",
    "validate_voltage_compatibility",
    "validate_power_limit",
    "validate_bess_parameters",
    "validate_generator_nn_parameters",
    "all_generator_types_have_handlers",
    "get_sn_validators_for_type",
    "get_nn_validators_for_type",
]
