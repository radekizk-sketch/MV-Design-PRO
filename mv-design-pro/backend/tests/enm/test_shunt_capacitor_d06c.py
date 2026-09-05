"""D-06c: ShuntCapacitor as a first-class ENM element.

Covers:
- ENM -> ShuntSpec mapping (b_pu = Q_rated / S_base, capacitor => +jB).
- End-to-end power flow effect: a capacitor at a bus RAISES |V| (injects Q).
- Determinism of the mapping.
- Catalog binding (KOMPENSATOR_SN namespace + materialization).
- Validator rules (bus_ref exists, rated_mvar>0, rated_kv consistency).
- The frozen Result API / solver path is exercised through the EXISTING shunt
  mechanism (no solver change).
"""

from __future__ import annotations

import math

import pytest
from enm.canonical_analysis import (
    _build_shunt_specs_from_snapshot,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.hash import compute_enm_hash, compute_semantic_hash
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from enm.validator import ENMValidator

from tests.catalog_test_helpers import gpz_source_record

BASE_MVA = 100.0


def _enm_payload_with_inductive_load(name: str) -> dict:
    """Slack source on b1 (15 kV), line b1->b2, inductive load on b2.

    The inductive load (q_mvar > 0) depresses |V| at b2 below 1.0 pu, leaving
    room for a shunt capacitor to raise it.
    """
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b1",
                "name": "B1",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b2",
                "name": "B2",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000010",
                "ref_id": "ln-1",
                "name": "Linia b1-b2",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b1",
                "to_bus_ref": "b2",
                "status": "closed",
                "type": "line_overhead",
                "length_km": 10.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.4,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            }
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b1",
                    voltage_kv=15.0,
                    sk3_mva=200.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000020",
                "ref_id": "load-1",
                "name": "Odbior b2",
                "tags": [],
                "meta": {},
                "bus_ref": "b2",
                "p_mw": 3.0,
                "q_mvar": 2.0,
                "model": "pq",
            }
        ],
        "generators": [],
        "shunt_capacitors": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _capacitor_record(
    *,
    ref_id: str = "cap-1",
    bus_ref: str = "b2",
    rated_mvar: float = 2.0,
    rated_kv: float = 15.0,
    status: str = "closed",
) -> dict:
    return {
        "id": "00000000-0000-0000-0000-000000000030",
        "ref_id": ref_id,
        "name": "Bateria kondensatorow b2",
        "tags": [],
        "meta": {},
        "bus_ref": bus_ref,
        "rated_mvar": rated_mvar,
        "rated_kv": rated_kv,
        "status": status,
        "catalog_ref": "KOMP_SN_2V4_15KV",
        "catalog_namespace": "KOMPENSATOR_SN",
        "parameter_source": "CATALOG",
        "source_mode": "KATALOG",
    }


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _voltage_pu_at(result, ref_id: str) -> float:
    """Extract |V| [pu] at a bus from the canonical PF result_v1 payload."""
    assert result.raw_result is not None
    result_v1 = result.raw_result["result_v1"]
    # node ids in result_v1 are the graph uuid5(ref_id) ids
    from enm.canonical_analysis import _graph_id_from_ref

    node_id = _graph_id_from_ref(ref_id)
    buses = result_v1["bus_results"]
    by_id = {b["bus_id"]: b for b in buses}
    assert node_id in by_id, f"{ref_id} ({node_id}) not in {list(by_id)}"
    return float(by_id[node_id]["v_pu"])


# ---------------------------------------------------------------------------
# Mapping: ENM ShuntCapacitor -> ShuntSpec
# ---------------------------------------------------------------------------


def test_build_shunt_specs_b_pu_from_first_principles():
    """b_pu = Q_rated / S_base; capacitor => positive susceptance."""
    payload = _enm_payload_with_inductive_load("map")
    payload["shunt_capacitors"] = [_capacitor_record(rated_mvar=2.4, rated_kv=15.0)]
    specs = _build_shunt_specs_from_snapshot(payload, BASE_MVA)
    assert len(specs) == 1
    spec = specs[0]
    assert spec.g_pu == 0.0
    assert spec.b_pu > 0.0
    assert math.isclose(spec.b_pu, 2.4 / BASE_MVA, rel_tol=1e-12)

    from enm.canonical_analysis import _graph_id_from_ref

    assert spec.node_id == _graph_id_from_ref("b2")


def test_build_shunt_specs_skips_open_bank():
    payload = _enm_payload_with_inductive_load("map-open")
    payload["shunt_capacitors"] = [_capacitor_record(status="open")]
    specs = _build_shunt_specs_from_snapshot(payload, BASE_MVA)
    assert specs == []


def test_build_shunt_specs_is_deterministic():
    payload = _enm_payload_with_inductive_load("map-det")
    payload["shunt_capacitors"] = [
        _capacitor_record(ref_id="cap-a", rated_mvar=1.2),
        {
            **_capacitor_record(ref_id="cap-b", rated_mvar=0.6),
            "id": "00000000-0000-0000-0000-000000000031",
        },
    ]
    first = _build_shunt_specs_from_snapshot(payload, BASE_MVA)
    second = _build_shunt_specs_from_snapshot(payload, BASE_MVA)
    assert [(s.node_id, s.b_pu) for s in first] == [(s.node_id, s.b_pu) for s in second]


def test_build_shunt_specs_missing_rated_mvar_raises():
    payload = _enm_payload_with_inductive_load("map-bad")
    bad = _capacitor_record()
    bad["rated_mvar"] = 0.0
    payload["shunt_capacitors"] = [bad]
    with pytest.raises(ValueError, match="rated_mvar"):
        _build_shunt_specs_from_snapshot(payload, BASE_MVA)


# ---------------------------------------------------------------------------
# Power flow effect (key acceptance): capacitor raises |V|
# ---------------------------------------------------------------------------


def test_power_flow_capacitor_raises_bus_voltage():
    """KEY ACCEPTANCE: a shunt capacitor at a bus increases |V| there.

    The capacitor adds +jB to the Y_bus diagonal (existing solver mechanism),
    so it injects reactive power Q = B·|V|² into the bus and raises |V|. The
    effect must be monotonic in the bank rating (larger Q_rated => higher |V|).
    """
    case_no_cap = "pf-no-cap"
    case_small = "pf-cap-small"
    case_large = "pf-cap-large"

    set_enm(
        case_no_cap,
        EnergyNetworkModel.model_validate(_enm_payload_with_inductive_load("Bez kompensacji")),
    )
    payload_small = _enm_payload_with_inductive_load("Kompensacja 2 Mvar")
    payload_small["shunt_capacitors"] = [_capacitor_record(rated_mvar=2.0, rated_kv=15.0)]
    set_enm(case_small, EnergyNetworkModel.model_validate(payload_small))

    payload_large = _enm_payload_with_inductive_load("Kompensacja 5 Mvar")
    payload_large["shunt_capacitors"] = [_capacitor_record(rated_mvar=5.0, rated_kv=15.0)]
    set_enm(case_large, EnergyNetworkModel.model_validate(payload_large))

    run_no_cap = execute_run(
        create_run(case_id=case_no_cap, klucz_twin=case_no_cap, analysis_type="PF").id
    )
    run_small = execute_run(
        create_run(case_id=case_small, klucz_twin=case_small, analysis_type="PF").id
    )
    run_large = execute_run(
        create_run(case_id=case_large, klucz_twin=case_large, analysis_type="PF").id
    )

    assert run_no_cap.status == "FINISHED", run_no_cap.error_message
    assert run_small.status == "FINISHED", run_small.error_message
    assert run_large.status == "FINISHED", run_large.error_message

    v_no_cap = _voltage_pu_at(run_no_cap, "b2")
    v_small = _voltage_pu_at(run_small, "b2")
    v_large = _voltage_pu_at(run_large, "b2")

    # F9.8: absolute assertion — the uncompensated bus MUST sit below 1.0 pu
    # (the inductive load depresses |V|, per the docstring/fixture intent).
    # Before F9.8 this held only relatively (monotonicity below), which passed
    # even with the reversed-sign bug (v_no_cap was ~1.0703, ABOVE 1.0, because
    # the load entered the solver as generation and RAISED the bus voltage).
    assert v_no_cap < 1.0, f"expected inductive load to depress |V| below 1.0, got {v_no_cap}"
    # Capacitor raises |V|, and a larger bank raises it more (monotonic in Q).
    assert v_small > v_no_cap
    assert v_large > v_small
    # The slack (source) bus is held at 1.0 pu and is unaffected.
    assert math.isclose(_voltage_pu_at(run_small, "b1"), 1.0, abs_tol=1e-6)
    # Reportability unchanged (frozen Result API path).
    assert run_small.raw_result["reporting_status"] == "reportable"


def test_power_flow_open_capacitor_has_no_effect():
    case_open = "pf-open-cap"
    case_none = "pf-none-cap"

    set_enm(
        case_none,
        EnergyNetworkModel.model_validate(_enm_payload_with_inductive_load("Bez baterii")),
    )
    payload_open = _enm_payload_with_inductive_load("Bateria otwarta")
    payload_open["shunt_capacitors"] = [_capacitor_record(status="open")]
    set_enm(case_open, EnergyNetworkModel.model_validate(payload_open))

    run_none = execute_run(
        create_run(case_id=case_none, klucz_twin=case_none, analysis_type="PF").id
    )
    run_open = execute_run(
        create_run(case_id=case_open, klucz_twin=case_open, analysis_type="PF").id
    )

    assert run_none.status == "FINISHED", run_none.error_message
    assert run_open.status == "FINISHED", run_open.error_message
    assert math.isclose(
        _voltage_pu_at(run_none, "b2"), _voltage_pu_at(run_open, "b2"), rel_tol=1e-9
    )


def test_power_flow_is_deterministic_with_capacitor():
    payload = _enm_payload_with_inductive_load("Determinizm")
    payload["shunt_capacitors"] = [_capacitor_record(rated_mvar=2.0)]

    set_enm("pf-det-1", EnergyNetworkModel.model_validate(payload))
    set_enm("pf-det-2", EnergyNetworkModel.model_validate(payload))

    run1 = execute_run(create_run(case_id="pf-det-1", klucz_twin="pf-det-1", analysis_type="PF").id)
    run2 = execute_run(create_run(case_id="pf-det-2", klucz_twin="pf-det-2", analysis_type="PF").id)

    assert math.isclose(
        _voltage_pu_at(run1, "b2"), _voltage_pu_at(run2, "b2"), rel_tol=0.0, abs_tol=1e-12
    )


# ---------------------------------------------------------------------------
# Catalog binding (KOMPENSATOR_SN)
# ---------------------------------------------------------------------------


def test_catalog_namespace_and_contract_present():
    from network_model.catalog.types import (
        MATERIALIZATION_CONTRACTS,
        CatalogNamespace,
    )

    assert CatalogNamespace.KOMPENSATOR_SN.value == "KOMPENSATOR_SN"
    contract = MATERIALIZATION_CONTRACTS[CatalogNamespace.KOMPENSATOR_SN.value]
    assert "rated_mvar" in contract.solver_fields
    assert "rated_kv" in contract.solver_fields


def test_catalog_materialization_of_shunt_capacitor():
    from network_model.catalog.materialization import materialize_catalog_binding
    from network_model.catalog.repository import get_default_mv_catalog
    from network_model.catalog.types import CatalogBinding

    catalog = get_default_mv_catalog()
    binding = CatalogBinding(
        catalog_namespace="KOMPENSATOR_SN",
        catalog_item_id="KOMP_SN_2V4_15KV",
        catalog_item_version="2.0",
        materialize=True,
    )
    result = materialize_catalog_binding(binding, catalog)
    assert result.success, result.error_message_pl
    assert result.solver_fields["rated_mvar"] == 2.4
    assert result.solver_fields["rated_kv"] == 15.0


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------


def test_validator_accepts_consistent_capacitor():
    payload = _enm_payload_with_inductive_load("walidacja-ok")
    payload["shunt_capacitors"] = [_capacitor_record(rated_mvar=2.0, rated_kv=15.0)]
    enm = EnergyNetworkModel.model_validate(payload)
    result = ENMValidator().validate(enm)
    codes = {i.code for i in result.issues}
    assert "E040" not in codes
    assert "E041" not in codes
    assert "E042" not in codes
    assert "W040" not in codes


def test_validator_blocks_missing_bus_ref():
    payload = _enm_payload_with_inductive_load("walidacja-bus")
    payload["shunt_capacitors"] = [_capacitor_record(bus_ref="nope")]
    enm = EnergyNetworkModel.model_validate(payload)
    result = ENMValidator().validate(enm)
    assert any(i.code == "E040" for i in result.issues)
    assert result.status == "FAIL"


def test_validator_blocks_non_positive_rated_mvar():
    payload = _enm_payload_with_inductive_load("walidacja-mvar")
    bad = _capacitor_record()
    bad["rated_mvar"] = 0.0
    payload["shunt_capacitors"] = [bad]
    enm = EnergyNetworkModel.model_validate(payload)
    result = ENMValidator().validate(enm)
    assert any(i.code == "E041" for i in result.issues)


def test_validator_warns_voltage_mismatch():
    payload = _enm_payload_with_inductive_load("walidacja-kv")
    payload["shunt_capacitors"] = [_capacitor_record(rated_kv=20.0)]  # bus is 15 kV
    enm = EnergyNetworkModel.model_validate(payload)
    result = ENMValidator().validate(enm)
    assert any(i.code == "W040" for i in result.issues)


# ---------------------------------------------------------------------------
# Hash / round-trip
# ---------------------------------------------------------------------------


def test_cgmes_export_emits_linear_shunt_compensator_and_round_trips():
    """D-06c: ShuntCapacitor -> CGMES LinearShuntCompensator + lossless side-car.

    The side-car round-trip restores the ENM (and the capacitor) byte-for-byte,
    so input_hash is preserved. The EQ profile carries a LinearShuntCompensator
    with first-principles bPerSection = Q_rated / U_rated².
    """
    import io
    import zipfile

    from application.cgmes.service import export_cgmes, import_cgmes
    from infrastructure.cgmes.cgmes_importer import CgmesImportStatus

    payload = _enm_payload_with_inductive_load("CGMES")
    payload["shunt_capacitors"] = [_capacitor_record(rated_mvar=2.4, rated_kv=15.0)]
    enm = EnergyNetworkModel.model_validate(payload)

    archive = export_cgmes(enm)
    with zipfile.ZipFile(io.BytesIO(archive), "r") as zf:
        eq_xml = zf.read("EQ.xml").decode("utf-8")

    assert "LinearShuntCompensator" in eq_xml
    assert "LinearShuntCompensator.bPerSection" in eq_xml

    result = import_cgmes(archive)
    assert result.status == CgmesImportStatus.SUCCESS
    assert result.enm is not None
    assert len(result.enm.shunt_capacitors) == 1
    assert result.enm.shunt_capacitors[0].rated_mvar == 2.4
    assert compute_enm_hash(result.enm) == compute_enm_hash(enm)


def test_capacitor_changes_input_hash_and_round_trips():
    base = _enm_payload_with_inductive_load("hash-base")
    with_cap = _enm_payload_with_inductive_load("hash-base")
    with_cap["shunt_capacitors"] = [_capacitor_record(rated_mvar=2.0)]

    enm_base = EnergyNetworkModel.model_validate(base)
    enm_cap = EnergyNetworkModel.model_validate(with_cap)

    # Input hash must change when a capacitor is added (it is a computational input).
    assert compute_enm_hash(enm_base) != compute_enm_hash(enm_cap)
    # Semantic hash also changes (new element with bus_ref + catalog_ref).
    assert compute_semantic_hash(enm_base) != compute_semantic_hash(enm_cap)

    # Pydantic round-trip is lossless and deterministic.
    dumped = enm_cap.model_dump(mode="json")
    reloaded = EnergyNetworkModel.model_validate(dumped)
    assert compute_enm_hash(reloaded) == compute_enm_hash(enm_cap)
    assert len(reloaded.shunt_capacitors) == 1
    assert reloaded.shunt_capacitors[0].rated_mvar == 2.0
