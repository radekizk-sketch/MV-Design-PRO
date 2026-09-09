from __future__ import annotations

from typing import Any

from application.analyses.protection.catalog.catalog_store import load_device_capability
from application.analyses.protection.catalog.mapper import map_requirement_to_device
from application.analyses.protection.catalog.models import (
    DeviceCapability,
    DeviceMappingResult,
    ProtectionRequirementV0,
)
from application.analyses.protection.catalog.vendors.abb_v0 import (
    VENDOR as ABB_VENDOR,
)
from application.analyses.protection.catalog.vendors.abb_v0 import (
    build_adapter as build_abb_adapter,
)
from application.analyses.protection.catalog.vendors.base import VendorAdapter
from application.analyses.protection.catalog.vendors.elektrometal_etango_v0 import (
    VENDOR as ELEKTROMETAL_VENDOR,
)
from application.analyses.protection.catalog.vendors.elektrometal_etango_v0 import (
    build_adapter as build_elektrometal_adapter,
)
from application.analyses.protection.catalog.vendors.generic_v1 import (
    build_elester_adapter,
    build_energotest_adapter,
    build_ge_adapter,
    build_schneider_adapter,
    build_sel_adapter,
    build_siemens_adapter,
    build_ziad_adapter,
    build_zpas_adapter,
)


def dopasuj_do_aparatu(requirement: ProtectionRequirementV0, *, device_id: str) -> dict[str, Any]:
    """Dobór aparatu dla WYMAGANIA już policzonego (karta W3-C1).

    Czysta funkcja: żadnego biegu, żadnej koperty, żadnego zapisu — trasa
    `GET .../nastawy/dopasowanie` woła ją wprost z wymaganiem wyprowadzonym z
    wyniku Hoppela (`mapper.wymaganie_z_nastaw`). Zastępuje dawny
    `run_device_mapping_v0` (V12K-189, indeks doboru urządzeń), którego JEDYNYM
    dostawcą wymagania był indeks biegu starej metodyki nastaw (ta sama kasacja
    V12K-189) — tor skasowany razem z resztą V12K-189 (zero konsumentów
    produkcyjnych).
    """
    capability = load_device_capability(device_id)
    if capability is None:
        mapping_result = DeviceMappingResult(
            compatible=False,
            violations=("DEVICE_NOT_FOUND",),
            mapped_settings={},
            assumptions=("MAPPING_SKIPPED_NO_DEVICE",),
        )
        vendor_mapping = _build_vendor_mapping(mapping_result=mapping_result, capability=None)
        status = "FAILED"
    else:
        mapping_result = map_requirement_to_device(requirement, capability)
        vendor_mapping = _build_vendor_mapping(mapping_result=mapping_result, capability=capability)
        if mapping_result.compatible and vendor_mapping["vendor_violations"]:
            status = "DEGRADED"
        else:
            status = "SUCCEEDED" if mapping_result.compatible else "DEGRADED"

    return {
        "status": status,
        "compatible": mapping_result.compatible,
        "violations": mapping_result.violations,
        "mapped_settings": mapping_result.mapped_settings,
        "assumptions": mapping_result.assumptions,
        "vendor_mapping": vendor_mapping,
        "wymaganie": requirement.to_dict(),
        "device_id": device_id,
        "capability": capability.to_dict() if capability is not None else None,
    }


def _resolve_vendor_adapter(vendor: str | None) -> VendorAdapter | None:
    # K30-16: rozszerzona rodzina vendor-adapterów po expansion catalogów
    # (E2Tango full + SIPROTEC + Relion + Easergy + SEL + GE Multilin + Polish).
    if vendor == ABB_VENDOR:
        return build_abb_adapter()
    if vendor == ELEKTROMETAL_VENDOR:
        return build_elektrometal_adapter()
    if vendor == "SIEMENS":
        return build_siemens_adapter()
    if vendor == "SCHNEIDER":
        return build_schneider_adapter()
    if vendor == "SEL":
        return build_sel_adapter()
    if vendor == "GE":
        return build_ge_adapter()
    if vendor == "ZPAS":
        return build_zpas_adapter()
    if vendor == "ELESTER":
        return build_elester_adapter()
    if vendor == "ENERGOTEST":
        return build_energotest_adapter()
    if vendor == "ZIAD":
        return build_ziad_adapter()
    return None


def _build_vendor_mapping(
    *,
    mapping_result: DeviceMappingResult,
    capability: DeviceCapability | None,
) -> dict[str, Any]:
    if capability is None:
        return {
            "vendor": "UNKNOWN",
            "vendor_settings": {},
            "vendor_violations": ["VENDOR_DEVICE_NOT_FOUND"],
            "vendor_assumptions": [],
        }
    if capability.vendor is None:
        # Profil REFERENCYJNY bez marki (karta FAB-A/D-33): brak producenta jest
        # ZAMIERZONY, nie brakiem adaptera do zarejestrowania — nastawy logiczne
        # (I51/TMS51/...) sa juz w `mapping_result.mapped_settings`; wymyslanie
        # tu nienazwanej konwencji kluczy producenta byloby ta sama klasa
        # fabrykacji, ktora ta karta usuwa. Brak mapowania NIE jest naruszeniem.
        return {
            "vendor": None,
            "vendor_settings": {},
            "vendor_violations": [],
            "vendor_assumptions": ["VENDOR_MAPPING_NOT_APPLICABLE_REFERENCE_PROFILE"],
        }
    adapter = _resolve_vendor_adapter(capability.vendor)
    if adapter is None:
        return {
            "vendor": capability.vendor,
            "vendor_settings": {},
            "vendor_violations": ["VENDOR_ADAPTER_NOT_FOUND"],
            "vendor_assumptions": [],
        }
    _, violations = adapter.validate_vendor_support(
        mapping_result.mapped_settings, device=capability
    )
    vendor_settings: dict[str, Any] = {}
    vendor_assumptions: list[str] = []
    if not violations and mapping_result.compatible:
        vendor_settings = adapter.map_logical_to_vendor(
            mapping_result.mapped_settings,
            device=capability,
        )
        vendor_assumptions = ["VENDOR_KEYS_SYMBOLIC_V0"]
    return {
        "vendor": adapter.vendor_name(),
        "vendor_settings": vendor_settings,
        "vendor_violations": list(violations),
        "vendor_assumptions": vendor_assumptions,
    }
