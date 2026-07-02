"""Tests for the inverter datasheet-card OSD acceptance gate + reference cards (§3).

Covers:
- OSD gate blocks ESTIMATED / SYSTEM_DEFAULT card fields without acceptance,
  passes once accepted, and NEVER blocks DATASHEET fields;
- the analysis path is NOT blocked by estimated values (the gate is OSD-only —
  the physical model still runs on the typical value);
- the gate reuses the existing readiness model (ReadinessBlocker) — no second truth;
- each reference card (string PV, central PV, PCS BESS) builds, validates its power
  hierarchy, and carries the expected per-field provenance (ratings = DATASHEET,
  controller bandwidths = ESTIMATED with a literature source_ref).

Paramount rule under test: a controller bandwidth absent from the datasheet is
ESTIMATED (typical class value), explicitly tagged, and BLOCKED from the OSD package
without conscious engineer acceptance — but the analysis still runs (no internal
block). This is not heuristic, not fabrication, not deferral.
"""

from __future__ import annotations

import pytest
from network_model.catalog.mv_converter_catalog import (
    _REFERENCE_BANDWIDTH_FIELDS,
    _REFERENCE_POWER_HIERARCHY_FIELDS,
    _REFERENCE_RATING_FIELDS,
    CONVERTER_REFERENCE_CARDS,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import ConverterKind, ConverterType
from solver_input.provenance import (
    OSD_CARD_FIELD_BLOCKER_CODE,
    CardFieldAcceptance,
    CardFieldStatus,
    FieldQuality,
    osd_card_gate,
    resolve_card_field_quality_map,
)

_REFERENCE_CARD_IDS = (
    "conv-pv-card-huawei-sun2000-215ktl",
    "conv-pv-card-sungrow-sg3150u-mv",
    "conv-bess-card-sungrow-sc2000ud-mv",
)


def _make_converter(**overrides: object) -> ConverterType:
    base: dict[str, object] = {
        "id": "conv-card-osd-1",
        "name": "Falownik testowy OSD",
        "kind": ConverterKind.PV,
        "un_kv": 0.4,
        "sn_mva": 1.0,
        "pmax_mw": 1.0,
    }
    base.update(overrides)
    return ConverterType(**base)  # type: ignore[arg-type]


def _reference_cards_from_catalog() -> dict[str, ConverterType]:
    repo = get_default_mv_catalog()
    by_id = {c.id: c for c in repo.list_converter_types()}
    return {cid: by_id[cid] for cid in _REFERENCE_CARD_IDS}


# ---------------------------------------------------------------------------
# OSD gate — blocking behaviour
# ---------------------------------------------------------------------------


def test_osd_gate_blocks_estimated_bandwidth_without_acceptance() -> None:
    c = _make_converter(pll_bandwidth_hz=30.0)  # present => ESTIMATED
    ready, blockers = osd_card_gate(c, None)
    assert ready is False
    blocked_fields = [b.message_pl for b in blockers]
    assert any("pll_bandwidth_hz" in msg and "ESTIMATED" in msg for msg in blocked_fields)
    # Every blocker carries the canonical readiness code + element ref.
    for b in blockers:
        assert b.code == OSD_CARD_FIELD_BLOCKER_CODE
        assert b.severity == "BLOKUJACE"
        assert "pakietem OSD" in b.message_pl
        assert b.element_ref == c.id


def test_osd_gate_blocks_system_default_fields_without_acceptance() -> None:
    # A bare converter: every card field is SYSTEM_DEFAULT (present in schema,
    # no real value) -> each must be consciously accepted before the OSD package.
    c = _make_converter()
    ready, blockers = osd_card_gate(c, None)
    assert ready is False
    assert blockers
    assert all("SYSTEM_DEFAULT" in b.message_pl for b in blockers)


def test_osd_gate_passes_once_all_estimated_and_default_accepted() -> None:
    c = _make_converter(pll_bandwidth_hz=30.0, current_loop_bandwidth_hz=900.0)
    quality_map = resolve_card_field_quality_map(c)
    to_accept = {
        name for name, status in quality_map.items() if status.quality is not FieldQuality.DATASHEET
    }
    ready, blockers = osd_card_gate(c, to_accept)
    assert ready is True
    assert blockers == []


def test_osd_gate_partial_acceptance_leaves_only_unaccepted_blockers() -> None:
    c = _make_converter(pll_bandwidth_hz=30.0)
    ready, blockers = osd_card_gate(c, {"pll_bandwidth_hz"})
    # pll accepted, but other SYSTEM_DEFAULT fields still block.
    assert ready is False
    assert all("pll_bandwidth_hz" not in b.message_pl for b in blockers)


def test_osd_gate_never_blocks_datasheet_fields() -> None:
    # Fully datasheet-tagged card (ratings + power hierarchy + bandwidths all
    # DATASHEET via an explicit override) -> the gate passes with no acceptance.
    fields = (
        "un_kv",
        "sn_mva",
        "pmax_mw",
        "qmin_mvar",
        "qmax_mvar",
        "cosphi_min",
        "cosphi_max",
        "manufacturer",
        "model",
        "sc_model",
        "sc_pq_split",
        "sc_transient_k",
        "sc_sustained_k",
        "current_loop_bandwidth_hz",
        "voltage_loop_bandwidth_hz",
        "pll_bandwidth_hz",
        "control_delay_ms",
        "filter_l_pu",
        "filter_r_pu",
        "p_installed_mw",
        "pn_ac_mw",
        "p_connection_mw",
        "p_achievable_mw",
    )
    override = {
        name: {"field_name": name, "quality": "DATASHEET", "source_ref": "Karta X"}
        for name in fields
    }
    c = _make_converter(card_field_status=override)
    ready, blockers = osd_card_gate(c, None)
    assert ready is True
    assert blockers == []


def test_osd_gate_accepts_carrier_object() -> None:
    c = _make_converter(pll_bandwidth_hz=30.0)
    quality_map = resolve_card_field_quality_map(c)
    to_accept = {
        name for name, status in quality_map.items() if status.quality is not FieldQuality.DATASHEET
    }
    acceptance = CardFieldAcceptance.of(to_accept, accepted_by="inz. Kowalski")
    ready, blockers = osd_card_gate(c, acceptance)
    assert ready is True
    assert blockers == []
    # Acceptance carrier is serializable for the audit trail.
    assert acceptance.to_dict()["accepted_by"] == "inz. Kowalski"
    assert "pll_bandwidth_hz" in acceptance.to_dict()["accepted_fields"]


def test_osd_gate_blockers_are_deterministically_ordered() -> None:
    c = _make_converter()
    _, blockers1 = osd_card_gate(c, None)
    _, blockers2 = osd_card_gate(c, None)
    msgs1 = [b.message_pl for b in blockers1]
    msgs2 = [b.message_pl for b in blockers2]
    assert msgs1 == msgs2
    assert msgs1 == sorted(msgs1)


# ---------------------------------------------------------------------------
# Analysis path is NOT blocked by estimated values
# ---------------------------------------------------------------------------


def test_estimated_bandwidth_does_not_block_analysis() -> None:
    """The full physical model runs on the typical (estimated) bandwidth value.

    The OSD gate is a separate check; nothing in the card itself prevents the
    value from being read for analysis. We assert the estimated value is present
    and usable, and that building/validating the card never raises.
    """
    c = _make_converter(pll_bandwidth_hz=30.0, current_loop_bandwidth_hz=900.0)
    # Value is present and usable by an analysis (no internal block).
    assert c.pll_bandwidth_hz == 30.0
    assert c.current_loop_bandwidth_hz == 900.0
    # The card validates and round-trips regardless of OSD acceptance.
    c.validate_power_hierarchy()
    assert ConverterType.from_dict(c.to_dict()) == c
    # And the quality is explicitly ESTIMATED (not fabricated as DATASHEET).
    quality_map = resolve_card_field_quality_map(c)
    assert quality_map["pll_bandwidth_hz"].quality is FieldQuality.ESTIMATED


# ---------------------------------------------------------------------------
# resolve_card_field_quality_map — override application
# ---------------------------------------------------------------------------


def test_resolve_applies_card_field_status_override_promoting_to_datasheet() -> None:
    # A bandwidth seeds ESTIMATED, but an explicit override with a real source
    # may declare it DATASHEET (the carrier records the source_ref).
    override = {
        "pll_bandwidth_hz": {
            "field_name": "pll_bandwidth_hz",
            "quality": "DATASHEET",
            "source_ref": "Karta techniczna z pasmem PLL",
        }
    }
    c = _make_converter(pll_bandwidth_hz=30.0, card_field_status=override)
    resolved = resolve_card_field_quality_map(c)
    assert resolved["pll_bandwidth_hz"].quality is FieldQuality.DATASHEET
    assert resolved["pll_bandwidth_hz"].source_ref == "Karta techniczna z pasmem PLL"


def test_resolve_without_override_uses_seed() -> None:
    c = _make_converter(pll_bandwidth_hz=30.0)
    resolved = resolve_card_field_quality_map(c)
    # Seed rule: present bandwidth => ESTIMATED (never DATASHEET without a source).
    assert resolved["pll_bandwidth_hz"].quality is FieldQuality.ESTIMATED
    assert isinstance(resolved["pll_bandwidth_hz"], CardFieldStatus)


# ---------------------------------------------------------------------------
# Reference cards — per class, real values + provenance
# ---------------------------------------------------------------------------


def test_reference_cards_present_one_per_class() -> None:
    kinds = {rec["params"]["kind"] for rec in CONVERTER_REFERENCE_CARDS}
    assert kinds == {"PV", "BESS"}
    # Two PV (string + central) and one BESS PCS.
    assert len(CONVERTER_REFERENCE_CARDS) == 3
    ids = {rec["id"] for rec in CONVERTER_REFERENCE_CARDS}
    assert ids == set(_REFERENCE_CARD_IDS)


def test_reference_cards_appear_in_catalog() -> None:
    cards = _reference_cards_from_catalog()
    assert set(cards.keys()) == set(_REFERENCE_CARD_IDS)


@pytest.mark.parametrize("card_id", _REFERENCE_CARD_IDS)
def test_reference_card_builds_and_validates_power_hierarchy(card_id: str) -> None:
    card = _reference_cards_from_catalog()[card_id]
    # Builds as a ConverterType, round-trips, and the power hierarchy holds.
    assert ConverterType.from_dict(card.to_dict()) == card
    card.validate_power_hierarchy()
    # Power hierarchy fields are populated (Pzainst >= Pn,AC).
    assert card.p_installed_mw is not None
    assert card.pn_ac_mw is not None
    assert card.p_installed_mw >= card.pn_ac_mw


@pytest.mark.parametrize("card_id", _REFERENCE_CARD_IDS)
def test_reference_card_ratings_are_datasheet(card_id: str) -> None:
    card = _reference_cards_from_catalog()[card_id]
    quality_map = resolve_card_field_quality_map(card)
    for name in _REFERENCE_RATING_FIELDS + _REFERENCE_POWER_HIERARCHY_FIELDS:
        assert quality_map[name].quality is FieldQuality.DATASHEET, name
        # DATASHEET fields cite the manufacturer datasheet.
        assert quality_map[name].source_ref
        assert "karta techniczna" in quality_map[name].source_ref.lower()


@pytest.mark.parametrize("card_id", _REFERENCE_CARD_IDS)
def test_reference_card_bandwidths_are_estimated_never_datasheet(card_id: str) -> None:
    card = _reference_cards_from_catalog()[card_id]
    quality_map = resolve_card_field_quality_map(card)
    for name in _REFERENCE_BANDWIDTH_FIELDS:
        status = quality_map[name]
        assert status.quality is FieldQuality.ESTIMATED, name
        # Anti-fabrication: a bandwidth is NEVER tagged DATASHEET.
        assert status.quality is not FieldQuality.DATASHEET
        # Cites real literature, not a manufacturer datasheet.
        assert status.source_ref
        assert "Yazdani" in status.source_ref or "IEEE" in status.source_ref


def _blocked_field_names(blockers: list) -> set[str]:
    """Extract the exact blocked field name from each blocker message ('...')."""
    names: set[str] = set()
    for b in blockers:
        start = b.message_pl.index("'") + 1
        end = b.message_pl.index("'", start)
        names.add(b.message_pl[start:end])
    return names


@pytest.mark.parametrize("card_id", _REFERENCE_CARD_IDS)
def test_reference_card_osd_gate_blocks_then_passes(card_id: str) -> None:
    card = _reference_cards_from_catalog()[card_id]
    # Without acceptance: estimated bandwidths + system-default slots block OSD.
    ready, blockers = osd_card_gate(card, None)
    assert ready is False
    assert blockers
    # Datasheet ratings never appear among the blocked fields (exact-name match).
    blocked = _blocked_field_names(blockers)
    for name in _REFERENCE_RATING_FIELDS + _REFERENCE_POWER_HIERARCHY_FIELDS:
        assert name not in blocked, name
    # The estimated bandwidths ARE blocked until accepted.
    for name in _REFERENCE_BANDWIDTH_FIELDS:
        assert name in blocked, name
    # Once the engineer accepts the estimated/default fields, OSD passes.
    quality_map = resolve_card_field_quality_map(card)
    to_accept = {
        name for name, status in quality_map.items() if status.quality is not FieldQuality.DATASHEET
    }
    ready2, blockers2 = osd_card_gate(card, to_accept)
    assert ready2 is True
    assert blockers2 == []


def test_reference_card_osd_code_matches_readiness_registry() -> None:
    # The gate's blocker code must exist in the canonical readiness registry —
    # the gate reuses the existing readiness model, no parallel truth.
    from domain.canonical_operations import READINESS_CODES

    assert OSD_CARD_FIELD_BLOCKER_CODE in READINESS_CODES
    spec = READINESS_CODES[OSD_CARD_FIELD_BLOCKER_CODE]
    assert spec.level.value == "BLOCKER"


# ---------------------------------------------------------------------------
# No regression: published (non-reference) converters keep card_field_status unset
# ---------------------------------------------------------------------------


def test_published_non_reference_converters_have_no_card_field_status() -> None:
    repo = get_default_mv_catalog()
    reference_ids = set(_REFERENCE_CARD_IDS)
    for c in repo.list_converter_types():
        if c.id in reference_ids:
            continue
        assert c.card_field_status is None, c.id
        assert "card_field_status" not in c.to_dict(), c.id
