from __future__ import annotations

import math

import pytest
from enm.hash import compute_enm_hash
from enm.models import (
    BranchPointSN,
    BranchPointSNPorts,
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
)
from enm.store import get_enm, reset_enm_store, set_enm


def _minimal_enm() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Store Test", defaults=ENMDefaults()),
        buses=[Bus(ref_id="bus-main", name="Szyna glowna", voltage_kv=15.0)],
        sources=[
            Source(
                ref_id="src-grid",
                name="Zasilanie GPZ",
                bus_ref="bus-main",
                model="short_circuit_power",
                sk3_mva=250.0,
                rx_ratio=0.1,
            )
        ],
    )


def _station_with_nn_feeder_without_load() -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": {"name": "Migracja katalogowa", "defaults": {}},
            "buses": [
                {"ref_id": "bus-sn", "name": "Szyna SN", "voltage_kv": 15.0},
                {"ref_id": "bus-nn", "name": "Szyna nN", "voltage_kv": 0.4},
            ],
            "substations": [
                {
                    "ref_id": "stn/test/station",
                    "name": "Stacja testowa",
                    "station_type": "inline",
                    "bus_refs": ["bus-sn", "bus-nn"],
                    "transformer_refs": [],
                    "meta": {
                        "nn_field_specs": [
                            {
                                "field_ref": "stn/test/nn_feeder/001",
                                "name": "Odpływ nN 1",
                                "bay_role": "FEEDER",
                                "bus_ref": "bus-nn",
                            }
                        ]
                    },
                }
            ],
        }
    )


def _legacy_zksn_without_switch_state() -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": {"name": "Migracja ZKSN", "defaults": {}},
            "buses": [
                {"ref_id": "bus-a", "name": "Zacisk A", "voltage_kv": 15.0},
                {"ref_id": "bus-b", "name": "Zacisk B", "voltage_kv": 15.0},
                {"ref_id": "bus-zksn", "name": "ZKSN", "voltage_kv": 15.0},
            ],
            "branches": [
                {
                    "ref_id": "seg/main",
                    "name": "Odcinek kablowy",
                    "from_bus_ref": "bus-a",
                    "to_bus_ref": "bus-b",
                    "type": "cable",
                    "length_km": 0.12,
                    "r_ohm_per_km": 0.125,
                    "x_ohm_per_km": 0.09,
                }
            ],
            "branch_points": [
                BranchPointSN(
                    ref_id="bp/test/zksn",
                    name="ZKSN test",
                    branch_point_type="zksn",
                    parent_segment_id="seg/main",
                    bus_ref="bus-zksn",
                    catalog_ref="ZKSN-2P-630A",
                    ports=BranchPointSNPorts(
                        MAIN_IN="bp/test/zksn/main_in",
                        MAIN_OUT="bp/test/zksn/main_out",
                        BRANCH=["bp/test/zksn/branch/1"],
                    ),
                )
            ],
        }
    )


@pytest.fixture(autouse=True)
def _reset_store(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
    reset_enm_store()
    yield
    reset_enm_store()


def test_set_enm_persists_hash_for_effective_revision() -> None:
    saved = set_enm("case-store-1", _minimal_enm())

    assert saved.header.revision == 1
    assert saved.header.hash_sha256 == compute_enm_hash(saved)


def test_set_enm_noops_for_equivalent_snapshot_content() -> None:
    first = set_enm("case-store-2", _minimal_enm())

    equivalent = get_enm("case-store-2").model_copy(deep=True)
    saved = set_enm("case-store-2", equivalent)

    assert saved.header.revision == first.header.revision
    assert saved.header.hash_sha256 == first.header.hash_sha256


def test_store_reloads_persisted_snapshot_after_process_memory_reset() -> None:
    saved = set_enm("case-store-restart", _minimal_enm())

    reset_enm_store(remove_persisted=False)
    reread = get_enm("case-store-restart")

    assert reread.header.revision == saved.header.revision
    assert reread.header.hash_sha256 == saved.header.hash_sha256
    assert reread.buses[0].ref_id == "bus-main"
    assert reread.sources[0].ref_id == "src-grid"


def test_store_materializes_catalog_loads_for_legacy_station_feeders() -> None:
    saved = set_enm("case-store-load-migration", _station_with_nn_feeder_without_load())

    assert saved.loads
    load = saved.loads[0]
    assert load.bus_ref == "bus-nn"
    assert load.catalog_ref == "load_uslugi_30kw"
    assert load.catalog_namespace == "OBCIAZENIE"
    assert load.meta["feeder_ref"] == "stn/test/nn_feeder/001"
    # Intencja: migracja ma zapisać KOMPLETNĄ tabliczkę katalogową, a nie samą
    # moc czynną. Do naprawy defektu D7 odbiór dostawał `q_mvar = 0.0` mimo
    # katalogowego cosφ = 0,92 i rozpływ liczył go z cosφ = 1,0 (phantom cosφ,
    # ta sama klasa co V12K-050 dla `add_nn_load`).
    assert load.p_mw == pytest.approx(0.03, abs=1e-12)
    assert load.q_mvar == pytest.approx(0.03 * math.tan(math.acos(0.92)), abs=1e-9)
    assert load.materialized_params is not None
    assert load.materialized_params["q_source"] == "KATALOG_COS_PHI"

    reread = get_enm("case-store-load-migration")
    assert len(reread.loads) == 1
    assert reread.header.revision == saved.header.revision


def test_store_materializes_catalog_switch_state_for_legacy_zksn() -> None:
    saved = set_enm("case-store-zksn-migration", _legacy_zksn_without_switch_state())

    assert saved.branch_points[0].switch_state == "closed"
    assert saved.branch_points[0].runtime_inputs["switch_state"] == "closed"
    assert saved.branch_points[0].runtime_inputs["completion_source"] == (
        "branch_point_catalog_materialization"
    )

    reread = get_enm("case-store-zksn-migration")
    assert reread.branch_points[0].switch_state == "closed"
    assert reread.header.revision == saved.header.revision
