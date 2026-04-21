"""
Station Field Validation — validate field/device completeness per station.

RUN #3G §2.2: Hard FixAction validations for station fields and apparatus.

CANONICAL RULES:
- Station with nN bus MUST have transformer field (SN/nN)
- PV/BESS variant A without station transformer → FixAction
- PV/BESS variant B without blocking transformer → FixAction
- Relay without CB binding → protection.binding_missing
- Apparatus without catalogRef → CATALOG_REF_MISSING
- Field missing required devices → field.required_device_missing.<type>

INVARIANTS:
- Zero fabrication: missing data → ReadinessIssue, never defaults
- Deterministic: sorted by element_id
- Immutable output (frozen dataclass)
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from domain.readiness import (
    ReadinessAreaV1,
    ReadinessIssueV1,
    ReadinessPriority,
)

# ---------------------------------------------------------------------------
# Station field data model (input)
# ---------------------------------------------------------------------------


class FieldDeviceRequirement(str, Enum):
    """Whether a device is required, optional, or required conditionally."""

    REQUIRED = "REQUIRED"
    REQUIRED_IF = "REQUIRED_IF"
    OPTIONAL = "OPTIONAL"


@dataclass(frozen=True)
class StationFieldV1:
    """A field in a station with its devices."""

    field_id: str
    field_name: str
    pole_type: str
    field_role: str
    station_id: str
    topology_element_id: str | None = None
    devices: tuple[FieldDeviceV1, ...] = ()
    bindings: tuple[DeviceBindingV1, ...] = ()


@dataclass(frozen=True)
class FieldDeviceV1:
    """A device in a field."""

    device_id: str
    aparat_type: str
    device_type: str
    catalog_ref: str | None = None


@dataclass(frozen=True)
class DeviceBindingV1:
    """A logical binding between devices."""

    binding_id: str
    source_device_id: str
    source_device_type: str
    target_device_id: str
    target_device_type: str
    binding_type: str  # RELAY_TO_CB, CT_ON_POWER_PATH, VT_SIDE


@dataclass(frozen=True)
class StationValidationInputV1:
    """Input for station field validation."""

    station_id: str
    station_name: str
    has_nn_bus: bool
    has_transformer_field: bool
    fields: tuple[StationFieldV1, ...] = ()


# ---------------------------------------------------------------------------
# Device requirements per field role (canonical)
# ---------------------------------------------------------------------------

# Minimal required devices per field role
REQUIRED_DEVICES_PER_ROLE: dict[str, list[str]] = {
    "LINE_IN": ["CB", "DS"],
    "LINE_OUT": ["CB", "DS"],
    "LINE_BRANCH": ["CB", "DS"],
    "TRANSFORMER_SN_NN": ["CB", "TRANSFORMER_DEVICE"],
    "PV_SN": ["CB", "CT", "RELAY"],
    "BESS_SN": ["CB", "CT", "RELAY"],
    "COUPLER_SN": ["CB"],
    "BUS_TIE": ["CB"],
    "MAIN_NN": ["ACB"],
    "FEEDER_NN": ["FUSE"],
    "PV_NN": ["ACB", "CT", "RELAY"],
    "BESS_NN": ["ACB", "CT", "RELAY"],
}


# ---------------------------------------------------------------------------
# Validation functions
# ---------------------------------------------------------------------------


def validate_station_fields(
    station: StationValidationInputV1,
) -> list[ReadinessIssueV1]:
    """Validate all fields in a station.

    Returns list of ReadinessIssueV1 sorted by element_id.
    """
    issues: list[ReadinessIssueV1] = []

    # Rule: station with nN bus must have transformer field
    if station.has_nn_bus and not station.has_transformer_field:
        issues.append(
            ReadinessIssueV1(
                code="station.nn_without_transformer",
                area=ReadinessAreaV1.STATIONS,
                priority=ReadinessPriority.BLOCKER,
                message_pl=(
                    f"Stacja '{station.station_name}' ({station.station_id}): "
                    f"posiada szynę nN, ale brak pola transformatorowego SN/nN"
                ),
                element_id=station.station_id,
                element_type="STATION",
                fix_hint_pl="Dodaj pole transformatorowe SN/nN w kreatorze rozdzielnicy",
                wizard_step="switchgear",
            )
        )

    for field in sorted(station.fields, key=lambda f: f.field_id):
        issues.extend(_validate_single_field(field))

    return sorted(issues, key=lambda i: i.element_id or "")


def _validate_single_field(field: StationFieldV1) -> list[ReadinessIssueV1]:
    """Validate a single field: required devices, catalog refs, bindings."""
    issues: list[ReadinessIssueV1] = []

    # Check required devices
    required = REQUIRED_DEVICES_PER_ROLE.get(field.field_role, [])
    existing_types = {d.device_type for d in field.devices}

    for req_type in required:
        if req_type not in existing_types:
            issues.append(
                ReadinessIssueV1(
                    code=f"field.device_missing.{req_type.lower()}",
                    area=ReadinessAreaV1.STATIONS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Pole '{field.field_name}' ({field.field_id}): "
                        f"brak wymaganego aparatu typu {req_type}"
                    ),
                    element_id=field.field_id,
                    element_type="FIELD",
                    fix_hint_pl=f"Dodaj aparat {req_type} w polu {field.field_name}",
                    wizard_step="switchgear",
                )
            )

    # Check catalog refs
    for device in field.devices:
        if not device.catalog_ref:
            issues.append(
                ReadinessIssueV1(
                    code="catalog.ref_missing",
                    area=ReadinessAreaV1.CATALOGS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Aparat '{device.aparat_type}' ({device.device_id}) "
                        f"w polu '{field.field_name}': brak referencji katalogowej"
                    ),
                    element_id=device.device_id,
                    element_type="DEVICE",
                    fix_hint_pl="Przypisz pozycję katalogową do aparatu",
                    wizard_step="switchgear",
                )
            )

    # Check protection bindings: CB with relay requires binding
    has_cb = any(d.device_type in ("CB", "ACB") for d in field.devices)
    has_relay = any(d.device_type == "RELAY" for d in field.devices)
    if has_cb and has_relay:
        relay_bound = any(b.binding_type == "RELAY_TO_CB" for b in field.bindings)
        if not relay_bound:
            issues.append(
                ReadinessIssueV1(
                    code="protection.binding_missing",
                    area=ReadinessAreaV1.PROTECTION,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        f"Pole '{field.field_name}' ({field.field_id}): "
                        f"zabezpieczenie nie powiązane z wyłącznikiem"
                    ),
                    element_id=field.field_id,
                    element_type="FIELD",
                    fix_hint_pl="Ustaw powiązanie zabezpieczenie→wyłącznik w edytorze pola",
                    wizard_step="switchgear",
                )
            )

    return issues


def validate_pv_bess_variant_a(
    *,
    generator_id: str,
    generator_name: str,
    station_id: str | None,
    station_has_transformer: bool,
) -> list[ReadinessIssueV1]:
    """Validate PV/BESS variant A: nn_side requires station transformer.

    RUN #3G §2.2: FixAction generator.nn_variant_requires_station_transformer.
    """
    issues: list[ReadinessIssueV1] = []

    if station_id and not station_has_transformer:
        issues.append(
            ReadinessIssueV1(
                code="generator.nn_variant_requires_station_transformer",
                area=ReadinessAreaV1.GENERATORS,
                priority=ReadinessPriority.BLOCKER,
                message_pl=(
                    f"Generator '{generator_name}' ({generator_id}): "
                    f"wariant A (nN) wymaga transformatora stacyjnego w stacji '{station_id}'"
                ),
                element_id=generator_id,
                element_type="GENERATOR",
                fix_hint_pl=(
                    "Dodaj pole transformatorowe SN/nN w stacji "
                    "lub zmień wariant na B (transformator blokowy)"
                ),
                wizard_step="switchgear",
            )
        )

    return issues


def validate_pv_bess_variant_b(
    *,
    generator_id: str,
    generator_name: str,
    blocking_transformer_ref: str | None,
    blocking_transformer_has_catalog: bool,
) -> list[ReadinessIssueV1]:
    """Validate PV/BESS variant B: block_transformer requires ref + catalog.

    RUN #3G §2.2: FixAction generator.block_variant_requires_block_transformer.
    """
    issues: list[ReadinessIssueV1] = []

    if not blocking_transformer_ref:
        issues.append(
            ReadinessIssueV1(
                code="generator.block_variant_requires_block_transformer",
                area=ReadinessAreaV1.GENERATORS,
                priority=ReadinessPriority.BLOCKER,
                message_pl=(
                    f"Generator '{generator_name}' ({generator_id}): "
                    f"wariant B wymaga transformatora blokowego"
                ),
                element_id=generator_id,
                element_type="GENERATOR",
                fix_hint_pl="Wskaż transformator blokowy w kreatorze",
                wizard_step="switchgear",
            )
        )
    elif not blocking_transformer_has_catalog:
        issues.append(
            ReadinessIssueV1(
                code="generator.block_transformer_catalog_missing",
                area=ReadinessAreaV1.CATALOGS,
                priority=ReadinessPriority.BLOCKER,
                message_pl=(
                    f"Generator '{generator_name}' ({generator_id}): "
                    f"transformator blokowy '{blocking_transformer_ref}' bez katalogu"
                ),
                element_id=generator_id,
                element_type="GENERATOR",
                fix_hint_pl="Przypisz katalog do transformatora blokowego",
                wizard_step="switchgear",
            )
        )

    return issues
