"""Station Template Apply orchestrator — K30-20.

Translates a template (z editable schema) + user param overrides into
sequence of domain operations applied via execute_domain_operation.

Operation sequence:
1. insert_station_on_segment_sn (creates station + bays + transformer)
2. add_nn_outgoing_field × N (additional feeders beyond default)
3. add_converter_source × M (DER inverters per kind + count)

Returns: { created_element_refs, snapshot, readiness }
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from application.station_templates.schema import StationTemplate
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel


class TemplateApplyError(Exception):
    """Apply pipeline failure."""

    def __init__(self, code: str, message_pl: str) -> None:
        super().__init__(message_pl)
        self.code = code
        self.message_pl = message_pl


def apply_template_to_case(
    *,
    template: StationTemplate,
    case_id: UUID,
    target_segment_id: str,
    insert_at_ratio: float = 0.5,
    params_override: dict[str, Any] | None = None,
    catalog_profile: str | None = None,
) -> dict[str, Any]:
    """Apply template do active ENM. Returns aggregated result.

    Flow:
    1. Load case ENM
    2. Build insert_station_on_segment_sn payload z template defaults + overrides
    3. Apply op (creates station + bays + transformer atomically)
    4. Chain additional nN feeders (jeśli nn_feeders_count > default)
    5. Chain DER additions per template.schema.der_options
    6. Persist final ENM
    """
    overrides = params_override or {}

    # Avoid circular import — import here
    from api.enm import _get_enm, _set_enm

    enm = _get_enm(case_id)
    enm_dict: dict[str, Any] = enm.model_dump(mode="json")

    created_refs: list[str] = []
    operations_log: list[dict[str, Any]] = []

    # Step 1: insert_station_on_segment_sn payload
    sn_bays_count = int(overrides.get("sn_bays_count", template.schema.sn_bays_count.default))
    # K30-26: manufacturer cascade — uses catalog_profile gdy user nie override TR
    transformer_ref = (
        overrides.get("transformer_ref")
        or _cascade_manufacturer_choice(template.schema.transformer_options, catalog_profile)
    )

    sn_bay_roles = _resolve_sn_bay_roles(template, sn_bays_count)

    station_payload = {
        "segment_id": target_segment_id,
        "insert_at": {"mode": "RATIO", "value": insert_at_ratio},
        "station": {
            "name_pl": template.name_pl,
            "station_type": _resolve_station_type(template),
            "sn_voltage_kv": 15,
            "nn_voltage_kv": 0.4,
        },
        "transformer": {
            "transformer_catalog_ref": transformer_ref,
        },
        "sn_fields": sn_bay_roles,
    }

    insert_result = execute_domain_operation(
        enm_dict=enm_dict,
        op_name="insert_station_on_segment_sn",
        payload=station_payload,
    )

    if insert_result.get("error"):
        raise TemplateApplyError(
            code=insert_result.get("error_code", "template.insert_failed"),
            message_pl=insert_result.get("error") or "Wstawienie stacji nie powiodło się.",
        )

    enm_dict = insert_result.get("snapshot") or enm_dict
    changes = insert_result.get("changes") or {}
    new_ids = changes.get("created_element_ids") or []
    created_refs.extend(new_ids)
    operations_log.append({"op": "insert_station_on_segment_sn", "status": "OK", "created": new_ids})

    # Find newly created station ref + nN bus ref for chained ops
    station_ref = next((r for r in new_ids if "/station" in str(r)), None)
    nn_bus_ref = next((r for r in new_ids if "/nn_bus" in str(r)), None)

    # Step 2: chain additional nN feeders if requested
    nn_feeders_default = int(template.schema.nn_feeders_count.default)
    nn_feeders_requested = int(overrides.get("nn_feeders_count", nn_feeders_default))
    extra_feeders = max(0, nn_feeders_requested - 1)  # insert_station creates 1 default
    cb_catalog = (
        overrides.get("nn_feeder_cb_ref")
        or _cascade_manufacturer_choice(template.schema.nn_feeder_cb_options, catalog_profile)
    )

    if station_ref and nn_bus_ref and extra_feeders > 0:
        for i in range(extra_feeders):
            feeder_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_nn_outgoing_field",
                payload={
                    "bus_nn_ref": nn_bus_ref,
                    "station_ref": station_ref,
                    "field_role": "OUTGOING",
                    "field_name": f"Odpływ nN {i + 2}",
                    "catalog_ref": cb_catalog or "cb_nn_400a",
                },
            )
            if feeder_result.get("error"):
                operations_log.append({
                    "op": "add_nn_outgoing_field",
                    "status": "FAIL",
                    "error": feeder_result.get("error_code"),
                })
                continue
            enm_dict = feeder_result.get("snapshot") or enm_dict
            new_feeder_ids = (feeder_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_feeder_ids)
            operations_log.append({
                "op": "add_nn_outgoing_field",
                "status": "OK",
                "created": new_feeder_ids,
            })

    # Step 3: chain DER additions
    der_total = int(overrides.get("der_total_count", template.schema.der_total_count.default))
    if station_ref and der_total > 0 and template.schema.der_options:
        for i in range(der_total):
            der_spec = template.schema.der_options[i % len(template.schema.der_options)]
            der_catalog = (
                overrides.get(f"der_{der_spec.kind}_ref")
                or _first_default_choice(der_spec.catalog_options)
            )
            if not der_catalog:
                continue
            connection_variant = der_spec.connection_variant_options[0]
            der_payload = {
                "source_technology": der_spec.kind,
                "catalog_ref": der_catalog,
                "connection_variant": connection_variant,
                "station_ref": station_ref,
            }
            if connection_variant == "nn_side" and nn_bus_ref:
                der_payload["bus_nn_ref"] = nn_bus_ref
            der_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_converter_source",
                payload=der_payload,
            )
            if der_result.get("error"):
                operations_log.append({
                    "op": "add_converter_source",
                    "kind": der_spec.kind,
                    "status": "FAIL",
                    "error": der_result.get("error_code"),
                })
                continue
            enm_dict = der_result.get("snapshot") or enm_dict
            new_der_ids = (der_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_der_ids)
            operations_log.append({
                "op": "add_converter_source",
                "kind": der_spec.kind,
                "status": "OK",
                "created": new_der_ids,
            })

    # Persist final snapshot
    try:
        new_enm = EnergyNetworkModel.model_validate(enm_dict)
        saved = _set_enm(case_id, new_enm)
        enm_dict = saved.model_dump(mode="json")
    except Exception as exc:
        raise TemplateApplyError(
            code="template.persist_failed",
            message_pl=f"Błąd zapisu snapshot: {exc}",
        ) from exc

    return {
        "template_id": template.id,
        "template_name_pl": template.name_pl,
        "station_ref": station_ref,
        "created_element_refs": created_refs,
        "operations_log": operations_log,
        "catalog_profile_applied": catalog_profile,
        "snapshot_hash": enm_dict.get("header", {}).get("hash_sha256"),
    }


# Helpers


def _first_default_choice(options: tuple[Any, ...] | list[Any]) -> str | None:
    """Return catalog_ref of default option, or first if no default flagged."""
    if not options:
        return None
    for o in options:
        if getattr(o, "default", False):
            return getattr(o, "catalog_ref", None)
    return getattr(options[0], "catalog_ref", None)


def _cascade_manufacturer_choice(
    options: tuple[Any, ...] | list[Any],
    manufacturer: str | None,
) -> str | None:
    """K30-26: manufacturer cascade — prefer catalog entry matching profile.

    Returns first option whose catalog_ref contains manufacturer hint
    (case-insensitive substring match). Falls back do default if no match.
    """
    if not options:
        return None
    if manufacturer:
        normalized = manufacturer.lower().replace(" ", "-").replace("_", "-")
        for o in options:
            ref = (getattr(o, "catalog_ref", "") or "").lower()
            # Match manufacturer hints (zpue, wzl, elektrometal, abb, siemens, etc.)
            if any(token in ref for token in normalized.split("-") if len(token) > 2):
                return getattr(o, "catalog_ref", None)
    return _first_default_choice(options)


def _resolve_sn_bay_roles(template: StationTemplate, count: int) -> list[str]:
    """Map sn_bays_count → list of bay role codes (IN/OUT/TR/MEASUREMENT/...)."""
    declared = [r.role for r in template.schema.sn_bay_roles]
    if declared:
        # Use template-declared sequence, pad with OUT if more requested
        result = list(declared[:count])
        while len(result) < count:
            result.append("OUT")
        return result
    # Fallback: IN, OUT, TR default
    fallback = ["IN", "OUT", "TR"]
    return (fallback + ["OUT"] * count)[:count]


def _resolve_station_type(template: StationTemplate) -> str:
    """Map template category → station_type string."""
    from application.station_templates.schema import TemplateCategory

    if template.category == TemplateCategory.SLUPOWA:
        return "pole"
    if template.category == TemplateCategory.SEKCYJNA:
        return "sectional"
    return "inline"
