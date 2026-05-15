"""Generic vendor adapter dla nowo dodanych marek protection relay
(Siemens SIPROTEC, Schneider Easergy, SEL, GE Multilin, polskie ZPAS/Elester/
Energotest/ZIAD) per K30-16 expansion.

Wszystkie vendory korzystają z wspólnego mapping schemy (50/51/50N/51N + curve).
Per-vendor specific extensions (87T/87L/distance) mogą być dodane w przyszłości
osobnym adapterem.
"""

from __future__ import annotations

from application.analyses.protection.catalog.models import DeviceCapability
from application.analyses.protection.catalog.vendors.base import VendorAdapter

_REQUIRED_LOGICAL_KEYS = ("I51", "TMS51", "I50", "I51N", "TMS51N", "I50N", "CURVE")
_REQUIRED_FUNCTIONS = ("50", "51", "50N", "51N")


class GenericVendorAdapter:
    """Reusable adapter for vendors z standard 50/51/50N/51N feature set."""

    def __init__(self, vendor: str, prefix: str, device_ids: tuple[str, ...]) -> None:
        self._vendor = vendor
        self._prefix = prefix
        self._device_ids = device_ids

    def vendor_name(self) -> str:
        return self._vendor

    def supported_devices(self) -> tuple[str, ...]:
        return self._device_ids

    def validate_vendor_support(
        self,
        mapped_settings: dict[str, float | str],
        *,
        device: DeviceCapability,
    ) -> tuple[bool, tuple[str, ...]]:
        violations: list[str] = []
        for key in _REQUIRED_LOGICAL_KEYS:
            if key not in mapped_settings:
                violations.append(f"VENDOR_MISSING_LOGICAL_KEY_{key}")
        for function_code in _REQUIRED_FUNCTIONS:
            if function_code not in device.functions_supported:
                violations.append(f"VENDOR_UNSUPPORTED_FUNCTION_{function_code}")
        curve = mapped_settings.get("CURVE")
        if curve is not None and curve not in device.curves_supported:
            violations.append("VENDOR_UNSUPPORTED_CURVE")
        return (len(violations) == 0, tuple(violations))

    def map_logical_to_vendor(
        self,
        mapped_settings: dict[str, float | str],
        *,
        device: DeviceCapability,
    ) -> dict[str, float | str | bool]:
        p = self._prefix
        return {
            f"{p}.OC.51.ENABLED": True,
            f"{p}.OC.51.PICKUP_A": mapped_settings["I51"],
            f"{p}.OC.51.TMS": mapped_settings["TMS51"],
            f"{p}.OC.50.ENABLED": True,
            f"{p}.OC.50.PICKUP_A": mapped_settings["I50"],
            f"{p}.EF.51N.ENABLED": True,
            f"{p}.EF.51N.PICKUP_A": mapped_settings["I51N"],
            f"{p}.EF.51N.TMS": mapped_settings["TMS51N"],
            f"{p}.EF.50N.ENABLED": True,
            f"{p}.EF.50N.PICKUP_A": mapped_settings["I50N"],
            f"{p}.OC.CURVE": mapped_settings["CURVE"],
            f"{p}.EF.CURVE": mapped_settings["CURVE"],
        }


# =============================================================================
# Factory functions per vendor — registered z _resolve_vendor_adapter
# =============================================================================

SIEMENS_DEVICES = (
    "SIEMENS_7SJ81",
    "SIEMENS_7SJ82",
    "SIEMENS_7SJ85",
    "SIEMENS_7SD60",
    "SIEMENS_7SD80",
    "SIEMENS_7UT85",
    "SIEMENS_7VK87",
    "SIEMENS_7UM85",
)

SCHNEIDER_DEVICES = (
    "SCHNEIDER_P3F30",
    "SCHNEIDER_P3M30",
    "SCHNEIDER_P5F40",
    "SCHNEIDER_P5L46",
    "SCHNEIDER_P5T87",
)

SEL_DEVICES = (
    "SEL_351",
    "SEL_451",
    "SEL_487E",
    "SEL_411L",
    "SEL_700G",
)

GE_DEVICES = (
    "GE_SR469",
    "GE_SR745",
    "GE_F35",
    "GE_T60",
)

ZPAS_DEVICES = ("ZPAS_RMG2",)
ELESTER_DEVICES = ("ELESTER_ECG3",)
ENERGOTEST_DEVICES = ("ENERGOTEST_GMG110",)
ZIAD_DEVICES = ("ZIAD_ZPRO",)


def build_siemens_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="SIEMENS", prefix="SIPROTEC", device_ids=SIEMENS_DEVICES)  # type: ignore[return-value]


def build_schneider_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="SCHNEIDER", prefix="EASERGY", device_ids=SCHNEIDER_DEVICES)  # type: ignore[return-value]


def build_sel_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="SEL", prefix="SEL", device_ids=SEL_DEVICES)  # type: ignore[return-value]


def build_ge_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="GE", prefix="GE_MULTILIN", device_ids=GE_DEVICES)  # type: ignore[return-value]


def build_zpas_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="ZPAS", prefix="ZPAS", device_ids=ZPAS_DEVICES)  # type: ignore[return-value]


def build_elester_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="ELESTER", prefix="ELESTER", device_ids=ELESTER_DEVICES)  # type: ignore[return-value]


def build_energotest_adapter() -> VendorAdapter:
    return GenericVendorAdapter(
        vendor="ENERGOTEST", prefix="ENERGOTEST", device_ids=ENERGOTEST_DEVICES
    )  # type: ignore[return-value]


def build_ziad_adapter() -> VendorAdapter:
    return GenericVendorAdapter(vendor="ZIAD", prefix="ZIAD", device_ids=ZIAD_DEVICES)  # type: ignore[return-value]
