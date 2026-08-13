"""Voltage profile (BUS-centric) view builder (P21)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)

if TYPE_CHECKING:
    from analysis.voltage_profile.builder import VoltageProfileBuilder

__all__ = [
    "VoltageProfileBuilder",
    "VoltageProfileContext",
    "VoltageProfileRow",
    "VoltageProfileStatus",
    "VoltageProfileSummary",
    "VoltageProfileView",
]


def __getattr__(name: str) -> type[VoltageProfileBuilder]:
    if name == "VoltageProfileBuilder":
        from analysis.voltage_profile.builder import VoltageProfileBuilder

        return VoltageProfileBuilder
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
