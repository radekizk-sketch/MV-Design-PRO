"""Testy konserwatywnej migracji endpoint_a_port / endpoint_b_port.

3 scenariusze:
- 1 kandydat → przypisanie portu
- 0 kandydatów → pozostawiony None + zapis w ambiguities (no_candidates)
- >1 kandydat → pozostawiony None + zapis w ambiguities (multiple_candidates)

Plus regresja idempotentności i kompatybilności napięcia.
"""

from __future__ import annotations

from enm.migrations.endpoint_ports import (
    MIGRATION_VERSION,
    EndpointPortsMigrationReport,
    migrate,
    needs_migration,
)
from enm.models import (
    Bay,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    OverheadLine,
    Port,
    Substation,
)


def _make_bay(
    *,
    ref_id: str,
    substation_ref: str,
    bus_ref: str,
    role: str,
    port_id: str,
    port_kind: str,
    voltage_kv: float,
) -> Bay:
    return Bay(
        ref_id=ref_id,
        name=ref_id,
        bay_role=role,  # type: ignore[arg-type]
        substation_ref=substation_ref,
        bus_ref=bus_ref,
        ports=[
            Port(
                id=port_id,
                kind=port_kind,  # type: ignore[arg-type]
                nominal_voltage_kv=voltage_kv,
                bay_ref=ref_id,
                substation_ref=substation_ref,
            )
        ],
    )


def _build_model_with_single_candidate_per_side() -> EnergyNetworkModel:
    """Dwie szyny 15 kV, po jednym polu (LINE_OUT / LINE_IN), kabel między nimi."""
    bus_a = Bus(ref_id="bus_a", name="Sz_A", voltage_kv=15.0)
    bus_b = Bus(ref_id="bus_b", name="Sz_B", voltage_kv=15.0)
    bay_a = _make_bay(
        ref_id="bay_a_out",
        substation_ref="st_a",
        bus_ref="bus_a",
        role="OUT",
        port_id="port_a_out",
        port_kind="sn_output",
        voltage_kv=15.0,
    )
    bay_b = _make_bay(
        ref_id="bay_b_in",
        substation_ref="st_b",
        bus_ref="bus_b",
        role="IN",
        port_id="port_b_in",
        port_kind="sn_input",
        voltage_kv=15.0,
    )
    sub_a = Substation(
        ref_id="st_a",
        name="Stacja A",
        station_type="gpz",
        bus_refs=["bus_a"],
    )
    sub_b = Substation(
        ref_id="st_b",
        name="Stacja B",
        station_type="mv_lv",
        bus_refs=["bus_b"],
    )
    cable = Cable(
        ref_id="cable_ab",
        name="Kabel A→B",
        from_bus_ref="bus_a",
        to_bus_ref="bus_b",
        length_km=2.0,
        r_ohm_per_km=0.206,
        x_ohm_per_km=0.073,
        catalog_ref="cable-tfk-yakxs-3x120",
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="single-candidate"),
        buses=[bus_a, bus_b],
        branches=[cable],
        substations=[sub_a, sub_b],
        bays=[bay_a, bay_b],
    )


def test_migration_single_candidate_assigns_port():
    model = _build_model_with_single_candidate_per_side()
    assert needs_migration(model) is True

    migrated, report = migrate(model)

    assert isinstance(report, EndpointPortsMigrationReport)
    assert report.migration_version == MIGRATION_VERSION
    assert report.connections_scanned == 1
    assert report.endpoints_assigned == 2
    assert report.endpoints_left_unassigned == 0
    assert report.connections_already_complete == 0
    assert report.ambiguities == []

    cable = migrated.branches[0]
    assert isinstance(cable, Cable)
    assert cable.endpoint_a_port is not None
    assert cable.endpoint_b_port is not None
    assert cable.endpoint_a_port.port_id == "port_a_out"
    assert cable.endpoint_b_port.port_id == "port_b_in"

    # Migracja zaznacza port jako zajęty (occupied_by)
    port_a = migrated.bays[0].ports[0]
    port_b = migrated.bays[1].ports[0]
    assert port_a.occupied_by == "cable_ab"
    assert port_b.occupied_by == "cable_ab"

    # Idempotency: powtórny run nie dodaje nowych przypisań.
    assert needs_migration(migrated) is False
    _, report2 = migrate(migrated)
    assert report2.endpoints_assigned == 0
    assert report2.connections_already_complete == 1


def test_migration_no_candidates_leaves_endpoint_none():
    """Szyna B nie ma pól LINE_IN → 0 kandydatów."""
    model = _build_model_with_single_candidate_per_side()
    model.bays = [model.bays[0]]  # usuń pole na bus_b
    model.substations[1].bus_refs = []
    assert needs_migration(model) is True

    _, report = migrate(model)

    assert report.endpoints_assigned == 1  # tylko bus_a ma pole
    assert report.endpoints_left_unassigned == 1
    assert len(report.ambiguities) == 1
    amb = report.ambiguities[0]
    assert amb.endpoint == "b"
    assert amb.bus_ref == "bus_b"
    assert amb.reason == "no_candidates"
    assert amb.candidate_count == 0

    cable = model.branches[0]
    assert isinstance(cable, Cable)
    assert cable.endpoint_a_port is not None  # bus_a — jeden kandydat
    assert cable.endpoint_b_port is None  # bus_b — bez kandydatów


def test_migration_multiple_candidates_leaves_endpoint_none():
    """Szyna A ma dwa pola LINE_OUT → >1 kandydat → migracja zostawia None."""
    model = _build_model_with_single_candidate_per_side()
    extra_bay = _make_bay(
        ref_id="bay_a_out_2",
        substation_ref="st_a",
        bus_ref="bus_a",
        role="OUT",
        port_id="port_a_out_2",
        port_kind="sn_output",
        voltage_kv=15.0,
    )
    model.bays.append(extra_bay)

    _, report = migrate(model)

    # endpoint A nie zostaje przypisany (2 kandydatów); endpoint B — jeden kandydat.
    assert report.endpoints_assigned == 1
    assert report.endpoints_left_unassigned == 1
    assert len(report.ambiguities) == 1
    amb = report.ambiguities[0]
    assert amb.endpoint == "a"
    assert amb.reason == "multiple_candidates"
    assert amb.candidate_count == 2
    assert set(amb.candidate_port_ids) == {"port_a_out", "port_a_out_2"}

    cable = model.branches[0]
    assert isinstance(cable, Cable)
    assert cable.endpoint_a_port is None
    assert cable.endpoint_b_port is not None


def test_migration_voltage_mismatch_excluded():
    """Port o napięciu znamionowym ≠ napięcie szyny nie jest kandydatem."""
    model = _build_model_with_single_candidate_per_side()
    # Podmiana napięcia portu na bus_a — 6 kV ≠ 15 kV szyny.
    model.bays[0].ports[0] = Port(
        id="port_a_wrong_voltage",
        kind="sn_output",
        nominal_voltage_kv=6.0,
        bay_ref="bay_a_out",
        substation_ref="st_a",
    )

    _, report = migrate(model)

    # Brak kandydatów na bus_a (port_a ma 6 kV, szyna 15 kV).
    assert report.endpoints_assigned == 1  # tylko bus_b
    assert any(amb.endpoint == "a" and amb.reason == "no_candidates" for amb in report.ambiguities)


def test_migration_overhead_line_works_same_way():
    model = _build_model_with_single_candidate_per_side()
    # Zamień Cable na OverheadLine
    model.branches = [
        OverheadLine(
            ref_id="line_ab",
            name="Linia A→B",
            from_bus_ref="bus_a",
            to_bus_ref="bus_b",
            length_km=4.5,
            r_ohm_per_km=0.443,
            x_ohm_per_km=0.340,
            catalog_ref="line-ahxsm-50",
        )
    ]

    _, report = migrate(model)

    assert report.endpoints_assigned == 2
    line = model.branches[0]
    assert isinstance(line, OverheadLine)
    assert line.endpoint_a_port is not None
    assert line.endpoint_b_port is not None


def test_migration_incompatible_port_kind_excluded():
    """Port pomiarowy (sn_measurement) nie jest kandydatem dla kabla SN łączącego pola liniowe."""
    model = _build_model_with_single_candidate_per_side()
    model.bays[0].ports[0] = Port(
        id="port_a_meas",
        kind="sn_measurement",
        nominal_voltage_kv=15.0,
        bay_ref="bay_a_out",
        substation_ref="st_a",
    )

    _, report = migrate(model)

    # Endpoint A — port pomiarowy odrzucony → brak kandydatów.
    assert report.endpoints_assigned == 1
    assert any(amb.endpoint == "a" and amb.reason == "no_candidates" for amb in report.ambiguities)


def test_migration_empty_model_is_noop():
    model = EnergyNetworkModel(header=ENMHeader(name="empty"))
    assert needs_migration(model) is False

    _, report = migrate(model)

    assert report.connections_scanned == 0
    assert report.endpoints_assigned == 0
    assert report.endpoints_left_unassigned == 0
    assert report.assignments == []
    assert report.ambiguities == []


def test_migration_report_to_dict_deterministic():
    model = _build_model_with_single_candidate_per_side()
    _, report = migrate(model)

    payload = report.to_dict()
    assert payload["migration_version"] == MIGRATION_VERSION
    assert payload["connections_scanned"] == 1
    assert payload["endpoints_assigned"] == 2
    assert len(payload["assignments"]) == 2
    # Deterministyczna kolejność (sortowanie po port_id w _find_endpoint_candidates).
    assignment_ids = [a["port_id"] for a in payload["assignments"]]
    assert assignment_ids == sorted(assignment_ids)
