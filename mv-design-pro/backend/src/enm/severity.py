"""Shared ENM validation severity contract.

The string values are part of the public API contract. Keep them stable.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType
from typing import Final, Literal, TypeAlias

ValidationSeverity: TypeAlias = Literal["BLOCKER", "IMPORTANT", "INFO"]
ValidationStatus: TypeAlias = Literal["OK", "WARN", "FAIL"]

SEVERITY_BLOCKER: Final[ValidationSeverity] = "BLOCKER"
SEVERITY_IMPORTANT: Final[ValidationSeverity] = "IMPORTANT"
SEVERITY_INFO: Final[ValidationSeverity] = "INFO"

STATUS_OK: Final[ValidationStatus] = "OK"
STATUS_WARN: Final[ValidationStatus] = "WARN"
STATUS_FAIL: Final[ValidationStatus] = "FAIL"

SEVERITY_RANK: Final[Mapping[str, int]] = MappingProxyType(
    {
        SEVERITY_BLOCKER: 0,
        SEVERITY_IMPORTANT: 1,
        SEVERITY_INFO: 2,
    }
)
UNKNOWN_SEVERITY_RANK: Final[int] = 9

BLOCKING_SEVERITIES: Final[frozenset[str]] = frozenset({SEVERITY_BLOCKER})
WARNING_SEVERITIES: Final[frozenset[str]] = frozenset({SEVERITY_IMPORTANT})
CANONICAL_SEVERITIES: Final[tuple[ValidationSeverity, ...]] = (
    SEVERITY_BLOCKER,
    SEVERITY_IMPORTANT,
    SEVERITY_INFO,
)
CANONICAL_STATUSES: Final[tuple[ValidationStatus, ...]] = (
    STATUS_OK,
    STATUS_WARN,
    STATUS_FAIL,
)


def severity_rank(severity: str) -> int:
    return SEVERITY_RANK.get(severity, UNKNOWN_SEVERITY_RANK)


def is_blocking_severity(severity: str) -> bool:
    return severity in BLOCKING_SEVERITIES


def is_warning_severity(severity: str) -> bool:
    return severity in WARNING_SEVERITIES


def empty_severity_counts() -> dict[ValidationSeverity, int]:
    return {severity: 0 for severity in CANONICAL_SEVERITIES}


def is_failed_status(status: str) -> bool:
    return status == STATUS_FAIL
