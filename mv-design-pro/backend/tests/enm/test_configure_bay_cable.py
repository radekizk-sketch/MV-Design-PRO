"""R50: tests dla configure_bay + configure_cable.

Partial update operations dla wzorca edycji per-element (E-11 BayEditor
i E-12 LineSegmentInline). Frontend wywołuje z fallback patchSnapshot.

Pokrycie:
  configure_bay (10 testów):
    1. Walidacja bay_ref required + not_found
    2. Walidacja bay_role invalid
    3. Update meta partial (tylko podane pola)
    4. Update bay_role + meta razem
    5. has_vt/has_surge_arrester/has_fuse jako bool
    6. BAY_UPDATED event z affected_object_refs
    7. Polish audit message

  configure_cable (10 testów):
    1. Walidacja segment_ref required + not_found
    2. Walidacja length_m > 0
    3. Update meta partial (cable_catalog_ref, length, R/X/Imax)
    4. Sync catalog_ref na branch.catalog_ref jeśli wskazany
    5. CABLE_UPDATED event
    6. Polish audit message
"""
from __future__ import annotations

from typing import Any

from enm.domain_operations import (
    configure_bay,
    configure_cable,
    create_station_complete,
    execute_domain_operation,
)
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="r50_test", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _enm_with_station() -> tuple[dict[str, Any], str, str]:
    """ENM z 1 stacją + 1 bay. Zwraca (snap, bay_ref, station_ref)."""
    snap = _empty_enm()
    payload = {
        "station": {
            "name": "ST-Test",
            "registry_number": "1/24",
            "station_type": "rmu",
            "rated_voltage_kv": 15,
            "producer": "ABB",
        },
        "bays": [
            {"id": "b-1", "role": "LINE_FULL", "cb_catalog_ref": "OLD-CB", "cb_icu_ka": 16,
             "ds_catalog_ref": "", "ct_catalog_ref": "OLD-CT", "ct_ratio": "100/5",
             "has_vt": False, "has_surge_arrester": True, "has_fuse": False},
        ],
    }
    after = create_station_complete(snap, payload)
    snap = after["snapshot"]
    bay = snap["bays"][0]
    return snap, bay["ref_id"], snap["substations"][0]["ref_id"]


def _enm_with_branch() -> tuple[dict[str, Any], str]:
    """ENM z 1 branchem (manual setup)."""
    snap = _empty_enm()
    snap.setdefault("buses", []).extend([
        {"ref_id": "bus-1", "name": "Bus1", "voltage_kv": 15, "phase_system": "3ph",
         "tags": [], "meta": {}},
        {"ref_id": "bus-2", "name": "Bus2", "voltage_kv": 15, "phase_system": "3ph",
         "tags": [], "meta": {}},
    ])
    branch_ref = "branch-test-1"
    snap.setdefault("branches", []).append({
        "ref_id": branch_ref,
        "name": "Odcinek testowy",
        "type": "cable",
        "from_bus_ref": "bus-1",
        "to_bus_ref": "bus-2",
        "status": "closed",
        "length_km": 0.1,
        "r_per_km_ohm": 0.5,
        "x_per_km_ohm": 0.1,
        "ampacity_a": 200,
        "tags": [],
        "meta": {},
    })
    return snap, branch_ref


# ---------------------------------------------------------------------------
# configure_bay
# ---------------------------------------------------------------------------


class TestConfigureBay:
    def test_walidacja_bay_ref_missing(self) -> None:
        result = configure_bay(_empty_enm(), {})
        assert result.get("error_code") == "bay.configure.bay_ref_missing"

    def test_walidacja_bay_not_found(self) -> None:
        result = configure_bay(_empty_enm(), {"bay_ref": "nonexistent"})
        assert result.get("error_code") == "bay.configure.bay_not_found"

    def test_walidacja_role_invalid(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = configure_bay(snap, {"bay_ref": bay_ref, "bay_role": "INVALID"})
        assert result.get("error_code") == "bay.configure.role_invalid"

    def test_update_partial_tylko_cb(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = configure_bay(snap, {"bay_ref": bay_ref, "cb_catalog_ref": "NEW-CB"})
        assert not result.get("error")
        bay = next(b for b in result["snapshot"]["bays"] if b["ref_id"] == bay_ref)
        assert bay["meta"]["cb_catalog_ref"] == "NEW-CB"
        # Inne pola zachowane
        assert bay["meta"]["ct_catalog_ref"] == "OLD-CT"

    def test_update_role_zmienia_bay_role(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = configure_bay(snap, {"bay_ref": bay_ref, "bay_role": "TR_FULL"})
        bay = next(b for b in result["snapshot"]["bays"] if b["ref_id"] == bay_ref)
        assert bay["bay_role"] == "TR"  # TR_FULL → TR

    def test_update_role_oraz_meta_razem(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = configure_bay(snap, {
            "bay_ref": bay_ref,
            "bay_role": "MEASUREMENT",
            "has_vt": True,
            "ct_catalog_ref": "NEW-CT",
        })
        bay = next(b for b in result["snapshot"]["bays"] if b["ref_id"] == bay_ref)
        assert bay["bay_role"] == "MEASUREMENT"
        assert bay["meta"]["has_vt"] is True
        assert bay["meta"]["ct_catalog_ref"] == "NEW-CT"

    def test_bool_fields_konwersja(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = configure_bay(snap, {"bay_ref": bay_ref, "has_fuse": 1, "has_surge_arrester": 0})
        bay = next(b for b in result["snapshot"]["bays"] if b["ref_id"] == bay_ref)
        assert bay["meta"]["has_fuse"] is True
        assert bay["meta"]["has_surge_arrester"] is False

    def test_event_BAY_UPDATED(self) -> None:
        snap, bay_ref, station_ref = _enm_with_station()
        result = configure_bay(snap, {"bay_ref": bay_ref, "cb_catalog_ref": "NEW"})
        events = result.get("domain_events", [])
        bay_event = next((e for e in events if e["event_type"] == "BAY_UPDATED"), None)
        assert bay_event is not None
        assert bay_event["element_id"] == bay_ref
        assert bay_ref in bay_event["affected_object_refs"]
        assert station_ref in bay_event["affected_object_refs"]

    def test_polish_audit(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = configure_bay(snap, {"bay_ref": bay_ref, "cb_catalog_ref": "NEW"})
        audit = result.get("audit_trail", [])
        assert any("Zaktualizowano pole SN" in a["action"] for a in audit)

    def test_dispatch_configure_bay(self) -> None:
        snap, bay_ref, _ = _enm_with_station()
        result = execute_domain_operation(snap, "configure_bay", {"bay_ref": bay_ref, "cb_catalog_ref": "NEW"})
        assert not result.get("error")


# ---------------------------------------------------------------------------
# configure_cable
# ---------------------------------------------------------------------------


class TestConfigureCable:
    def test_walidacja_segment_ref_missing(self) -> None:
        result = configure_cable(_empty_enm(), {})
        assert result.get("error_code") == "cable.configure.segment_ref_missing"

    def test_walidacja_segment_not_found(self) -> None:
        result = configure_cable(_empty_enm(), {"segment_ref": "nonexistent"})
        assert result.get("error_code") == "cable.configure.segment_not_found"

    def test_walidacja_length_zero(self) -> None:
        snap, branch_ref = _enm_with_branch()
        result = configure_cable(snap, {"segment_ref": branch_ref, "length_m": 0})
        assert result.get("error_code") == "cable.configure.length_invalid"

    def test_walidacja_length_negative(self) -> None:
        snap, branch_ref = _enm_with_branch()
        result = configure_cable(snap, {"segment_ref": branch_ref, "length_m": -10})
        assert result.get("error_code") == "cable.configure.length_invalid"

    def test_update_meta_partial(self) -> None:
        snap, branch_ref = _enm_with_branch()
        result = configure_cable(snap, {
            "segment_ref": branch_ref,
            "cable_catalog_ref": "XUHAKXS-3x120",
            "length_m": 450,
            "installation": "ground",
            "temperature_c": 35,
            "r_ohm": 0.114,
            "x_ohm": 0.055,
            "imax_a": 282,
        })
        assert not result.get("error")
        branch = next(b for b in result["snapshot"]["branches"] if b["ref_id"] == branch_ref)
        assert branch["meta"]["cable_catalog_ref"] == "XUHAKXS-3x120"
        assert branch["meta"]["length_m"] == 450
        assert branch["meta"]["installation"] == "ground"
        assert branch["meta"]["temperature_c"] == 35
        assert branch["meta"]["r_ohm"] == 0.114
        assert branch["meta"]["x_ohm"] == 0.055
        assert branch["meta"]["imax_a"] == 282

    def test_update_sync_catalog_ref(self) -> None:
        """Gdy podany cable_catalog_ref → branch.catalog_ref też ustawiany."""
        snap, branch_ref = _enm_with_branch()
        result = configure_cable(snap, {
            "segment_ref": branch_ref,
            "cable_catalog_ref": "XUHAKXS-3x240",
        })
        branch = next(b for b in result["snapshot"]["branches"] if b["ref_id"] == branch_ref)
        assert branch["catalog_ref"] == "XUHAKXS-3x240"

    def test_event_CABLE_UPDATED(self) -> None:
        snap, branch_ref = _enm_with_branch()
        result = configure_cable(snap, {"segment_ref": branch_ref, "length_m": 200})
        events = result.get("domain_events", [])
        cable_event = next((e for e in events if e["event_type"] == "CABLE_UPDATED"), None)
        assert cable_event is not None
        assert branch_ref in cable_event["affected_object_refs"]

    def test_polish_audit(self) -> None:
        snap, branch_ref = _enm_with_branch()
        result = configure_cable(snap, {"segment_ref": branch_ref, "length_m": 200})
        audit = result.get("audit_trail", [])
        assert any("Zaktualizowano odcinek SN" in a["action"] for a in audit)

    def test_dispatch_configure_cable(self) -> None:
        snap, branch_ref = _enm_with_branch()
        result = execute_domain_operation(snap, "configure_cable", {
            "segment_ref": branch_ref,
            "cable_catalog_ref": "XUHAKXS-3x120",
            "length_m": 450,
        })
        assert not result.get("error")
