"""Testy ENM Port + ConnectionNode + LineRun + CableJoint (PR-3 rebuild SLD).

Sprawdza:
1. Instancjacja klas i JSON round-trip.
2. Backward compatibility — opcjonalne pola, brak wymuszania na istniejących projektach.
3. Mapowanie bay_role → port kind.
4. Multi-voltage nN: Substation.nn_voltage_levels obsługuje listę poziomów.
5. CableJoint dla mufy kablowej.
6. LineRun dla ciągu liniowego.
"""

from __future__ import annotations

import pytest
from enm.models import (
    Bay,
    Bus,
    Cable,
    CableJoint,
    ConnectionNode,
    EnergyNetworkModel,
    ENMHeader,
    LineRun,
    LineRunSegmentRef,
    LineRunStationRef,
    OverheadLine,
    Port,
    PortRef,
    Substation,
)


def _make_minimal_header() -> ENMHeader:
    return ENMHeader(version="1.0", name="test")


# ---------------------------------------------------------------------------
# Test 1 — Port instantiation + 15 PortKind values
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kind",
    [
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_transformer",
        "sn_measurement",
        "sn_der_pv",
        "sn_der_bess",
        "sn_der_fw",
        "sn_coupler",
        "sn_reserve",
        "nn_feeder",
        "nn_load",
        "nn_der_pv",
        "nn_der_bess",
        "nn_der_fw",
    ],
)
def test_port_all_15_kinds(kind: str) -> None:
    p = Port(
        id=f"sub_001:bay_1:{kind}",
        kind=kind,  # type: ignore[arg-type]
        nominal_voltage_kv=15.0,
        substation_ref="sub_001",
        bay_ref="bay_1",
    )
    assert p.id == f"sub_001:bay_1:{kind}"
    assert p.kind == kind
    assert p.nominal_voltage_kv == 15.0
    assert p.occupied_by is None
    assert p.meta == {}


def test_port_invalid_kind_rejected() -> None:
    with pytest.raises(Exception):
        Port(
            id="p1",
            kind="invalid_kind",  # type: ignore[arg-type]
            nominal_voltage_kv=15.0,
            substation_ref="s1",
        )


def test_port_ref_simple() -> None:
    ref = PortRef(port_id="sub_001:bay_1:sn_input")
    assert ref.port_id == "sub_001:bay_1:sn_input"


# ---------------------------------------------------------------------------
# Test 2 — ConnectionNode 4 locations
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "location",
    ["bay", "bus", "der_terminal", "branch_point"],
)
def test_connection_node_locations(location: str) -> None:
    cn = ConnectionNode(
        id="cn1",
        location=location,  # type: ignore[arg-type]
        voltage_kv=15.0,
        parent_ref="parent_xyz",
    )
    assert cn.location == location


# ---------------------------------------------------------------------------
# Test 3 — CableJoint (mufa kablowa)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "joint_type",
    ["mufa_termoutwardzalna", "mufa_zimna", "mufa_olejowa", "mufa_zywiczna"],
)
def test_cable_joint_4_types(joint_type: str) -> None:
    cj = CableJoint(
        id="cj1",
        parent_segment_id="cab_1",
        position_km=0.5,
        joint_type=joint_type,  # type: ignore[arg-type]
    )
    assert cj.joint_type == joint_type
    assert cj.position_km == 0.5


# ---------------------------------------------------------------------------
# Test 4 — Cable z endpoint_a_port + cable_joints
# ---------------------------------------------------------------------------


def test_cable_with_endpoints_and_joints() -> None:
    cable = Cable(
        ref_id="cab_1",
        name="Kabel SN F-01.S1",
        from_bus_ref="bus_a",
        to_bus_ref="bus_b",
        status="closed",
        length_km=2.5,
        r_ohm_per_km=0.16,
        x_ohm_per_km=0.10,
        endpoint_a_port=PortRef(port_id="sub_gpz:bay_1:sn_output"),
        endpoint_b_port=PortRef(port_id="sub_st1:bay_1:sn_input"),
        cable_joints=[
            CableJoint(
                id="cj1", parent_segment_id="cab_1", position_km=1.0, joint_type="mufa_zimna"
            ),
            CableJoint(
                id="cj2",
                parent_segment_id="cab_1",
                position_km=2.0,
                joint_type="mufa_termoutwardzalna",
            ),
        ],
    )
    assert cable.endpoint_a_port is not None
    assert cable.endpoint_a_port.port_id == "sub_gpz:bay_1:sn_output"
    assert len(cable.cable_joints) == 2
    assert cable.cable_joints[0].joint_type == "mufa_zimna"


def test_cable_backward_compatible_without_endpoints() -> None:
    """Stary kabel bez endpoint_a_port nadal się instancjuje (opcjonalne)."""
    cable = Cable(
        ref_id="cab_old",
        name="Stary kabel",
        from_bus_ref="bus_a",
        to_bus_ref="bus_b",
        status="closed",
        length_km=1.0,
        r_ohm_per_km=0.16,
        x_ohm_per_km=0.10,
    )
    assert cable.endpoint_a_port is None
    assert cable.endpoint_b_port is None
    assert cable.cable_joints == []


def test_overhead_line_endpoint_ports() -> None:
    line = OverheadLine(
        ref_id="line_1",
        name="Linia napowietrzna F-02",
        from_bus_ref="bus_a",
        to_bus_ref="bus_b",
        status="closed",
        length_km=5.0,
        r_ohm_per_km=0.30,
        x_ohm_per_km=0.40,
        endpoint_a_port=PortRef(port_id="sub_gpz:bay_2:sn_output"),
        endpoint_b_port=PortRef(port_id="sub_st2:bay_1:sn_input"),
    )
    assert line.endpoint_a_port is not None
    assert line.endpoint_b_port is not None


# ---------------------------------------------------------------------------
# Test 5 — Bay z ports + bay_template_ref
# ---------------------------------------------------------------------------


def test_bay_with_ports_and_template() -> None:
    bay = Bay(
        ref_id="bay_1",
        name="Pole liniowe",
        bay_role="OUT",
        substation_ref="sub_gpz",
        bus_ref="bus_section_1",
        ports=[
            Port(
                id="sub_gpz:bay_1:sn_output",
                kind="sn_output",
                nominal_voltage_kv=15.0,
                bay_ref="bay_1",
                substation_ref="sub_gpz",
            )
        ],
        bay_template_ref="bay_template_line_out",
    )
    assert len(bay.ports) == 1
    assert bay.ports[0].kind == "sn_output"
    assert bay.bay_template_ref == "bay_template_line_out"


def test_bay_backward_compatible_without_ports() -> None:
    """Stary Bay bez ports nadal się instancjuje (opcjonalne)."""
    bay = Bay(
        ref_id="old_bay",
        name="Stare pole",
        bay_role="IN",
        substation_ref="sub_gpz",
        bus_ref="bus_1",
    )
    assert bay.ports == []
    assert bay.bay_template_ref is None


# ---------------------------------------------------------------------------
# Test 6 — Substation z external_ports + nn_voltage_levels + construction_type
# ---------------------------------------------------------------------------


def test_substation_with_external_ports_and_multi_voltage_nn() -> None:
    substation = Substation(
        ref_id="sub_st_industrial",
        name="Stacja przemysłowa ST-15",
        station_type="customer",
        bus_refs=["bus_sn_1", "bus_nn_400v", "bus_nn_690v", "bus_nn_6kv"],
        external_ports=[
            Port(
                id="sub_st_industrial:bay_1:sn_input",
                kind="sn_input",
                nominal_voltage_kv=15.0,
                bay_ref="bay_1",
                substation_ref="sub_st_industrial",
            )
        ],
        nn_voltage_levels=[0.4, 0.69, 6.0],
        construction_type="wnetrzowa",
    )
    assert len(substation.external_ports) == 1
    assert substation.nn_voltage_levels == [0.4, 0.69, 6.0]
    assert substation.construction_type == "wnetrzowa"


def test_substation_backward_compatible() -> None:
    """Stara Substation bez external_ports/nn_voltage_levels — defaults działają."""
    substation = Substation(
        ref_id="old_sub",
        name="Stara stacja",
        station_type="mv_lv",
    )
    assert substation.external_ports == []
    assert substation.nn_voltage_levels == []
    assert substation.construction_type is None


# ---------------------------------------------------------------------------
# Test 7 — LineRun
# ---------------------------------------------------------------------------


def test_line_run_main_trunk() -> None:
    lr = LineRun(
        id="lr_main_1",
        name="Ciąg główny F-01",
        run_kind="main_trunk",
        starting_bay_ref="bay_gpz_F01",
        starting_port_ref="sub_gpz:bay_gpz_F01:sn_output",
        segments=[
            LineRunSegmentRef(segment_ref="cab_1", order=0),
            LineRunSegmentRef(segment_ref="cab_2", order=1),
        ],
        stations=[LineRunStationRef(substation_ref="sub_st_1", order=0)],
    )
    assert lr.run_kind == "main_trunk"
    assert len(lr.segments) == 2
    assert len(lr.stations) == 1


@pytest.mark.parametrize(
    "run_kind",
    ["main_trunk", "branch", "ring", "loop"],
)
def test_line_run_4_kinds(run_kind: str) -> None:
    lr = LineRun(
        id=f"lr_{run_kind}",
        run_kind=run_kind,  # type: ignore[arg-type]
        starting_bay_ref="bay_1",
        starting_port_ref="port_1",
    )
    assert lr.run_kind == run_kind


def test_line_run_ring_with_nop() -> None:
    lr = LineRun(
        id="lr_ring_1",
        run_kind="ring",
        starting_bay_ref="bay_gpz_F01",
        starting_port_ref="sub_gpz:bay_gpz_F01:sn_output",
        nop_station_ref="sub_st_3",  # NOP w stacji ST-3
    )
    assert lr.nop_station_ref == "sub_st_3"


# ---------------------------------------------------------------------------
# Test 8 — EnergyNetworkModel z line_runs + connection_nodes
# ---------------------------------------------------------------------------


def test_enm_with_line_runs_and_connection_nodes() -> None:
    model = EnergyNetworkModel(
        header=_make_minimal_header(),
        buses=[
            Bus(ref_id="bus_1", name="GPZ Sekcja I", voltage_kv=15.0),
        ],
        substations=[
            Substation(ref_id="sub_gpz", name="GPZ", station_type="gpz"),
        ],
        bays=[
            Bay(
                ref_id="bay_F01",
                name="Pole F-01",
                bay_role="OUT",
                substation_ref="sub_gpz",
                bus_ref="bus_1",
            ),
        ],
        line_runs=[
            LineRun(
                id="lr_F01",
                name="Ciąg F-01",
                run_kind="main_trunk",
                starting_bay_ref="bay_F01",
                starting_port_ref="sub_gpz:bay_F01:sn_output",
            ),
        ],
        connection_nodes=[
            ConnectionNode(
                id="cn:sub_gpz:bay_F01",
                location="bay",
                voltage_kv=15.0,
                parent_ref="bay_F01",
            ),
        ],
    )
    assert len(model.line_runs) == 1
    assert len(model.connection_nodes) == 1


def test_enm_backward_compatible_without_new_collections() -> None:
    """Stary ENM bez line_runs/connection_nodes nadal się instancjuje."""
    model = EnergyNetworkModel(header=_make_minimal_header())
    assert model.line_runs == []
    assert model.connection_nodes == []


# ---------------------------------------------------------------------------
# Test 9 — JSON round-trip stable (deterministic)
# ---------------------------------------------------------------------------


def test_json_round_trip_with_ports() -> None:
    original = EnergyNetworkModel(
        header=_make_minimal_header(),
        buses=[Bus(ref_id="bus_1", name="B1", voltage_kv=15.0)],
        substations=[
            Substation(
                ref_id="sub_gpz",
                name="GPZ",
                station_type="gpz",
                external_ports=[
                    Port(
                        id="sub_gpz:bay_1:sn_output",
                        kind="sn_output",
                        nominal_voltage_kv=15.0,
                        substation_ref="sub_gpz",
                        bay_ref="bay_1",
                    )
                ],
                nn_voltage_levels=[0.4, 0.69],
            )
        ],
        connection_nodes=[
            ConnectionNode(id="cn1", location="bay", voltage_kv=15.0, parent_ref="bay_1"),
        ],
    )
    json_str = original.model_dump_json()
    restored = EnergyNetworkModel.model_validate_json(json_str)

    assert restored.substations[0].external_ports[0].kind == "sn_output"
    assert restored.substations[0].nn_voltage_levels == [0.4, 0.69]
    assert restored.connection_nodes[0].location == "bay"


# ---------------------------------------------------------------------------
# Test 10 — automigracja v_ports_001
# ---------------------------------------------------------------------------


def test_migration_v_ports_001_idempotent() -> None:
    from enm.migrations.v_ports_001 import migrate, needs_migration

    model = EnergyNetworkModel(
        header=_make_minimal_header(),
        buses=[Bus(ref_id="bus_1", name="B1", voltage_kv=15.0)],
        substations=[
            Substation(ref_id="sub_gpz", name="GPZ", station_type="gpz"),
        ],
        bays=[
            Bay(
                ref_id="bay_in",
                name="Bay IN",
                bay_role="IN",
                substation_ref="sub_gpz",
                bus_ref="bus_1",
            ),
            Bay(
                ref_id="bay_out",
                name="Bay OUT",
                bay_role="OUT",
                substation_ref="sub_gpz",
                bus_ref="bus_1",
            ),
            Bay(
                ref_id="bay_tr",
                name="Bay TR",
                bay_role="TR",
                substation_ref="sub_gpz",
                bus_ref="bus_1",
            ),
            Bay(
                ref_id="bay_oze",
                name="Bay OZE",
                bay_role="OZE",
                substation_ref="sub_gpz",
                bus_ref="bus_1",
            ),
        ],
    )

    assert needs_migration(model) is True

    migrated, stats = migrate(model)
    assert stats["bays_migrated"] == 4
    assert stats["ports_added"] == 4
    assert stats["connection_nodes_added"] == 4
    assert stats["substations_extended"] == 1

    # Każdy Bay ma 1 port wygenerowany z bay_role
    for bay in migrated.bays:
        assert len(bay.ports) == 1
        assert bay.ports[0].nominal_voltage_kv == 15.0
        assert bay.ports[0].meta.get("migrated_from") == "v_ports_001"

    # Mapping bay_role → port kind
    role_to_kind = {b.bay_role: b.ports[0].kind for b in migrated.bays}
    assert role_to_kind["IN"] == "sn_input"
    assert role_to_kind["OUT"] == "sn_output"
    assert role_to_kind["TR"] == "sn_transformer"
    assert role_to_kind["OZE"] == "sn_der_pv"

    # Idempotency: drugi run nic nie zmienia
    assert needs_migration(migrated) is False
    migrated2, stats2 = migrate(migrated)
    assert stats2["bays_migrated"] == 0
    assert stats2["skipped_reason"] == "already_migrated"


# ---------------------------------------------------------------------------
# Test 11 — BayTemplate registry
# ---------------------------------------------------------------------------


def test_bay_template_registry_has_10_templates() -> None:
    from network_model.catalog.bay_templates import (
        BAY_TEMPLATE_REGISTRY,
        list_bay_templates,
    )

    assert len(BAY_TEMPLATE_REGISTRY) == 10
    templates = list_bay_templates()
    assert {t.template_id for t in templates} == {
        "bay_template_line_in",
        "bay_template_line_out",
        "bay_template_transformer",
        "bay_template_measurement",
        "bay_template_coupler",
        "bay_template_der_pv",
        "bay_template_der_bess",
        "bay_template_der_fw",
        "bay_template_reserve",
        "bay_template_aux",
    }


def test_bay_template_line_in_canonical_devices() -> None:
    from network_model.catalog.bay_templates import get_bay_template

    t = get_bay_template("bay_template_line_in")
    # Sekwencja: DS_BUS → CB → CT → DS_LINE → ES → CABLE_HEAD
    kinds = [d.kind for d in t.devices]
    assert kinds == ["DS_BUS", "CB", "CT", "DS_LINE", "ES", "CABLE_HEAD"]
    # ES jest na GROUND_BRANCH (boczny tor)
    es_device = [d for d in t.devices if d.kind == "ES"][0]
    assert es_device.placement == "GROUND_BRANCH"


# ---------------------------------------------------------------------------
# Test 12 — StationTemplate registry
# ---------------------------------------------------------------------------


def test_station_template_registry_has_9_templates() -> None:
    from network_model.catalog.station_templates import (
        STATION_TEMPLATE_REGISTRY,
        list_station_templates,
    )

    assert len(STATION_TEMPLATE_REGISTRY) == 9
    templates = list_station_templates()
    assert {t.topological_type for t in templates} == {
        "końcowa",
        "przelotowa",
        "odgałęźna",
        "sekcyjna",
    }


def test_station_template_industrial_has_multi_voltage_nn() -> None:
    from network_model.catalog.station_templates import get_station_template

    t = get_station_template("station_template_industrial_custom_nn")
    # Multi-voltage nN: 6 kV + 0.4 kV
    assert {sw.nn_voltage_kv for sw in t.nn_switchgears} == {6.0, 0.4}
    # 2 transformatory
    assert len(t.transformers) == 2
    assert {tr.lv_voltage_kv for tr in t.transformers} == {6.0, 0.4}
