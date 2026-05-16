"""Tests for K30-26 manufacturer cascade w apply pipeline."""

from __future__ import annotations

from application.station_templates.apply import _cascade_manufacturer_choice
from application.station_templates.schema import CatalogChoice


def test_cascade_prefers_zpue_match() -> None:
    """ZPUE profile prefers zpue-* catalog entries."""
    options = (
        CatalogChoice("tr-sn-nn-15-04-630kva-dyn11", "Generic TR", "TRAFO_SN_NN", default=True),
        CatalogChoice("zpue-tzh-630-15-04", "ZPUE TZH 630", "TRAFO_SN_NN"),
        CatalogChoice("wzl-tpmnr-630-15-04", "WZL TPMnR 630", "TRAFO_SN_NN"),
    )
    result = _cascade_manufacturer_choice(options, "ZPUE Włoszczowa")
    assert result == "zpue-tzh-630-15-04"


def test_cascade_prefers_wzl_match() -> None:
    """WZL Kędzierzyn profile prefers wzl-* entries."""
    options = (
        CatalogChoice("tr-sn-nn-15-04-630kva-dyn11", "Generic", "TRAFO_SN_NN", default=True),
        CatalogChoice("zpue-tzh-630-15-04", "ZPUE", "TRAFO_SN_NN"),
        CatalogChoice("wzl-tpmnr-630-15-04", "WZL TPMnR", "TRAFO_SN_NN"),
    )
    result = _cascade_manufacturer_choice(options, "WZL Kędzierzyn-Koźle")
    assert result == "wzl-tpmnr-630-15-04"


def test_cascade_fallback_to_default_when_no_match() -> None:
    """When manufacturer doesn't match any catalog_ref, fall back to default."""
    options = (
        CatalogChoice("tr-sn-nn-15-04-630kva-dyn11", "Generic", "TRAFO_SN_NN", default=True),
        CatalogChoice("zpue-tzh-630-15-04", "ZPUE", "TRAFO_SN_NN"),
    )
    result = _cascade_manufacturer_choice(options, "Siemens")
    # No siemens-prefix entry → fallback to default
    assert result == "tr-sn-nn-15-04-630kva-dyn11"


def test_cascade_returns_default_when_no_manufacturer() -> None:
    options = (
        CatalogChoice("tr-sn-nn-15-04-630kva-dyn11", "Generic", "TRAFO_SN_NN", default=True),
        CatalogChoice("zpue-tzh-630-15-04", "ZPUE", "TRAFO_SN_NN"),
    )
    result = _cascade_manufacturer_choice(options, None)
    assert result == "tr-sn-nn-15-04-630kva-dyn11"


def test_cascade_empty_options() -> None:
    result = _cascade_manufacturer_choice((), "ZPUE")
    assert result is None
