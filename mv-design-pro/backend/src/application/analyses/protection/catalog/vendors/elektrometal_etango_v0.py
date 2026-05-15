from __future__ import annotations

from application.analyses.protection.catalog.models import DeviceCapability
from application.analyses.protection.catalog.vendors.base import VendorAdapter

VENDOR = "ELEKTROMETAL"

_REQUIRED_LOGICAL_KEYS = ("I51", "TMS51", "I50", "I51N", "TMS51N", "I50N", "CURVE")
_REQUIRED_FUNCTIONS = ("50", "51", "50N", "51N")


class ElektrometalEtangoVendorAdapter(VendorAdapter):
    def vendor_name(self) -> str:
        return VENDOR

    def supported_devices(self) -> tuple[str, ...]:
        return (
            # Legacy V0 entries (rated 400-2000, IEC_NI only) — kept dla wstecznej zgodności
            "EM_ETANGO_400_V0",
            "EM_ETANGO_600_V0",
            "EM_ETANGO_800_V0",
            "EM_ETANGO_1000_V0",
            "EM_ETANGO_1250_V0",
            "EM_ETANGO_1600_V0",
            "EM_ETANGO_2000_V0",
            # K30-16 user-requested expansion: comprehensive E2Tango family
            # (450/600/800/1000/1200) z extended functions + curves per
            # actual karta techniczna producenta. Series 1200 to flagship z
            # PMU + cyber security + adaptive protection.
            "EM_E2TANGO_450",
            "EM_E2TANGO_600",
            "EM_E2TANGO_800",
            "EM_E2TANGO_1000",
            "EM_E2TANGO_1200",
        )

    def validate_vendor_support(
        self, mapped_settings: dict[str, float | str], *, device: DeviceCapability
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
        self, mapped_settings: dict[str, float | str], *, device: DeviceCapability
    ) -> dict[str, float | str | bool]:
        return {
            "EM.ETANGO.OC.51.ENABLED": True,
            "EM.ETANGO.OC.51.PICKUP_A": mapped_settings["I51"],
            "EM.ETANGO.OC.51.TMS": mapped_settings["TMS51"],
            "EM.ETANGO.OC.50.ENABLED": True,
            "EM.ETANGO.OC.50.PICKUP_A": mapped_settings["I50"],
            "EM.ETANGO.EF.51N.ENABLED": True,
            "EM.ETANGO.EF.51N.PICKUP_A": mapped_settings["I51N"],
            "EM.ETANGO.EF.51N.TMS": mapped_settings["TMS51N"],
            "EM.ETANGO.EF.50N.ENABLED": True,
            "EM.ETANGO.EF.50N.PICKUP_A": mapped_settings["I50N"],
            "EM.ETANGO.OC.CURVE": mapped_settings["CURVE"],
            "EM.ETANGO.EF.CURVE": mapped_settings["CURVE"],
        }


def build_adapter() -> VendorAdapter:
    return ElektrometalEtangoVendorAdapter()
