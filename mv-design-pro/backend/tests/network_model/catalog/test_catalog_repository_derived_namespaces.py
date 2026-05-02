from __future__ import annotations

from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogBinding


def test_default_catalog_derives_pv_and_bess_namespaces_from_converter_catalog() -> None:
    catalog = get_default_mv_catalog()

    pv_types = catalog.list_pv_inverter_types()
    bess_types = catalog.list_bess_inverter_types()

    assert pv_types, "Domyślny katalog musi wystawiać typoszeregi PV dla ZRODLO_NN_PV"
    assert bess_types, "Domyślny katalog musi wystawiać typoszeregi BESS dla ZRODLO_NN_BESS"
    assert any(item.id == "conv-pv-0.5mw-15kv" for item in pv_types)
    assert any(item.id == "conv-bess-0.5mw-1mwh-15kv" for item in bess_types)
    assert all(item.un_kv > 0 for item in pv_types)
    assert all(item.un_kv > 0 for item in bess_types)


def test_default_catalog_derives_mv_apparatus_namespace_from_switchgear_catalog() -> None:
    catalog = get_default_mv_catalog()

    mv_apparatus = catalog.list_mv_apparatus_types()

    assert mv_apparatus, "Domyślny katalog musi wystawiać APARAT_SN"
    assert any(item.id == "sw-cb-abb-vd4-12kv-630a" for item in mv_apparatus)


def test_materialization_works_for_derived_pv_bess_and_mv_apparatus_namespaces() -> None:
    catalog = get_default_mv_catalog()

    pv_result = materialize_catalog_binding(
        CatalogBinding(
            catalog_namespace="ZRODLO_NN_PV",
            catalog_item_id="conv-pv-0.5mw-15kv",
            catalog_item_version="2024.1",
            materialize=True,
        ),
        catalog,
    )
    bess_result = materialize_catalog_binding(
        CatalogBinding(
            catalog_namespace="ZRODLO_NN_BESS",
            catalog_item_id="conv-bess-0.5mw-1mwh-15kv",
            catalog_item_version="2024.1",
            materialize=True,
        ),
        catalog,
    )
    apparatus_result = materialize_catalog_binding(
        CatalogBinding(
            catalog_namespace="APARAT_SN",
            catalog_item_id="sw-cb-abb-vd4-12kv-630a",
            catalog_item_version="2024.1",
            materialize=True,
        ),
        catalog,
    )

    assert pv_result.success
    assert pv_result.solver_fields["un_kv"] == 15.0
    assert pv_result.solver_fields["s_n_kva"] == 550.0
    assert pv_result.solver_fields["p_max_kw"] == 500.0

    assert bess_result.success
    assert bess_result.solver_fields["un_kv"] == 15.0
    assert bess_result.solver_fields["p_charge_kw"] == 500.0
    assert bess_result.solver_fields["e_kwh"] == 1000.0

    assert apparatus_result.success
    assert apparatus_result.solver_fields["u_n_kv"] == 12.0
    assert apparatus_result.solver_fields["i_n_a"] == 630.0
