from __future__ import annotations

import math
from copy import deepcopy
from hashlib import sha256
from typing import Any

from enm.models import BranchRating, Cable, EnergyNetworkModel, Load, OverheadLine
from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.types import CatalogBinding, LoadType

DEFAULT_LOAD_CATALOG_REF = "load_uslugi_30kw"
DEFAULT_LOAD_KW = 30.0
#: cosφ deklarowany przez pozycję katalogową `load_uslugi_30kw` — stała
#: dokumentuje parytet modułu z katalogiem. Wartością UŻYWANĄ do wyprowadzenia
#: mocy biernej jest cosφ ODCZYTANY Z KATALOGU (jedno źródło prawdy tabliczki),
#: żeby dane odbioru nie mogły rozjechać się z pozycją katalogową.
DEFAULT_LOAD_COS_PHI = 0.92
DEFAULT_ZKSN_SWITCH_STATE = "closed"
CATALOG_VERSION_DEFAULT = "2026.01"


def complete_catalog_defaults(enm: EnergyNetworkModel) -> tuple[EnergyNetworkModel, bool]:
    """Domknij katalogowe migracje wymagane przy granicy ENM."""
    completed, loads_changed = complete_station_loads_from_nn_feeders(enm)
    completed, branch_points_changed = complete_zksn_switch_states(completed)
    completed, branch_point_materialization_changed = complete_branch_point_catalog_materialization(
        completed
    )
    completed, branch_materialization_changed = complete_branch_catalog_materialization(completed)
    return (
        completed,
        loads_changed
        or branch_points_changed
        or branch_point_materialization_changed
        or branch_materialization_changed,
    )


def _branch_point_catalog_params(catalog_ref: str | None) -> dict[str, Any]:
    if not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return {}
    try:
        from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types

        for item in get_all_branch_point_types():
            if item.get("id") == catalog_ref:
                params = item.get("params")
                return deepcopy(params) if isinstance(params, dict) else {}
    except Exception:
        return {}
    return {}


def _branch_point_port_count(
    *,
    branch_point_type: str,
    catalog_ref: str | None,
    catalog_params: dict[str, Any],
    branch_ports: list[str],
) -> int:
    if branch_point_type == "branch_pole":
        return 1
    try:
        raw = catalog_params.get("branch_ports_count")
        value = int(raw)
    except (TypeError, ValueError):
        value = 2 if "2P" in str(catalog_ref or "").upper() else len(branch_ports) or 1
    return max(1, min(2, value))


def _branch_point_route_ports(
    branch_point_type: str, branch_ports_count: int
) -> list[dict[str, Any]]:
    medium = "LINE_OVERHEAD" if branch_point_type == "branch_pole" else "CABLE"
    route_ports: list[dict[str, Any]] = [
        {"port_id": "MAIN_IN", "role": "ciag_wejscie", "medium": medium},
        {"port_id": "MAIN_OUT", "role": "ciag_wyjscie", "medium": medium},
    ]
    for idx in range(1, branch_ports_count + 1):
        route_ports.append(
            {
                "port_id": f"BRANCH_{idx}" if branch_ports_count > 1 else "BRANCH",
                "role": "odgalezienie",
                "medium": medium,
            }
        )
    return route_ports


def _zksn_switchgear_field_specs(branch_ports_count: int) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = [
        {
            "field_ref": "FIELD_IN",
            "designation": "WE",
            "bay_role": "IN",
            "field_type": "pole_liniowe",
            "port_id": "MAIN_IN",
        },
        {
            "field_ref": "FIELD_OUT",
            "designation": "WY",
            "bay_role": "OUT",
            "field_type": "pole_liniowe",
            "port_id": "MAIN_OUT",
        },
    ]
    for idx in range(1, branch_ports_count + 1):
        fields.append(
            {
                "field_ref": f"FIELD_BRANCH_{idx}",
                "designation": f"ODG {idx}",
                "bay_role": "BRANCH",
                "field_type": "pole_odgalezne",
                "port_id": f"BRANCH_{idx}" if branch_ports_count > 1 else "BRANCH",
            }
        )
    return fields


def _materialized_branch_point_params(
    *,
    branch_point_type: str,
    catalog_ref: str,
    catalog_namespace: str | None,
    catalog_params: dict[str, Any],
    branch_ports_count: int,
    existing: dict[str, Any],
) -> dict[str, Any]:
    materialized: dict[str, Any] = {
        **catalog_params,
        **existing,
        "catalog_item_id": catalog_ref,
        "catalog_namespace": catalog_namespace or "mv_branch_points",
        "has_transformer": False,
        "route_ports": _branch_point_route_ports(branch_point_type, branch_ports_count),
    }
    if branch_point_type == "zksn":
        materialized["object_role"] = "MV_SWITCHGEAR_BRANCH_NODE"
        materialized["switchgear_kind"] = "ROZDZIELNIA_SN_BEZ_TRANSFORMATORA"
        materialized["switchgear_field_specs"] = _zksn_switchgear_field_specs(branch_ports_count)
    else:
        switch_device_kind = str(materialized.get("switch_device_kind") or "ROZLACZNIK")
        rated_current = materialized.get("switch_rated_current_a") or 630.0
        materialized["object_role"] = "OVERHEAD_BRANCH_POLE"
        materialized["has_switchgear"] = False
        materialized["apparatus_specs"] = [
            {
                "apparatus_role": "BRANCH_SWITCH",
                "device_kind": switch_device_kind,
                "rated_current_a": rated_current,
                "port_id": "BRANCH",
            }
        ]
    return materialized


def _branch_point_needs_materialization(
    branch_point_type: str,
    materialized: dict[str, Any],
) -> bool:
    if not materialized:
        return True
    if materialized.get("has_transformer") is not False:
        return True
    if not isinstance(materialized.get("route_ports"), list):
        return True
    if branch_point_type == "zksn":
        return not isinstance(materialized.get("switchgear_field_specs"), list)
    return not isinstance(materialized.get("apparatus_specs"), list)


def complete_branch_point_catalog_materialization(
    enm: EnergyNetworkModel,
) -> tuple[EnergyNetworkModel, bool]:
    """Uzupełnij kompletne rozwiązania katalogowe punktów rozgałęźnych SN.

    Starsze snapshoty mogły zapisać ZKSN albo słup rozgałęźny jako sam punkt
    topologiczny. Na granicy ENM materializujemy katalog: ZKSN jako rozdzielnię
    SN bez transformatora, słup jako punkt linii napowietrznej z aparatem
    odgałęźnym. Renderer nie może dopowiadać tej semantyki.
    """
    candidates = [
        bp
        for bp in enm.branch_points
        if bp.catalog_ref
        and _branch_point_needs_materialization(
            bp.branch_point_type,
            bp.materialized_params if isinstance(bp.materialized_params, dict) else {},
        )
    ]
    if not candidates:
        return enm, False

    completed = enm.model_copy(deep=True)
    changed = False

    for branch_point in completed.branch_points:
        if not branch_point.catalog_ref:
            continue
        existing = (
            branch_point.materialized_params
            if isinstance(branch_point.materialized_params, dict)
            else {}
        )
        if not _branch_point_needs_materialization(branch_point.branch_point_type, existing):
            continue
        catalog_params = _branch_point_catalog_params(branch_point.catalog_ref)
        ports = branch_point.ports
        branch_ports = ports.BRANCH if ports is not None else []
        branch_ports_count = _branch_point_port_count(
            branch_point_type=branch_point.branch_point_type,
            catalog_ref=branch_point.catalog_ref,
            catalog_params=catalog_params,
            branch_ports=branch_ports,
        )
        materialized = _materialized_branch_point_params(
            branch_point_type=branch_point.branch_point_type,
            catalog_ref=branch_point.catalog_ref,
            catalog_namespace=branch_point.catalog_namespace,
            catalog_params=catalog_params,
            branch_ports_count=branch_ports_count,
            existing=existing,
        )
        branch_point.materialized_params = materialized
        branch_point.catalog_namespace = branch_point.catalog_namespace or "mv_branch_points"
        branch_point.source_mode = branch_point.source_mode or "KATALOG"
        branch_point.completeness_status = "KOMPLETNY"
        if branch_point.switch_state is None:
            branch_point.switch_state = DEFAULT_ZKSN_SWITCH_STATE
        runtime_inputs = (
            branch_point.runtime_inputs if isinstance(branch_point.runtime_inputs, dict) else {}
        )
        branch_point.runtime_inputs = {
            **runtime_inputs,
            "branch_ports_count": branch_ports_count,
            "route_ports": materialized.get("route_ports"),
            "switchgear_field_specs": materialized.get("switchgear_field_specs"),
            "apparatus_specs": materialized.get("apparatus_specs"),
            "has_transformer": False,
            "completion_source": "branch_point_catalog_materialization",
        }
        changed = True

    return completed, changed


def complete_branch_catalog_materialization(
    enm: EnergyNetworkModel,
) -> tuple[EnergyNetworkModel, bool]:
    """Uzupełnij parametry katalogowe odcinków dla starszych snapshotów.

    Starsze migawki mogły mieć `catalog_ref`, ale nie mieć pełnego
    `materialized_params`. Na granicy ENM odtwarzamy deterministycznie dane z
    katalogu, tak żeby SLD i obliczenia dostały ten sam wariant kabla/linii.
    """
    candidates = [
        branch
        for branch in enm.branches
        if isinstance(branch, Cable | OverheadLine) and branch.catalog_ref
    ]
    if not candidates:
        return enm, False

    completed = enm.model_copy(deep=True)
    catalog = get_default_mv_catalog()
    changed = False

    for branch in completed.branches:
        if not isinstance(branch, Cable | OverheadLine) or not branch.catalog_ref:
            continue
        namespace = branch.catalog_namespace or (
            "KABEL_SN" if isinstance(branch, Cable) else "LINIA_SN"
        )
        binding = CatalogBinding(
            catalog_namespace=namespace,
            catalog_item_id=branch.catalog_ref,
            catalog_item_version=_catalog_version(branch),
            materialize=True,
        )
        result = materialize_catalog_binding(binding, catalog)
        if not result.success:
            continue

        existing = (
            branch.materialized_params if isinstance(branch.materialized_params, dict) else {}
        )
        materialized = {
            **existing,
            **result.solver_fields,
            "catalog_item_id": branch.catalog_ref,
            "catalog_item_version": binding.catalog_item_version,
            "catalog_namespace": namespace,
        }
        if _branch_has_materialized_values(branch, materialized):
            continue

        branch.materialized_params = materialized
        branch.catalog_namespace = namespace
        branch.parameter_source = "CATALOG"
        branch.source_mode = "KATALOG"
        _apply_materialized_branch_values(branch, materialized)
        changed = True

    return (completed, True) if changed else (enm, False)


def _catalog_version(branch: Cable | OverheadLine) -> str:
    meta = branch.meta if isinstance(branch.meta, dict) else {}
    direct_version = meta.get("catalog_item_version") if isinstance(meta, dict) else None
    if isinstance(direct_version, str) and direct_version.strip():
        return direct_version.strip()
    binding = meta.get("catalog_binding") if isinstance(meta, dict) else None
    if isinstance(binding, dict):
        version = binding.get("catalog_item_version")
        if isinstance(version, str) and version.strip():
            return version.strip()
    return CATALOG_VERSION_DEFAULT


def _branch_has_materialized_values(
    branch: Cable | OverheadLine,
    materialized: dict[str, Any],
) -> bool:
    existing = branch.materialized_params if isinstance(branch.materialized_params, dict) else {}
    critical_keys = (
        "r_ohm_per_km",
        "x_ohm_per_km",
        "r0_ohm_per_km",
        "x0_ohm_per_km",
        "rated_current_a",
        "return_conductor_cross_section_mm2",
        "return_conductor_r_ohm_per_km_20c",
        "return_conductor_ith_1s_a",
    )
    for key in critical_keys:
        expected = materialized.get(key)
        if expected is None:
            continue
        if existing.get(key) != expected:
            return False
        if hasattr(branch, key) and getattr(branch, key) != expected:
            return False
    return bool(existing)


def _apply_materialized_branch_values(
    branch: Cable | OverheadLine,
    materialized: dict[str, Any],
) -> None:
    for key in (
        "r_ohm_per_km",
        "x_ohm_per_km",
        "r0_ohm_per_km",
        "x0_ohm_per_km",
        "b0_siemens_per_km",
    ):
        value = materialized.get(key)
        if value is not None:
            setattr(branch, key, float(value))

    b_us_per_km = materialized.get("b_us_per_km")
    c_nf_per_km = materialized.get("c_nf_per_km")
    if b_us_per_km is not None:
        branch.b_siemens_per_km = float(b_us_per_km) / 1_000_000.0
    elif c_nf_per_km is not None:
        branch.b_siemens_per_km = 2 * math.pi * 50.0 * float(c_nf_per_km) * 1e-9

    rated_current_a = (
        materialized.get("rated_current_a")
        if materialized.get("rated_current_a") is not None
        else materialized.get("i_max_a")
    )
    if rated_current_a is not None:
        branch.rating = BranchRating(in_a=float(rated_current_a))

    if isinstance(branch, Cable):
        for key in (
            "cross_section_mm2",
            "return_conductor_cross_section_mm2",
            "return_conductor_r_ohm_per_km_20c",
            "return_conductor_jth_1s_a_per_mm2",
            "return_conductor_ith_1s_a",
            # F-K1 faza 3: dane cieplne ZYLY FAZOWEJ.
            "jth_1s_a_per_mm2",
            "ith_1s_a",
        ):
            value = materialized.get(key)
            if value is not None:
                setattr(branch, key, float(value))

        number_of_cores = materialized.get("number_of_cores")
        if number_of_cores is not None:
            branch.number_of_cores = int(number_of_cores)

        for key in ("conductor_material", "return_conductor_material"):
            value = materialized.get(key)
            if isinstance(value, str) and value.strip():
                setattr(branch, key, value.strip().upper())


def complete_station_loads_from_nn_feeders(
    enm: EnergyNetworkModel,
) -> tuple[EnergyNetworkModel, bool]:
    """Materialize catalog loads for legacy station feeders without loads.

    Older station templates could create nN outgoing feeders without ENM load
    elements. The product contract is catalog-complete station materialization,
    so this migration closes that gap deterministically at the ENM boundary.

    Tabliczka dokładanego odbioru (P oraz Q/cosφ) pochodzi WYŁĄCZNIE z pozycji
    katalogowej — patrz `_catalog_load_reactive_power`. Gdy katalog nie
    rozstrzyga mocy biernej, odbiór nie powstaje w ogóle.
    """
    existing_feeder_refs = {
        feeder_ref for load in enm.loads for feeder_ref in [_load_feeder_ref(load)] if feeder_ref
    }
    bus_refs = {bus.ref_id for bus in enm.buses}
    pending: list[tuple[str, str, str, str, int]] = []

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
            pending.append((substation.ref_id, substation.name, feeder_ref, bus_ref, index))
            existing_feeder_refs.add(feeder_ref)

    if not pending:
        return enm, False

    # Katalog czytamy RAZ na wywołanie (i dopiero gdy jest co materializować),
    # żeby wszystkie dokładane odbiory dostały ten sam, deterministyczny komplet
    # danych tabliczkowych.
    load_type = get_default_mv_catalog().get_load_type(DEFAULT_LOAD_CATALOG_REF)
    reactive_power = _catalog_load_reactive_power(load_type, DEFAULT_LOAD_KW / 1000.0)
    if load_type is None or reactive_power is None:
        # Brak kanonu katalogu dla mocy biernej ⇒ NIE materializujemy odbioru.
        # Cicha wartość Q = 0 przy zadeklarowanym katalogu to phantom cosφ
        # (V12K-050) — rachunek szedłby z cosφ = 1,0 i zaniżonym spadkiem
        # napięcia, a rekord i tak twierdziłby „parametry z katalogu".
        return enm, False

    additions = [
        _build_default_load(
            station_ref,
            station_name,
            feeder_ref,
            bus_ref,
            index,
            load_type=load_type,
            reactive_power=reactive_power,
        )
        for station_ref, station_name, feeder_ref, bus_ref, index in pending
    ]

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
            runtime_inputs = (
                branch_point.runtime_inputs if isinstance(branch_point.runtime_inputs, dict) else {}
            )
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


#: Znaczniki źródła mocy biernej odbioru katalogowego (ślad WHITE BOX materializacji).
Q_SOURCE_CATALOG_Q_KVAR = "KATALOG_Q_KVAR"
Q_SOURCE_CATALOG_COS_PHI = "KATALOG_COS_PHI"
Q_SOURCE_CATALOG_NO_REACTIVE = "KATALOG_BEZ_MOCY_BIERNEJ"


def _catalog_load_reactive_power(
    load_type: LoadType | None,
    p_mw: float,
) -> tuple[float, str] | None:
    """Moc bierna odbioru katalogowego [Mvar] + znacznik jej źródła.

    Hierarchia źródeł (parytet z naprawionym ``add_nn_load``, V12K-050):

    1. jawne ``q_kvar`` pozycji katalogowej wygrywa bez przeliczeń
       (np. ``load_przem_75kw`` podaje 28 kvar wprost);
    2. w przeciwnym razie moc bierna wychodzi z tabliczkowego cosφ katalogu:
       ``Q = P · tan(arccos cosφ)``;
    3. ``cos_phi_mode == "BRAK"`` to JAWNY kanon katalogu „pozycja bez mocy
       biernej" — dopiero wtedy wolno zapisać Q = 0;
    4. brak jednego i drugiego ⇒ ``None`` (brak kanonu) — wołający nie
       materializuje odbioru. Cicha wartość Q = 0 jest zakazana: rachunek
       poszedłby z cosφ = 1,0, a rekord twierdziłby „parametry z katalogu".

    Konwencja znaku: ``Load.q_mvar`` dodatnie = POBÓR mocy biernej (mapowanie
    ENM→rozpływ odejmuje ją od wstrzyknięcia węzła). Odbiór indukcyjny
    (cosφ opóźniony, ``cos_phi_mode == "IND"``) → Q dodatnie; odbiór
    pojemnościowy (``"POJ"``) → Q ujemne.

    To arytmetyka tabliczkowa materializacji katalogu — nie fizyka sieci.
    Solver dostaje gotowe P i Q i niczego tu nie dopowiada.
    """
    if load_type is None:
        return None

    q_kvar = load_type.q_kvar
    if q_kvar is not None:
        return float(q_kvar) / 1000.0, Q_SOURCE_CATALOG_Q_KVAR

    mode = str(load_type.cos_phi_mode or "").strip().upper()
    if mode == "BRAK":
        return 0.0, Q_SOURCE_CATALOG_NO_REACTIVE
    if mode not in ("IND", "POJ"):
        return None

    cos_phi = load_type.cos_phi
    if cos_phi is None:
        return None
    cos_phi_value = float(cos_phi)
    if not 0.0 < cos_phi_value <= 1.0:
        return None

    q_mvar = p_mw * math.tan(math.acos(cos_phi_value))
    return (-q_mvar if mode == "POJ" else q_mvar), Q_SOURCE_CATALOG_COS_PHI


def _build_default_load(
    station_ref: str,
    station_name: str,
    feeder_ref: str,
    bus_ref: str,
    index: int,
    *,
    load_type: LoadType,
    reactive_power: tuple[float, str],
) -> Load:
    seed = sha256(f"catalog-load|{station_ref}|{feeder_ref}".encode()).hexdigest()[:32]
    p_mw = DEFAULT_LOAD_KW / 1000.0
    q_mvar, q_source = reactive_power
    nameplate: dict[str, Any] = {"q_kvar": q_mvar * 1000.0, "q_source": q_source}
    if load_type.cos_phi is not None:
        nameplate["cos_phi"] = float(load_type.cos_phi)
    if load_type.cos_phi_mode:
        nameplate["cos_phi_mode"] = str(load_type.cos_phi_mode)
    return Load(
        ref_id=f"load/{seed}/nn",
        name=f"Odbiór nN {index} - {station_name}",
        bus_ref=bus_ref,
        p_mw=p_mw,
        q_mvar=q_mvar,
        model="pq",
        catalog_ref=DEFAULT_LOAD_CATALOG_REF,
        catalog_namespace="OBCIAZENIE",
        parameter_source="CATALOG",
        source_mode="KATALOG",
        materialized_params={
            "catalog_item_id": DEFAULT_LOAD_CATALOG_REF,
            "p_kw": DEFAULT_LOAD_KW,
            **nameplate,
        },
        meta={
            "feeder_ref": feeder_ref,
            "load_kind": "SKUPIONY",
            "connection_type": "TROJFAZOWY",
            **nameplate,
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
