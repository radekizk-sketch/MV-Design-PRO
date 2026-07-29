"""Designer action definitions."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ActionType(StrEnum):
    SHORT_CIRCUIT = "run_short_circuit"
    POWER_FLOW = "run_power_flow"
    ANALYSIS = "run_analysis"


@dataclass(frozen=True)
class Action:
    action_type: ActionType
    label: str


def default_actions() -> list[Action]:
    return [
        Action(action_type=ActionType.SHORT_CIRCUIT, label="Run Short-Circuit"),
        Action(action_type=ActionType.POWER_FLOW, label="Run Power Flow"),
        Action(action_type=ActionType.ANALYSIS, label="Run Analysis"),
    ]
