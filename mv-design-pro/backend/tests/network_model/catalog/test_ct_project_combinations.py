"""Przykładowe konfiguracje SN/nN — nie udawać danych producenta."""
from network_model.catalog.mv_ct_project_combinations import (
    get_ct_project_combination_templates,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CTType


def test_project_templates_48_sn_30_nn() -> None:
    rows = get_ct_project_combination_templates()
    assert len(rows) == 78
    assert sum("-sn-" in r["id"] for r in rows) == 48
    assert sum("-nn-" in r["id"] for r in rows) == 30
    assert len({r["id"] for r in rows}) == 78
    repo = get_default_mv_catalog()
    for row in rows:
        p = row["params"]
        assert row["id"] in repo.ct_types
        assert p["core_count"] == 2
        assert p["ratio_secondary_a"] == 1.0
        assert "primary_taps_a" not in p
        assert p["verification_status"] == "REFERENCYJNY"
        assert p["secondary_cores"][0]["role"] == "METERING"
        assert p["secondary_cores"][1]["role"] == "PROTECTION"
        assert p["secondary_cores"][0]["burden_va"] == 5.0
        assert p["secondary_cores"][1]["alf"] in (10, 20)
        assert p["secondary_cores"][1]["accuracy_class"] in ("5P10", "5P20")
        assert "SZABLON PROJEKTOWY" in p["verification_note"]
        assert CTType.from_dict(repo.ct_types[row["id"]].to_dict()).to_dict() == repo.ct_types[row["id"]].to_dict()
