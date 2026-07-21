"""G-STK-8: add_surge_arrester_sn — strona konfiguracyjna GAP-2 (SPD).

Weryfikuje, że operacja materializuje ogranicznik przepięć na field_spec pola,
oraz że TEN SAM kanał czytają obaj konsumenci: most koordynacji izolacji
IEC 60071 (build_v126_insulation_from_enm) i read-model pola (primary_devices →
glif SLD). Katalog-first, deduplikacja, walidacje, determinizm.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMHeader
from solver_input.v126_contracts import build_v126_insulation_from_enm

_ARRESTER_ID = "arrester-abb-polim-d-24kv-10ka"


def _binding(item_id: str) -> dict:
    return {
        "catalog_binding": {
            "catalog_namespace": "OGRANICZNIK_SN",
            "catalog_item_id": item_id,
            "materialize": True,
        }
    }


def _enm_with_field(voltage_kv: float = 20.0) -> dict:
    return {
        "buses": [{"ref_id": "BUS_SN", "name": "Szyna SN", "voltage_kv": voltage_kv}],
        "substations": [
            {
                "ref_id": "ST1",
                "name": "Stacja 1",
                "station_type": "mv_lv",
                "bus_refs": ["BUS_SN"],
                "meta": {
                    "field_specs": [
                        {
                            "field_ref": "POLE-IN",
                            "name": "Pole liniowe",
                            "bay_role": "IN",
                            "bus_ref": "BUS_SN",
                            "equipment_refs": [],
                        }
                    ]
                },
            }
        ],
    }


def _add(enm: dict, payload: dict) -> dict:
    return execute_domain_operation(enm, "add_surge_arrester_sn", payload)


def _field_spec(snapshot: dict) -> dict:
    return snapshot["substations"][0]["meta"]["field_specs"][0]


def test_materializes_arrester_on_field_spec_from_catalog() -> None:
    result = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    assert not result.get("error"), result
    arresters = _field_spec(result["snapshot"]).get("surge_arresters")
    assert isinstance(arresters, list) and len(arresters) == 1
    assert arresters[0]["catalog_ref"] == _ARRESTER_ID
    assert arresters[0]["catalog_namespace"] == "OGRANICZNIK_SN"
    assert arresters[0]["device_ref"]


def test_resolves_field_by_bus_when_no_field_ref() -> None:
    result = _add(_enm_with_field(), {"bus_ref": "BUS_SN", **_binding(_ARRESTER_ID)})
    assert not result.get("error"), result
    assert len(_field_spec(result["snapshot"])["surge_arresters"]) == 1


def test_catalog_required() -> None:
    result = _add(_enm_with_field(), {"field_ref": "POLE-IN"})
    assert result.get("error")
    assert result["error_code"] == "spd.catalog_required"


def test_unknown_catalog_ref_rejected() -> None:
    result = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding("arrester-nieistnieje")})
    assert result.get("error")
    assert result["error_code"] == "spd.catalog_not_found"


def test_missing_field_rejected() -> None:
    enm = _enm_with_field()
    enm["substations"][0]["meta"]["field_specs"] = []
    result = _add(enm, {"bus_ref": "BUS_SN", **_binding(_ARRESTER_ID)})
    assert result.get("error")
    assert result["error_code"] == "spd.field_not_found"


def test_duplicate_catalog_on_field_rejected() -> None:
    first = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    second = _add(first["snapshot"], {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    assert second.get("error")
    assert second["error_code"] == "spd.already_present"


def test_bridge_reads_arrester_from_field_spec_channel() -> None:
    result = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    snapshot = result["snapshot"]
    snapshot["header"] = ENMHeader(name="spd").model_dump()
    model = EnergyNetworkModel.model_validate(snapshot)
    rows = build_v126_insulation_from_enm(model)
    assert len(rows) == 1
    assert rows[0].location_bus_ref == "BUS_SN"
    # Karta katalogowa (POLIM-D 24 kV) — realne parametry, nie dobór wstępny.
    assert rows[0].arrester_mcov_kv == 20.4
    assert rows[0].u_m_kv == 24.0


def test_read_model_projects_surge_arrester_primary_device() -> None:
    from application.field_read_model import build_field_read_model

    result = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    snapshot = result["snapshot"]
    snapshot["header"] = ENMHeader(name="spd").model_dump()
    model = EnergyNetworkModel.model_validate(snapshot)
    view = build_field_read_model("case-spd-test", model)
    field = next(f for f in view["fields"] if f["bay_ref"] == "POLE-IN")
    kinds = [d["kind"] for d in field["canonical_model"]["base_model"]["primary_devices"]]
    assert "SURGE_ARRESTER" in kinds


def test_operation_is_deterministic() -> None:
    first = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    second = _add(_enm_with_field(), {"field_ref": "POLE-IN", **_binding(_ARRESTER_ID)})
    ref1 = _field_spec(first["snapshot"])["surge_arresters"][0]["device_ref"]
    ref2 = _field_spec(second["snapshot"])["surge_arresters"][0]["device_ref"]
    assert ref1 == ref2
