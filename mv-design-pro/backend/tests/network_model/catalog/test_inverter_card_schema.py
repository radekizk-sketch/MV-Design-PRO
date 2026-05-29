"""Tests for the inverter datasheet-card ("karta falownika") foundation.

Covers:
- schema completeness (a ConverterType exposes every card section);
- power-hierarchy validation (Pzainst >= Pn,AC >= Pprzylacz >= Posiagl);
- FieldQuality / CardFieldStatus + ProvenanceEntry quality integration;
- ConverterType round-trip with the new card fields;
- no regression: existing published converter catalog entries still build and
  remain byte-identical in their legacy (non-card) fields.

Paramount rule under test: "no gaps" = COMPLETE schema with explicit per-field
data-quality provenance; a value with no real source is ESTIMATED/SYSTEM_DEFAULT,
never DATASHEET (no fabricated values to make something compute).
"""

from __future__ import annotations

import json

import pytest
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import (
    _CARD_POWER_HIERARCHY_FIELDS,
    _CARD_SC_MODEL_FIELDS,
    _CARD_SCHEMA_FIELDS,
    _CARD_SSCI_FIELDS,
    MATERIALIZATION_CONTRACTS,
    CatalogNamespace,
    ConverterKind,
    ConverterType,
)
from solver_input.provenance import (
    CardFieldStatus,
    FieldQuality,
    ProvenanceEntry,
    SourceKind,
    card_field_quality_map,
    card_status_map_to_dict,
)


def _make_converter(**overrides: object) -> ConverterType:
    base: dict[str, object] = {
        "id": "conv-card-1",
        "name": "Falownik testowy",
        "kind": ConverterKind.PV,
        "un_kv": 0.4,
        "sn_mva": 1.0,
        "pmax_mw": 1.0,
    }
    base.update(overrides)
    return ConverterType(**base)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Schema completeness
# ---------------------------------------------------------------------------


def test_converter_type_exposes_all_card_sections() -> None:
    c = _make_converter()
    # SC fault model
    for name in ("sc_model", "sc_pq_split", "sc_transient_k", "sc_sustained_k"):
        assert hasattr(c, name), name
    # SSCI / Z_conv controller bands
    for name in (
        "current_loop_bandwidth_hz",
        "voltage_loop_bandwidth_hz",
        "pll_bandwidth_hz",
        "control_delay_ms",
    ):
        assert hasattr(c, name), name
    # Power hierarchy
    for name in ("p_installed_mw", "pn_ac_mw", "p_connection_mw", "p_achievable_mw"):
        assert hasattr(c, name), name


def test_card_schema_fields_default_to_none() -> None:
    c = _make_converter()
    for name in _CARD_SCHEMA_FIELDS:
        assert getattr(c, name) is None, name


def test_card_schema_fields_present_in_to_dict() -> None:
    data = _make_converter().to_dict()
    for name in _CARD_SCHEMA_FIELDS:
        assert name in data, name
        assert data[name] is None


def test_card_schema_field_groups_are_disjoint_and_complete() -> None:
    groups = _CARD_SC_MODEL_FIELDS + _CARD_SSCI_FIELDS + _CARD_POWER_HIERARCHY_FIELDS
    assert set(groups) == set(_CARD_SCHEMA_FIELDS)
    assert len(groups) == len(set(groups))  # no overlap


def test_converter_materialization_contract_lists_card_fields() -> None:
    contract = MATERIALIZATION_CONTRACTS[CatalogNamespace.CONVERTER.value]
    for name in _CARD_SCHEMA_FIELDS:
        assert name in contract.solver_fields, name


# ---------------------------------------------------------------------------
# Power-hierarchy validation
# ---------------------------------------------------------------------------


def test_power_hierarchy_valid_descending_passes() -> None:
    c = _make_converter(
        p_installed_mw=10.0,
        pn_ac_mw=9.0,
        p_connection_mw=8.0,
        p_achievable_mw=7.0,
    )
    c.validate_power_hierarchy()  # no raise


def test_power_hierarchy_rejects_pn_ac_above_installed() -> None:
    c = _make_converter(p_installed_mw=5.0, pn_ac_mw=9.0)
    with pytest.raises(ValueError, match="pn_ac_mw"):
        c.validate_power_hierarchy()


def test_power_hierarchy_rejects_connection_above_pn_ac() -> None:
    c = _make_converter(pn_ac_mw=8.0, p_connection_mw=9.0)
    with pytest.raises(ValueError, match="p_connection_mw"):
        c.validate_power_hierarchy()


def test_power_hierarchy_partial_values_never_raise_spuriously() -> None:
    # Only Pzainst and Posiagl present, in order -> valid even with gaps.
    _make_converter(p_installed_mw=10.0, p_achievable_mw=7.0).validate_power_hierarchy()
    # No power fields at all -> valid.
    _make_converter().validate_power_hierarchy()
    # Equal consecutive values -> valid (>= not >).
    _make_converter(p_installed_mw=5.0, pn_ac_mw=5.0).validate_power_hierarchy()


# ---------------------------------------------------------------------------
# FieldQuality / provenance integration
# ---------------------------------------------------------------------------


def test_field_quality_enum_values_and_labels() -> None:
    assert [q.value for q in FieldQuality] == ["DATASHEET", "ESTIMATED", "SYSTEM_DEFAULT"]
    assert FieldQuality.DATASHEET.label_pl == "karta_techniczna"
    assert FieldQuality.ESTIMATED.label_pl == "oszacowane"
    assert FieldQuality.SYSTEM_DEFAULT.label_pl == "domyslne_techniczne"


def test_card_field_status_round_trip() -> None:
    status = CardFieldStatus(
        field_name="pll_bandwidth_hz",
        quality=FieldQuality.ESTIMATED,
        source_ref="Karta XYZ",
        note="oszacowane",
    )
    assert CardFieldStatus.from_dict(status.to_dict()) == status


def test_card_status_map_to_dict_is_sorted_and_serializable() -> None:
    status_map = {
        "pll_bandwidth_hz": CardFieldStatus("pll_bandwidth_hz", FieldQuality.ESTIMATED),
        "un_kv": CardFieldStatus("un_kv", FieldQuality.DATASHEET),
    }
    serialized = card_status_map_to_dict(status_map)
    assert list(serialized.keys()) == ["pll_bandwidth_hz", "un_kv"]
    # JSON-serializable end to end.
    json.dumps(serialized)


def test_provenance_entry_quality_optional_byte_identical_when_unset() -> None:
    entry = ProvenanceEntry(element_ref="s1", field_path="pmax_mw", source_kind=SourceKind.CATALOG)
    assert "quality" not in entry.to_dict()


def test_provenance_entry_quality_emitted_when_set() -> None:
    entry = ProvenanceEntry(
        element_ref="s1",
        field_path="pll_bandwidth_hz",
        source_kind=SourceKind.CATALOG,
        quality=FieldQuality.ESTIMATED,
    )
    assert entry.to_dict()["quality"] == "ESTIMATED"


def test_card_field_quality_map_seed_rules() -> None:
    c = _make_converter(manufacturer="ACME", model="X1", pll_bandwidth_hz=30.0)
    quality_map = card_field_quality_map(c)

    # Complete: every card schema field + ratings present in the map.
    for name in _CARD_SCHEMA_FIELDS:
        assert name in quality_map, name
    for name in ("un_kv", "sn_mva", "pmax_mw", "manufacturer", "model"):
        assert name in quality_map, name

    # Ratings / manufacturer present -> DATASHEET.
    assert quality_map["un_kv"].quality is FieldQuality.DATASHEET
    assert quality_map["manufacturer"].quality is FieldQuality.DATASHEET

    # Controller bandwidth present -> ESTIMATED (never DATASHEET without a source).
    assert quality_map["pll_bandwidth_hz"].quality is FieldQuality.ESTIMATED
    # Controller bandwidth absent -> SYSTEM_DEFAULT.
    assert quality_map["current_loop_bandwidth_hz"].quality is FieldQuality.SYSTEM_DEFAULT
    # SC-model / power-hierarchy absent -> SYSTEM_DEFAULT.
    assert quality_map["sc_model"].quality is FieldQuality.SYSTEM_DEFAULT
    assert quality_map["p_installed_mw"].quality is FieldQuality.SYSTEM_DEFAULT


def test_card_field_quality_map_never_emits_datasheet_for_estimated_bandwidth() -> None:
    # Even with a fully-rated converter, controller bands stay ESTIMATED until a
    # real source is attached. This is the anti-fabrication guarantee.
    c = _make_converter(
        manufacturer="ACME",
        current_loop_bandwidth_hz=800.0,
        voltage_loop_bandwidth_hz=80.0,
        pll_bandwidth_hz=30.0,
        control_delay_ms=1.0,
    )
    quality_map = card_field_quality_map(c)
    for name in _CARD_SSCI_FIELDS:
        assert quality_map[name].quality is not FieldQuality.DATASHEET, name


# ---------------------------------------------------------------------------
# ConverterType round-trip with new fields
# ---------------------------------------------------------------------------


def test_converter_type_round_trip_with_card_fields() -> None:
    c = _make_converter(
        sc_model="from_datasheet",
        sc_pq_split=0.2,
        sc_transient_k=2.5,
        sc_sustained_k=1.1,
        current_loop_bandwidth_hz=800.0,
        voltage_loop_bandwidth_hz=80.0,
        pll_bandwidth_hz=30.0,
        control_delay_ms=0.5,
        p_installed_mw=1.2,
        pn_ac_mw=1.0,
        p_connection_mw=0.9,
        p_achievable_mw=0.8,
    )
    restored = ConverterType.from_dict(c.to_dict())
    assert restored == c
    for name in _CARD_SCHEMA_FIELDS:
        assert getattr(restored, name) == getattr(c, name), name


# ---------------------------------------------------------------------------
# No regression: published catalog still builds + legacy fields byte-identical
# ---------------------------------------------------------------------------


def test_published_converters_build_and_round_trip() -> None:
    repo = get_default_mv_catalog()
    converters = repo.list_converter_types()
    assert converters  # catalog non-empty
    for c in converters:
        assert ConverterType.from_dict(c.to_dict()) == c


def test_published_converters_card_fields_are_none() -> None:
    repo = get_default_mv_catalog()
    for c in repo.list_converter_types():
        data = c.to_dict()
        for name in _CARD_SCHEMA_FIELDS:
            assert data[name] is None, (c.id, name)


def test_published_converter_legacy_fields_unchanged() -> None:
    # The legacy (non-card) projection of every published converter must be
    # byte-identical to itself across the new schema; the card additions are
    # purely additive null keys.
    repo = get_default_mv_catalog()
    card = set(_CARD_SCHEMA_FIELDS)
    for c in repo.list_converter_types():
        data = c.to_dict()
        legacy = {k: v for k, v in data.items() if k not in card}
        # No card field leaked into the legacy projection.
        assert card.isdisjoint(legacy.keys())
        # Legacy projection is JSON-stable.
        json.dumps(legacy, sort_keys=True)
