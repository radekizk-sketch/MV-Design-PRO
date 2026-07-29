from __future__ import annotations

from typing import Protocol

from application.analyses.protection.catalog.models import DeviceCapability


class VendorAdapter(Protocol):
    def vendor_name(self) -> str: ...

    def supported_devices(self) -> tuple[str, ...]: ...

    def map_logical_to_vendor(
        self, mapped_settings: dict[str, float | str], *, device: DeviceCapability
    ) -> dict[str, float | str | bool]: ...

    def validate_vendor_support(
        self, mapped_settings: dict[str, float | str], *, device: DeviceCapability
    ) -> tuple[bool, tuple[str, ...]]: ...
