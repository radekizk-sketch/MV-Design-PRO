"""Shared catalog enforcement policy for domain operation API endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from network_model.catalog.materialization import (
    materialize_catalog_binding,
    validate_catalog_binding,
)
from network_model.catalog.types import CatalogBinding

DEFAULT_CATALOG_VERSION = "2024.1"

# Operations that require catalog binding in their payload
CATALOG_REQUIRED_OPERATIONS: frozenset[str] = frozenset(
    {
        "add_grid_source_sn",
        "add_sn_bay",
        "continue_trunk_segment_sn",
        "insert_branch_pole_on_segment_sn",
        "start_branch_segment_sn",
        "insert_zksn_on_segment_sn",
        "insert_station_on_segment_sn",
        "append_station_on_endpoint",
        "add_transformer_sn_nn",
        "add_nn_load",
        "add_converter_source",
        "add_relay",
        "add_ct",
        "add_vt",
        "add_nn_outgoing_field",
        "insert_section_switch_sn",
        "connect_secondary_ring_sn",
    }
)


@dataclass(frozen=True)
class CatalogPolicyError:
    """Canonical catalog policy error returned by API endpoints."""

    code: str
    message_pl: str
    errors: list[dict[str, str]]


def _binding_from_ref(namespace: str | None, catalog_ref: Any) -> dict[str, Any] | None:
    if not namespace or not isinstance(catalog_ref, str) or not catalog_ref.strip():
        return None
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": catalog_ref.strip(),
        "catalog_item_version": DEFAULT_CATALOG_VERSION,
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }


def _extract_binding_from_container(
    container: Any,
    *,
    namespace: str | None = None,
    ref_keys: tuple[str, ...] = (),
) -> dict[str, Any] | None:
    if not isinstance(container, dict):
        return None

    binding = container.get("catalog_binding")
    if isinstance(binding, dict):
        return binding

    for key in ref_keys:
        synthesized = _binding_from_ref(namespace, container.get(key))
        if synthesized is not None:
            return synthesized

    return None


def _segment_namespace(segment: Any) -> str | None:
    if not isinstance(segment, dict):
        return None
    segment_kind = segment.get("rodzaj") or segment.get("segment_kind") or segment.get("type")
    if segment_kind in {"KABEL", "KABEL_SN", "cable"}:
        return "KABEL_SN"
    if segment_kind in {"LINIA_NAPOWIETRZNA", "LINIA_SN", "line_overhead"}:
        return "LINIA_SN"
    return None


def _explicit_namespace(payload: dict[str, Any]) -> str | None:
    namespace = payload.get("catalog_namespace")
    if isinstance(namespace, str) and namespace.strip():
        return namespace.strip()
    return None


def _converter_namespace(payload: dict[str, Any]) -> str | None:
    technology = payload.get("source_technology")
    if isinstance(technology, str):
        normalized = technology.strip().upper()
        if normalized == "PV":
            return "ZRODLO_NN_PV"
        if normalized == "BESS":
            return "ZRODLO_NN_BESS"
        if normalized == "FW":
            return "CONVERTER"
    return "CONVERTER"


def _uses_manual_grid_source_equivalent(payload: dict[str, Any]) -> bool:
    source_mode = payload.get("source_mode")
    parameter_source = payload.get("parameter_source")
    if source_mode in {"EKSPERCKI_RECZNY", "MANUAL", "MANUAL_EQUIVALENT"}:
        return True
    if parameter_source == "MANUAL_EQUIVALENT":
        return True
    return isinstance(payload.get("manual_equivalent"), dict)


def _manual_grid_source_equivalent_complete(payload: dict[str, Any]) -> bool:
    manual = payload.get("manual_equivalent")
    if not isinstance(manual, dict):
        return False

    voltage_kv = manual.get("voltage_kv", payload.get("voltage_kv"))
    if not isinstance(voltage_kv, int | float) or float(voltage_kv) <= 0:
        return False

    short_circuit_mode = (
        str(
            manual.get(
                "short_circuit_mode", payload.get("short_circuit_mode", "SHORT_CIRCUIT_POWER")
            )
        )
        .strip()
        .upper()
    )
    if short_circuit_mode == "IMPEDANCE":
        r_ohm = manual.get("r_ohm", payload.get("r_ohm"))
        x_ohm = manual.get("x_ohm", payload.get("x_ohm"))
        return (
            isinstance(r_ohm, int | float)
            and float(r_ohm) >= 0
            and isinstance(x_ohm, int | float)
            and float(x_ohm) > 0
        )

    sk3_mva = manual.get("sk3_mva", payload.get("sk3_mva"))
    rx_ratio = manual.get("rx_ratio", payload.get("rx_ratio"))
    return (
        isinstance(sk3_mva, int | float)
        and float(sk3_mva) > 0
        and isinstance(rx_ratio, int | float)
        and float(rx_ratio) > 0
    )


def extract_catalog_binding(operation: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Extract catalog_binding from payload, preferring canonical nested contracts."""

    if operation in {
        "continue_trunk_segment_sn",
        "start_branch_segment_sn",
        "connect_secondary_ring_sn",
    }:
        candidate = _extract_binding_from_container(
            payload.get("segment"),
            namespace=_segment_namespace(payload.get("segment")),
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "insert_station_on_segment_sn":
        candidate = _extract_binding_from_container(
            payload.get("transformer"),
            namespace="TRAFO_SN_NN",
            ref_keys=("transformer_catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "append_station_on_endpoint":
        # Ref transformatora czytany DOKŁADNIE tak, jak czyta go operacja
        # domenowa (`transformer_catalog_ref` albo `catalog_ref`) — brama API
        # ma sprawdzać tę samą pozycję katalogową, która trafi do migawki.
        candidate = _extract_binding_from_container(
            payload.get("transformer"),
            namespace="TRAFO_SN_NN",
            ref_keys=("transformer_catalog_ref", "catalog_ref"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_transformer_sn_nn":
        candidate = _extract_binding_from_container(
            payload,
            namespace="TRAFO_SN_NN",
            ref_keys=("transformer_catalog_ref", "catalog_ref"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_grid_source_sn":
        candidate = _extract_binding_from_container(
            payload,
            namespace="ZRODLO_SN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "insert_section_switch_sn":
        candidate = _extract_binding_from_container(
            payload,
            namespace="APARAT_SN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "add_sn_bay":
        candidate = _extract_binding_from_container(
            payload,
            namespace="APARAT_SN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "add_nn_load":
        candidate = _extract_binding_from_container(
            payload.get("load") or payload,
            namespace="OBCIAZENIE",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation == "add_converter_source":
        candidate = _extract_binding_from_container(
            payload,
            namespace=_converter_namespace(payload),
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

        materialized = payload.get("materialized_params")
        if isinstance(materialized, dict):
            synthesized = _binding_from_ref(
                _converter_namespace(payload),
                materialized.get("catalog_item_id"),
            )
            if synthesized is not None:
                version = materialized.get("catalog_item_version")
                if isinstance(version, str) and version.strip():
                    synthesized["catalog_item_version"] = version.strip()
                return synthesized

    if operation == "add_relay":
        candidate = _extract_binding_from_container(
            payload.get("protection") or payload,
            namespace="ZABEZPIECZENIE",
            ref_keys=("catalog_ref", "catalog_item_id"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_ct":
        candidate = _extract_binding_from_container(
            payload.get("measurement") or payload,
            namespace="CT",
            ref_keys=("catalog_ref", "catalog_item_id"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_vt":
        candidate = _extract_binding_from_container(
            payload.get("measurement") or payload,
            namespace="VT",
            ref_keys=("catalog_ref", "catalog_item_id"),
        )
        if candidate is not None:
            return candidate

    if operation == "add_nn_outgoing_field":
        candidate = _extract_binding_from_container(
            payload,
            namespace="APARAT_NN",
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    if operation in {"insert_branch_pole_on_segment_sn", "insert_zksn_on_segment_sn"}:
        candidate = _extract_binding_from_container(
            payload,
            namespace=_explicit_namespace(payload),
            ref_keys=("catalog_ref",),
        )
        if candidate is not None:
            return candidate

    candidate = _extract_binding_from_container(payload)
    if candidate is not None:
        return candidate

    for key in (
        "segment",
        "branch",
        "load",
        "protection",
        "transformer",
        "transformer_spec",
        "measurement",
        "relay_catalog_binding",
    ):
        nested = payload.get(key)
        if key == "relay_catalog_binding" and isinstance(nested, dict):
            return nested
        candidate = _extract_binding_from_container(nested)
        if candidate is not None:
            return candidate

    return _binding_from_ref(_explicit_namespace(payload), payload.get("catalog_ref"))


#: Operacje stacyjne, które mogą założyć wyposażenie pól w tej samej migawce (B-3).
_STATION_OPERATIONS_WITH_FIELD_EQUIPMENT: frozenset[str] = frozenset(
    {
        "insert_station_on_segment_sn",
        "append_station_on_endpoint",
    }
)

#: Klucz wyposażenia pola → operacja, której bramę katalogową ma przejść.
_FIELD_EQUIPMENT_OPERATIONS: tuple[tuple[str, str], ...] = (
    ("ct", "add_ct"),
    ("vt", "add_vt"),
    ("relay", "add_relay"),
)


def _validate_field_equipment_bindings(
    operation: str,
    payload: dict[str, Any],
) -> CatalogPolicyError | None:
    """B-3: brama katalogowa wyposażenia pól wskazanego w operacji stacyjnej.

    PARYTET TORÓW: CT/VT/zabezpieczenie zakładane W OPERACJI STACYJNEJ przechodzi
    DOKŁADNIE tę samą bramę katalogową co wołane osobno `add_ct`/`add_vt`/
    `add_relay`. Bez tego ta sama pozycja katalogowa byłaby sprawdzana w jednym
    torze, a w drugim nie — czyli tor atomowy byłby furtką omijającą katalog.
    """
    if operation not in _STATION_OPERATIONS_WITH_FIELD_EQUIPMENT:
        return None

    sn_fields = payload.get("sn_fields")
    if not isinstance(sn_fields, list):
        return None

    for index, field in enumerate(sn_fields, start=1):
        if not isinstance(field, dict):
            continue
        equipment = field.get("equipment")
        if not isinstance(equipment, dict):
            continue
        for klucz, nazwa_operacji in _FIELD_EQUIPMENT_OPERATIONS:
            dane = equipment.get(klucz)
            if not isinstance(dane, dict) or not dane:
                continue
            blad, _ = validate_and_materialize_catalog_binding(nazwa_operacji, dane)
            if blad is not None:
                return CatalogPolicyError(
                    code=blad.code,
                    message_pl=f"Pole SN nr {index}: {blad.message_pl}",
                    errors=blad.errors,
                )
    return None


def _append_station_tworzy_transformator(payload: dict[str, Any]) -> bool:
    """Czy `append_station_on_endpoint` w ogóle utworzy transformator?

    Warunek jest LUSTREM warunku operacji domenowej (`if transformer_catalog_ref:`).
    Stacja bez transformatora jest kanoniczna (samo pole liniowe na końcu ciągu) —
    wtedy nie powstaje żaden element wiązany katalogiem TRAFO_SN_NN i nie ma czego
    materializować. Gdy ref JEST podany, brama katalogowa obowiązuje bez wyjątku.
    """
    transformer = payload.get("transformer")
    if not isinstance(transformer, dict):
        return False
    return bool(transformer.get("transformer_catalog_ref") or transformer.get("catalog_ref"))


def validate_and_materialize_catalog_binding(
    operation: str,
    payload: dict[str, Any],
) -> tuple[CatalogPolicyError | None, dict[str, Any]]:
    """Apply canonical catalog policy (binding + materialization dry-run).

    Returns:
      - CatalogPolicyError when operation must be rejected
      - materialized solver params (dry-run) when binding is valid and resolvable
    """
    equipment_error = _validate_field_equipment_bindings(operation, payload)
    if equipment_error is not None:
        return equipment_error, {}

    if operation not in CATALOG_REQUIRED_OPERATIONS:
        return None, {}

    if operation == "append_station_on_endpoint" and not _append_station_tworzy_transformator(
        payload
    ):
        return None, {}

    if operation == "add_grid_source_sn" and _uses_manual_grid_source_equivalent(payload):
        if _manual_grid_source_equivalent_complete(payload):
            return None, {}
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Element techniczny wymaga powiązania z katalogiem",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": (
                            "Ręczny odpowiednik GPZ musi być kompletny albo należy podać "
                            "'catalog_binding'."
                        ),
                    }
                ],
            ),
            {},
        )

    binding_data = extract_catalog_binding(operation, payload)
    if binding_data is None:
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Element techniczny wymaga powiązania z katalogiem",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": (
                            f"Operacja '{operation}' wymaga 'catalog_binding' w payload."
                        ),
                    }
                ],
            ),
            {},
        )

    if operation in {"insert_branch_pole_on_segment_sn", "insert_zksn_on_segment_sn"}:
        from network_model.catalog.mv_branch_point_catalog import get_all_branch_point_types

        catalog_ref = binding_data.get("catalog_item_id")
        known_refs = {record.get("id") for record in get_all_branch_point_types()}
        if catalog_ref in known_refs:
            return None, {}
        return (
            CatalogPolicyError(
                code="catalog.materialization_failed",
                message_pl="Nie znaleziono pozycji katalogowej punktu pośredniego SN",
                errors=[
                    {
                        "code": "catalog.materialization_failed",
                        "message_pl": (
                            f"Pozycja katalogowa '{catalog_ref}' nie istnieje w katalogu "
                            "ZKSN i słupów odgałęźnych SN."
                        ),
                    }
                ],
            ),
            {},
        )

    binding_errors = validate_catalog_binding(binding_data)
    if binding_errors:
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Powiązanie katalogowe jest niekompletne lub niepoprawne",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": e.message_pl,
                    }
                    for e in binding_errors
                ],
            ),
            {},
        )

    try:
        binding = CatalogBinding.from_dict(binding_data)
    except Exception:
        return (
            CatalogPolicyError(
                code="catalog.ref_required",
                message_pl="Powiązanie katalogowe ma nieprawidłowy format",
                errors=[
                    {
                        "code": "catalog.ref_required",
                        "message_pl": "Nie można odczytać danych 'catalog_binding'.",
                    }
                ],
            ),
            {},
        )

    from network_model.catalog.repository import get_default_mv_catalog

    catalog = get_default_mv_catalog()
    mat_result = materialize_catalog_binding(binding, catalog)
    if not mat_result.success:
        return (
            CatalogPolicyError(
                code=mat_result.error_code or "catalog.materialization_failed",
                message_pl=mat_result.error_message_pl or "Błąd materializacji katalogu",
                errors=[
                    {
                        "code": mat_result.error_code or "catalog.materialization_failed",
                        "message_pl": mat_result.error_message_pl or "Błąd materializacji katalogu",
                    }
                ],
            ),
            {},
        )

    return None, mat_result.solver_fields
