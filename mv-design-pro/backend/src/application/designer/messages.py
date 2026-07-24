"""Message catalog for Designer decisions."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class BlockedCode(StrEnum):
    NETWORK_INCOMPLETE = "network_incomplete"
    NO_SOLVER_RESULTS = "no_solver_results"
    UNSUPPORTED_ACTION = "unsupported_action"


@dataclass(frozen=True)
class BlockedReason:
    code: BlockedCode
    description: str


BLOCKED_DESCRIPTIONS: dict[BlockedCode, str] = {
    BlockedCode.NETWORK_INCOMPLETE: "Network completeness flag is false.",
    BlockedCode.NO_SOLVER_RESULTS: "Required solver results are not available.",
    BlockedCode.UNSUPPORTED_ACTION: "Action type is not supported by Designer.",
}


def blocked_reason(code: BlockedCode) -> BlockedReason:
    return BlockedReason(code=code, description=BLOCKED_DESCRIPTIONS[code])
