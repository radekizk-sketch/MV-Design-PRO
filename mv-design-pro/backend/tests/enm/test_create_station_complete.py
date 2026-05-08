"""R49: tests dla create_station_complete (Zasada 13 backend).

Atomowa operacja tworzenia/aktualizacji KOMPLETNEJ stacji SN — Substation
+ Bus(HV) + Bus(LV)? + Bay[] + Transformer? + Generator(DER)? w jednym wywołaniu.

Pokrycie:
  1. Walidacje (name, station_type, rated_voltage, bays, LINE_FULL,
     transformer-bez-LV, DER bez PCC)
  2. Build minimalna stacja (1 LINE_FULL bay)
  3. Build kompletna stacja (TR + nN + 3 bays)
  4. Build z DER PV/BESS/FW (3 connection variants)
  5. Update mode (cleanup + recreate)
  6. Affected refs w domain event
  7. Determinizm seed (ten sam name + kind → ten sam ref_id)
  8. Polskie etykiety w name pól
"""
from __future__ import annotations

from typing import Any

from enm.domain_operations import (
    create_station_complete,
    execute_domain_operation,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="create_station_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _minimal_payload(**overrides: Any) -> dict[str, Any]:
    base = {
        "station": {
            "name": "ST-001 Wschód",
            "registry_number": "587/24",
            "station_type": "rmu",
            "rated_voltage_kv": 15,
            "producer": "ABB SafePlus",
        },
        "bays": [
            {
                "id": "b-1",
                "role": "LINE_FULL",
                "cb_catalog_ref": "ABB VD4",
                "cb_icu_ka": 16,
                "ds_catalog_ref": "ABB DSG",
                "ct_catalog_ref": "ABB KOFA 200/5",
                "ct_ratio": "200/5",
                "has_vt": False,
                "has_surge_arrester": True,
                "has_fuse": False,
            },
        ],
        "transformer": None,
        "lv_side": None,
        "der": None,
        "protection_hints": [],
        "connections": {},
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Walidacje
# ---------------------------------------------------------------------------


def test_walidacja_brak_nazwy_blocker() -> None:
    payload = _minimal_payload()
    payload["station"]["name"] = ""
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.name_missing"


def test_walidacja_typ_stacji_nieprawidlowy() -> None:
    payload = _minimal_payload()
    payload["station"]["station_type"] = "invalid_type"
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.station_type_invalid"


def test_walidacja_napiecie_zerowe() -> None:
    payload = _minimal_payload()
    payload["station"]["rated_voltage_kv"] = 0
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.rated_voltage_invalid"


def test_walidacja_bays_pusty_blocker() -> None:
    payload = _minimal_payload()
    payload["bays"] = []
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.bays_missing"


def test_walidacja_brak_LINE_FULL_blocker() -> None:
    payload = _minimal_payload()
    payload["bays"] = [
        {"id": "b-1", "role": "MEASUREMENT", "cb_catalog_ref": "CB", "cb_icu_ka": 16,
         "ds_catalog_ref": "", "ct_catalog_ref": "", "ct_ratio": "",
         "has_vt": True, "has_surge_arrester": False, "has_fuse": False},
    ]
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.no_inflow_bay"


def test_walidacja_transformator_bez_lv_blocker() -> None:
    payload = _minimal_payload()
    payload["transformer"] = {"catalog_ref": "ABB", "sn_kva": 630, "vector_group": "Dyn5", "uk_percent": 6}
    payload["lv_side"] = None
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.transformer_without_lv"


def test_walidacja_DER_bez_PCC_blocker() -> None:
    payload = _minimal_payload()
    payload["der"] = {"kind": "PV", "sn_kva": 50, "connection_variant": "lv_behind_tr", "pcc_ref": ""}
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.der_pcc_missing"


def test_walidacja_DER_kind_nieprawidlowy() -> None:
    payload = _minimal_payload()
    payload["der"] = {"kind": "INVALID", "sn_kva": 50, "connection_variant": "lv_behind_tr", "pcc_ref": "bus-x"}
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.der_kind_invalid"


def test_walidacja_DER_variant_nieprawidlowy() -> None:
    payload = _minimal_payload()
    payload["der"] = {"kind": "PV", "sn_kva": 50, "connection_variant": "INVALID", "pcc_ref": "bus-x"}
    result = create_station_complete(_empty_enm(), payload)
    assert result.get("error_code") == "station.create.der_variant_invalid"


# ---------------------------------------------------------------------------
# Build hierarchii
# ---------------------------------------------------------------------------


def test_minimalna_stacja_substation_plus_hv_bus_plus_1_bay() -> None:
    result = create_station_complete(_empty_enm(), _minimal_payload())
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    assert len(snap["substations"]) == 1
    assert len(snap["bays"]) == 1
    assert len(snap["buses"]) == 1
    assert snap["substations"][0]["name"] == "ST-001 Wschód"
    assert snap["substations"][0]["station_type"] == "mv_lv"  # rmu → mv_lv
    assert snap["substations"][0]["bus_refs"] == [snap["buses"][0]["ref_id"]]
    assert snap["substations"][0]["transformer_refs"] == []
    assert snap["bays"][0]["bay_role"] == "OUT"  # LINE_FULL → OUT


def test_kompletna_stacja_substation_plus_2_buses_plus_3_bays_plus_TR() -> None:
    payload = _minimal_payload(
        bays=[
            {"id": "b-1", "role": "LINE_FULL", "cb_catalog_ref": "CB1", "cb_icu_ka": 16,
             "ds_catalog_ref": "DS1", "ct_catalog_ref": "CT1", "ct_ratio": "200/5",
             "has_vt": False, "has_surge_arrester": True, "has_fuse": False},
            {"id": "b-2", "role": "TR_FULL", "cb_catalog_ref": "CB2", "cb_icu_ka": 16,
             "ds_catalog_ref": "", "ct_catalog_ref": "CT2", "ct_ratio": "100/5",
             "has_vt": False, "has_surge_arrester": True, "has_fuse": True},
            {"id": "b-3", "role": "MEASUREMENT", "cb_catalog_ref": "CB3", "cb_icu_ka": 25,
             "ds_catalog_ref": "DS3", "ct_catalog_ref": "", "ct_ratio": "",
             "has_vt": True, "has_surge_arrester": False, "has_fuse": False},
        ],
        transformer={"catalog_ref": "ABB-TUMETIC-630", "sn_kva": 630, "vector_group": "Dyn5", "uk_percent": 6},
        lv_side={"un_v": 400, "scheme_kind": "tns"},
    )
    result = create_station_complete(_empty_enm(), payload)
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    assert len(snap["substations"]) == 1
    assert len(snap["bays"]) == 3
    assert len(snap["buses"]) == 2  # HV + LV
    assert len(snap["transformers"]) == 1
    sub = snap["substations"][0]
    assert sub["meta"]["bay_count"] == 3
    assert sub["meta"]["has_transformer"] is True
    assert sub["meta"]["has_lv_side"] is True
    assert len(sub["bus_refs"]) == 2
    assert len(sub["transformer_refs"]) == 1
    tr = snap["transformers"][0]
    assert tr["sn_mva"] == 0.63
    assert tr["uhv_kv"] == 15
    assert tr["ulv_kv"] == 0.4
    assert tr["uk_percent"] == 6
    assert tr["vector_group"] == "Dyn5"


def test_DER_PV_lv_behind_tr_generator_na_LV_bus() -> None:
    payload = _minimal_payload(
        transformer={"catalog_ref": "ABB", "sn_kva": 630, "vector_group": "Dyn5", "uk_percent": 6},
        lv_side={"un_v": 400, "scheme_kind": "tns"},
        der={"kind": "PV", "sn_kva": 100, "connection_variant": "lv_behind_tr", "pcc_ref": "station-x-bus-lv",
             "inverter_catalog_ref": "SMA-Tripower-60"},
    )
    result = create_station_complete(_empty_enm(), payload)
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    assert len(snap["generators"]) == 1
    gen = snap["generators"][0]
    assert gen["gen_type"] == "pv_inverter"
    assert gen["connection_variant"] == "LV_BEHIND_STATION_TRANSFORMER"
    assert gen["p_mw"] == 0.1
    # bus_ref dla lv_behind_tr → LV bus stacji (bo hasLvSide=true)
    lv_bus = next(b for b in snap["buses"] if b["voltage_kv"] == 0.4)
    assert gen["bus_ref"] == lv_bus["ref_id"]


def test_DER_BESS_dedicated_mv_generator_na_HV_bus() -> None:
    payload = _minimal_payload(
        der={"kind": "BESS", "sn_kva": 200, "connection_variant": "dedicated_mv", "pcc_ref": "external-pcc"},
    )
    result = create_station_complete(_empty_enm(), payload)
    snap = result["snapshot"]
    gen = snap["generators"][0]
    assert gen["gen_type"] == "bess"
    assert gen["connection_variant"] == "DEDICATED_MV_CONNECTION"
    assert gen["bus_ref"] == "external-pcc"


def test_DER_FW_source_station() -> None:
    payload = _minimal_payload(
        der={"kind": "FW", "sn_kva": 1000, "connection_variant": "source_station", "pcc_ref": "external-bus-1"},
    )
    result = create_station_complete(_empty_enm(), payload)
    snap = result["snapshot"]
    gen = snap["generators"][0]
    assert gen["gen_type"] == "wind_inverter"
    assert gen["connection_variant"] == "SOURCE_CONNECTION_STATION"


# ---------------------------------------------------------------------------
# Mode = update (cleanup + recreate)
# ---------------------------------------------------------------------------


def test_update_mode_cleanup_starych_bays() -> None:
    """Najpierw create z 3 bays, potem update z 1 bay → 1 bay w wyniku."""
    create_payload = _minimal_payload(
        bays=[
            {"id": "b-1", "role": "LINE_FULL", "cb_catalog_ref": "CB1", "cb_icu_ka": 16,
             "ds_catalog_ref": "", "ct_catalog_ref": "CT1", "ct_ratio": "200/5",
             "has_vt": False, "has_surge_arrester": True, "has_fuse": False},
            {"id": "b-2", "role": "LINE_FULL", "cb_catalog_ref": "CB2", "cb_icu_ka": 16,
             "ds_catalog_ref": "", "ct_catalog_ref": "CT2", "ct_ratio": "200/5",
             "has_vt": False, "has_surge_arrester": True, "has_fuse": False},
            {"id": "b-3", "role": "LINE_FULL", "cb_catalog_ref": "CB3", "cb_icu_ka": 16,
             "ds_catalog_ref": "", "ct_catalog_ref": "CT3", "ct_ratio": "200/5",
             "has_vt": False, "has_surge_arrester": True, "has_fuse": False},
        ],
    )
    after_create = create_station_complete(_empty_enm(), create_payload)
    snap = after_create["snapshot"]
    assert len(snap["bays"]) == 3
    station_ref = snap["substations"][0]["ref_id"]

    # Update z 1 bay
    update_payload = _minimal_payload()
    update_payload["station"]["ref_id"] = station_ref
    update_payload["station"]["name"] = "ST-001 Wschód v2"
    after_update = create_station_complete(snap, update_payload)
    snap2 = after_update["snapshot"]
    assert len(snap2["substations"]) == 1
    assert snap2["substations"][0]["name"] == "ST-001 Wschód v2"
    assert len(snap2["bays"]) == 1


def test_update_mode_zachowuje_inne_stacje() -> None:
    snap = _empty_enm()
    # Stacja A
    snap = create_station_complete(snap, _minimal_payload())["snapshot"]
    station_a_ref = snap["substations"][0]["ref_id"]
    # Stacja B (inna nazwa → inny ref_id)
    payload_b = _minimal_payload()
    payload_b["station"]["name"] = "ST-002 Zachód"
    snap = create_station_complete(snap, payload_b)["snapshot"]
    assert len(snap["substations"]) == 2

    # Update Stacji A
    update_payload = _minimal_payload()
    update_payload["station"]["ref_id"] = station_a_ref
    update_payload["station"]["producer"] = "Schneider RM6"
    snap = create_station_complete(snap, update_payload)["snapshot"]
    assert len(snap["substations"]) == 2  # Stacja B nieruszona


# ---------------------------------------------------------------------------
# Determinizm i events
# ---------------------------------------------------------------------------


def test_determinizm_ref_id_z_seed() -> None:
    """Ten sam name + kind + brak ref_id → ten sam deterministic ref_id."""
    result1 = create_station_complete(_empty_enm(), _minimal_payload())
    result2 = create_station_complete(_empty_enm(), _minimal_payload())
    ref1 = result1["snapshot"]["substations"][0]["ref_id"]
    ref2 = result2["snapshot"]["substations"][0]["ref_id"]
    assert ref1 == ref2


def test_event_STATION_CREATED_COMPLETE_z_affected_refs() -> None:
    payload = _minimal_payload(
        transformer={"catalog_ref": "ABB", "sn_kva": 630, "vector_group": "Dyn5", "uk_percent": 6},
        lv_side={"un_v": 400, "scheme_kind": "tns"},
    )
    result = create_station_complete(_empty_enm(), payload)
    events = result.get("domain_events", [])
    assert any(e["event_type"] == "STATION_CREATED_COMPLETE" for e in events)
    sc_event = next(e for e in events if e["event_type"] == "STATION_CREATED_COMPLETE")
    affected = sc_event["affected_object_refs"]
    snap = result["snapshot"]
    assert snap["substations"][0]["ref_id"] in affected
    assert snap["bays"][0]["ref_id"] in affected
    assert snap["transformers"][0]["ref_id"] in affected
    # Buses obecne
    assert any(b["ref_id"] in affected for b in snap["buses"])


def test_polskie_etykiety_w_nazwach() -> None:
    result = create_station_complete(_empty_enm(), _minimal_payload())
    snap = result["snapshot"]
    assert "szyna SN" in snap["buses"][0]["name"]
    assert "pole LINE_FULL" in snap["bays"][0]["name"]


# ---------------------------------------------------------------------------
# Connections + protection hints
# ---------------------------------------------------------------------------


def test_connections_zapisane_w_substation_meta() -> None:
    payload = _minimal_payload(
        connections={"sn_input_segment_ref": "seg-gpz-st1", "sn_output_segment_ref": "seg-st1-st2", "is_nop_point": True},
    )
    result = create_station_complete(_empty_enm(), payload)
    sub = result["snapshot"]["substations"][0]
    assert sub["meta"]["sn_input_segment_ref"] == "seg-gpz-st1"
    assert sub["meta"]["sn_output_segment_ref"] == "seg-st1-st2"
    assert sub["meta"]["is_nop_point"] is True


def test_protection_hint_zapisany_w_bay_meta() -> None:
    payload = _minimal_payload(
        protection_hints=[{"bay_id": "b-1", "relay_type": "overcurrent", "ir_nominal_a": 200}],
    )
    result = create_station_complete(_empty_enm(), payload)
    bay = result["snapshot"]["bays"][0]
    assert bay["meta"]["protection_relay_type"] == "overcurrent"
    assert bay["meta"]["protection_ir_nominal_a"] == 200


# ---------------------------------------------------------------------------
# Dispatch przez execute_domain_operation
# ---------------------------------------------------------------------------


def test_dispatch_create_station_complete() -> None:
    result = execute_domain_operation(_empty_enm(), "create_station_complete", _minimal_payload())
    assert not result.get("error"), result.get("error")
    assert result["snapshot"]["substations"][0]["name"] == "ST-001 Wschód"


def test_dispatch_update_station_complete() -> None:
    """update_station_complete deleguje do tego samego handlera."""
    snap = create_station_complete(_empty_enm(), _minimal_payload())["snapshot"]
    station_ref = snap["substations"][0]["ref_id"]
    update_payload = _minimal_payload()
    update_payload["station"]["ref_id"] = station_ref
    update_payload["station"]["name"] = "Zaktualizowana nazwa"
    result = execute_domain_operation(snap, "update_station_complete", update_payload)
    assert not result.get("error"), result.get("error")
    assert result["snapshot"]["substations"][0]["name"] == "Zaktualizowana nazwa"
