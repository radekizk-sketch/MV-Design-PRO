"""Testy pola ``pq_curve`` w ConverterType — serializacja, parser, walidacja (D4).

Delta ADDYTYWNA: opcjonalne pole krzywej zdolności P-Q. Istniejące rekordy bez
pola zachowują się jak dotąd (None, brak klucza w ``to_dict``).
"""

from __future__ import annotations

import pytest
from network_model.catalog.mv_converter_catalog import get_all_converter_types
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import ConverterKind, ConverterType

_REFERENCE_IDS_WITH_CURVE = {
    "conv-pv-card-huawei-sun2000-215ktl",
    "conv-pv-card-sungrow-sg3150u-mv",
    "conv-bess-card-sungrow-sc2000ud-mv",
}


def _converter(pq_curve=None) -> ConverterType:
    return ConverterType(
        id="conv-test",
        name="Test",
        kind=ConverterKind.PV,
        un_kv=0.4,
        sn_mva=1.0,
        pmax_mw=1.0,
        qmin_mvar=-0.6,
        qmax_mvar=0.6,
        pq_curve=pq_curve,
    )


# --------------------------------------------------------------------------
# Serializacja / parser
# --------------------------------------------------------------------------


def test_converter_without_pq_curve_has_no_key_and_roundtrips() -> None:
    c = _converter(pq_curve=None)
    data = c.to_dict()
    assert "pq_curve" not in data  # brak pola => klucz nieobecny (byte-identycznie)
    assert ConverterType.from_dict(data) == c
    assert ConverterType.from_dict(data).pq_curve is None


def test_converter_with_pq_curve_roundtrips() -> None:
    curve = ((0.0, -0.6, 0.6), (0.5, -0.6, 0.6), (1.0, -0.2, 0.2))
    c = _converter(pq_curve=curve)
    restored = ConverterType.from_dict(c.to_dict())
    assert restored == c
    assert restored.pq_curve == curve


def test_pq_curve_serializes_to_list_of_lists() -> None:
    c = _converter(pq_curve=((0.0, -0.6, 0.6), (1.0, -0.2, 0.2)))
    data = c.to_dict()
    assert data["pq_curve"] == [[0.0, -0.6, 0.6], [1.0, -0.2, 0.2]]


def test_from_dict_parses_pq_curve_from_list() -> None:
    data = _converter().to_dict()
    data["pq_curve"] = [[0.0, -0.6, 0.6], [1.0, -0.1, 0.1]]
    restored = ConverterType.from_dict(data)
    assert restored.pq_curve == ((0.0, -0.6, 0.6), (1.0, -0.1, 0.1))


# --------------------------------------------------------------------------
# Walidacja konstrukcji
# --------------------------------------------------------------------------


def test_pq_curve_unsorted_raises() -> None:
    with pytest.raises(ValueError, match="rosnaco po p_mw"):
        _converter(pq_curve=((1.0, -0.6, 0.6), (0.5, -0.6, 0.6)))


def test_pq_curve_duplicate_p_raises() -> None:
    with pytest.raises(ValueError, match="rosnaco po p_mw"):
        _converter(pq_curve=((0.5, -0.6, 0.6), (0.5, -0.6, 0.6)))


def test_pq_curve_negative_p_raises() -> None:
    with pytest.raises(ValueError, match=">= 0"):
        _converter(pq_curve=((-0.1, -0.6, 0.6),))


def test_pq_curve_qmin_gt_qmax_raises() -> None:
    with pytest.raises(ValueError, match="q_min_mvar <= q_max_mvar"):
        _converter(pq_curve=((0.5, 0.6, -0.6),))


def test_pq_curve_empty_raises() -> None:
    with pytest.raises(ValueError, match="nie moze byc pusta"):
        _converter(pq_curve=())


def test_pq_curve_wrong_arity_raises() -> None:
    with pytest.raises(ValueError, match="3 wartosci"):
        ConverterType.from_dict({**_converter().to_dict(), "pq_curve": [[0.0, -0.6]]})


# --------------------------------------------------------------------------
# Rekordy referencyjne katalogu
# --------------------------------------------------------------------------


def test_reference_cards_have_pq_curve() -> None:
    by_id = {rec["id"]: rec for rec in get_all_converter_types()}
    for ref_id in _REFERENCE_IDS_WITH_CURVE:
        curve = by_id[ref_id]["params"].get("pq_curve")
        assert curve, ref_id
        assert curve[0][0] == 0.0  # zaczyna od p=0
        assert curve[-1][2] <= curve[0][2]  # zwezenie przy p_max (q_max nie rosnie)


def test_published_converters_still_roundtrip_with_pq_curve() -> None:
    repo = get_default_mv_catalog()
    converters = repo.list_converter_types()
    assert converters
    for c in converters:
        assert ConverterType.from_dict(c.to_dict()) == c


def test_non_reference_converters_have_no_pq_curve() -> None:
    for rec in get_all_converter_types():
        if rec["id"] in _REFERENCE_IDS_WITH_CURVE:
            continue
        assert rec["params"].get("pq_curve") is None, rec["id"]
