from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class ScenarioComparisonEntry:
    scenario_id: str
    scenario_name: str | None
    risk_score: float
    delta_margin: float | None
    delta_risk_rank: int
    not_computed_count: int
    key_drivers: tuple[str, ...]
    winner_flag: bool
    why_pl: str


@dataclass(frozen=True)
class ScenarioComparisonView:
    comparison_id: str
    study_id: str | None
    generated_at: datetime
    scenarios: tuple[ScenarioComparisonEntry, ...]
    winner_scenario_id: str | None

    def to_dict(self) -> dict[str, Any]:
        from analysis.scenario_comparison.serializer import view_to_dict

        return view_to_dict(self)


def compute_comparison_id(
    study_id: str | None,
    scenarios: Iterable[ScenarioComparisonEntry],
) -> str:
    payload = {
        "study_id": study_id,
        "scenarios": [
            {
                "scenario_id": entry.scenario_id,
                "risk_score": entry.risk_score,
                "delta_margin": entry.delta_margin,
                "delta_risk_rank": entry.delta_risk_rank,
                "not_computed_count": entry.not_computed_count,
                "key_drivers": list(entry.key_drivers),
                "winner_flag": entry.winner_flag,
                "why_pl": entry.why_pl,
            }
            for entry in scenarios
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
