from __future__ import annotations

from application.analyses.protection.catalog.models import DeviceCapability
from application.analyses.protection.catalog.vendors.base import (
    VendorAdapter,
    validate_common_vendor_support,
)

VENDOR = "ELEKTROMETAL"


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
        return validate_common_vendor_support(mapped_settings, device)

    def map_logical_to_vendor(
        self, mapped_settings: dict[str, float | str], *, device: DeviceCapability
    ) -> dict[str, float | str | bool]:
        # Karta W3-C1: KAZDA grupa (fazowa 51/50, ziemnozwarciowa 51N/50N) trafia
        # do wyniku TYLKO gdy jej klucz logiczny jest niesiony przez wymaganie —
        # metoda Hoppela nigdy nie stawia 51N/50N, wiec bezwarunkowe indeksowanie
        # `mapped_settings["I51N"]` wywalaloby KeyError na kazdym takim wymaganiu.
        wynik: dict[str, float | str | bool] = {}
        if "I51" in mapped_settings:
            wynik["EM.ETANGO.OC.51.ENABLED"] = True
            wynik["EM.ETANGO.OC.51.PICKUP_A"] = mapped_settings["I51"]
            if "TMS51" in mapped_settings:
                wynik["EM.ETANGO.OC.51.TMS"] = mapped_settings["TMS51"]
            if "T51" in mapped_settings:
                wynik["EM.ETANGO.OC.51.T_DELAY_S"] = mapped_settings["T51"]
            wynik["EM.ETANGO.OC.CURVE"] = mapped_settings["CURVE"]
        if "I50" in mapped_settings:
            wynik["EM.ETANGO.OC.50.ENABLED"] = True
            wynik["EM.ETANGO.OC.50.PICKUP_A"] = mapped_settings["I50"]
        if "I51N" in mapped_settings:
            wynik["EM.ETANGO.EF.51N.ENABLED"] = True
            wynik["EM.ETANGO.EF.51N.PICKUP_A"] = mapped_settings["I51N"]
            if "TMS51N" in mapped_settings:
                wynik["EM.ETANGO.EF.51N.TMS"] = mapped_settings["TMS51N"]
            wynik["EM.ETANGO.EF.CURVE"] = mapped_settings["CURVE"]
        if "I50N" in mapped_settings:
            wynik["EM.ETANGO.EF.50N.ENABLED"] = True
            wynik["EM.ETANGO.EF.50N.PICKUP_A"] = mapped_settings["I50N"]
        return wynik


def build_adapter() -> VendorAdapter:
    return ElektrometalEtangoVendorAdapter()
