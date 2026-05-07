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
from typing import Any

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
    catalog_ref = (
        _extract_catalog_binding_item_id(binding)
        if isinstance(binding, dict)
        else None
    )
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

        normalized.append(
            {
                "order": order,
                "name": section_name,
                "bus_name": bus_name,
                "line_field_name": line_field_name,
                "line_field_names": line_field_names,
                "line_fields_count": line_fields_count,
            }
        )

    normalized.sort(key=lambda item: (item["order"], item["name"] or ""))
    return normalized


MAX_GPZ_LINE_FIELDS_PER_SECTION = 12


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
                bus_ref = spec.get("bus_ref")
                return bus_ref if isinstance(bus_ref, str) and bus_ref else None
    return None


def _is_trunk_start_field_spec(spec: dict[str, Any]) -> bool:
    role = str(spec.get("bay_role", "")).upper()
    if role not in {"OUT", "FEEDER", "IN"}:
        return False
    tags = spec.get("tags")
    normalized_tags = {tag for tag in tags if isinstance(tag, str)} if isinstance(tags, list) else set()
    return not (role == "FEEDER" and "gpz_line_field" in normalized_tags)


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
                has_trafo = bool(gen.get("blocking_transformer_ref"))
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
            parent_segment_id = bp.get("parent_segment_id")
            main_in = bp.get("ports", {}).get("MAIN_IN")
            main_out = bp.get("ports", {}).get("MAIN_OUT")
            branch_ports = bp.get("ports", {}).get("BRANCH", [])

            parent = _find_branch(enm, parent_segment_id) if parent_segment_id else None
            if not parent:
                blockers.append(
                    {
                        "code": "branch_point.invalid_parent_medium",
                        "message_pl": f"Punkt rozgałęzienia '{bp_ref}' nie ma poprawnego segmentu nadrzędnego.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )
            else:
                if bp_type == "branch_pole" and parent.get("type") != "line_overhead":
                    blockers.append(
                        {
                            "code": "branch_point.invalid_parent_medium",
                            "message_pl": f"Słup rozgałęźny '{bp_ref}' może być osadzony tylko na linii napowietrznej.",
                            "element_ref": bp_ref,
                            "severity": "BLOKUJACE",
                        }
                    )
                if bp_type == "zksn" and parent.get("type") != "cable":
                    blockers.append(
                        {
                            "code": "branch_point.invalid_parent_medium",
                            "message_pl": f"ZKSN '{bp_ref}' może być osadzony tylko na kablu.",
                            "element_ref": bp_ref,
                            "severity": "BLOKUJACE",
                        }
                    )

            if not main_in or not main_out:
                blockers.append(
                    {
                        "code": "branch_point.required_port_missing",
                        "message_pl": f"Punkt '{bp_ref}' nie ma wymaganych portów MAIN_IN/MAIN_OUT.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )

            if not bp.get("catalog_ref"):
                blockers.append(
                    {
                        "code": "branch_point.catalog_ref_missing",
                        "message_pl": f"Punkt '{bp_ref}' nie ma przypisanej referencji katalogowej.",
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
                        "message_pl": f"ZKSN '{bp_ref}' ma niepoprawną liczbę portów odgałęźnych.",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )

            if bp_type == "zksn" and not bp.get("switch_state"):
                blockers.append(
                    {
                        "code": "branch_point.switch_state_missing",
                        "message_pl": f"ZKSN '{bp_ref}' nie ma stanu łącznika (switch_state).",
                        "element_ref": bp_ref,
                        "severity": "BLOKUJACE",
                    }
                )

        # Domain-level check: switches/breakers without catalog_ref
        for b in enm.get("branches", []):
            b_type = b.get("type", "")
            if b_type in ("switch", "breaker") and not b.get("catalog_ref"):
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


def _resolve_branch_from_ref(enm: dict[str, Any], from_ref: str) -> tuple[str | None, str | None]:
    """Rozwiąż from_ref (station/branch_pole/zksn) na szynę źródłową.

    Obsługiwane:
    - station.BRANCH (przez pole FEEDER)
    - branch_pole.BRANCH
    - zksn.BRANCH_1, zksn.BRANCH_2
    """
    if "." not in from_ref:
        return None, "branch_connection.invalid_source_port"
    element_ref, port_id = from_ref.split(".", 1)

    if port_id == "BRANCH":
        bus = next((b for b in enm.get("buses", []) if b.get("ref_id") == element_ref), None)
        if bus:
            return element_ref, None

    if element_ref.startswith("stn/"):
        sub = next((s for s in enm.get("substations", []) if s.get("ref_id") == element_ref), None)
        if not sub:
            return None, "branch_connection.source_not_branch_capable"
        if port_id != "BRANCH":
            return None, "branch_connection.invalid_source_port"
        feeder_spec = next(
            (spec for spec in _field_specs_for_substation(sub) if spec.get("bay_role") == "FEEDER"),
            None,
        )
        if feeder_spec and feeder_spec.get("bus_ref"):
            return feeder_spec.get("bus_ref"), None
        feeder_bay = next(
            (
                bay
                for bay in enm.get("bays", [])
                if bay.get("substation_ref") == element_ref and bay.get("bay_role") == "FEEDER"
            ),
            None,
        )
        if feeder_bay and feeder_bay.get("bus_ref"):
            return feeder_bay.get("bus_ref"), None
        sn_bus_refs = _sn_bus_refs_for_substation(enm, sub)
        if sn_bus_refs:
            return sn_bus_refs[0], None
        return None, "branch_connection.source_not_branch_capable"

    if element_ref.startswith("bus/"):
        if port_id != "BRANCH":
            return None, "branch_connection.invalid_source_port"
        bus = next((b for b in enm.get("buses", []) if b.get("ref_id") == element_ref), None)
        if not bus:
            return None, "branch.from_bus_not_found"
        return element_ref, None

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

    for sub in enm.get("substations", []):
        sub_ref = sub.get("ref_id")
        if not sub_ref:
            continue
        field_specs = _field_specs_for_substation(sub)
        if any(spec.get("bus_ref") == from_bus_ref for spec in field_specs):
            structured_candidates.append(f"{sub_ref}.BRANCH")
            continue
        feeder_bay = next(
            (
                bay
                for bay in enm.get("bays", [])
                if bay.get("substation_ref") == sub_ref
                and bay.get("bay_role") == "FEEDER"
                and bay.get("bus_ref") == from_bus_ref
            ),
            None,
        )
        if feeder_bay:
            structured_candidates.append(f"{sub_ref}.BRANCH")

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

    bus = next((b for b in enm.get("buses", []) if b.get("ref_id") == from_bus_ref), None)
    if bus:
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
                else (t.get("sn_mva") or 0) * 1000
                if t.get("sn_mva")
                else None
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

    voltage_kv = _as_positive_number(manual.get("voltage_kv", payload.get("voltage_kv")))
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

    if voltage_kv is None:
        return _error_response(
            "Ręczna umowa równoważna GPZ wymaga dodatniego napięcia znamionowego SN.",
            "source.manual_equivalent_incomplete",
        )

    resolved: dict[str, Any] = {
        "voltage_kv": voltage_kv,
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
        sk3_mva = _as_positive_number(manual.get("sk3_mva", payload.get("sk3_mva")))
        rx_ratio = _as_positive_number(manual.get("rx_ratio", payload.get("rx_ratio")))
        if sk3_mva is None:
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

    # Check no existing source
    if enm.get("sources"):
        return _error_response(
            "Model sieci już ma źródło zasilania. Można dodać tylko jedno GPZ.",
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
        materialized_params.setdefault("short_circuit_model", "short_circuit_power")
        materialized_params.setdefault("short_circuit_mode", "SHORT_CIRCUIT_POWER")
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

    seed = _compute_seed(
        {
            "op": "add_grid_source_sn",
            "catalog_ref": catalog_ref,
            "voltage_kv": voltage_kv,
            "sections_count": sections_count,
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
                f"Nie udalo sie utworzyc sekcji GPZ: {result.issues[0].message_pl if result.issues else '?'}",
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

    # Create source
    source_data = {
        "device_type": "source",
        "ref_id": source_ref,
        "name": payload.get("source_name") or f"Źródło GPZ {voltage_kv} kV",
        "bus_ref": gpz_section_bus_refs[0],
        "substation_ref": substation_ref,
        "gpz_section_id": gpz_sections[0]["section_id"] if gpz_sections else None,
        "model": materialized_params.get("short_circuit_model", "short_circuit_power"),
        "catalog_ref": catalog_ref,
        "materialized_params": materialized_params,
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
        for field_index in range(int(section.get("line_fields_count") or 1)):
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
                line_field_names[field_index]
                if field_index < len(line_field_names)
                else f"Pole liniowe GPZ {idx + 1}.{field_index + 1}"
            )
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
                _apply_catalog_metadata(apparatus_data, apparatus_binding, default_namespace="APARAT_SN")
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

            field_specs.append(
                _build_field_spec(
                    field_ref=bay_ref,
                    name=bay_name,
                    bay_role="OUT" if line_field_apparatus is not None else "FEEDER",
                    bus_ref=section["bus_ref"],
                    gpz_section_id=section["section_id"],
                    equipment_refs=equipment_refs,
                    tags=["gpz_line_field"],
                    meta=field_meta,
                )
            )

    # Create substation (GPZ)
    new_enm.setdefault("substations", []).append(
        {
            "ref_id": substation_ref,
            "name": payload.get("source_name") or f"GPZ {voltage_kv} kV",
            "station_type": "gpz",
            "bus_refs": gpz_section_bus_refs,
            "transformer_refs": [],
            "entry_point_ref": gpz_section_bus_refs[0],
            "gpz_sections": gpz_sections,
            "tags": [],
            "meta": {
                "gpz_section_count": len(gpz_sections),
                "grounding": grounding_config,
                "zero_sequence": zero_sequence_config,
                "short_circuit_mode": materialized_params.get("short_circuit_mode"),
                "field_specs": field_specs,
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
    field_ref = payload.get("field_ref")
    if not isinstance(field_ref, str) or not field_ref.strip():
        field_ref = payload.get("terminal_id")
    field_ref = field_ref.strip() if isinstance(field_ref, str) and field_ref.strip() else None
    segment = payload.get("segment", {})

    if isinstance(from_terminal_id, str) and from_terminal_id.strip():
        from_terminal_id = from_terminal_id.strip()
        resolved_field_bus = _field_ref_to_bus_ref(enm, from_terminal_id)
        if resolved_field_bus:
            field_ref = field_ref or from_terminal_id
            from_terminal_id = resolved_field_bus
    elif field_ref:
        from_terminal_id = _field_ref_to_bus_ref(enm, field_ref)

    # Auto-detect from_terminal_id: find the last bus on the trunk
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
            "name": segment_name or f"Szyna {new_bus_ref[-8:]}",
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
            f"Nie udalo sie utworzyc szyny: {result.issues[0].message_pl if result.issues else '?'}",
            "trunk.bus_creation_failed",
        )
    new_enm = result.enm
    created.append(new_bus_ref)
    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BUS_CREATED", "element_id": new_bus_ref})

    # Create branch (cable or overhead line)
    branch_type = "cable" if rodzaj == "KABEL" else "line_overhead"
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
    }
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
    # The semantic station_type stored in substation record
    substation_semantic_type = substation_type_map.get(station_type_raw, "mv_lv")

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
    nn_main_id = _make_id("stn", station_seed, "nn_main_breaker")
    seg_left_id = f"{segment_id}_L"
    seg_right_id = f"{segment_id}_R"

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
            "name": station.get("station_name") or "Szyna SN stacji",
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
        "from_bus_ref": sn_bus_id,
        "to_bus_ref": to_bus_ref,
        "length_km": right_length,
        "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
        "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
        "status": "closed",
    }
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
    sn_field_specs_sorted = sorted(sn_fields, key=lambda f: f.get("field_role", ""))
    for idx, field_spec in enumerate(sn_field_specs_sorted):
        field_role = str(field_spec.get("field_role", ""))
        field_ref = _make_id("stn", station_seed, f"sn_field/{idx:03d}")
        bay_role = role_map.get(field_role, "FEEDER")
        terminal_bus_ref = _make_id("stn", station_seed, f"sn_field_terminal/{idx:03d}")
        breaker_ref = _make_id("stn", station_seed, f"sn_field_breaker/{idx:03d}")

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
                "tags": ["station_field_device", "requires_catalog_binding"],
                "meta": {
                    "field_ref": field_ref,
                    "station_ref": stn_id,
                    "field_role": field_role,
                    "bay_role": bay_role,
                    "render_on_sld": False,
                    "show_in_project_tree": False,
                    "requires_catalog_binding": True,
                    "catalog_message": "Dobierz aparat pola SN z katalogu APARAT_SN.",
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

        field_specs.append(
            _build_field_spec(
                field_ref=field_ref,
                name=f"Pole {field_role or 'SN'} {idx + 1}",
                bay_role=bay_role,
                bus_ref=sn_bus_id,
                equipment_refs=[breaker_ref],
                tags=["station_sn_field"],
                meta={
                    "field_role": field_role,
                    "terminal_bus_ref": terminal_bus_ref,
                    "default_device_ref": breaker_ref,
                    "requires_catalog_binding": True,
                },
            )
        )

    feeders = nn_block.get("outgoing_feeders_nn", [])
    feeder_count = nn_block.get("outgoing_feeders_nn_count", max(1, len(feeders)))
    nn_field_specs = [
        _build_field_spec(
            field_ref=nn_main_id,
            name="Wyłącznik główny nN",
            bay_role="IN",
            bus_ref=nn_bus_id,
            tags=["nn_main_breaker"],
        )
    ]
    for idx in range(max(feeder_count, len(feeders))):
        feeder_ref = _make_id("stn", station_seed, f"nn_feeder/{idx:03d}")
        feeder_spec = feeders[idx] if idx < len(feeders) else {}
        nn_field_specs.append(
            _build_field_spec(
                field_ref=feeder_ref,
                name=f"Odpływ nN {idx + 1}",
                bay_role="FEEDER",
                bus_ref=nn_bus_id,
                meta={"feeder_role": feeder_spec.get("feeder_role", "ODPLYW_NN")},
            )
        )

    # Create Substation — use semantic type (inline/branch/terminal/sectional/mv_lv)
    new_enm.setdefault("substations", []).append(
        {
            "ref_id": stn_id,
            "name": station.get("station_name")
            or station.get("name")
            or payload.get("name")
            or f"Stacja {station_type_raw or station_type}",
            "station_type": substation_semantic_type,
            "bus_refs": [sn_bus_id],
            "transformer_refs": [],
            "tags": [],
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
        # Phase 0A audit fix 11/12: dry_run zwraca preview metadata (Phase 0C
        # Conscious split). NIE zwraca zmutowanego snapshot — tylko wynik
        # walidacji + impact assessment.
        response["dry_run"] = True
        response["preview"] = {
            "inserted_station_id": stn_id,
            "halves": {
                "first_segment_id": payload.get("segment_id"),  # original split point
                "second_segment_id": stn_id + "_segB",  # placeholder semantyczny
            },
            "electrical_impact": {
                "topology_type_changed": True,
                "affected_object_refs": [stn_id, *created],
            },
        }
        # Usuń snapshot z response (dry_run = read-only preview).
        response.pop("snapshot", None)

    return response


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
            "branch_ports_count": payload.get(
                "branch_ports_count", 2 if branch_point_type == "zksn" else 1
            ),
        }
    )
    bp_ref = _make_id("bp", seed, branch_point_type)
    bp_bus_ref = _make_id("bp", seed, "bus")
    seg_left_id = f"{segment_id}_L_{branch_point_type}"
    seg_right_id = f"{segment_id}_R_{branch_point_type}"

    new_enm = copy.deepcopy(enm)
    created: list[str] = []
    deleted: list[str] = []

    from_bus_ref = segment.get("from_bus_ref")
    to_bus_ref = segment.get("to_bus_ref")
    left_length = length_km * ratio
    right_length = length_km * (1.0 - ratio)

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

    for seg_id, seg_from, seg_to, seg_len in (
        (seg_left_id, from_bus_ref, bp_bus_ref, left_length),
        (seg_right_id, bp_bus_ref, to_bus_ref, right_length),
    ):
        seg_data: dict[str, Any] = {
            "ref_id": seg_id,
            "name": f"Odcinek {seg_id}",
            "type": seg_type,
            "from_bus_ref": seg_from,
            "to_bus_ref": seg_to,
            "length_km": seg_len,
            "r_ohm_per_km": segment.get("r_ohm_per_km", 0.0),
            "x_ohm_per_km": segment.get("x_ohm_per_km", 0.0),
            "status": "closed",
            "catalog_ref": segment.get("catalog_ref"),
        }
        branch_res = create_branch(new_enm, seg_data)
        if not branch_res.success:
            return _error_response(
                "Nie udało się odtworzyć geometrii segmentu.", "branch_point.segment_rebuild_failed"
            )
        new_enm = branch_res.enm
        created.append(seg_id)

    branch_ports_count = int(
        payload.get("branch_ports_count", 2 if branch_point_type == "zksn" else 1)
    )
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
                "MAIN_IN": from_bus_ref,
                "MAIN_OUT": to_bus_ref,
                "BRANCH": branch_port_bus_refs,
            },
            "branch_occupied": {},
            "switch_state": payload.get("switch_state"),
            "materialized_params": payload.get("materialized_params"),
            "completeness_status": completeness,
            "runtime_inputs": {
                "name": payload.get("name"),
                "branch_ports_count": branch_ports_count,
                "insert_at": insert_at,
            },
        }
    )
    created.append(bp_ref)

    for c in new_enm.get("corridors", []):
        refs = c.get("ordered_segment_refs", [])
        if segment_id in refs:
            idx = refs.index(segment_id)
            c["ordered_segment_refs"] = refs[:idx] + [seg_left_id, seg_right_id] + refs[idx + 1 :]
            break

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

    if not from_ref and from_bus_ref:
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

    if payload.get("from_bus_ref") and payload.get("from_bus_ref") != from_bus_ref:
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
    result = create_branch(new_enm, branch_data)
    if not result.success:
        return _error_response("Nie udało się utworzyć odgałęzienia.", "branch.creation_failed")
    new_enm = result.enm
    created.append(branch_ref)

    if from_ref and from_ref.startswith("bp/"):
        element_ref, port_id = from_ref.split(".", 1)
        for bp in new_enm.get("branch_points", []):
            if bp.get("ref_id") == element_ref:
                bp.setdefault("branch_occupied", {})[port_id] = branch_ref
                break

    ev_seq += 1
    events.append({"event_seq": ev_seq, "event_type": "BRANCH_CREATED", "element_id": branch_ref})

    return _response(
        new_enm, created=created, selection_id=new_bus_ref, selection_type="bus", events=events
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
                "tap_position",
                "tap_min",
                "tap_max",
                "tap_step_percent",
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
        return _error_response(
            "Brak identyfikatora stacji.", "gpz_section.add.substation_missing"
        )
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
        order = (max((s.get("order", 0) for s in existing), default=0) + 1)

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

    audit = [{
        "step": 1,
        "action": f"Dodano sekcję {side.upper()} '{section_id}' do stacji {substation_ref}",
        "element_id": section_id,
    }]
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
    allowed_keys = {"name", "order", "bus_ref", "left_coupler_ref", "right_coupler_ref", "line_field_name"}
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

    audit = [{
        "step": 1,
        "action": f"Zaktualizowano sekcję {side.upper()} '{section_id}'",
        "element_id": section_id,
    }]
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
    """Usuwa sekcję GPZ ze stacji.

    Walidacja:
      - sekcja musi istnieć
      - żadne `bay.gpz_section_id` w ENM nie może wskazywać na usuwaną sekcję
        (operator musi najpierw przepiąć/usunąć pola)

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
        if bay.get("substation_ref") == substation_ref
        and bay.get("gpz_section_id") == section_id
    ]
    if bays_using_section:
        return _error_response(
            f"Nie można usunąć sekcji '{section_id}': używana przez pola {bays_using_section}. "
            "Najpierw przepiąć/usunąć pola.",
            "gpz_section.delete.in_use",
        )

    new_enm = copy.deepcopy(enm)
    new_sub = _find_substation(new_enm, substation_ref)
    assert new_sub is not None
    new_sections = [s for s in (new_sub.get(sections_field) or []) if s.get("section_id") != section_id]
    new_sub[sections_field] = new_sections

    audit = [{
        "step": 1,
        "action": f"Usunięto sekcję {side.upper()} '{section_id}'",
        "element_id": section_id,
    }]
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

    if nn_voltage_kv <= 0:
        return _error_response(
            "Brak napięcia nN stacji. Podaj `nn_voltage_kv` > 0.",
            "station.append.nn_voltage_missing",
        )

    # Walidacja station_type
    station_type_raw = station_payload.get("station_type") or payload.get("station_type") or "terminal"
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
        "meta": {"created_by": "append_station_on_endpoint"},
    }
    new_enm.setdefault("substations", []).append(new_substation)
    created.append(substation_ref)
    ev_seq += 1
    events.append({
        "event_seq": ev_seq,
        "event_type": "STATION_CREATED",
        "element_id": substation_ref,
    })

    # Step 3: Bay(IN) wskazujący na endpoint_bus
    new_bay_in = {
        "ref_id": bay_in_ref,
        "name": f"Pole IN — {station_name}",
        "bay_role": "IN",
        "substation_ref": substation_ref,
        "bus_ref": endpoint_bus_ref,
        "equipment_refs": [],
        "tags": [],
        "meta": {},
    }
    new_enm.setdefault("bays", []).append(new_bay_in)
    created.append(bay_in_ref)
    ev_seq += 1
    events.append({
        "event_seq": ev_seq,
        "event_type": "FIELDS_CREATED_SN",
        "element_id": bay_in_ref,
    })

    # Step 4: opcjonalny Transformator + Bus nN + Bay(TR)
    transformer_catalog_ref = (
        transformer_payload.get("transformer_catalog_ref")
        or transformer_payload.get("catalog_ref")
    )
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
        events.append({
            "event_seq": ev_seq,
            "event_type": "BUS_NN_CREATED",
            "element_id": bus_nn_ref,
        })

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
        new_enm.setdefault("transformers", []).append(transformer)
        new_substation["transformer_refs"].append(transformer_ref)
        created.append(transformer_ref)
        ev_seq += 1
        events.append({
            "event_seq": ev_seq,
            "event_type": "TR_CREATED",
            "element_id": transformer_ref,
        })

        # Bay(TR)
        new_bay_tr = {
            "ref_id": bay_tr_ref,
            "name": f"Pole TR — {station_name}",
            "bay_role": "TR",
            "substation_ref": substation_ref,
            "bus_ref": endpoint_bus_ref,
            "equipment_refs": [transformer_ref],
            "tags": [],
            "meta": {},
        }
        new_enm.setdefault("bays", []).append(new_bay_tr)
        created.append(bay_tr_ref)
        ev_seq += 1
        events.append({
            "event_seq": ev_seq,
            "event_type": "FIELDS_CREATED_SN",
            "element_id": bay_tr_ref,
        })

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

    # Step 6: update LineRun (corridor) jeśli wskazany
    if run_ref:
        for corridor in new_enm.get("corridors", []):
            if corridor.get("ref_id") == run_ref:
                stations = corridor.setdefault("station_refs", [])
                if substation_ref not in stations:
                    stations.append(substation_ref)
                ev_seq += 1
                events.append({
                    "event_seq": ev_seq,
                    "event_type": "LOGICAL_VIEWS_UPDATED",
                    "element_id": run_ref,
                })
                break

    # Audit + emit STATION_APPENDED_ON_ENDPOINT
    audit.append({
        "step": ev_seq,
        "action": f"Utworzono stację '{station_name}' na końcu odcinka",
        "element_id": substation_ref,
    })
    ev_seq += 1
    events.append({
        "event_seq": ev_seq,
        "event_type": "STATION_APPENDED_ON_ENDPOINT",
        "element_id": substation_ref,
        "affected_object_refs": list(created),
    })

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

    if canonical_name not in _HANDLERS:
        return _error_response(
            f"Nieznana operacja: '{op_name}'. Dostępne: {', '.join(sorted(CANONICAL_OPS))}",
            "dispatcher.unknown_operation",
        )

    try:
        return _HANDLERS[canonical_name](enm_dict, payload)
    except Exception as exc:
        return _error_response(
            f"Nieobsłużony wyjątek w operacji '{canonical_name}': {exc}",
            "dispatcher.unhandled_exception",
        )


# ---------------------------------------------------------------------------
# V2 Integration — ochrona, Study Case, źródła nN, operacje uniwersalne
# ---------------------------------------------------------------------------

from .domain_operations_v2 import ALL_V2_HANDLERS, V2_CANONICAL_OPS  # noqa: E402

CANONICAL_OPS = CANONICAL_OPS | V2_CANONICAL_OPS
_HANDLERS.update(ALL_V2_HANDLERS)
