"""Voltage profile (BUS-centric) view builder (P21) + dekompozycja ΔU per
odcinek wzdłuż ścieżki źródło→węzeł (P0.4, nN)."""

from __future__ import annotations

from typing import Any

from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileSegment,
    VoltageProfileSegmentPath,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)

__all__ = [
    "VoltageProfileBuilder",
    "VoltageProfileContext",
    "VoltageProfileRow",
    "VoltageProfileSegment",
    "VoltageProfileSegmentBuilder",
    "VoltageProfileSegmentPath",
    "VoltageProfileSegmentPathError",
    "VoltageProfileStatus",
    "VoltageProfileSummary",
    "VoltageProfileView",
    "find_worst_nn_bus",
    "find_worst_nn_path",
]


def __getattr__(name: str) -> Any:
    if name == "VoltageProfileBuilder":
        from analysis.voltage_profile.builder import VoltageProfileBuilder

        return VoltageProfileBuilder
    if name in (
        "VoltageProfileSegmentBuilder",
        "VoltageProfileSegmentPathError",
        "find_worst_nn_bus",
        "find_worst_nn_path",
    ):
        from analysis.voltage_profile import segment_decomposition

        return getattr(segment_decomposition, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
