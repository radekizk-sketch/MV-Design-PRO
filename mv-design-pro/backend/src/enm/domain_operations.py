"""
Operacje domenowe V1 — budowa sieci SN od GPZ z SLD na żywo.

Kanoniczny zestaw operacji semantycznych kompozytujących niskopoziomowe CRUD
z topology_ops.py w spójne przepływy domenowe.

DETERMINISTYCZNE: identyczne wejście → identyczny wynik.
BINDING: Komunikaty po polsku, brak kodów projektowych.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from typing import Any

from network_model.catalog.audit2_catalogs import (
    get_tap_changer,
    tap_changer_fields_from_catalog,
)
from network_model.catalog.bay_templates import TRANSFORMER_BAY_PROTECTION_CODES
from network_model.catalog.materialization import materialize_catalog_binding
from network_model.catalog.types import CatalogBinding

from .models import EnergyNetworkModel
from .topology_ops import (
    create_branch,
    create_device,
    create_node,
    delete_branch,
)
from .validator import ENMValidator

# ---------------------------------------------------------------------------
# Canonical operation names
# ---------------------------------------------------------------------------

CANONICAL_OPS = frozenset(
    {
        "add_grid_source_sn",
        "add_sn_bay",
        "continue_trunk_segment_sn",
        "insert_station_on_segment_sn",
        "insert_branch_pole_on_segment_sn",
        "insert_zksn_on_segment_sn",
        "start_branch_segment_sn",
        "insert_section_switch_sn",
        "connect_secondary_ring_sn",
        "set_normal_open_point",
        "add_transformer_sn_nn",
        "assign_catalog_to_element",
        "update_element_parameters",
        "add_converter_source",
        "add_genset_nn",
        "add_ups_nn",
        "add_nn_load",
        "delete_element",
        "refresh_snapshot",
        # Phase 0B-3: CRUD GPZ sekcji (LV i HV) — wymagane dla StationCard editora.
        "add_gpz_section",
        "update_gpz_section",
        "delete_gpz_section",
        # Phase 0B (operator-grade SLD plan v2): append-on-endpoint workflow
        "append_station_on_endpoint",
        # V12K-238: wiązania wytwórcy wybierane PO jego utworzeniu (konfigurator DER) —
        # bez tej operacji wybór katalogu zabezpieczeń, CT/VT, danych prądu zwarciowego
        # i modelu dynamicznego nie miał gdzie spłynąć (pomiar: V12K-237).
        "set_der_catalog_bindings",
    }
)

LEGACY_FIELD_COLLECTIONS = frozenset({"bays", "measurements", "protection_assignments"})

# ---------------------------------------------------------------------------
# Helpers — deterministic ID generation
# ---------------------------------------------------------------------------


def _canonical_json(data: object) -> str:
    """Kanoniczny JSON: sortowane klucze, brak spacji, stabilna repr. liczb."""
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _compute_seed(parts: dict[str, Any]) -> str:
    """SHA-256 z kanonicznych danych, pierwsze 32 znaki hex."""
    canonical = _canonical_json(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _make_id(prefix: str, seed: str, local_path: str) -> str:
    """Buduj deterministyczny identyfikator elementu."""
    return f"{prefix}/{seed}/{local_path}"


def _looks_internal_identifier(value: str) -> bool:
    compact = value.replace("-", "")
    return "/" in value or (
        len(compact) >= 24 and all(char in "0123456789abcdefABCDEF" for char in compact)
    )


def _branch_point_public_label(branch_point: dict[str, Any]) -> str:
    name = str(branch_point.get("name") or "").strip()
    if name and not _looks_internal_identifier(name):
        return name
    return "ZKSN" if branch_point.get("branch_point_type") == "zksn" else "Słup rozgałęźny SN"


def _normalize_branch_point_switch_state(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"open", "otwarty", "normalnie_otwarty"}:
        return "open"
    return "closed"


def _branch_point_catalog_params(catalog_ref: str | None) -> dict[str, Any]:
    if not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return {}
    try:
        from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types

        for item in get_all_branch_point_types():
            if item.get("id") == catalog_ref:
                params = item.get("params")
                return copy.deepcopy(params) if isinstance(params, dict) else {}
    except Exception:
        return {}
    return {}


def _branch_point_port_count(
    *,
    branch_point_type: str,
    payload: dict[str, Any],
    catalog_params: dict[str, Any],
) -> int:
    if branch_point_type == "branch_pole":
        return 1
    raw = payload.get("branch_ports_count", catalog_params.get("branch_ports_count"))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 2 if "2P" in str(payload.get("catalog_ref") or "").upper() else 1
    return max(1, min(2, value))


def _branch_point_route_ports(
    branch_point_type: str, branch_ports_count: int
) -> list[dict[str, Any]]:
    medium = "LINE_OVERHEAD" if branch_point_type == "branch_pole" else "CABLE"
    ports: list[dict[str, Any]] = [
        {"port_id": "MAIN_IN", "role": "ciag_wejscie", "medium": medium},
        {"port_id": "MAIN_OUT", "role": "ciag_wyjscie", "medium": medium},
    ]
    for idx in range(1, branch_ports_count + 1):
        ports.append(
            {
                "port_id": f"BRANCH_{idx}" if branch_ports_count > 1 else "BRANCH",
                "role": "odgalezienie",
                "medium": medium,
            }
        )
    return ports


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


def _branch_point_materialized_params(
    *,
    branch_point_type: str,
    catalog_ref: str,
    payload: dict[str, Any],
    catalog_params: dict[str, Any],
    branch_ports_count: int,
) -> dict[str, Any]:
    materialized = {
        **catalog_params,
        **(
            payload.get("materialized_params")
            if isinstance(payload.get("materialized_params"), dict)
            else {}
        ),
        "catalog_item_id": catalog_ref,
        "catalog_namespace": payload.get("catalog_namespace") or "mv_branch_points",
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


def _is_helper_topology_bus(bus: dict[str, Any]) -> bool:
    tags = bus.get("tags") or []
    return isinstance(tags, list) and "helper_bus" in tags and "topology_terminal" in tags


def _bus_reference_count(enm: dict[str, Any], bus_ref: str) -> int:
    refs = 0
    for branch in enm.get("branches", []):
        if branch.get("from_bus_ref") == bus_ref:
            refs += 1
        if branch.get("to_bus_ref") == bus_ref:
            refs += 1
    for transformer in enm.get("transformers", []):
        if transformer.get("hv_bus_ref") == bus_ref:
            refs += 1
        if transformer.get("lv_bus_ref") == bus_ref:
            refs += 1
    for collection in ("sources", "loads", "generators"):
        for item in enm.get(collection, []):
            if item.get("bus_ref") == bus_ref:
                refs += 1
    for substation in enm.get("substations", []):
        if substation.get("bus_ref") == bus_ref:
            refs += 1
        for ref in substation.get("bus_refs") or []:
            if ref == bus_ref:
                refs += 1
    for branch_point in enm.get("branch_points", []):
        if branch_point.get("bus_ref") == bus_ref:
            refs += 1
        ports = branch_point.get("ports")
        if isinstance(ports, dict):
            for value in ports.values():
                if value == bus_ref:
                    refs += 1
                elif isinstance(value, list):
                    refs += sum(1 for ref in value if ref == bus_ref)
    return refs


def _remove_unreferenced_helper_topology_buses(enm: dict[str, Any]) -> dict[str, Any]:
    buses = enm.get("buses")
    if not isinstance(buses, list):
        return enm
    orphan_refs = {
        bus.get("ref_id")
        for bus in buses
        if isinstance(bus, dict)
        and isinstance(bus.get("ref_id"), str)
        and _is_helper_topology_bus(bus)
        and _bus_reference_count(enm, bus["ref_id"]) == 0
    }
    if not orphan_refs:
        return enm
    cleaned = copy.deepcopy(enm)
    cleaned["buses"] = [
        bus
        for bus in cleaned.get("buses", [])
        if not (isinstance(bus, dict) and bus.get("ref_id") in orphan_refs)
    ]
    return cleaned


def _complete_catalog_branch_point_defaults(enm: dict[str, Any]) -> dict[str, Any]:
    """Uzupełnij katalogowe domyślne stany łączników dla starszych snapshotów."""
    source_branch_points = enm.get("branch_points")
    if not isinstance(source_branch_points, list):
        return _remove_unreferenced_helper_topology_buses(enm)

    completed = enm
    changed = False
    for idx, bp in enumerate(source_branch_points):
        if not isinstance(bp, dict):
            continue
        if bp.get("branch_point_type") not in {"zksn", "branch_pole"}:
            continue
        if not bp.get("catalog_ref") or bp.get("switch_state"):
            continue
        if not changed:
            completed = copy.deepcopy(enm)
            changed = True
        completed_branch_points = completed.get("branch_points", [])
        completed_bp = completed_branch_points[idx]
        completed_bp["switch_state"] = "closed"

    return _remove_unreferenced_helper_topology_buses(completed)


def _quantize_ratio(value: float, quantum: float = 1e-6) -> float:
    """Kwantyzacja wartości ratio dla stabilności deterministycznej."""
    return round(value / quantum) * quantum


def _extract_catalog_binding_item_id(catalog_binding: object) -> str | None:
    """Odczytaj kanoniczne catalog_item_id z compat fallback do item_id."""
    if not isinstance(catalog_binding, dict):
        return None

    for key in ("catalog_item_id", "item_id"):
        binding_item = catalog_binding.get(key)
        if isinstance(binding_item, str):
            normalized = binding_item.strip()
            if normalized:
                return normalized

    return None


def _extract_catalog_binding_namespace(catalog_binding: object) -> str | None:
    """Odczytaj namespace z kanonicznego payloadu lub legacy fallback."""
    if not isinstance(catalog_binding, dict):
        return None

    for key in ("catalog_namespace", "namespace"):
        binding_namespace = catalog_binding.get(key)
        if isinstance(binding_namespace, str):
            normalized = binding_namespace.strip()
            if normalized:
                return normalized

    return None


def _extract_catalog_binding_version(catalog_binding: object) -> str | None:
    """Odczytaj wersję katalogu z payloadu binding."""
    if not isinstance(catalog_binding, dict):
        return None

    binding_version = catalog_binding.get("catalog_item_version")
    if isinstance(binding_version, str):
        normalized = binding_version.strip()
        if normalized:
            return normalized

    return None


def _apply_catalog_metadata(
    target: dict[str, Any],
    catalog_binding: object,
    *,
    default_namespace: str | None = None,
    default_source_mode: str = "KATALOG",
) -> None:
    """Uzupełnij snapshot elementu o kanoniczne metadane katalogowe."""
    namespace = _extract_catalog_binding_namespace(catalog_binding) or default_namespace
    if namespace:
        target["catalog_namespace"] = namespace

    if default_source_mode:
        target["source_mode"] = default_source_mode
        target["parameter_source"] = "CATALOG"

    version = _extract_catalog_binding_version(catalog_binding)
    if version:
        target.setdefault("meta", {})["catalog_item_version"] = version


def _gpz_line_field_branch_type(apparatus_kind: object) -> str:
    normalized = apparatus_kind.strip().upper() if isinstance(apparatus_kind, str) else ""
    if normalized in {"DISCONNECTOR", "DS", "ODLACZNIK", "ODŁĄCZNIK"}:
        return "disconnector"
    if normalized in {"LOAD_SWITCH", "LS", "ROZLACZNIK", "ROZŁĄCZNIK"}:
        return "switch"
    if normalized in {"MEASUREMENT", "VT", "POMIAR"}:
        return "switch"
    return "breaker"


def _normalize_gpz_line_field_apparatus(payload: dict[str, Any]) -> dict[str, Any] | None:
    raw = payload.get("gpz_line_field_apparatus")
    if not isinstance(raw, dict):
        return None

    binding = raw.get("catalog_binding")
    catalog_ref = _extract_catalog_binding_item_id(binding) if isinstance(binding, dict) else None
    if catalog_ref is None:
        catalog_ref = raw.get("catalog_ref") or raw.get("catalog_item_id")
    if not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return None

    catalog_ref = catalog_ref.strip()
    binding_payload = _build_catalog_binding_payload(
        catalog_ref,
        binding,
        default_namespace="APARAT_SN",
        default_version="2024.1",
    )
    apparatus_kind = raw.get("apparatus_kind")
    if not isinstance(apparatus_kind, str) or not apparatus_kind.strip():
        apparatus_kind = "BREAKER"

    return {
        "apparatus_kind": apparatus_kind.strip().upper(),
        "catalog_ref": catalog_ref,
        "catalog_binding": binding_payload,
    }


def _normalize_gpz_section_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Znormalizuj jawne sekcje GPZ z payloadu formularza."""
    raw_sections = payload.get("gpz_sections")
    candidate_sections: list[dict[str, Any]] = []

    if isinstance(raw_sections, list) and raw_sections:
        candidate_sections = [section for section in raw_sections if isinstance(section, dict)]

    if not candidate_sections:
        candidate_sections = [
            {
                "order": 0,
                "name": payload.get("gpz_section_name"),
                "line_field_name": payload.get("gpz_line_field_name"),
            }
        ]

    normalized: list[dict[str, Any]] = []
    for index, entry in enumerate(candidate_sections):
        raw_order = entry.get("order")
        try:
            order = int(raw_order) if raw_order is not None else index
        except (TypeError, ValueError):
            order = index

        section_name = entry.get("name")
        if not isinstance(section_name, str) or not section_name.strip():
            section_name = None

        bus_name = entry.get("bus_name")
        if not isinstance(bus_name, str) or not bus_name.strip():
            bus_name = None

        line_field_name = entry.get("line_field_name")
        if not isinstance(line_field_name, str) or not line_field_name.strip():
            line_field_name = None

        raw_field_names = entry.get("line_field_names")
        line_field_names = []
        if isinstance(raw_field_names, list):
            line_field_names = [
                str(name).strip()
                for name in raw_field_names
                if isinstance(name, str) and name.strip()
            ]

        line_fields_count = _read_gpz_line_fields_count(entry, payload)

        # Kompozycja pól z szablonów producenta (opcjonalna, addytywna): jeżeli
        # payload niesie `bays[]` per sekcja, każde pole ma własną rolę, szablon
        # (bay_template_ref) i referencję zabezpieczenia (protection_ref). Bez
        # `bays[]` zachowane jest dotychczasowe zachowanie (kompatybilność wsteczna).
        bays: list[dict[str, Any]] = []
        raw_bays = entry.get("bays")
        if isinstance(raw_bays, list):
            for bay in raw_bays:
                if not isinstance(bay, dict):
                    continue
                bays.append(
                    {
                        "name": (
                            str(bay["name"]).strip()
                            if isinstance(bay.get("name"), str) and bay["name"].strip()
                            else None
                        ),
                        "bay_role": (
                            str(bay["bay_role"]).strip()
                            if isinstance(bay.get("bay_role"), str) and bay["bay_role"].strip()
                            else None
                        ),
                        "bay_template_ref": (
                            str(bay["bay_template_ref"]).strip()
                            if isinstance(bay.get("bay_template_ref"), str)
                            and bay["bay_template_ref"].strip()
                            else None
                        ),
                        "protection_ref": (
                            str(bay["protection_ref"]).strip()
                            if isinstance(bay.get("protection_ref"), str)
                            and bay["protection_ref"].strip()
                            else None
                        ),
                    }
                )
        if bays:
            line_fields_count = len(bays)

        section_template_ref = (
            str(entry["bay_template_ref"]).strip()
            if isinstance(entry.get("bay_template_ref"), str) and entry["bay_template_ref"].strip()
            else None
        )

        normalized.append(
            {
                "order": order,
                "name": section_name,
                "bus_name": bus_name,
                "line_field_name": line_field_name,
                "line_field_names": line_field_names,
                "line_fields_count": line_fields_count,
                "bay_template_ref": section_template_ref,
                "bays": bays,
            }
        )

    normalized.sort(key=lambda item: (item["order"], item["name"] or ""))
    return normalized


MAX_GPZ_LINE_FIELDS_PER_SECTION = 12
MAX_GPZ_WN_SN_TRANSFORMERS = 4
GPZ_WN_SN_TRANSFORMER_CATALOG_BY_VOLTAGE_AND_POWER = {
    (15, 10): "tr-wn-sn-110-15-10mva-yd11",
    (15, 16): "tr-wn-sn-110-15-16mva-yd11",
    (15, 25): "tr-wn-sn-110-15-25mva-yd11",
    (15, 40): "tr-wn-sn-110-15-40mva-yd11",
    (15, 63): "tr-wn-sn-110-15-63mva-yd11",
    (20, 10): "tr-wn-sn-110-20-10mva-yd11",
    (20, 16): "tr-wn-sn-110-20-16mva-yd11",
    (20, 25): "tr-wn-sn-110-20-25mva-yd11",
    (20, 40): "tr-wn-sn-110-20-40mva-yd11",
    (20, 63): "tr-wn-sn-110-20-63mva-yd11",
}


def _read_gpz_line_fields_count(entry: dict[str, Any], payload: dict[str, Any]) -> int:
    for source in (entry, payload):
        for key in (
            "line_fields_count",
            "line_fields_per_section",
            "gpz_line_fields_per_section",
        ):
            raw_value = source.get(key)
            if raw_value is None:
                continue
            if isinstance(raw_value, bool):
                return 0
            if isinstance(raw_value, int):
                return raw_value
            if isinstance(raw_value, float):
                return int(raw_value) if raw_value.is_integer() else 0
            if isinstance(raw_value, str) and raw_value.strip().isdigit():
                return int(raw_value.strip())
            return 0
    return 1


def _read_gpz_transformer_count(payload: dict[str, Any], sections_count: int) -> int:
    for key in ("transformer_count", "transformers_count", "wn_sn_transformer_count"):
        raw_value = payload.get(key)
        if raw_value is None:
            continue
        if isinstance(raw_value, bool):
            return 0
        if isinstance(raw_value, int):
            return raw_value
        if isinstance(raw_value, float):
            return int(raw_value) if raw_value.is_integer() else 0
        if isinstance(raw_value, str) and raw_value.strip().isdigit():
            return int(raw_value.strip())
        return 0
    return max(1, min(2, sections_count))


def _resolve_gpz_wn_sn_transformer_catalog_ref(
    payload: dict[str, Any],
    *,
    voltage_kv: float,
    rated_power_mva: float,
) -> str | dict[str, Any]:
    explicit_ref = payload.get("transformer_catalog_ref")
    if isinstance(explicit_ref, str) and explicit_ref.strip():
        return explicit_ref.strip()

    binding = payload.get("transformer_catalog_binding")
    binding_ref = _extract_catalog_binding_item_id(binding)
    if binding_ref:
        return binding_ref

    voltage_key = int(round(float(voltage_kv)))
    power_key = int(round(float(rated_power_mva)))
    default_ref = GPZ_WN_SN_TRANSFORMER_CATALOG_BY_VOLTAGE_AND_POWER.get((voltage_key, power_key))
    if default_ref:
        return default_ref

    supported = ", ".join(
        f"110/{voltage} kV {power} MVA"
        for voltage, power in sorted(GPZ_WN_SN_TRANSFORMER_CATALOG_BY_VOLTAGE_AND_POWER)
    )
    return _error_response(
        (
            "Transformator WN/SN GPZ wymaga pozycji katalogowej. "
            f"Brak domyślnego rekordu dla 110/{voltage_key} kV {power_key} MVA. "
            f"Dostępne rekordy: {supported}."
        ),
        "source.transformer_catalog_ref_missing",
    )


def _build_gpz_line_field_names(section_entry: dict[str, Any], count: int) -> list[str]:
    explicit_names = section_entry.get("line_field_names")
    names = (
        [name for name in explicit_names if isinstance(name, str) and name.strip()]
        if isinstance(explicit_names, list)
        else []
    )
    base_name = section_entry.get("line_field_name")
    if not isinstance(base_name, str) or not base_name.strip():
        base_name = "Pole liniowe GPZ"

    result: list[str] = []
    for index in range(count):
        if index < len(names):
            result.append(names[index].strip())
        elif count == 1:
            result.append(base_name.strip())
        else:
            result.append(f"{base_name.strip()} {index + 1}")
    return result


def _infer_catalog_namespace_for_element(element: dict[str, Any]) -> str | None:
    """Wyznacz namespace katalogu na podstawie typu elementu snapshotu."""
    explicit = element.get("catalog_namespace")
    if isinstance(explicit, str):
        normalized = explicit.strip()
        if normalized:
            return normalized

    element_type = element.get("type")
    if element_type == "cable":
        return "KABEL_SN"
    if element_type == "line_overhead":
        return "LINIA_SN"
    if element_type == "transformer":
        return "TRAFO_SN_NN"
    return None


def _resolve_catalog_ref(catalog_ref: object, catalog_binding: object) -> str | None:
    """Rozwiąż catalog_ref z jawnego pola albo z catalog_binding.catalog_item_id.

    Zwraca None, gdy referencja jest pusta/niepoprawna.
    """
    if isinstance(catalog_ref, str):
        normalized = catalog_ref.strip()
        if normalized:
            return normalized

    binding_item = _extract_catalog_binding_item_id(catalog_binding)
    if binding_item:
        return binding_item

    return None


# ---------------------------------------------------------------------------
# Helpers — snapshot utilities
# ---------------------------------------------------------------------------


def _find_element(enm: dict[str, Any], ref_id: str) -> tuple[str, int] | None:
    """Znajdź element po ref_id, zwróć (kolekcja, indeks)."""
    for key in (
        "buses",
        "branches",
        "transformers",
        "sources",
        "loads",
        "generators",
        "substations",
        "junctions",
        "corridors",
        "branch_points",
    ):
        for i, elem in enumerate(enm.get(key, [])):
            if elem.get("ref_id") == ref_id:
                return (key, i)
    return None


def _find_legacy_field_element_collection(enm: dict[str, Any], ref_id: str) -> str | None:
    """Zwróć legacy kolekcję pola, jeśli ref_id wskazuje na wycofany write-path."""
    for key in LEGACY_FIELD_COLLECTIONS:
        for elem in enm.get(key, []):
            if elem.get("ref_id") == ref_id:
                return key
    return None


def _error_legacy_field_write_disabled(ref_id: str, collection: str) -> dict[str, Any]:
    collection_label = {
        "bays": "legacy pola SN",
        "measurements": "legacy pomiaru pola",
        "protection_assignments": "legacy przypisania zabezpieczenia pola",
    }.get(collection, "legacy pola")
    return _error_response(
        (
            f"Zapis do '{collection_label}' dla '{ref_id}' jest wyłączony w backendzie V11. "
            "Użyj kanonicznego read-modelu pola zamiast mutowania legacy snapshotu."
        ),
        "field.legacy_write_disabled",
    )


def _build_field_spec(
    *,
    field_ref: str,
    name: str,
    bay_role: str,
    bus_ref: str,
    gpz_section_id: str | None = None,
    equipment_refs: list[str] | None = None,
    protection_ref: str | None = None,
    protection_codes: list[str] | None = None,
    bay_template_ref: str | None = None,
    switchgear_family_ref: str | None = None,
    manufacturer_ref: str | None = None,
    primary_devices: list[dict[str, Any]] | None = None,
    tags: list[str] | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "field_ref": field_ref,
        "name": name,
        "bay_role": bay_role,
        "bus_ref": bus_ref,
        "equipment_refs": list(equipment_refs or []),
        "protection_ref": protection_ref,
        "tags": list(tags or []),
        "meta": copy.deepcopy(meta or {}),
    }
    if gpz_section_id:
        spec["gpz_section_id"] = gpz_section_id
    # Wymagane funkcje zabezpieczeniowe pola (ANSI/IEC, np. 50/51/67, 87T) — projekcja
    # na Bay.protection_codes (read-model + glify SLD). Wyprowadzane z szablonu pola
    # producenta (protection_requirements) albo z roli pola. exclude puste.
    if protection_codes:
        spec["protection_codes"] = list(protection_codes)
    # Powiązania producenckie jako klucze TOP-LEVEL field_spec (konwencja kreatora
    # stacji, `append_station_on_endpoint`) — spójne źródło dla read-modelu pola
    # i przyszłej projekcji do Bay. exclude_none: bez rodziny brak kluczy.
    if bay_template_ref:
        spec["bay_template_ref"] = bay_template_ref
    if switchgear_family_ref:
        spec["switchgear_family_ref"] = switchgear_family_ref
    if manufacturer_ref:
        spec["manufacturer_ref"] = manufacturer_ref
    # W1 (RECENZJA_L2 §1/§12.1, V12K-145): aparaty PIERWOTNE pola zmaterializowane
    # z szablonu kreatora — czytane przez adapter SLD (`buildStationMiniBaysFrom
    # FieldSpecs` → `projectBayPrimaryDevices`) i read-model pola. exclude puste
    # (pole bez szablonu/danych → ścieżka konwencji §12.4, zero regresu).
    # Prymat jawnego argumentu (add_sn_bay: override aparatu głównego wg kreatora);
    # inaczej auto-materializacja z kanonicznego `bay_template_ref` — JEDNA prawda
    # dla WSZYSTKICH call-site (add_sn_bay + insert_station...), zero duplikacji.
    if primary_devices:
        spec["primary_devices"] = list(primary_devices)
    elif bay_template_ref:
        from network_model.catalog.bay_templates import template_primary_devices

        materialized = template_primary_devices(bay_template_ref, field_ref=field_ref)
        if materialized:
            spec["primary_devices"] = materialized
    # W1c (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07 uwaga 10): identyfikator
    # KONFIGURACJI pola — stabilny, deterministyczny, wyprowadzony z ref szablonu
    # kanonicznego. Klucz TOP-LEVEL field_spec (addytywny, exclude gdy brak
    # szablonu) czytany przez adapter SLD (`config_id` → meta sceny) — render nie
    # zgaduje wyposażenia z typu pola, tożsamość konfiguracji jest DANĄ.
    if bay_template_ref:
        from network_model.catalog.bay_templates import config_ref_for_template

        spec["config_id"] = config_ref_for_template(bay_template_ref)
    return spec


def _substation_meta(substation: dict[str, Any]) -> dict[str, Any]:
    meta = substation.get("meta")
    if not isinstance(meta, dict):
        meta = {}
        substation["meta"] = meta
    return meta


def _field_specs_for_substation(substation: dict[str, Any]) -> list[dict[str, Any]]:
    meta = substation.get("meta")
    if not isinstance(meta, dict):
        return []
    raw_specs = meta.get("field_specs")
    if not isinstance(raw_specs, list):
        return []
    return [spec for spec in raw_specs if isinstance(spec, dict)]


def _field_specs_by_bus(enm: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    by_bus: dict[str, list[dict[str, Any]]] = {}
    role_rank = {"OUT": 0, "FEEDER": 1, "IN": 2}

    for substation in enm.get("substations", []):
        if not isinstance(substation, dict):
            continue
        station_ref = substation.get("ref_id")
        for spec in _field_specs_for_substation(substation):
            field_ref = spec.get("field_ref")
            bus_ref = spec.get("bus_ref")
            if not isinstance(field_ref, str) or not isinstance(bus_ref, str):
                continue
            indexed_spec = dict(spec)
            if isinstance(station_ref, str):
                indexed_spec["station_ref"] = station_ref
            by_bus.setdefault(bus_ref, []).append(indexed_spec)

    for specs in by_bus.values():
        specs.sort(
            key=lambda spec: (
                role_rank.get(str(spec.get("bay_role", "")).upper(), 99),
                str(spec.get("field_ref", "")),
            )
        )
    return by_bus


def _field_ref_to_bus_ref(enm: dict[str, Any], field_ref: str | None) -> str | None:
    if not field_ref:
        return None
    for specs in _field_specs_by_bus(enm).values():
        for spec in specs:
            if spec.get("field_ref") == field_ref:
                meta = spec.get("meta")
                if isinstance(meta, dict):
                    for key in ("field_terminal_bus_ref", "terminal_bus_ref"):
                        terminal_ref = meta.get(key)
                        if isinstance(terminal_ref, str) and terminal_ref:
                            return terminal_ref
                terminal_ref = spec.get("field_terminal_bus_ref") or spec.get("terminal_bus_ref")
                if isinstance(terminal_ref, str) and terminal_ref:
                    return terminal_ref
                bus_ref = spec.get("bus_ref")
                return bus_ref if isinstance(bus_ref, str) and bus_ref else None
    return None


def _field_spec_for_ref(enm: dict[str, Any], field_ref: str | None) -> dict[str, Any] | None:
    if not field_ref:
        return None
    for specs in _field_specs_by_bus(enm).values():
        for spec in specs:
            if spec.get("field_ref") == field_ref:
                return spec
    return None


def _is_line_continuation_field(enm: dict[str, Any], field_ref: str | None) -> bool:
    spec = _field_spec_for_ref(enm, field_ref)
    if not spec:
        return False
    role = str(spec.get("bay_role") or "").upper()
    return role in {"OUT", "FEEDER"}


def _gpz_substation_for_field_ref(
    enm: dict[str, Any], field_ref: str | None
) -> dict[str, Any] | None:
    """Substation GPZ, której `meta.field_specs` zawiera `field_ref` (None gdy
    pole nie należy do GPZ)."""
    if not isinstance(field_ref, str) or not field_ref.strip():
        return None
    for substation in enm.get("substations", []):
        if not isinstance(substation, dict):
            continue
        if not str(substation.get("ref_id") or "").startswith("gpz/"):
            continue
        for spec in _substation_meta(substation).get("field_specs", []) or []:
            if isinstance(spec, dict) and spec.get("field_ref") == field_ref:
                return substation
    return None


def _gpz_field_spec_occupied(enm: dict[str, Any], spec: dict[str, Any]) -> bool:
    """Pole liniowe GPZ jest ZAJĘTE, gdy zasila istniejący, niepusty ciąg.

    Kanon (dyrektywa właściciela, 2026-07-17): z jednego pola liniowego NIGDY
    nie wychodzą dwa kable — każde wyprowadzenie na sieć ma dedykowane pole.
    Zajętość:
      (a) jawna: `spec.meta.assigned_corridor_ref` wskazuje ISTNIEJĄCY korytarz
          z niepustym `ordered_segment_refs` (przydział z tej operacji;
          korytarz skasowany/opróżniony ⇒ pole samoczynnie wolne);
      (b) dziedziczona (snapshoty sprzed przydziałów): pole o indeksie 0
          zasila magistralę — zajęte, gdy JAKIKOLWIEK korytarz magistrali GPZ
          (`gpz/⟨id⟩/corridor_*`) ma segmenty.
    """
    meta_raw = spec.get("meta")
    meta = meta_raw if isinstance(meta_raw, dict) else {}
    assigned = meta.get("assigned_corridor_ref")
    if isinstance(assigned, str) and assigned.strip():
        corridor = _find_corridor_by_ref(enm, assigned)
        if corridor and corridor.get("ordered_segment_refs"):
            return True
    field_index = meta.get("gpz_line_field_index")
    if field_index == 0:
        field_ref = str(spec.get("field_ref") or "")
        gpz_prefix = "/".join(field_ref.split("/")[:2])
        for corridor in enm.get("corridors", []):
            if not isinstance(corridor, dict):
                continue
            ref = str(corridor.get("ref_id") or "")
            if ref.startswith(f"{gpz_prefix}/corridor_") and corridor.get("ordered_segment_refs"):
                return True
    return False


def _allocate_gpz_line_field_for_branch(
    enm: dict[str, Any],
    origin_field_ref: str,
    branch_corridor_ref: str,
) -> tuple[str | None, dict[str, Any] | None, dict[str, Any] | None]:
    """Przydziel DEDYKOWANE pole liniowe GPZ nowemu odgałęzieniu (feederowi).

    Zwraca `(field_ref, created_field_spec | None, error | None)`:
      1. pole wskazane w `from_ref`, jeśli WOLNE;
      2. inaczej pierwsze WOLNE pole liniowe tej samej sekcji;
      3. inaczej NOWE pole liniowe (ta sama konwencja co przy tworzeniu
         źródła: rola FEEDER, bez aparatury — konfiguracja aparatów to
         osobna decyzja inżynierska w produkcie), z poszanowaniem
         `MAX_GPZ_LINE_FIELDS_PER_SECTION`;
      4. limit wyczerpany ⇒ błąd (bez rysowania dwóch kabli z jednego pola).
    Przydział jest zapisywany DWUSTRONNIE: `spec.meta.assigned_corridor_ref`
    oraz (po stronie wołającego) `corridor.meta.gpz_field_ref` — relacja
    pierwszoklasowa dla widoków (SLD rysuje feeder z JEGO pola, bez
    zgadywania po kolejności).
    """
    substation = _gpz_substation_for_field_ref(enm, origin_field_ref)
    if substation is None:
        return None, None, None  # nie-GPZ — przydział pól nie dotyczy
    meta = _substation_meta(substation)
    field_specs = meta.setdefault("field_specs", [])
    origin_spec = next(
        (s for s in field_specs if isinstance(s, dict) and s.get("field_ref") == origin_field_ref),
        None,
    )
    if origin_spec is None:
        return None, None, None
    section_id = origin_spec.get("gpz_section_id") or (origin_spec.get("meta") or {}).get(
        "gpz_section_id"
    )

    def _is_line_field_of_section(spec: dict[str, Any]) -> bool:
        if "gpz_line_field" not in (spec.get("tags") or []):
            return False
        spec_section = spec.get("gpz_section_id") or (spec.get("meta") or {}).get("gpz_section_id")
        return spec_section == section_id

    section_specs = [s for s in field_specs if isinstance(s, dict) and _is_line_field_of_section(s)]

    # Samonaprawa zajętości dziedziczonej: pole 0 zasilające niepustą
    # magistralę dostaje JAWNY przydział (dalej liczy się już relacją).
    for spec in section_specs:
        spec_meta = spec.setdefault("meta", {})
        if spec_meta.get("gpz_line_field_index") == 0 and not spec_meta.get(
            "assigned_corridor_ref"
        ):
            field_ref = str(spec.get("field_ref") or "")
            gpz_prefix = "/".join(field_ref.split("/")[:2])
            trunk = next(
                (
                    c
                    for c in enm.get("corridors", [])
                    if isinstance(c, dict)
                    and str(c.get("ref_id") or "").startswith(f"{gpz_prefix}/corridor_")
                    and c.get("ordered_segment_refs")
                ),
                None,
            )
            if trunk:
                spec_meta["assigned_corridor_ref"] = trunk.get("ref_id")

    candidates = [origin_spec] + [s for s in section_specs if s is not origin_spec]
    chosen = next((s for s in candidates if not _gpz_field_spec_occupied(enm, s)), None)
    created_spec: dict[str, Any] | None = None
    if chosen is None:
        if len(section_specs) >= MAX_GPZ_LINE_FIELDS_PER_SECTION:
            return (
                None,
                None,
                _error_response(
                    "Brak wolnego pola liniowego GPZ dla nowego wyprowadzenia i osiągnięto "
                    f"limit {MAX_GPZ_LINE_FIELDS_PER_SECTION} pól na sekcję. Z jednego pola "
                    "liniowego nie wolno wyprowadzić dwóch kabli.",
                    "branch_connection.gpz_line_fields_exhausted",
                ),
            )
        new_index = (
            max(
                (
                    int((s.get("meta") or {}).get("gpz_line_field_index") or 0)
                    for s in section_specs
                ),
                default=-1,
            )
            + 1
        )
        base_ref = origin_field_ref.rsplit("/", 1)[0]
        new_field_ref = f"{base_ref}/{new_index + 1:03d}"
        while any(s.get("field_ref") == new_field_ref for s in field_specs):
            new_index += 1
            new_field_ref = f"{base_ref}/{new_index + 1:03d}"
        section_order = int((origin_spec.get("meta") or {}).get("gpz_section_order") or 0)
        created_spec = _build_field_spec(
            field_ref=new_field_ref,
            name=f"Pole liniowe GPZ {section_order + 1}.{new_index + 1}",
            bay_role="FEEDER",
            bus_ref=str(origin_spec.get("bus_ref") or ""),
            gpz_section_id=section_id if isinstance(section_id, str) else None,
            tags=["gpz_line_field"],
            meta={
                "gpz_section_id": section_id,
                "gpz_section_order": section_order,
                "gpz_line_field_index": new_index,
                "gpz_line_fields_count": len(section_specs) + 1,
                "source_field_kind": "FEEDER",
                "field_status": "READY_FOR_TRUNK",
            },
        )
        field_specs.append(created_spec)
        for spec in section_specs:
            spec.setdefault("meta", {})["gpz_line_fields_count"] = len(section_specs) + 1
        chosen = created_spec

    chosen.setdefault("meta", {})["assigned_corridor_ref"] = branch_corridor_ref
    return str(chosen.get("field_ref")), created_spec, None


def _is_station_main_bus_ref(enm: dict[str, Any], bus_ref: str | None) -> bool:
    if not isinstance(bus_ref, str) or not bus_ref.strip():
        return False
    return any(
        isinstance(substation, dict)
        and bus_ref in [ref for ref in substation.get("bus_refs", []) if isinstance(ref, str)]
        for substation in enm.get("substations", [])
    )


def _find_corridor_by_ref(enm: dict[str, Any], corridor_ref: str | None) -> dict[str, Any] | None:
    if not isinstance(corridor_ref, str) or not corridor_ref.strip():
        return None
    for corridor in enm.get("corridors", []):
        if isinstance(corridor, dict) and corridor.get("ref_id") == corridor_ref:
            return corridor
    return None


def _find_corridor_ref_by_terminal(enm: dict[str, Any], terminal_bus_ref: str | None) -> str | None:
    if not isinstance(terminal_bus_ref, str) or not terminal_bus_ref.strip():
        return None
    branch_by_ref = {
        branch.get("ref_id"): branch
        for branch in enm.get("branches", [])
        if isinstance(branch, dict) and isinstance(branch.get("ref_id"), str)
    }
    for corridor in enm.get("corridors", []):
        if not isinstance(corridor, dict):
            continue
        segment_refs = [
            ref for ref in corridor.get("ordered_segment_refs", []) if isinstance(ref, str)
        ]
        if not segment_refs:
            continue
        last_branch = branch_by_ref.get(segment_refs[-1])
        if isinstance(last_branch, dict) and last_branch.get("to_bus_ref") == terminal_bus_ref:
            ref_id = corridor.get("ref_id")
            return ref_id if isinstance(ref_id, str) else None
    return None


def _first_gpz_line_field_for_run(enm: dict[str, Any]) -> tuple[str | None, str | None]:
    candidates: list[dict[str, Any]] = []
    for substation in enm.get("substations", []):
        if not isinstance(substation, dict) or substation.get("station_type") != "gpz":
            continue
        for spec in _field_specs_for_substation(substation):
            if str(spec.get("bay_role") or "").upper() not in {"OUT", "FEEDER"}:
                continue
            candidates.append(spec)

    for spec in candidates:
        field_ref = spec.get("field_ref")
        meta = spec.get("meta")
        terminal_ref = meta.get("terminal_bus_ref") if isinstance(meta, dict) else None
        if isinstance(terminal_ref, str) and terminal_ref:
            return (
                field_ref if isinstance(field_ref, str) else None,
                terminal_ref,
            )

    for spec in candidates:
        field_ref = spec.get("field_ref")
        meta = spec.get("meta")
        terminal_ref = meta.get("terminal_bus_ref") if isinstance(meta, dict) else None
        return (
            field_ref if isinstance(field_ref, str) else None,
            terminal_ref if isinstance(terminal_ref, str) else None,
        )
    return None, None


def _ensure_line_run_for_corridor(
    enm: dict[str, Any],
    corridor_ref: str | None,
    *,
    starting_bay_ref: str | None = None,
    starting_port_ref: str | None = None,
    run_kind: str = "main_trunk",
) -> dict[str, Any] | None:
    if not isinstance(corridor_ref, str) or not corridor_ref.strip():
        return None
    line_runs = enm.setdefault("line_runs", [])
    for line_run in line_runs:
        if isinstance(line_run, dict) and line_run.get("id") == corridor_ref:
            return line_run

    corridor = _find_corridor_by_ref(enm, corridor_ref) or {}
    gpz_line_bay_ref, gpz_line_port_ref = _first_gpz_line_field_for_run(enm)
    start_bay = starting_bay_ref or corridor.get("starting_bay_ref") or gpz_line_bay_ref
    start_port = (
        starting_port_ref or corridor.get("starting_port_ref") or gpz_line_port_ref or start_bay
    )
    if (
        not isinstance(start_bay, str)
        or not start_bay
        or not isinstance(start_port, str)
        or not start_port
    ):
        return None

    corridor_type = str(corridor.get("corridor_type") or "").lower()
    normalized_kind = "ring" if corridor_type == "ring" else run_kind
    if normalized_kind not in {"main_trunk", "branch", "ring", "loop"}:
        normalized_kind = "main_trunk"
    line_run = {
        "id": corridor_ref,
        "name": corridor.get("name") if isinstance(corridor.get("name"), str) else "Ciąg SN",
        "run_kind": normalized_kind,
        "starting_bay_ref": start_bay,
        "starting_port_ref": start_port,
        "segments": [],
        "stations": [],
        "nop_station_ref": corridor.get("no_point_ref"),
        "parent_run_ref": corridor.get("parent_run_ref"),
        "branch_origin_station_ref": corridor.get("branch_origin_station_ref"),
    }
    line_runs.append(line_run)
    return line_run


def _append_line_run_segment(line_run: dict[str, Any] | None, segment_ref: str | None) -> None:
    if not isinstance(line_run, dict) or not isinstance(segment_ref, str) or not segment_ref:
        return
    segments = line_run.setdefault("segments", [])
    if any(isinstance(item, dict) and item.get("segment_ref") == segment_ref for item in segments):
        return
    segments.append({"segment_ref": segment_ref, "order": len(segments) + 1})


def _append_line_run_station(line_run: dict[str, Any] | None, substation_ref: str | None) -> None:
    if not isinstance(line_run, dict) or not isinstance(substation_ref, str) or not substation_ref:
        return
    stations = line_run.setdefault("stations", [])
    if any(
        isinstance(item, dict) and item.get("substation_ref") == substation_ref for item in stations
    ):
        return
    stations.append({"substation_ref": substation_ref, "order": len(stations) + 1})


def _is_mv_route_segment(branch: dict[str, Any] | None) -> bool:
    """Odcinek trasy SN widoczny w topologii, bez łączników wewnętrznych punktów."""
    if not isinstance(branch, dict):
        return False
    if branch.get("type") not in {"cable", "line_overhead"}:
        return False
    tags = branch.get("tags") if isinstance(branch.get("tags"), list) else []
    if "branch_point_internal_connector" in tags:
        return False
    meta = branch.get("meta") if isinstance(branch.get("meta"), dict) else {}
    return meta.get("render_on_sld") is not False


def _segment_refs_connected_to_bus(enm: dict[str, Any], bus_ref: str | None) -> list[str]:
    if not isinstance(bus_ref, str) or not bus_ref:
        return []
    refs: list[str] = []
    for branch in enm.get("branches", []):
        if not _is_mv_route_segment(branch):
            continue
        if branch.get("from_bus_ref") == bus_ref or branch.get("to_bus_ref") == bus_ref:
            branch_ref = branch.get("ref_id")
            if isinstance(branch_ref, str):
                refs.append(branch_ref)
    return refs


def _branch_point_main_segment_refs(enm: dict[str, Any], branch_point: dict[str, Any]) -> list[str]:
    runtime_inputs = branch_point.get("runtime_inputs")
    runtime_refs = (
        runtime_inputs.get("main_segment_refs") if isinstance(runtime_inputs, dict) else None
    )
    existing_refs = {
        branch.get("ref_id") for branch in enm.get("branches", []) if _is_mv_route_segment(branch)
    }
    if isinstance(runtime_refs, list):
        refs = [ref for ref in runtime_refs if isinstance(ref, str) and ref in existing_refs]
        if refs:
            return refs

    connected_refs = _segment_refs_connected_to_bus(enm, branch_point.get("bus_ref"))
    expected_type = (
        "line_overhead" if branch_point.get("branch_point_type") == "branch_pole" else "cable"
    )
    by_ref = {
        branch.get("ref_id"): branch
        for branch in enm.get("branches", [])
        if _is_mv_route_segment(branch)
    }
    matching = [ref for ref in connected_refs if by_ref.get(ref, {}).get("type") == expected_type]
    return matching or connected_refs


def _line_run_ref_for_segments(enm: dict[str, Any], segment_refs: list[str]) -> str | None:
    segment_ref_set = set(segment_refs)
    if not segment_ref_set:
        return None
    for run in enm.get("line_runs", []):
        if not isinstance(run, dict):
            continue
        for item in run.get("segments") or []:
            if isinstance(item, dict) and item.get("segment_ref") in segment_ref_set:
                run_id = run.get("id")
                return run_id if isinstance(run_id, str) else None
    return None


def _is_trunk_start_field_spec(spec: dict[str, Any]) -> bool:
    role = str(spec.get("bay_role", "")).upper()
    if role not in {"OUT", "FEEDER", "IN"}:
        return False
    return True


def _sn_bus_refs_for_substation(enm: dict[str, Any], substation: dict[str, Any]) -> list[str]:
    bus_index = {bus.get("ref_id"): bus for bus in enm.get("buses", [])}
    bus_refs = [ref for ref in substation.get("bus_refs", []) if isinstance(ref, str)]
    sn_bus_refs: list[str] = []
    for bus_ref in bus_refs:
        bus = bus_index.get(bus_ref)
        if bus is None:
            continue
        voltage = bus.get("voltage_kv")
        if isinstance(voltage, int | float) and float(voltage) >= 1.0:
            sn_bus_refs.append(bus_ref)
    if sn_bus_refs:
        return sn_bus_refs
    return bus_refs[:1]


def _find_branch(enm: dict[str, Any], ref_id: str) -> dict[str, Any] | None:
    """Znajdź gałąź po ref_id."""
    for b in enm.get("branches", []):
        if b.get("ref_id") == ref_id:
            return b
    return None


def _find_branch_or_split_child(enm: dict[str, Any], ref_id: str) -> dict[str, Any] | None:
    """Znajdź gałąź albo jej połówkę po wstawieniu ZKSN/słupa."""
    exact = _find_branch(enm, ref_id)
    if exact:
        return exact
    split_prefix = f"{ref_id}_"
    for branch in enm.get("branches", []):
        if str(branch.get("ref_id") or "").startswith(split_prefix):
            return branch
    return None


def _station_has_transformer(enm: dict[str, Any], station_ref: object) -> bool:
    """Sprawdź, czy stacja ma transformator SN/nN powiązany prefiksem ref_id."""
    if not isinstance(station_ref, str) or not station_ref.strip():
        return False
    station_ref = station_ref.strip()
    transformers = enm.get("transformers", [])
    station = next(
        (
            candidate
            for candidate in enm.get("substations", [])
            if candidate.get("ref_id") == station_ref or candidate.get("id") == station_ref
        ),
        None,
    )
    if station:
        transformer_refs = {
            str(ref)
            for ref in station.get("transformer_refs", [])
            if isinstance(ref, str) and ref.strip()
        }
        if transformer_refs:
            return any(
                transformer.get("ref_id") in transformer_refs
                or transformer.get("id") in transformer_refs
                for transformer in transformers
            )
    station_prefix = station_ref.rsplit("/", 1)[0] + "/"
    for transformer in transformers:
        transformer_meta = (
            transformer.get("meta") if isinstance(transformer.get("meta"), dict) else {}
        )
        if (
            transformer.get("station_ref") == station_ref
            or transformer_meta.get("station_ref") == station_ref
            or str(transformer.get("ref_id") or "").startswith(station_prefix)
        ):
            return True
    return False


def _find_corridor_for_segment(enm: dict[str, Any], segment_ref: str) -> dict[str, Any] | None:
    """Znajdź magistralę (corridor) zawierającą dany segment."""
    for c in enm.get("corridors", []):
        if segment_ref in c.get("ordered_segment_refs", []):
            return c
    return None


def _auto_detect_trunk_end(enm: dict[str, Any], trunk_id: str | None) -> str | None:
    """Auto-detect the end bus of the trunk for continue_trunk operations.

    Strategy: find the corridor, get the last segment, return its to_bus_ref.
    If no corridor segments, return the first bus (GPZ bus).
    """
    corridors = enm.get("corridors", [])
    target_corridor = None

    if trunk_id:
        for c in corridors:
            if c.get("ref_id") == trunk_id:
                target_corridor = c
                break
    elif corridors:
        target_corridor = corridors[0]

    if target_corridor:
        segments = target_corridor.get("ordered_segment_refs", [])
        if segments:
            last_seg_ref = segments[-1]
            for b in enm.get("branches", []):
                if b.get("ref_id") == last_seg_ref:
                    return b.get("to_bus_ref")

    # Fallback: return the first bus (likely GPZ bus)
    buses = enm.get("buses", [])
    if buses:
        return buses[0].get("ref_id")
    return None


def _resolve_initial_trunk_start_field(
    enm: dict[str, Any], trunk_id: str | None
) -> dict[str, Any] | None:
    """Find the catalog line field that starts an empty trunk."""
    corridors = enm.get("corridors", [])
    target_corridor = None

    if trunk_id:
        for corridor in corridors:
            if corridor.get("ref_id") == trunk_id:
                target_corridor = corridor
                break
    elif corridors:
        target_corridor = corridors[0]

    if target_corridor and target_corridor.get("ordered_segment_refs"):
        return None

    field_specs_by_bus = _field_specs_by_bus(enm)
    source_bus_refs = sorted(
        {
            source.get("bus_ref")
            for source in enm.get("sources", [])
            if isinstance(source, dict) and isinstance(source.get("bus_ref"), str)
        }
    )
    for bus_ref in source_bus_refs:
        for spec in field_specs_by_bus.get(bus_ref, []):
            if _is_trunk_start_field_spec(spec):
                return spec
    all_specs = [
        spec
        for specs in field_specs_by_bus.values()
        for spec in specs
        if _is_trunk_start_field_spec(spec)
    ]
    if all_specs:
        return sorted(
            all_specs,
            key=lambda spec: (
                str(spec.get("station_ref", "")),
                str(spec.get("field_ref", "")),
            ),
        )[0]
    return None


def _build_readiness(enm: dict[str, Any]) -> dict[str, Any]:
    """Oblicz gotowość i blokery z walidatora."""
    try:
        enm_model = EnergyNetworkModel.model_validate(enm)
        validator = ENMValidator()
        validation = validator.validate(enm_model)
        readiness = validator.readiness(validation)

        blockers = []
        warnings = []
        fix_actions = []

        for issue in validation.issues:
            entry = {
                "code": issue.code,
                "message_pl": issue.message_pl,
                "element_ref": issue.element_refs[0] if issue.element_refs else None,
            }
            fa = None
            if issue.fix_action:
                fa = {
                    "code": issue.code,
                    "action_type": issue.fix_action.action_type,
                    "element_ref": issue.fix_action.element_ref,
                    "panel": issue.fix_action.modal_type,
                    "step": issue.wizard_step_hint or None,
                    "focus": issue.fix_action.element_ref,
                    "message_pl": issue.suggested_fix or issue.message_pl,
                }
                fix_actions.append(fa)

            if issue.severity == "BLOCKER":
                entry["severity"] = "BLOKUJACE"
                blockers.append(entry)
            elif issue.severity == "IMPORTANT":
                entry["severity"] = "OSTRZEZENIE"
                warnings.append(entry)

        # Domain-level check: PV/BESS generators without transformer
        for gen in enm.get("generators", []):
            gen_type = (gen.get("gen_type") or "").lower()
            if "pv" in gen_type or "bess" in gen_type or "inverter" in gen_type:
                has_trafo = bool(gen.get("blocking_transformer_ref")) or _station_has_transformer(
                    enm,
                    gen.get("station_ref"),
                )
                cv = gen.get("connection_variant") or ""
                if not has_trafo and "direct" not in cv.lower():
                    blockers.append(
                        {
                            "code": "pv_bess.transformer_required",
                            "message_pl": (
                                f"Generator OZE '{gen.get('name', gen.get('ref_id'))}' "
                                f"typu {gen_type} wymaga transformatora w ścieżce."
                            ),
                            "element_ref": gen.get("ref_id"),
                            "severity": "BLOKUJACE",
                        }
                    )
                    fix_actions.append(
                        {
                            "code": "pv_bess.transformer_required",
                            "action_type": "add_transformer_sn_nn",
                            "element_ref": gen.get("ref_id"),
                            "panel": "transformer_panel",
                            "step": None,
                            "focus": gen.get("ref_id"),
                            "message_pl": "Dodaj transformator dla generatora OZE.",
                        }
                    )

        # Domain-level check: branch points (slup rozgałęźny / ZKSN)
        for bp in enm.get("branch_points", []):
            bp_ref = bp.get("ref_id")
            bp_type = bp.get("branch_point_type")
            bp_label = _branch_point_public_label(bp)
            parent_segment_id = bp.get("parent_segment_id")
            main_in = bp.get("ports", {}).get("MAIN_IN")
            main_out = bp.get("ports", {}).get("MAIN_OUT")
            branch_ports = bp.get("ports", {}).get("BRANCH", [])

            parent = (
                _find_branch_or_split_child(enm, parent_segment_id) if parent_segment_id else None
            )
            if not parent:
                blockers.append(
                    {
                        "code": "branch_point.invalid_parent_medium",
                        "message_pl": f"{bp_label} wymaga poprawnego odcinka nadrzędnego.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )
            else:
                if bp_type == "branch_pole" and parent.get("type") != "line_overhead":
                    blockers.append(
                        {
                            "code": "branch_point.invalid_parent_medium",
                            "message_pl": (
                                "Słup rozgałęźny SN może być osadzony tylko na linii napowietrznej."
                            ),
                            "element_ref": bp_ref,
                            "severity": "BLOKUJACE",
                        }
                    )
                if bp_type == "zksn" and parent.get("type") != "cable":
                    blockers.append(
                        {
                            "code": "branch_point.invalid_parent_medium",
                            "message_pl": "ZKSN może być osadzony tylko na odcinku kablowym SN.",
                            "element_ref": bp_ref,
                            "severity": "BLOKUJACE",
                        }
                    )

            if not main_in or not main_out:
                blockers.append(
                    {
                        "code": "branch_point.required_port_missing",
                        "message_pl": (
                            f"{bp_label} wymaga portu wejściowego i wyjściowego toru głównego."
                        ),
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )

            if not bp.get("catalog_ref"):
                blockers.append(
                    {
                        "code": "branch_point.catalog_ref_missing",
                        "message_pl": f"{bp_label} wymaga wariantu katalogowego.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )
                fix_actions.append(
                    {
                        "code": "branch_point.catalog_ref_missing",
                        "action_type": "SELECT_CATALOG",
                        "element_ref": bp_ref,
                        "panel": "catalog",
                        "step": "branch_point",
                        "focus": bp_ref,
                        "message_pl": "Wybierz pozycję katalogową dla punktu rozgałęzienia.",
                    }
                )

            if bp_type == "zksn" and len(branch_ports) not in (1, 2):
                blockers.append(
                    {
                        "code": "zksn.branch_count_invalid",
                        "message_pl": "ZKSN wymaga jednego albo dwóch portów odgałęźnych.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )

            if bp_type == "zksn" and not bp.get("switch_state"):
                blockers.append(
                    {
                        "code": "branch_point.switch_state_missing",
                        "message_pl": "ZKSN wymaga wskazania stanu normalnego łącznika.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )

        # Domain-level check: switches/breakers without catalog_ref
        for b in enm.get("branches", []):
            b_type = b.get("type", "")
            b_meta = b.get("meta") if isinstance(b.get("meta"), dict) else {}
            if (
                b_type in ("switch", "breaker")
                and not b.get("catalog_ref")
                and b_meta.get("requires_catalog_binding") is not False
            ):
                b_ref = b.get("ref_id", "")
                blockers.append(
                    {
                        "code": "switch.catalog_ref_missing",
                        "message_pl": (
                            f"Łącznik '{b.get('name', b_ref)}' "
                            "nie ma przypisanej referencji katalogowej."
                        ),
                        "element_ref": b_ref,
                        "severity": "BLOKUJACE",
                    }
                )
                fix_actions.append(
                    {
                        "code": "switch.catalog_ref_missing",
                        "action_type": "SELECT_CATALOG",
                        "element_ref": b_ref,
                        "panel": "catalog",
                        "step": "switch",
                        "focus": b_ref,
                        "message_pl": "Wybierz pozycję katalogową dla łącznika.",
                    }
                )

        has_any_blocker = len(blockers) > 0
        return {
            "ready": readiness.ready and not has_any_blocker,
            "blockers": blockers,
            "warnings": warnings,
        }, fix_actions
    except Exception:
        return {"ready": False, "blockers": [], "warnings": []}, []


def _compute_logical_views(enm: dict[str, Any]) -> dict[str, Any]:
    """Oblicz widoki logiczne — deterministyczna pochodna Snapshot.

    Zawiera magistrale z terminalami, odgałęzienia, połączenia wtórne.
    """
    corridors = enm.get("corridors", [])
    branches = enm.get("branches", [])
    # Index branches by ref_id
    branch_idx = {b.get("ref_id"): b for b in branches}
    # Collect all segment refs that belong to corridors
    corridor_segment_refs: set[str] = set()
    for c in corridors:
        for seg in c.get("ordered_segment_refs", []):
            corridor_segment_refs.add(seg)

    branch_points = {bp.get("bus_ref"): bp for bp in enm.get("branch_points", [])}
    field_specs_by_bus = _field_specs_by_bus(enm)
    source_bus_refs = sorted(
        {
            source.get("bus_ref")
            for source in enm.get("sources", [])
            if isinstance(source, dict) and isinstance(source.get("bus_ref"), str)
        }
    )

    # Build trunks with terminals
    trunks = []
    for c in sorted(corridors, key=lambda x: x.get("ref_id", "")):
        segments = c.get("ordered_segment_refs", [])
        terminals = []

        if segments:
            # Start terminal: from_bus of first segment
            first_seg = branch_idx.get(segments[0])
            if first_seg:
                start_bus = first_seg.get("from_bus_ref", "")
                # Check if start bus has other connections (ZAJETY) or is open
                start_status = _terminal_status(enm, start_bus, c.get("ref_id"))
                terminals.append(
                    {
                        "element_id": start_bus,
                        "port_id": "trunk_start",
                        "trunk_id": c.get("ref_id"),
                        "branch_id": None,
                        "status": start_status,
                    }
                )

            # End terminal: to_bus of last segment
            last_seg = branch_idx.get(segments[-1])
            if last_seg:
                end_bus = last_seg.get("to_bus_ref", "")
                end_status = _terminal_status(enm, end_bus, c.get("ref_id"))
                terminals.append(
                    {
                        "element_id": end_bus,
                        "port_id": "trunk_end",
                        "trunk_id": c.get("ref_id"),
                        "branch_id": None,
                        "status": end_status,
                    }
                )
        else:
            for bus_ref in source_bus_refs:
                start_field = next(
                    (
                        spec
                        for spec in field_specs_by_bus.get(bus_ref, [])
                        if _is_trunk_start_field_spec(spec)
                    ),
                    None,
                )
                if start_field is None:
                    continue
                terminals.append(
                    {
                        "element_id": start_field["field_ref"],
                        "port_id": "trunk_out",
                        "trunk_id": c.get("ref_id"),
                        "branch_id": None,
                        "status": "OTWARTY",
                        "bus_ref": bus_ref,
                        "station_ref": start_field.get("station_ref"),
                    }
                )
                break

        embedded_objects: list[dict[str, Any]] = []
        for seg_ref in segments:
            seg = branch_idx.get(seg_ref)
            if not seg:
                continue
            for side in ("from_bus_ref", "to_bus_ref"):
                bp = branch_points.get(seg.get(side, ""))
                if not bp:
                    continue
                embedded_objects.append(
                    {
                        "object_id": bp.get("ref_id"),
                        "object_type": bp.get("branch_point_type"),
                        "segment_id": seg_ref,
                        "parent_segment_id": bp.get("parent_segment_id"),
                        "ports": bp.get("ports", {}),
                    }
                )

        trunks.append(
            {
                "corridor_ref": c.get("ref_id"),
                "corridor_type": c.get("corridor_type", "radial"),
                "segments": segments,
                "no_point_ref": c.get("no_point_ref"),
                "terminals": terminals,
                "embedded_objects": sorted(embedded_objects, key=lambda x: x.get("object_id", "")),
            }
        )

    # Collect all corridor bus refs for ring detection (needed before branch classification)
    corridor_bus_refs: set[str] = set()
    for c in corridors:
        for seg_ref in c.get("ordered_segment_refs", []):
            seg = branch_idx.get(seg_ref)
            if seg:
                corridor_bus_refs.add(seg.get("from_bus_ref", ""))
                corridor_bus_refs.add(seg.get("to_bus_ref", ""))
    corridor_bus_refs.discard("")

    # Classify non-corridor cable/line segments into branches vs secondary connectors
    branch_views = []
    secondary_connectors = []
    for b in sorted(branches, key=lambda x: x.get("ref_id", "")):
        ref = b.get("ref_id", "")
        if ref in corridor_segment_refs:
            continue
        btype = b.get("type", "")
        if btype not in ("cable", "line_overhead"):
            continue
        from_ref = b.get("from_bus_ref", "")
        to_ref = b.get("to_bus_ref", "")

        # Ring closure: both ends connect to corridor buses → secondary connector
        if from_ref in corridor_bus_refs and to_ref in corridor_bus_refs:
            secondary_connectors.append(
                {
                    "connector_id": ref,
                    "from_element_id": from_ref,
                    "to_element_id": to_ref,
                    "segment_ref": ref,
                }
            )
        else:
            # Lateral branch segment
            branch_views.append(
                {
                    "branch_id": ref,
                    "from_element_id": from_ref,
                    "from_port_id": "branch_start",
                    "segments": [ref],
                    "terminals": [
                        {
                            "element_id": to_ref,
                            "port_id": "branch_end",
                            "trunk_id": None,
                            "branch_id": ref,
                            "status": _terminal_status(enm, to_ref, None),
                        }
                    ],
                }
            )

    # Aggregate all terminals
    all_terminals = []
    for t in trunks:
        all_terminals.extend(t.get("terminals", []))
    for bv in branch_views:
        all_terminals.extend(bv.get("terminals", []))

    return {
        "trunks": trunks,
        "branches": branch_views,
        "secondary_connectors": secondary_connectors,
        "terminals": all_terminals,
    }


def _terminal_status(enm: dict[str, Any], bus_ref: str, corridor_ref: str | None) -> str:
    """Określ status terminala na podstawie topologii.

    OTWARTY — bus ma wolne porty (< 2 połączenia kablowe).
    ZAJETY — bus ma >= 2 połączenia kablowe w magistrali.
    ZAREZERWOWANY_DLA_RINGU — bus jest oznaczony jako kandydat do pierścienia.
    """
    cable_count = 0
    for b in enm.get("branches", []):
        btype = b.get("type", "")
        if btype in ("cable", "line_overhead"):
            if b.get("from_bus_ref") == bus_ref or b.get("to_bus_ref") == bus_ref:
                cable_count += 1

    # Ring corridor — end terminal is reserved
    if corridor_ref:
        for c in enm.get("corridors", []):
            if c.get("ref_id") == corridor_ref and c.get("corridor_type") == "ring":
                return "ZAREZERWOWANY_DLA_RINGU"

    if cable_count >= 2:
        return "ZAJETY"
    return "OTWARTY"


def _is_branch_start_bay_role(role: object) -> bool:
    return str(role or "").upper() in {"FEEDER", "OUT", "LINE_OUT"}


def _resolve_branch_from_ref(enm: dict[str, Any], from_ref: str) -> tuple[str | None, str | None]:
    """Rozwiąż from_ref (station/branch_pole/zksn) na szynę źródłową.

    Obsługiwane:
    - bay.BRANCH (pole liniowe stacji albo GPZ)
    - branch_pole.BRANCH
    - zksn.BRANCH_1, zksn.BRANCH_2
    """
    if "." not in from_ref:
        return None, "branch_connection.invalid_source_port"
    element_ref, port_id = from_ref.split(".", 1)

    bay = next(
        (
            candidate
            for candidate in enm.get("bays", [])
            if candidate.get("ref_id") == element_ref or candidate.get("id") == element_ref
        ),
        None,
    )
    if bay:
        if port_id != "BRANCH" or not _is_branch_start_bay_role(bay.get("bay_role")):
            return None, "branch_connection.invalid_source_port"
        bus_ref = bay.get("bus_ref")
        if not bus_ref:
            return None, "branch_connection.source_not_branch_capable"
        return bus_ref, None

    field_spec = _field_spec_for_ref(enm, element_ref)
    if field_spec:
        if port_id != "BRANCH" or not _is_line_continuation_field(enm, element_ref):
            return None, "branch_connection.invalid_source_port"
        bus_ref = _field_ref_to_bus_ref(enm, element_ref)
        if not bus_ref:
            return None, "branch_connection.source_not_branch_capable"
        return bus_ref, None

    if element_ref.startswith("stn/"):
        if port_id != "BRANCH":
            return None, "branch_connection.invalid_source_port"
        return None, "branch_connection.source_not_branch_capable"

    if element_ref.startswith("bus/"):
        if port_id != "BRANCH":
            return None, "branch_connection.invalid_source_port"
        bus = next(
            (
                candidate
                for candidate in enm.get("buses", [])
                if isinstance(candidate, dict) and candidate.get("ref_id") == element_ref
            ),
            None,
        )
        tags = bus.get("tags", []) if isinstance(bus, dict) else []
        if isinstance(tags, list) and "topology_terminal" in tags:
            return element_ref, None
        return None, "branch_connection.source_not_branch_capable"

    bp = next((b for b in enm.get("branch_points", []) if b.get("ref_id") == element_ref), None)
    if not bp:
        return None, "branch_connection.source_not_branch_capable"

    ports = bp.get("ports", {})
    if bp.get("branch_point_type") == "branch_pole":
        if port_id != "BRANCH":
            return None, "branch_connection.invalid_source_port"
        if bp.get("branch_occupied", {}).get(port_id):
            return None, "branch_point.branch_port_occupied"
        bus_ref = ports.get("BRANCH", [None])[0] if isinstance(ports.get("BRANCH"), list) else None
        if not bus_ref:
            return None, "branch_point.required_port_missing"
        return bus_ref, None

    if bp.get("branch_point_type") == "zksn":
        if not port_id.startswith("BRANCH_"):
            return None, "branch_connection.invalid_source_port"
        try:
            idx = int(port_id.split("_", 1)[1]) - 1
        except Exception:
            return None, "branch_connection.invalid_source_port"
        branch_ports = ports.get("BRANCH", [])
        if idx < 0 or idx >= len(branch_ports):
            return None, "branch_connection.invalid_source_port"
        if bp.get("branch_occupied", {}).get(port_id):
            return None, "branch_point.branch_port_occupied"
        return branch_ports[idx], None

    return None, "branch_connection.source_not_branch_capable"


def _lookup_branch_from_ref_for_bus(
    enm: dict[str, Any],
    from_bus_ref: str,
) -> tuple[str | None, str | None]:
    """Legacy lookup: wyznacz from_ref na podstawie from_bus_ref.

    Dopuszcza wyłącznie źródła branch-capable:
    - station.BRANCH (bay_role=FEEDER)
    - branch_pole.BRANCH
    - zksn.BRANCH_n
    """
    structured_candidates: list[str] = []

    for bp in enm.get("branch_points", []):
        bp_ref = bp.get("ref_id")
        ports = bp.get("ports", {})
        if not bp_ref:
            continue
        if bp.get("branch_point_type") == "branch_pole":
            branch_bus = (
                ports.get("BRANCH", [None])[0] if isinstance(ports.get("BRANCH"), list) else None
            )
            if branch_bus == from_bus_ref:
                structured_candidates.append(f"{bp_ref}.BRANCH")
        if bp.get("branch_point_type") == "zksn":
            for idx, bus_ref in enumerate(ports.get("BRANCH", []), start=1):
                if bus_ref == from_bus_ref:
                    structured_candidates.append(f"{bp_ref}.BRANCH_{idx}")

    unique_structured = sorted(set(structured_candidates))
    if len(unique_structured) == 1:
        return unique_structured[0], None
    if len(unique_structured) > 1:
        return None, "branch_connection.source_not_branch_capable"

    for bay in enm.get("bays", []):
        if not isinstance(bay, dict) or bay.get("bus_ref") != from_bus_ref:
            continue
        bay_ref = bay.get("ref_id") or bay.get("id")
        if isinstance(bay_ref, str) and _is_branch_start_bay_role(bay.get("bay_role")):
            structured_candidates.append(f"{bay_ref}.BRANCH")

    for specs in _field_specs_by_bus(enm).values():
        for spec in specs:
            if spec.get("bus_ref") != from_bus_ref:
                continue
            field_ref = spec.get("field_ref")
            if isinstance(field_ref, str) and _is_line_continuation_field(enm, field_ref):
                structured_candidates.append(f"{field_ref}.BRANCH")

    unique_structured = sorted(set(structured_candidates))
    if len(unique_structured) == 1:
        return unique_structured[0], None
    if len(unique_structured) > 1:
        return None, "branch_connection.source_not_branch_capable"

    bus = next(
        (
            candidate
            for candidate in enm.get("buses", [])
            if isinstance(candidate, dict) and candidate.get("ref_id") == from_bus_ref
        ),
        None,
    )
    tags = bus.get("tags", []) if isinstance(bus, dict) else []
    if isinstance(tags, list) and "topology_terminal" in tags:
        return f"{from_bus_ref}.BRANCH", None

    return None, "branch_connection.source_not_branch_capable"


def _get_catalog_safe():
    """Załaduj katalog MV (bezpieczne — zwraca None przy braku)."""
    try:
        from network_model.catalog import get_default_mv_catalog

        return get_default_mv_catalog()
    except Exception:
        return None


def _build_catalog_binding_payload(
    catalog_ref: str,
    catalog_binding: object,
    *,
    default_namespace: str,
    default_version: str | None = None,
) -> dict[str, Any]:
    """Znormalizuj binding do jednego kanonicznego kontraktu."""
    binding = catalog_binding if isinstance(catalog_binding, dict) else {}
    return {
        "catalog_namespace": (_extract_catalog_binding_namespace(binding) or default_namespace),
        "catalog_item_id": catalog_ref,
        "catalog_item_version": (
            _extract_catalog_binding_version(binding) or default_version or "legacy"
        ),
        "materialize": bool(binding.get("materialize", True)),
        "snapshot_mapping_version": str(binding.get("snapshot_mapping_version", "1.0")),
    }


def _materialize_catalog_payload(
    *,
    catalog_ref: str,
    catalog_binding: object,
    default_namespace: str,
    default_version: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]] | dict[str, Any]:
    """Zmaterializuj pozycję katalogową do trwałych pól snapshotu."""
    catalog = _get_catalog_safe()
    if catalog is None:
        return _error_response(
            "Nie udało się załadować repozytorium katalogowego.",
            "catalog.materialization_incomplete",
        )

    binding_payload = _build_catalog_binding_payload(
        catalog_ref,
        catalog_binding,
        default_namespace=default_namespace,
        default_version=default_version,
    )
    binding = CatalogBinding.from_dict(binding_payload)
    result = materialize_catalog_binding(binding, catalog)
    if not result.success:
        return _error_response(
            result.error_message_pl or "Materializacja katalogu nie powiodła się.",
            result.error_code or "catalog.materialization_incomplete",
        )

    materialized_params = {
        "catalog_item_id": binding.catalog_item_id,
        "catalog_item_version": binding.catalog_item_version or None,
        **result.solver_fields,
    }
    return binding_payload, materialized_params


def _apply_materialized_branch_fields(
    target: dict[str, Any],
    materialized_params: dict[str, Any],
) -> None:
    """Wpisz do gałęzi zarówno fizykę solvera, jak i trwałą materializację."""
    target["materialized_params"] = materialized_params

    r_ohm_per_km = materialized_params.get("r_ohm_per_km")
    x_ohm_per_km = materialized_params.get("x_ohm_per_km")
    if r_ohm_per_km is not None:
        target["r_ohm_per_km"] = float(r_ohm_per_km)
    if x_ohm_per_km is not None:
        target["x_ohm_per_km"] = float(x_ohm_per_km)

    b_us_per_km = materialized_params.get("b_us_per_km")
    c_nf_per_km = materialized_params.get("c_nf_per_km")
    if b_us_per_km is not None:
        target["b_siemens_per_km"] = float(b_us_per_km) / 1_000_000.0
    elif c_nf_per_km is not None:
        target["b_siemens_per_km"] = 2 * math.pi * 50.0 * float(c_nf_per_km) * 1e-9

    rated_current_a = (
        materialized_params.get("rated_current_a")
        if materialized_params.get("rated_current_a") is not None
        else materialized_params.get("i_max_a")
    )
    if rated_current_a is not None:
        target["rating"] = {
            **(target.get("rating") or {}),
            "in_a": float(rated_current_a),
        }

    for key in ("r0_ohm_per_km", "x0_ohm_per_km", "b0_siemens_per_km"):
        value = materialized_params.get(key)
        if value is not None:
            target[key] = float(value)

    for key in (
        "cross_section_mm2",
        "return_conductor_cross_section_mm2",
        "return_conductor_r_ohm_per_km_20c",
        "return_conductor_jth_1s_a_per_mm2",
        "return_conductor_ith_1s_a",
        # Karta F-K1 faza 3/6: dane cieplne ZYLY FAZOWEJ i para temperatur, ktora
        # uzasadnia wspolczynnik k. Bez przepisania na galaz kryterium cieplne
        # dostawaloby je wylacznie z recznej edycji modelu.
        "jth_1s_a_per_mm2",
        "ith_1s_a",
    ):
        value = materialized_params.get(key)
        if value is not None:
            target[key] = float(value)

    temperatura_robocza = materialized_params.get("max_temperature_c")
    if temperatura_robocza is not None:
        target["operating_temperature_c"] = float(temperatura_robocza)
    temperatura_zwarciowa = materialized_params.get("short_circuit_temperature_c")
    if temperatura_zwarciowa is not None:
        target["short_circuit_temperature_c"] = float(temperatura_zwarciowa)
    izolacja = materialized_params.get("insulation_type")
    if isinstance(izolacja, str) and izolacja.strip():
        target["insulation"] = izolacja.strip().upper()

    # Karta F-K1 faza 7: ODNIESIENIE NORMOWE danych cieplnych. Pole `thermal_source_ref`
    # bylo w modelu, w grafie i w dowodzie od fazy 6, ale zaden kontrakt go nie
    # wypelnial — dowod pokazywal „zrodlo: —", czyli pole bez dostawcy. Pierwszenstwo
    # ma odniesienie DEDYKOWANE cieplu (linie napowietrzne), w drugiej kolejnosci
    # metadana jakosci calego rekordu katalogu (kable).
    for klucz_zrodla in ("thermal_source_reference", "source_reference"):
        zrodlo = materialized_params.get(klucz_zrodla)
        if isinstance(zrodlo, str) and zrodlo.strip():
            target["thermal_source_ref"] = zrodlo.strip()
            break

    number_of_cores = materialized_params.get("number_of_cores")
    if number_of_cores is not None:
        target["number_of_cores"] = int(number_of_cores)

    for key in ("conductor_material", "return_conductor_material"):
        value = materialized_params.get(key)
        if isinstance(value, str) and value.strip():
            target[key] = value.strip().upper()


def _copy_split_segment_fields(target: dict[str, Any], source: dict[str, Any]) -> None:
    """Zachowaj dane katalogowe i elektryczne przy podziale odcinka SN."""
    for key in (
        "catalog_ref",
        "catalog_namespace",
        "source_mode",
        "parameter_source",
        "materialized_params",
        "overrides",
        "rating",
        "insulation",
        "b_siemens_per_km",
        "r0_ohm_per_km",
        "x0_ohm_per_km",
        "b0_siemens_per_km",
        "conductor_material",
        "cross_section_mm2",
        "number_of_cores",
        "return_conductor_cross_section_mm2",
        "return_conductor_material",
        "return_conductor_r_ohm_per_km_20c",
        "return_conductor_jth_1s_a_per_mm2",
        "return_conductor_ith_1s_a",
        # Karta F-K1 faza 7: dane cieplne ZYLY FAZOWEJ i para temperatur uzasadniajaca
        # k. Podzial odcinka GUBIL je po drodze, wiec po wstawieniu stacji na magistrali
        # kryterium cieplne przestawalo dzialac dla obu polowek odcinka (werdykt
        # NIEDOSTEPNY) — mimo ze przewod byl fizycznie ten sam.
        "jth_1s_a_per_mm2",
        "ith_1s_a",
        "operating_temperature_c",
        "short_circuit_temperature_c",
        "thermal_source_ref",
    ):
        if source.get(key) is not None:
            target[key] = copy.deepcopy(source[key])

    if isinstance(source.get("meta"), dict):
        target.setdefault("meta", {}).update(copy.deepcopy(source["meta"]))


def _apply_explicit_segment_zero_sequence(
    target: dict[str, Any],
    segment_payload: dict[str, Any],
) -> None:
    """Przenieś jawnie podane R0/X0 odcinka bez wyliczania ani zgadywania."""
    zero_sequence = segment_payload.get("zero_sequence")
    source = zero_sequence if isinstance(zero_sequence, dict) else segment_payload
    for payload_key, target_key in (
        ("r0_ohm_per_km", "r0_ohm_per_km"),
        ("x0_ohm_per_km", "x0_ohm_per_km"),
        ("b0_siemens_per_km", "b0_siemens_per_km"),
    ):
        value = source.get(payload_key)
        if isinstance(value, int | float):
            target[target_key] = float(value)


def _apply_materialized_transformer_fields(
    target: dict[str, Any],
    materialized_params: dict[str, Any],
) -> None:
    """Wpisz do transformatora trwałą materializację i pola solverowe."""
    target["materialized_params"] = materialized_params

    field_mapping = {
        "rated_power_mva": "sn_mva",
        "voltage_hv_kv": "uhv_kv",
        "voltage_lv_kv": "ulv_kv",
        "uk_percent": "uk_percent",
        "pk_kw": "pk_kw",
        "p0_kw": "p0_kw",
        "i0_percent": "i0_percent",
        "vector_group": "vector_group",
        "tap_min": "tap_min",
        "tap_max": "tap_max",
        "tap_step_percent": "tap_step_percent",
    }
    for source_key, target_key in field_mapping.items():
        if materialized_params.get(source_key) is not None:
            target[target_key] = materialized_params[source_key]


def _as_positive_float(value: object) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _opt_int(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _opt_float_any(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _build_gpz_tap_changer(
    payload: dict[str, Any],
    *,
    controlled_bus_ref: str,
) -> dict[str, Any] | None:
    """Build the canonical tap-changer dict for a GPZ 110/SN transformer (V12K-045).

    Every field maps to a real ``TapChanger`` field (zero fabrication). When a
    catalog reference is given it seeds the object (reuse of ``TapChangerItem``);
    explicit payload fields override the seed. Returns None when the operator did
    not request regulation (regulation_type NONE/absent) — backward compatible.
    """
    regulation_type = str(payload.get("transformer_regulation_type") or "NONE").upper()
    catalog_ref = payload.get("transformer_tap_changer_catalog_ref")

    if regulation_type == "NONE" and not catalog_ref:
        return None

    seed: dict[str, Any] = {}
    if catalog_ref:
        item = get_tap_changer(str(catalog_ref))
        if item is not None:
            seed = tap_changer_fields_from_catalog(item)
            regulation_type = str(
                payload.get("transformer_regulation_type") or seed["regulation_type"]
            ).upper()

    if regulation_type == "NONE":
        return None

    tc: dict[str, Any] = {
        "regulation_type": regulation_type,
        "regulated_winding": str(
            payload.get("transformer_regulated_winding") or seed.get("regulated_winding") or "HV"
        ).upper(),
        "neutral_position": (
            _opt_int(payload.get("transformer_tap_neutral_position"))
            if payload.get("transformer_tap_neutral_position") is not None
            else int(seed.get("neutral_position", 0))
        ),
        "current_position": (
            _opt_int(payload.get("transformer_tap_current_position"))
            if payload.get("transformer_tap_current_position") is not None
            else int(seed.get("current_position", seed.get("neutral_position", 0)))
        ),
        "min_position": (
            _opt_int(payload.get("transformer_tap_min_position"))
            if payload.get("transformer_tap_min_position") is not None
            else int(seed.get("min_position", 0))
        ),
        "max_position": (
            _opt_int(payload.get("transformer_tap_max_position"))
            if payload.get("transformer_tap_max_position") is not None
            else int(seed.get("max_position", 0))
        ),
        "step_percent": (
            _opt_float_any(payload.get("transformer_tap_step_percent"))
            if payload.get("transformer_tap_step_percent") is not None
            else float(seed.get("step_percent", 0.0))
        ),
        "control_mode": str(
            payload.get("transformer_control_mode") or seed.get("control_mode") or "MANUAL"
        ).upper(),
    }

    setpoint = _opt_float_any(payload.get("transformer_voltage_setpoint_kv"))
    if setpoint is not None:
        tc["voltage_setpoint_kv"] = setpoint
    deadband = _opt_float_any(payload.get("transformer_deadband_kv"))
    if deadband is not None:
        tc["deadband_kv"] = deadband
    delay = _opt_float_any(payload.get("transformer_delay_seconds"))
    if delay is not None:
        tc["delay_seconds"] = delay

    controlled_ref = payload.get("transformer_controlled_bus_ref") or controlled_bus_ref
    if controlled_ref:
        tc["controlled_bus_ref"] = str(controlled_ref)

    if payload.get("transformer_ldc_enabled"):
        tc["line_drop_compensation"] = {
            "enabled": True,
            "r_ohm": _opt_float_any(payload.get("transformer_ldc_r_ohm")) or 0.0,
            "x_ohm": _opt_float_any(payload.get("transformer_ldc_x_ohm")) or 0.0,
        }

    if catalog_ref:
        tc["catalog_ref"] = str(catalog_ref)

    return tc


#: Kontrakt domenowy podzespolu zaczepow (`enm.models.TapChanger`) — JEDNO miejsce,
#: w ktorym zapisane sa dozwolone wartosci. Bez tej listy payload przechodzil
#: WPROST do modelu (walidacja Pydantic nie jest uruchamiana przy zapisie migawki),
#: wiec regulacja spoza kontraktu zapisywala sie cicho i wywracala solver dopiero
#: przy odczycie. Znalezisko karty KD-3 (B-2), naprawa u zrodla dla WSZYSTKICH
#: wolajacych `_build_gpz_tap_changer`, nie tylko dla operacji stacyjnej.
_TAP_REGULATION_TYPES = ("NONE", "DETC", "OLTC")
_TAP_REGULATED_WINDINGS = ("HV", "LV")
_TAP_CONTROL_MODES = ("MANUAL", "AUTOMATIC", "PROFILE", "REMOTE")


def _blad_zaczepow(tap_changer: dict[str, Any]) -> str | None:
    """Zwroc opis bledu zaczepow albo ``None``, gdy podzespol jest poprawny."""
    regulacja = str(tap_changer.get("regulation_type") or "")
    if regulacja not in _TAP_REGULATION_TYPES:
        return (
            f"Typ regulacji '{regulacja}' jest nieprawidłowy. "
            f"Dozwolone: {', '.join(_TAP_REGULATION_TYPES)}."
        )
    uzwojenie = str(tap_changer.get("regulated_winding") or "")
    if uzwojenie not in _TAP_REGULATED_WINDINGS:
        return (
            f"Regulowane uzwojenie '{uzwojenie}' jest nieprawidłowe. "
            f"Dozwolone: {', '.join(_TAP_REGULATED_WINDINGS)}."
        )
    tryb = str(tap_changer.get("control_mode") or "")
    if tryb not in _TAP_CONTROL_MODES:
        return (
            f"Tryb sterowania '{tryb}' jest nieprawidłowy. "
            f"Dozwolone: {', '.join(_TAP_CONTROL_MODES)}."
        )

    minimum = tap_changer.get("min_position")
    maksimum = tap_changer.get("max_position")
    biezaca = tap_changer.get("current_position")
    neutralna = tap_changer.get("neutral_position")
    if not all(isinstance(v, int) for v in (minimum, maksimum, biezaca, neutralna)):
        return "Pozycje zaczepów muszą być liczbami całkowitymi."
    assert isinstance(minimum, int) and isinstance(maksimum, int)
    assert isinstance(biezaca, int) and isinstance(neutralna, int)
    if minimum > maksimum:
        return f"Zakres zaczepów jest odwrócony (min {minimum} > max {maksimum})."
    if not minimum <= biezaca <= maksimum:
        return f"Pozycja bieżąca {biezaca} jest poza zakresem [{minimum}, {maksimum}]."
    if not minimum <= neutralna <= maksimum:
        return f"Pozycja neutralna {neutralna} jest poza zakresem [{minimum}, {maksimum}]."

    krok = tap_changer.get("step_percent")
    if not isinstance(krok, int | float) or krok < 0:
        return "Krok zaczepu musi być liczbą nieujemną."
    return None


def _validate_transformer_voltage_compatibility(
    *,
    transformer_data: dict[str, Any],
    expected_hv_kv: Any,
    expected_lv_kv: Any,
) -> dict[str, Any] | None:
    """Sprawdź zgodność napięć stacji z materializacją katalogową transformatora."""
    expected_hv = _as_positive_float(expected_hv_kv)
    expected_lv = _as_positive_float(expected_lv_kv)
    catalog_hv = _as_positive_float(transformer_data.get("uhv_kv"))
    catalog_lv = _as_positive_float(transformer_data.get("ulv_kv"))

    if expected_hv is None or expected_lv is None or catalog_hv is None or catalog_lv is None:
        return _error_response(
            "Nie udało się zweryfikować napięć transformatora katalogowego.",
            "station.insert.transformer_voltage_missing",
        )

    if abs(catalog_hv - expected_hv) > 0.01 or abs(catalog_lv - expected_lv) > 0.001:
        return _error_response(
            "Brak transformatora katalogowego zgodnego z napięciem SN i napięciem strony nN źródła.",
            "station.insert.transformer_voltage_mismatch",
        )

    return None


def _element_requires_catalog(collection: str, element: dict[str, Any]) -> bool:
    """Określ, czy dany element techniczny może istnieć wyłącznie z katalogiem."""
    if collection in {
        "branches",
        "transformers",
        "sources",
        "branch_points",
        "loads",
        "measurements",
        "protection_assignments",
    }:
        return True

    if collection == "generators":
        gen_type = str(element.get("gen_type") or "").upper()
        return gen_type in {
            "PV_INVERTER",
            "WIND_INVERTER",
            "BESS",
            "BESS_INVERTER",
            "GENSET",
            "UPS",
        }

    return False


def _compute_materialized_params(enm: dict[str, Any]) -> dict[str, Any]:
    """Oblicz zmaterializowane parametry katalogowe.

    Każdy segment z catalog_ref ma skopiowane parametry.
    Jeśli dostępny jest katalog (CatalogRepository), parametry są
    rozwiązywane z katalogu (precedence: catalog > instance).
    """
    lines_sn: dict[str, Any] = {}
    transformers_sn_nn: dict[str, Any] = {}
    sources_sn: dict[str, Any] = {}

    # Try loading catalog for actual parameter resolution
    catalog = _get_catalog_safe()

    for b in enm.get("branches", []):
        btype = b.get("type", "")
        if btype not in ("cable", "line_overhead"):
            continue
        catalog_ref = b.get("catalog_ref")
        if not catalog_ref:
            continue

        materialized = b.get("materialized_params")
        if isinstance(materialized, dict) and materialized:
            r_ohm_per_km = materialized.get("r_ohm_per_km")
            x_ohm_per_km = materialized.get("x_ohm_per_km")
            i_max_a = (
                materialized.get("rated_current_a")
                if materialized.get("rated_current_a") is not None
                else materialized.get("i_max_a")
            )
        else:
            r_ohm_per_km = b.get("r_ohm_per_km")
            x_ohm_per_km = b.get("x_ohm_per_km")
            i_max_a = (
                (b.get("rating") or {}).get("in_a") if isinstance(b.get("rating"), dict) else None
            )

            if catalog:
                is_cable = btype == "cable"
                type_data = (
                    catalog.get_cable_type(catalog_ref)
                    if is_cable
                    else catalog.get_line_type(catalog_ref)
                )
                if type_data:
                    r_ohm_per_km = type_data.r_ohm_per_km
                    x_ohm_per_km = type_data.x_ohm_per_km
                    i_max_a = type_data.rated_current_a

        lines_sn[b["ref_id"]] = {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": b.get("meta", {}).get("catalog_item_version"),
            "r_ohm_per_km": r_ohm_per_km,
            "x_ohm_per_km": x_ohm_per_km,
            "i_max_a": i_max_a,
        }

    for t in enm.get("transformers", []):
        catalog_ref = t.get("catalog_ref")
        if not catalog_ref:
            continue

        materialized = t.get("materialized_params")
        if isinstance(materialized, dict) and materialized:
            uk_percent = materialized.get("uk_percent")
            p0_kw = materialized.get("p0_kw")
            pk_kw = materialized.get("pk_kw")
            rated_power_mva = materialized.get("rated_power_mva")
            s_n_kva = (
                float(rated_power_mva) * 1000
                if rated_power_mva is not None
                else (t.get("sn_mva") or 0) * 1000 if t.get("sn_mva") else None
            )
        else:
            uk_percent = t.get("uk_percent")
            p0_kw = t.get("p0_kw")
            pk_kw = t.get("pk_kw")
            s_n_kva = (t.get("sn_mva") or 0) * 1000 if t.get("sn_mva") else None

            if catalog:
                type_data = catalog.get_transformer_type(catalog_ref)
                if type_data:
                    uk_percent = type_data.uk_percent
                    p0_kw = type_data.p0_kw
                    pk_kw = type_data.pk_kw
                    s_n_kva = type_data.rated_power_mva * 1000

        transformers_sn_nn[t["ref_id"]] = {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": t.get("meta", {}).get("catalog_item_version"),
            "u_k_percent": uk_percent,
            "p0_kw": p0_kw,
            "pk_kw": pk_kw,
            "s_n_kva": s_n_kva,
        }

    for s in enm.get("sources", []):
        catalog_ref = s.get("catalog_ref")
        if not catalog_ref:
            continue

        materialized = s.get("materialized_params")
        if isinstance(materialized, dict) and materialized:
            voltage_rating_kv = materialized.get("voltage_rating_kv")
            sk3_mva = materialized.get("sk3_mva")
            ik3_ka = materialized.get("ik3_ka")
            rx_ratio = materialized.get("rx_ratio")
        else:
            voltage_rating_kv = None
            sk3_mva = s.get("sk3_mva")
            ik3_ka = s.get("ik3_ka")
            rx_ratio = s.get("rx_ratio")
            if catalog:
                type_data = getattr(catalog, "get_source_system_type", lambda _id: None)(
                    catalog_ref
                )
                if type_data:
                    voltage_rating_kv = type_data.voltage_rating_kv
                    sk3_mva = type_data.sk3_mva
                    ik3_ka = type_data.ik3_ka
                    rx_ratio = type_data.rx_ratio

        sources_sn[s["ref_id"]] = {
            "catalog_item_id": catalog_ref,
            "catalog_item_version": s.get("meta", {}).get("catalog_item_version"),
            "voltage_rating_kv": voltage_rating_kv,
            "sk3_mva": sk3_mva,
            "ik3_ka": ik3_ka,
            "rx_ratio": rx_ratio,
        }

    return {
        "lines_sn": lines_sn,
        "transformers_sn_nn": transformers_sn_nn,
        "sources_sn": sources_sn,
    }


def _compute_layout_hash(enm: dict[str, Any]) -> str:
    """Oblicz deterministyczny hash układu topologicznego."""
    layout_data = {
        "buses": sorted([b.get("ref_id", "") for b in enm.get("buses", [])]),
        "branches": sorted(
            [
                f"{b.get('from_bus_ref', '')}→{b.get('to_bus_ref', '')}"
                for b in enm.get("branches", [])
            ]
        ),
        "transformers": sorted(
            [
                f"{t.get('hv_bus_ref', '')}→{t.get('lv_bus_ref', '')}"
                for t in enm.get("transformers", [])
            ]
        ),
        "corridors": [
            c.get("ordered_segment_refs", [])
            for c in sorted(
                enm.get("corridors", []),
                key=lambda x: x.get("ref_id", ""),
            )
        ],
    }
    canonical = _canonical_json(layout_data)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _response(
    enm: dict[str, Any],
    created: list[str] | None = None,
    updated: list[str] | None = None,
    deleted: list[str] | None = None,
    selection_id: str | None = None,
    selection_type: str | None = None,
    audit: list[dict] | None = None,
    events: list[dict] | None = None,
) -> dict[str, Any]:
    """Zbuduj standardową odpowiedź operacji domenowej."""
    enm = _complete_catalog_branch_point_defaults(enm)
    readiness, fix_actions = _build_readiness(enm)
    logical_views = _compute_logical_views(enm)
    materialized_params = _compute_materialized_params(enm)
    layout_hash = _compute_layout_hash(enm)

    return {
        "snapshot": enm,
        "logical_views": logical_views,
        "readiness": readiness,
        "fix_actions": fix_actions,
        "changes": {
            "created_element_ids": created or [],
            "updated_element_ids": updated or [],
            "deleted_element_ids": deleted or [],
        },
        "selection_hint": (
            {
                "element_id": selection_id,
                "element_type": selection_type,
                "zoom_to": True,
            }
            if selection_id
            else None
        ),
        "audit_trail": audit or [],
        "domain_events": events or [],
        "materialized_params": materialized_params,
        "layout": {
            "layout_hash": f"sha256:{layout_hash}",
            "layout_version": "1.0",
        },
    }


def _error_response(message: str, code: str = "UNKNOWN") -> dict[str, Any]:
    """Odpowiedź błędu operacji."""
    return {
        "error": message,
        "error_code": code,
        "snapshot": None,
        "logical_views": {},
        "readiness": {"ready": False, "blockers": [], "warnings": []},
        "fix_actions": [],
        "changes": {
            "created_element_ids": [],
            "updated_element_ids": [],
            "deleted_element_ids": [],
        },
        "selection_hint": None,
        "audit_trail": [],
        "domain_events": [],
        "materialized_params": {"lines_sn": {}, "transformers_sn_nn": {}, "sources_sn": {}},
        "layout": {"layout_hash": "", "layout_version": "1.0"},
        "semantic_issues": [],
    }


def _require_catalog_ref(
    payload_ref: object,
    payload_binding: object,
    context_code: str,
) -> str | dict[str, Any]:
    """Zwróć kanoniczny catalog_ref albo odpowiedź błędu catalog.ref_required."""
    error_message = (
        f"{context_code}: wymagane powiązanie z katalogiem "
        "(catalog_ref lub poprawne catalog_binding.catalog_item_id)."
    )
    if isinstance(payload_ref, str):
        normalized_ref = payload_ref.strip()
        if normalized_ref:
            return normalized_ref

    if payload_binding is not None:
        if not isinstance(payload_binding, dict):
            return _error_response(error_message, "catalog.ref_required")
        binding_item_id = _extract_catalog_binding_item_id(payload_binding)
        if binding_item_id:
            return binding_item_id
        return _error_response(error_message, "catalog.ref_required")

    return _error_response(error_message, "catalog.ref_required")


def _resolve_manual_source_equivalent(
    payload: dict[str, Any],
) -> dict[str, Any] | None | dict[str, Any]:
    manual = payload.get("manual_equivalent")
    if manual is None:
        return None
    if not isinstance(manual, dict):
        return _error_response(
            "Ręczna umowa równoważna źródła GPZ ma nieprawidłowy format.",
            "source.manual_equivalent_invalid",
        )

    def _as_positive_number(value: object) -> float | None:
        if not isinstance(value, int | float):
            return None
        normalized = float(value)
        if normalized <= 0:
            return None
        return normalized

    def _as_non_negative_number(value: object) -> float | None:
        if not isinstance(value, int | float):
            return None
        normalized = float(value)
        if normalized < 0:
            return None
        return normalized

    sn_voltage_kv = _as_positive_number(manual.get("sn_voltage_kv", payload.get("voltage_kv")))
    input_side = (
        str(manual.get("short_circuit_input_side", payload.get("short_circuit_input_side", "SN")))
        .strip()
        .upper()
    )
    if input_side in {"HV", "WN", "HV110", "110KV", "110_KV"}:
        input_side = "HV_110"
    if input_side != "HV_110":
        input_side = "SN"
    hv_voltage_kv = _as_positive_number(
        manual.get(
            "hv_voltage_kv", manual.get("voltage_hv_kv", payload.get("hv_voltage_kv", 110.0))
        )
    )
    voltage_kv = hv_voltage_kv if input_side == "HV_110" else sn_voltage_kv
    short_circuit_mode = (
        str(
            manual.get(
                "short_circuit_mode", payload.get("short_circuit_mode", "SHORT_CIRCUIT_POWER")
            )
        )
        .strip()
        .upper()
    )
    ik3_ka = _as_positive_number(manual.get("ik3_ka", payload.get("ik3_ka")))

    if sn_voltage_kv is None:
        return _error_response(
            "Ręczna umowa równoważna GPZ wymaga dodatniego napięcia znamionowego SN.",
            "source.manual_equivalent_incomplete",
        )

    if input_side == "HV_110" and voltage_kv is None:
        return _error_response(
            "Reczna umowa rownowazna GPZ WN/SN wymaga dodatniego napiecia strony WN.",
            "source.manual_equivalent_incomplete",
        )

    resolved: dict[str, Any] = {
        "voltage_kv": voltage_kv,
        "sn_voltage_kv": sn_voltage_kv,
        "voltage_hv_kv": hv_voltage_kv if input_side == "HV_110" else None,
        "short_circuit_input_side": input_side,
        "manual_equivalent": True,
        "short_circuit_mode": short_circuit_mode,
    }

    if short_circuit_mode == "IMPEDANCE":
        r_ohm = _as_non_negative_number(manual.get("r_ohm", payload.get("r_ohm")))
        x_ohm = _as_positive_number(manual.get("x_ohm", payload.get("x_ohm")))
        if r_ohm is None or x_ohm is None:
            return _error_response(
                "Ręczna umowa równoważna GPZ w trybie impedancyjnym wymaga parametrów R i X.",
                "source.manual_equivalent_incomplete",
            )

        z_abs = math.hypot(r_ohm, x_ohm)
        if z_abs <= 0:
            return _error_response(
                "Impedancja zastępcza GPZ musi być dodatnia.",
                "source.manual_equivalent_incomplete",
            )

        resolved.update(
            {
                "r_ohm": r_ohm,
                "x_ohm": x_ohm,
                "sk3_mva": (voltage_kv * voltage_kv) / z_abs,
                "rx_ratio": r_ohm / x_ohm if x_ohm > 0 else 0.0,
                "short_circuit_model": "thevenin",
            }
        )
    else:
        sk3_mva = _as_positive_number(
            manual.get("sk3_hv_mva", payload.get("sk3_hv_mva"))
            if input_side == "HV_110"
            else manual.get("sk3_mva", payload.get("sk3_mva"))
        )
        rx_ratio = _as_positive_number(manual.get("rx_ratio", payload.get("rx_ratio")))
        if sk3_mva is None:
            if input_side == "HV_110":
                return _error_response(
                    "Reczna umowa rownowazna GPZ WN/SN wymaga dodatniej mocy zwarciowej Sk3 na szynie 110 kV.",
                    "source.manual_equivalent_incomplete",
                )
            return _error_response(
                "Ręczna umowa równoważna GPZ wymaga dodatniej mocy zwarciowej Sk3.",
                "source.manual_equivalent_incomplete",
            )
        if rx_ratio is None:
            return _error_response(
                "Ręczna umowa równoważna GPZ wymaga dodatniego stosunku R/X.",
                "source.manual_equivalent_incomplete",
            )

        resolved.update(
            {
                "sk3_mva": sk3_mva,
                "sk3_hv_mva": sk3_mva if input_side == "HV_110" else None,
                "rx_ratio": rx_ratio,
                "short_circuit_model": "short_circuit_power",
            }
        )

    r0_ohm = manual.get("r0_ohm", payload.get("r0_ohm"))
    x0_ohm = manual.get("x0_ohm", payload.get("x0_ohm"))
    z0_z1_ratio = manual.get("z0_z1_ratio", payload.get("z0_z1_ratio"))
    if isinstance(r0_ohm, int | float):
        resolved["r0_ohm"] = float(r0_ohm)
    if isinstance(x0_ohm, int | float):
        resolved["x0_ohm"] = float(x0_ohm)
    if isinstance(z0_z1_ratio, int | float) and float(z0_z1_ratio) > 0:
        resolved["z0_z1_ratio"] = float(z0_z1_ratio)
    if ik3_ka is not None:
        resolved["ik3_ka"] = ik3_ka
    return resolved


# ---------------------------------------------------------------------------
# 1. add_grid_source_sn
# ---------------------------------------------------------------------------


def add_grid_source_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj źródło zasilania (GPZ) — pierwszy krok budowy sieci SN."""
    voltage_kv = payload.get("voltage_kv")
    manual_equivalent = _resolve_manual_source_equivalent(payload)
    if isinstance(manual_equivalent, dict) and manual_equivalent.get("error"):
        return manual_equivalent
    manual_source_mode = isinstance(manual_equivalent, dict)
    gpz_section_entries = _normalize_gpz_section_entries(payload)
    sections_count = int(payload.get("sections_count", len(gpz_section_entries) or 1) or 1)
    if len(gpz_section_entries) != sections_count:
        requested_line_fields_count = _read_gpz_line_fields_count({}, payload)
        gpz_section_entries = [
            {
                "order": index,
                "name": f"Sekcja {index + 1}",
                "bus_name": None,
                "line_field_name": None,
                "line_field_names": [],
                "line_fields_count": requested_line_fields_count,
            }
            for index in range(sections_count)
        ]
    if sections_count < 1 or sections_count > 4:
        return _error_response(
            "GPZ musi mieć od 1 do 4 sekcji szyn SN.",
            "source.invalid_sections_count",
        )
    transformer_count = _read_gpz_transformer_count(payload, sections_count)
    if transformer_count < 1 or transformer_count > MAX_GPZ_WN_SN_TRANSFORMERS:
        return _error_response(
            "GPZ musi mieć od 1 do 4 transformatorów 110/SN.",
            "source.invalid_transformer_count",
        )
    for index, entry in enumerate(gpz_section_entries):
        line_fields_count = entry.get("line_fields_count")
        if (
            not isinstance(line_fields_count, int)
            or line_fields_count < 1
            or line_fields_count > MAX_GPZ_LINE_FIELDS_PER_SECTION
        ):
            return _error_response(
                (
                    "Sekcja GPZ "
                    f"{index + 1} musi mieć od 1 do {MAX_GPZ_LINE_FIELDS_PER_SECTION} "
                    "pól liniowych odpływowych."
                ),
                "source.invalid_line_fields_count",
            )
    if manual_source_mode and (voltage_kv is None or voltage_kv <= 0):
        voltage_kv = manual_equivalent["voltage_kv"]
    if voltage_kv is None or voltage_kv <= 0:
        # Pobierz napięcie z jawnych ustawień projektu (ENM defaults)
        voltage_kv = enm.get("header", {}).get("defaults", {}).get("sn_nominal_kv")
    if voltage_kv is None or voltage_kv <= 0:
        return _error_response(
            "Brak napięcia znamionowego SN: podaj voltage_kv w payloadzie lub ustaw "
            "defaults.sn_nominal_kv w nagłówku ENM.",
            "source.missing_voltage",
        )

    source_identity_raw = (
        payload.get("source_id")
        or payload.get("solution_ref")
        or payload.get("source_name")
        or payload.get("name_pl")
    )
    source_identity = (
        source_identity_raw.strip()
        if isinstance(source_identity_raw, str) and source_identity_raw.strip()
        else None
    )
    display_name = (
        payload.get("source_name")
        or payload.get("name_pl")
        or (f"GPZ {source_identity}" if source_identity else None)
        or f"GPZ {voltage_kv} kV"
    )

    existing_sources = [source for source in enm.get("sources", []) if isinstance(source, dict)]
    if existing_sources and not source_identity:
        return _error_response(
            "Sieć ma już GPZ. Dodanie kolejnego GPZ wymaga unikalnego source_id albo solution_ref.",
            "source.identity_required",
        )
    if source_identity:
        for source in existing_sources:
            source_meta = source.get("meta") if isinstance(source.get("meta"), dict) else {}
            existing_identity = (
                source_meta.get("source_id")
                or source_meta.get("solution_ref")
                or source.get("source_id")
            )
            if existing_identity == source_identity:
                return _error_response(
                    "GPZ o podanym identyfikatorze jest już w sieci.",
                    "source.already_exists",
                )

    allowed_grounding_types = {
        "isolated",
        "petersen_coil",
        "directly_grounded",
        "resistor_grounded",
    }
    grounding_payload = payload.get("grounding")
    grounding_config = None
    if grounding_payload is not None:
        if not isinstance(grounding_payload, dict):
            return _error_response(
                "Konfiguracja uziemienia GPZ ma nieprawidłowy format.",
                "source.invalid_grounding",
            )
        grounding_type = grounding_payload.get("type")
        if grounding_type not in allowed_grounding_types:
            return _error_response(
                "Typ uziemienia GPZ jest nieprawidłowy.",
                "source.invalid_grounding",
            )
        grounding_config = {"type": grounding_type}
        if isinstance(grounding_payload.get("r_ohm"), int | float):
            grounding_config["r_ohm"] = float(grounding_payload["r_ohm"])
        if isinstance(grounding_payload.get("x_ohm"), int | float):
            grounding_config["x_ohm"] = float(grounding_payload["x_ohm"])

    zero_sequence_payload = payload.get("zero_sequence")
    zero_sequence_config = None
    if zero_sequence_payload is not None:
        if not isinstance(zero_sequence_payload, dict):
            return _error_response(
                "Parametry składowej zerowej GPZ mają nieprawidłowy format.",
                "source.invalid_zero_sequence",
            )
        zero_sequence_config = {"enabled": bool(zero_sequence_payload.get("enabled", False))}
        for key in ("r0_ohm", "x0_ohm", "z0_z1_ratio"):
            if isinstance(zero_sequence_payload.get(key), int | float):
                zero_sequence_config[key] = float(zero_sequence_payload[key])

    catalog_binding = payload.get("catalog_binding")
    binding_payload = None
    if manual_source_mode:
        catalog_ref = None
        materialized_params = {
            "voltage_rating_kv": manual_equivalent["voltage_kv"],
            "sk3_mva": manual_equivalent["sk3_mva"],
            "rx_ratio": manual_equivalent["rx_ratio"],
            "short_circuit_model": manual_equivalent["short_circuit_model"],
            "short_circuit_mode": manual_equivalent["short_circuit_mode"],
            "short_circuit_input_side": manual_equivalent.get("short_circuit_input_side", "SN"),
            "sn_voltage_kv": manual_equivalent.get("sn_voltage_kv"),
            "voltage_hv_kv": manual_equivalent.get("voltage_hv_kv"),
            "sk3_hv_mva": manual_equivalent.get("sk3_hv_mva"),
            "manual_equivalent": True,
        }
        if manual_equivalent.get("ik3_ka") is not None:
            materialized_params["ik3_ka"] = manual_equivalent["ik3_ka"]
        for key in ("r_ohm", "x_ohm", "r0_ohm", "x0_ohm", "z0_z1_ratio"):
            if manual_equivalent.get(key) is not None:
                materialized_params[key] = manual_equivalent[key]
    else:
        catalog_ref_required = _require_catalog_ref(
            payload.get("catalog_ref"),
            catalog_binding,
            "Źródło systemowe GPZ",
        )
        if isinstance(catalog_ref_required, dict):
            return catalog_ref_required
        catalog_ref = catalog_ref_required
        materialization = _materialize_catalog_payload(
            catalog_ref=catalog_ref,
            catalog_binding=catalog_binding,
            default_namespace="ZRODLO_SN",
        )
        if isinstance(materialization, dict):
            return materialization
        binding_payload, materialized_params = materialization
        if not materialized_params.get("short_circuit_model"):
            materialized_params["short_circuit_model"] = "short_circuit_power"
        if not materialized_params.get("short_circuit_mode"):
            materialized_params["short_circuit_mode"] = "SHORT_CIRCUIT_POWER"
    if zero_sequence_config:
        for key in ("r0_ohm", "x0_ohm", "z0_z1_ratio"):
            if zero_sequence_config.get(key) is not None:
                materialized_params[key] = zero_sequence_config[key]
    if (voltage_kv is None or voltage_kv <= 0) and materialized_params.get(
        "voltage_rating_kv"
    ) is not None:
        voltage_kv = materialized_params["voltage_rating_kv"]
    if voltage_kv is None or voltage_kv <= 0:
        voltage_kv = enm.get("header", {}).get("defaults", {}).get("sn_nominal_kv")
    if voltage_kv is None or voltage_kv <= 0:
        return _error_response(
            "Brak napięcia znamionowego SN: podaj voltage_kv w payloadzie lub ustaw defaults.sn_nominal_kv w nagłówku ENM.",
            "source.missing_voltage",
        )
    line_field_apparatus = _normalize_gpz_line_field_apparatus(payload)

    # Rodzina rozdzielnicy producenta (Reference Engine) — opcjonalna, addytywna.
    # Wiąże pola GPZ ze szablonami producenta; spływa do SLD (internal_layout),
    # oceny zgodności (Reference Engine) i widoku pola. Nie wchodzi do seeda
    # (determinizm istniejących payloadów zachowany).
    def _opt_str(value: Any) -> str | None:
        return value.strip() if isinstance(value, str) and value.strip() else None

    gpz_switchgear_family_ref = _opt_str(payload.get("switchgear_family_ref"))
    gpz_manufacturer_ref = _opt_str(payload.get("manufacturer_ref"))

    seed = _compute_seed(
        {
            "op": "add_grid_source_sn",
            "catalog_ref": catalog_ref,
            "voltage_kv": voltage_kv,
            "sections_count": sections_count,
            "source_identity": source_identity or "primary",
            "source_name": display_name,
            "manual_equivalent": manual_equivalent or None,
            "grounding": grounding_config,
            "zero_sequence": zero_sequence_config,
        }
    )
    source_ref = _make_id("gpz", seed, "source/main")
    substation_ref = _make_id("gpz", seed, "substation")
    corridor_ref = _make_id("gpz", seed, "corridor_01")
    gpz_sections: list[dict[str, Any]] = []
    gpz_section_bus_refs: list[str] = []
    gpz_section_bus_names: list[str] = []
    for idx, entry in enumerate(gpz_section_entries):
        order = idx + 1
        section_ref = _make_id("gpz", seed, f"section/{order:03d}")
        section_bus_ref = _make_id("gpz", seed, f"section/{order:03d}/bus_sn")
        section_bus_name = entry.get("bus_name") or f"Szyna GPZ S{order} {voltage_kv} kV"
        section_name = entry.get("name") or f"Sekcja {idx + 1}"
        line_fields_count = int(entry.get("line_fields_count") or 1)
        line_field_names = _build_gpz_line_field_names(entry, line_fields_count)
        gpz_sections.append(
            {
                "section_id": section_ref,
                "order": idx,
                "name": section_name,
                "line_field_name": line_field_names[0] if line_field_names else None,
                "line_field_names": line_field_names,
                "line_fields_count": line_fields_count,
                "line_field_refs": [],
                "bus_ref": section_bus_ref,
                "incoming_source_ref": source_ref if idx == 0 else None,
                "left_coupler_ref": None,
                "right_coupler_ref": None,
                "bay_template_ref": entry.get("bay_template_ref"),
                "bays": entry.get("bays") or [],
            }
        )
        gpz_section_bus_refs.append(section_bus_ref)
        gpz_section_bus_names.append(section_bus_name)

    new_enm = copy.deepcopy(enm)
    created = []
    events = []
    audit = []
    ev_seq = 0

    # Create GPZ sections (SN buses)
    for idx, section in enumerate(gpz_sections):
        result = create_node(
            new_enm,
            {
                "ref_id": section["bus_ref"],
                "name": gpz_section_bus_names[idx],
                "voltage_kv": voltage_kv,
                "zone": "GPZ",
                "grounding": grounding_config,
                "meta": {
                    "gpz_section_id": section["section_id"],
                    "gpz_section_order": section["order"],
                    "gpz_substation_ref": substation_ref,
                },
            },
        )
        if not result.success:
            return _error_response(
                f"Nie udało się utworzyć sekcji GPZ: {result.issues[0].message_pl if result.issues else '?'}",
                "source.bus_creation_failed",
            )
        new_enm = result.enm
        created.append(section["bus_ref"])
        ev_seq += 1
        events.append(
            {
                "event_seq": ev_seq,
                "event_type": "BUS_CREATED",
                "element_id": section["bus_ref"],
            }
        )
        audit.append(
            {
                "step": ev_seq,
                "action": f"Utworzono sekcje GPZ {idx + 1}",
                "element_id": section["bus_ref"],
            }
        )

    gpz_transformer_refs: list[str] = []
    gpz_hv_bus_refs: list[str] = []
    for index in range(transformer_count):
        order = index + 1
        hv_bus_ref = _make_id("gpz", seed, f"transformer/{order:03d}/bus_110")
        transformer_ref = _make_id("gpz", seed, f"transformer/{order:03d}/wn_sn")
        section = gpz_sections[index % len(gpz_sections)]
        result = create_node(
            new_enm,
            {
                "ref_id": hv_bus_ref,
                "name": f"Szyna 110 kV TR{order}",
                "voltage_kv": float(payload.get("hv_voltage_kv") or 110.0),
                "tags": ["gpz_hv_bus", "helper_bus"],
                "meta": {
                    "visual_role": "GPZ_HV_BUS",
                    "gpz_substation_ref": substation_ref,
                    "gpz_transformer_ref": transformer_ref,
                    "render_on_sld": True,
                    "show_in_project_tree": False,
                },
            },
        )
        if not result.success:
            return _error_response(
                f"Nie udało się utworzyć szyny 110 kV transformatora GPZ: {result.issues[0].message_pl if result.issues else '?'}",
                "source.transformer_hv_bus_failed",
            )
        new_enm = result.enm
        created.append(hv_bus_ref)
        ev_seq += 1
        events.append({"event_seq": ev_seq, "event_type": "BUS_CREATED", "element_id": hv_bus_ref})
        gpz_hv_bus_refs.append(hv_bus_ref)

        transformer_rated_power_mva = float(payload.get("transformer_sn_mva") or 25.0)
        transformer_catalog_ref = _resolve_gpz_wn_sn_transformer_catalog_ref(
            payload,
            voltage_kv=voltage_kv,
            rated_power_mva=transformer_rated_power_mva,
        )
        if isinstance(transformer_catalog_ref, dict):
            return transformer_catalog_ref

        transformer_catalog_binding = payload.get("transformer_catalog_binding")
        materialization = _materialize_catalog_payload(
            catalog_ref=transformer_catalog_ref,
            catalog_binding=transformer_catalog_binding,
            default_namespace="TRAFO_SN_NN",
        )
        if isinstance(materialization, dict):
            return materialization
        transformer_binding_payload, transformer_materialized_params = materialization

        transformer = {
            "ref_id": transformer_ref,
            "name": payload.get(f"transformer_{order}_name") or f"TR{order} 110/{voltage_kv:g} kV",
            "tags": ["gpz_wn_sn_transformer"],
            "meta": {
                "gpz_substation_ref": substation_ref,
                "gpz_section_id": section["section_id"],
                "gpz_section_order": section["order"],
                "visual_role": "GPZ_WN_SN_TRANSFORMER",
            },
            "hv_bus_ref": hv_bus_ref,
            "lv_bus_ref": section["bus_ref"],
            "sn_mva": transformer_rated_power_mva,
            "uhv_kv": float(payload.get("hv_voltage_kv") or 110.0),
            "ulv_kv": float(voltage_kv),
            "uk_percent": float(payload.get("transformer_uk_percent") or 12.0),
            "pk_kw": float(payload.get("transformer_pk_kw") or 120.0),
            "p0_kw": float(payload.get("transformer_p0_kw") or 25.0),
            "i0_percent": float(payload.get("transformer_i0_percent") or 0.2),
            "vector_group": payload.get("transformer_vector_group") or "YNd11",
            "catalog_ref": transformer_catalog_ref,
            "overrides": [],
        }
        _apply_catalog_metadata(
            transformer,
            transformer_binding_payload,
            default_namespace="TRAFO_SN_NN",
        )
        _apply_materialized_transformer_fields(transformer, transformer_materialized_params)
        transformer["meta"]["catalog_role"] = "TRANSFORMATOR_WN_SN"
        # V12K-045 (OLTC F3): canonical tap changer materialized from the payload
        # (regulated per its own SN busbar). Absent when regulation not requested.
        gpz_tap_changer = _build_gpz_tap_changer(payload, controlled_bus_ref=section["bus_ref"])
        if gpz_tap_changer is not None:
            # Kontrakt domenowy zaczepów sprawdzany PRZED zapisem (karta KD-3):
            # wartość spoza kontraktu zapisywała się dotąd cicho.
            blad_zaczepow = _blad_zaczepow(gpz_tap_changer)
            if blad_zaczepow is not None:
                return _error_response(
                    f"Transformator {transformer_ref} — {blad_zaczepow}",
                    "transformer.tap_changer_invalid",
                )
            transformer["tap_changer"] = gpz_tap_changer
        new_enm.setdefault("transformers", []).append(transformer)
        gpz_transformer_refs.append(transformer_ref)
        created.append(transformer_ref)
        ev_seq += 1
        events.append(
            {
                "event_seq": ev_seq,
                "event_type": "TRANSFORMER_CREATED",
                "element_id": transformer_ref,
            }
        )
        audit.append(
            {
                "step": ev_seq,
                "action": f"Utworzono transformator WN/SN TR{order}",
                "element_id": transformer_ref,
            }
        )

    # Create source
    source_bus_ref = (
        gpz_hv_bus_refs[0]
        if materialized_params.get("short_circuit_input_side") == "HV_110" and gpz_hv_bus_refs
        else gpz_section_bus_refs[0]
    )
    source_data = {
        "device_type": "source",
        "ref_id": source_ref,
        "name": payload.get("source_name")
        or payload.get("name_pl")
        or f"Źródło GPZ {voltage_kv} kV",
        "bus_ref": source_bus_ref,
        "substation_ref": substation_ref,
        "gpz_section_id": (
            gpz_sections[0]["section_id"]
            if gpz_sections and source_bus_ref == gpz_section_bus_refs[0]
            else None
        ),
        "source_side": materialized_params.get("short_circuit_input_side", "SN"),
        "model": materialized_params.get("short_circuit_model", "short_circuit_power"),
        "catalog_ref": catalog_ref,
        "materialized_params": materialized_params,
        "meta": {
            "source_id": source_identity,
            "solution_ref": payload.get("solution_ref"),
            "catalog_role": "GPZ_110_SN",
        },
    }
    if binding_payload is not None:
        _apply_catalog_metadata(source_data, binding_payload, default_namespace="ZRODLO_SN")
    elif manual_source_mode:
        source_data["source_mode"] = payload.get("source_mode") or "EKSPERCKI_RECZNY"
        source_data["parameter_source"] = payload.get("parameter_source") or "MANUAL_EQUIVALENT"
    if payload.get("source_mode"):
        source_data["source_mode"] = payload["source_mode"]
    if payload.get("parameter_source"):
        source_data["parameter_source"] = payload["parameter_source"]
    if isinstance(payload.get("overrides"), list):
        source_data["overrides"] = payload["overrides"]
    for key in (
        "sk3_mva",
        "ik3_ka",
        "rx_ratio",
        "r_ohm",
        "x_ohm",
        "r0_ohm",
        "x0_ohm",
        "z0_z1_ratio",
        "sn_voltage_kv",
        "voltage_hv_kv",
        "sk3_hv_mva",
        "c_max",
        "c_min",
    ):
        if materialized_params.get(key) is not None:
            source_data[key] = materialized_params[key]

    result = create_device(new_enm, source_data)
    if not result.success:
        return _error_response(
            f"Nie udało się utworzyć źródła: {result.issues[0].message_pl if result.issues else '?'}",
            "source.creation_failed",
        )
    new_enm = result.enm
    created.append(source_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "SOURCE_CREATED", "element_id": source_ref})
    audit.append({"step": ev_seq, "action": "Utworzono źródło zasilania", "element_id": source_ref})

    for idx in range(1, len(gpz_sections)):
        left_section = gpz_sections[idx - 1]
        right_section = gpz_sections[idx]
        coupler_ref = _make_id("gpz", seed, f"coupler/{idx:03d}")
        coupler_name = payload.get("gpz_coupler_name") or f"Sprzęgło sekcji GPZ {idx}-{idx + 1}"
        new_enm.setdefault("branches", []).append(
            {
                "ref_id": coupler_ref,
                "name": coupler_name,
                "type": "bus_coupler",
                "from_bus_ref": left_section["bus_ref"],
                "to_bus_ref": right_section["bus_ref"],
                "status": "closed",
                "catalog_ref": None,
                "catalog_namespace": None,
                "parameter_source": None,
                "source_mode": None,
                "materialized_params": None,
                "overrides": [],
                "r_ohm": None,
                "x_ohm": None,
            }
        )
        left_section["right_coupler_ref"] = coupler_ref
        right_section["left_coupler_ref"] = coupler_ref
        created.append(coupler_ref)
        ev_seq += 1
        events.append(
            {"event_seq": ev_seq, "event_type": "BRANCH_CREATED", "element_id": coupler_ref}
        )
        audit.append(
            {"step": ev_seq, "action": "Utworzono sprzęgło sekcyjne GPZ", "element_id": coupler_ref}
        )

    field_specs = []
    for idx, section in enumerate(gpz_sections):
        line_field_names = section.get("line_field_names")
        if not isinstance(line_field_names, list):
            line_field_names = []
        section_bays = section.get("bays") if isinstance(section.get("bays"), list) else []
        for field_index in range(int(section.get("line_fields_count") or 1)):
            bay_spec = section_bays[field_index] if field_index < len(section_bays) else {}
            bay_ref = _make_id("gpz", seed, f"bay/{idx + 1:03d}/{field_index + 1:03d}")
            terminal_bus_ref = _make_id(
                "gpz",
                seed,
                f"bay/{idx + 1:03d}/{field_index + 1:03d}/terminal",
            )
            apparatus_ref = _make_id(
                "gpz",
                seed,
                f"bay/{idx + 1:03d}/{field_index + 1:03d}/apparatus",
            )
            bay_name = (
                bay_spec.get("name")
                or (line_field_names[field_index] if field_index < len(line_field_names) else None)
                or f"Pole liniowe GPZ {idx + 1}.{field_index + 1}"
            )
            # Szablon pola producenta: preferuj per-pole, potem sekcyjny.
            bay_template_ref = bay_spec.get("bay_template_ref") or section.get("bay_template_ref")
            bay_protection_ref = bay_spec.get("protection_ref")
            section["line_field_refs"].append(bay_ref)
            equipment_refs: list[str] = []
            field_meta: dict[str, Any] = {
                "gpz_section_id": section["section_id"],
                "gpz_section_order": section["order"],
                "gpz_line_field_index": field_index,
                "gpz_line_fields_count": section["line_fields_count"],
                "source_field_kind": "FEEDER",
                "field_status": "READY_FOR_TRUNK",
            }

            if line_field_apparatus is not None:
                result = create_node(
                    new_enm,
                    {
                        "ref_id": terminal_bus_ref,
                        "name": f"Zacisk odpływowy {bay_name}",
                        "voltage_kv": voltage_kv,
                        "tags": ["helper_bus", "field_terminal"],
                        "meta": {
                            "visual_role": "FIELD_TERMINAL",
                            "render_on_sld": False,
                            "show_in_project_tree": False,
                            "field_ref": bay_ref,
                            "station_ref": substation_ref,
                            "port_kind": "trunk_out",
                            "gpz_section_id": section["section_id"],
                        },
                    },
                )
                if not result.success:
                    return _error_response(
                        (
                            "Nie udało się utworzyć zacisku technicznego pola GPZ: "
                            f"{result.issues[0].message_pl if result.issues else '?'}"
                        ),
                        "source.field_terminal_failed",
                    )
                new_enm = result.enm
                created.append(terminal_bus_ref)
                ev_seq += 1
                events.append(
                    {
                        "event_seq": ev_seq,
                        "event_type": "FIELD_TERMINAL_CREATED_SN",
                        "element_id": terminal_bus_ref,
                    }
                )

                apparatus_binding = line_field_apparatus["catalog_binding"]
                apparatus_data = {
                    "ref_id": apparatus_ref,
                    "name": f"Aparat {bay_name}",
                    "type": _gpz_line_field_branch_type(line_field_apparatus["apparatus_kind"]),
                    "from_bus_ref": section["bus_ref"],
                    "to_bus_ref": terminal_bus_ref,
                    "status": "closed",
                    "r_ohm": 0.0,
                    "x_ohm": 0.0,
                    "catalog_ref": line_field_apparatus["catalog_ref"],
                    "tags": ["gpz_field_device"],
                    "meta": {
                        "field_ref": bay_ref,
                        "station_ref": substation_ref,
                        "bay_role": "OUT",
                        "apparatus_kind": line_field_apparatus["apparatus_kind"],
                        "terminal_bus_ref": terminal_bus_ref,
                        "render_on_sld": False,
                        "show_in_project_tree": False,
                        "requires_catalog_binding": False,
                        "catalog_binding": copy.deepcopy(apparatus_binding),
                    },
                }
                _apply_catalog_metadata(
                    apparatus_data, apparatus_binding, default_namespace="APARAT_SN"
                )
                result = create_branch(new_enm, apparatus_data)
                if not result.success:
                    return _error_response(
                        (
                            "Nie udało się utworzyć aparatu pola GPZ: "
                            f"{result.issues[0].message_pl if result.issues else '?'}"
                        ),
                        "source.field_apparatus_failed",
                    )
                new_enm = result.enm
                created.append(apparatus_ref)
                ev_seq += 1
                events.append(
                    {
                        "event_seq": ev_seq,
                        "event_type": "FIELD_DEVICE_CREATED_SN",
                        "element_id": apparatus_ref,
                    }
                )
                equipment_refs = [apparatus_ref]
                field_meta.update(
                    {
                        "apparatus_kind": line_field_apparatus["apparatus_kind"],
                        "catalog_binding": copy.deepcopy(apparatus_binding),
                        "terminal_bus_ref": terminal_bus_ref,
                        "default_device_ref": apparatus_ref,
                        "field_status": "CONFIGURED_FOR_TRUNK",
                    }
                )

            default_bay_role = "OUT" if line_field_apparatus is not None else "FEEDER"
            field_specs.append(
                _build_field_spec(
                    field_ref=bay_ref,
                    name=bay_name,
                    bay_role=bay_spec.get("bay_role") or default_bay_role,
                    bus_ref=section["bus_ref"],
                    gpz_section_id=section["section_id"],
                    equipment_refs=equipment_refs,
                    protection_ref=bay_protection_ref,
                    bay_template_ref=bay_template_ref,
                    switchgear_family_ref=gpz_switchgear_family_ref,
                    manufacturer_ref=gpz_manufacturer_ref,
                    tags=["gpz_line_field"],
                    meta=field_meta,
                )
            )

    # Create substation (GPZ)
    new_enm.setdefault("substations", []).append(
        {
            "ref_id": substation_ref,
            "name": display_name,
            "station_type": "gpz",
            "bus_refs": gpz_section_bus_refs + gpz_hv_bus_refs,
            "transformer_refs": gpz_transformer_refs,
            "entry_point_ref": source_bus_ref,
            "gpz_sections": gpz_sections,
            "tags": [],
            "meta": {
                "gpz_section_count": len(gpz_sections),
                "wn_sn_transformer_count": len(gpz_transformer_refs),
                "grounding": grounding_config,
                "zero_sequence": zero_sequence_config,
                "short_circuit_mode": materialized_params.get("short_circuit_mode"),
                "short_circuit_input_side": materialized_params.get(
                    "short_circuit_input_side", "SN"
                ),
                "gpz_hv_bus_refs": gpz_hv_bus_refs,
                "field_specs": field_specs,
                **(
                    {"switchgear_family_ref": gpz_switchgear_family_ref}
                    if gpz_switchgear_family_ref
                    else {}
                ),
                **({"manufacturer_ref": gpz_manufacturer_ref} if gpz_manufacturer_ref else {}),
            },
        }
    )
    created.append(substation_ref)
    ev_seq += 1
    events.append(
        {"event_seq": ev_seq, "event_type": "STATION_CREATED", "element_id": substation_ref}
    )

    # Create corridor (trunk)
    new_enm.setdefault("corridors", []).append(
        {
            "ref_id": corridor_ref,
            "name": "Magistrala 01",
            "corridor_type": "radial",
            "ordered_segment_refs": [],
            "no_point_ref": None,
            "tags": [],
            "meta": {},
        }
    )
    created.append(corridor_ref)
    ev_seq += 1
    events.append(
        {"event_seq": ev_seq, "event_type": "LOGICAL_VIEWS_UPDATED", "element_id": corridor_ref}
    )

    first_line_field = next(
        (
            spec
            for spec in field_specs
            if str(spec.get("bay_role") or "").upper() in {"OUT", "FEEDER"}
        ),
        None,
    )
    _ensure_line_run_for_corridor(
        new_enm,
        corridor_ref,
        starting_bay_ref=(
            first_line_field.get("field_ref") if isinstance(first_line_field, dict) else None
        ),
        starting_port_ref=(
            first_line_field.get("meta", {}).get("terminal_bus_ref")
            if isinstance(first_line_field, dict) and isinstance(first_line_field.get("meta"), dict)
            else None
        ),
    )

    return _response(
        new_enm,
        created=created,
        selection_id=substation_ref,
        selection_type="substation",
        audit=audit,
        events=events,
    )


# ---------------------------------------------------------------------------
# 2. continue_trunk_segment_sn
# ---------------------------------------------------------------------------


def continue_trunk_segment_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Kontynuuj magistralę SN — dodaj kolejny odcinek."""
    trunk_id = payload.get("trunk_id")
    from_terminal_id = payload.get("from_terminal_id")
    raw_field_ref = payload.get("field_ref")
    raw_terminal_id = payload.get("terminal_id")
    field_ref = (
        raw_field_ref.strip() if isinstance(raw_field_ref, str) and raw_field_ref.strip() else None
    )
    if not field_ref and isinstance(raw_terminal_id, str) and raw_terminal_id.strip():
        terminal_as_field_bus = _field_ref_to_bus_ref(enm, raw_terminal_id.strip())
        if terminal_as_field_bus:
            field_ref = raw_terminal_id.strip()
    segment = payload.get("segment", {})

    if isinstance(from_terminal_id, str) and from_terminal_id.strip():
        from_terminal_id = from_terminal_id.strip()
        resolved_field_bus = _field_ref_to_bus_ref(enm, from_terminal_id)
        if resolved_field_bus:
            field_ref = field_ref or from_terminal_id
            from_terminal_id = resolved_field_bus
    elif field_ref:
        from_terminal_id = _field_ref_to_bus_ref(enm, field_ref)

    # Auto-detect from_terminal_id: prefer a catalog line field for an empty trunk.
    if not from_terminal_id:
        start_field = _resolve_initial_trunk_start_field(enm, trunk_id)
        if start_field:
            start_field_ref = start_field.get("field_ref")
            if isinstance(start_field_ref, str) and start_field_ref.strip():
                field_ref = start_field_ref.strip()
                from_terminal_id = _field_ref_to_bus_ref(enm, field_ref)
        if not from_terminal_id:
            from_terminal_id = _auto_detect_trunk_end(enm, trunk_id)

    if not from_terminal_id:
        return _error_response(
            "Brak identyfikatora terminala źródłowego.", "trunk.from_terminal_missing"
        )

    # Validate from_terminal exists
    from_bus = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == from_terminal_id:
            from_bus = b
            break
    if not from_bus:
        return _error_response(
            f"Szyna '{from_terminal_id}' nie istnieje.",
            "trunk.from_terminal_not_found",
        )

    if field_ref and not _is_line_continuation_field(enm, field_ref):
        return _error_response(
            "Odcinek SN moze wychodzic wylacznie z pola liniowego stacji albo GPZ.",
            "trunk.source_field_not_line_bay",
        )
    if not field_ref and _is_station_main_bus_ref(enm, from_terminal_id):
        return _error_response(
            "Odcinek SN nie moze wychodzic bezposrednio z szyny stacyjnej. "
            "Wybierz wolne pole liniowe albo port ZK SN.",
            "trunk.source_requires_line_bay",
        )

    rodzaj = segment.get("rodzaj", "KABEL")
    dlugosc_m = segment.get("dlugosc_m") or payload.get("dlugosc_m") or 0
    if dlugosc_m <= 0:
        return _error_response(
            "Brak długości odcinka magistrali (dlugosc_m). Podaj jawną wartość > 0.",
            "trunk.dlugosc_missing",
        )

    segment_catalog_binding = segment.get("catalog_binding") or payload.get("catalog_binding")
    catalog_ref = _require_catalog_ref(
        payload_ref=segment.get("catalog_ref"),
        payload_binding=segment_catalog_binding,
        context_code="continue_trunk_segment_sn",
    )
    if isinstance(catalog_ref, dict):
        return catalog_ref
    segment_name = segment.get("name")

    seed = _compute_seed(
        {
            "op": "continue_trunk",
            "trunk_id": trunk_id or "",
            "from": field_ref or from_terminal_id,
            "rodzaj": rodzaj,
            "dlugosc_m": dlugosc_m,
        }
    )
    new_bus_ref = f"bus/{seed}/downstream"
    branch_ref = f"seg/{seed}/segment"

    new_enm = copy.deepcopy(enm)
    created = []
    events = []
    audit = []
    ev_seq = 0

    # Create downstream bus ? napiecie z szyny zrodlowej (topologiczne)
    voltage_kv = from_bus.get("voltage_kv")
    if not voltage_kv or voltage_kv <= 0:
        return _error_response(
            f"Szyna zrodlowa '{from_terminal_id}' nie ma napiecia znamionowego.",
            "trunk.from_bus_voltage_missing",
        )

    result = create_node(
        new_enm,
        {
            "ref_id": new_bus_ref,
            "name": (
                f"Zacisk końcowy {segment_name}" if segment_name else "Zacisk końcowy odcinka SN"
            ),
            "voltage_kv": voltage_kv,
            "tags": ["helper_bus", "topology_terminal"],
            "meta": {
                "visual_role": "INLINE_TERMINAL",
                "render_on_sld": False,
                "show_in_project_tree": False,
            },
        },
    )
    if not result.success:
        return _error_response(
            f"Nie udało się utworzyć szyny: {result.issues[0].message_pl if result.issues else '?'}",
            "trunk.bus_creation_failed",
        )
    new_enm = result.enm
    created.append(new_bus_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BUS_CREATED", "element_id": new_bus_ref})

    # Create branch (cable or overhead line)
    branch_type = "cable" if rodzaj == "KABEL" else "line_overhead"
    origin_branch_point = None
    if (
        origin_branch_point
        and origin_branch_point.get("branch_point_type") == "branch_pole"
        and branch_type != "line_overhead"
    ):
        return _error_response(
            "Ze słupa rozgałęźnego można wyprowadzić wyłącznie odcinek napowietrzny SN.",
            "branch_connection.invalid_segment_family",
        )
    if (
        origin_branch_point
        and origin_branch_point.get("branch_point_type") == "zksn"
        and branch_type != "cable"
    ):
        return _error_response(
            "Z ZKSN można wyprowadzić wyłącznie odcinek kablowy SN.",
            "branch_connection.invalid_segment_family",
        )
    branch_data: dict[str, Any] = {
        "ref_id": branch_ref,
        "name": segment_name or f"Odcinek {branch_ref[-8:]}",
        "type": branch_type,
        "from_bus_ref": from_terminal_id,
        "to_bus_ref": new_bus_ref,
        "length_km": dlugosc_m / 1000.0,
        "r_ohm_per_km": 0.0,
        "x_ohm_per_km": 0.0,
        "status": "closed",
        "meta": {},
    }
    if field_ref:
        branch_data["meta"].update(
            {
                "origin_bay_ref": field_ref,
                "origin_apparatus_kind": "cable_head",
                "origin_port_role": "OUTGOING_HEAD",
            }
        )
    materialization = _materialize_catalog_payload(
        catalog_ref=catalog_ref,
        catalog_binding=segment_catalog_binding,
        default_namespace="KABEL_SN" if branch_type == "cable" else "LINIA_SN",
    )
    if isinstance(materialization, dict):
        return materialization
    binding_payload, materialized_params = materialization
    branch_data["catalog_ref"] = catalog_ref
    _apply_catalog_metadata(
        branch_data,
        binding_payload,
        default_namespace="KABEL_SN" if branch_type == "cable" else "LINIA_SN",
    )
    _apply_materialized_branch_fields(branch_data, materialized_params)
    _apply_explicit_segment_zero_sequence(branch_data, segment)

    result = create_branch(new_enm, branch_data)
    if not result.success:
        return _error_response(
            f"Nie udało się utworzyć odcinka: {result.issues[0].message_pl if result.issues else '?'}",
            "trunk.segment_creation_failed",
        )
    new_enm = result.enm
    created.append(branch_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BRANCH_CREATED", "element_id": branch_ref})
    audit.append(
        {"step": ev_seq, "action": "Utworzono odcinek magistrali", "element_id": branch_ref}
    )

    # Update corridor (auto-detect if not specified)
    effective_trunk_id = trunk_id
    corridors = new_enm.get("corridors", [])
    if effective_trunk_id and not any(c.get("ref_id") == effective_trunk_id for c in corridors):
        effective_trunk_id = None
    if not effective_trunk_id and corridors:
        effective_trunk_id = corridors[0].get("ref_id")

    if effective_trunk_id:
        for c in new_enm.get("corridors", []):
            if c.get("ref_id") == effective_trunk_id:
                c.setdefault("ordered_segment_refs", []).append(branch_ref)
                break
        line_run = _ensure_line_run_for_corridor(
            new_enm,
            effective_trunk_id,
            starting_bay_ref=field_ref,
            starting_port_ref=from_terminal_id,
        )
        _append_line_run_segment(line_run, branch_ref)
    ev_seq += 1
    events.append(
        {
            "event_seq": ev_seq,
            "event_type": "LOGICAL_VIEWS_UPDATED",
            "element_id": effective_trunk_id,
        }
    )

    return _response(
        new_enm,
        created=created,
        selection_id=new_bus_ref,
        selection_type="bus",
        audit=audit,
        events=events,
    )


# ---------------------------------------------------------------------------
# 3. insert_station_on_segment_sn (CRITICAL OPERATION)
# ---------------------------------------------------------------------------


def _unique_default_station_name(enm: dict[str, Any], station_type_label: str) -> str:
    """Domyślna nazwa stacji z UNIKATOWYM kodem Sxx (recenzja NO-GO 2026-07-17
    pkt 14): kolejny wolny numer ponad najwyższy kod ``S\\d{2,3}`` już użyty w
    nazwach substations (deterministycznie, bez kolizji z nazwami ręcznymi).
    Frontend (`stationCodeFromName`, enmToSldAdapter.ts) czyta kod z nazwy —
    unikatowa nazwa ⇒ unikatowy kod na rysunku."""
    highest = 0
    for sub in enm.get("substations", []):
        for match in re.finditer(r"\bS(\d{2,3})\b", str(sub.get("name") or "")):
            highest = max(highest, int(match.group(1)))
    return f"Stacja S{highest + 1:02d} (typ {station_type_label})"


# Dozwolone typy pracy punktu neutralnego (kontrakt `enm.models.GroundingConfig`).
_NEUTRAL_POINT_TYPES = frozenset(
    {"isolated", "petersen_coil", "directly_grounded", "resistor_grounded"}
)
# Dozwolone układy sieci nN (etykieta interpretacyjna dla pętli zwarcia / raportu).
_NN_EARTHING_SYSTEMS = frozenset({"TN-S", "TN-C-S", "TN-C", "TT", "IT"})


def _build_neutral_grounding(earthing_block: dict[str, Any], *, side: str) -> dict[str, Any] | None:
    """Zbuduj `GroundingConfig` punktu neutralnego z bloku uziemienia (G-STK-1).

    ``side`` = "lv" (nN) lub "hv" (SN). Odczytuje typ pracy punktu neutralnego
    (`neutral_point` / `{side}_neutral_point`) oraz impedancję uziemienia (R/X)
    i zwraca słownik zgodny 1:1 z `enm.models.GroundingConfig` (typ + r_ohm/x_ohm)
    albo ``None`` gdy strona nie ma skonfigurowanego uziemienia. Funkcja czysta,
    ZERO fabrykacji: gdy typ nieprawidłowy/pusty → ``None`` (backend/model waliduje).
    """
    key = f"{side}_neutral_point"
    raw_type = earthing_block.get(key) or (
        earthing_block.get("neutral_point") if side == "lv" else None
    )
    grounding_type = str(raw_type or "").strip()
    if grounding_type not in _NEUTRAL_POINT_TYPES:
        return None
    config: dict[str, Any] = {"type": grounding_type}
    # R/X istotne tylko dla uziemienia przez rezystor/cewkę (impedancyjne).
    r_ohm = _as_positive_float(earthing_block.get(f"{side}_r_ohm"))
    x_ohm = _as_positive_float(earthing_block.get(f"{side}_x_ohm"))
    if r_ohm is not None:
        config["r_ohm"] = r_ohm
    if x_ohm is not None:
        config["x_ohm"] = x_ohm
    return config


def _apply_station_neutral_grounding(
    tr_data: dict[str, Any],
    payload: dict[str, Any],
    *,
    station: str,
    new_enm: dict[str, Any],
) -> None:
    """Materializuj uziemienie punktu neutralnego transformatora stacji (G-STK-1).

    Odczytuje blok ``nn_earthing`` (z ``payload`` lub ``payload["station"]``) i
    ustawia ``GroundingConfig`` na ``lv_neutral`` (nN) oraz opcjonalnie
    ``hv_neutral`` (SN). Układ sieci nN (TN-S/TT/IT…) zapisuje na
    ``substation.meta.nn_earthing_system`` jako etykietę interpretacyjną dla
    pętli zwarcia / raportu (G-STK-4). Addytywne: brak bloku → transformator bez
    zmian. ZERO fizyki — konfiguracja spływa do istniejących konsumentów
    (eligibility ``has_grounding``, pakiet dowodowy earthing, field read model).
    """
    earthing = payload.get("nn_earthing") or payload.get("station", {}).get("nn_earthing")
    if not isinstance(earthing, dict) or not earthing:
        return
    lv_grounding = _build_neutral_grounding(earthing, side="lv")
    hv_grounding = _build_neutral_grounding(earthing, side="hv")
    if lv_grounding is not None:
        tr_data["lv_neutral"] = lv_grounding
    if hv_grounding is not None:
        tr_data["hv_neutral"] = hv_grounding
    system = str(earthing.get("lv_system") or "").strip()
    if system in _NN_EARTHING_SYSTEMS:
        for sub in new_enm.get("substations", []):
            if sub.get("ref_id") == station:
                sub.setdefault("meta", {})["nn_earthing_system"] = system
                break


def _apply_transformer_parallelism(
    tr_data: dict[str, Any], transformer_block: dict[str, Any]
) -> None:
    """Ustaw liczbę równoległych transformatorów z bloku transformatora (G-STK-6).

    Czyta ``n_parallel`` (liczba identycznych jednostek w polu transformatorowym).
    Ustawia tylko dla n≥2 (n=1 = pojedynczy → bez zmiany fizyki/determinizmu).
    Mapper agreguje impedancję (Sn×n → Z/n). ZERO fabrykacji: brak/niepoprawny →
    pomijamy.
    """
    raw = transformer_block.get("n_parallel")
    n = _opt_int(raw) if raw is not None else None
    if n is not None and n >= 2:
        tr_data["n_parallel"] = n


def _sn_field_apparatus_catalog_ref(
    field_spec: dict[str, Any],
    payload_default_ref: str | None,
) -> str | None:
    """Referencja katalogowa aparatu pola SN — WYŁĄCZNIE z jawnego wskazania (B-12).

    Kolejność: `apparatus_catalog_ref` pola → wspólny
    `field_apparatus_catalog_ref` payloadu. Brak obu ⇒ ``None`` i JAWNY błąd
    walidacji u wołającego. Dawny zaszyty typ wyłącznika (fallback) był
    fabrykacją decyzji projektowej — aparat wybiera projektant z katalogu
    APARAT_SN, nie operacja domenowa.
    """
    raw = field_spec.get("apparatus_catalog_ref")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return payload_default_ref


def _payload_field_apparatus_catalog_ref(payload: dict[str, Any]) -> str | None:
    """Wspólna referencja aparatu pól SN z payloadu operacji (B-12)."""
    raw = payload.get("field_apparatus_catalog_ref")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def _field_apparatus_missing_error(*, index: int, field_role: str, code: str) -> dict[str, Any]:
    """Jawny błąd walidacji: pole SN bez wskazanego aparatu (B-12)."""
    rola = field_role.strip() or "bez roli"
    return _error_response(
        f"Pole SN nr {index + 1} (rola: {rola}) nie ma wskazanego aparatu. "
        "Wskaż pozycję katalogu APARAT_SN w polu 'apparatus_catalog_ref' tego pola "
        "albo wspólną dla wszystkich pól w 'field_apparatus_catalog_ref'.",
        code,
    )


# ---------------------------------------------------------------------------
# B-3 — wyposażenie pomiarowo-zabezpieczeniowe pola W TEJ SAMEJ operacji
# ---------------------------------------------------------------------------

#: Kolejność zakładania wyposażenia pola: CT → VT → zabezpieczenie. Zabezpieczenie
#: wiąże CT/VT TEGO SAMEGO pola (`add_relay` szuka ich po `bay_ref`), więc musi
#: powstać jako ostatnie.
_KOLEJNOSC_WYPOSAZENIA_POLA = (
    ("ct", "add_ct", "przekładnika prądowego CT"),
    ("vt", "add_vt", "przekładnika napięciowego VT"),
    ("relay", "add_relay", "zabezpieczenia"),
)


def _wyposazenie_pola_z_wpisu(field_spec: Any) -> dict[str, Any]:
    """Wyposażenie pola z wpisu `sn_fields[i].equipment` (brak → pusty słownik).

    B-3: pole payloadu jest ADDYTYWNE i opcjonalne — wołający, który go nie
    podaje, dostaje dokładnie dotychczasowe zachowanie operacji stacyjnej.
    """
    if not isinstance(field_spec, dict):
        return {}
    equipment = field_spec.get("equipment")
    if not isinstance(equipment, dict):
        return {}
    return {
        klucz: wartosc
        for klucz, wartosc in equipment.items()
        if isinstance(wartosc, dict) and wartosc
    }


def _zastosuj_wyposazenie_pol(
    new_enm: dict[str, Any],
    wyposazenie_pol: list[tuple[str, str, dict[str, Any]]],
    *,
    kod_bledu: str,
) -> tuple[dict[str, Any], list[str], list[dict[str, Any]]] | dict[str, Any]:
    """Zakłada CT/VT/zabezpieczenie pól W TEJ SAMEJ migawce co stacja (B-3).

    DŁUG, KTÓRY TO ZAMYKA (B-3, nazwany w V12K-283): kreator stacji zapisywał
    stację JEDNĄ operacją, a wyposażenie pól dokładał SEKWENCJĄ osobnych operacji
    `add_ct`/`add_vt`/`add_relay` po zapisie. Gdy krok pośredni zawiódł (brak
    pozycji katalogowej, pole bez wyłącznika), model zostawał w stanie połowicznym
    — stacja zapisana, wyposażenie częściowe — a kreator mógł tylko uczciwie
    zameldować „wykonano N z M".

    Tu wyposażenie powstaje na TEJ SAMEJ, jeszcze niezapisanej migawce co stacja:
    błąd któregokolwiek elementu kończy CAŁĄ operację błędem, więc do zapisu
    trafia albo stacja z kompletnym wyposażeniem, albo nic. Reużyte są DOKŁADNIE
    te same handlery operacji (`domain_operations_v2`) — te same bramy katalogowe,
    ta sama materializacja, zero równoległej implementacji. Payload pola jest
    przekazywany bez zmian (wołający steruje wszystkim, co przyjmuje operacja),
    domykany wyłącznie o `bay_ref` utworzonego pola.

    Zwraca ``(migawka, utworzone_refy, zdarzenia)`` albo odpowiedź błędu.
    """
    if not wyposazenie_pol:
        return new_enm, [], []

    from enm.domain_operations_v2 import add_ct, add_relay, add_vt

    handlery = {"add_ct": add_ct, "add_vt": add_vt, "add_relay": add_relay}
    utworzone: list[str] = []
    zdarzenia: list[dict[str, Any]] = []

    for field_ref, field_role, equipment in wyposazenie_pol:
        for klucz, nazwa_operacji, etykieta in _KOLEJNOSC_WYPOSAZENIA_POLA:
            dane = equipment.get(klucz)
            if not isinstance(dane, dict) or not dane:
                continue
            odpowiedz = handlery[nazwa_operacji](new_enm, {**dane, "bay_ref": field_ref})
            blad = odpowiedz.get("error")
            if blad:
                rola = field_role.strip() or "bez roli"
                return _error_response(
                    f"Pole {rola} ({field_ref}) — nie udało się dodać {etykieta}: {blad}",
                    str(odpowiedz.get("error_code") or kod_bledu),
                )
            migawka = odpowiedz.get("snapshot")
            if not isinstance(migawka, dict):
                return _error_response(
                    f"Pole {field_role} ({field_ref}) — operacja {nazwa_operacji} "
                    "nie zwróciła migawki modelu.",
                    kod_bledu,
                )
            new_enm = migawka
            utworzone.extend(
                ref
                for ref in (odpowiedz.get("changes") or {}).get("created_element_ids", [])
                if isinstance(ref, str)
            )
            for zdarzenie in odpowiedz.get("domain_events") or []:
                if isinstance(zdarzenie, dict):
                    zdarzenia.append({**zdarzenie, "field_ref": field_ref})

    return new_enm, utworzone, zdarzenia


def _zastosuj_zaczepy_transformatora(
    new_enm: dict[str, Any],
    transformer_block: dict[str, Any],
    *,
    transformer_ref: str,
    controlled_bus_ref: str,
    kod_bledu: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]] | dict[str, Any]:
    """Ustaw zaczepy transformatora stacyjnego W TEJ SAMEJ migawce co stacja (B-2).

    DLUG, KTORY TO ZAMYKA (B-2). Kanoniczny podzespol zaczepow ``tap_changer``
    (V12K-045) istnial WYLACZNIE dla transformatora GPZ: `add_grid_source_sn`
    budowal go z payloadu, a `update_element_parameters` nie mial go nawet w
    liscie pol dozwolonych. Transformator stacji SN/nN powstawal wiec zawsze bez
    regulacji, a projektant nie mial jak jej ustawic — ani w kreatorze, ani
    osobna operacja.

    ZERO POL ROWNOLEGLYCH. Uzywamy DOKLADNIE tego samego buildera co GPZ
    (`_build_gpz_tap_changer`) i DOKLADNIE tego samego handlera co operacja
    osobna (`update_element_parameters`) — te same klucze payloadu
    (``transformer_*``), ta sama walidacja, ta sama sciezka zapisu. Blad zapisu
    zaczepow konczy CALA operacje stacyjna, wiec do modelu trafia albo
    transformator z regulacja, albo nic (wzorzec `_zastosuj_wyposazenie_pol`).

    Zwraca ``(migawka, zdarzenia)`` albo odpowiedz bledu. Brak regulacji w
    payloadzie = brak zmian (zgodnosc wsteczna co do bitu).
    """
    tap_changer = _build_gpz_tap_changer(transformer_block, controlled_bus_ref=controlled_bus_ref)
    if tap_changer is None:
        return new_enm, []

    blad_kontraktu = _blad_zaczepow(tap_changer)
    if blad_kontraktu is not None:
        return _error_response(
            f"Transformator {transformer_ref} — {blad_kontraktu}", "transformer.tap_changer_invalid"
        )

    odpowiedz = update_element_parameters(
        new_enm,
        {"element_ref": transformer_ref, "parameters": {"tap_changer": tap_changer}},
    )
    blad = odpowiedz.get("error")
    if blad:
        return _error_response(
            f"Transformator {transformer_ref} — nie udało się ustawić zaczepów: {blad}",
            str(odpowiedz.get("error_code") or kod_bledu),
        )
    migawka = odpowiedz.get("snapshot")
    if not isinstance(migawka, dict):
        return _error_response(
            f"Transformator {transformer_ref} — operacja zaczepów nie zwróciła migawki modelu.",
            kod_bledu,
        )
    return migawka, [{"event_type": "TAP_CHANGER_SET", "element_id": transformer_ref}]


#: Dozwolone typy konstrukcji stacji (B-5) — parytet z `enm.models.Substation`
#: i katalogiem szablonów stacji (`network_model.catalog.station_templates`).
_STATION_CONSTRUCTION_TYPES = (
    "wnetrzowa",
    "kontenerowa",
    "slupowa",
    "prefabrykowana",
    "inna",
)


def _station_identity_fields(
    station: dict[str, Any],
    payload: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Pola tożsamości stacji: oznaczenie (B-4) i typ konstrukcji (B-5).

    Addytywne: brak wartości ⇒ pusty słownik (klucze nie trafiają do rekordu,
    więc odcisk ENM istniejących zapisów pozostaje bez zmian). Typ konstrukcji
    spoza listy kończy operację jawnym błędem — zero domysłu.
    Zwraca ``(pola, blad)``.
    """
    fields: dict[str, Any] = {}
    raw_designation = station.get("designation") or payload.get("designation")
    if isinstance(raw_designation, str) and raw_designation.strip():
        fields["designation"] = raw_designation.strip()

    raw_construction = station.get("construction_type") or payload.get("construction_type")
    if isinstance(raw_construction, str) and raw_construction.strip():
        construction = raw_construction.strip()
        if construction not in _STATION_CONSTRUCTION_TYPES:
            return fields, _error_response(
                f"Typ konstrukcji stacji '{construction}' jest nieprawidłowy. "
                f"Dozwolone: {', '.join(_STATION_CONSTRUCTION_TYPES)}.",
                "station.construction_type_invalid",
            )
        fields["construction_type"] = construction
    return fields, None


def _materialize_station_auxiliary_load(
    new_enm: dict[str, Any],
    payload: dict[str, Any],
    *,
    nn_bus_id: str,
    station_id: str,
    station_seed: str,
    created: list[str],
) -> str | None:
    """Zmaterializuj odbiór potrzeb własnych stacji (G-STK-3).

    Reużywa wzorzec `add_nn_load`: mały odbiór nN na szynie nN stacji, z mocą
    bierną wyprowadzoną z cosφ (Q = P·tan(arccos cosφ)) gdy Q nie podano jawnie.
    Konsument: kanoniczny rozpływ mocy (kolekcja ``loads``). Addytywne: brak bloku
    ``station_auxiliary`` lub P≤0 → brak odbioru. Zwraca ref odbioru albo ``None``.
    """
    aux = payload.get("station_auxiliary") or payload.get("station", {}).get("station_auxiliary")
    if not isinstance(aux, dict) or not aux:
        return None
    p_kw = _as_positive_float(aux.get("active_power_kw"))
    if p_kw is None:
        return None

    q_kvar = aux.get("reactive_power_kvar")
    cos_phi = aux.get("cos_phi")
    if q_kvar is None and cos_phi is not None:
        cp = _as_positive_float(cos_phi)
        if cp is not None and cp <= 1.0:
            q_kvar = p_kw * math.tan(math.acos(cp))

    load_ref = _make_id("stn", station_seed, "aux_load")
    new_enm.setdefault("loads", []).append(
        {
            "ref_id": load_ref,
            "name": aux.get("name") or "Potrzeby własne stacji",
            "bus_ref": nn_bus_id,
            "p_mw": p_kw / 1000.0,
            "q_mvar": (q_kvar or 0.0) / 1000.0,
            "model": "pq",
            "source_mode": "EKSPERCKI_RECZNY",
            "parameter_source": "OVERRIDE",
            "tags": ["station_auxiliary"],
            "meta": {
                "station_ref": station_id,
                "load_role": "STACJA_POTRZEBY_WLASNE",
                "connection_type": "TROJFAZOWY",
                "cos_phi": cos_phi,
            },
        }
    )
    created.append(load_ref)
    return load_ref


def _build_nn_field_specs(
    *,
    nn_block: dict[str, Any],
    nn_bus_id: str,
    station_seed: str,
) -> list[dict[str, Any]]:
    """Zbuduj specyfikacje pól nN (wyłącznik główny + odpływy) z ``nn_block``.

    Wspólny builder dla ``insert_station_on_segment_sn`` i
    ``append_station_on_endpoint`` — determinizm wynika ze ``station_seed``
    (te same ``field_ref`` dla identycznego seedu). Funkcja czysta: nie mutuje
    ENM, zwraca listę specyfikacji do zapisania w ``substation.meta.nn_field_specs``.
    """
    nn_main_ref = _make_id("stn", station_seed, "nn_main_breaker")
    feeders = nn_block.get("outgoing_feeders_nn", [])
    feeder_count = nn_block.get("outgoing_feeders_nn_count", max(1, len(feeders)))
    nn_field_specs = [
        _build_field_spec(
            field_ref=nn_main_ref,
            name="Wyłącznik główny nN",
            bay_role="IN",
            bus_ref=nn_bus_id,
            tags=["nn_main_breaker"],
        )
    ]
    for idx in range(max(feeder_count, len(feeders))):
        feeder_ref = _make_id("stn", station_seed, f"nn_feeder/{idx:03d}")
        feeder_spec = feeders[idx] if idx < len(feeders) else {}
        feeder_meta: dict[str, Any] = {
            "feeder_role": feeder_spec.get("feeder_role", "ODPLYW_NN"),
        }
        if isinstance(feeder_spec.get("catalog_bindings"), dict):
            feeder_meta["catalog_bindings"] = feeder_spec.get("catalog_bindings")
        if isinstance(feeder_spec.get("protection"), dict):
            feeder_meta["protection_intent"] = feeder_spec.get("protection")
        nn_field_specs.append(
            _build_field_spec(
                field_ref=feeder_ref,
                name=f"Odpływ nN {idx + 1}",
                bay_role="FEEDER",
                bus_ref=nn_bus_id,
                meta=feeder_meta,
            )
        )
    return nn_field_specs


def _materialize_nn_source(
    *,
    new_enm: dict[str, Any],
    nn_block: dict[str, Any],
    station_seed: str,
    nn_bus_id: str,
    station_id: str,
    transformer_ref: str,
    transformer_created: bool,
    created: list[str],
) -> tuple[str, str] | None:
    """Zmaterializuj źródło nN (PV/BESS/FW) z ``nn_block`` do ENM.

    Wspólny materializator dla ``insert_station_on_segment_sn`` i
    ``append_station_on_endpoint``. Tworzy generator źródłowy w ``generators``,
    wpis w ``substation.meta.source_specs`` oraz — gdy podano ``source_protection``
    — ``protection_assignment``. Determinizm wynika ze ``station_seed``.

    Zwraca ``(generator_ref, event_type)`` gdy źródło utworzono (do emisji
    zdarzenia przez wywołującego), w przeciwnym razie ``None``.
    """
    nn_configuration = str(nn_block.get("nn_configuration") or "")
    source_converter_ref = nn_block.get("source_converter_catalog_ref")
    source_converter_kind = str(nn_block.get("source_converter_kind") or "")
    source_protection = nn_block.get("source_protection")
    source_kind_map = {
        "PV_INVERTER": ("PV", "pv_inverter", "ZRODLO_NN_PV", "PV_INVERTER_CREATED"),
        "BESS_INVERTER": ("BESS", "bess", "ZRODLO_NN_BESS", "BESS_SOURCE_CREATED"),
        "FW_INVERTER": ("WIND", "wind_inverter", "ZRODLO_NN_FW", "FW_SOURCE_CREATED"),
    }
    source_spec = source_kind_map.get(nn_configuration)
    if not (source_spec and source_converter_ref):
        return None

    _technology, gen_type, catalog_namespace, event_type = source_spec
    generator_ref = _make_id("stn", station_seed, f"nn_source/{gen_type}")
    station_transformer_ref = transformer_ref if transformer_created else None
    p_mw = (
        _as_positive_float(nn_block.get("source_converter_pmax_mw"))
        or _as_positive_float(nn_block.get("source_converter_sn_mva"))
        or 0.0
    )
    materialized_source_params = {
        "catalog_item_id": source_converter_ref,
        "catalog_item_version": "2024.1",
        "un_kv": nn_block.get("source_converter_un_kv"),
        "pmax_mw": p_mw,
        "sn_mva": nn_block.get("source_converter_sn_mva"),
        "station_transformer_ref": station_transformer_ref,
        "protection_intent": source_protection if isinstance(source_protection, dict) else None,
    }
    new_enm.setdefault("generators", []).append(
        {
            "ref_id": generator_ref,
            "name": nn_block.get("source_converter_name") or "Źródło nN stacji",
            "bus_ref": nn_bus_id,
            "p_mw": p_mw,
            "q_mvar": 0.0,
            "gen_type": gen_type,
            "station_ref": station_id,
            "catalog_ref": source_converter_ref,
            "catalog_namespace": catalog_namespace,
            "parameter_source": "CATALOG",
            "source_mode": "KATALOG",
            "connection_variant": "nn_side",
            "materialized_params": materialized_source_params,
            "meta": {
                "station_ref": station_id,
                "connection_point_ref": nn_bus_id,
                "station_transformer_ref": station_transformer_ref,
                "protection_intent": (
                    source_protection if isinstance(source_protection, dict) else None
                ),
                "render_as_station_internal_source": True,
            },
        }
    )
    for sub in new_enm.get("substations", []):
        if sub.get("ref_id") == station_id:
            sub_meta = sub.setdefault("meta", {})
            sub_meta.setdefault("source_specs", []).append(
                {
                    "technology": _technology,
                    "catalog_ref": source_converter_ref,
                    "catalog_namespace": catalog_namespace,
                    "connection_variant": "nn_side",
                    "connection_point_ref": nn_bus_id,
                    "generator_ref": generator_ref,
                    "converter_name": nn_block.get("source_converter_name"),
                    "converter_kind": source_converter_kind or _technology,
                    "protection_intent": (
                        source_protection if isinstance(source_protection, dict) else None
                    ),
                }
            )
            break
    created.append(generator_ref)
    if isinstance(source_protection, dict):
        protection_ref = _make_id("stn", station_seed, f"nn_source/{gen_type}/protection")
        breaker_ref = _make_id("stn", station_seed, f"nn_source/{gen_type}/breaker")
        new_enm.setdefault("protection_assignments", []).append(
            {
                "ref_id": protection_ref,
                "name": source_protection.get("device_label") or "Zabezpieczenie źródła nN",
                "breaker_ref": breaker_ref,
                "ct_ref": None,
                "vt_ref": None,
                "device_type": "overcurrent",
                "catalog_ref": source_protection.get("device_catalog_ref"),
                "settings": [],
                "is_enabled": True,
                "tags": ["station_nn_source_protection", "requires_ct_vt"],
                "meta": {
                    "station_ref": station_id,
                    "protected_object_ref": generator_ref,
                    "protected_object": source_protection.get("protected_object"),
                    "analysis_scope": source_protection.get("analysis_scope"),
                    "blocker_reason": "Dobierz CT/VT i nastawy zabezpieczenia źródła nN.",
                },
            }
        )
        created.append(protection_ref)
    return generator_ref, event_type


def insert_station_on_segment_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Wstaw stację SN/nN w odcinek — operacja krytyczna.

    Algorytm:
    0. Walidacja wejścia
    1. Odczyt topologii segmentu
    2. Rozdzielenie segmentu na dwa
    3. Utworzenie bloku stacji (podgraf)
    4. Podłączenie stacji
    5. Gotowość i FixActions
    6. Zwrot odpowiedzi

    Phase 0A audit fix 11/12: parametr `dry_run: bool = False` w payload.
    Gdy True — operacja wykonuje pełną walidację i preview ENM hash + halves
    + electrical_impact, ale NIE mutuje ENM. Wymagane dla Phase 0C
    "Conscious split with preview".
    """
    dry_run = bool(payload.get("dry_run", False))
    segment_id = payload.get("segment_id") or payload.get("segment_ref")
    insert_at = payload.get("insert_at", {})
    station = payload.get("station", {})
    sn_fields_raw = payload.get("sn_fields", [])
    transformer = payload.get("transformer", {})
    nn_block = payload.get("nn_block", {})

    if dry_run:
        # Wykonaj na deep-copy, NIE mutując oryginalnego ENM (`copy` zaimportowane na poziomie modułu).
        enm = copy.deepcopy(enm)

    # Normalize sn_fields: accept list of strings or list of dicts
    _role_str_map = {
        "IN": "LINIA_IN",
        "OUT": "LINIA_OUT",
        "FEEDER": "LINIA_ODG",
        "TR": "TRANSFORMATOROWE",
        "COUPLER": "SPRZEGLO",
    }
    sn_fields: list[dict[str, Any]] = []
    for item in sn_fields_raw:
        if isinstance(item, str):
            sn_fields.append({"field_role": _role_str_map.get(item, item)})
        else:
            sn_fields.append(item)

    # --- Krok 0: Walidacja wejścia ---
    if not segment_id:
        return _error_response("Brak identyfikatora odcinka.", "station.insert.segment_missing")

    segment = _find_branch(enm, segment_id)
    if not segment:
        return _error_response(
            f"Odcinek '{segment_id}' nie istnieje.",
            "station.insert.segment_missing",
        )

    seg_type = segment.get("type", "")
    if seg_type not in ("cable", "line_overhead"):
        return _error_response(
            f"Odcinek '{segment_id}' nie jest typu SN (typ: {seg_type}).",
            "topology.segment_not_sn",
        )

    # Accept station_type from station dict OR root payload.
    # Supports both legacy shorthand (A/B/C/D) and semantic labels.
    semantic_to_legacy: dict[str, str] = {
        "inline": "B",  # Stacja przelotowa → typ B (IN+OUT+TR)
        "branch": "C",  # Stacja odgałęźna → typ C (IN+OUT+BRANCH+TR)
        "terminal": "A",  # Stacja końcowa → typ A (liść)
        "sectional": "D",  # Stacja sekcyjna → typ D (ze sprzęgłem)
    }
    substation_type_map: dict[str, str] = {
        "A": "mv_lv",
        "B": "inline",
        "C": "branch",
        "D": "sectional",
        "inline": "inline",
        "branch": "branch",
        "terminal": "terminal",
        "sectional": "sectional",
    }
    station_type_raw = station.get("station_type") or payload.get("station_type", "")
    # Map semantic → legacy for internal logic
    station_type = semantic_to_legacy.get(station_type_raw, station_type_raw)
    if station_type not in ("A", "B", "C", "D"):
        return _error_response(
            f"Typ stacji '{station_type_raw}' jest nieprawidłowy. "
            "Wymagane: A, B, C, D, inline, branch, terminal lub sectional.",
            "station.insert.station_type_invalid",
        )
    if not sn_fields:
        default_sn_fields_by_type = {
            "A": ["LINIA_IN", "TRANSFORMATOROWE"],
            "B": ["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"],
            "C": ["LINIA_IN", "LINIA_OUT", "LINIA_ODG", "TRANSFORMATOROWE"],
            "D": ["LINIA_IN", "LINIA_OUT", "SPRZEGLO", "TRANSFORMATOROWE"],
        }
        sn_fields = [
            {"field_role": field_role}
            for field_role in default_sn_fields_by_type.get(
                station_type,
                ["LINIA_IN", "TRANSFORMATOROWE"],
            )
        ]
    # B-4/B-5: oznaczenie i typ konstrukcji stacji (addytywne pola tożsamości).
    station_identity, identity_error = _station_identity_fields(station, payload)
    if identity_error is not None:
        return identity_error

    # B-12: aparat KAŻDEGO pola SN musi być wskazany jawnie (katalog APARAT_SN).
    # Walidacja przed jakąkolwiek zmianą modelu — brak referencji kończy operację
    # błędem ze wskazaniem pola, nigdy domysłem.
    payload_field_apparatus_ref = _payload_field_apparatus_catalog_ref(payload)
    for idx, field_spec in enumerate(sn_fields):
        if _sn_field_apparatus_catalog_ref(field_spec, payload_field_apparatus_ref) is None:
            return _field_apparatus_missing_error(
                index=idx,
                field_role=str(field_spec.get("field_role", "")),
                code="station.insert.field_apparatus_ref_missing",
            )

    # The semantic station_type stored in substation record
    substation_semantic_type = substation_type_map.get(station_type_raw, "mv_lv")
    station_display_name = (
        station.get("station_name")
        or station.get("name")
        or station.get("name_pl")
        or payload.get("station_name")
        or payload.get("name")
        or payload.get("name_pl")
        # Recenzja NO-GO 2026-07-17 pkt 14: nazwa domyślna z UNIKATOWYM kodem
        # stacji (Sxx) u ŹRÓDŁA — dawny fallback "Stacja {typ}" produkował
        # duplikaty ("Stacja B" ×N), a kod na rysunku (frontend
        # `stationCodeFromName`) wywodzi się z nazwy.
        or _unique_default_station_name(enm, station_type_raw or station_type)
    )

    # Validate insert_at
    insert_mode = insert_at.get("mode", "RATIO")
    insert_value = insert_at.get("value", 0.5)
    if insert_mode == "RATIO":
        insert_value = _quantize_ratio(float(insert_value))
        if insert_value < 0.0 or insert_value > 1.0:
            return _error_response(
                f"Współczynnik podziału {insert_value} poza zakresem [0, 1].",
                "station.insert.insert_at_invalid",
            )
    elif insert_mode == "ODLEGLOSC_OD_POCZATKU_M":
        if float(insert_value) < 0:
            return _error_response(
                "Odległość od początku musi być >= 0.",
                "station.insert.insert_at_invalid",
            )

    # Napięcia — topologiczne dziedziczenie z segmentu, brak domyślnych
    sn_voltage_kv = station.get("sn_voltage_kv")
    nn_voltage_kv = station.get("nn_voltage_kv")

    if not sn_voltage_kv or sn_voltage_kv <= 0:
        from_ref = segment.get("from_bus_ref")
        for b in enm.get("buses", []):
            if b.get("ref_id") == from_ref:
                sn_voltage_kv = b.get("voltage_kv")
                break
        if not sn_voltage_kv or sn_voltage_kv <= 0:
            return _error_response(
                "Brak napięcia SN stacji. Podaj sn_voltage_kv lub upewnij się, "
                "że szyna źródłowa segmentu ma zdefiniowane napięcie.",
                "station.insert.sn_voltage_missing",
            )

    if not nn_voltage_kv or nn_voltage_kv <= 0:
        return _error_response(
            "Brak napięcia nN stacji. Podaj nn_voltage_kv.",
            "station.insert.nn_voltage_missing",
        )

    # --- Krok 1: Topologia segmentu ---
    from_bus_ref = segment.get("from_bus_ref")
    to_bus_ref = segment.get("to_bus_ref")
    length_km = segment.get("length_km", 1.0)
    segment_catalog_binding = segment.get("catalog_binding")
    catalog_ref = _resolve_catalog_ref(segment.get("catalog_ref"), segment_catalog_binding)
    segment_catalog_version = (
        segment.get("meta", {}).get("catalog_item_version")
        if isinstance(segment.get("meta"), dict)
        else None
    )

    # --- Compute deterministic seed ---
    station_seed = _compute_seed(
        {
            "segment_id": segment_id,
            "insert_at": {"mode": insert_mode, "value": insert_value},
            "station_type": station_type,
        }
    )

    # --- Element IDs ---
    stn_id = _make_id("stn", station_seed, "station")
    sn_bus_id = _make_id("stn", station_seed, "sn_bus")
    nn_bus_id = _make_id("stn", station_seed, "nn_bus")
    tr_id = _make_id("stn", station_seed, "transformer")
    seg_left_id = f"{segment_id}_L"
    seg_right_id = f"{segment_id}_R"
    # Stacja sekcyjna (typ D): DWIE sekcje szyny SN + sprzęgło (G-STK-5). Sekcja A =
    # sn_bus_id (WE + transformator), sekcja B = sn_bus_b_id (WY). Sprzęgło (bus_coupler,
    # normalnie zamknięte) łączy sekcje → ciągłość magistrali. Dla pozostałych typów
    # jedna szyna (sn_bus_id), sekcja B nietworzona.
    is_sectional = station_type == "D"
    sn_bus_b_id = _make_id("stn", station_seed, "sn_bus_b")
    coupler_id = _make_id("stn", station_seed, "sn_coupler")
    # Szyna, z której wychodzi prawy odcinek (WY): sekcja B dla sekcyjnej, inaczej A.
    right_from_bus_id = sn_bus_b_id if is_sectional else sn_bus_id

    new_enm = copy.deepcopy(enm)
    created = []
    deleted = []
    events = []
    audit = []
    ev_seq = 0

    # --- Krok 2: Rozdzielenie segmentu na dwa ---
    if insert_mode == "RATIO":
        ratio = float(insert_value)
    elif insert_mode == "ODLEGLOSC_OD_POCZATKU_M":
        total_m = length_km * 1000.0
        ratio = float(insert_value) / total_m if total_m > 0 else 0.5
    else:
        ratio = 0.5

    left_length = length_km * ratio
    right_length = length_km * (1.0 - ratio)
    # Delete old segment
    del_result = delete_branch(new_enm, segment_id)
    if not del_result.success:
        return _error_response(
            f"Nie udało się usunąć segmentu: {del_result.issues[0].message_pl if del_result.issues else '?'}",
            "station.insert.segment_delete_failed",
        )
    new_enm = del_result.enm
    deleted.append(segment_id)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "SEGMENT_SPLIT", "element_id": segment_id})

    # Create SN bus (insertion point)
    result = create_node(
        new_enm,
        {
            "ref_id": sn_bus_id,
            "name": station_display_name,
            "voltage_kv": sn_voltage_kv,
        },
    )
    if not result.success:
        return _error_response(
            f"Nie udało się utworzyć szyny SN: {result.issues[0].message_pl if result.issues else '?'}",
            "station.insert.sn_bus_failed",
        )
    new_enm = result.enm
    created.append(sn_bus_id)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "CUT_NODE_CREATED", "element_id": sn_bus_id})

    # Stacja sekcyjna: druga sekcja szyny SN + sprzęgło międzysekcyjne (G-STK-5).
    if is_sectional:
        result = create_node(
            new_enm,
            {
                "ref_id": sn_bus_b_id,
                "name": f"{station_display_name} — sekcja B",
                "voltage_kv": sn_voltage_kv,
            },
        )
        if not result.success:
            return _error_response(
                "Nie udało się utworzyć drugiej sekcji szyny SN.",
                "station.insert.sn_bus_b_failed",
            )
        new_enm = result.enm
        created.append(sn_bus_b_id)
        ev_seq += 1
        events.append(
            {"event_seq": ev_seq, "event_type": "CUT_NODE_CREATED", "element_id": sn_bus_b_id}
        )
        # Sprzęgło (bus_coupler, normalnie zamknięte) — łączy sekcję A z B.
        coupler_result = create_branch(
            new_enm,
            {
                "ref_id": coupler_id,
                "name": f"Sprzęgło sekcyjne {station_display_name}",
                "type": "bus_coupler",
                "from_bus_ref": sn_bus_id,
                "to_bus_ref": sn_bus_b_id,
                "status": "closed",
            },
        )
        if not coupler_result.success:
            return _error_response(
                "Nie udało się utworzyć sprzęgła sekcyjnego.",
                "station.insert.coupler_failed",
            )
        new_enm = coupler_result.enm
        created.append(coupler_id)
        ev_seq += 1
        events.append(
            {"event_seq": ev_seq, "event_type": "BRANCH_CREATED", "element_id": coupler_id}
        )

    # Create left segment
    left_data: dict[str, Any] = {
        "ref_id": seg_left_id,
        "name": f"Odcinek {seg_left_id}",
        "type": seg_type,
        "from_bus_ref": from_bus_ref,
        "to_bus_ref": sn_bus_id,
        "length_km": left_length,
        "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
        "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
        "status": "closed",
    }
    _copy_split_segment_fields(left_data, segment)
    if catalog_ref:
        materialization = _materialize_catalog_payload(
            catalog_ref=catalog_ref,
            catalog_binding=segment_catalog_binding,
            default_namespace="KABEL_SN" if seg_type == "cable" else "LINIA_SN",
            default_version=segment_catalog_version,
        )
        if isinstance(materialization, dict):
            return materialization
        binding_payload, materialized_params = materialization
        left_data["catalog_ref"] = catalog_ref
        _apply_catalog_metadata(
            left_data,
            binding_payload,
            default_namespace="KABEL_SN" if seg_type == "cable" else "LINIA_SN",
        )
        _apply_materialized_branch_fields(left_data, materialized_params)
    result = create_branch(new_enm, left_data)
    if not result.success:
        return _error_response(
            "Nie udało się utworzyć lewego odcinka.", "station.insert.left_segment_failed"
        )
    new_enm = result.enm
    created.append(seg_left_id)

    # Create right segment
    right_data: dict[str, Any] = {
        "ref_id": seg_right_id,
        "name": f"Odcinek {seg_right_id}",
        "type": seg_type,
        "from_bus_ref": right_from_bus_id,
        "to_bus_ref": to_bus_ref,
        "length_km": right_length,
        "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
        "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
        "status": "closed",
    }
    _copy_split_segment_fields(right_data, segment)
    if catalog_ref:
        materialization = _materialize_catalog_payload(
            catalog_ref=catalog_ref,
            catalog_binding=segment_catalog_binding,
            default_namespace="KABEL_SN" if seg_type == "cable" else "LINIA_SN",
            default_version=segment_catalog_version,
        )
        if isinstance(materialization, dict):
            return materialization
        binding_payload, materialized_params = materialization
        right_data["catalog_ref"] = catalog_ref
        _apply_catalog_metadata(
            right_data,
            binding_payload,
            default_namespace="KABEL_SN" if seg_type == "cable" else "LINIA_SN",
        )
        _apply_materialized_branch_fields(right_data, materialized_params)
    result = create_branch(new_enm, right_data)
    if not result.success:
        return _error_response(
            "Nie udało się utworzyć prawego odcinka.", "station.insert.right_segment_failed"
        )
    new_enm = result.enm
    created.append(seg_right_id)

    audit.append({"step": ev_seq, "action": "Podzielono odcinek na dwa", "element_id": segment_id})

    # --- Krok 3: Blok stacji ---
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "STATION_CREATED", "element_id": stn_id})

    role_map = {
        "LINIA_IN": "IN",
        "LINIA_OUT": "OUT",
        "LINIA_ODG": "FEEDER",
        "TRANSFORMATOROWE": "TR",
        "SPRZEGLO": "COUPLER",
    }
    field_specs: list[dict[str, Any]] = []
    # B-3: wyposażenie pomiarowo-zabezpieczeniowe wskazane per pole w payloadzie —
    # zakładane W TEJ SAMEJ migawce, po utworzeniu wszystkich pól stacji.
    wyposazenie_pol: list[tuple[str, str, dict[str, Any]]] = []
    # Wiązanie szablonu producenta + kody zabezpieczeń pola — PARYTET z add_sn_bay
    # i append (PS-1/PS-2). Wspólny resolver (reużycie, zero fabrykacji).
    from enm.domain_operations_v2 import _resolve_bay_template_protection_codes

    station_switchgear = station.get("switchgear") or {}
    sn_field_specs_sorted = sorted(sn_fields, key=lambda f: f.get("field_role", ""))
    for idx, field_spec in enumerate(sn_field_specs_sorted):
        field_role = str(field_spec.get("field_role", ""))
        field_ref = _make_id("stn", station_seed, f"sn_field/{idx:03d}")
        bay_role = role_map.get(field_role, "FEEDER")
        # Refy producenta z pola (fallback na wybór rozdzielnicy stacji).
        field_manufacturer_ref = field_spec.get("manufacturer_ref") or station_switchgear.get(
            "manufacturer_ref"
        )
        field_family_ref = field_spec.get("switchgear_family_ref") or station_switchgear.get(
            "switchgear_family_ref"
        )
        field_bay_template_ref = field_spec.get("bay_template_ref")
        field_protection_ref = field_spec.get("protection_ref")
        field_protection_codes = _resolve_bay_template_protection_codes(
            field_manufacturer_ref, field_bay_template_ref, bay_role
        )
        terminal_bus_ref = _make_id("stn", station_seed, f"sn_field_terminal/{idx:03d}")
        breaker_ref = _make_id("stn", station_seed, f"sn_field_breaker/{idx:03d}")
        breaker_catalog_ref = _sn_field_apparatus_catalog_ref(
            field_spec, payload_field_apparatus_ref
        )
        if breaker_catalog_ref is None:
            return _field_apparatus_missing_error(
                index=idx,
                field_role=field_role,
                code="station.insert.field_apparatus_ref_missing",
            )

        result = create_node(
            new_enm,
            {
                "ref_id": terminal_bus_ref,
                "name": f"Zacisk techniczny pola SN {idx + 1}",
                "voltage_kv": sn_voltage_kv,
                "tags": ["helper_bus", "field_terminal"],
                "meta": {
                    "visual_role": "FIELD_TERMINAL",
                    "render_on_sld": False,
                    "show_in_project_tree": False,
                    "field_ref": field_ref,
                    "station_ref": stn_id,
                },
            },
        )
        if not result.success:
            return _error_response(
                "Nie udało się utworzyć zacisku technicznego pola SN.",
                "station.insert.field_terminal_failed",
            )
        new_enm = result.enm
        created.append(terminal_bus_ref)

        result = create_branch(
            new_enm,
            {
                "ref_id": breaker_ref,
                "name": f"Wyłącznik pola SN {idx + 1}",
                "type": "breaker",
                "from_bus_ref": sn_bus_id,
                "to_bus_ref": terminal_bus_ref,
                "status": "closed",
                "r_ohm": 0.0,
                "x_ohm": 0.0,
                "catalog_ref": breaker_catalog_ref,
                "catalog_namespace": "APARAT_SN",
                "tags": ["station_field_device"],
                "meta": {
                    "field_ref": field_ref,
                    "station_ref": stn_id,
                    "field_role": field_role,
                    "bay_role": bay_role,
                    "render_on_sld": False,
                    "show_in_project_tree": False,
                    "requires_catalog_binding": False,
                    # Komunikat opisuje STAN RZECZYWISTY (B-12): aparat pochodzi
                    # z jawnego wskazania projektanta, nie z domyślnego typu.
                    "catalog_message": (
                        "Aparat pola SN z jawnie wskazanej pozycji katalogu APARAT_SN: "
                        f"{breaker_catalog_ref}."
                    ),
                },
            },
        )
        if not result.success:
            return _error_response(
                "Nie udało się utworzyć wyłącznika pola SN.",
                "station.insert.field_breaker_failed",
            )
        new_enm = result.enm
        created.append(breaker_ref)

        wyposazenie_pola = _wyposazenie_pola_z_wpisu(field_spec)
        if wyposazenie_pola:
            wyposazenie_pol.append((field_ref, field_role, wyposazenie_pola))

        field_specs.append(
            _build_field_spec(
                field_ref=field_ref,
                name=f"Pole {field_role or 'SN'} {idx + 1}",
                bay_role=bay_role,
                bus_ref=sn_bus_id,
                equipment_refs=[breaker_ref],
                protection_ref=field_protection_ref,
                protection_codes=field_protection_codes,
                bay_template_ref=field_bay_template_ref,
                switchgear_family_ref=field_family_ref,
                manufacturer_ref=field_manufacturer_ref,
                tags=["station_sn_field"],
                meta={
                    "field_role": field_role,
                    "terminal_bus_ref": terminal_bus_ref,
                    "default_device_ref": breaker_ref,
                    "requires_catalog_binding": True,
                },
            )
        )

    # Stacja sekcyjna: powiąż pola prezentacji z realną topologią dwusekcyjną
    # (G-STK-5). Pole SPRZEGLO → realne sprzęgło (bus_coupler), nie zdublowany
    # aparat; pole WY (LINIA_OUT) → sekcja B (skąd wychodzi prawy odcinek).
    if is_sectional:
        for spec in field_specs:
            role = str((spec.get("meta") or {}).get("field_role") or "")
            if role == "SPRZEGLO":
                equip = [r for r in spec.get("equipment_refs", []) if isinstance(r, str)]
                if coupler_id not in equip:
                    equip.append(coupler_id)
                spec["equipment_refs"] = equip
                spec["bus_ref"] = sn_bus_b_id
                spec.setdefault("meta", {})["coupler_ref"] = coupler_id
                spec["meta"]["section_a_bus_ref"] = sn_bus_id
                spec["meta"]["section_b_bus_ref"] = sn_bus_b_id
            elif role == "LINIA_OUT":
                spec["bus_ref"] = sn_bus_b_id

    nn_field_specs = _build_nn_field_specs(
        nn_block=nn_block,
        nn_bus_id=nn_bus_id,
        station_seed=station_seed,
    )

    # Create Substation — use semantic type (inline/branch/terminal/sectional/mv_lv)
    new_enm.setdefault("substations", []).append(
        {
            "ref_id": stn_id,
            "name": station_display_name,
            "station_type": substation_semantic_type,
            "bus_refs": [sn_bus_id, sn_bus_b_id] if is_sectional else [sn_bus_id],
            "transformer_refs": [],
            "tags": [],
            **station_identity,
            "meta": {
                "station_type_sn": station_type,
                "station_type_semantic": station_type_raw,
                "field_specs": field_specs,
                "nn_field_specs": nn_field_specs,
            },
        }
    )
    created.append(stn_id)

    # Register field adapter hints for canonical read-model
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "PORTS_CREATED", "element_id": stn_id})
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "FIELDS_CREATED_SN", "element_id": stn_id})

    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "DEVICES_CREATED_SN", "element_id": stn_id})

    # --- Create nN bus ---
    result = create_node(
        new_enm,
        {
            "ref_id": nn_bus_id,
            "name": "Szyna nN stacji",
            "voltage_kv": nn_voltage_kv,
        },
    )
    if not result.success:
        return _error_response("Nie udało się utworzyć szyny nN.", "station.insert.nn_bus_failed")
    new_enm = result.enm
    created.append(nn_bus_id)

    # Update substation bus_refs
    for sub in new_enm.get("substations", []):
        if sub.get("ref_id") == stn_id:
            sub["bus_refs"].append(nn_bus_id)
            break

    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BUS_NN_CREATED", "element_id": nn_bus_id})

    # --- Create Transformer ---
    if transformer.get("create", True):
        transformer_catalog_binding = transformer.get("catalog_binding") or payload.get(
            "catalog_binding"
        )
        tr_catalog = _require_catalog_ref(
            payload_ref=transformer.get("transformer_catalog_ref"),
            payload_binding=transformer_catalog_binding,
            context_code="insert_station_on_segment_sn.transformer",
        )
        if isinstance(tr_catalog, dict):
            return tr_catalog
        tr_data = {
            "device_type": "transformer",
            "ref_id": tr_id,
            "name": "Transformator SN/nN",
            "hv_bus_ref": sn_bus_id,
            "lv_bus_ref": nn_bus_id,
            "sn_mva": 0.001,  # Wartosc inicjalna — materializacja z katalogu
            "uhv_kv": sn_voltage_kv,
            "ulv_kv": nn_voltage_kv,
            "uk_percent": 0.01,  # Wartosc inicjalna — materializacja z katalogu
            "pk_kw": 0.0,
        }
        _apply_transformer_parallelism(tr_data, transformer)
        _apply_station_neutral_grounding(tr_data, payload, station=stn_id, new_enm=new_enm)
        materialization = _materialize_catalog_payload(
            catalog_ref=tr_catalog,
            catalog_binding=transformer_catalog_binding,
            default_namespace="TRAFO_SN_NN",
        )
        if isinstance(materialization, dict):
            return materialization
        binding_payload, materialized_params = materialization
        tr_data["catalog_ref"] = tr_catalog
        _apply_catalog_metadata(
            tr_data,
            binding_payload,
            default_namespace="TRAFO_SN_NN",
        )
        _apply_materialized_transformer_fields(tr_data, materialized_params)
        voltage_validation_error = _validate_transformer_voltage_compatibility(
            transformer_data=tr_data,
            expected_hv_kv=sn_voltage_kv,
            expected_lv_kv=nn_voltage_kv,
        )
        if voltage_validation_error is not None:
            return voltage_validation_error

        result = create_device(new_enm, tr_data)
        if not result.success:
            return _error_response(
                "Nie udało się utworzyć transformatora.", "station.insert.transformer_failed"
            )
        new_enm = result.enm
        created.append(tr_id)

        # Update substation
        for sub in new_enm.get("substations", []):
            if sub.get("ref_id") == stn_id:
                sub["transformer_refs"].append(tr_id)
                for field_spec in _field_specs_for_substation(sub):
                    if field_spec.get("bay_role") == "TR":
                        equipment_refs = [
                            ref
                            for ref in field_spec.get("equipment_refs", [])
                            if isinstance(ref, str)
                        ]
                        if tr_id not in equipment_refs:
                            equipment_refs.append(tr_id)
                        field_spec["equipment_refs"] = equipment_refs
                break

        ev_seq += 1
        events.append({"event_seq": ev_seq, "event_type": "TR_CREATED", "element_id": tr_id})

    source_event = _materialize_nn_source(
        new_enm=new_enm,
        nn_block=nn_block,
        station_seed=station_seed,
        nn_bus_id=nn_bus_id,
        station_id=stn_id,
        transformer_ref=tr_id,
        transformer_created=bool(transformer.get("create", True)),
        created=created,
    )
    if source_event is not None:
        generator_ref, event_type = source_event
        ev_seq += 1
        events.append({"event_seq": ev_seq, "event_type": event_type, "element_id": generator_ref})

    # Potrzeby własne stacji (G-STK-3) — mały odbiór nN, PF konsumuje.
    aux_load_ref = _materialize_station_auxiliary_load(
        new_enm,
        payload,
        nn_bus_id=nn_bus_id,
        station_id=stn_id,
        station_seed=station_seed,
        created=created,
    )
    if aux_load_ref is not None:
        ev_seq += 1
        events.append(
            {"event_seq": ev_seq, "event_type": "AUX_LOAD_CREATED", "element_id": aux_load_ref}
        )

    # --- nN Feeders ---
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "FIELDS_CREATED_NN", "element_id": nn_bus_id})

    ev_seq += 1
    events.append(
        {"event_seq": ev_seq, "event_type": "DEVICES_CREATED_NN", "element_id": nn_bus_id}
    )

    # --- Krok 4: Aktualizacja magistrali ---
    corridor = _find_corridor_for_segment(enm, segment_id)
    if corridor:
        for c in new_enm.get("corridors", []):
            if c.get("ref_id") == corridor.get("ref_id"):
                segments = c.get("ordered_segment_refs", [])
                if segment_id in segments:
                    idx = segments.index(segment_id)
                    segments[idx : idx + 1] = [seg_left_id, seg_right_id]
                break

    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "RECONNECTED_GRAPH", "element_id": stn_id})
    ev_seq += 1
    events.append(
        {"event_seq": ev_seq, "event_type": "LOGICAL_VIEWS_UPDATED", "element_id": stn_id}
    )

    # B-2: zaczepy transformatora w TEJ SAMEJ migawce co stacja. Krok stoi TUTAJ
    # (a nie zaraz po utworzeniu transformatora), bo handler
    # `update_element_parameters` zwraca GŁĘBOKĄ KOPIĘ modelu — wcześniejsza
    # podmiana `new_enm` unieważniłaby lokalne referencje, które kolejne kroki
    # jeszcze mutują. Parytet z `append_station_on_endpoint`.
    if transformer.get("create", True):
        wynik_zaczepow = _zastosuj_zaczepy_transformatora(
            new_enm,
            transformer,
            transformer_ref=tr_id,
            controlled_bus_ref=nn_bus_id,
            kod_bledu="station.insert.tap_changer_failed",
        )
        if isinstance(wynik_zaczepow, dict):
            return wynik_zaczepow
        new_enm, zdarzenia_zaczepow = wynik_zaczepow
        for zdarzenie in zdarzenia_zaczepow:
            ev_seq += 1
            events.append({**zdarzenie, "event_seq": ev_seq})

    # B-3: CT/VT/zabezpieczenia pól w TEJ SAMEJ migawce co stacja (atomowo).
    wynik_wyposazenia = _zastosuj_wyposazenie_pol(
        new_enm,
        wyposazenie_pol,
        kod_bledu="station.insert.field_equipment_failed",
    )
    if isinstance(wynik_wyposazenia, dict):
        return wynik_wyposazenia
    new_enm, wyposazenie_created, wyposazenie_events = wynik_wyposazenia
    created.extend(wyposazenie_created)
    for zdarzenie in wyposazenie_events:
        ev_seq += 1
        events.append({**zdarzenie, "event_seq": ev_seq})

    audit.append(
        {"step": ev_seq, "action": f"Wstawiono stację typ {station_type}", "element_id": stn_id}
    )

    response = _response(
        new_enm,
        created=created,
        deleted=deleted,
        selection_id=stn_id,
        selection_type="substation",
        audit=audit,
        events=events,
    )

    if dry_run:
        # Phase 0C: dry_run zwraca PEEN electrical_impact (operator-grade SLD plan v2).
        # NIE zwraca zmutowanego snapshot — tylko walidacja + impact assessment.
        response["dry_run"] = True
        response["preview"] = _build_split_preview_metadata(
            enm=enm,
            new_enm=new_enm,
            segment=segment,
            inserted_station_id=stn_id,
            insert_mode=insert_mode,
            insert_value=insert_value,
            length_km=length_km,
            station_type=substation_semantic_type,
            created=created,
        )
        # Usuń snapshot z response (dry_run = read-only preview).
        response.pop("snapshot", None)

    return response


def _build_split_preview_metadata(
    *,
    enm: dict[str, Any],
    new_enm: dict[str, Any],
    segment: dict[str, Any],
    inserted_station_id: str,
    insert_mode: str,
    insert_value: float,
    length_km: float,
    station_type: str,
    created: list[str],
) -> dict[str, Any]:
    """Phase 0C: pełen electrical_impact dla operator-grade conscious split.

    Returns:
      preview dict z polami:
        inserted_station_id, station_type, halves{first/second segment + length},
        electrical_impact{
          topology_type_changed, affected_object_refs,
          invalidated_results, affected_proof_packs,
          topology_type_changes (list per object),
          catalog_inheritance, length_assignment, missing_data_after,
        }
    """
    segment_id = segment.get("ref_id")
    seg_type = segment.get("type", "")
    catalog_ref = segment.get("catalog_ref")
    catalog_namespace = segment.get("catalog_namespace")

    # Halves: split_ratio z insert_at
    if insert_mode == "RATIO":
        split_ratio = float(insert_value)
    elif insert_mode == "ODLEGLOSC_OD_POCZATKU_M" and length_km > 0:
        split_ratio = float(insert_value) / (length_km * 1000.0)
        if split_ratio < 0.0:
            split_ratio = 0.0
        if split_ratio > 1.0:
            split_ratio = 1.0
    else:
        split_ratio = 0.5

    length_a_km = length_km * split_ratio
    length_b_km = length_km * (1.0 - split_ratio)

    halves = {
        "first_segment_id": f"{segment_id}_a" if segment_id else None,
        "second_segment_id": f"{segment_id}_b" if segment_id else None,
        "first_length_km": round(length_a_km, 6),
        "second_length_km": round(length_b_km, 6),
        "split_ratio": round(split_ratio, 6),
    }

    # Topology type changes — lista zmian per object
    topology_type_changes: list[dict[str, Any]] = []
    if segment_id:
        topology_type_changes.append(
            {
                "object_ref": segment_id,
                "before": seg_type,
                "after": "split_into_two_segments",
                "halves": [halves["first_segment_id"], halves["second_segment_id"]],
            }
        )
    topology_type_changes.append(
        {
            "object_ref": inserted_station_id,
            "before": "no_station",
            "after": station_type,
            "kind": "station_inserted_on_segment",
        }
    )

    # Catalog inheritance — halves dziedziczą catalog_ref po starym segmencie
    catalog_inheritance = {
        "source_segment_ref": segment_id,
        "source_catalog_ref": catalog_ref,
        "source_catalog_namespace": catalog_namespace,
        "first_inherits": catalog_ref is not None,
        "second_inherits": catalog_ref is not None,
        "rule": (
            "Obie połówki dziedziczą catalog_ref ze źródłowego odcinka."
            if catalog_ref
            else "Brak catalog_ref na odcinku — halves bez katalogu (W009 fix action)."
        ),
    }

    # Length assignment — jak długość podzielona
    length_assignment = {
        "source_length_km": round(length_km, 6),
        "split_mode": insert_mode,
        "split_value": insert_value,
        "first_length_km": round(length_a_km, 6),
        "second_length_km": round(length_b_km, 6),
        "fraction_a": round(split_ratio, 6),
        "fraction_b": round(1.0 - split_ratio, 6),
    }

    # Invalidated results — wyniki run/proof które staną się stale po split
    # Heurystyka: znajdujemy results powiązane z source_segment albo z connected buses.
    invalidated_results: list[dict[str, Any]] = []
    affected_proof_packs: list[dict[str, Any]] = []

    from_bus_ref = segment.get("from_bus_ref")
    to_bus_ref = segment.get("to_bus_ref")
    affected_buses = {b for b in (from_bus_ref, to_bus_ref) if b}
    affected_object_refs_set: set[str] = {inserted_station_id, *created}
    if segment_id:
        affected_object_refs_set.add(segment_id)
    affected_object_refs_set.update(affected_buses)

    # Skanowanie istniejących run/proof artefaktów w ENM (jeśli są)
    for run in enm.get("analysis_runs", []) or enm.get("runs", []) or []:
        run_ref = run.get("ref_id") or run.get("run_id")
        if not run_ref:
            continue
        # Zakładamy że run jest invalidowany jeśli touchuje któreś affected_object_refs
        run_objects = set(run.get("affected_object_refs", []) or [])
        if run_objects & affected_object_refs_set or run.get("scope") in ("global", "all"):
            invalidated_results.append(
                {
                    "run_ref": run_ref,
                    "run_kind": run.get("run_kind") or run.get("kind") or "unknown",
                    "reason": "topology_split_on_segment",
                }
            )
    for proof in enm.get("proof_packs", []) or []:
        proof_ref = proof.get("ref_id") or proof.get("proof_id")
        if not proof_ref:
            continue
        proof_objects = set(proof.get("affected_object_refs", []) or [])
        if proof_objects & affected_object_refs_set or proof.get("scope") in ("global", "all"):
            affected_proof_packs.append(
                {
                    "proof_ref": proof_ref,
                    "proof_kind": proof.get("proof_kind") or proof.get("kind") or "unknown",
                    "reason": "topology_split_on_segment",
                }
            )

    # Missing data after — co brakuje po split (deterministyczna heurystyka)
    missing_data_after: list[str] = []
    if not catalog_ref:
        missing_data_after.append(
            f"Brak catalog_ref na halves (segment '{segment_id}' nie ma katalogu)."
        )
    if station_type in ("inline", "branch", "sectional", "mv_lv") and length_km <= 0:
        missing_data_after.append(
            "Niezerowa długość segmentu — split z zerową długością niedozwolony."
        )
    # Sprawdź czy nowa stacja będzie potrzebować transformatora (mv_lv typ)
    if station_type == "mv_lv":
        # Jeśli payload nie podał transformer — stacja będzie incomplete
        # Heurystyka: stacja typu A (mv_lv) zawsze potrzebuje TR + bus nN
        pass  # TR utworzony w glównej operacji jeśli był podany

    return {
        "inserted_station_id": inserted_station_id,
        "station_type": station_type,
        "halves": halves,
        "electrical_impact": {
            "topology_type_changed": True,
            "affected_object_refs": sorted(affected_object_refs_set),
            "topology_type_changes": topology_type_changes,
            "catalog_inheritance": catalog_inheritance,
            "length_assignment": length_assignment,
            "invalidated_results": invalidated_results,
            "affected_proof_packs": affected_proof_packs,
            "missing_data_after": missing_data_after,
            "affected_buses": sorted(affected_buses),
        },
    }


# ---------------------------------------------------------------------------
# 4. insert_branch_point_on_segment_sn
# ---------------------------------------------------------------------------


def _insert_branch_point_on_segment_sn(
    enm: dict[str, Any],
    payload: dict[str, Any],
    *,
    branch_point_type: str,
) -> dict[str, Any]:
    segment_id = payload.get("segment_id") or payload.get("segment_ref")
    if not segment_id:
        return _error_response("Brak identyfikatora odcinka.", "branch_point.segment_missing")

    segment = _find_branch(enm, segment_id)
    if not segment:
        return _error_response(
            f"Odcinek '{segment_id}' nie istnieje.", "branch_point.segment_not_found"
        )

    seg_type = segment.get("type")
    if branch_point_type == "branch_pole" and seg_type != "line_overhead":
        return _error_response(
            "Słup rozgałęźny można osadzić wyłącznie na linii napowietrznej.",
            "branch_point.invalid_parent_medium",
        )
    if branch_point_type == "zksn" and seg_type != "cable":
        return _error_response(
            "ZKSN można osadzić wyłącznie na odcinku kablowym.",
            "branch_point.invalid_parent_medium",
        )

    bp_catalog_ref = _require_catalog_ref(
        payload_ref=payload.get("catalog_ref"),
        payload_binding=payload.get("catalog_binding"),
        context_code=f"_insert_branch_point_on_segment_sn.{branch_point_type}",
    )
    if isinstance(bp_catalog_ref, dict):
        return bp_catalog_ref

    catalog_params = _branch_point_catalog_params(bp_catalog_ref)
    branch_ports_count = _branch_point_port_count(
        branch_point_type=branch_point_type,
        payload=payload,
        catalog_params=catalog_params,
    )
    materialized_params = _branch_point_materialized_params(
        branch_point_type=branch_point_type,
        catalog_ref=bp_catalog_ref,
        payload=payload,
        catalog_params=catalog_params,
        branch_ports_count=branch_ports_count,
    )

    switch_state = _normalize_branch_point_switch_state(payload.get("switch_state"))
    insert_at = payload.get("insert_at", {"mode": "RATIO", "value": 0.5})
    length_km = float(segment.get("length_km", 0.0))
    ratio = float(insert_at.get("value", 0.5))
    if insert_at.get("mode") == "ODLEGLOSC_OD_POCZATKU_M":
        ratio = float(insert_at.get("value", 0.0)) / (length_km * 1000.0) if length_km > 0 else 0.5
    ratio = _quantize_ratio(max(0.0, min(1.0, ratio)))

    seed = _compute_seed(
        {
            "op": f"insert_{branch_point_type}",
            "segment_id": segment_id,
            "ratio": ratio,
            "branch_ports_count": branch_ports_count,
        }
    )
    bp_ref = _make_id("bp", seed, branch_point_type)
    bp_bus_ref = _make_id("bp", seed, "bus")
    seg_left_id = f"{segment_id}_L_{branch_point_type}"
    seg_right_id = f"{segment_id}_R_{branch_point_type}"
    source_run_ref = _line_run_ref_for_segments(enm, [segment_id])
    raw_segment_name = str(segment.get("name") or "").strip()
    base_segment_name = (
        raw_segment_name
        if raw_segment_name
        and "seg/" not in raw_segment_name
        and "/segment" not in raw_segment_name
        and "branch" not in raw_segment_name
        and "punktu rozgałęzienia" not in raw_segment_name.lower()
        and "punktem rozgałęzienia" not in raw_segment_name.lower()
        and "punktu rozgałęzienia" not in raw_segment_name.lower()
        and "punktem rozgałęzienia" not in raw_segment_name.lower()
        else "Odcinek SN"
    )

    new_enm = copy.deepcopy(enm)
    created: list[str] = []
    deleted: list[str] = []

    from_bus_ref = segment.get("from_bus_ref")
    to_bus_ref = segment.get("to_bus_ref")
    left_length = length_km * ratio
    right_length = length_km * (1.0 - ratio)
    endpoint_mode = "start" if ratio <= 0.0 else "end" if ratio >= 1.0 else None

    if endpoint_mode is None:
        del_result = delete_branch(new_enm, segment_id)
        if not del_result.success:
            return _error_response(
                "Nie udało się podzielić odcinka.", "branch_point.segment_split_failed"
            )
        new_enm = del_result.enm
        deleted.append(segment_id)

    bus_voltage = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == from_bus_ref:
            bus_voltage = b.get("voltage_kv")
            break
    if not bus_voltage:
        return _error_response(
            "Nie można ustalić napięcia punktu rozgałęzienia.", "branch_point.voltage_missing"
        )

    node_res = create_node(
        new_enm,
        {
            "ref_id": bp_bus_ref,
            "name": payload.get("name")
            or ("Słup rozgałęźny" if branch_point_type == "branch_pole" else "ZKSN"),
            "voltage_kv": bus_voltage,
        },
    )
    if not node_res.success:
        return _error_response(
            "Nie udało się utworzyć punktu rozgałęzienia.", "branch_point.bus_creation_failed"
        )
    new_enm = node_res.enm
    created.append(bp_bus_ref)

    if endpoint_mode is not None:
        for branch in new_enm.get("branches", []):
            if branch.get("ref_id") == segment_id or branch.get("id") == segment_id:
                if endpoint_mode == "start":
                    branch["from_bus_ref"] = bp_bus_ref
                else:
                    branch["to_bus_ref"] = bp_bus_ref
                break
        old_endpoint_bus_ref = from_bus_ref if endpoint_mode == "start" else to_bus_ref
        if isinstance(old_endpoint_bus_ref, str):
            new_enm = _remove_unreferenced_helper_topology_buses(new_enm)
        main_segment_refs = [segment_id]
        port_main_in = bp_bus_ref if endpoint_mode == "start" else from_bus_ref
        port_main_out = to_bus_ref if endpoint_mode == "start" else bp_bus_ref
    else:
        main_segment_refs = [seg_left_id, seg_right_id]
        port_main_in = from_bus_ref
        port_main_out = to_bus_ref
        for seg_id, seg_from, seg_to, seg_len, split_name in (
            (
                seg_left_id,
                from_bus_ref,
                bp_bus_ref,
                left_length,
                f"{base_segment_name} - do punktu rozgałęzienia",
            ),
            (
                seg_right_id,
                bp_bus_ref,
                to_bus_ref,
                right_length,
                f"{base_segment_name} - za punktem rozgałęzienia",
            ),
        ):
            seg_data: dict[str, Any] = {
                "ref_id": seg_id,
                "name": split_name,
                "type": seg_type,
                "from_bus_ref": seg_from,
                "to_bus_ref": seg_to,
                "length_km": seg_len,
                "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
                "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
                "status": "closed",
                "catalog_ref": segment.get("catalog_ref"),
            }
            _copy_split_segment_fields(seg_data, segment)
            branch_res = create_branch(new_enm, seg_data)
            if not branch_res.success:
                return _error_response(
                    "Nie udało się odtworzyć geometrii segmentu.",
                    "branch_point.segment_rebuild_failed",
                )
            new_enm = branch_res.enm
            created.append(seg_id)
    branch_port_bus_refs: list[str] = []
    for idx in range(branch_ports_count):
        port_bus = _make_id("bp", seed, f"branch_bus_{idx + 1}")
        port_res = create_node(
            new_enm,
            {
                "ref_id": port_bus,
                "name": f"Port odgałęźny {idx + 1}",
                "voltage_kv": bus_voltage,
            },
        )
        if not port_res.success:
            return _error_response(
                "Nie udało się utworzyć portu BRANCH.", "branch_point.required_port_missing"
            )
        new_enm = port_res.enm
        created.append(port_bus)
        branch_port_bus_refs.append(port_bus)

        connector_ref = _make_id("bp", seed, f"branch_connector_{idx + 1}")
        connector_status = "open" if switch_state == "open" else "closed"
        connector_res = create_branch(
            new_enm,
            {
                "ref_id": connector_ref,
                "name": f"Łącznik portu odgałęźnego {idx + 1}",
                "type": "switch",
                "from_bus_ref": bp_bus_ref,
                "to_bus_ref": port_bus,
                "status": connector_status,
                "r_ohm": 0.0,
                "x_ohm": 0.0,
                "tags": ["branch_point_internal_connector"],
                "meta": {
                    "branch_point_ref": bp_ref,
                    "port_id": f"BRANCH_{idx + 1}" if branch_point_type == "zksn" else "BRANCH",
                    "render_on_sld": False,
                    "show_in_project_tree": False,
                    "requires_catalog_binding": False,
                    "visual_role": "BRANCH_POINT_INTERNAL_SWITCH",
                },
            },
        )
        if not connector_res.success:
            return _error_response(
                "Nie udało się połączyć portu odgałęźnego z punktem rozgałęzienia.",
                "branch_point.internal_connector_failed",
            )
        new_enm = connector_res.enm
        created.append(connector_ref)

    # bp_catalog_ref already validated above (cannot be None here)
    completeness = "KOMPLETNY"
    new_enm.setdefault("branch_points", []).append(
        {
            "ref_id": bp_ref,
            "name": payload.get("name")
            or ("Słup rozgałęźny SN" if branch_point_type == "branch_pole" else "ZKSN SN"),
            "branch_point_type": branch_point_type,
            "parent_segment_id": segment_id,
            "bus_ref": bp_bus_ref,
            "catalog_ref": bp_catalog_ref,
            "catalog_namespace": payload.get("catalog_namespace") or "mv_branch_points",
            "catalog_version": payload.get("catalog_version"),
            "source_mode": payload.get("source_mode") or "KATALOG",
            "ports": {
                "MAIN_IN": port_main_in,
                "MAIN_OUT": port_main_out,
                "BRANCH": branch_port_bus_refs,
            },
            "branch_occupied": {},
            "switch_state": switch_state,
            "materialized_params": materialized_params,
            "completeness_status": completeness,
            "runtime_inputs": {
                "operation_semantics": "insert_point_in_run",
                "name": payload.get("name"),
                "branch_ports_count": branch_ports_count,
                "insert_at": insert_at,
                "switch_state": switch_state,
                "source_segment_id": segment_id,
                "main_segment_refs": main_segment_refs,
                "source_run_ref": source_run_ref,
                "endpoint_mode": endpoint_mode,
                "route_ports": materialized_params.get("route_ports"),
                "switchgear_field_specs": materialized_params.get("switchgear_field_specs"),
                "apparatus_specs": materialized_params.get("apparatus_specs"),
                "has_transformer": False,
            },
        }
    )
    created.append(bp_ref)

    if endpoint_mode is None:
        for c in new_enm.get("corridors", []):
            refs = c.get("ordered_segment_refs", [])
            if segment_id in refs:
                idx = refs.index(segment_id)
                c["ordered_segment_refs"] = (
                    refs[:idx] + [seg_left_id, seg_right_id] + refs[idx + 1 :]
                )
                break

        for run in new_enm.get("line_runs", []):
            run_segments = run.get("segments") or []
            if not any(item.get("segment_ref") == segment_id for item in run_segments):
                continue
            next_order = 1
            updated_segments: list[dict[str, Any]] = []
            for item in run_segments:
                if item.get("segment_ref") == segment_id:
                    updated_segments.append({"segment_ref": seg_left_id, "order": next_order})
                    next_order += 1
                    updated_segments.append({"segment_ref": seg_right_id, "order": next_order})
                    next_order += 1
                    continue
                updated = dict(item)
                updated["order"] = next_order
                updated_segments.append(updated)
                next_order += 1
            run["segments"] = updated_segments

    return _response(
        new_enm,
        created=created,
        deleted=deleted,
        selection_id=bp_ref,
        selection_type=branch_point_type,
        events=[{"event_seq": 1, "event_type": "BRANCH_POINT_CREATED", "element_id": bp_ref}],
    )


def insert_branch_pole_on_segment_sn(
    enm: dict[str, Any], payload: dict[str, Any]
) -> dict[str, Any]:
    return _insert_branch_point_on_segment_sn(enm, payload, branch_point_type="branch_pole")


def insert_zksn_on_segment_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    return _insert_branch_point_on_segment_sn(enm, payload, branch_point_type="zksn")


# ---------------------------------------------------------------------------
# 5. start_branch_segment_sn
# ---------------------------------------------------------------------------


def start_branch_segment_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj odgałęzienie SN z istniejącej szyny.

    Wymaga jawnego from_ref (port BRANCH na stacji lub branch-poincie).
    from_bus_ref jest obsługiwane wyłącznie jako pole kompatybilności
    i musi mapować się 1:1 do bus_ref rozwiązanego z from_ref.
    """
    from_ref = payload.get("from_ref")
    from_bus_ref = payload.get("from_bus_ref")
    segment = payload.get("segment", {})

    rodzaj = segment.get("rodzaj", "KABEL")
    dlugosc_m = segment.get("dlugosc_m") or payload.get("dlugosc_m") or 0
    if dlugosc_m <= 0:
        return _error_response(
            "Brak długości odcinka odgałęzienia (dlugosc_m). Podaj jawną wartość > 0.",
            "branch.dlugosc_missing",
        )

    branch_catalog_binding = segment.get("catalog_binding") or payload.get("catalog_binding")
    branch_catalog_ref = _require_catalog_ref(
        payload_ref=segment.get("catalog_ref"),
        payload_binding=branch_catalog_binding,
        context_code="start_branch_segment_sn",
    )
    if isinstance(branch_catalog_ref, dict):
        return branch_catalog_ref

    inferred_from_bus_ref = bool(not from_ref and from_bus_ref)
    if inferred_from_bus_ref:
        inferred_from_ref, lookup_err = _lookup_branch_from_ref_for_bus(enm, from_bus_ref)
        if lookup_err:
            return _error_response(
                "Pole from_bus_ref bez from_ref jest niedozwolone dla źródła "
                "nieobsługującego portu BRANCH.",
                "branch_connection.source_not_branch_capable",
            )
        from_ref = inferred_from_ref
    if not from_ref:
        return _error_response(
            "Brak referencji portu źródłowego (from_ref). "
            "Kliknij port BRANCH na stacji, słupie lub ZKSN w SLD.",
            "branch.from_ref_required",
        )

    resolved_bus_ref, err_code = _resolve_branch_from_ref(enm, from_ref)
    if err_code:
        return _error_response("Nieprawidłowe źródło odgałęzienia.", err_code)
    from_bus_ref = resolved_bus_ref

    if (
        payload.get("from_bus_ref")
        and not inferred_from_bus_ref
        and payload.get("from_bus_ref") != from_bus_ref
    ):
        return _error_response(
            "Pole from_bus_ref nie zgadza się z bus_ref wynikającym z from_ref.",
            "branch_connection.source_not_branch_capable",
        )

    from_bus = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == from_bus_ref:
            from_bus = b
            break
    if not from_bus:
        return _error_response(f"Szyna '{from_bus_ref}' nie istnieje.", "branch.from_bus_not_found")

    rodzaj = segment.get("rodzaj", "KABEL")
    dlugosc_m = segment.get("dlugosc_m") or payload.get("dlugosc_m") or 0
    if dlugosc_m <= 0:
        return _error_response(
            "Brak długości odcinka odgałęzienia (dlugosc_m). Podaj jawną wartość > 0.",
            "branch.dlugosc_missing",
        )

    branch_catalog_binding = segment.get("catalog_binding") or payload.get("catalog_binding")
    branch_catalog_ref = _require_catalog_ref(
        payload_ref=segment.get("catalog_ref"),
        payload_binding=branch_catalog_binding,
        context_code="start_branch_segment_sn",
    )
    if isinstance(branch_catalog_ref, dict):
        return branch_catalog_ref

    seed = _compute_seed(
        {
            "op": "start_branch",
            "from": from_bus_ref,
            "rodzaj": rodzaj,
            "dlugosc_m": dlugosc_m,
        }
    )
    new_bus_ref = f"bus/{seed}/branch_end"
    branch_ref = f"seg/{seed}/branch_segment"

    new_enm = copy.deepcopy(enm)
    created = []
    events = []
    ev_seq = 0

    voltage_kv = from_bus.get("voltage_kv")
    if not voltage_kv or voltage_kv <= 0:
        return _error_response(
            f"Szyna źródłowa '{from_bus_ref}' nie ma napięcia znamionowego.",
            "branch.from_bus_voltage_missing",
        )
    result = create_node(
        new_enm,
        {
            "ref_id": new_bus_ref,
            "name": "Szyna odgałęzienia",
            "voltage_kv": voltage_kv,
            "tags": ["helper_bus", "topology_terminal"],
            "meta": {
                "visual_role": "INLINE_TERMINAL",
                "render_on_sld": False,
                "show_in_project_tree": False,
            },
        },
    )
    if not result.success:
        return _error_response("Nie udało się utworzyć szyny.", "branch.bus_creation_failed")
    new_enm = result.enm
    created.append(new_bus_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BUS_CREATED", "element_id": new_bus_ref})

    branch_type = "cable" if rodzaj == "KABEL" else "line_overhead"
    origin_element_ref, origin_port_id = from_ref.split(".", 1)
    origin_branch_point = next(
        (bp for bp in enm.get("branch_points", []) if bp.get("ref_id") == origin_element_ref),
        None,
    )
    if (
        origin_branch_point
        and origin_branch_point.get("branch_point_type") == "branch_pole"
        and branch_type != "line_overhead"
    ):
        return _error_response(
            "Ze słupa rozgałęźnego można wyprowadzić wyłącznie odcinek napowietrzny SN.",
            "branch_connection.invalid_segment_family",
        )
    if (
        origin_branch_point
        and origin_branch_point.get("branch_point_type") == "zksn"
        and branch_type != "cable"
    ):
        return _error_response(
            "Z ZKSN można wyprowadzić wyłącznie odcinek kablowy SN.",
            "branch_connection.invalid_segment_family",
        )
    branch_data: dict[str, Any] = {
        "ref_id": branch_ref,
        "name": "Odgałęzienie",
        "type": branch_type,
        "from_bus_ref": from_bus_ref,
        "to_bus_ref": new_bus_ref,
        "length_km": dlugosc_m / 1000.0,
        "r_ohm_per_km": 0.0,
        "x_ohm_per_km": 0.0,
        "status": "closed",
    }
    materialization = _materialize_catalog_payload(
        catalog_ref=branch_catalog_ref,
        catalog_binding=branch_catalog_binding,
        default_namespace="KABEL_SN" if branch_type == "cable" else "LINIA_SN",
    )
    if isinstance(materialization, dict):
        return materialization
    binding_payload, materialized_params = materialization
    branch_data["catalog_ref"] = branch_catalog_ref
    _apply_catalog_metadata(
        branch_data,
        binding_payload,
        default_namespace="KABEL_SN" if branch_type == "cable" else "LINIA_SN",
    )
    _apply_materialized_branch_fields(branch_data, materialized_params)
    _apply_explicit_segment_zero_sequence(branch_data, segment)
    result = create_branch(new_enm, branch_data)
    if not result.success:
        return _error_response("Nie udało się utworzyć odgałęzienia.", "branch.creation_failed")
    new_enm = result.enm
    created.append(branch_ref)

    parent_run_ref = None
    if from_ref and from_ref.startswith("bp/"):
        for bp in new_enm.get("branch_points", []):
            if bp.get("ref_id") == origin_element_ref:
                bp.setdefault("branch_occupied", {})[origin_port_id] = branch_ref
                main_segment_refs = _branch_point_main_segment_refs(new_enm, bp)
                runtime_inputs = bp.get("runtime_inputs")
                parent_run_ref = _line_run_ref_for_segments(new_enm, main_segment_refs) or (
                    runtime_inputs.get("source_run_ref")
                    if isinstance(runtime_inputs, dict)
                    else None
                )
                break

    branch_run_seed = _compute_seed(
        {"op": "start_branch_run", "from_ref": from_ref, "branch_ref": branch_ref}
    )
    branch_corridor_ref = _make_id("corridor", branch_run_seed, "branch")
    branch_type_label = "kablowe" if branch_type == "cable" else "napowietrzne"
    if not any(c.get("ref_id") == branch_corridor_ref for c in new_enm.setdefault("corridors", [])):
        new_corridor: dict[str, Any] = {
            "ref_id": branch_corridor_ref,
            "name": f"Odgałęzienie SN {branch_type_label}",
            "corridor_type": "radial",
            "ordered_segment_refs": [branch_ref],
            "parent_run_ref": parent_run_ref,
            "branch_origin_station_ref": origin_element_ref,
            "branch_origin_port_ref": from_ref,
            "starting_port_ref": from_ref,
            "meta": {},
        }
        # Kanon dedykowanych pól (dyrektywa właściciela, 2026-07-17): feeder
        # wyprowadzany z GPZ dostaje WŁASNE pole liniowe — wskazane w
        # `from_ref` jeśli wolne, inaczej pierwsze wolne, inaczej NOWE pole
        # (limit sekcji pilnowany). Z jednego pola nigdy dwa kable.
        gpz_field_ref, created_gpz_field, alloc_error = _allocate_gpz_line_field_for_branch(
            new_enm, origin_element_ref, branch_corridor_ref
        )
        if alloc_error is not None:
            return alloc_error
        if gpz_field_ref:
            new_corridor["meta"]["gpz_field_ref"] = gpz_field_ref
            if created_gpz_field is not None:
                created.append(str(created_gpz_field.get("field_ref")))
                ev_seq += 1
                events.append(
                    {
                        "event_seq": ev_seq,
                        "event_type": "GPZ_LINE_FIELD_CREATED_SN",
                        "element_id": str(created_gpz_field.get("field_ref")),
                    }
                )
        new_enm["corridors"].append(new_corridor)
        created.append(branch_corridor_ref)
    branch_line_run = _ensure_line_run_for_corridor(
        new_enm,
        branch_corridor_ref,
        starting_bay_ref=origin_element_ref,
        starting_port_ref=from_ref,
        run_kind="branch",
    )
    if branch_line_run is not None:
        branch_line_run["parent_run_ref"] = parent_run_ref
        branch_line_run["branch_origin_station_ref"] = origin_element_ref
        branch_line_run["starting_port_ref"] = from_ref
        _append_line_run_segment(branch_line_run, branch_ref)

    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BRANCH_CREATED", "element_id": branch_ref})

    return _response(
        new_enm, created=created, selection_id=branch_ref, selection_type="branch", events=events
    )


# ---------------------------------------------------------------------------
# 5. insert_section_switch_sn
# ---------------------------------------------------------------------------


def insert_section_switch_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Wstaw łącznik sekcyjny w odcinek SN."""
    segment_id = payload.get("segment_id")
    insert_at = payload.get("insert_at", {"mode": "RATIO", "value": 0.5})
    switch_type = payload.get("switch_type", "ROZLACZNIK")
    normal_state = payload.get("normal_state", "closed")

    if not segment_id:
        return _error_response("Brak identyfikatora odcinka.", "switch.segment_missing")

    segment = _find_branch(enm, segment_id)
    if not segment:
        return _error_response(f"Odcinek '{segment_id}' nie istnieje.", "switch.segment_not_found")

    switch_catalog_ref = _require_catalog_ref(
        payload_ref=payload.get("catalog_ref"),
        payload_binding=payload.get("catalog_binding"),
        context_code="insert_section_switch_sn",
    )
    if isinstance(switch_catalog_ref, dict):
        return switch_catalog_ref

    from_bus_ref = segment.get("from_bus_ref")
    to_bus_ref = segment.get("to_bus_ref")
    length_km = segment.get("length_km", 1.0)
    seg_type = segment.get("type", "cable")

    insert_mode = insert_at.get("mode", "RATIO")
    insert_value = float(insert_at.get("value", 0.5))
    ratio = (
        insert_value
        if insert_mode == "RATIO"
        else (insert_value / (length_km * 1000) if length_km > 0 else 0.5)
    )

    seed = _compute_seed(
        {
            "op": "insert_switch",
            "segment_id": segment_id,
            "ratio": ratio,
        }
    )
    switch_bus_ref = f"bus/{seed}/switch_node"
    switch_ref = f"sw/{seed}/switch"
    seg_left_id = f"{segment_id}_SL"
    seg_right_id = f"{segment_id}_SR"

    new_enm = copy.deepcopy(enm)
    created = []
    deleted = []
    events = []
    ev_seq = 0

    # Delete old segment
    del_result = delete_branch(new_enm, segment_id)
    if not del_result.success:
        return _error_response("Nie udało się usunąć odcinka.", "switch.segment_delete_failed")
    new_enm = del_result.enm
    deleted.append(segment_id)

    # Create switch bus — napięcie z szyny źródłowej (topologiczne)
    voltage_kv = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == from_bus_ref:
            voltage_kv = b.get("voltage_kv")
            break
    if not voltage_kv or voltage_kv <= 0:
        return _error_response(
            f"Szyna '{from_bus_ref}' nie ma napięcia znamionowego.",
            "switch.from_bus_voltage_missing",
        )

    result = create_node(
        new_enm,
        {
            "ref_id": switch_bus_ref,
            "name": "Węzeł łącznika",
            "voltage_kv": voltage_kv,
            "tags": ["helper_bus", "topology_terminal"],
            "meta": {
                "visual_role": "INLINE_TERMINAL",
                "render_on_sld": False,
                "show_in_project_tree": False,
            },
        },
    )
    if not result.success:
        return _error_response("Nie udało się utworzyć węzła.", "switch.bus_creation_failed")
    new_enm = result.enm
    created.append(switch_bus_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "SWITCH_INSERTED", "element_id": switch_ref})

    # Left segment
    left_length = length_km * ratio
    result = create_branch(
        new_enm,
        {
            "ref_id": seg_left_id,
            "name": f"Odcinek {seg_left_id}",
            "type": seg_type,
            "from_bus_ref": from_bus_ref,
            "to_bus_ref": switch_bus_ref,
            "length_km": left_length,
            "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
            "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
            "catalog_ref": segment.get("catalog_ref"),
            "status": "closed",
        },
    )
    new_enm = result.enm
    created.append(seg_left_id)

    # Switch branch
    sw_type = "breaker" if switch_type == "WYLACZNIK" else "switch"
    result = create_branch(
        new_enm,
        {
            "ref_id": switch_ref,
            "name": payload.get("switch_name") or "Łącznik sekcyjny",
            "type": sw_type,
            "from_bus_ref": switch_bus_ref,
            "to_bus_ref": switch_bus_ref,
            "status": normal_state,
        },
    )
    # Note: switch connecting same bus is a conceptual model
    # Actually switch connects between two adjacent nodes
    # Let's create another bus
    switch_bus2_ref = f"bus/{seed}/switch_node_2"
    result = create_node(
        new_enm,
        {
            "ref_id": switch_bus2_ref,
            "name": "Węzeł łącznika 2",
            "voltage_kv": voltage_kv,
            "tags": ["helper_bus", "topology_terminal"],
            "meta": {
                "visual_role": "INLINE_TERMINAL",
                "render_on_sld": False,
                "show_in_project_tree": False,
            },
        },
    )
    new_enm = result.enm
    created.append(switch_bus2_ref)

    # Redo: switch between two buses
    result = create_branch(
        new_enm,
        {
            "ref_id": switch_ref,
            "name": payload.get("switch_name") or "Łącznik sekcyjny",
            "type": sw_type,
            "from_bus_ref": switch_bus_ref,
            "to_bus_ref": switch_bus2_ref,
            "status": normal_state,
            "source_mode": "KATALOG",
            "catalog_namespace": "APARAT_SN",
            "catalog_ref": switch_catalog_ref,
        },
    )
    if result.success:
        new_enm = result.enm
        created.append(switch_ref)

    # Right segment
    right_length = length_km * (1.0 - ratio)
    result = create_branch(
        new_enm,
        {
            "ref_id": seg_right_id,
            "name": f"Odcinek {seg_right_id}",
            "type": seg_type,
            "from_bus_ref": switch_bus2_ref,
            "to_bus_ref": to_bus_ref,
            "length_km": right_length,
            "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
            "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
            "catalog_ref": segment.get("catalog_ref"),
            "status": "closed",
        },
    )
    new_enm = result.enm
    created.append(seg_right_id)

    # Update corridor
    corridor = _find_corridor_for_segment(enm, segment_id)
    if corridor:
        for c in new_enm.get("corridors", []):
            if c.get("ref_id") == corridor.get("ref_id"):
                segments = c.get("ordered_segment_refs", [])
                if segment_id in segments:
                    idx_seg = segments.index(segment_id)
                    segments[idx_seg : idx_seg + 1] = [seg_left_id, switch_ref, seg_right_id]
                break

    return _response(
        new_enm,
        created=created,
        deleted=deleted,
        selection_id=switch_ref,
        selection_type="switch",
        events=events,
    )


# ---------------------------------------------------------------------------
# 6. connect_secondary_ring_sn
# ---------------------------------------------------------------------------


def connect_secondary_ring_sn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Zamknij pierścień SN.

    Wymaga jawnych from_bus_ref i to_bus_ref — brak auto-detekcji.
    """
    from_bus_ref = payload.get("from_bus_ref")
    to_bus_ref = payload.get("to_bus_ref")
    segment = payload.get("segment", {})

    if not from_bus_ref:
        return _error_response(
            "Brak szyny początkowej pierścienia (from_bus_ref). "
            "Kliknij dwa końce magistrali w SLD.",
            "ring.from_bus_missing",
        )
    if not to_bus_ref:
        return _error_response(
            "Brak szyny końcowej pierścienia (to_bus_ref). Kliknij dwa końce magistrali w SLD.",
            "ring.to_bus_missing",
        )

    bus_refs = {b.get("ref_id") for b in enm.get("buses", [])}
    if from_bus_ref not in bus_refs:
        return _error_response(f"Szyna '{from_bus_ref}' nie istnieje.", "ring.from_not_found")
    if to_bus_ref not in bus_refs:
        return _error_response(f"Szyna '{to_bus_ref}' nie istnieje.", "ring.to_not_found")

    seed = _compute_seed(
        {"op": "connect_secondary_ring_sn", "from": from_bus_ref, "to": to_bus_ref}
    )
    ring_ref = f"seg/{seed}/ring_closure"

    new_enm = copy.deepcopy(enm)
    created = []
    events = []
    ev_seq = 0

    rodzaj = segment.get("rodzaj", "KABEL")
    dlugosc_m = segment.get("dlugosc_m") or 0
    if dlugosc_m <= 0:
        return _error_response(
            "Brak długości segmentu zamknięcia pierścienia (dlugosc_m). Podaj jawną wartość > 0.",
            "ring.dlugosc_missing",
        )

    # Bramka katalogowa (ENM) — segment pierscienia WYMAGA catalog_ref
    ring_catalog_binding = segment.get("catalog_binding") or payload.get("catalog_binding")
    ring_catalog_ref = _resolve_catalog_ref(segment.get("catalog_ref"), ring_catalog_binding)
    if not ring_catalog_ref:
        return _error_response(
            "Segment zamknięcia pierścienia wymaga powiązania z katalogiem. "
            "Podaj catalog_ref lub catalog_binding w payload segmentu.",
            "catalog.ref_required",
        )

    branch_type = "cable" if rodzaj == "KABEL" else "line_overhead"
    ring_data: dict[str, Any] = {
        "ref_id": ring_ref,
        "name": payload.get("ring_name") or "Zamknięcie pierścienia",
        "type": branch_type,
        "from_bus_ref": from_bus_ref,
        "to_bus_ref": to_bus_ref,
        "length_km": dlugosc_m / 1000.0,
        "r_ohm_per_km": 0.0,
        "x_ohm_per_km": 0.0,
        "status": "closed",
    }
    materialization = _materialize_catalog_payload(
        catalog_ref=ring_catalog_ref,
        catalog_binding=ring_catalog_binding,
        default_namespace="KABEL_SN" if branch_type == "cable" else "LINIA_SN",
    )
    if isinstance(materialization, dict):
        return materialization
    binding_payload, materialized_params = materialization
    ring_data["catalog_ref"] = ring_catalog_ref
    _apply_catalog_metadata(
        ring_data,
        binding_payload,
        default_namespace="KABEL_SN" if branch_type == "cable" else "LINIA_SN",
    )
    _apply_materialized_branch_fields(ring_data, materialized_params)
    result = create_branch(new_enm, ring_data)
    if not result.success:
        return _error_response("Nie udało się zamknąć pierścienia.", "ring.creation_failed")
    new_enm = result.enm
    created.append(ring_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "RING_CONNECTED", "element_id": ring_ref})

    # Update corridor type
    for c in new_enm.get("corridors", []):
        c["corridor_type"] = "ring"
        break  # First corridor becomes ring

    return _response(
        new_enm, created=created, selection_id=ring_ref, selection_type="branch", events=events
    )


# ---------------------------------------------------------------------------
# 7. set_normal_open_point
# ---------------------------------------------------------------------------


def set_normal_open_point(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Ustaw punkt normalnie otwarty (NOP)."""
    switch_ref = payload.get("switch_ref") or payload.get("segment_ref")
    corridor_ref = payload.get("corridor_ref")

    if not switch_ref:
        return _error_response("Brak identyfikatora łącznika.", "nop.switch_missing")

    new_enm = copy.deepcopy(enm)
    updated = []
    events = []
    ev_seq = 0

    # Find and open switch
    found = False
    for b in new_enm.get("branches", []):
        if b.get("ref_id") == switch_ref:
            b["status"] = "open"
            found = True
            updated.append(switch_ref)
            break

    if not found:
        return _error_response(f"Łącznik '{switch_ref}' nie znaleziony.", "nop.switch_not_found")

    # Update corridor NOP
    if corridor_ref:
        for c in new_enm.get("corridors", []):
            if c.get("ref_id") == corridor_ref:
                c["no_point_ref"] = switch_ref
                updated.append(corridor_ref)
                break
    else:
        for c in new_enm.get("corridors", []):
            c["no_point_ref"] = switch_ref
            updated.append(c.get("ref_id", ""))
            break

    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "NOP_SET", "element_id": switch_ref})

    return _response(
        new_enm, updated=updated, selection_id=switch_ref, selection_type="switch", events=events
    )


# ---------------------------------------------------------------------------
# 8. add_transformer_sn_nn
# ---------------------------------------------------------------------------


def add_transformer_sn_nn(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaj transformator SN/nN."""
    hv_bus_ref = payload.get("hv_bus_ref")
    lv_bus_ref = payload.get("lv_bus_ref")

    if not hv_bus_ref or not lv_bus_ref:
        return _error_response("Brak szyn HV/LV.", "transformer.buses_missing")

    standalone_catalog = _require_catalog_ref(
        payload_ref=payload.get("transformer_catalog_ref"),
        payload_binding=payload.get("catalog_binding"),
        context_code="add_transformer_sn_nn",
    )
    if isinstance(standalone_catalog, dict):
        return standalone_catalog

    seed = _compute_seed({"op": "add_transformer_sn_nn", "hv": hv_bus_ref, "lv": lv_bus_ref})
    tr_ref = f"tr/{seed}/transformer"

    new_enm = copy.deepcopy(enm)
    created = []
    events = []
    ev_seq = 0

    # Napięcia z szyn (topologiczne), brak domyślnych parametrów
    hv_voltage = None
    lv_voltage = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == hv_bus_ref:
            hv_voltage = b.get("voltage_kv")
        if b.get("ref_id") == lv_bus_ref:
            lv_voltage = b.get("voltage_kv")

    tr_data: dict[str, Any] = {
        "device_type": "transformer",
        "ref_id": tr_ref,
        "name": "Transformator SN/nN",
        "hv_bus_ref": hv_bus_ref,
        "lv_bus_ref": lv_bus_ref,
        "sn_mva": payload.get("sn_mva") or 0.0,
        "uhv_kv": payload.get("uhv_kv") or hv_voltage or 0.0,
        "ulv_kv": payload.get("ulv_kv") or lv_voltage or 0.0,
        "uk_percent": payload.get("uk_percent") or 0.0,
        "pk_kw": payload.get("pk_kw") or 0.0,
        "source_mode": "KATALOG",
        "catalog_namespace": "TRAFO_SN_NN",
    }
    materialization = _materialize_catalog_payload(
        catalog_ref=standalone_catalog,
        catalog_binding=payload.get("catalog_binding"),
        default_namespace="TRAFO_SN_NN",
    )
    if isinstance(materialization, dict):
        return materialization
    binding_payload, materialized_params = materialization
    tr_data["catalog_ref"] = standalone_catalog
    _apply_catalog_metadata(
        tr_data,
        binding_payload,
        default_namespace="TRAFO_SN_NN",
    )
    _apply_materialized_transformer_fields(tr_data, materialized_params)

    # OLTC/DETC (V12K-048, G-TRF): materializuj kanoniczny TapChanger, gdy operator
    # zażądał regulacji. Reużycie proven helpera GPZ — każde pole mapuje na realne
    # pole TapChanger (zero fabrykacji). Strona regulowana domyślnie = szyna nN (LV).
    tap_changer = _build_gpz_tap_changer(payload, controlled_bus_ref=lv_bus_ref)
    if tap_changer is not None:
        # Kontrakt domenowy zaczepów sprawdzany PRZED zapisem (karta KD-3).
        blad_zaczepow = _blad_zaczepow(tap_changer)
        if blad_zaczepow is not None:
            return _error_response(
                f"Transformator {tr_ref} — {blad_zaczepow}", "transformer.tap_changer_invalid"
            )
        tr_data["tap_changer"] = tap_changer

    if payload.get("station_ref"):
        for sub in new_enm.get("substations", []):
            if sub.get("ref_id") == payload["station_ref"]:
                sub.setdefault("transformer_refs", []).append(tr_ref)
                break

    result = create_device(new_enm, tr_data)
    if not result.success:
        return _error_response(
            f"Nie udało się utworzyć transformatora: {result.issues[0].message_pl if result.issues else '?'}",
            "transformer.creation_failed",
        )
    new_enm = result.enm
    created.append(tr_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "TRANSFORMER_CREATED", "element_id": tr_ref})

    return _response(
        new_enm, created=created, selection_id=tr_ref, selection_type="transformer", events=events
    )


# ---------------------------------------------------------------------------
# 9. assign_catalog_to_element
# ---------------------------------------------------------------------------


def assign_catalog_to_element(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Przypisz katalog do elementu."""
    element_ref = payload.get("element_ref")
    legacy_field_collection = _find_legacy_field_element_collection(enm, element_ref or "")
    clear_catalog = "catalog_item_id" in payload and payload.get("catalog_item_id") is None
    catalog_binding = payload.get("catalog_binding")
    catalog_item_id_raw = payload.get("catalog_item_id")
    catalog_item_id = (
        catalog_item_id_raw
        or _extract_catalog_binding_item_id(catalog_binding)
        or payload.get("catalog_ref")
    )

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "catalog.element_missing")
    if not clear_catalog and not catalog_item_id:
        return _error_response("Brak identyfikatora katalogu.", "catalog.item_missing")

    if legacy_field_collection is not None:
        return _error_legacy_field_write_disabled(element_ref, legacy_field_collection)

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(
            f"Element '{element_ref}' nie znaleziony.", "catalog.element_not_found"
        )

    new_enm = copy.deepcopy(enm)
    coll, idx = loc
    target_element = new_enm[coll][idx]

    if clear_catalog:
        if _element_requires_catalog(coll, target_element):
            return _error_response(
                "Element techniczny nie może istnieć bez przypięcia katalogowego.",
                "catalog.clear_forbidden",
            )
        target_element["catalog_ref"] = None
        if "parameter_source" in target_element:
            target_element["parameter_source"] = None
        target_element.pop("catalog_namespace", None)
        target_element.pop("catalog_version", None)
        if coll == "branch_points":
            target_element["source_mode"] = "EKSPERCKI_RECZNY"
            target_element["materialized_params"] = None
            target_element["completeness_status"] = "BRAK_KATALOGU"
        else:
            target_element.pop("source_mode", None)
        meta = target_element.get("meta")
        if isinstance(meta, dict):
            meta.pop("catalog_item_version", None)
    else:
        target_element["catalog_ref"] = catalog_item_id
        target_element["parameter_source"] = "CATALOG"
        target_element["source_mode"] = payload.get("source_mode") or "KATALOG"

        catalog_namespace = (
            payload.get("catalog_namespace")
            or _extract_catalog_binding_namespace(catalog_binding)
            or _infer_catalog_namespace_for_element(target_element)
        )
        if catalog_namespace:
            target_element["catalog_namespace"] = catalog_namespace

        catalog_item_version = _extract_catalog_binding_version(catalog_binding) or payload.get(
            "catalog_item_version"
        )
        effective_catalog_version = (
            catalog_item_version.strip()
            if isinstance(catalog_item_version, str) and catalog_item_version.strip()
            else target_element.get("meta", {}).get("catalog_item_version")
        )
        if effective_catalog_version:
            target_element.setdefault("meta", {})[
                "catalog_item_version"
            ] = effective_catalog_version

        if (
            coll == "branches"
            and target_element.get("type") in {"cable", "line_overhead"}
            and catalog_namespace
        ):
            materialization = _materialize_catalog_payload(
                catalog_ref=catalog_item_id,
                catalog_binding={
                    "catalog_namespace": catalog_namespace,
                    "catalog_item_version": effective_catalog_version or "legacy",
                },
                default_namespace=catalog_namespace,
                default_version=effective_catalog_version,
            )
            if isinstance(materialization, dict):
                return materialization
            binding_payload, materialized_params = materialization
            _apply_catalog_metadata(
                target_element, binding_payload, default_namespace=catalog_namespace
            )
            _apply_materialized_branch_fields(target_element, materialized_params)

        if coll == "transformers" and catalog_namespace:
            materialization = _materialize_catalog_payload(
                catalog_ref=catalog_item_id,
                catalog_binding={
                    "catalog_namespace": catalog_namespace,
                    "catalog_item_version": effective_catalog_version or "legacy",
                },
                default_namespace=catalog_namespace,
                default_version=effective_catalog_version,
            )
            if isinstance(materialization, dict):
                return materialization
            binding_payload, materialized_params = materialization
            _apply_catalog_metadata(
                target_element, binding_payload, default_namespace=catalog_namespace
            )
            _apply_materialized_transformer_fields(target_element, materialized_params)

    return _response(
        new_enm,
        updated=[element_ref],
        selection_id=element_ref,
        events=[
            {
                "event_seq": 1,
                "event_type": "CATALOG_CLEARED" if clear_catalog else "CATALOG_ASSIGNED",
                "element_id": element_ref,
            }
        ],
    )


# ---------------------------------------------------------------------------
# 10. update_element_parameters
# ---------------------------------------------------------------------------


def update_element_parameters(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Aktualizuj parametry elementu."""
    element_ref = payload.get("element_ref")
    parameters = payload.get("parameters", {})
    legacy_field_collection = _find_legacy_field_element_collection(enm, element_ref or "")

    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "params.element_missing")
    if not parameters:
        return _error_response("Brak parametrów do aktualizacji.", "params.empty")

    if legacy_field_collection is not None:
        return _error_legacy_field_write_disabled(element_ref, legacy_field_collection)

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(
            f"Element '{element_ref}' nie znaleziony.", "params.element_not_found"
        )

    coll, idx = loc
    current_element = enm[coll][idx]

    generator_type = str(current_element.get("gen_type") or "").upper()
    generator_requires_catalog = coll == "generators" and generator_type in {
        "PV_INVERTER",
        "WIND_INVERTER",
        "BESS",
        "BESS_INVERTER",
    }
    catalog_guard_collections = {"branches", "transformers", "branch_points"}
    guarded_catalog_binding = coll in catalog_guard_collections or generator_requires_catalog
    if guarded_catalog_binding:
        if "catalog_ref" in parameters:
            catalog_ref = parameters.get("catalog_ref")
            if catalog_ref is None or (isinstance(catalog_ref, str) and not catalog_ref.strip()):
                return _error_response(
                    "Element fizyczny wymaga przypiętego katalogu.", "catalog.ref_required"
                )

        effective_source_mode = parameters.get("source_mode", current_element.get("source_mode"))
        effective_namespace = parameters.get(
            "catalog_namespace", current_element.get("catalog_namespace")
        )
        if effective_source_mode is not None or effective_namespace is not None:
            if effective_source_mode == "KATALOG" and not effective_namespace:
                return _error_response(
                    "Brak spójnego source_mode/catalog_namespace dla elementu fizycznego.",
                    "catalog.ref_required",
                )
            if effective_source_mode in {"MIGRACJA", "EKSPERCKI_RECZNY"} and effective_namespace:
                return _error_response(
                    "Brak spójnego source_mode/catalog_namespace dla elementu fizycznego.",
                    "catalog.ref_required",
                )

        if "materialized_params" in parameters:
            materialized = parameters.get("materialized_params")
            if effective_source_mode == "KATALOG":
                if not isinstance(materialized, dict) or not materialized:
                    return _error_response(
                        "materialized_params musi być kompletne dla source_mode=KATALOG.",
                        "catalog.ref_required",
                    )
                required_keys = {"branch_point_type", "parent_segment_id", "ports"}
                if coll == "branch_points" and not required_keys.issubset(materialized.keys()):
                    return _error_response(
                        "materialized_params dla punktu rozgałęzienia jest niekompletne.",
                        "catalog.ref_required",
                    )

    if coll in {"branches", "transformers", "branch_points", "generators", "substations"}:
        immutable_keys = {"ref_id", "id", "type"}
        allowlist_by_collection = {
            "branches": {
                "name",
                "status",
                "length_km",
                "r_ohm_per_km",
                "x_ohm_per_km",
                "b_siemens_per_km",
                "r0_ohm_per_km",
                "x0_ohm_per_km",
                "b0_siemens_per_km",
                "rating",
                "insulation",
                "catalog_ref",
                "parameter_source",
                "overrides",
                "meta",
                "source_mode",
                "catalog_namespace",
                "materialized_params",
            },
            "transformers": {
                "name",
                "sn_mva",
                "uhv_kv",
                "ulv_kv",
                "uk_percent",
                "pk_kw",
                "p0_kw",
                "i0_percent",
                "vector_group",
                "hv_neutral",
                "lv_neutral",
                "n_parallel",
                "tap_position",
                "tap_min",
                "tap_max",
                "tap_step_percent",
                # B-2 (karta KD-3): KANONICZNY podzespol zaczepow (V12K-045) —
                # do tej pory jedyne zrodlo prawdy o regulacji nie mialo zadnej
                # drogi zapisu poza operacja zrodla GPZ, wiec zaczepy
                # transformatora stacyjnego byly nieedytowalne. Dopisanie go tu
                # NIE tworzy pola rownoleglego: starsze `tap_*` zostaja dla
                # zgodnosci wstecznej, kanonem jest `tap_changer`.
                "tap_changer",
                "catalog_ref",
                "parameter_source",
                "overrides",
                "meta",
                "source_mode",
                "catalog_namespace",
                "materialized_params",
            },
            "branch_points": {
                "name",
                "switch_state",
                "catalog_ref",
                "catalog_namespace",
                "catalog_version",
                "source_mode",
                "materialized_params",
                "completeness_status",
                "runtime_inputs",
                "branch_occupied",
                "ports",
                "meta",
            },
            "generators": {
                "name",
                "p_mw",
                "q_mvar",
                "catalog_ref",
                "quantity",
                "n_parallel",
                "parameter_source",
                "overrides",
                "limits",
                "connection_variant",
                "blocking_transformer_ref",
                "station_ref",
                "meta",
                "in_service",
            },
            "substations": {
                "name",
                "entry_point_ref",
                "meta",
            },
        }
        illegal_keys = sorted(
            key
            for key in parameters
            if key not in immutable_keys and key not in allowlist_by_collection[coll]
        )
        if illegal_keys:
            return _error_response(
                f"Niedozwolone pola aktualizacji dla '{coll}': {', '.join(illegal_keys)}.",
                "params.key_not_allowed",
            )

    new_enm = copy.deepcopy(enm)
    for key, value in parameters.items():
        if key not in ("ref_id", "id", "type"):
            new_enm[coll][idx][key] = value

    return _response(
        new_enm,
        updated=[element_ref],
        selection_id=element_ref,
        events=[{"event_seq": 1, "event_type": "PARAMETERS_UPDATED", "element_id": element_ref}],
    )


# ---------------------------------------------------------------------------
# 11. delete_element
# ---------------------------------------------------------------------------


def delete_element(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Usuń element z modelu ENM wraz z deterministycznym cleanupem zależności."""
    element_ref = payload.get("element_ref")
    legacy_field_collection = _find_legacy_field_element_collection(enm, element_ref or "")
    if not element_ref:
        return _error_response("Brak identyfikatora elementu.", "delete.element_missing")
    if legacy_field_collection is not None:
        return _error_legacy_field_write_disabled(element_ref, legacy_field_collection)

    loc = _find_element(enm, element_ref)
    if not loc:
        return _error_response(
            f"Element '{element_ref}' nie znaleziony.", "delete.element_not_found"
        )

    new_enm = copy.deepcopy(enm)
    coll, idx = loc
    deleted_ids: list[str] = [element_ref]
    events: list[dict[str, Any]] = []

    def _delete_in_collection(collection: str, ref_id: str) -> bool:
        items = new_enm.get(collection, [])
        for item_idx, item in enumerate(items):
            if item.get("ref_id") == ref_id:
                del items[item_idx]
                return True
        return False

    # Cascade for bus deletion: remove dependent branches/transformers/sources/loads/generators.
    if coll == "buses":
        dependent_collections = [
            ("branches", ("from_bus_ref", "to_bus_ref")),
            ("transformers", ("hv_bus_ref", "lv_bus_ref")),
            ("sources", ("bus_ref",)),
            ("loads", ("bus_ref",)),
            ("generators", ("bus_ref",)),
        ]
        for dep_collection, dep_fields in dependent_collections:
            refs_to_delete: list[str] = []
            for item in new_enm.get(dep_collection, []):
                if any(item.get(field) == element_ref for field in dep_fields):
                    ref_id = item.get("ref_id")
                    if isinstance(ref_id, str):
                        refs_to_delete.append(ref_id)
            for dep_ref in sorted(refs_to_delete):
                if _delete_in_collection(dep_collection, dep_ref):
                    deleted_ids.append(dep_ref)

    # Delete requested element last (or immediately for non-bus collections).
    del new_enm[coll][idx]

    deleted_set = set(deleted_ids)
    deleted_branch_refs = {
        ref for ref in deleted_set if ref in {b.get("ref_id") for b in enm.get("branches", [])}
    }
    deleted_bus_refs = {
        ref for ref in deleted_set if ref in {b.get("ref_id") for b in enm.get("buses", [])}
    }
    deleted_transformer_refs = {
        ref for ref in deleted_set if ref in {t.get("ref_id") for t in enm.get("transformers", [])}
    }

    # Corridor cleanup for removed branches.
    if deleted_branch_refs:
        for corridor in new_enm.get("corridors", []):
            ordered = corridor.get("ordered_segment_refs")
            if isinstance(ordered, list):
                corridor["ordered_segment_refs"] = [
                    seg for seg in ordered if seg not in deleted_branch_refs
                ]
            no_point_ref = corridor.get("no_point_ref")
            if isinstance(no_point_ref, str) and no_point_ref in deleted_branch_refs:
                corridor["no_point_ref"] = None

    if deleted_branch_refs or deleted_bus_refs or deleted_transformer_refs:
        for sub in new_enm.get("substations", []):
            meta = sub.get("meta")
            if not isinstance(meta, dict):
                continue
            for key in ("field_specs", "nn_field_specs"):
                raw_specs = meta.get(key)
                if not isinstance(raw_specs, list):
                    continue
                filtered_specs: list[dict[str, Any]] = []
                for spec in raw_specs:
                    if not isinstance(spec, dict):
                        continue
                    if spec.get("bus_ref") in deleted_bus_refs:
                        continue
                    equipment_refs = [
                        ref
                        for ref in spec.get("equipment_refs", [])
                        if ref not in deleted_branch_refs and ref not in deleted_transformer_refs
                    ]
                    next_spec = copy.deepcopy(spec)
                    next_spec["equipment_refs"] = equipment_refs
                    filtered_specs.append(next_spec)
                meta[key] = filtered_specs

    # Cleanup references in station and branch-point structures.
    if deleted_bus_refs or deleted_transformer_refs:
        substations_to_delete: set[str] = set()
        for sub in new_enm.get("substations", []):
            sub_ref = sub.get("ref_id")
            sub_bus_ref = sub.get("bus_ref")
            sub_tr_refs = sub.get("transformer_refs") or []
            has_deleted_transformer = any(ref in deleted_transformer_refs for ref in sub_tr_refs)
            if sub_bus_ref in deleted_bus_refs or has_deleted_transformer:
                if isinstance(sub_ref, str):
                    substations_to_delete.add(sub_ref)

        if substations_to_delete:
            new_enm["substations"] = [
                sub
                for sub in new_enm.get("substations", [])
                if sub.get("ref_id") not in substations_to_delete
            ]
            new_enm["bays"] = [
                bay
                for bay in new_enm.get("bays", [])
                if bay.get("substation_ref") not in substations_to_delete
            ]
            deleted_set.update(substations_to_delete)

    if deleted_branch_refs or deleted_bus_refs:
        branch_points_to_delete: set[str] = set()
        for bp in new_enm.get("branch_points", []):
            bp_ref = bp.get("ref_id")
            if (
                bp.get("parent_segment_id") in deleted_branch_refs
                or bp.get("bus_ref") in deleted_bus_refs
            ):
                if isinstance(bp_ref, str):
                    branch_points_to_delete.add(bp_ref)
                continue

            branch_occupied = bp.get("branch_occupied")
            if isinstance(branch_occupied, dict):
                bp["branch_occupied"] = {
                    key: value
                    for key, value in branch_occupied.items()
                    if value not in deleted_branch_refs
                }

        if branch_points_to_delete:
            new_enm["branch_points"] = [
                bp
                for bp in new_enm.get("branch_points", [])
                if bp.get("ref_id") not in branch_points_to_delete
            ]
            deleted_set.update(branch_points_to_delete)

    deleted_ids = sorted(deleted_set)
    for event_seq, ref in enumerate(deleted_ids, start=1):
        events.append({"event_seq": event_seq, "event_type": "ELEMENT_DELETED", "element_id": ref})

    return _response(
        new_enm,
        deleted=deleted_ids,
        selection_id=None,
        events=events,
    )


# ---------------------------------------------------------------------------
# refresh_snapshot — odczyt bez modyfikacji
# ---------------------------------------------------------------------------


def refresh_snapshot(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Zwróć pełną kopertę odpowiedzi bez modyfikacji modelu.

    Używane przez frontend po operacjach Wizard (PUT /enm) lub Topology
    w celu synchronizacji snapshotStore z bieżącym stanem ENM.
    Operacja nie mutuje ENM — zwraca readiness, logical_views, fix_actions.
    """
    return _response(enm)


# ---------------------------------------------------------------------------
# Phase 0B-3: CRUD GPZ sekcji (LV i HV) dla StationCard editora
# ---------------------------------------------------------------------------


def _resolve_gpz_sections_field(side: str) -> str:
    """`side` ('lv'/'hv') → klucz w substation. Inny side → ValueError."""
    if side == "lv":
        return "gpz_sections"
    if side == "hv":
        return "gpz_hv_sections"
    raise ValueError(f"Nieprawidłowa strona sekcji GPZ: '{side}' (oczekiwane: 'lv'|'hv').")


def _find_substation(enm: dict[str, Any], substation_ref: str) -> dict[str, Any] | None:
    for sub in enm.get("substations", []):
        if sub.get("ref_id") == substation_ref:
            return sub
    return None


def add_gpz_section(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Dodaje GPZ sekcję (LV lub HV) do istniejącej stacji typu 'gpz'.

    Payload:
      substation_ref: str        — ID stacji GPZ
      side: 'lv' | 'hv'          — która strona (default 'lv')
      section_id: str            — kanoniczny ID nowej sekcji (unikalny w substation)
      bus_ref: str               — ref_id istniejącej szyny pod sekcją
      order: int (optional)      — pozycja w sekcjach (default = max+1)
      name: str (optional)       — etykieta sekcji
      line_field_name: str (optional)
    """
    substation_ref = payload.get("substation_ref")
    if not substation_ref:
        return _error_response("Brak identyfikatora stacji.", "gpz_section.add.substation_missing")
    sub = _find_substation(enm, substation_ref)
    if sub is None:
        return _error_response(
            f"Stacja '{substation_ref}' nie istnieje.", "gpz_section.add.substation_missing"
        )
    if sub.get("station_type") != "gpz":
        return _error_response(
            f"Stacja '{substation_ref}' nie jest typu 'gpz' (jest {sub.get('station_type')}).",
            "gpz_section.add.invalid_station_type",
        )

    side = payload.get("side", "lv")
    try:
        sections_field = _resolve_gpz_sections_field(side)
    except ValueError as exc:
        return _error_response(str(exc), "gpz_section.add.invalid_side")

    section_id = payload.get("section_id")
    if not section_id:
        return _error_response(
            "Brak `section_id` dla nowej sekcji.", "gpz_section.add.section_id_missing"
        )

    bus_ref = payload.get("bus_ref")
    if not bus_ref:
        return _error_response(
            "Brak `bus_ref` dla nowej sekcji.", "gpz_section.add.bus_ref_missing"
        )
    if not any(b.get("ref_id") == bus_ref for b in enm.get("buses", [])):
        return _error_response(
            f"Szyna '{bus_ref}' nie istnieje.", "gpz_section.add.bus_ref_missing"
        )

    existing = list(sub.get(sections_field) or [])
    if any(s.get("section_id") == section_id for s in existing):
        return _error_response(
            f"Sekcja '{section_id}' już istnieje w {side.upper()}.",
            "gpz_section.add.duplicate_section_id",
        )

    order = payload.get("order")
    if order is None:
        order = max((s.get("order", 0) for s in existing), default=0) + 1

    new_section: dict[str, Any] = {
        "section_id": section_id,
        "order": int(order),
        "bus_ref": bus_ref,
    }
    if payload.get("name"):
        new_section["name"] = payload["name"]
    if payload.get("line_field_name"):
        new_section["line_field_name"] = payload["line_field_name"]

    new_enm = copy.deepcopy(enm)
    new_sub = _find_substation(new_enm, substation_ref)
    assert new_sub is not None  # already checked
    new_sections = list(new_sub.get(sections_field) or [])
    new_sections.append(new_section)
    # Sort deterministycznie po order, potem section_id (dla stabilności gdy order kolizja).
    new_sections.sort(key=lambda s: (s.get("order", 0), s.get("section_id", "")))
    new_sub[sections_field] = new_sections

    audit = [
        {
            "step": 1,
            "action": f"Dodano sekcj? {side.upper()} '{section_id}' do stacji {substation_ref}",
            "element_id": section_id,
        }
    ]
    events = [{"event_seq": 1, "event_type": "GPZ_SECTION_ADDED", "element_id": section_id}]
    return _response(
        new_enm,
        created=[section_id],
        selection_id=substation_ref,
        selection_type="substation",
        audit=audit,
        events=events,
    )


def update_gpz_section(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Aktualizuje istniejącą sekcję GPZ (jej name, order, bus_ref, *_coupler_ref).

    Payload:
      substation_ref: str
      side: 'lv' | 'hv' (default 'lv')
      section_id: str            — ID sekcji do aktualizacji
      updates: dict              — pola do zmiany (name/order/bus_ref/left_coupler_ref/right_coupler_ref/line_field_name)

    Pola NIE w `updates` pozostają niezmienione. `section_id` NIE może być
    zmieniony (immutable identyfikator).
    """
    substation_ref = payload.get("substation_ref")
    section_id = payload.get("section_id")
    if not substation_ref or not section_id:
        return _error_response(
            "Brak `substation_ref` lub `section_id`.",
            "gpz_section.update.identifier_missing",
        )
    sub = _find_substation(enm, substation_ref)
    if sub is None:
        return _error_response(
            f"Stacja '{substation_ref}' nie istnieje.",
            "gpz_section.update.substation_missing",
        )
    side = payload.get("side", "lv")
    try:
        sections_field = _resolve_gpz_sections_field(side)
    except ValueError as exc:
        return _error_response(str(exc), "gpz_section.update.invalid_side")

    existing_sections = sub.get(sections_field) or []
    if not any(s.get("section_id") == section_id for s in existing_sections):
        return _error_response(
            f"Sekcja '{section_id}' nie istnieje w {side.upper()}.",
            "gpz_section.update.section_missing",
        )

    updates = payload.get("updates") or {}
    # Whitelist pól do aktualizacji (section_id NIE jest tu — immutable).
    allowed_keys = {
        "name",
        "order",
        "bus_ref",
        "left_coupler_ref",
        "right_coupler_ref",
        "line_field_name",
    }
    rejected = [k for k in updates.keys() if k not in allowed_keys]
    if rejected:
        return _error_response(
            f"Niedozwolone klucze updates: {rejected}. Dozwolone: {sorted(allowed_keys)}.",
            "gpz_section.update.disallowed_keys",
        )
    if "bus_ref" in updates:
        if not any(b.get("ref_id") == updates["bus_ref"] for b in enm.get("buses", [])):
            return _error_response(
                f"Szyna '{updates['bus_ref']}' nie istnieje.",
                "gpz_section.update.bus_ref_missing",
            )

    new_enm = copy.deepcopy(enm)
    new_sub = _find_substation(new_enm, substation_ref)
    assert new_sub is not None
    new_sections = list(new_sub.get(sections_field) or [])
    for sec in new_sections:
        if sec.get("section_id") == section_id:
            for key, value in updates.items():
                # Allow None to clear optional fields (np. usuń coupler).
                if value is None:
                    sec.pop(key, None)
                else:
                    sec[key] = value
            break
    new_sections.sort(key=lambda s: (s.get("order", 0), s.get("section_id", "")))
    new_sub[sections_field] = new_sections

    audit = [
        {
            "step": 1,
            "action": f"Zaktualizowano sekcj? {side.upper()} '{section_id}'",
            "element_id": section_id,
        }
    ]
    events = [{"event_seq": 1, "event_type": "GPZ_SECTION_UPDATED", "element_id": section_id}]
    return _response(
        new_enm,
        updated=[section_id],
        selection_id=substation_ref,
        selection_type="substation",
        audit=audit,
        events=events,
    )


def delete_gpz_section(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Usuwa sekcj? GPZ ze stacji.

    Walidacja:
      - sekcja musi istnie?
      - żadne `bay.gpz_section_id` w ENM nie może wskazywać na usuwaną sekcję
        (operator musi najpierw przepi??/usun?? pola)

    Payload:
      substation_ref: str
      side: 'lv' | 'hv' (default 'lv')
      section_id: str
    """
    substation_ref = payload.get("substation_ref")
    section_id = payload.get("section_id")
    if not substation_ref or not section_id:
        return _error_response(
            "Brak `substation_ref` lub `section_id`.",
            "gpz_section.delete.identifier_missing",
        )
    sub = _find_substation(enm, substation_ref)
    if sub is None:
        return _error_response(
            f"Stacja '{substation_ref}' nie istnieje.",
            "gpz_section.delete.substation_missing",
        )
    side = payload.get("side", "lv")
    try:
        sections_field = _resolve_gpz_sections_field(side)
    except ValueError as exc:
        return _error_response(str(exc), "gpz_section.delete.invalid_side")

    existing_sections = sub.get(sections_field) or []
    if not any(s.get("section_id") == section_id for s in existing_sections):
        return _error_response(
            f"Sekcja '{section_id}' nie istnieje w {side.upper()}.",
            "gpz_section.delete.section_missing",
        )

    # Walidacja: czy nie ma pól odwołujących się do tej sekcji?
    bays_using_section = [
        bay.get("ref_id")
        for bay in enm.get("bays", [])
        if bay.get("substation_ref") == substation_ref and bay.get("gpz_section_id") == section_id
    ]
    if bays_using_section:
        return _error_response(
            f"Nie można usunąć sekcji '{section_id}': używana przez pola {bays_using_section}. "
            "Najpierw przepi??/usun?? pola.",
            "gpz_section.delete.in_use",
        )

    new_enm = copy.deepcopy(enm)
    new_sub = _find_substation(new_enm, substation_ref)
    assert new_sub is not None
    new_sections = [
        s for s in (new_sub.get(sections_field) or []) if s.get("section_id") != section_id
    ]
    new_sub[sections_field] = new_sections

    audit = [
        {
            "step": 1,
            "action": f"Usunięto sekcję {side.upper()} '{section_id}'",
            "element_id": section_id,
        }
    ]
    events = [{"event_seq": 1, "event_type": "GPZ_SECTION_DELETED", "element_id": section_id}]
    return _response(
        new_enm,
        deleted=[section_id],
        selection_id=substation_ref,
        selection_type="substation",
        audit=audit,
        events=events,
    )


# ---------------------------------------------------------------------------
# Phase 0B: append_station_on_endpoint (operator-grade SLD plan v2)
# ---------------------------------------------------------------------------


def _find_endpoint_bus_for_run(enm: dict[str, Any], run_ref: str) -> str | None:
    """Znajduje końcową szynę (terminal) dla LineRun po `run_ref`.

    Heurystyka: corridor.ordered_segment_refs[-1].to_bus_ref jeśli to terminal
    (helper_bus albo brak innych podłączeń niż via to_bus_ref).
    """
    for corridor in enm.get("corridors", []):
        if corridor.get("ref_id") == run_ref:
            ordered = corridor.get("ordered_segment_refs", [])
            if not ordered:
                return None
            last_seg_ref = ordered[-1]
            for branch in enm.get("branches", []):
                if branch.get("ref_id") == last_seg_ref:
                    return branch.get("to_bus_ref")
    return None


def _bus_is_free_terminal(enm: dict[str, Any], bus_ref: str) -> bool:
    """Czy szyna jest wolnym terminalem (helper_bus + topology_terminal)?

    Wolny terminal = nie jest przypisany do żadnej Substation (poza GPZ),
    nie ma innych branch wychodzących, ma tag 'topology_terminal'.
    """
    bus = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == bus_ref:
            bus = b
            break
    if not bus:
        return False
    tags = bus.get("tags", []) or []
    if "topology_terminal" not in tags and "helper_bus" not in tags:
        # Bez tagów helper — sprawdź czy nie jest już końcówką stacji.
        for sub in enm.get("substations", []):
            if bus_ref in (sub.get("bus_refs") or []):
                return False
    # Ma terminal? Sprawdź ile branchów go ma jako endpoint.
    inbound = sum(
        1
        for b in enm.get("branches", [])
        if b.get("from_bus_ref") == bus_ref or b.get("to_bus_ref") == bus_ref
    )
    # Wolny terminal = dokładnie 1 branch dochodzi do niego (poprzedni segment).
    return inbound <= 1


def append_station_on_endpoint(enm: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    """Phase 0B: addytywna operacja — dodaj stację na końcu istniejącego ciągu.

    Workflow operator-grade SLD plan v2: endpoint bay/segment → terminate
    in station (bez rozcinania). Naturalny flow inżyniera: zakończ ciąg w
    stacji zamiast dzielić odcinek w środku.

    Payload:
      endpoint_bus_ref: str    — terminal helper_bus na końcu segmentu (lub
                                 użyj run_ref do auto-detekcji)
      run_ref: str (opcjonalny) — ID corridor/LineRun (zamiast endpoint_bus_ref)
      station_type: 'inline' | 'branch' | 'terminal' | 'sectional' | 'mv_lv'
      station: { name, station_type, sn_voltage_kv?, nn_voltage_kv }
      transformer: { transformer_catalog_ref } (opcjonalny)
      nn_voltage_kv: float (opcjonalny — domyślnie z station.nn_voltage_kv)
      dry_run: bool (Phase 0C-style preview)

    Determinizm: stacja generuje stabilny ID z seed = endpoint_bus_ref + station.name.
    Operacja addytywna — nie modyfikuje istniejących Bus, Branch ani innych
    Substation. Endpoint_bus staje się pierwszą szyną SN nowej stacji.
    """
    dry_run = bool(payload.get("dry_run", False))
    endpoint_bus_ref = payload.get("endpoint_bus_ref")
    run_ref = payload.get("run_ref")
    station_payload = payload.get("station", {})
    station_name = station_payload.get("name") or payload.get("station_name") or "Nowa stacja"
    transformer_payload = payload.get("transformer") or {}
    # nn_voltage_kv: explicit z payload (None → fallback 0.4; 0 → walidacja niżej rzuca błąd)
    nn_voltage_raw = station_payload.get("nn_voltage_kv")
    if nn_voltage_raw is None:
        nn_voltage_raw = payload.get("nn_voltage_kv")
    nn_voltage_kv = nn_voltage_raw if nn_voltage_raw is not None else 0.4

    # Step 0: walidacja wejścia
    if not endpoint_bus_ref and run_ref:
        endpoint_bus_ref = _find_endpoint_bus_for_run(enm, run_ref)
    if not endpoint_bus_ref:
        return _error_response(
            "Brak identyfikatora terminala. Podaj `endpoint_bus_ref` lub `run_ref` "
            "z istniejącym corridor.",
            "station.append.endpoint_missing",
        )

    # Walidacja: bus istnieje
    endpoint_bus = None
    for b in enm.get("buses", []):
        if b.get("ref_id") == endpoint_bus_ref:
            endpoint_bus = b
            break
    if not endpoint_bus:
        return _error_response(
            f"Szyna '{endpoint_bus_ref}' nie istnieje.",
            "station.append.endpoint_not_found",
        )

    # Walidacja: bus jest wolnym terminalem (nie podłączony do innej Substation)
    if not _bus_is_free_terminal(enm, endpoint_bus_ref):
        return _error_response(
            f"Szyna '{endpoint_bus_ref}' nie jest wolnym terminalem — "
            "jest już podłączona do innej stacji lub ma więcej niż 1 segment.",
            "station.append.endpoint_not_free",
        )

    # Walidacja: voltage compat
    sn_voltage_kv = endpoint_bus.get("voltage_kv")
    if not sn_voltage_kv or sn_voltage_kv <= 0:
        return _error_response(
            f"Szyna '{endpoint_bus_ref}' nie ma napięcia znamionowego.",
            "station.append.voltage_missing",
        )

    # B-4/B-5: oznaczenie i typ konstrukcji stacji (addytywne pola tożsamości).
    station_identity, identity_error = _station_identity_fields(station_payload, payload)
    if identity_error is not None:
        return identity_error

    if nn_voltage_kv <= 0:
        return _error_response(
            "Brak napięcia nN stacji. Podaj `nn_voltage_kv` > 0.",
            "station.append.nn_voltage_missing",
        )

    # Walidacja station_type
    station_type_raw = (
        station_payload.get("station_type") or payload.get("station_type") or "terminal"
    )
    semantic_to_substation = {
        "inline": "inline",
        "branch": "branch",
        "terminal": "mv_lv",
        "sectional": "sectional",
        "mv_lv": "mv_lv",
        "A": "mv_lv",
        "B": "inline",
        "C": "branch",
        "D": "sectional",
    }
    substation_type = semantic_to_substation.get(station_type_raw)
    if not substation_type:
        return _error_response(
            f"Typ stacji '{station_type_raw}' nieprawidłowy. "
            "Wymagane: inline, branch, terminal, sectional, mv_lv lub A-D.",
            "station.append.station_type_invalid",
        )

    # Step 1: deterministic seed
    seed = _compute_seed(
        {
            "op": "append_station_on_endpoint",
            "endpoint_bus": endpoint_bus_ref,
            "station_name": station_name,
            "station_type": substation_type,
        }
    )
    substation_ref = f"sub/{seed}/substation"
    bus_nn_ref = f"bus/{seed}/nn"
    bay_in_ref = f"bay/{seed}/in"
    bay_tr_ref = f"bay/{seed}/tr"
    transformer_ref = f"tr/{seed}/transformer"
    sn_fields_payload = payload.get("sn_fields")
    raw_sn_fields = sn_fields_payload if isinstance(sn_fields_payload, list) else []
    sn_fields: list[dict[str, Any]] = [field for field in raw_sn_fields if isinstance(field, dict)]
    sn_field_role_to_bay_role = {
        "LINIA_IN": "IN",
        "LINIA_OUT": "OUT",
        "LINIA_ODG": "FEEDER",
        "TRANSFORMATOROWE": "TR",
        "SPRZEGLO": "COUPLER",
    }
    # PS-4: wspólny resolver kodów zabezpieczeń pól (parytet z insert/add_sn_bay).
    from enm.domain_operations_v2 import _resolve_bay_template_protection_codes

    field_role_counts: dict[str, int] = {}
    field_specs: list[dict[str, Any]] = []
    # B-3: wyposażenie pól z payloadu — zakładane w TEJ SAMEJ migawce co stacja.
    wyposazenie_pol: list[tuple[str, str, dict[str, Any]]] = []
    for index, field in enumerate(sn_fields, start=1):
        field_role = str(field.get("field_role") or "").strip()
        bay_role = sn_field_role_to_bay_role.get(field_role)
        if not bay_role:
            continue
        field_role_counts[field_role] = field_role_counts.get(field_role, 0) + 1
        role_index = field_role_counts[field_role]
        if field_role == "LINIA_IN" and role_index == 1:
            bay_ref = bay_in_ref
        elif field_role == "TRANSFORMATOROWE" and role_index == 1:
            bay_ref = bay_tr_ref
        else:
            bay_ref = f"bay/{seed}/{field_role.lower()}_{role_index}"
        field_manufacturer_ref = field.get("manufacturer_ref")
        field_bay_template_ref = field.get("bay_template_ref")
        wyposazenie_pola = _wyposazenie_pola_z_wpisu(field)
        if wyposazenie_pola:
            wyposazenie_pol.append((f"field/{seed}/{index}", field_role, wyposazenie_pola))
        field_specs.append(
            {
                "field_ref": f"field/{seed}/{index}",
                "bay_ref": bay_ref,
                "field_role": field_role,
                "bay_role": bay_role,
                "bus_ref": endpoint_bus_ref,
                "bay_kind": field.get("bay_kind"),
                "manufacturer_ref": field_manufacturer_ref,
                "switchgear_family_ref": field.get("switchgear_family_ref"),
                "bay_template_ref": field_bay_template_ref,
                "protection_codes": _resolve_bay_template_protection_codes(
                    field_manufacturer_ref, field_bay_template_ref, bay_role
                ),
                "source_status": field.get("source_status"),
                "source_refs": list(field.get("source_refs") or []),
                "catalog_bindings": field.get("catalog_bindings"),
                "equipment_refs": [
                    ref
                    for ref in field.get("equipment_refs", [])
                    if isinstance(ref, str) and ref.strip()
                ],
                "meta": {
                    "created_by": "append_station_on_endpoint",
                    "terminal_bus_ref": endpoint_bus_ref,
                },
            }
        )

    def _field_spec_for_role(role: str) -> dict[str, Any] | None:
        for spec in field_specs:
            if spec.get("field_role") == role:
                return spec
        return None

    def _field_spec_for_bay_ref(bay_ref: str) -> dict[str, Any] | None:
        for spec in field_specs:
            if spec.get("bay_ref") == bay_ref:
                return spec
        return None

    def _ensure_field_spec(
        *,
        field_role: str,
        bay_role: str,
        bay_ref: str,
        field_ref: str,
        bay_kind: str,
    ) -> dict[str, Any]:
        existing = _field_spec_for_role(field_role)
        if existing:
            return existing
        spec = {
            "field_ref": field_ref,
            "bay_ref": bay_ref,
            "field_role": field_role,
            "bay_role": bay_role,
            "bay_kind": bay_kind,
            "manufacturer_ref": station_payload.get("switchgear", {}).get("manufacturer_ref"),
            "switchgear_family_ref": station_payload.get("switchgear", {}).get(
                "switchgear_family_ref"
            ),
            "bay_template_ref": None,
            "source_status": "catalog_solution",
            "source_refs": [],
            "catalog_bindings": None,
            "bus_ref": endpoint_bus_ref,
            "equipment_refs": [],
            "meta": {
                "created_by": "append_station_on_endpoint",
                "terminal_bus_ref": endpoint_bus_ref,
            },
        }
        field_specs.append(spec)
        return spec

    _ensure_field_spec(
        field_role="LINIA_IN",
        bay_role="IN",
        bay_ref=bay_in_ref,
        field_ref=f"field/{seed}/in",
        bay_kind="liniowe_doplywowe",
    )

    transformer_catalog_ref = transformer_payload.get(
        "transformer_catalog_ref"
    ) or transformer_payload.get("catalog_ref")
    if transformer_catalog_ref:
        _ensure_field_spec(
            field_role="TRANSFORMATOROWE",
            bay_role="TR",
            bay_ref=bay_tr_ref,
            field_ref=f"field/{seed}/tr",
            bay_kind="transformatorowe",
        )

    def _materialize_sn_field_apparatus(
        *,
        spec: dict[str, Any] | None,
        bay_ref: str,
        bay_role: str,
        field_role: str,
        ordinal: int,
    ) -> tuple[Any | None, list[str]]:
        if spec is None:
            return None, []
        spec["bus_ref"] = endpoint_bus_ref
        spec_meta = spec.setdefault("meta", {})
        if isinstance(spec_meta, dict):
            spec_meta.setdefault("created_by", "append_station_on_endpoint")
            spec_meta["terminal_bus_ref"] = endpoint_bus_ref
            spec_meta["bay_ref"] = bay_ref
        equipment_refs = [
            ref for ref in spec.get("equipment_refs", []) if isinstance(ref, str) and ref.strip()
        ]
        if equipment_refs:
            return None, equipment_refs

        # B-12: aparat pola SN WYŁĄCZNIE z jawnego wskazania (katalog APARAT_SN).
        apparatus_catalog_ref = _sn_field_apparatus_catalog_ref(
            spec, _payload_field_apparatus_catalog_ref(payload)
        )
        if apparatus_catalog_ref is None:
            return (
                _field_apparatus_missing_error(
                    index=ordinal - 1,
                    field_role=field_role,
                    code="station.append.field_apparatus_ref_missing",
                ),
                [],
            )

        terminal_ref = _make_id("bus", seed, f"sn_field_terminal/{ordinal:03d}")
        apparatus_ref = _make_id("stn", seed, f"sn_field_apparatus/{ordinal:03d}")
        terminal_result = create_node(
            new_enm,
            {
                "ref_id": terminal_ref,
                "name": f"Zacisk pola SN {ordinal}",
                "voltage_kv": sn_voltage_kv,
                "tags": ["helper_bus", "field_terminal"],
                "meta": {
                    "visual_role": "FIELD_TERMINAL",
                    "render_on_sld": False,
                    "show_in_project_tree": False,
                    "field_ref": spec.get("field_ref"),
                    "bay_ref": bay_ref,
                    "station_ref": substation_ref,
                },
            },
        )
        if not terminal_result.success:
            return (
                _error_response(
                    "Nie udało się utworzyć zacisku technicznego pola SN.",
                    "station.append.field_terminal_failed",
                ),
                [],
            )

        apparatus_kind = "bus_coupler" if bay_role == "COUPLER" else "breaker"
        apparatus_result = create_branch(
            terminal_result.enm,
            {
                "ref_id": apparatus_ref,
                "name": f"Aparat pola SN {ordinal}",
                "type": apparatus_kind,
                "from_bus_ref": endpoint_bus_ref,
                "to_bus_ref": terminal_ref,
                "status": "closed",
                "r_ohm": 0.0,
                "x_ohm": 0.0,
                "catalog_ref": apparatus_catalog_ref,
                "catalog_namespace": "APARAT_SN",
                "tags": ["station_field_device"],
                "meta": {
                    "field_ref": spec.get("field_ref"),
                    "bay_ref": bay_ref,
                    "station_ref": substation_ref,
                    "field_role": field_role,
                    "bay_role": bay_role,
                    "render_on_sld": False,
                    "show_in_project_tree": False,
                    "requires_catalog_binding": False,
                    # Komunikat opisuje STAN RZECZYWISTY (B-12).
                    "catalog_message": (
                        "Aparat pola SN z jawnie wskazanej pozycji katalogu APARAT_SN: "
                        f"{apparatus_catalog_ref}."
                    ),
                },
            },
        )
        if not apparatus_result.success:
            return (
                _error_response(
                    "Nie udało się utworzyć aparatu pola SN.",
                    "station.append.field_apparatus_failed",
                ),
                [],
            )

        created.append(terminal_ref)
        created.append(apparatus_ref)
        spec["equipment_refs"] = [apparatus_ref]
        if isinstance(spec.get("meta"), dict):
            spec["meta"]["apparatus_ref"] = apparatus_ref
            spec["meta"]["field_terminal_bus_ref"] = terminal_ref
        return apparatus_result, [apparatus_ref]

    # Dry-run: deepcopy, zwracamy preview metadata
    new_enm = copy.deepcopy(enm)
    created: list[str] = []
    events: list[dict[str, Any]] = []
    audit: list[dict[str, Any]] = []
    ev_seq = 0

    # Step 2: utworzenie Substation
    new_substation = {
        "ref_id": substation_ref,
        "name": station_name,
        "station_type": substation_type,
        "bus_refs": [endpoint_bus_ref],
        "transformer_refs": [],
        "tags": [],
        **station_identity,
        "meta": {
            "created_by": "append_station_on_endpoint",
            "station_type_semantic": station_type_raw,
            "switchgear": station_payload.get("switchgear") or payload.get("switchgear") or {},
            "field_specs": field_specs,
        },
    }
    new_enm.setdefault("substations", []).append(new_substation)
    created.append(substation_ref)
    ev_seq += 1
    events.append(
        {
            "event_seq": ev_seq,
            "event_type": "STATION_CREATED",
            "element_id": substation_ref,
        }
    )

    # Step 3: Bay(IN) wskazujący na endpoint_bus
    bay_in_spec = _field_spec_for_bay_ref(bay_in_ref) or _field_spec_for_role("LINIA_IN")
    bay_in_materialization, bay_in_equipment_refs = _materialize_sn_field_apparatus(
        spec=bay_in_spec,
        bay_ref=bay_in_ref,
        bay_role="IN",
        field_role="LINIA_IN",
        ordinal=1,
    )
    if isinstance(bay_in_materialization, dict):
        return bay_in_materialization
    if bay_in_materialization is not None:
        new_enm = bay_in_materialization.enm
        new_substation = next(
            substation
            for substation in new_enm.get("substations", [])
            if substation.get("ref_id") == substation_ref
        )

    new_bay_in = {
        "ref_id": bay_in_ref,
        "name": f"Pole IN — {station_name}",
        "bay_role": "IN",
        "substation_ref": substation_ref,
        "bus_ref": endpoint_bus_ref,
        "equipment_refs": bay_in_equipment_refs,
        "tags": [],
        "meta": {"sn_field_template": bay_in_spec},
    }
    new_enm.setdefault("bays", []).append(new_bay_in)
    created.append(bay_in_ref)
    ev_seq += 1
    events.append(
        {
            "event_seq": ev_seq,
            "event_type": "FIELDS_CREATED_SN",
            "element_id": bay_in_ref,
        }
    )

    # Step 4: opcjonalny Transformator + Bus nN + Bay(TR)
    transformer_catalog_ref = transformer_payload.get(
        "transformer_catalog_ref"
    ) or transformer_payload.get("catalog_ref")
    if transformer_catalog_ref:
        # Bus nN
        bus_nn = {
            "ref_id": bus_nn_ref,
            "name": f"Szyna nN {station_name}",
            "voltage_kv": nn_voltage_kv,
            "phase_system": "3ph",
            "tags": [],
            "meta": {"substation_ref": substation_ref},
        }
        new_enm.setdefault("buses", []).append(bus_nn)
        new_substation["bus_refs"].append(bus_nn_ref)
        created.append(bus_nn_ref)
        ev_seq += 1
        events.append(
            {
                "event_seq": ev_seq,
                "event_type": "BUS_NN_CREATED",
                "element_id": bus_nn_ref,
            }
        )

        # Transformator SN/nN
        transformer = {
            "ref_id": transformer_ref,
            "name": f"TR {station_name}",
            "hv_bus_ref": endpoint_bus_ref,
            "lv_bus_ref": bus_nn_ref,
            "uhv_kv": sn_voltage_kv,
            "ulv_kv": nn_voltage_kv,
            "sn_mva": transformer_payload.get("sn_mva", 0.0),
            "uk_percent": transformer_payload.get("uk_percent", 0.0),
            "pk_kw": transformer_payload.get("pk_kw", 0.0),
            "catalog_ref": transformer_catalog_ref,
            "catalog_namespace": "TRAFO_SN_NN",
            "source_mode": "KATALOG",
            "tags": [],
            "meta": {},
        }
        # Materializacja z katalogu (ujednolicony wzorzec)
        materialization = _materialize_catalog_payload(
            catalog_ref=transformer_catalog_ref,
            catalog_binding=transformer_payload.get("catalog_binding"),
            default_namespace="TRAFO_SN_NN",
        )
        if not isinstance(materialization, dict):
            binding_payload, materialized_params = materialization
            _apply_catalog_metadata(transformer, binding_payload, default_namespace="TRAFO_SN_NN")
            _apply_materialized_transformer_fields(transformer, materialized_params)
        # Uziemienie punktu neutralnego — PARYTET z insert (G-STK-1).
        _apply_station_neutral_grounding(
            transformer, payload, station=substation_ref, new_enm=new_enm
        )
        # Praca równoległa transformatorów — PARYTET z insert (G-STK-6).
        _apply_transformer_parallelism(transformer, transformer_payload)
        new_enm.setdefault("transformers", []).append(transformer)
        new_substation["transformer_refs"].append(transformer_ref)
        created.append(transformer_ref)
        ev_seq += 1
        events.append(
            {
                "event_seq": ev_seq,
                "event_type": "TR_CREATED",
                "element_id": transformer_ref,
            }
        )

        # Bay(TR)
        tr_spec = _field_spec_for_bay_ref(bay_tr_ref) or _field_spec_for_role("TRANSFORMATOROWE")
        if tr_spec is not None:
            tr_spec["bus_ref"] = endpoint_bus_ref
            tr_spec["equipment_refs"] = [transformer_ref]
            tr_meta = tr_spec.setdefault("meta", {})
            if isinstance(tr_meta, dict):
                tr_meta.setdefault("created_by", "append_station_on_endpoint")
                tr_meta["terminal_bus_ref"] = endpoint_bus_ref
                tr_meta["transformer_ref"] = transformer_ref

        new_bay_tr = {
            "ref_id": bay_tr_ref,
            "name": f"Pole TR — {station_name}",
            "bay_role": "TR",
            "substation_ref": substation_ref,
            "bus_ref": endpoint_bus_ref,
            "equipment_refs": [transformer_ref],
            "protection_codes": list(TRANSFORMER_BAY_PROTECTION_CODES),
            "tags": [],
            "meta": {"sn_field_template": tr_spec},
        }
        new_enm.setdefault("bays", []).append(new_bay_tr)
        created.append(bay_tr_ref)
        ev_seq += 1
        events.append(
            {
                "event_seq": ev_seq,
                "event_type": "FIELDS_CREATED_SN",
                "element_id": bay_tr_ref,
            }
        )

    # Step 4B: dodatkowe pola SN z kreatora stacji (OUT/odgałęzienie/sprzęgło/TR bez trafo)
    existing_bay_refs = {bay_in_ref}
    if transformer_catalog_ref:
        existing_bay_refs.add(bay_tr_ref)
    for spec in field_specs:
        bay_ref = str(spec.get("bay_ref") or "")
        bay_role = str(spec.get("bay_role") or "")
        if not bay_ref or bay_ref in existing_bay_refs:
            continue
        field_role = str(spec.get("field_role") or bay_role)
        if bay_role == "TR" and transformer_catalog_ref:
            equipment_refs = [transformer_ref]
            spec["equipment_refs"] = [transformer_ref]
        else:
            materialization, equipment_refs = _materialize_sn_field_apparatus(
                spec=spec,
                bay_ref=bay_ref,
                bay_role=bay_role,
                field_role=field_role,
                ordinal=len(existing_bay_refs) + 1,
            )
            if isinstance(materialization, dict):
                return materialization
            if materialization is not None:
                new_enm = materialization.enm
        new_bay = {
            "ref_id": bay_ref,
            "name": f"Pole {bay_role} — {station_name}",
            "bay_role": bay_role,
            "substation_ref": substation_ref,
            "bus_ref": endpoint_bus_ref,
            "equipment_refs": equipment_refs,
            "tags": ["station_sn_field"],
            "meta": {"sn_field_template": spec},
        }
        new_enm.setdefault("bays", []).append(new_bay)
        existing_bay_refs.add(bay_ref)
        created.append(bay_ref)
        ev_seq += 1
        events.append(
            {
                "event_seq": ev_seq,
                "event_type": "FIELDS_CREATED_SN",
                "element_id": bay_ref,
            }
        )

    for substation in new_enm.get("substations", []):
        if substation.get("ref_id") == substation_ref:
            _substation_meta(substation)["field_specs"] = copy.deepcopy(field_specs)
            break

    # Step 4C: materializacja bloku nN — PARYTET z insert_station_on_segment_sn.
    # Bez tego kroku tryb „koniec odcinka" cicho gubił wyłącznik główny nN,
    # odpływy nN oraz źródło OZE (PV/BESS/FW) — cichy błąd danych w rdzeniu
    # integracji OZE (audyt ekspercki K1/K2). Reużywamy tych samych builderów,
    # co insert (_build_nn_field_specs, _materialize_nn_source).
    nn_block = payload.get("nn_block") or {}
    if isinstance(nn_block, dict) and nn_block:
        target_sub = next(
            (s for s in new_enm.get("substations", []) if s.get("ref_id") == substation_ref),
            None,
        )
        # nN bus musi istnieć, aby podpiąć pola i źródło nN. Gdy podano
        # transformer_catalog_ref — została utworzona w Step 4; w przeciwnym
        # razie tworzymy ją tu (insert tworzy szynę nN bezwarunkowo).
        nn_bus_exists = any(b.get("ref_id") == bus_nn_ref for b in new_enm.get("buses", []))
        if not nn_bus_exists:
            new_enm.setdefault("buses", []).append(
                {
                    "ref_id": bus_nn_ref,
                    "name": f"Szyna nN {station_name}",
                    "voltage_kv": nn_voltage_kv,
                    "phase_system": "3ph",
                    "tags": [],
                    "meta": {"substation_ref": substation_ref},
                }
            )
            if target_sub is not None and bus_nn_ref not in target_sub.get("bus_refs", []):
                target_sub.setdefault("bus_refs", []).append(bus_nn_ref)
            created.append(bus_nn_ref)
            ev_seq += 1
            events.append(
                {"event_seq": ev_seq, "event_type": "BUS_NN_CREATED", "element_id": bus_nn_ref}
            )

        nn_field_specs = _build_nn_field_specs(
            nn_block=nn_block,
            nn_bus_id=bus_nn_ref,
            station_seed=seed,
        )
        if target_sub is not None:
            _substation_meta(target_sub)["nn_field_specs"] = nn_field_specs
        ev_seq += 1
        events.append(
            {"event_seq": ev_seq, "event_type": "FIELDS_CREATED_NN", "element_id": bus_nn_ref}
        )

        source_event = _materialize_nn_source(
            new_enm=new_enm,
            nn_block=nn_block,
            station_seed=seed,
            nn_bus_id=bus_nn_ref,
            station_id=substation_ref,
            transformer_ref=transformer_ref,
            transformer_created=bool(transformer_catalog_ref),
            created=created,
        )
        if source_event is not None:
            generator_ref, event_type = source_event
            ev_seq += 1
            events.append(
                {"event_seq": ev_seq, "event_type": event_type, "element_id": generator_ref}
            )

        # Potrzeby własne stacji (G-STK-3) — PARYTET z insert.
        aux_load_ref = _materialize_station_auxiliary_load(
            new_enm,
            payload,
            nn_bus_id=bus_nn_ref,
            station_id=substation_ref,
            station_seed=seed,
            created=created,
        )
        if aux_load_ref is not None:
            ev_seq += 1
            events.append(
                {"event_seq": ev_seq, "event_type": "AUX_LOAD_CREATED", "element_id": aux_load_ref}
            )

    # Step 5: re-tag endpoint_bus jako część stacji
    for b in new_enm.get("buses", []):
        if b.get("ref_id") == endpoint_bus_ref:
            existing_tags = list(b.get("tags") or [])
            if "topology_terminal" in existing_tags:
                existing_tags.remove("topology_terminal")
            if "helper_bus" in existing_tags:
                existing_tags.remove("helper_bus")
            existing_tags.append("substation_bus")
            b["tags"] = existing_tags
            meta = b.setdefault("meta", {})
            meta["substation_ref"] = substation_ref
            meta["render_on_sld"] = True
            meta["show_in_project_tree"] = True
            break

    # Step 6: update LineRun/corridor jeśli wskazany albo możliwy do wyznaczenia
    effective_run_ref = run_ref or _find_corridor_ref_by_terminal(new_enm, endpoint_bus_ref)
    if effective_run_ref:
        for corridor in new_enm.get("corridors", []):
            if corridor.get("ref_id") == effective_run_ref:
                stations = corridor.setdefault("station_refs", [])
                if substation_ref not in stations:
                    stations.append(substation_ref)
                ev_seq += 1
                events.append(
                    {
                        "event_seq": ev_seq,
                        "event_type": "LOGICAL_VIEWS_UPDATED",
                        "element_id": effective_run_ref,
                    }
                )
                break
        line_run = _ensure_line_run_for_corridor(new_enm, effective_run_ref)
        _append_line_run_station(line_run, substation_ref)

    # B-2: zaczepy transformatora w TEJ SAMEJ migawce co stacja — PARYTET z
    # `insert_station_on_segment_sn`. Krok stoi TUTAJ, a nie zaraz po utworzeniu
    # transformatora, bo handler `update_element_parameters` zwraca GŁĘBOKĄ KOPIĘ
    # modelu: wcześniejsze podmienienie `new_enm` unieważniłoby lokalne referencje
    # (`new_substation`, specyfikacje pól), które kolejne kroki jeszcze mutują.
    if transformer_catalog_ref:
        wynik_zaczepow = _zastosuj_zaczepy_transformatora(
            new_enm,
            transformer_payload,
            transformer_ref=transformer_ref,
            controlled_bus_ref=bus_nn_ref,
            kod_bledu="station.append.tap_changer_failed",
        )
        if isinstance(wynik_zaczepow, dict):
            return wynik_zaczepow
        new_enm, zdarzenia_zaczepow = wynik_zaczepow
        for zdarzenie in zdarzenia_zaczepow:
            ev_seq += 1
            events.append({**zdarzenie, "event_seq": ev_seq})

    # B-3: CT/VT/zabezpieczenia pól w TEJ SAMEJ migawce co stacja (atomowo).
    wynik_wyposazenia = _zastosuj_wyposazenie_pol(
        new_enm,
        wyposazenie_pol,
        kod_bledu="station.append.field_equipment_failed",
    )
    if isinstance(wynik_wyposazenia, dict):
        return wynik_wyposazenia
    new_enm, wyposazenie_created, wyposazenie_events = wynik_wyposazenia
    created.extend(wyposazenie_created)
    for zdarzenie in wyposazenie_events:
        ev_seq += 1
        events.append({**zdarzenie, "event_seq": ev_seq})

    # Audit + emit STATION_APPENDED_ON_ENDPOINT
    audit.append(
        {
            "step": ev_seq,
            "action": f"Utworzono stację '{station_name}' na końcu odcinka",
            "element_id": substation_ref,
        }
    )
    ev_seq += 1
    events.append(
        {
            "event_seq": ev_seq,
            "event_type": "STATION_APPENDED_ON_ENDPOINT",
            "element_id": substation_ref,
            "affected_object_refs": list(created),
        }
    )

    response = _response(
        new_enm,
        created=created,
        selection_id=substation_ref,
        selection_type="substation",
        audit=audit,
        events=events,
    )

    # Phase 0C-style dry_run: usunąć snapshot, zwrócić preview metadata
    if dry_run:
        response["dry_run"] = True
        response["preview"] = {
            "appended_station_id": substation_ref,
            "endpoint_bus_ref": endpoint_bus_ref,
            "created_refs": list(created),
            "electrical_impact": {
                "topology_changed": True,
                "affected_object_refs": [substation_ref, *created],
                "endpoint_bus_consumed": True,
                "new_terminal_bus_ref": bus_nn_ref if transformer_catalog_ref else None,
            },
        }
        response.pop("snapshot", None)

    return response


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

_HANDLERS: dict[str, Any] = {
    "add_grid_source_sn": add_grid_source_sn,
    "continue_trunk_segment_sn": continue_trunk_segment_sn,
    "insert_station_on_segment_sn": insert_station_on_segment_sn,
    "insert_branch_pole_on_segment_sn": insert_branch_pole_on_segment_sn,
    "insert_zksn_on_segment_sn": insert_zksn_on_segment_sn,
    "start_branch_segment_sn": start_branch_segment_sn,
    "insert_section_switch_sn": insert_section_switch_sn,
    "connect_secondary_ring_sn": connect_secondary_ring_sn,
    "set_normal_open_point": set_normal_open_point,
    "add_transformer_sn_nn": add_transformer_sn_nn,
    "assign_catalog_to_element": assign_catalog_to_element,
    "update_element_parameters": update_element_parameters,
    "delete_element": delete_element,
    "refresh_snapshot": refresh_snapshot,
    "add_gpz_section": add_gpz_section,
    "update_gpz_section": update_gpz_section,
    "delete_gpz_section": delete_gpz_section,
    "append_station_on_endpoint": append_station_on_endpoint,
}


def execute_domain_operation(
    enm_dict: dict[str, Any],
    op_name: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Główny punkt wejścia — wywołaj handler kanonicznej operacji.

    Kanoniczne nazwy: patrz CANONICAL_OPS.
    """
    canonical_name = op_name

    handler = _HANDLERS.get(canonical_name)
    if handler is None:
        from .domain_operations_v2 import ALL_V2_HANDLERS

        handler = ALL_V2_HANDLERS.get(canonical_name)

    if handler is None:
        return _error_response(
            f"Nieznana operacja: '{op_name}'. Dostępne: {', '.join(sorted(CANONICAL_OPS))}",
            "dispatcher.unknown_operation",
        )

    try:
        result = handler(enm_dict, payload)
    except Exception as exc:
        return _error_response(
            f"Nieobsłużony wyjątek w operacji '{canonical_name}': {exc}",
            "dispatcher.unhandled_exception",
        )

    # Post-hook: walidacja semantyczna ENM po operacji (PR-C konsolidacji UI).
    # Reguły z network_model/validation/semantic_rules.py sprawdzają spójność
    # semantyki (kabel/słup, ZKSN/overhead, DER/pole). Wyniki trafiają do
    # response jako `semantic_issues: list[dict]` — frontend pokazuje je w
    # SemanticIssuesBanner. Nie blokujemy response w razie wyjątku walidatora —
    # ewentualne błędy idą do logu, ale operacja przechodzi.
    if isinstance(result, dict) and not result.get("error"):
        try:
            from network_model.validation import validate_semantic_as_dicts

            result["semantic_issues"] = validate_semantic_as_dicts(enm_dict)
        except Exception:
            result.setdefault("semantic_issues", [])
    return result


# ---------------------------------------------------------------------------
# V2 Integration — ochrona, Study Case, źródła nN, operacje uniwersalne
# ---------------------------------------------------------------------------

from .domain_operations_v2 import ALL_V2_HANDLERS, V2_CANONICAL_OPS  # noqa: E402

CANONICAL_OPS = CANONICAL_OPS | V2_CANONICAL_OPS
_HANDLERS.update(ALL_V2_HANDLERS)
