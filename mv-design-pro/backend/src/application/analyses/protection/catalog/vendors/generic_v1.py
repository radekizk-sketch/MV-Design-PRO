"""Generic vendor adapter dla nowo dodanych marek protection relay
(Siemens SIPROTEC, Schneider Easergy, SEL, GE Multilin, polskie ZPAS/Elester/
Energotest/ZIAD) per K30-16 expansion.

Wszystkie vendory korzystają z wspólnego mapping schemy (50/51/50N/51N + curve).
Per-vendor specific extensions (87T/87L/distance) mogą być dodane w przyszłości
osobnym adapterem.
"""

from __future__ import annotations

from application.analyses.protection.catalog.models import DeviceCapability
from application.analyses.protection.catalog.vendors.base import (
    VendorAdapter,
    validate_common_vendor_support,
)


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
        return validate_common_vendor_support(mapped_settings, device)

    def map_logical_to_vendor(
        self,
        mapped_settings: dict[str, float | str],
        *,
        device: DeviceCapability,
    ) -> dict[str, float | str | bool]:
        # Karta W3-C1: KAZDA grupa (fazowa 51/50, ziemnozwarciowa 51N/50N) trafia
        # do wyniku TYLKO gdy jej klucz logiczny jest niesiony przez wymaganie —
        # metoda Hoppela nigdy nie stawia 51N/50N, wiec bezwarunkowe indeksowanie
        # `mapped_settings["I51N"]` wywalaloby KeyError na kazdym takim wymaganiu.
        p = self._prefix
        wynik: dict[str, float | str | bool] = {}
        if "I51" in mapped_settings:
            wynik[f"{p}.OC.51.ENABLED"] = True
            wynik[f"{p}.OC.51.PICKUP_A"] = mapped_settings["I51"]
            if "TMS51" in mapped_settings:
                wynik[f"{p}.OC.51.TMS"] = mapped_settings["TMS51"]
            if "T51" in mapped_settings:
                wynik[f"{p}.OC.51.T_DELAY_S"] = mapped_settings["T51"]
            wynik[f"{p}.OC.CURVE"] = mapped_settings["CURVE"]
        if "I50" in mapped_settings:
            wynik[f"{p}.OC.50.ENABLED"] = True
            wynik[f"{p}.OC.50.PICKUP_A"] = mapped_settings["I50"]
        if "I51N" in mapped_settings:
            wynik[f"{p}.EF.51N.ENABLED"] = True
            wynik[f"{p}.EF.51N.PICKUP_A"] = mapped_settings["I51N"]
            if "TMS51N" in mapped_settings:
                wynik[f"{p}.EF.51N.TMS"] = mapped_settings["TMS51N"]
            wynik[f"{p}.EF.CURVE"] = mapped_settings["CURVE"]
        if "I50N" in mapped_settings:
            wynik[f"{p}.EF.50N.ENABLED"] = True
            wynik[f"{p}.EF.50N.PICKUP_A"] = mapped_settings["I50N"]
        return wynik


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
