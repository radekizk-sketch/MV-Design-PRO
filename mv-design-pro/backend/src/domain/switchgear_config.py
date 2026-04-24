"""
SwitchgearConfigV1 — Konfiguracja rozdzielnicy (pola/aparaty/katalogi/ochrona).

RUN #3I COMMIT 1: Kontrakt domenowy konfiguracji rozdzielnicy.

CANONICAL CONTRACT (BINDING):
- Immutable (frozen dataclass).
- Deterministic: sortowanie po id, kanoniczny hash SHA-256, permutation invariant.
- ZAKAZ auto-uzupelnien: brak danych -> FixAction (stabilny kod PL).
- ZAKAZ domyslnych parametrow urzadzen — brak = ValidationIssue + FixAction.
- PV/BESS zawsze przez transformator (SN/nN lub blokowy).
- catalogRef wymagany dla kazdego aparatu — brak -> CATALOG_REF_MISSING.

ALIGNMENT:
- backend: field_device.py (PoleTypeV1, AparatTypeV1, FieldRoleV1, DeviceTypeV1)
- backend: readiness.py (ReadinessIssueV1, ReadinessPriority, ReadinessAreaV1)
- frontend: switchgearConfig.ts (1:1 mirror)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from .field_device import (
    AparatTypeV1,
    DeviceTypeV1,
    FieldRoleV1,
    PoleTypeV1,
)

# =============================================================================
# VERSION
# =============================================================================

SWITCHGEAR_CONFIG_VERSION = "1.0"


# =============================================================================
# VALIDATION ISSUE SEVERITY
# =============================================================================


class ConfigIssueSeverity(str, Enum):
    """Waga problemu walidacji konfiguracji."""

    BLOCKER = "BLOCKER"
    WARNING = "WARNING"


# =============================================================================
# VALIDATION ISSUE
# =============================================================================


@dataclass(frozen=True)
class ConfigValidationIssueV1:
    """Pojedynczy problem walidacji konfiguracji rozdzielnicy.

    Stabilny kod, komunikat PL, wskazanie elementu.
    """

    code: str
    severity: ConfigIssueSeverity
    message_pl: str
    element_id: str | None = None
    field_id: str | None = None
    device_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "device_id": self.device_id,
            "element_id": self.element_id,
            "field_id": self.field_id,
            "message_pl": self.message_pl,
            "severity": self.severity.value,
        }


# =============================================================================
# FIX ACTION
# =============================================================================


class FixActionType(str, Enum):
    """Typ akcji naprawczej."""

    NAVIGATE_TO_WIZARD_FIELD = "NAVIGATE_TO_WIZARD_FIELD"
    NAVIGATE_TO_WIZARD_DEVICE = "NAVIGATE_TO_WIZARD_DEVICE"
    NAVIGATE_TO_WIZARD_CATALOG_PICKER = "NAVIGATE_TO_WIZARD_CATALOG_PICKER"
    NAVIGATE_TO_WIZARD_PROTECTION = "NAVIGATE_TO_WIZARD_PROTECTION"


@dataclass(frozen=True)
class ConfigFixActionV1:
    """Akcja naprawcza konfiguracji rozdzielnicy.

    Stabilny kod, PL komunikat, parametry nawigacji.
    """

    code: str
    action: FixActionType
    message_pl: str
    station_id: str
    field_id: str | None = None
    device_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "code": self.code,
            "device_id": self.device_id,
            "field_id": self.field_id,
            "message_pl": self.message_pl,
            "station_id": self.station_id,
        }


# =============================================================================
# CATALOG BINDING V1
# =============================================================================


@dataclass(frozen=True)
class CatalogBindingV1:
    """Powiazanie aparatu z katalogiem.

    ZAKAZ: brak catalogRef -> hard error (CATALOG_REF_MISSING).
    """

    device_id: str
    catalog_id: str
    catalog_name: str
    manufacturer: str | None = None
    catalog_version: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "catalog_id": self.catalog_id,
            "catalog_name": self.catalog_name,
            "catalog_version": self.catalog_version,
            "device_id": self.device_id,
            "manufacturer": self.manufacturer,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> CatalogBindingV1:
        return CatalogBindingV1(
            device_id=data["device_id"],
            catalog_id=data["catalog_id"],
            catalog_name=data["catalog_name"],
            manufacturer=data.get("manufacturer"),
            catalog_version=data.get("catalog_version"),
        )


# =============================================================================
# PROTECTION BINDING V1
# =============================================================================


@dataclass(frozen=True)
class ProtectionBindingV1:
    """Powiazanie zabezpieczenia (RELAY) z wylacznikiem (CB).

    ZAKAZ: brak powiazania -> hard error (PROTECTION_BINDING_MISSING).
    """

    relay_device_id: str
    cb_device_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "cb_device_id": self.cb_device_id,
            "relay_device_id": self.relay_device_id,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> ProtectionBindingV1:
        return ProtectionBindingV1(
            relay_device_id=data["relay_device_id"],
            cb_device_id=data["cb_device_id"],
        )


# =============================================================================
# DEVICE CONFIG V1
# =============================================================================


@dataclass(frozen=True)
class DeviceConfigV1:
    """Konfiguracja aparatu w polu rozdzielnicy."""

    device_id: str
    field_id: str
    device_type: DeviceTypeV1
    aparat_type: AparatTypeV1

    def to_dict(self) -> dict[str, Any]:
        return {
            "aparat_type": self.aparat_type.value,
            "device_id": self.device_id,
            "device_type": self.device_type.value,
            "field_id": self.field_id,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> DeviceConfigV1:
        return DeviceConfigV1(
            device_id=data["device_id"],
            field_id=data["field_id"],
            device_type=DeviceTypeV1(data["device_type"]),
            aparat_type=AparatTypeV1(data["aparat_type"]),
        )


# =============================================================================
# FIELD CONFIG V1
# =============================================================================


@dataclass(frozen=True)
class FieldConfigV1:
    """Konfiguracja pola rozdzielnicy."""

    field_id: str
    pole_type: PoleTypeV1
    field_role: FieldRoleV1
    bus_section_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "bus_section_id": self.bus_section_id,
            "field_id": self.field_id,
            "field_role": self.field_role.value,
            "pole_type": self.pole_type.value,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> FieldConfigV1:
        return FieldConfigV1(
            field_id=data["field_id"],
            pole_type=PoleTypeV1(data["pole_type"]),
            field_role=FieldRoleV1(data["field_role"]),
            bus_section_id=data.get("bus_section_id"),
        )


# =============================================================================
# SWITCHGEAR CONFIG V1
# =============================================================================


@dataclass(frozen=True)
class SwitchgearConfigV1:
    """Konfiguracja rozdzielnicy — zamrozony kontrakt domenowy.

    Jedno zrodlo prawdy dla konfiguracji pol, aparatow, katalogow, ochrony.
    Deterministyczny: ten sam zestaw danych -> ten sam canonical_hash (SHA-256).
    """

    config_version: str = SWITCHGEAR_CONFIG_VERSION
    station_id: str = ""
    fields: tuple[FieldConfigV1, ...] = field(default_factory=tuple)
    devices: tuple[DeviceConfigV1, ...] = field(default_factory=tuple)
    catalog_bindings: tuple[CatalogBindingV1, ...] = field(default_factory=tuple)
    protection_bindings: tuple[ProtectionBindingV1, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do dict (kanoniczny format — klucze posortowane)."""
        return {
            "catalog_bindings": [b.to_dict() for b in self.catalog_bindings],
            "config_version": self.config_version,
            "devices": [d.to_dict() for d in self.devices],
            "fields": [f.to_dict() for f in self.fields],
            "protection_bindings": [p.to_dict() for p in self.protection_bindings],
            "station_id": self.station_id,
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> SwitchgearConfigV1:
        """Deserializacja z dict."""
        return SwitchgearConfigV1(
            config_version=data.get("config_version", SWITCHGEAR_CONFIG_VERSION),
            station_id=data.get("station_id", ""),
            fields=tuple(FieldConfigV1.from_dict(f) for f in data.get("fields", [])),
            devices=tuple(DeviceConfigV1.from_dict(d) for d in data.get("devices", [])),
            catalog_bindings=tuple(
                CatalogBindingV1.from_dict(b) for b in data.get("catalog_bindings", [])
            ),
            protection_bindings=tuple(
                ProtectionBindingV1.from_dict(p) for p in data.get("protection_bindings", [])
            ),
        )


# =============================================================================
# CANONICAL SERIALIZATION + HASHING
# =============================================================================


def canonicalize_config(config: SwitchgearConfigV1) -> SwitchgearConfigV1:
    """Kanonizuje konfiguracje — sortuje deterministycznie.

    Sortowanie:
    - fields: po field_id
    - devices: po device_id
    - catalog_bindings: po device_id
    - protection_bindings: po relay_device_id, cb_device_id
    """
    return SwitchgearConfigV1(
        config_version=config.config_version,
        station_id=config.station_id,
        fields=tuple(sorted(config.fields, key=lambda f: f.field_id)),
        devices=tuple(sorted(config.devices, key=lambda d: d.device_id)),
        catalog_bindings=tuple(sorted(config.catalog_bindings, key=lambda b: b.device_id)),
        protection_bindings=tuple(
            sorted(
                config.protection_bindings,
                key=lambda p: (p.relay_device_id, p.cb_device_id),
            )
        ),
    )


def compute_config_hash(config: SwitchgearConfigV1) -> str:
    """Oblicza deterministyczny SHA-256 hash konfiguracji.

    Hash liczy sie z PELNEJ konfiguracji (kanoniczny JSON):
    - Klucze JSON posortowane alfabetycznie (sort_keys=True).
    - BEZ timestampow, identyfikatorow sesji.
    - Permutation invariant (sort po id przed hashowaniem).
    """
    canonical = canonicalize_config(config)
    data = canonical.to_dict()
    json_str = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


# =============================================================================
# VALIDATION CODES (stable PL)
# =============================================================================


class SwitchgearConfigValidationCode(str, Enum):
    """Stabilne kody walidacji konfiguracji rozdzielnicy."""

    CATALOG_REF_MISSING = "catalog.ref_missing"
    FIELD_MISSING_REQUIRED_DEVICE = "field.missing_required_device"
    DEVICE_MISSING_REQUIRED_PARAMETER = "device.missing_required_parameter"
    PROTECTION_BINDING_MISSING = "protection.binding_missing"
    PV_BESS_TRANSFORMER_MISSING = "pv_bess.transformer_missing"
    FIELD_DUPLICATE_ID = "field.duplicate_id"
    DEVICE_DUPLICATE_ID = "device.duplicate_id"
    DEVICE_ORPHAN = "device.orphan_no_field"
    CATALOG_BINDING_ORPHAN = "catalog_binding.orphan_no_device"
    PROTECTION_BINDING_ORPHAN = "protection_binding.orphan_no_device"


# Polish messages for validation codes
_VALIDATION_MESSAGES_PL: dict[str, str] = {
    SwitchgearConfigValidationCode.CATALOG_REF_MISSING: (
        "Brak referencji katalogowej dla aparatu {device_id} ({device_type})"
    ),
    SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE: (
        "Pole {field_id} ({pole_type}): brak wymaganego aparatu {device_type}"
    ),
    SwitchgearConfigValidationCode.DEVICE_MISSING_REQUIRED_PARAMETER: (
        "Aparat {device_id} ({device_type}): brak wymaganego parametru"
    ),
    SwitchgearConfigValidationCode.PROTECTION_BINDING_MISSING: (
        "Zabezpieczenie {device_id}: brak powiazania z wylacznikiem (CB)"
    ),
    SwitchgearConfigValidationCode.PV_BESS_TRANSFORMER_MISSING: (
        "Pole {field_id} ({pole_type}): generator PV/BESS wymaga transformatora"
    ),
    SwitchgearConfigValidationCode.FIELD_DUPLICATE_ID: ("Zduplikowane ID pola: {field_id}"),
    SwitchgearConfigValidationCode.DEVICE_DUPLICATE_ID: ("Zduplikowane ID aparatu: {device_id}"),
    SwitchgearConfigValidationCode.DEVICE_ORPHAN: ("Aparat {device_id}: brak pola o ID {field_id}"),
    SwitchgearConfigValidationCode.CATALOG_BINDING_ORPHAN: (
        "Powiazanie katalogowe: brak aparatu o ID {device_id}"
    ),
    SwitchgearConfigValidationCode.PROTECTION_BINDING_ORPHAN: (
        "Powiazanie ochronne: brak aparatu o ID {device_id}"
    ),
}


# =============================================================================
# REQUIRED DEVICE TYPES per FieldRole (minimal set)
# =============================================================================

# Maps FieldRole -> list of DeviceTypeV1 that are REQUIRED (always)
_REQUIRED_DEVICES: dict[FieldRoleV1, list[DeviceTypeV1]] = {
    FieldRoleV1.GPZ_LINE_BAY: [
        DeviceTypeV1.DS,
        DeviceTypeV1.CB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.ES,
        DeviceTypeV1.CABLE_HEAD,
    ],
    FieldRoleV1.LINE_IN: [DeviceTypeV1.CB, DeviceTypeV1.CABLE_HEAD],
    FieldRoleV1.LINE_OUT: [DeviceTypeV1.CB, DeviceTypeV1.CABLE_HEAD],
    FieldRoleV1.LINE_BRANCH: [DeviceTypeV1.CB, DeviceTypeV1.CABLE_HEAD],
    FieldRoleV1.TRANSFORMER_SN_NN: [
        DeviceTypeV1.CB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.TRANSFORMER_DEVICE,
        DeviceTypeV1.CABLE_HEAD,
    ],
    FieldRoleV1.MEASUREMENT_SN: [DeviceTypeV1.VT],
    FieldRoleV1.PV_SN: [
        DeviceTypeV1.CB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.GENERATOR_PV,
        DeviceTypeV1.CABLE_HEAD,
    ],
    FieldRoleV1.BESS_SN: [
        DeviceTypeV1.CB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.GENERATOR_BESS,
        DeviceTypeV1.CABLE_HEAD,
    ],
    FieldRoleV1.COUPLER_SN: [DeviceTypeV1.DS, DeviceTypeV1.CB],
    FieldRoleV1.BUS_TIE: [DeviceTypeV1.DS, DeviceTypeV1.CB],
    FieldRoleV1.MAIN_NN: [DeviceTypeV1.ACB],
    FieldRoleV1.FEEDER_NN: [DeviceTypeV1.FUSE],
    FieldRoleV1.PV_NN: [
        DeviceTypeV1.ACB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.GENERATOR_PV,
    ],
    FieldRoleV1.BESS_NN: [
        DeviceTypeV1.ACB,
        DeviceTypeV1.CT,
        DeviceTypeV1.RELAY,
        DeviceTypeV1.GENERATOR_BESS,
    ],
}

# FieldRoles requiring transformer for PV/BESS
_PV_BESS_FIELD_ROLES: set[FieldRoleV1] = {
    FieldRoleV1.PV_SN,
    FieldRoleV1.BESS_SN,
    FieldRoleV1.PV_NN,
    FieldRoleV1.BESS_NN,
}


# =============================================================================
# VALIDATION RESULT
# =============================================================================


@dataclass(frozen=True)
class SwitchgearConfigValidationResultV1:
    """Wynik walidacji konfiguracji rozdzielnicy."""

    valid: bool
    issues: tuple[ConfigValidationIssueV1, ...] = field(default_factory=tuple)
    fix_actions: tuple[ConfigFixActionV1, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "fix_actions": [fa.to_dict() for fa in self.fix_actions],
            "issues": [i.to_dict() for i in self.issues],
            "valid": self.valid,
        }


# =============================================================================
# VALIDATOR
# =============================================================================


def validate_switchgear_config(
    config: SwitchgearConfigV1,
) -> SwitchgearConfigValidationResultV1:
    """Waliduje konfiguracje rozdzielnicy.

    Reguly:
    1. Brak zduplikowanych ID pol i aparatow.
    2. Kazdy aparat musi byc przypisany do istniejacego pola.
    3. Kazdy aparat musi miec catalogRef (via catalog_bindings).
    4. Pole musi miec wymagane aparaty (per FieldRole).
    5. Relay musi miec powiazanie z CB (via protection_bindings).
    6. PV/BESS na SN wymaga transformatora w polu.

    ZAKAZ heurystyk, auto-uzupelnien, domyslnych wartosci.
    """
    issues: list[ConfigValidationIssueV1] = []
    fix_actions: list[ConfigFixActionV1] = []

    field_ids = {f.field_id for f in config.fields}
    device_ids = {d.device_id for d in config.devices}
    catalog_bound_ids = {b.device_id for b in config.catalog_bindings}
    relay_bound_ids = {p.relay_device_id for p in config.protection_bindings}

    # --- Rule 1: Duplicate field IDs ---
    seen_field_ids: set[str] = set()
    for f in config.fields:
        if f.field_id in seen_field_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.FIELD_DUPLICATE_ID,
                    severity=ConfigIssueSeverity.BLOCKER,
                    message_pl=f"Zduplikowane ID pola: {f.field_id}",
                    element_id=f.field_id,
                    field_id=f.field_id,
                )
            )
        seen_field_ids.add(f.field_id)

    # --- Rule 1: Duplicate device IDs ---
    seen_device_ids: set[str] = set()
    for d in config.devices:
        if d.device_id in seen_device_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.DEVICE_DUPLICATE_ID,
                    severity=ConfigIssueSeverity.BLOCKER,
                    message_pl=f"Zduplikowane ID aparatu: {d.device_id}",
                    element_id=d.device_id,
                    device_id=d.device_id,
                )
            )
        seen_device_ids.add(d.device_id)

    # --- Rule 2: Device must belong to existing field ---
    for d in config.devices:
        if d.field_id not in field_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.DEVICE_ORPHAN,
                    severity=ConfigIssueSeverity.BLOCKER,
                    message_pl=(f"Aparat {d.device_id}: brak pola o ID {d.field_id}"),
                    element_id=d.device_id,
                    field_id=d.field_id,
                    device_id=d.device_id,
                )
            )

    # --- Rule 3: Catalog ref required for every device ---
    for d in config.devices:
        if d.device_id not in catalog_bound_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.CATALOG_REF_MISSING,
                    severity=ConfigIssueSeverity.BLOCKER,
                    message_pl=(
                        f"Brak referencji katalogowej dla aparatu "
                        f"{d.device_id} ({d.device_type.value})"
                    ),
                    element_id=d.device_id,
                    field_id=d.field_id,
                    device_id=d.device_id,
                )
            )
            fix_actions.append(
                ConfigFixActionV1(
                    code=SwitchgearConfigValidationCode.CATALOG_REF_MISSING,
                    action=FixActionType.NAVIGATE_TO_WIZARD_CATALOG_PICKER,
                    message_pl=(
                        f"Przypisz katalog do aparatu {d.device_id} " f"({d.device_type.value})"
                    ),
                    station_id=config.station_id,
                    field_id=d.field_id,
                    device_id=d.device_id,
                )
            )

    # --- Rule 4: Required devices per field ---
    for f in config.fields:
        field_devices = [d for d in config.devices if d.field_id == f.field_id]
        field_device_types = {d.device_type for d in field_devices}
        required = _REQUIRED_DEVICES.get(f.field_role, [])
        for req_type in required:
            if req_type not in field_device_types:
                issues.append(
                    ConfigValidationIssueV1(
                        code=SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE,
                        severity=ConfigIssueSeverity.BLOCKER,
                        message_pl=(
                            f"Pole {f.field_id} ({f.pole_type.value}): "
                            f"brak wymaganego aparatu {req_type.value}"
                        ),
                        element_id=f.field_id,
                        field_id=f.field_id,
                    )
                )
                fix_actions.append(
                    ConfigFixActionV1(
                        code=SwitchgearConfigValidationCode.FIELD_MISSING_REQUIRED_DEVICE,
                        action=FixActionType.NAVIGATE_TO_WIZARD_FIELD,
                        message_pl=(f"Dodaj aparat {req_type.value} do pola {f.field_id}"),
                        station_id=config.station_id,
                        field_id=f.field_id,
                    )
                )

    # --- Rule 5: Relay must have protection binding ---
    relay_devices = [d for d in config.devices if d.device_type == DeviceTypeV1.RELAY]
    for relay in relay_devices:
        if relay.device_id not in relay_bound_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.PROTECTION_BINDING_MISSING,
                    severity=ConfigIssueSeverity.BLOCKER,
                    message_pl=(
                        f"Zabezpieczenie {relay.device_id}: " f"brak powiazania z wylacznikiem (CB)"
                    ),
                    element_id=relay.device_id,
                    field_id=relay.field_id,
                    device_id=relay.device_id,
                )
            )
            fix_actions.append(
                ConfigFixActionV1(
                    code=SwitchgearConfigValidationCode.PROTECTION_BINDING_MISSING,
                    action=FixActionType.NAVIGATE_TO_WIZARD_PROTECTION,
                    message_pl=(f"Przypisz zabezpieczenie {relay.device_id} " f"do wylacznika CB"),
                    station_id=config.station_id,
                    field_id=relay.field_id,
                    device_id=relay.device_id,
                )
            )

    # --- Rule 6: PV/BESS fields on SN need transformer ---
    pv_bess_sn_roles = {FieldRoleV1.PV_SN, FieldRoleV1.BESS_SN}
    for f in config.fields:
        if f.field_role in pv_bess_sn_roles:
            field_devices = [d for d in config.devices if d.field_id == f.field_id]
            has_transformer = any(
                d.device_type == DeviceTypeV1.TRANSFORMER_DEVICE for d in field_devices
            )
            if not has_transformer:
                issues.append(
                    ConfigValidationIssueV1(
                        code=SwitchgearConfigValidationCode.PV_BESS_TRANSFORMER_MISSING,
                        severity=ConfigIssueSeverity.BLOCKER,
                        message_pl=(
                            f"Pole {f.field_id} ({f.pole_type.value}): "
                            f"zrodlo PV/BESS wymaga transformatora — "
                            f"brak transformatora w torze przylaczenia"
                        ),
                        element_id=f.field_id,
                        field_id=f.field_id,
                    )
                )
                fix_actions.append(
                    ConfigFixActionV1(
                        code=SwitchgearConfigValidationCode.PV_BESS_TRANSFORMER_MISSING,
                        action=FixActionType.NAVIGATE_TO_WIZARD_FIELD,
                        message_pl=(f"Dodaj transformator do pola {f.field_id}"),
                        station_id=config.station_id,
                        field_id=f.field_id,
                    )
                )

    # --- Orphan catalog bindings ---
    for b in config.catalog_bindings:
        if b.device_id not in device_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.CATALOG_BINDING_ORPHAN,
                    severity=ConfigIssueSeverity.WARNING,
                    message_pl=(f"Powiazanie katalogowe: brak aparatu o ID {b.device_id}"),
                    element_id=b.device_id,
                    device_id=b.device_id,
                )
            )

    # --- Orphan protection bindings ---
    for p in config.protection_bindings:
        if p.relay_device_id not in device_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.PROTECTION_BINDING_ORPHAN,
                    severity=ConfigIssueSeverity.WARNING,
                    message_pl=(f"Powiazanie ochronne: brak aparatu o ID " f"{p.relay_device_id}"),
                    element_id=p.relay_device_id,
                    device_id=p.relay_device_id,
                )
            )
        if p.cb_device_id not in device_ids:
            issues.append(
                ConfigValidationIssueV1(
                    code=SwitchgearConfigValidationCode.PROTECTION_BINDING_ORPHAN,
                    severity=ConfigIssueSeverity.WARNING,
                    message_pl=(f"Powiazanie ochronne: brak aparatu o ID " f"{p.cb_device_id}"),
                    element_id=p.cb_device_id,
                    device_id=p.cb_device_id,
                )
            )

    # Sort issues deterministically
    sorted_issues = tuple(
        sorted(
            issues,
            key=lambda i: (
                i.severity.value,
                i.code,
                i.element_id or "",
                i.field_id or "",
                i.device_id or "",
            ),
        )
    )

    sorted_fix_actions = tuple(
        sorted(
            fix_actions,
            key=lambda fa: (
                fa.code,
                fa.station_id,
                fa.field_id or "",
                fa.device_id or "",
            ),
        )
    )

    has_blockers = any(i.severity == ConfigIssueSeverity.BLOCKER for i in sorted_issues)

    return SwitchgearConfigValidationResultV1(
        valid=not has_blockers,
        issues=sorted_issues,
        fix_actions=sorted_fix_actions,
    )
