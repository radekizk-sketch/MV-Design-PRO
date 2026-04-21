"""
ResultJoinV1 — Bridge between Snapshot + ResultSet → SLD tokens + Inspector facts.

CANONICAL: Lacznik wynikow — jedna implementacja laczenia wynikow z modelem.
Wejscie: Snapshot (ElementRefV1 index) + ResultSet (element_ref).
Wyjscie: (a) SldOverlayTokenV1[] — tokeny warstwy wynikow na SLD,
         (b) InspectorFactV1[] — fakty do inspektora.

INVARIANTS:
- Laczenie WYLACZNIE po element_id (ElementRefV1.element_id == ResultSet.element_ref).
- Brak zgadywania: element bez laczenia → orphan token z kodem ORPHAN_RESULT.
- Deterministic: sorted by element_id.
- Immutable (frozen).
- Tokeny NIE wplywaja na geometrie SLD — sa wylacznie opisowe.

ALIGNMENT:
- OverlayPayloadV1 (result_contract_v1.py) — juz jest mostem do SLD overlay.
  ResultJoinV1 FORMALIZES the join logic and adds inspector facts.
- OverlayElementV1.ref_id === ElementRefV1.element_id
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from domain.element_ref import ElementRefV1, ElementTypeV1

# ---------------------------------------------------------------------------
# SLD Overlay Token (output for SLD renderer)
# ---------------------------------------------------------------------------


class OverlayTokenKindV1(str, Enum):
    """Typ tokenu warstwy wynikow na SLD."""

    VOLTAGE = "VOLTAGE"
    CURRENT = "CURRENT"
    LOADING = "LOADING"
    SHORT_CIRCUIT = "SHORT_CIRCUIT"
    PROTECTION = "PROTECTION"
    READINESS_BADGE = "READINESS_BADGE"
    ORPHAN_RESULT = "ORPHAN_RESULT"


@dataclass(frozen=True)
class SldOverlayTokenV1:
    """Token warstwy wynikow na SLD.

    ZAKAZ: token NIE moze wplywac na geometrie SLD (pozycja, rozmiar, routing).
    Token jest WYLACZNIE opisowy (badge, kolor, metryka).
    """

    element_id: str
    element_type: ElementTypeV1
    token_kind: OverlayTokenKindV1
    label_pl: str
    value: float | str | None = None
    unit: str | None = None
    severity: str = "INFO"

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_id": self.element_id,
            "element_type": self.element_type.value,
            "token_kind": self.token_kind.value,
            "label_pl": self.label_pl,
            "value": self.value,
            "unit": self.unit,
            "severity": self.severity,
        }


# ---------------------------------------------------------------------------
# Inspector Fact (output for inspector panel)
# ---------------------------------------------------------------------------


class InspectorFactSourceV1(str, Enum):
    """Zrodlo faktu inspektora."""

    DOMAIN = "DOMAIN"
    SOLVER = "SOLVER"
    READINESS = "READINESS"


@dataclass(frozen=True)
class InspectorFactV1:
    """Fakt inspektora — wiersz w panelu inspektora elementu.

    Laczy dane z domeny (Snapshot) i wynikow (ResultSet).
    """

    element_id: str
    element_type: ElementTypeV1
    key: str
    label_pl: str
    value: float | str | int | bool | None
    unit: str | None = None
    source: InspectorFactSourceV1 = InspectorFactSourceV1.DOMAIN
    highlight: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_id": self.element_id,
            "element_type": self.element_type.value,
            "key": self.key,
            "label_pl": self.label_pl,
            "value": self.value,
            "unit": self.unit,
            "source": self.source.value,
            "highlight": self.highlight,
        }


# ---------------------------------------------------------------------------
# ResultJoinV1 — the actual join result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ResultJoinV1:
    """Wynik laczenia Snapshot + ResultSet.

    sld_tokens: tokeny do wyswietlenia na SLD (bez wplywu na geometrie).
    inspector_facts: fakty do panelu inspektora.
    orphan_element_ids: elementy z ResultSet, ktore nie maja odpowiednika w Snapshot.
    unmatched_snapshot_ids: elementy ze Snapshot, ktore nie maja wynikow w ResultSet.
    """

    sld_tokens: tuple[SldOverlayTokenV1, ...] = field(default_factory=tuple)
    inspector_facts: tuple[InspectorFactV1, ...] = field(default_factory=tuple)
    orphan_element_ids: tuple[str, ...] = field(default_factory=tuple)
    unmatched_snapshot_ids: tuple[str, ...] = field(default_factory=tuple)
    content_hash: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "sld_tokens": [t.to_dict() for t in self.sld_tokens],
            "inspector_facts": [f.to_dict() for f in self.inspector_facts],
            "orphan_element_ids": list(self.orphan_element_ids),
            "unmatched_snapshot_ids": list(self.unmatched_snapshot_ids),
            "content_hash": self.content_hash,
        }


# ---------------------------------------------------------------------------
# Join function
# ---------------------------------------------------------------------------


def join_results(
    *,
    snapshot_element_ids: dict[str, ElementRefV1],
    element_results: list[dict[str, Any]],
    analysis_type: str,
) -> ResultJoinV1:
    """Join Snapshot elements with ResultSet elements.

    Args:
        snapshot_element_ids: element_id → ElementRefV1 from Snapshot
        element_results: list of dicts with 'element_ref', 'element_type', 'values'
        analysis_type: SC_3F, LOAD_FLOW, etc.

    Returns:
        ResultJoinV1 with tokens, facts, orphans, unmatched.
    """
    sld_tokens: list[SldOverlayTokenV1] = []
    inspector_facts: list[InspectorFactV1] = []
    matched_snapshot_ids: set[str] = set()
    orphan_ids: list[str] = []

    for er in sorted(element_results, key=lambda x: x.get("element_ref", "")):
        element_ref = er.get("element_ref", "")
        values = er.get("values", {})

        ref = snapshot_element_ids.get(element_ref)
        if ref is None:
            orphan_ids.append(element_ref)
            sld_tokens.append(
                SldOverlayTokenV1(
                    element_id=element_ref,
                    element_type=ElementTypeV1.NODE,
                    token_kind=OverlayTokenKindV1.ORPHAN_RESULT,
                    label_pl=f"Wynik bez elementu w modelu: {element_ref}",
                    severity="WARNING",
                )
            )
            continue

        matched_snapshot_ids.add(element_ref)

        # Build tokens and facts based on analysis type and values
        for key, val in sorted(values.items()):
            token_kind = _classify_token_kind(key, analysis_type)
            unit = _infer_unit(key)

            sld_tokens.append(
                SldOverlayTokenV1(
                    element_id=element_ref,
                    element_type=ref.element_type,
                    token_kind=token_kind,
                    label_pl=_label_pl(key),
                    value=val,
                    unit=unit,
                )
            )

            inspector_facts.append(
                InspectorFactV1(
                    element_id=element_ref,
                    element_type=ref.element_type,
                    key=key,
                    label_pl=_label_pl(key),
                    value=val,
                    unit=unit,
                    source=InspectorFactSourceV1.SOLVER,
                )
            )

    unmatched = sorted(eid for eid in snapshot_element_ids if eid not in matched_snapshot_ids)

    sorted_tokens = tuple(sorted(sld_tokens, key=lambda t: (t.element_id, t.token_kind.value)))
    sorted_facts = tuple(sorted(inspector_facts, key=lambda f: (f.element_id, f.key)))
    sorted_orphans = tuple(sorted(orphan_ids))
    sorted_unmatched = tuple(unmatched)

    sig_data = {
        "sld_tokens": [t.to_dict() for t in sorted_tokens],
        "inspector_facts": [f.to_dict() for f in sorted_facts],
        "orphan_element_ids": list(sorted_orphans),
        "unmatched_snapshot_ids": list(sorted_unmatched),
    }
    payload = json.dumps(sig_data, sort_keys=True, separators=(",", ":"), default=str)
    content_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    return ResultJoinV1(
        sld_tokens=sorted_tokens,
        inspector_facts=sorted_facts,
        orphan_element_ids=sorted_orphans,
        unmatched_snapshot_ids=sorted_unmatched,
        content_hash=content_hash,
    )


# ---------------------------------------------------------------------------
# Helpers (internal)
# ---------------------------------------------------------------------------


def _classify_token_kind(key: str, analysis_type: str) -> OverlayTokenKindV1:
    """Classify a result key into an overlay token kind."""
    if "ikss" in key or "ik_" in key or "sk_mva" in key:
        return OverlayTokenKindV1.SHORT_CIRCUIT
    if "v_pu" in key or "u_kv" in key or "angle" in key:
        return OverlayTokenKindV1.VOLTAGE
    if "i_a" in key or "current" in key:
        return OverlayTokenKindV1.CURRENT
    if "loading" in key:
        return OverlayTokenKindV1.LOADING
    if "protection" in key or "relay" in key:
        return OverlayTokenKindV1.PROTECTION
    if analysis_type in ("SC_3F", "SC_1F", "SC_2F"):
        return OverlayTokenKindV1.SHORT_CIRCUIT
    if analysis_type == "LOAD_FLOW":
        return OverlayTokenKindV1.VOLTAGE
    return OverlayTokenKindV1.VOLTAGE


_UNIT_MAP = {
    "v_pu": "p.u.",
    "u_kv": "kV",
    "angle_deg": "°",
    "p_mw": "MW",
    "q_mvar": "Mvar",
    "s_mva": "MVA",
    "i_a": "A",
    "ikss_ka": "kA",
    "ip_ka": "kA",
    "ith_ka": "kA",
    "sk_mva": "MVA",
    "loading_pct": "%",
    "losses_p_mw": "MW",
    "losses_q_mvar": "Mvar",
}


def _infer_unit(key: str) -> str | None:
    """Infer unit from result key name."""
    for pattern, unit in _UNIT_MAP.items():
        if pattern in key:
            return unit
    return None


_LABEL_PL_MAP = {
    "v_pu": "Napiecie [p.u.]",
    "u_kv": "Napiecie [kV]",
    "angle_deg": "Kat fazowy [°]",
    "p_mw": "Moc czynna [MW]",
    "q_mvar": "Moc bierna [Mvar]",
    "s_mva": "Moc pozorna [MVA]",
    "i_a": "Prad [A]",
    "ikss_ka": "Prad zwarciowy Ik'' [kA]",
    "ip_ka": "Prad udarowy ip [kA]",
    "ith_ka": "Prad cieplny Ith [kA]",
    "sk_mva": "Moc zwarciowa Sk'' [MVA]",
    "loading_pct": "Obciazenie [%]",
    "losses_p_mw": "Straty czynne [MW]",
    "losses_q_mvar": "Straty bierne [Mvar]",
    "p_injected_mw": "Moc czynna wstrzyknieta [MW]",
    "q_injected_mvar": "Moc bierna wstrzyknieta [Mvar]",
}


def _label_pl(key: str) -> str:
    """Get Polish label for a result key."""
    for pattern, label in _LABEL_PL_MAP.items():
        if pattern in key:
            return label
    return key
