"""Migracja modelu zastanego (rekordy legacy) → graf kompilatora → ENM (W1).

Iloczyn cech: {linia z type_ref, linia z parametrami wprost, kabel bez typu, transformator
z parametrami wprost, transformator z type_ref} × {obciążalność > 0, placeholder 0 A} ×
{źródło systemowe, źródło innego modelu} × {gałąź w ruchu, wyłączona}. Każda odmowa jest
NAZWANA (element + przyczyna) — zero cichego pomijania, zero wartości zgadywanych.
"""

from __future__ import annotations

import pytest
from application.migracja_legacy import OdmowaMigracji, graf_z_modelu_legacy
from enm.kompilator_grafu import kompiluj_graf
from enm.models import EnergyNetworkModel
from enm.severity import SEVERITY_BLOCKER
from enm.validator import ENMValidator
from network_model.catalog.repository import get_default_mv_catalog

KABEL = "cable-tfk-yakxs-3x120"


def _wezly():
    return [
        {"id": "n1", "name": "GPZ", "node_type": "SLACK", "base_kv": 15.0, "attrs_jsonb": {}},
        {"id": "n2", "name": "Stacja", "node_type": "PQ", "base_kv": 15.0, "attrs_jsonb": {}},
        {"id": "n3", "name": "Stacja nN", "node_type": "PQ", "base_kv": 0.4, "attrs_jsonb": {}},
    ]


def _linia(**nadpisania):
    params = {
        "r_ohm_per_km": 0.253,
        "x_ohm_per_km": 0.081,
        "b_us_per_km": 0.0,
        "length_km": 5.0,
        "rated_current_a": 315.0,
        "type_ref": None,
    }
    params.update(nadpisania.pop("params", {}))
    galaz = {
        "id": "b1",
        "name": "AFL-6 120",
        "branch_type": "line",
        "from_node_id": "n1",
        "to_node_id": "n2",
        "in_service": True,
        "params_jsonb": params,
    }
    galaz.update(nadpisania)
    return galaz


def _trafo(**nadpisania):
    params = {
        "rated_power_mva": 0.4,
        "voltage_hv_kv": 15.0,
        "voltage_lv_kv": 0.4,
        "uk_percent": 6.0,
        "pk_kw": 4.6,
        "vector_group": "Dyn11",
    }
    params.update(nadpisania.pop("params", {}))
    galaz = {
        "id": "b2",
        "name": "T1",
        "branch_type": "transformer",
        "from_node_id": "n2",
        "to_node_id": "n3",
        "in_service": True,
        "params_jsonb": params,
    }
    galaz.update(nadpisania)
    return galaz


def _zrodlo(**payload):
    dane = {"name": "Z1", "model": "short_circuit_power", "sk3_mva": 500.0, "rx_ratio": 0.1}
    dane.update(payload)
    return {"id": "s1", "node_id": "n1", "source_type": "GRID", "payload_jsonb": dane}


def _odbior():
    return {
        "id": "l1",
        "node_id": "n3",
        "payload_jsonb": {"name": "O1", "p_mw": 0.25, "q_mvar": 0.08},
    }


def _graf(galezie=None, zrodla=None, odbiory=None):
    return graf_z_modelu_legacy(
        nazwa="legacy",
        wezly=_wezly(),
        galezie=[_linia(), _trafo()] if galezie is None else galezie,
        zrodla=[_zrodlo()] if zrodla is None else zrodla,
        odbiory=[_odbior()] if odbiory is None else odbiory,
        proweniencja="legacy:test",
    )


def test_parametry_wprost_staja_sie_typami_projektu_z_proweniencja():
    graf = _graf()
    assert graf.katalog_projektu is not None
    [linia] = graf.katalog_projektu["line_types"]
    assert linia["params"]["rated_current_a"] == 315.0
    assert linia["params"]["voltage_rating_kv"] == 15.0  # z napięcia węzła, nazwane
    assert "napięcia węzła 'n1'" in linia["params"]["verification_note"]
    assert linia["params"]["source_reference"] == "legacy:test:b1"
    assert linia["params"]["verification_status"] == "NIEWERYFIKOWANY"
    [trafo] = graf.katalog_projektu["transformer_types"]
    assert trafo["params"]["vector_group"] == "Dyn11"
    assert (trafo["params"]["tap_min"], trafo["params"]["tap_max"]) == (0, 0)
    assert "brak regulacji" in trafo["params"]["verification_note"]
    assert graf.odcinki[0].catalog_ref == linia["id"]
    assert graf.transformatory[0].catalog_ref == trafo["id"]
    assert graf.transformatory[0].name == "T1"


def test_model_zastany_kompiluje_sie_do_enm_bez_blokad():
    model = EnergyNetworkModel.model_validate(kompiluj_graf(_graf()).enm)
    assert [b.name for b in model.buses] == ["GPZ", "Stacja", "Stacja nN"]
    assert [b.name for b in model.branches] == ["b1"]
    assert [t.name for t in model.transformers] == ["T1"]
    assert [s.name for s in model.sources] == ["Z1"]
    assert [o.name for o in model.loads] == ["O1"]
    assert model.katalog_projektu is not None
    blokady = [i for i in ENMValidator().validate(model).issues if i.severity == SEVERITY_BLOCKER]
    assert blokady == []


def test_type_ref_z_katalogu_statycznego_wiaze_typ_producenta_bez_typu_projektu():
    graf = _graf(galezie=[_linia(branch_type="cable", params={"type_ref": KABEL})])
    assert graf.odcinki[0].catalog_ref == KABEL
    assert graf.odcinki[0].rodzaj == "KABEL"
    assert graf.katalog_projektu is None


def test_type_ref_transformatora_z_katalogu():
    typ = sorted(
        i
        for i, t in get_default_mv_catalog().transformer_types.items()
        if t.voltage_hv_kv == 15.0 and t.voltage_lv_kv == 0.4
    )[0]
    graf = _graf(galezie=[_linia(), _trafo(params={"type_ref": typ})])
    assert graf.transformatory[0].catalog_ref == typ
    assert graf.katalog_projektu is not None and graf.katalog_projektu["transformer_types"] == []


def test_placeholder_obciazalnosci_0_a_jest_odmowa_nazwana():
    with pytest.raises(OdmowaMigracji, match="gałąź 'AFL-6 120'.*placeholder"):
        _graf(galezie=[_linia(params={"rated_current_a": 0.0})])


def test_kabel_bez_typu_katalogowego_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="kabel bez typu katalogowego"):
        _graf(galezie=[_linia(branch_type="cable")])


def test_nieznany_type_ref_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="nie występuje w katalogu"):
        _graf(galezie=[_linia(params={"type_ref": "NIE-MA"})])


def test_galaz_wylaczona_z_ruchu_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="wyłączona z ruchu"):
        _graf(galezie=[_linia(in_service=False)])


def test_zrodlo_innego_modelu_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="wyłącznie źródło systemowe"):
        _graf(zrodla=[_zrodlo(model="generator")])


def test_zrodlo_bez_sk_i_ik_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="brak mocy zwarciowej"):
        _graf(zrodla=[_zrodlo(sk3_mva=None)])


def test_brak_grupy_polaczen_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="brak grupy połączeń"):
        _graf(galezie=[_linia(), _trafo(params={"vector_group": None})])


def test_odwolanie_do_nieistniejacego_wezla_jest_odmowa():
    with pytest.raises(OdmowaMigracji, match="węzeł 'n9' nie istnieje"):
        _graf(galezie=[_linia(to_node_id="n9")])


def test_dane_min_i_u_set_przechodza_bez_zmian():
    graf = _graf(
        zrodla=[
            _zrodlo(ik3_ka=19.2, sk3_min_mva=150.0, ik3_min_ka=6.0, rx_ratio_min=0.2, u_set_pu=1.02)
        ]
    )
    [zrodlo] = graf.zrodla
    assert (zrodlo.sk3_mva, zrodlo.ik3_ka, zrodlo.sk3_min_mva) == (500.0, 19.2, 150.0)
    assert (zrodlo.ik3_min_ka, zrodlo.rx_ratio_min, zrodlo.u_set_pu) == (6.0, 0.2, 1.02)
