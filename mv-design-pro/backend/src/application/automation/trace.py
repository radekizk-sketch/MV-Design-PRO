"""Efekt topologiczny scenariusza wyłączenia zwarcia (echo stanu ZADEKLAROWANEGO).

Elementy otwarte, izolowane i źródła odłączone pochodzą z opcji biegu wpisanych przez
użytkownika — klasyfikacja stanu sieci i zakresu wyłączeń jest deterministycznym
opisem TEJ deklaracji, nie symulacją. Dawna „narracja automatyki" (zdarzenia
„zwarcie zastosowane → wyłączone przez zabezpieczenia → werdykt stabilności") opowiadała
zadziałanie zabezpieczeń w czasie wpisanym przez użytkownika, bez symulacji zabezpieczeń,
i została skasowana (uczciwość natychmiastowa, audyt dynamiki 2026-09-23).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any


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
