from __future__ import annotations

from application.analyses.protection.catalog.models import DeviceCapability
from application.analyses.protection.catalog.vendors.base import (
    VendorAdapter,
    validate_common_vendor_support,
)

VENDOR = "ABB"


class AbbVendorAdapter(VendorAdapter):
    def vendor_name(self) -> str:
        return VENDOR

    def supported_devices(self) -> tuple[str, ...]:
        return (
            # Karta FAB-A/D-33 (2026-09): piec pozycji dawnej fikcyjnej marki i
            # modelu (falszywie przypisanych ABB) tu nie ma juz od tej karty.
            # Zastapione profilami referencyjnymi bez marki (vendor=None,
            # zob. mv_auxiliary_catalog.py + devices_v0.json), wiec NIE naleza
            # do adaptera producenta ABB — nie ma dla nich realnej konwencji
            # nastaw ABB do zmapowania.
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
            wynik["ABB.OC.FUNC_51.ENABLED"] = True
            wynik["ABB.OC.I51_PICKUP_A"] = mapped_settings["I51"]
            if "TMS51" in mapped_settings:
                wynik["ABB.OC.TMS51"] = mapped_settings["TMS51"]
            if "T51" in mapped_settings:
                wynik["ABB.OC.T51_DELAY_S"] = mapped_settings["T51"]
            wynik["ABB.OC.CURVE"] = mapped_settings["CURVE"]
        if "I50" in mapped_settings:
            wynik["ABB.OC.FUNC_50.ENABLED"] = True
            wynik["ABB.OC.I50_HIGHSET_A"] = mapped_settings["I50"]
        if "I51N" in mapped_settings:
            wynik["ABB.EF.FUNC_51N.ENABLED"] = True
            wynik["ABB.EF.I51N_PICKUP_A"] = mapped_settings["I51N"]
            if "TMS51N" in mapped_settings:
                wynik["ABB.EF.TMS51N"] = mapped_settings["TMS51N"]
            wynik["ABB.EF.CURVE"] = mapped_settings["CURVE"]
        if "I50N" in mapped_settings:
            wynik["ABB.EF.FUNC_50N.ENABLED"] = True
            wynik["ABB.EF.I50N_HIGHSET_A"] = mapped_settings["I50N"]
        return wynik


def build_adapter() -> VendorAdapter:
    return AbbVendorAdapter()
