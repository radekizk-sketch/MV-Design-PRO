from __future__ import annotations

from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CATALOG_CONTRACT_VERSION


def _catalog_groups() -> dict[str, list[object]]:
    repo = get_default_mv_catalog()
    return {
        "LINIA_SN": repo.list_line_types(),
        "KABEL_SN": repo.list_cable_types(),
        "TRAFO_SN_NN": repo.list_transformer_types(),
        "APARAT_SN": repo.list_switch_equipment_types(),
        "PRZEKSZTALTNIK": repo.list_converter_types(),
        "APARAT_SN_DERYWOWANY": repo.list_mv_apparatus_types(),
        "KABEL_NN": repo.list_lv_cable_types(),
        "OBCIAZENIE": repo.list_load_types(),
        "APARAT_NN": repo.list_lv_apparatus_types(),
        "APARAT_NN_MCB": repo.list_lv_breaker_mcb_types(),
        "WKLADKA_NN": repo.list_lv_fuse_link_types(),
        "CT": repo.list_ct_types(),
        "VT": repo.list_vt_types(),
        "ZRODLO_SN": repo.list_source_system_types(),
        "FALOWNIK_PV": repo.list_pv_inverter_types(),
        "FALOWNIK_BESS": repo.list_bess_inverter_types(),
        "ZABEZPIECZENIE": repo.list_protection_device_types(),
        "KRZYWA_ZABEZPIECZENIA": repo.list_protection_curves(),
        "SZABLON_NASTAW": repo.list_protection_setting_templates(),
    }


def test_catalog_records_have_required_metadata() -> None:
    for group, items in _catalog_groups().items():
        assert items, f"Grupa {group} nie moze byc pusta"
        for item in items:
            data = item.to_dict()
            assert data["verification_status"], group
            assert data["source_reference"], group
            assert data["catalog_status"], group
            assert data["contract_version"], group


def test_catalog_records_have_verification_status() -> None:
    allowed = {
        "ZWERYFIKOWANY",
        "NIEWERYFIKOWANY",
        "CZESCIOWO_ZWERYFIKOWANY",
        "REFERENCYJNY",
    }
    for group, items in _catalog_groups().items():
        for item in items:
            assert item.to_dict()["verification_status"] in allowed, group


def test_catalog_records_have_source_reference() -> None:
    for group, items in _catalog_groups().items():
        for item in items:
            source_reference = item.to_dict()["source_reference"]
            assert isinstance(source_reference, str), group
            assert source_reference.strip(), group


def test_catalog_records_have_contract_version() -> None:
    for group, items in _catalog_groups().items():
        for item in items:
            assert item.to_dict()["contract_version"] == CATALOG_CONTRACT_VERSION, group


def test_catalog_records_have_stable_ids() -> None:
    for group, items in _catalog_groups().items():
        ids = [item.to_dict()["id"] for item in items]
        assert all(isinstance(item_id, str) and item_id for item_id in ids), group
        assert len(ids) == len(set(ids)), group


def test_production_records_are_not_unverified() -> None:
    for group, items in _catalog_groups().items():
        for item in items:
            data = item.to_dict()
            if data["catalog_status"] == "PRODUKCYJNY_V1":
                assert data["verification_status"] != "NIEWERYFIKOWANY", group


def test_catalog_groups_do_not_mix_status_semantics() -> None:
    analytical_groups = {"ZABEZPIECZENIE", "KRZYWA_ZABEZPIECZENIA", "SZABLON_NASTAW"}
    for group, items in _catalog_groups().items():
        statuses = {item.to_dict()["catalog_status"] for item in items}
        if group in analytical_groups:
            assert statuses <= {"ANALITYCZNY_V1", "REFERENCYJNY_V1"}, group
        else:
            assert "ANALITYCZNY_V1" not in statuses, group
