"""Testy `UpstreamEquivalentSnapshot` (karta T5b, §0 rozstrzygnięcie 1).

Dowód reuse fizyki: liczby snapshotu (Z1/Sk″/Ik″) muszą pokrywać się z tym,
co `fault_loop.service` liczy dla TEGO SAMEGO transformatora (referowane do
nN kwadratem przekładni — jedna ścieżka fizyki, dwa punkty odczytu).
"""

from __future__ import annotations

import cmath

from application.analyses.fault_loop.service import (
    _find_station,
    _upstream_thevenin_lv_component,
    resolve_station_transformer,
)
from application.analyses.lv_domain.upstream_equivalent import (
    build_upstream_equivalent_snapshot,
)
from enm.hash import compute_enm_hash, compute_switching_snapshot_hash
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)


def _base_enm(*, extra_transformer: bool = False) -> EnergyNetworkModel:
    buses = [
        Bus(ref_id="sn", name="SN", voltage_kv=15.0),
        Bus(ref_id="nn_a", name="RGnN-A", voltage_kv=0.4),
    ]
    transformers = [
        Transformer(
            ref_id="tr1",
            name="TR1",
            hv_bus_ref="sn",
            lv_bus_ref="nn_a",
            sn_mva=0.63,
            uhv_kv=15.0,
            ulv_kv=0.4,
            uk_percent=4.0,
            pk_kw=6.5,
            vector_group="Dyn11",
        )
    ]
    branches = []
    transformer_refs = ["tr1"]
    if extra_transformer:
        buses.append(Bus(ref_id="nn_b", name="RGnN-B", voltage_kv=0.4))
        transformers.append(
            Transformer(
                ref_id="tr2",
                name="TR2",
                hv_bus_ref="sn",
                lv_bus_ref="nn_b",
                sn_mva=0.4,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=4.5,
                vector_group="Dyn11",
            )
        )
        branches.append(
            SwitchBranch(
                ref_id="coupler",
                name="coupler",
                from_bus_ref="nn_a",
                to_bus_ref="nn_b",
                type="bus_coupler",
                status="closed",
            )
        )
        transformer_refs.append("tr2")

    return EnergyNetworkModel(
        header=ENMHeader(name="t5b", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=buses,
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=transformers,
        branches=branches,
        substations=[
            Substation(
                ref_id="root",
                name="Stacja ROOT",
                station_type="mv_lv",
                bus_refs=["nn_a"] + (["nn_b"] if extra_transformer else []),
                transformer_refs=transformer_refs,
            )
        ],
    )


class TestSnapshotContract:
    def test_status_ok_and_all_fields_present(self) -> None:
        enm = _base_enm()
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["status"] == "OK"
        for field in (
            "source_node_id",
            "voltage_level_id",
            "uth_kv",
            "sk_mva",
            "z1_ohm",
            "z0_ohm",
            "rx_ratio",
            "scenario_id",
            "operating_state_id",
            "calculation_run_id",
            "model_revision",
            "model_hash",
        ):
            assert field in snap, f"brak pola {field!r} w snapshopcie"

    def test_voltage_level_id_matches_hv_side(self) -> None:
        enm = _base_enm()
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["voltage_level_id"] == "kv:15"
        assert snap["voltage_kv"] == 15.0

    def test_scenario_max_vs_min_changes_c_factor_and_uth(self) -> None:
        enm = _base_enm()
        snap_max = build_upstream_equivalent_snapshot(enm, "case-1", "root", scenario="MAX")
        snap_min = build_upstream_equivalent_snapshot(enm, "case-1", "root", scenario="MIN")
        assert snap_max["scenario_id"] == "MAX"
        assert snap_min["scenario_id"] == "MIN"
        assert snap_max["uth_kv"] > snap_min["uth_kv"]
        assert snap_max["c_factor"] == 1.10
        assert snap_min["c_factor"] == 1.00


class TestReuseOfFaultLoopPhysics:
    def test_z1_referred_to_lv_matches_fault_loop_upstream_component(self) -> None:
        """Dowód reuse: Z1 snapshotu (Ω na HV), referowane kwadratem przekładni,
        MUSI dać DOKŁADNIE tę samą wartość co `_upstream_thevenin_lv_component`
        fault_loop.service dla TEGO SAMEGO transformatora — jedna ścieżka fizyki."""
        enm = _base_enm()
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")

        station = _find_station(enm, "root")
        assert station is not None
        trafo, _missing_tr = resolve_station_transformer(enm, station, None)
        assert trafo is not None
        lv_component, missing = _upstream_thevenin_lv_component(enm, trafo)
        assert lv_component is not None, missing

        z1_hv = complex(snap["z1_ohm"]["r"], snap["z1_ohm"]["x"])
        ratio_squared = (trafo.ulv_kv / trafo.uhv_kv) ** 2
        z1_referred_to_lv = z1_hv * ratio_squared

        assert cmath.isclose(
            z1_referred_to_lv, complex(lv_component.r_ohm, lv_component.x_ohm), rel_tol=1e-9
        )


class TestDeterminism:
    def test_same_model_gives_identical_snapshot(self) -> None:
        enm = _base_enm()
        snap1 = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        snap2 = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap1 == snap2

    def test_operating_state_id_matches_switching_snapshot_hash(self) -> None:
        enm = _base_enm()
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["operating_state_id"] == compute_switching_snapshot_hash(enm)

    def test_model_hash_matches_compute_enm_hash(self) -> None:
        enm = _base_enm()
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["model_hash"] == compute_enm_hash(enm)

    def test_switch_state_change_changes_operating_state_id_and_calculation_run_id(self) -> None:
        """Zmiana STANU łączeniowego (bez zmiany parametrów) zmienia
        `operating_state_id`/`calculation_run_id`, ale nie fizyki Z1 (sprzęgło
        nie leży na trasie do HV) — dowód, że pole faktycznie śledzi stan
        łączeniowy, nie jest atrapą."""
        enm = _base_enm(extra_transformer=True)
        snap_closed = build_upstream_equivalent_snapshot(
            enm, "case-1", "root", transformer_ref="tr1"
        )

        enm.branches[0].status = "open"
        snap_open = build_upstream_equivalent_snapshot(enm, "case-1", "root", transformer_ref="tr1")

        assert snap_closed["operating_state_id"] != snap_open["operating_state_id"]
        assert snap_closed["calculation_run_id"] != snap_open["calculation_run_id"]


class TestMultiTransformerDisambiguation:
    def test_default_picks_first_transformer_sorted_by_ref_id(self) -> None:
        enm = _base_enm(extra_transformer=True)
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["transformer_ref"] == "tr1"

    def test_explicit_transformer_ref_selects_that_transformer(self) -> None:
        enm = _base_enm(extra_transformer=True)
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root", transformer_ref="tr2")
        assert snap["transformer_ref"] == "tr2"

    def test_transformer_ref_not_belonging_to_station_is_honest(self) -> None:
        enm = _base_enm(extra_transformer=True)
        enm.transformers.append(
            Transformer(
                ref_id="tr_foreign",
                name="obcy",
                hv_bus_ref="sn",
                lv_bus_ref="nn_a",
                sn_mva=0.1,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=1.0,
                vector_group="Dyn11",
            )
        )
        snap = build_upstream_equivalent_snapshot(
            enm, "case-1", "root", transformer_ref="tr_foreign"
        )
        assert snap["status"] == "brak danych"
        assert "transformer_not_in_station" in snap["missing_data"]


class TestHonestFailures:
    def test_unknown_station_is_honest(self) -> None:
        enm = _base_enm()
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "does-not-exist")
        assert snap["status"] == "brak danych"
        assert "station" in snap["missing_data"]

    def test_station_without_transformer_is_honest(self) -> None:
        enm = _base_enm()
        enm.substations[0].transformer_refs = []
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["status"] == "brak danych"
        assert "transformer" in snap["missing_data"]

    def test_topologically_invalid_model_never_crashes(self) -> None:
        """Źródło na szynie, której nie ma w modelu — sieć niepoprawna
        topologicznie musi dać uczciwy brak, nigdy wyjątek (do CV-4.3 K3b tę
        klasę reprezentował drugi węzeł SLACK, który IR dziś przyjmuje)."""
        enm = _base_enm()
        enm.sources.append(
            Source(
                ref_id="src2",
                name="GPZ2",
                bus_ref="szyna_ktorej_nie_ma",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
            )
        )
        snap = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert snap["status"] == "brak danych"
        assert "upstream_network_topology_invalid" in snap["missing_data"]

    def test_two_grid_sources_in_one_island_superpose(self) -> None:
        """CV-4.3 K3b: dwa źródła sieciowe w jednej wyspie = dwa węzły SLACK w IR;
        równoważnik Thevenina liczy superpozycję (IEC 60909: bocznik Y_Q każdego
        źródła), więc moc zwarciowa w węźle SN ROŚNIE względem jednego źródła."""
        jedno = build_upstream_equivalent_snapshot(_base_enm(), "case-1", "root")
        enm = _base_enm()
        enm.sources.append(
            Source(
                ref_id="src2",
                name="GPZ2",
                bus_ref="sn",
                model="thevenin",
                r_ohm=0.1,
                x_ohm=0.5,
            )
        )
        dwa = build_upstream_equivalent_snapshot(enm, "case-1", "root")
        assert jedno["status"] == "OK" and dwa["status"] == "OK"
        assert dwa["sk_mva"] > jedno["sk_mva"]
