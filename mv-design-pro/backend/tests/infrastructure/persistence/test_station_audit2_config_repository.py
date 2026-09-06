"""Repozytorium konfiguracji audytu 2 stacji (CV-4.2b): jedyne miejsce odczytu/zapisu tabeli.

Reguła KLASA §4: deklaracja „identyfikator istniejącego wiersza zachowany przy UPSERT"
i „usunięcie nieistniejącego = False" mają tu przypięte testy.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

pytest.importorskip("sqlalchemy")


def _projekt(uow_factory):
    from infrastructure.persistence.models import ProjectORM

    project_id = uuid4()
    with uow_factory() as uow:
        uow.session.add(
            ProjectORM(
                id=project_id,
                name="Projekt repozytorium audytu 2",
                schema_version="1.0",
                mode="AS-IS",
                voltage_level_kv=15.0,
                frequency_hz=50.0,
            )
        )
    return project_id


def _pola(**nadpisania):
    pola = {
        "mv_neutral_grounding_ref": "mng_petersen",
        "tap_changer_refs": ["tc_oltc_110sn_19_125"],
        "der_specs": [{"der_id": "der_001", "der_kind": "PV"}],
        "transformer_tap_changers": {"tr_001": "tc_oltc_110sn_19_125"},
        "bay_hv_fuses": {},
        "bay_vts": {},
        "bay_device_withstand": {},
    }
    pola.update(nadpisania)
    return pola


def test_get_bez_wiersza_daje_none_a_lista_pusta(uow_factory) -> None:
    project_id = _projekt(uow_factory)
    with uow_factory() as uow:
        assert uow.audit2_station_configs.get(project_id, "brak") is None
        assert uow.audit2_station_configs.list_for_project(project_id) == []


def test_upsert_wstawia_a_powtorny_upsert_nadpisuje_zachowujac_id(uow_factory) -> None:
    project_id = _projekt(uow_factory)
    with uow_factory() as uow:
        pierwszy = uow.audit2_station_configs.upsert(project_id, "st-A", **_pola())
        id_pierwszego = pierwszy.id
    with uow_factory() as uow:
        drugi = uow.audit2_station_configs.upsert(
            project_id, "st-A", **_pola(mv_neutral_grounding_ref="mng_resistor_low")
        )
        assert drugi.id == id_pierwszego
        assert drugi.mv_neutral_grounding_ref == "mng_resistor_low"
    with uow_factory() as uow:
        wiersz = uow.audit2_station_configs.get(project_id, "st-A")
        assert wiersz is not None and wiersz.mv_neutral_grounding_ref == "mng_resistor_low"
        assert wiersz.transformer_tap_changers == {"tr_001": "tc_oltc_110sn_19_125"}


def test_lista_projektu_posortowana_po_stacji_i_odseparowana_od_innego_projektu(
    uow_factory,
) -> None:
    projekt_a = _projekt(uow_factory)
    projekt_b = _projekt(uow_factory)
    with uow_factory() as uow:
        for stacja in ("st-C", "st-A", "st-B"):
            uow.audit2_station_configs.upsert(projekt_a, stacja, **_pola())
        uow.audit2_station_configs.upsert(projekt_b, "st-Z", **_pola())
    with uow_factory() as uow:
        assert [r.station_id for r in uow.audit2_station_configs.list_for_project(projekt_a)] == [
            "st-A",
            "st-B",
            "st-C",
        ]
        assert [r.station_id for r in uow.audit2_station_configs.list_for_project(projekt_b)] == [
            "st-Z"
        ]


def test_delete_usuwa_istniejacy_a_nieistniejacy_daje_false(uow_factory) -> None:
    project_id = _projekt(uow_factory)
    with uow_factory() as uow:
        uow.audit2_station_configs.upsert(project_id, "st-A", **_pola())
    with uow_factory() as uow:
        assert uow.audit2_station_configs.delete(project_id, "st-A") is True
        assert uow.audit2_station_configs.delete(project_id, "st-A") is False
    with uow_factory() as uow:
        assert uow.audit2_station_configs.get(project_id, "st-A") is None


def test_rozszerzenia_z_konfiguracji_rozwijaja_wiersz_repozytorium(uow_factory) -> None:
    """Jedna droga wiersz -> rozszerzenia solvera (bieg kanoniczny, P11, diagnostyka)."""
    from solver_input.audit2_der_payload import rozszerzenia_audit2_z_konfiguracji

    project_id = _projekt(uow_factory)
    with uow_factory() as uow:
        wiersz = uow.audit2_station_configs.upsert(project_id, "st-A", **_pola())
        rozszerzenia = rozszerzenia_audit2_z_konfiguracji(wiersz)
    assert set(rozszerzenia) == {
        "sc_iec60909_extensions",
        "power_flow_extensions",
        "protection_extensions",
    }
    assert rozszerzenia["sc_iec60909_extensions"]["mv_neutral_grounding"]["grounding_type"] == (
        "petersen_coil"
    )
    assert "tr_001" in rozszerzenia["power_flow_extensions"]["transformer_to_tap_changer"]
