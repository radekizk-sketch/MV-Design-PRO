from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from application.stability.dynamic_stability import DynamicStabilityResult


def _canonical_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PostFaultTopologyEffect:
    source_id: str
    faulted_element_id: str
    opened_element_ids: tuple[str, ...]
    isolated_element_ids: tuple[str, ...]
    disconnected_source_ids: tuple[str, ...]
    network_state: str
    outage_scope: str
    effect_signature: str

    def to_dict(self) -> dict[str, object]:
        return {
            "source_id": self.source_id,
            "faulted_element_id": self.faulted_element_id,
            "opened_element_ids": list(self.opened_element_ids),
            "isolated_element_ids": list(self.isolated_element_ids),
            "disconnected_source_ids": list(self.disconnected_source_ids),
            "network_state": self.network_state,
            "outage_scope": self.outage_scope,
            "effect_signature": self.effect_signature,
        }


@dataclass(frozen=True)
class AutomationTraceEvent:
    event_seq: int
    event_type: str
    element_id: str | None = None
    detail: str = ""
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_seq": self.event_seq,
            "event_type": self.event_type,
            "element_id": self.element_id,
            "detail": self.detail,
            "payload": self.payload,
        }


@dataclass(frozen=True)
class AutomationTrace:
    topology_effect: PostFaultTopologyEffect
    events: tuple[AutomationTraceEvent, ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "topology_effect": self.topology_effect.to_dict(),
            "events": [event.to_dict() for event in self.events],
        }


def build_post_fault_topology_effect(
    *,
    source_id: str,
    faulted_element_id: str,
    cleared_by_element_ids: tuple[str, ...] | list[str],
    isolated_element_ids: tuple[str, ...] | list[str] = (),
    additionally_opened_element_ids: tuple[str, ...] | list[str] = (),
    disconnected_source_ids: tuple[str, ...] | list[str] = (),
) -> PostFaultTopologyEffect:
    opened_element_ids = tuple(
        sorted(set(cleared_by_element_ids) | set(additionally_opened_element_ids))
    )
    isolated_ids = tuple(sorted(set(isolated_element_ids)))
    disconnected_ids = tuple(sorted(set(disconnected_source_ids)))

    if disconnected_ids:
        network_state = "ISLANDED"
    elif opened_element_ids or isolated_ids:
        network_state = "RECONFIGURED"
    else:
        network_state = "UNCHANGED"

    affected_count = len(isolated_ids) + len(disconnected_ids)
    if affected_count == 0:
        outage_scope = "NONE"
    elif affected_count <= 2:
        outage_scope = "LOCAL"
    else:
        outage_scope = "WIDE"

    payload = {
        "source_id": source_id,
        "faulted_element_id": faulted_element_id,
        "opened_element_ids": list(opened_element_ids),
        "isolated_element_ids": list(isolated_ids),
        "disconnected_source_ids": list(disconnected_ids),
        "network_state": network_state,
        "outage_scope": outage_scope,
    }

    return PostFaultTopologyEffect(
        source_id=source_id,
        faulted_element_id=faulted_element_id,
        opened_element_ids=opened_element_ids,
        isolated_element_ids=isolated_ids,
        disconnected_source_ids=disconnected_ids,
        network_state=network_state,
        outage_scope=outage_scope,
        effect_signature=_canonical_hash(payload),
    )


def build_automation_trace(
    evaluation: DynamicStabilityResult,
    topology_effect: PostFaultTopologyEffect,
) -> AutomationTrace:
    events = (
        AutomationTraceEvent(
            event_seq=1,
            event_type="AUTOMATION_STARTED",
            element_id=evaluation.scenario_id,
            detail="Start fault-clear automation trace",
            payload={
                "scenario_id": evaluation.scenario_id,
                "scenario_type": evaluation.scenario_type,
                "source_id": evaluation.source_id,
            },
        ),
        AutomationTraceEvent(
            event_seq=2,
            event_type="FAULT_APPLIED",
            element_id=evaluation.faulted_element_id,
            detail="Fault applied on monitored element",
            payload={
                "faulted_element_id": evaluation.faulted_element_id,
                "source_id": evaluation.source_id,
            },
        ),
        AutomationTraceEvent(
            event_seq=3,
            event_type="FAULT_CLEARED",
            element_id=evaluation.faulted_element_id,
            detail="Fault cleared by protection path",
            payload={
                "clearing_time_ms": evaluation.clearing_time_ms,
                "cleared_by_element_ids": list(evaluation.cleared_by_element_ids),
            },
        ),
        AutomationTraceEvent(
            event_seq=4,
            event_type="POST_FAULT_TOPOLOGY_EFFECT",
            element_id=evaluation.faulted_element_id,
            detail="Post-fault topology effect recorded",
            payload=topology_effect.to_dict(),
        ),
        AutomationTraceEvent(
            event_seq=5,
            event_type="DYNAMIC_STABILITY_EVALUATED",
            element_id=evaluation.source_id,
            detail="Dynamic stability decision recorded",
            payload=evaluation.to_dict(),
        ),
    )

    return AutomationTrace(topology_effect=topology_effect, events=events)
