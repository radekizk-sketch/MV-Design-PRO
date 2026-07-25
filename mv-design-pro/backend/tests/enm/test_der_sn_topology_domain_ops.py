"""W2b-DANE (POLECENIE_DER_SN_TOPOLOGIA_2026-07): kompletny tor DER przyłączonego
po stronie SN materializowany jako REALNE elementy ENM.

Kanon: DER na SN wymaga toru: szyna nN producenta → TR blokowy (OSOBNY element,
≠ TR stacji) → kabel SN → dedykowane pole źródłowe SN → szyna SN stacji. Testy
ćwiczą przypadki kanonu 1–8 NA POZIOMIE DANYCH (materializacja/id/napięcia), plus
determinizm i realny bieg LF/SC na topologii z TR blokowym (zero zmian solverów).
"""

from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

_TR_BLOCK = "tr-sn-nn-15-04-1000kva-dyn11"
_CABLE = "cable-base-epr-al-1c-240"
_APARAT_SN = "ap-sn-cb-630"


def _sn_station_enm(with_station_transformer: bool = False) -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="der-sn", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    buses = [
        {
            "ref_id": "bus_sn",
            "name": "Szyna SN",
            "voltage_kv": 15.0,
            "frequency_hz": 50.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        }
    ]
    bus_refs = ["bus_sn"]
    transformers: list[dict] = []
    transformer_refs: list[str] = []
    if with_station_transformer:
        buses.append(
            {
                "ref_id": "bus_nn_station",
                "name": "Szyna nN stacji",
                "voltage_kv": 0.4,
                "frequency_hz": 50.0,
                "phase_system": "3ph",
                "tags": [],
                "meta": {},
            }
        )
        bus_refs.append("bus_nn_station")
        transformers.append(
            {
                "ref_id": "tr_station",
                "name": "TR odbiorczy stacji",
                "hv_bus_ref": "bus_sn",
                "lv_bus_ref": "bus_nn_station",
                "sn_mva": 0.63,
                "uhv_kv": 15.0,
                "ulv_kv": 0.4,
                "uk_percent": 6.0,
                "pk_kw": 8.0,
                "vector_group": "Dyn11",
                "tags": [],
                "meta": {"catalog_role": "TRANSFORMATOR_STACJI"},
            }
        )
        transformer_refs.append("tr_station")
    enm["buses"] = buses
    enm["transformers"] = transformers
    enm["substations"] = [
        {
            "ref_id": "st_1",
            "name": "Stacja 1",
            "station_type": "mv_lv",
            "bus_refs": bus_refs,
            "transformer_refs": transformer_refs,
            "tags": [],
            "meta": {},
        }
    ]
    enm["sources"] = [
        {
            "ref_id": "src_gpz",
            "name": "GPZ",
            "bus_ref": "bus_sn",
            "model": "short_circuit_power",
            "sk3_mva": 500.0,
            "rx_ratio": 0.1,
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _der_sn_payload(
    *,
    technology: str = "PV",
    source_name: str = "Blok PV SN",
    quantity: int = 1,
    has_manufacturer_lv_switchgear: bool = True,
    lv_switchgear_variant: str = "multi-feeder",
    has_block_transformer: bool = True,
    mv_bus_ref: str = "bus_sn",
    vt: bool = True,
    surge_arrester: bool = True,
    include_block_spec: bool = True,
) -> dict:
    namespace = {
        "PV": "ZRODLO_NN_PV",
        "BESS": "ZRODLO_NN_BESS",
        "FW": "CONVERTER",
    }[technology]
    block_transformer = None
    if include_block_spec:
        block_transformer = {
            "rated_power_mva": 1.0,
            "primary_voltage_kv": 15.0,
            "secondary_voltage_kv": 0.4,
            "catalog_ref": _TR_BLOCK,
            "catalog_binding": {
                "catalog_namespace": "TRAFO_SN_NN",
                "catalog_item_id": _TR_BLOCK,
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        }
    return {
        "source_technology": technology,
        "connection_variant": "block_transformer",
        "station_ref": "st_1",
        "bus_nn_ref": mv_bus_ref,
        "source_name": source_name,
        "quantity": quantity,
        "power_setpoint_mw": 1.0,
        "catalog_binding": {
            "catalog_namespace": namespace,
            "catalog_item_id": f"conv-{technology.lower()}-04kv",
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "materialized_params": {
            "catalog_item_id": f"conv-{technology.lower()}-04kv",
            "catalog_item_version": "2024.1",
            "un_kv": 0.4,
            "pmax_mw": 1.0,
            "sn_mva": 1.0,
        },
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": 0.4,
            "has_manufacturer_lv_switchgear": has_manufacturer_lv_switchgear,
            "lv_switchgear_variant": lv_switchgear_variant,
            "has_block_transformer": has_block_transformer,
            "block_transformer": block_transformer,
            "has_dedicated_mv_field": True,
            "mv_bus_ref": mv_bus_ref,
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": vt,
                "earthing_switch": True,
                "surge_arrester": surge_arrester,
                "protection_relay": True,
                "cable_head": True,
                "apparatus_catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": _APARAT_SN,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "cable_catalog_ref": _CABLE,
                "cable_catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": _CABLE,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
        },
    }


def _block_transformer(snapshot: dict) -> dict:
    return next(
        t
        for t in snapshot["transformers"]
        if t.get("meta", {}).get("catalog_role") == "TRANSFORMATOR_BLOKOWY_DER"
    )


def _field_specs(snapshot: dict) -> list[dict]:
    return snapshot["substations"][0]["meta"].get("field_specs") or []


# ---------------------------------------------------------------------------
# Przypadek 2: PV z TR blokowym i polem SN — pełny tor.
# ---------------------------------------------------------------------------


def test_case2_pv_full_sn_chain_materializes_all_elements() -> None:
    result = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]

    # TR blokowy jest OSOBNYM elementem z własnym id i jawną rolą DER.
    block_tr = _block_transformer(snap)
    assert block_tr["meta"]["catalog_role"] == "TRANSFORMATOR_BLOKOWY_DER"
    assert block_tr["uhv_kv"] == 15.0 and block_tr["ulv_kv"] == 0.4

    producer_bus = next(b for b in snap["buses"] if b["meta"].get("der_role") == "producer_lv_bus")
    block_hv_bus = next(b for b in snap["buses"] if b["meta"].get("der_role") == "block_hv_bus")
    assert producer_bus["voltage_kv"] == 0.4  # strona falownika
    assert block_hv_bus["voltage_kv"] == 15.0  # strona SN TR blokowego

    # TR blokowy: HV = szyna SN TR blokowego, LV = szyna nN producenta.
    assert block_tr["hv_bus_ref"] == block_hv_bus["ref_id"]
    assert block_tr["lv_bus_ref"] == producer_bus["ref_id"]

    cable = next(b for b in snap["branches"] if b["type"] == "cable")
    assert cable["from_bus_ref"] == block_hv_bus["ref_id"]
    apparatus = next(b for b in snap["branches"] if b["type"] == "breaker")
    assert apparatus["from_bus_ref"] == "bus_sn"  # przyłącze do szyny SN stacji
    assert cable["to_bus_ref"] == apparatus["to_bus_ref"]  # wspólny zacisk pola

    # Generator (falownik) na szynie nN producenta; przyłącze do sieci = pole SN.
    gen = snap["generators"][0]
    assert gen["bus_ref"] == producer_bus["ref_id"]
    assert gen["connection_variant"] == "block_transformer"
    assert gen["blocking_transformer_ref"] == block_tr["ref_id"]
    assert gen["meta"]["der_mv_field_ref"] == _field_specs(snap)[0]["field_ref"]

    # Dedykowane pole źródłowe SN z aparatami pierwotnymi wg konfiguracji kreatora.
    field = _field_specs(snap)[0]
    assert field["bay_role"] == "OZE"
    kinds = [d["kind"] for d in field["primary_devices"]]
    assert kinds == ["DS", "CB", "CT", "VT", "DS", "ES", "SURGE_ARRESTER", "CABLE_HEAD"]
    assert "anti-islanding" in field["protection_codes"]

    EnergyNetworkModel.model_validate(snap)


def test_case2_mv_field_config_is_load_bearing_no_phantom() -> None:
    """Zero fabrykacji: odznaczenie VT/SA realnie usuwa aparat z pola (nie phantom)."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload(vt=False, surge_arrester=False),
    )
    assert not result.get("error"), result.get("error")
    field = _field_specs(result["snapshot"])[0]
    kinds = [d["kind"] for d in field["primary_devices"]]
    assert "VT" not in kinds
    assert "SURGE_ARRESTER" not in kinds
    assert kinds == ["DS", "CB", "CT", "DS", "ES", "CABLE_HEAD"]


# ---------------------------------------------------------------------------
# Przypadek 1: wariant nN bez zmian (der_topology='nn' nie materializuje toru SN).
# ---------------------------------------------------------------------------


def test_case1_nn_variant_unchanged_no_block_transformer() -> None:
    enm = _sn_station_enm(with_station_transformer=True)
    payload = {
        "source_technology": "PV",
        "connection_variant": "nn_side",
        "station_ref": "st_1",
        "bus_nn_ref": "bus_nn_station",
        "placement": "NEW_FIELD",
        "source_field": {
            "source_field_kind": "PV",
            "field_name": "Pole PV nN",
            "catalog_binding": {
                "catalog_namespace": "APARAT_NN",
                "catalog_item_id": "ap-nn-630",
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        },
        "source_name": "Blok PV nN",
        "power_setpoint_mw": 0.4,
        "catalog_binding": {
            "catalog_namespace": "CONVERTER",
            "catalog_item_id": "conv-pv-04kv",
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "materialized_params": {
            "catalog_item_id": "conv-pv-04kv",
            "catalog_item_version": "2024.1",
            "un_kv": 0.4,
            "pmax_mw": 0.4,
            "sn_mva": 0.4,
        },
        # der_topology='nn' NIE może wyzwalać materializacji toru SN (interception tylko dla sn).
        "der_topology": {"connection_level": "nn"},
    }
    result = execute_domain_operation(enm, "add_converter_source", payload)
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    # Brak TR blokowego DER — tylko TR stacji.
    assert all(
        t.get("meta", {}).get("catalog_role") != "TRANSFORMATOR_BLOKOWY_DER"
        for t in snap["transformers"]
    )
    assert snap["generators"][0]["connection_variant"] == "nn_side"


# ---------------------------------------------------------------------------
# Przypadek 3: BESS z rozdzielnicą nN producenta i TR blokowym.
# ---------------------------------------------------------------------------


def test_case3_bess_with_manufacturer_lv_switchgear() -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload(
            technology="BESS",
            source_name="Blok BESS SN",
            has_manufacturer_lv_switchgear=True,
            lv_switchgear_variant="single-bus",
        ),
    )
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    gen = snap["generators"][0]
    assert gen["gen_type"] == "bess"
    producer_bus = next(b for b in snap["buses"] if b["meta"].get("der_role") == "producer_lv_bus")
    assert producer_bus["meta"]["has_manufacturer_lv_switchgear"] is True
    assert producer_bus["meta"]["lv_switchgear_variant"] == "single-bus"
    _block_transformer(snap)  # TR blokowy obecny
    EnergyNetworkModel.model_validate(snap)


# ---------------------------------------------------------------------------
# Przypadek 4: generator synchroniczny WPROST na SN bez TR blokowego —
# falownik na SN bez TR blokowego jest zabroniony (osobna zdolność).
# ---------------------------------------------------------------------------


def test_case4_converter_on_sn_without_block_transformer_rejected() -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload(has_block_transformer=False, include_block_spec=False),
    )
    assert result["error_code"] == "converter.sn_requires_block_transformer"


# ---------------------------------------------------------------------------
# Przypadek 5: PV z kilkoma falownikami i wspólną rozdzielnią nN.
# ---------------------------------------------------------------------------


def test_case5_pv_multiple_inverters_shared_lv() -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload(quantity=3, lv_switchgear_variant="multi-feeder"),
    )
    assert not result.get("error"), result.get("error")
    gen = result["snapshot"]["generators"][0]
    assert gen["quantity"] == 3
    assert gen["n_parallel"] == 3
    # Moc skalowana liczbą jednostek (1 MW × 3) — power_setpoint jawny nadpisuje.
    assert gen["p_mw"] == 1.0  # power_setpoint_mw jawnie = 1.0


# ---------------------------------------------------------------------------
# Przypadek 6: PV ze stacją kompaktową producenta (zintegrowany zestaw).
# ---------------------------------------------------------------------------


def test_case6_pv_integrated_skid_variant() -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload(lv_switchgear_variant="integrated-skid"),
    )
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    producer_bus = next(b for b in snap["buses"] if b["meta"].get("der_role") == "producer_lv_bus")
    assert producer_bus["meta"]["lv_switchgear_variant"] == "integrated-skid"
    # TR blokowy pozostaje osobnym elementem także dla stacji kompaktowej.
    _block_transformer(snap)


# ---------------------------------------------------------------------------
# Przypadek 7: dwa DER o różnych topologiach na tej samej szynie SN.
# ---------------------------------------------------------------------------


def test_case7_two_der_different_topologies_same_sn_bus() -> None:
    enm = _sn_station_enm()
    r1 = execute_domain_operation(
        enm, "add_converter_source", _der_sn_payload(technology="PV", source_name="PV blok")
    )
    assert not r1.get("error"), r1.get("error")
    r2 = execute_domain_operation(
        r1["snapshot"],
        "add_converter_source",
        _der_sn_payload(technology="BESS", source_name="BESS blok"),
    )
    assert not r2.get("error"), r2.get("error")
    snap = r2["snapshot"]

    block_trs = [
        t
        for t in snap["transformers"]
        if t.get("meta", {}).get("catalog_role") == "TRANSFORMATOR_BLOKOWY_DER"
    ]
    assert len(block_trs) == 2
    assert block_trs[0]["ref_id"] != block_trs[1]["ref_id"]
    assert len(snap["generators"]) == 2
    # Dwa dedykowane pola źródłowe SN na tej samej szynie SN.
    oze_fields = [f for f in _field_specs(snap) if f["bay_role"] == "OZE"]
    assert len(oze_fields) == 2
    assert all(f["bus_ref"] == "bus_sn" for f in oze_fields)
    EnergyNetworkModel.model_validate(snap)


# ---------------------------------------------------------------------------
# Przypadek 8: DER na SN obok niezależnego pola TR odbiorczego stacji.
# ---------------------------------------------------------------------------


def test_case8_der_sn_beside_station_transformer() -> None:
    result = execute_domain_operation(
        _sn_station_enm(with_station_transformer=True),
        "add_converter_source",
        _der_sn_payload(),
    )
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]

    block_tr = _block_transformer(snap)
    station_tr = next(
        t for t in snap["transformers"] if t["meta"].get("catalog_role") == "TRANSFORMATOR_STACJI"
    )
    # TR blokowy DER ≠ TR stacji: różne id, różna rola.
    assert block_tr["ref_id"] != station_tr["ref_id"]
    assert station_tr["ref_id"] == "tr_station"
    assert block_tr["meta"]["catalog_role"] == "TRANSFORMATOR_BLOKOWY_DER"
    # Pole DER (OZE) współistnieje z transformatorem odbiorczym stacji.
    assert any(f["bay_role"] == "OZE" for f in _field_specs(snap))
    EnergyNetworkModel.model_validate(snap)


# ---------------------------------------------------------------------------
# Determinizm: 2× identyczny payload → identyczne id i elementy toru.
# ---------------------------------------------------------------------------


def test_der_sn_materialization_is_deterministic() -> None:
    r1 = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    r2 = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not r1.get("error") and not r2.get("error")
    assert r1["changes"]["created_element_ids"] == r2["changes"]["created_element_ids"]
    for coll in ("buses", "transformers", "branches", "generators"):
        assert r1["snapshot"][coll] == r2["snapshot"][coll], coll


# ---------------------------------------------------------------------------
# LF/SC: realny bieg solverów na snapshotcie z TR blokowym (zero zmian solverów).
# ---------------------------------------------------------------------------


def _der_sn_snapshot_for_solver() -> EnergyNetworkModel:
    result = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not result.get("error"), result.get("error")
    return EnergyNetworkModel.model_validate(result["snapshot"])


def test_block_transformer_and_cable_consumed_by_graph() -> None:
    enm = _der_sn_snapshot_for_solver()
    graph = map_enm_to_network_graph(enm)
    trafos = [b for b in graph.branches.values() if isinstance(b, TransformerBranch)]
    cables = [
        b
        for b in graph.branches.values()
        if isinstance(b, LineBranch) and b.branch_type.value == "CABLE"
    ]
    # TR blokowy DER wchodzi do grafu jako gałąź transformatorowa (bez zmian solverów).
    assert len(trafos) == 1
    assert len(cables) == 1
    assert len(graph.get_inverter_sources()) == 1


def test_power_flow_converges_on_der_sn_topology() -> None:
    enm = _der_sn_snapshot_for_solver()
    graph = map_enm_to_network_graph(enm)
    slack_id = next(nid for nid, n in graph.nodes.items() if n.node_type.value == "SLACK")
    pq_specs = [
        PQSpec(node_id=nid, p_mw=n.active_power or 0.0, q_mvar=n.reactive_power or 0.0)
        for nid, n in sorted(graph.nodes.items())
        if n.node_type.value == "PQ" and nid != slack_id
    ]
    pf = PowerFlowInput(
        graph=graph,
        base_mva=100.0,
        slack=SlackSpec(node_id=slack_id, u_pu=1.0, angle_rad=0.0),
        pq=pq_specs,
        options=PowerFlowOptions(max_iter=50, tolerance=2e-3, trace_level="basic"),
    )
    result = solve_power_flow_physics(pf)
    assert result.converged, f"PF nie zbieżny (mismatch={result.max_mismatch})"


def test_power_flow_on_der_sn_topology_is_deterministic() -> None:
    enm = _der_sn_snapshot_for_solver()

    def _run() -> float:
        graph = map_enm_to_network_graph(enm)
        slack_id = next(nid for nid, n in graph.nodes.items() if n.node_type.value == "SLACK")
        pq_specs = [
            PQSpec(node_id=nid, p_mw=n.active_power or 0.0, q_mvar=n.reactive_power or 0.0)
            for nid, n in sorted(graph.nodes.items())
            if n.node_type.value == "PQ" and nid != slack_id
        ]
        pf = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            slack=SlackSpec(node_id=slack_id, u_pu=1.0, angle_rad=0.0),
            pq=pq_specs,
            options=PowerFlowOptions(max_iter=50, tolerance=2e-3, trace_level="basic"),
        )
        sol = solve_power_flow_physics(pf)
        assert sol.converged
        return sol.max_mismatch

    assert _run() == _run()


def test_short_circuit_nonzero_on_der_sn_buses() -> None:
    enm = _der_sn_snapshot_for_solver()
    graph = map_enm_to_network_graph(enm)
    for node_id in sorted(graph.nodes.keys()):
        sc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph, node_id, c_factor=1.10, tk_s=1.0, tb_s=0.1
        )
        assert sc.ikss_a > 0, f"ikss=0 na {node_id}"


# ---------------------------------------------------------------------------
# D3 (7+8): grupa połączeń + uk/Pcu/P0/I0 TR blokowego jako parametry MODELU
# konsumowane przez solvery (jeden model — z typu katalogowego), z walidacją
# spójności grupy z typem.
# ---------------------------------------------------------------------------


def _der_sn_payload_with_vector_group(vector_group: str) -> dict:
    """Payload toru DER-SN z JAWNYM układem połączeń w specyfikacji TR blokowego."""
    import copy

    payload = copy.deepcopy(_der_sn_payload())
    payload["der_topology"]["block_transformer"]["vector_group"] = vector_group
    return payload


def test_block_transformer_catalog_params_flow_into_model_and_solver() -> None:
    """Req 8: uk/Pcu/P0/I0 + grupa z TYPU katalogu 1000 kVA Dyn11 (uk=6%) wchodzą do
    modelu i do gałęzi transformatorowej konsumowanej przez solver (jeden model)."""
    result = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not result.get("error"), result.get("error")
    block_tr = _block_transformer(result["snapshot"])
    # Parametry impedancyjne i grupa = wartości ZMATERIALIZOWANE z typu katalogowego.
    assert block_tr["uk_percent"] == 6.0
    assert block_tr["pk_kw"] == 11.0
    assert block_tr["p0_kw"] == 1.70
    assert block_tr["i0_percent"] == 1.2
    assert block_tr["vector_group"] == "Dyn11"

    # Ta sama impedancja wchodzi do solvera przez gałąź transformatorową (bez drugiego modelu).
    enm = EnergyNetworkModel.model_validate(result["snapshot"])
    graph = map_enm_to_network_graph(enm)
    trafo = next(b for b in graph.branches.values() if isinstance(b, TransformerBranch))
    assert trafo.uk_percent == 6.0
    assert trafo.pk_kw == 11.0
    assert trafo.vector_group == "Dyn11"
    # z_pu = uk/100 = 0.06 na mocy znamionowej TR (WHITE BOX konsumpcja uk przez solver).
    assert abs(abs(trafo.get_short_circuit_impedance_pu()) - 0.06) < 1e-9


def test_dane_materialowe_kabla_docieraja_z_katalogu_do_galezi_grafu() -> None:
    """Karta F-K1 faza 6: material zyly, izolacja i PARA TEMPERATUR do konca lancucha.

    Bez tych danych wspolczynnik k = Jth(1 s) jest liczba bez uzasadnienia — dowod
    obliczeniowy nie pozwala sprawdzic, czy pasuje do TEGO kabla. Test idzie realna
    droga: operacja domenowa -> materializacja katalogowa -> model ENM -> graf.
    """
    result = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not result.get("error"), result.get("error")

    snapshot = result["snapshot"]
    kabel = next(b for b in snapshot["branches"] if b.get("type") == "cable")
    # Dane cieplne ZYLY FAZOWEJ i para temperatur — z karty katalogowej, nie z domyslu.
    assert kabel["jth_1s_a_per_mm2"] > 0
    assert kabel["conductor_material"] in {"AL", "CU"}
    assert kabel["insulation"] in {"XLPE", "EPR", "PVC", "PAPER"}
    assert kabel["operating_temperature_c"] > 0
    assert kabel["short_circuit_temperature_c"] > kabel["operating_temperature_c"]

    # Ta sama droga do grafu, z ktorego czyta analiza cieplna.
    enm = EnergyNetworkModel.model_validate(snapshot)
    graph = map_enm_to_network_graph(enm)
    galaz = next(
        b
        for b in graph.branches.values()
        if getattr(b, "jth_1s_a_per_mm2", None) not in (None, 0.0)
    )
    assert galaz.conductor_material == kabel["conductor_material"]
    assert galaz.insulation == kabel["insulation"]
    assert galaz.operating_temperature_c == kabel["operating_temperature_c"]
    assert galaz.short_circuit_temperature_c == kabel["short_circuit_temperature_c"]


def test_vector_group_consistent_with_catalog_type_accepted() -> None:
    """Grupa żądana == grupa typu katalogowego (Dyn11) → materializacja OK."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload_with_vector_group("Dyn11"),
    )
    assert not result.get("error"), result.get("error")
    assert _block_transformer(result["snapshot"])["vector_group"] == "Dyn11"


def test_vector_group_inconsistent_with_catalog_type_rejected() -> None:
    """Req 7: grupa żądana (Dyn5) ≠ grupa typu katalogowego (Dyn11) → odrzucenie JAWNE,
    bez cichej podmiany na katalogową (zakaz dwóch modeli)."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload_with_vector_group("Dyn5"),
    )
    assert result.get("error"), "Niezgodna grupa połączeń powinna zostać odrzucona."
    assert result["error_code"] == "converter.der_sn.grupa_polaczen_niezgodna_z_katalogiem"


@pytest.mark.parametrize("technology", ["PV", "BESS", "FW"])
def test_all_converter_technologies_materialize_sn_chain(technology: str) -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_sn_payload(technology=technology, source_name=f"Blok {technology}"),
    )
    assert not result.get("error"), result.get("error")
    snap = result["snapshot"]
    _block_transformer(snap)
    EnergyNetworkModel.model_validate(snap)


# ---------------------------------------------------------------------------
# Karta F-K7 (znalezisko Z6, V12K-207): warunki UŁOŻENIA kabla w modelu.
#
# Warunki ułożenia są ZAŁOŻENIEM DOBORU, a nie parametrem fizycznym gałęzi, dlatego
# jadą w `meta`. Muszą jednak jechać: raport zgodności liczy propozycję ponownie i bez
# tego zapisu porównywałby zastosowany kabel z propozycją policzoną dla INNYCH warunków
# (fałszywe odstępstwo ⚠).
# ---------------------------------------------------------------------------


def _der_cable(snapshot: dict) -> dict:
    return next(b for b in snapshot["branches"] if "der_mv_cable" in (b.get("tags") or []))


def _payload_z_warunkami(warunki: object) -> dict:
    payload = _der_sn_payload()
    payload["der_topology"]["mv_field_configuration"]["cable_laying_conditions"] = warunki
    return payload


def test_warunki_ulozenia_kabla_zapisane_przy_kablu() -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami({"set_name": "ziemia_3_kable_warstwa_200mm"}),
    )
    assert not result.get("error"), result.get("error")
    meta = _der_cable(result["snapshot"])["meta"]
    assert meta["cable_laying_conditions"] == {"set_name": "ziemia_3_kable_warstwa_200mm"}
    # Sam WSPÓŁCZYNNIK nie jest kopiowany do modelu — jedno źródło reguły to solver.
    assert "derating_total" not in meta


def test_nazwa_zestawu_moze_byc_podana_jako_tekst() -> None:
    """Skrót dla warstw, które przenoszą samą nazwę (bez opisu współczynników)."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami("ziemia_3_kable_warstwa_200mm"),
    )
    assert not result.get("error"), result.get("error")
    meta = _der_cable(result["snapshot"])["meta"]
    assert meta["cable_laying_conditions"] == {"set_name": "ziemia_3_kable_warstwa_200mm"}


def test_brak_warunkow_ulozenia_nie_zasmieca_modelu() -> None:
    """Warunki katalogowe = brak korekty: model dotychczasowych torów bez zmian."""
    bez = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    jawnie_katalogowe = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami({"set_name": "warunki_katalogowe"}),
    )
    assert not bez.get("error"), bez.get("error")
    assert not jawnie_katalogowe.get("error"), jawnie_katalogowe.get("error")
    assert "cable_laying_conditions" not in _der_cable(bez["snapshot"])["meta"]
    # Poza naglowkiem (znacznik czasu utworzenia modelu) snapshoty musza byc identyczne.
    for klucz in ("branches", "buses", "transformers", "generators", "substations"):
        assert bez["snapshot"][klucz] == jawnie_katalogowe["snapshot"][klucz], klucz


def test_nieznane_warunki_ulozenia_sa_odrzucane_przy_wejsciu_do_modelu() -> None:
    """Fail-closed: literówka nie może wejść do modelu i zamilknąć jako brak korekty."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami({"set_name": "ziemia_5_kabli_rura"}),
    )
    assert result.get("error")
    assert result["error_code"] == "der.mv_cable_laying_conditions_invalid"
    assert "Nieznany zestaw warunków ułożenia" in result["error"]


def test_wlasne_warunki_ulozenia_jada_z_modelem_w_calosci() -> None:
    """Nazwa „wlasne" sama nic nie odtwarza — współczynniki i opis muszą być w modelu."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami(
            {
                "set_name": "wlasne",
                "f_grunt": 0.85,
                "f_wiazka": 1.0,
                "f_grupa": 0.9,
                "opis_pl": "Ziemia, 2 obwody w rurach osłonowych, odstęp 300 mm",
            }
        ),
    )
    assert not result.get("error"), result.get("error")
    zapis = _der_cable(result["snapshot"])["meta"]["cable_laying_conditions"]
    assert zapis["set_name"] == "wlasne"
    assert zapis["f_grunt"] == pytest.approx(0.85)
    assert zapis["f_grupa"] == pytest.approx(0.9)
    assert "rurach osłonowych" in zapis["opis_pl"]


def test_wlasne_warunki_bez_opisu_sa_odrzucane() -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami({"set_name": "wlasne", "f_grunt": 0.85, "f_wiazka": 1.0}),
    )
    assert result.get("error")
    assert result["error_code"] == "der.mv_cable_laying_conditions_invalid"
    assert "opisu" in result["error"]


def test_wspolczynniki_bez_nazwy_zestawu_sa_odrzucane() -> None:
    """Podane wspolczynniki nie moga zostac cicho pominiete jako warunki katalogowe.

    Milczace przyjecie warunkow katalogowych zmienilo by dobor projektanta — a on wlasnie
    podal wartosci, ktore od niego odbiegaja.
    """
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _payload_z_warunkami({"f_grunt": 0.85, "f_wiazka": 1.0, "f_grupa": 0.9}),
    )
    assert result.get("error")
    assert result["error_code"] == "der.mv_cable_laying_conditions_invalid"
    assert "bez nazwy zestawu" in result["error"]
