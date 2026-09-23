"""Tests for inverter datasheet-card field provenance + reference cards (§3).

Covers:
- the analysis path is NOT blocked by estimated values (the physical model runs on
  the typical value);
- per-field provenance resolution (card-field status override vs seed);
- each reference card (string PV, central PV, PCS BESS) builds, validates its power
  hierarchy, and carries the expected per-field provenance (ratings = DATASHEET,
  controller bandwidths = ESTIMATED with a literature source_ref).

Paramount rule under test: a controller bandwidth absent from the datasheet is
ESTIMATED (typical class value), explicitly tagged, never fabricated as DATASHEET.

Karta AB-1a Pakiet L (2026-09-23): testy bramki OSD `osd_card_gate` (gotowe/nie
gotowe + blokery) zeszly RAZEM z bramka — LEGACY_USUNAC B24 inwentarza werdyktow:
0 wolajacych w `backend/src` (tylko testy).
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
    CardFieldStatus,
    FieldQuality,
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
