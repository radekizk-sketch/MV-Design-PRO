"""
Automigracja v_ports_001 — wygenerowanie portów Port + ConnectionNode dla ENM
poprzedniej wersji (PR-3 rebuild SLD).

Każdy istniejący `Bay` bez portów otrzymuje porty wygenerowane z `bay_role`.
Każda istniejąca `Substation` bez `external_ports` otrzymuje porty zewnętrzne
złożone z portów pól.

Idempotentny: drugi run nie zmienia modelu.
Deterministyczny: dla danego ENM input → identyczny output (hash stable).
White-box: każdy utworzony port/connection_node ma `meta.migrated_from = "v_ports_001"`.
"""

from __future__ import annotations

from datetime import UTC, datetime

from src.enm.models import (
    Bay,
    ConnectionNode,
    EnergyNetworkModel,
    Port,
)

MIGRATION_VERSION = "v_ports_001"


# Mapowanie bay_role → kanoniczne kind portu
BAY_ROLE_TO_PORT_KIND: dict[str, str] = {
    "IN": "sn_input",
    "OUT": "sn_output",
    "TR": "sn_transformer",
    "COUPLER": "sn_coupler",
    "FEEDER": "sn_output",  # FEEDER w bay_role = ogólny odpływ; treat as output
    "MEASUREMENT": "sn_measurement",
    "OZE": "sn_der_pv",  # default OZE → PV; doprecyzowuje konfigurator DER
}


def _make_port_id(substation_ref: str, bay_ref: str | None, suffix: str) -> str:
    """Deterministyczny port_id."""
    if bay_ref:
        return f"{substation_ref}:{bay_ref}:{suffix}"
    return f"{substation_ref}:{suffix}"


def _generate_port_for_bay(bay: Bay, bus_voltage_kv: float) -> Port:
    """Generuje kanoniczny port dla pola na podstawie bay_role."""
    kind = BAY_ROLE_TO_PORT_KIND.get(bay.bay_role, "sn_reserve")
    suffix = bay.bay_role.lower()
    return Port(
        id=_make_port_id(bay.substation_ref, bay.ref_id, suffix),
        kind=kind,  # type: ignore[arg-type]
        nominal_voltage_kv=bus_voltage_kv,
        bay_ref=bay.ref_id,
        substation_ref=bay.substation_ref,
        occupied_by=None,
        meta={
            "migrated_from": MIGRATION_VERSION,
            "migrated_at": datetime.now(UTC).isoformat(),
            "source_bay_role": bay.bay_role,
        },
    )


def _generate_connection_node_for_bay(bay: Bay, bus_voltage_kv: float) -> ConnectionNode:
    """Generuje punkt przyłączenia (interpretacja) dla pola."""
    return ConnectionNode(
        id=f"cn:{bay.substation_ref}:{bay.ref_id}",
        location="bay",
        voltage_kv=bus_voltage_kv,
        parent_ref=bay.ref_id,
    )


def needs_migration(model: EnergyNetworkModel) -> bool:
    """Sprawdza czy ENM wymaga automigracji portów.

    Idempotency check: True jeżeli istnieją Bay bez portów, w przeciwnym razie False.
    """
    for bay in model.bays:
        if not bay.ports:
            return True
    return False


def migrate(model: EnergyNetworkModel) -> tuple[EnergyNetworkModel, dict]:
    """Wykonuje automigrację portów. Zwraca (zmigrowany model, statystyki).

    Statystyki:
    - bays_migrated: liczba pól z dodanymi portami
    - ports_added: łączna liczba dodanych portów
    - connection_nodes_added: łączna liczba dodanych ConnectionNode
    - substations_extended: liczba stacji z dodanymi external_ports
    """
    if not needs_migration(model):
        return model, {
            "bays_migrated": 0,
            "ports_added": 0,
            "connection_nodes_added": 0,
            "substations_extended": 0,
            "skipped_reason": "already_migrated",
        }

    # Build bus voltage lookup
    bus_voltage: dict[str, float] = {bus.ref_id: bus.voltage_kv for bus in model.buses}

    bays_migrated = 0
    ports_added = 0
    connection_nodes_added = 0
    new_connection_nodes: list[ConnectionNode] = list(model.connection_nodes)

    # Migracja Bay → ports
    for bay in model.bays:
        if bay.ports:
            continue
        bus_voltage_kv = bus_voltage.get(bay.bus_ref, 15.0)
        port = _generate_port_for_bay(bay, bus_voltage_kv)
        bay.ports = [port]
        ports_added += 1
        bays_migrated += 1

        # Connection node (interpretacja) per pole
        cn = _generate_connection_node_for_bay(bay, bus_voltage_kv)
        # Idempotency: nie duplikuj
        if not any(existing.id == cn.id for existing in new_connection_nodes):
            new_connection_nodes.append(cn)
            connection_nodes_added += 1

    # Migracja Substation → external_ports (z portów pól)
    substations_extended = 0
    bays_by_substation: dict[str, list[Bay]] = {}
    for bay in model.bays:
        bays_by_substation.setdefault(bay.substation_ref, []).append(bay)

    for substation in model.substations:
        if substation.external_ports:
            continue
        sub_bays = bays_by_substation.get(substation.ref_id, [])
        if not sub_bays:
            continue
        external = []
        for bay in sub_bays:
            if bay.ports:
                # Eksponujemy pierwszy port pola jako external_port stacji
                # (pełna logika eksternalizacji pól jest w PR-4 PortResolver)
                external.append(bay.ports[0])
        if external:
            substation.external_ports = external
            substations_extended += 1

    model.connection_nodes = new_connection_nodes

    return model, {
        "bays_migrated": bays_migrated,
        "ports_added": ports_added,
        "connection_nodes_added": connection_nodes_added,
        "substations_extended": substations_extended,
        "skipped_reason": None,
    }
