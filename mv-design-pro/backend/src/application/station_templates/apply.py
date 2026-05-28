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

import re
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

    case_key = str(case_id)
    enm = _get_enm(case_key)
    enm_dict: dict[str, Any] = enm.model_dump(mode="json")

    created_refs: list[str] = []
    operations_log: list[dict[str, Any]] = []

    # Step 1: insert_station_on_segment_sn payload
    sn_bays_count = int(overrides.get("sn_bays_count", template.schema.sn_bays_count.default))
    nn_feeders_default = int(template.schema.nn_feeders_count.default)
    nn_feeders_requested = int(overrides.get("nn_feeders_count", nn_feeders_default))
    # K30-26: manufacturer cascade — uses catalog_profile gdy user nie override TR
    transformer_ref = _resolve_transformer_ref_for_template(
        template,
        overrides=overrides,
        catalog_profile=catalog_profile,
    )

    sn_bay_roles = _resolve_sn_bay_roles(template, sn_bays_count)
    cb_catalog = overrides.get("nn_feeder_cb_ref") or _cascade_manufacturer_choice(
        template.schema.nn_feeder_cb_options, catalog_profile
    )
    nn_feeder_specs = [
        {
            "feeder_role": "ODPLYW_NN",
            "catalog_bindings": _catalog_binding("APARAT_NN", cb_catalog),
        }
        for _ in range(max(0, nn_feeders_requested))
    ]

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
        "nn_block": {
            "outgoing_feeders_nn_count": max(0, nn_feeders_requested),
            "outgoing_feeders_nn": nn_feeder_specs,
        },
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
    operations_log.append(
        {"op": "insert_station_on_segment_sn", "status": "OK", "created": new_ids}
    )

    # Find newly created station ref + nN bus ref for chained ops
    station_ref = next((r for r in new_ids if "/station" in str(r)), None)
    nn_bus_ref = next((r for r in new_ids if "/nn_bus" in str(r)), None)

    # Step 2: chain additional nN feeders if the domain insert did not materialize all of them.
    nn_feeder_refs = _station_nn_feeder_refs(enm_dict, station_ref, nn_bus_ref)
    extra_feeders = max(0, nn_feeders_requested - len(nn_feeder_refs))

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
                raise TemplateApplyError(
                    code=feeder_result.get("error_code", "template.nn_feeder_failed"),
                    message_pl=feeder_result.get("error")
                    or "Materializacja odpływu nN z szablonu nie powiodła się.",
                )
            enm_dict = feeder_result.get("snapshot") or enm_dict
            new_feeder_ids = (feeder_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_feeder_ids)
            operations_log.append(
                {
                    "op": "add_nn_outgoing_field",
                    "status": "OK",
                    "created": new_feeder_ids,
                }
            )
        nn_feeder_refs = _station_nn_feeder_refs(enm_dict, station_ref, nn_bus_ref)

    # Step 3: materialize catalog-bound nN loads for every outgoing feeder.
    load_kw = float(overrides.get("nn_load_default_kw", template.schema.nn_load_default_kw.default))
    if station_ref and nn_bus_ref and load_kw > 0 and nn_feeder_refs:
        load_catalog_ref = overrides.get("nn_load_catalog_ref") or _resolve_load_ref_for_template(
            template,
            load_kw=load_kw,
        )
        reactive_power_kvar = overrides.get("nn_load_default_kvar")
        for index, feeder_ref in enumerate(nn_feeder_refs, start=1):
            load_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_nn_load",
                payload={
                    "station_ref": station_ref,
                    "bus_nn_ref": nn_bus_ref,
                    "feeder_ref": feeder_ref,
                    "catalog_ref": load_catalog_ref,
                    "load_kind": "SKUPIONY",
                    "connection_type": "TROJFAZOWY",
                    "active_power_kw": load_kw,
                    "reactive_power_kvar": reactive_power_kvar,
                    "cos_phi": overrides.get("nn_load_cos_phi", 0.95),
                    "load_name": f"Odbiór nN {index}",
                },
            )
            if load_result.get("error"):
                raise TemplateApplyError(
                    code=load_result.get("error_code", "template.nn_load_failed"),
                    message_pl=load_result.get("error")
                    or "Materializacja odbioru nN z szablonu nie powiodła się.",
                )
            enm_dict = load_result.get("snapshot") or enm_dict
            new_load_ids = (load_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_load_ids)
            operations_log.append(
                {
                    "op": "add_nn_load",
                    "status": "OK",
                    "created": new_load_ids,
                    "feeder_ref": feeder_ref,
                    "catalog_ref": load_catalog_ref,
                }
            )

    # Step 4: chain DER additions
    der_total = int(overrides.get("der_total_count", template.schema.der_total_count.default))
    if station_ref and der_total > 0 and template.schema.der_options:
        for i in range(der_total):
            der_spec = template.schema.der_options[i % len(template.schema.der_options)]
            der_catalog = overrides.get(f"der_{der_spec.kind}_ref") or _first_default_choice(
                der_spec.catalog_options
            )
            if not der_catalog:
                raise TemplateApplyError(
                    code="template.der_catalog_missing",
                    message_pl=(
                        "Szablon stacji wskazuje źródło przekształtnikowe, "
                        "ale nie ma pełnej pozycji katalogowej dla tego wariantu."
                    ),
                )
            connection_variant = der_spec.connection_variant_options[0]
            der_payload = {
                "source_technology": der_spec.kind,
                "catalog_ref": der_catalog,
                "connection_variant": connection_variant,
                "station_ref": station_ref,
                "power_setpoint_mw": float(
                    overrides.get(
                        f"der_{der_spec.kind}_p_mw_each",
                        der_spec.default_p_mw_each,
                    )
                ),
                "quantity": 1,
            }
            if connection_variant == "nn_side" and nn_bus_ref:
                der_payload["bus_nn_ref"] = nn_bus_ref
            der_result = execute_domain_operation(
                enm_dict=enm_dict,
                op_name="add_converter_source",
                payload=der_payload,
            )
            if der_result.get("error"):
                raise TemplateApplyError(
                    code=der_result.get("error_code", "template.der_failed"),
                    message_pl=der_result.get("error")
                    or "Materializacja źródła przekształtnikowego z szablonu nie powiodła się.",
                )
            enm_dict = der_result.get("snapshot") or enm_dict
            new_der_ids = (der_result.get("changes") or {}).get("created_element_ids") or []
            created_refs.extend(new_der_ids)
            operations_log.append(
                {
                    "op": "add_converter_source",
                    "kind": der_spec.kind,
                    "status": "OK",
                    "created": new_der_ids,
                }
            )

    # Persist final snapshot
    try:
        new_enm = EnergyNetworkModel.model_validate(enm_dict)
        saved = _set_enm(case_key, new_enm)
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


def _catalog_binding(namespace: str, item_id: str | None) -> dict[str, Any] | None:
    if not isinstance(item_id, str) or not item_id.strip():
        return None
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id.strip(),
        "catalog_item_version": "2024.1",
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }


def _station_nn_feeder_refs(
    enm_dict: dict[str, Any],
    station_ref: str | None,
    nn_bus_ref: str | None,
) -> list[str]:
    if not station_ref or not nn_bus_ref:
        return []
    for substation in enm_dict.get("substations", []):
        if not isinstance(substation, dict) or substation.get("ref_id") != station_ref:
            continue
        meta = substation.get("meta")
        if not isinstance(meta, dict):
            return []
        refs: list[str] = []
        raw_specs = meta.get("nn_field_specs")
        if not isinstance(raw_specs, list):
            return refs
        for spec in raw_specs:
            if not isinstance(spec, dict):
                continue
            if spec.get("bay_role") != "FEEDER" or spec.get("bus_ref") != nn_bus_ref:
                continue
            field_ref = spec.get("field_ref")
            if isinstance(field_ref, str) and field_ref.strip():
                refs.append(field_ref)
        return refs
    return []


def _resolve_load_ref_for_template(template: StationTemplate, *, load_kw: float) -> str:
    category_value = getattr(template.category, "value", str(template.category))
    if category_value == "przemyslowa" or load_kw >= 60:
        return "load_przem_75kw"
    if load_kw >= 25:
        return "load_uslugi_30kw"
    return "load_mieszk_15kw"


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


def _resolve_transformer_ref_for_template(
    template: StationTemplate,
    *,
    overrides: dict[str, Any],
    catalog_profile: str | None,
) -> str | None:
    """Resolve a template transformer to an existing catalog item.

    Szablony kodują moc w identyfikatorze (`..._630kva`). Używamy jej przed
    fallbackiem, żeby stacja 100 kVA nie dostała pierwszej pozycji z listy
    wspólnych opcji. Dla historycznego szablonu 50 kVA wybieramy najbliższy
    obecny typoszereg katalogowy 63 kVA.
    """
    explicit = overrides.get("transformer_ref")
    if isinstance(explicit, str) and explicit.strip():
        return explicit

    manufacturer_match = _cascade_manufacturer_choice(
        template.schema.transformer_options,
        catalog_profile,
    )
    if catalog_profile and manufacturer_match:
        return manufacturer_match

    rating_match = re.search(r"_(\d+)kva(?:_|$)", template.id.lower())
    if rating_match:
        rating_kva = int(rating_match.group(1))
        if rating_kva == 50:
            rating_kva = 63
        token = f"-{rating_kva}kva-"
        for option in template.schema.transformer_options:
            ref = getattr(option, "catalog_ref", None)
            if isinstance(ref, str) and token in ref.lower():
                return ref

    der_required_kva = _template_der_required_kva(template, overrides)
    if der_required_kva is not None:
        rated_options = sorted(
            (
                (rating, ref)
                for option in template.schema.transformer_options
                for rating, ref in [_catalog_choice_rating_kva(option)]
                if rating is not None and ref is not None
            ),
            key=lambda item: item[0],
        )
        for rating, ref in rated_options:
            if rating >= der_required_kva:
                return ref
        if rated_options:
            return rated_options[-1][1]

    return manufacturer_match or _first_default_choice(template.schema.transformer_options)


def _catalog_choice_rating_kva(option: Any) -> tuple[int | None, str | None]:
    ref = getattr(option, "catalog_ref", None)
    if not isinstance(ref, str):
        return None, None
    match = re.search(r"-(\d+)kva-", ref.lower())
    if match is None:
        return None, ref
    return int(match.group(1)), ref


def _template_der_required_kva(
    template: StationTemplate,
    overrides: dict[str, Any],
) -> int | None:
    """Return apparent catalog size hint from template DER defaults.

    This is only a deterministic catalog selector. Network physics still lives
    in solver/domain code and uses materialized catalog data.
    """
    der_specs = template.schema.der_options
    if not der_specs:
        return None

    der_total = int(overrides.get("der_total_count", template.schema.der_total_count.default))
    if der_total <= 0:
        return None

    total_mw = 0.0
    for i in range(der_total):
        spec = der_specs[i % len(der_specs)]
        override_key = f"der_{spec.kind}_p_mw_each"
        total_mw += float(overrides.get(override_key, spec.default_p_mw_each))

    if total_mw <= 0:
        return None
    return int(round(total_mw * 1000))


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
        return "terminal"
    if template.category == TemplateCategory.SEKCYJNA:
        return "sectional"
    return "inline"
