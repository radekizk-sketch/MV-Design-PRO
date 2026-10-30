"""ABB KOKM fazowy na kablu to nie Ferranti ani KOLMA/KOLA do I0."""
from __future__ import annotations

from math import isclose

from network_model.catalog.mv_ct_abb_kokm_cable_phase import get_abb_kokm1_phase_ct_types
from network_model.catalog.mv_ferranti_catalog import get_all_ferranti_types
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CTType


def test_17_abb_kokm1_fazowych_z_tabeli_abb() -> None:
    items = get_abb_kokm1_phase_ct_types()
    assert len(items) == 17
    assert len({x["id"] for x in items}) == 17
    assert {x["params"]["um_kv"] for x in items} == {1.2}
    assert {x["params"]["core_count"] for x in items} == {1}
    repo = get_default_mv_catalog()
    for item in items:
        p = item["params"]
        assert item["id"] in repo.ct_types
        assert p["construction"] == "RING_PHASE_CT"
        assert p["manufacturer"] == "ABB"
        assert p["catalog_status"] == "REFERENCYJNY_V1"
        assert "ABB-przekladniki" in p["source_reference"]
        assert p["burden_va"] > 0
        assert 0.0 < p["ratio_secondary_a"] < 6.0
        assert p["ratio_primary_a"] >= 50
        assert isclose(p["ith_ka_1s"], min(60.0 * p["ratio_primary_a"] / 1000.0, 100.0))
        assert "nie używać do pomiaru 3I0" in p["verification_note"]
        assert "0,2S" in p["verification_note"]
        d = repo.ct_types[item["id"]].to_dict()
        assert d["core_count"] == 1
        assert d["secondary_cores"] == p["secondary_cores"]
        assert CTType.from_dict(d).to_dict() == d


def test_abb_kokm_referencje_roznych_okien_i_klas_nie_kola() -> None:
    items = get_abb_kokm1_phase_ct_types()
    assert any(x["id"] == "ct-abb-kokm1-bc10-200-5-5p20" for x in items)
    assert any(x["id"] == "ct-abb-kokm1-fc8-1000-5-0p5" for x in items)
    assert not any("kola" in x["id"] or "kolma" in x["id"] for x in items)
    ferranti = {x["id"] for x in get_all_ferranti_types()}
    assert not ferranti.intersection(x["id"] for x in items)
    assert all(x["params"]["secondary_cores"][0]["role"] in ("METERING", "PROTECTION") for x in items)
    assert all("primary_taps_a" not in x["params"] for x in items)
