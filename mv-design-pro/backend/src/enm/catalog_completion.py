from __future__ import annotations

from hashlib import sha256
from typing import Any

from enm.models import EnergyNetworkModel, Load

DEFAULT_LOAD_CATALOG_REF = "load_uslugi_30kw"
DEFAULT_LOAD_KW = 30.0
DEFAULT_LOAD_COS_PHI = 0.92
DEFAULT_ZKSN_SWITCH_STATE = "closed"


def complete_catalog_defaults(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Domknij katalogowe migracje wymagane przy granicy ENM."""
    completed, loads_changed = complete_station_loads_from_nn_feeders(enm)
    completed, branch_points_changed = complete_zksn_switch_states(completed)
    return completed, loads_changed or branch_points_changed


def complete_station_loads_from_nn_feeders(
    enm: EnergyNetworkModel,
) -> tuple[EnergyNetworkModel, bool]:
    """Materialize catalog loads for legacy station feeders without loads.

    Older station templates could create nN outgoing feeders without ENM load
    elements. The product contract is catalog-complete station materialization,
    so this migration closes that gap deterministically at the ENM boundary.
    """
    existing_feeder_refs = {
        feeder_ref for load in enm.loads for feeder_ref in [_load_feeder_ref(load)] if feeder_ref
    }
    bus_refs = {bus.ref_id for bus in enm.buses}
    additions: list[Load] = []

    for substation in enm.substations:
        if substation.station_type == "gpz":
            continue
        feeder_specs = _nn_feeder_specs(substation.meta)
        for index, spec in enumerate(feeder_specs, start=1):
            feeder_ref = spec.get("field_ref")
            bus_ref = spec.get("bus_ref")
            if not isinstance(feeder_ref, str) or not feeder_ref.strip():
                continue
            if feeder_ref in existing_feeder_refs:
                continue
            if not isinstance(bus_ref, str) or bus_ref not in bus_refs:
                continue
            additions.append(
                _build_default_load(substation.ref_id, substation.name, feeder_ref, bus_ref, index)
            )
            existing_feeder_refs.add(feeder_ref)

    if not additions:
        return enm, False

    completed = enm.model_copy(deep=True)
    completed.loads = [*completed.loads, *additions]
    return completed, True


def complete_zksn_switch_states(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Uzupełnij domyślny stan normalny ZKSN dla starszych snapshotów.

    ZKSN pokazywany w UI jest kompletnym rozwiązaniem katalogowym. Starsze
    snapshoty mogły przechowywać wariant katalogowy bez stanu normalnego
    łącznika; na granicy ENM deterministycznie materializujemy stan zamknięty.
    """
    missing = [
        bp
        for bp in enm.branch_points
        if bp.branch_point_type == "zksn" and bp.catalog_ref and bp.switch_state is None
    ]
    if not missing:
        return enm, False

    completed = enm.model_copy(deep=True)
    for branch_point in completed.branch_points:
        if (
            branch_point.branch_point_type == "zksn"
            and branch_point.catalog_ref
            and branch_point.switch_state is None
        ):
            branch_point.switch_state = DEFAULT_ZKSN_SWITCH_STATE
            runtime_inputs = branch_point.runtime_inputs if isinstance(branch_point.runtime_inputs, dict) else {}
            branch_point.runtime_inputs = {
                **runtime_inputs,
                "switch_state": DEFAULT_ZKSN_SWITCH_STATE,
                "completion_source": "branch_point_catalog_migration",
            }
    return completed, True


def _load_feeder_ref(load: Load) -> str | None:
    meta = load.meta if isinstance(load.meta, dict) else {}
    feeder_ref = meta.get("feeder_ref")
    return feeder_ref if isinstance(feeder_ref, str) and feeder_ref.strip() else None


def _nn_feeder_specs(meta: dict[str, Any]) -> list[dict[str, Any]]:
    raw_specs = meta.get("nn_field_specs") if isinstance(meta, dict) else None
    if not isinstance(raw_specs, list):
        return []
    return [
        spec
        for spec in raw_specs
        if isinstance(spec, dict)
        and spec.get("bay_role") == "FEEDER"
        and isinstance(spec.get("field_ref"), str)
    ]


def _build_default_load(
    station_ref: str,
    station_name: str,
    feeder_ref: str,
    bus_ref: str,
    index: int,
) -> Load:
    seed = sha256(f"catalog-load|{station_ref}|{feeder_ref}".encode()).hexdigest()[:32]
    return Load(
        ref_id=f"load/{seed}/nn",
        name=f"Odbiór nN {index} - {station_name}",
        bus_ref=bus_ref,
        p_mw=DEFAULT_LOAD_KW / 1000.0,
        q_mvar=0.0,
        model="pq",
        catalog_ref=DEFAULT_LOAD_CATALOG_REF,
        catalog_namespace="OBCIAZENIE",
        parameter_source="CATALOG",
        source_mode="KATALOG",
        materialized_params={
            "catalog_item_id": DEFAULT_LOAD_CATALOG_REF,
            "p_kw": DEFAULT_LOAD_KW,
            "cos_phi": DEFAULT_LOAD_COS_PHI,
        },
        meta={
            "feeder_ref": feeder_ref,
            "load_kind": "SKUPIONY",
            "connection_type": "TROJFAZOWY",
            "cos_phi": DEFAULT_LOAD_COS_PHI,
            "completion_source": "station_catalog_migration",
            "catalog_binding": {
                "catalog_namespace": "OBCIAZENIE",
                "catalog_item_id": DEFAULT_LOAD_CATALOG_REF,
                "catalog_item_version": "2024.1",
                "materialize": True,
                "snapshot_mapping_version": "1.0",
            },
        },
    )
