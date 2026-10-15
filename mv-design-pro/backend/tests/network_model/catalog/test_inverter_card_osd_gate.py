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
    _POLA_KARTY_MEGAPACK,
    _POLA_KARTY_PV,
    _REFERENCE_BANDWIDTH_FIELDS,
    _REFERENCE_POWER_HIERARCHY_FIELDS,
    _REFERENCE_RATING_FIELDS,
    CONVERTER_BESS_NN_KOPIE_KART,
    CONVERTER_PV_NN_KARTY_PRODUCENTOW,
    CONVERTER_PV_NN_KOPIE_KART,
    CONVERTER_REFERENCE_CARDS,
    CONVERTER_WIND_NN_VESTAS_V112,
    PREFIKS_KOPII_KARTY,
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
def test_reference_card_ratings_are_declared_not_datasheet(card_id: str) -> None:
    """Karta KATALOG-KOMPLETNY-PROWENIENCJA: karta techniczna referencyjnych pozycji jest
    DEKLAROWANA (dokument niedołączony), więc ratingi NIE są DATASHEET — są ESTIMATED ze
    źródłem nazwanym jako deklaracja. Intencja dawnego testu (rating cytuje kartę
    techniczną producenta) zostaje: cytat jest, ale z prawdziwym statusem."""
    card = _reference_cards_from_catalog()[card_id]
    assert card.verification_status == "NIEWERYFIKOWANY"
    assert card.source_reference.startswith("Deklarowane: Karta techniczna")
    quality_map = resolve_card_field_quality_map(card)
    for name in _REFERENCE_RATING_FIELDS + _REFERENCE_POWER_HIERARCHY_FIELDS:
        assert quality_map[name].quality is FieldQuality.ESTIMATED, name
        assert quality_map[name].source_ref
        assert quality_map[name].source_ref.startswith("Deklarowane: ")
        assert "karta techniczna" in quality_map[name].source_ref.lower()
    # Założenie rekordu (nadwymiarowanie DC) — ESTIMATED z nazwanym założeniem.
    p_inst = quality_map["p_installed_mw"]
    assert p_inst.quality is FieldQuality.ESTIMATED
    assert p_inst.note and "założenie" in p_inst.note


def test_manufacturer_card_ratings_are_datasheet_with_cited_document() -> None:
    """Pozycje z kartą producenta (ZWERYFIKOWANY): każde pole ratingu DATASHEET ze źródłem
    z adresem dokumentu; tryb regulacji = nastawa projektu (SYSTEM_DEFAULT)."""
    repo = get_default_mv_catalog()
    ids = [rec["id"] for rec in CONVERTER_PV_NN_KARTY_PRODUCENTOW]
    # 7 kart z pierwszej części karty + 2 SMA Sunny Tripower 8.0/10.0 3AV-40 (runda 3).
    assert len(ids) == 9
    for cid in ids:
        card = repo.converter_types[cid]
        assert card.verification_status == "ZWERYFIKOWANY", cid
        assert "https://" in card.source_reference, cid
        quality_map = resolve_card_field_quality_map(card)
        for name in _REFERENCE_RATING_FIELDS:
            assert quality_map[name].quality is FieldQuality.DATASHEET, (cid, name)
            assert quality_map[name].source_ref == card.source_reference, (cid, name)
        assert quality_map["control_mode"].quality is FieldQuality.SYSTEM_DEFAULT, cid


_KOPIE_KART = [
    *[
        (rec["id"], tuple(p for p in _POLA_KARTY_PV if p != "cosphi_min"))
        for rec in CONVERTER_PV_NN_KOPIE_KART
    ],
    *[(rec["id"], _POLA_KARTY_MEGAPACK) for rec in CONVERTER_BESS_NN_KOPIE_KART],
    # Karta KATALOG-TURBINY-TOR-V112: kopie dokumentów Vestas (V112-3.0, V112-3.3 × 2
    # warianty generatora) — każde pole niesione z dokumentu ESTIMATED z adresem kopii.
    *[
        (rec["id"], tuple(sorted(rec["params"]["card_field_status"])))
        for rec in CONVERTER_WIND_NN_VESTAS_V112
        if rec["params"]["source_reference"].startswith(PREFIKS_KOPII_KARTY)
    ],
]


@pytest.mark.parametrize(("card_id", "pola"), _KOPIE_KART, ids=[c for c, _ in _KOPIE_KART])
def test_copy_of_manufacturer_card_is_estimated_never_datasheet(
    card_id: str, pola: tuple[str, ...]
) -> None:
    """Kopia karty na serwerze strony trzeciej: wartości są z dokumentu producenta, ale
    autentyczność kopii nie jest potwierdzona kanałem producenta — status
    CZESCIOWO_ZWERYFIKOWANY, każde pole karty ESTIMATED z cytowanym adresem kopii,
    NIGDY DATASHEET (DATASHEET daje wyłącznie ZWERYFIKOWANY)."""
    card = get_default_mv_catalog().converter_types[card_id]
    assert card.verification_status == "CZESCIOWO_ZWERYFIKOWANY"
    assert card.catalog_status == "REFERENCYJNY_V1"
    assert card.source_reference.startswith(PREFIKS_KOPII_KARTY)
    assert "https://" in card.source_reference
    quality_map = resolve_card_field_quality_map(card)
    for name in pola:
        assert quality_map[name].quality is FieldQuality.ESTIMATED, (card_id, name)
        assert quality_map[name].source_ref == card.source_reference, (card_id, name)
    for name, status in quality_map.items():
        assert status.quality is not FieldQuality.DATASHEET, (card_id, name)


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
    # Karty referencyjne, karty producentów i kopie kart deklarują proweniencję per pole.
    reference_ids = (
        set(_REFERENCE_CARD_IDS)
        | {rec["id"] for rec in CONVERTER_PV_NN_KARTY_PRODUCENTOW}
        | {card_id for card_id, _ in _KOPIE_KART}
        # V112-3.45: deklaracja DNV nieodczytana — pola karty ESTIMATED z nazwą deklaracji.
        | {"vestas_v112_3_45mw"}
    )
    for c in repo.list_converter_types():
        if c.id in reference_ids:
            continue
        assert c.card_field_status is None, c.id
        assert "card_field_status" not in c.to_dict(), c.id
