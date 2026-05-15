from __future__ import annotations

from application.analyses.protection.catalog.models import DeviceCapability
from application.analyses.protection.catalog.vendors.base import VendorAdapter

VENDOR = "ABB"

_REQUIRED_LOGICAL_KEYS = ("I51", "TMS51", "I50", "I51N", "TMS51N", "I50N", "CURVE")
_REQUIRED_FUNCTIONS = ("50", "51", "50N", "51N")


class AbbVendorAdapter(VendorAdapter):
    def vendor_name(self) -> str:
        return VENDOR

    def supported_devices(self) -> tuple[str, ...]:
        return (
            # Legacy ACME REX series
            "ACME_REX100_v1",
            "ACME_REX200_v1",
            "ACME_REX300_v1",
            "ACME_REX500_v1",
            "ACME_REX700_v1",
            # K30-16: ABB Relion 615/620/630/650/670 — feeder + transformer
            # + busbar + generator protections per technical manuals
            "ABB_REF601",
            "ABB_REF615",
            "ABB_REF620",
            "ABB_REF630",
            "ABB_REF650",
            "ABB_RET615",
            "ABB_REB670",
            "ABB_REG670",
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
            "ABB.OC.FUNC_51.ENABLED": True,
            "ABB.OC.I51_PICKUP_A": mapped_settings["I51"],
            "ABB.OC.TMS51": mapped_settings["TMS51"],
            "ABB.OC.FUNC_50.ENABLED": True,
            "ABB.OC.I50_HIGHSET_A": mapped_settings["I50"],
            "ABB.EF.FUNC_51N.ENABLED": True,
            "ABB.EF.I51N_PICKUP_A": mapped_settings["I51N"],
            "ABB.EF.TMS51N": mapped_settings["TMS51N"],
            "ABB.EF.FUNC_50N.ENABLED": True,
            "ABB.EF.I50N_HIGHSET_A": mapped_settings["I50N"],
            "ABB.OC.CURVE": mapped_settings["CURVE"],
            "ABB.EF.CURVE": mapped_settings["CURVE"],
        }


def build_adapter() -> VendorAdapter:
    return AbbVendorAdapter()
