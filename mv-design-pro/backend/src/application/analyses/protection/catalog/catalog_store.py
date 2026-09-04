from __future__ import annotations

import json
from pathlib import Path

from application.analyses.protection.catalog.models import (
    WEJSCIA_NAPIECIOWE_IEC_60255,
    WEJSCIA_PRADOWE_IEC_60255,
    ZRODLO_WEJSC_KARTA,
    ZRODLO_WEJSC_NORMA,
    DeviceCapability,
)

_DATA_PATH = Path(__file__).resolve().parent / "data" / "devices_v0.json"


def load_device_capability(device_id: str) -> DeviceCapability | None:
    devices = _load_catalog()
    for device in devices:
        if device.device_id == device_id:
            return device
    return None


def list_devices(vendor: str | None = None) -> list[DeviceCapability]:
    devices = _load_catalog()
    if vendor:
        devices = [device for device in devices if device.vendor == vendor]
    return sorted(devices, key=lambda device: device.device_id)


def _load_catalog() -> list[DeviceCapability]:
    payload = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    devices = payload.get("devices", []) if isinstance(payload, dict) else []
    return [_parse_device(device) for device in devices if isinstance(device, dict)]


def _parse_device(payload: dict) -> DeviceCapability:
    meta = payload.get("meta", {})
    if not isinstance(meta, dict):
        meta = {}
    raw_vendor = payload.get("vendor")
    return DeviceCapability(
        device_id=str(payload.get("device_id", "")),
        # `null`/nieobecny vendor = profil REFERENCYJNY bez marki (FAB-A/D-33);
        # `str(None)` dawaloby falszywy tekst "None" zamiast uczciwej nieobecnosci.
        vendor=(str(raw_vendor) if raw_vendor is not None else None),
        model=str(payload.get("model", "")),
        functions_supported=tuple(payload.get("functions_supported", [])),
        curves_supported=tuple(payload.get("curves_supported", [])),
        i_pickup_51_a_min=float(payload.get("i_pickup_51_a_min", 0.0)),
        i_pickup_51_a_max=float(payload.get("i_pickup_51_a_max", 0.0)),
        tms_51_min=float(payload.get("tms_51_min", 0.0)),
        tms_51_max=float(payload.get("tms_51_max", 0.0)),
        i_inst_50_a_min=float(payload.get("i_inst_50_a_min", 0.0)),
        i_inst_50_a_max=float(payload.get("i_inst_50_a_max", 0.0)),
        i_pickup_51n_a_min=float(payload.get("i_pickup_51n_a_min", 0.0)),
        i_pickup_51n_a_max=float(payload.get("i_pickup_51n_a_max", 0.0)),
        tms_51n_min=float(payload.get("tms_51n_min", 0.0)),
        tms_51n_max=float(payload.get("tms_51n_max", 0.0)),
        i_inst_50n_a_min=float(payload.get("i_inst_50n_a_min", 0.0)),
        i_inst_50n_a_max=float(payload.get("i_inst_50n_a_max", 0.0)),
        **_wejscia_pomiarowe(payload),
        meta=meta,
    )


def _wejscia_pomiarowe(payload: dict) -> dict:
    """Wejscia pomiarowe urzadzenia + POCHODZENIE tej deklaracji.

    Karta producenta ma pierwszenstwo. Gdy jej nie ma, wpisywany jest szereg
    preferowany IEC 60255-1 — ale ZE ZNACZNIKIEM, ktory jedzie z wartoscia do
    werdyktu doboru. Wartosc bez pochodzenia bylaby nieodroznialna od zmyslonej.
    """
    prady = payload.get("rated_current_inputs_a")
    napiecia = payload.get("rated_voltage_inputs_v")
    if isinstance(prady, list) and isinstance(napiecia, list) and prady and napiecia:
        return {
            "rated_current_inputs_a": tuple(float(v) for v in prady),
            "rated_voltage_inputs_v": tuple(float(v) for v in napiecia),
            "rated_inputs_source": ZRODLO_WEJSC_KARTA,
        }
    return {
        "rated_current_inputs_a": WEJSCIA_PRADOWE_IEC_60255,
        "rated_voltage_inputs_v": WEJSCIA_NAPIECIOWE_IEC_60255,
        "rated_inputs_source": ZRODLO_WEJSC_NORMA,
    }
