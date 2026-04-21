from __future__ import annotations

from typing import Any


def _build_catalog_binding(
    *,
    catalog_namespace: Any,
    catalog_ref: Any,
    catalog_item_version: Any,
) -> dict[str, Any]:
    return {
        "catalog_namespace": catalog_namespace,
        "catalog_item_id": catalog_ref,
        "catalog_item_version": catalog_item_version,
    }


def _build_source_catalog_label(binding: dict[str, Any]) -> str | None:
    namespace = binding.get("catalog_namespace")
    item_id = binding.get("catalog_item_id")
    version = binding.get("catalog_item_version")
    if not any((namespace, item_id, version)):
        return None
    base = ":".join(str(part) for part in (namespace, item_id) if part)
    if version:
        return f"{base}@{version}" if base else str(version)
    return base or None


def build_catalog_context(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    collection_labels = {
        "branches": "ODCINEK_SN",
        "transformers": "TRANSFORMATOR_SN_NN",
        "sources": "ZRODLO_SN",
        "loads": "ODBIOR",
        "generators": "ZRODLO",
        "measurements": "POMIAR",
        "protection_assignments": "ZABEZPIECZENIE",
        "branch_points": "PUNKT_ROZGALEZIENIA_SN",
    }

    entries: list[dict[str, Any]] = []

    for collection, element_type in collection_labels.items():
        for raw_element in snapshot.get(collection) or []:
            if not isinstance(raw_element, dict):
                continue

            catalog_ref = raw_element.get("catalog_ref")
            catalog_namespace = raw_element.get("catalog_namespace")
            materialized_params = raw_element.get("materialized_params")
            overrides = raw_element.get("overrides") or []
            parameter_origin = raw_element.get("parameter_source")

            if not any(
                (catalog_ref, catalog_namespace, materialized_params, overrides, parameter_origin)
            ):
                continue

            meta = raw_element.get("meta") or {}
            catalog_item_version = raw_element.get("catalog_version") or meta.get(
                "catalog_item_version"
            )
            catalog_binding = _build_catalog_binding(
                catalog_namespace=catalog_namespace,
                catalog_ref=catalog_ref,
                catalog_item_version=catalog_item_version,
            )
            entry: dict[str, Any] = {
                "element_id": str(raw_element.get("ref_id") or raw_element.get("id") or ""),
                "element_type": element_type,
                "name": raw_element.get("name"),
                "catalog_binding": catalog_binding,
                "source_catalog": dict(catalog_binding),
                "source_catalog_label": _build_source_catalog_label(catalog_binding),
                "materialized_params": materialized_params,
            }

            if parameter_origin is not None:
                entry["parameter_origin"] = parameter_origin
                entry["parameter_source"] = parameter_origin
            if raw_element.get("source_mode") is not None:
                entry["source_mode"] = raw_element.get("source_mode")
            if overrides:
                manual_overrides = list(overrides)
                entry["manual_overrides"] = manual_overrides
                entry["overrides"] = manual_overrides
                entry["manual_override_count"] = len(manual_overrides)
                entry["has_manual_overrides"] = True
            else:
                entry["manual_override_count"] = 0
                entry["has_manual_overrides"] = False

            entries.append(entry)

    entries.sort(key=lambda item: (item["element_type"], item["element_id"]))
    return entries


def build_catalog_context_index(
    catalog_context: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {
        str(entry["element_id"]): dict(entry)
        for entry in catalog_context
        if entry.get("element_id")
    }


def build_catalog_context_summary(catalog_context: list[dict[str, Any]]) -> dict[str, Any]:
    by_type: dict[str, int] = {}
    by_parameter_origin: dict[str, int] = {}
    manual_override_elements = 0
    total_manual_overrides = 0

    for entry in catalog_context:
        element_type = str(entry.get("element_type") or "NIEZNANY")
        by_type[element_type] = by_type.get(element_type, 0) + 1

        parameter_origin = entry.get("parameter_origin") or entry.get("parameter_source")
        if parameter_origin:
            origin_key = str(parameter_origin)
            by_parameter_origin[origin_key] = by_parameter_origin.get(origin_key, 0) + 1

        override_count = int(entry.get("manual_override_count") or 0)
        total_manual_overrides += override_count
        if override_count > 0:
            manual_override_elements += 1

    return {
        "element_count": len(catalog_context),
        "by_type": by_type,
        "by_parameter_origin": by_parameter_origin,
        "manual_override_element_count": manual_override_elements,
        "manual_override_count": total_manual_overrides,
    }


def enrich_trace_steps_with_catalog_context(
    steps: list[dict[str, Any]],
    catalog_context: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    context_by_element = build_catalog_context_index(catalog_context)
    enriched_steps: list[dict[str, Any]] = []

    for step in steps:
        enriched = dict(step)
        candidate_ids = [
            step.get("element_id"),
            step.get("target_id"),
            step.get("solver_ref"),
        ]
        catalog_entry = next(
            (
                context_by_element[str(candidate)]
                for candidate in candidate_ids
                if candidate is not None and str(candidate) in context_by_element
            ),
            None,
        )
        if catalog_entry is not None:
            enriched["catalog_context_entry"] = dict(catalog_entry)
            enriched.setdefault("element_id", catalog_entry.get("element_id"))
            enriched.setdefault("catalog_binding", catalog_entry.get("catalog_binding"))
            enriched.setdefault("source_catalog", catalog_entry.get("source_catalog"))
            enriched.setdefault("source_catalog_label", catalog_entry.get("source_catalog_label"))
            enriched.setdefault("parameter_origin", catalog_entry.get("parameter_origin"))
            enriched.setdefault("parameter_source", catalog_entry.get("parameter_source"))
            enriched.setdefault("source_mode", catalog_entry.get("source_mode"))
            enriched.setdefault("materialized_params", catalog_entry.get("materialized_params"))
            enriched.setdefault("manual_overrides", catalog_entry.get("manual_overrides"))
            enriched.setdefault("overrides", catalog_entry.get("overrides"))
            enriched.setdefault("manual_override_count", catalog_entry.get("manual_override_count"))
            enriched.setdefault("has_manual_overrides", catalog_entry.get("has_manual_overrides"))
        enriched_steps.append(enriched)

    return enriched_steps
