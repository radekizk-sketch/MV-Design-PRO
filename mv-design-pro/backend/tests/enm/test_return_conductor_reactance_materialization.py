"""Regresja: reaktancja żyły powrotnej (P0.6, G-05) dociera z
``materialized_params`` do pól gałęzi w KAŻDYM z miejsc kopiujących ten
zestaw pól (KLASA NIE INSTANCJA — inwentarz: ``_apply_materialized_branch_
fields``/``_copy_split_segment_fields`` w ``enm/domain_operations.py``,
``_create_branch_from_data`` w ``enm/topology_ops.py``,
``_apply_materialized_branch_values`` w ``enm/catalog_completion.py``).

Materializacja katalogowa (KABEL_NN → ``materialized_params``) jest testowana
osobno w ``tests/network_model/test_lv_catalog_p02.py::
test_kabel_nn_materialization_end_to_end_carries_return_conductor``; ten plik
sprawdza WYŁĄCZNIE drugą połowę łańcucha (materialized_params → pole gałęzi).
"""

from __future__ import annotations

from enm.catalog_completion import _apply_materialized_branch_values
from enm.domain_operations import _apply_materialized_branch_fields, _copy_split_segment_fields
from enm.models import Cable
from enm.topology_ops import create_branch, create_node

_MATERIALIZED = {
    "r_ohm_per_km": 0.727,
    "x_ohm_per_km": 0.08,
    "return_conductor_cross_section_mm2": 25.0,
    "return_conductor_r_ohm_per_km_20c": 0.727,
    "return_conductor_x_ohm_per_km": 0.09,
}


def _cable(**overrides) -> Cable:
    base = {
        "ref_id": "c1",
        "name": "c1",
        "from_bus_ref": "a",
        "to_bus_ref": "b",
        "length_km": 0.05,
        "r_ohm_per_km": 0.727,
        "x_ohm_per_km": 0.08,
        "return_conductor_r_ohm_per_km_20c": 0.727,
        "return_conductor_x_ohm_per_km": 0.09,
    }
    base.update(overrides)
    return Cable(**base)


def test_apply_materialized_branch_fields_carries_return_conductor_x() -> None:
    """Ścieżka materializacja→snapshot (add_nn_cable_segment i pochodne)."""
    target: dict[str, object] = {"type": "cable"}
    _apply_materialized_branch_fields(target, {**_MATERIALIZED})
    assert target["return_conductor_x_ohm_per_km"] == 0.09
    assert target["return_conductor_r_ohm_per_km_20c"] == 0.727


def test_split_segment_preserves_return_conductor_x() -> None:
    """Ścieżka podziału odcinka (split_nn_segment) — obie połówki zachowują dane."""
    source = {**_MATERIALIZED, "conductor_material": "AL"}
    target: dict[str, object] = {}
    _copy_split_segment_fields(target, source)
    assert target["return_conductor_x_ohm_per_km"] == 0.09


def test_catalog_completion_applies_return_conductor_x_to_branch() -> None:
    """Ścieżka dopełnienia katalogowego (katalog_completion) — pole na obiekcie Cable."""
    branch = _cable(return_conductor_x_ohm_per_km=None)
    assert branch.return_conductor_x_ohm_per_km is None
    _apply_materialized_branch_values(branch, {**_MATERIALIZED})
    assert branch.return_conductor_x_ohm_per_km == 0.09


def test_topology_ops_create_branch_carries_return_conductor_x() -> None:
    """Ścieżka hydratacji gałęzi z surowych danych (topology_ops.create_branch,
    droga operacji domenowej add_nn_cable_segment i pochodnych)."""
    enm: dict = {
        "header": {
            "enm_version": "1.0",
            "name": "t",
            "revision": 1,
            "hash_sha256": "",
            "defaults": {"frequency_hz": 50.0, "unit_system": "SI"},
        },
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }
    result = create_node(enm, {"ref_id": "a", "name": "a", "voltage_kv": 0.4})
    assert result.success
    enm = result.enm
    result = create_node(enm, {"ref_id": "b", "name": "b", "voltage_kv": 0.4})
    assert result.success
    enm = result.enm

    result = create_branch(
        enm,
        {
            "ref_id": "c1",
            "name": "c1",
            "type": "cable",
            "from_bus_ref": "a",
            "to_bus_ref": "b",
            "length_km": 0.05,
            "r_ohm_per_km": 0.727,
            "x_ohm_per_km": 0.08,
            "return_conductor_r_ohm_per_km_20c": 0.727,
            "return_conductor_x_ohm_per_km": 0.09,
        },
    )
    assert result.success, result.issues
    branch = next(b for b in result.enm["branches"] if b["ref_id"] == "c1")
    assert branch["return_conductor_x_ohm_per_km"] == 0.09
