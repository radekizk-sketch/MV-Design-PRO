"""G-KOMP (GAP-1): add_shunt_compensator_sn — domknięcie łańcucha baterii SN.

Weryfikuje, że nowa operacja domenowa materializuje baterię kondensatorów do
kolekcji ENM `shunt_capacitors` (katalog-first), że walidacje działają, że
podgląd solvera liczy poprawnie z pierwszych zasad, oraz że istniejący mechanizm
PF (`_build_shunt_specs_from_snapshot`) konsumuje utworzony element bez zmian.
"""

from __future__ import annotations

import math

import pytest
from enm.assembler import _build_shunt_specs_from_snapshot
from enm.domain_operations import execute_domain_operation
from network_model.solvers.shunt_compensator_preview import (
    ShuntCompensatorPreviewInput,
    compute_shunt_compensator_preview,
)


def _enm_with_sn_bus(voltage_kv: float = 15.0) -> dict:
    return {"buses": [{"ref_id": "bus-sn-1", "name": "Szyna SN", "voltage_kv": voltage_kv}]}


def _binding(item_id: str) -> dict:
    return {
        "catalog_binding": {
            "catalog_namespace": "KOMPENSATOR_SN",
            "catalog_item_id": item_id,
            "catalog_item_version": "2024.1",
            "materialize": True,
        }
    }


def test_adds_shunt_capacitor_from_catalog() -> None:
    enm = _enm_with_sn_bus(15.0)
    result = execute_domain_operation(
        enm,
        "add_shunt_compensator_sn",
        {"bus_ref": "bus-sn-1", **_binding("KOMP_SN_1V2_15KV")},
    )
    assert not result.get("error"), result
    caps = result["snapshot"]["shunt_capacitors"]
    assert len(caps) == 1
    cap = caps[0]
    # Katalog-first: rated_* z pozycji katalogowej, nie z payloadu.
    assert cap["rated_mvar"] == pytest.approx(1.2)
    assert cap["rated_kv"] == pytest.approx(15.0)
    assert cap["bus_ref"] == "bus-sn-1"
    assert cap["status"] == "closed"
    assert cap["catalog_ref"] == "KOMP_SN_1V2_15KV"
    assert cap["catalog_namespace"] == "KOMPENSATOR_SN"


def test_created_element_is_consumed_by_power_flow_shunt_mechanism() -> None:
    enm = _enm_with_sn_bus(15.0)
    result = execute_domain_operation(
        enm,
        "add_shunt_compensator_sn",
        {"bus_ref": "bus-sn-1", **_binding("KOMP_SN_2V4_15KV")},
    )
    snapshot = result["snapshot"]
    base_mva = 100.0
    specs = _build_shunt_specs_from_snapshot(snapshot, base_mva)
    assert len(specs) == 1
    # b_pu = Q_rated / S_base (dodatnia susceptancja pojemnościowa).
    assert specs[0].b_pu == pytest.approx(2.4 / base_mva)
    assert specs[0].g_pu == 0.0


def test_open_status_is_preserved() -> None:
    enm = _enm_with_sn_bus(15.0)
    result = execute_domain_operation(
        enm,
        "add_shunt_compensator_sn",
        {"bus_ref": "bus-sn-1", "status": "open", **_binding("KOMP_SN_0V6_15KV")},
    )
    assert result["snapshot"]["shunt_capacitors"][0]["status"] == "open"
    # Otwarta bateria jest pomijana przez solver.
    assert _build_shunt_specs_from_snapshot(result["snapshot"], 100.0) == []


def test_missing_bus_is_rejected() -> None:
    result = execute_domain_operation(
        _enm_with_sn_bus(), "add_shunt_compensator_sn", _binding("KOMP_SN_1V2_15KV")
    )
    assert result.get("error")
    assert result.get("error_code") == "shunt.bus_missing"


def test_unknown_bus_is_rejected() -> None:
    result = execute_domain_operation(
        _enm_with_sn_bus(),
        "add_shunt_compensator_sn",
        {"bus_ref": "bus-nieistnieje", **_binding("KOMP_SN_1V2_15KV")},
    )
    assert result.get("error_code") == "shunt.bus_not_found"


def test_catalog_is_required() -> None:
    result = execute_domain_operation(
        _enm_with_sn_bus(), "add_shunt_compensator_sn", {"bus_ref": "bus-sn-1"}
    )
    assert result.get("error_code") == "shunt.catalog_required"


def test_voltage_mismatch_is_rejected() -> None:
    # Typ 20 kV na szynie 15 kV.
    result = execute_domain_operation(
        _enm_with_sn_bus(15.0),
        "add_shunt_compensator_sn",
        {"bus_ref": "bus-sn-1", **_binding("KOMP_SN_1V8_20KV")},
    )
    assert result.get("error_code") == "shunt.voltage_mismatch"


def test_preview_first_principles() -> None:
    res = compute_shunt_compensator_preview(
        ShuntCompensatorPreviewInput(rated_mvar=1.2, rated_kv=15.0)
    )
    q_var = 1.2e6
    u_v = 15_000.0
    assert res.susceptance_siemens == pytest.approx(q_var / (u_v * u_v))
    assert res.rated_current_a == pytest.approx(q_var / (math.sqrt(3.0) * u_v))


def test_preview_rejects_nonpositive() -> None:
    with pytest.raises(ValueError):
        compute_shunt_compensator_preview(
            ShuntCompensatorPreviewInput(rated_mvar=0.0, rated_kv=15.0)
        )
