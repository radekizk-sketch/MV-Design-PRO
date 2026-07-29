from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json

#: Znamionowe wartosci preferowane wejsc pomiarowych przekaznika (IEC 60255-1 tab. 1).
#:
#: Norma ustala szereg preferowany: prad 1 A i 5 A, napiecie 100 V i 110 V (miedzyfazowo).
#: Sluza do sprawdzenia, czy przekladnik podaje na wejscie urzadzenia wartosc, ktora to
#: wejscie przyjmuje — bez tej danej kryterium zgodnosci toru bylo NIEWYKONALNE, a
#: wlasciciel odrzucil nazywanie sprawdzen niewykonalnymi (dyrektywa 2026-07-28).
WEJSCIA_PRADOWE_IEC_60255: tuple[float, ...] = (1.0, 5.0)
WEJSCIA_NAPIECIOWE_IEC_60255: tuple[float, ...] = (100.0, 110.0)

#: Skad pochodzi deklaracja wejsc pomiarowych: karta urzadzenia albo szereg preferowany.
#: Znacznik JEDZIE Z WARTOSCIA do werdyktu, zeby projektant widzial podstawe — wartosc
#: bez pochodzenia byla by nieodroznialna od zmyslonej.
ZRODLO_WEJSC_KARTA = "karta_producenta"
ZRODLO_WEJSC_NORMA = "szereg_preferowany_IEC_60255_1"


@dataclass(frozen=True)
class DeviceCapability:
    device_id: str
    vendor: str
    model: str
    functions_supported: tuple[str, ...]
    curves_supported: tuple[str, ...]
    i_pickup_51_a_min: float
    i_pickup_51_a_max: float
    tms_51_min: float
    tms_51_max: float
    i_inst_50_a_min: float
    i_inst_50_a_max: float
    i_pickup_51n_a_min: float
    i_pickup_51n_a_max: float
    tms_51n_min: float
    tms_51n_max: float
    i_inst_50n_a_min: float
    i_inst_50n_a_max: float
    meta: dict[str, Any]
    #: Znamionowe prady wejsc pomiarowych [A] — z karty urzadzenia albo z szeregu
    #: preferowanego IEC 60255-1 (rozstrzyga `rated_inputs_source`).
    rated_current_inputs_a: tuple[float, ...] = WEJSCIA_PRADOWE_IEC_60255
    #: Znamionowe napiecia wejsc pomiarowych [V] (miedzyfazowo).
    rated_voltage_inputs_v: tuple[float, ...] = WEJSCIA_NAPIECIOWE_IEC_60255
    #: Pochodzenie dwoch pol powyzej.
    rated_inputs_source: str = ZRODLO_WEJSC_NORMA

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "device_id": self.device_id,
            "vendor": self.vendor,
            "model": self.model,
            "functions_supported": self.functions_supported,
            "curves_supported": self.curves_supported,
            "rated_current_inputs_a": self.rated_current_inputs_a,
            "rated_voltage_inputs_v": self.rated_voltage_inputs_v,
            "rated_inputs_source": self.rated_inputs_source,
            "i_pickup_51_a_min": self.i_pickup_51_a_min,
            "i_pickup_51_a_max": self.i_pickup_51_a_max,
            "tms_51_min": self.tms_51_min,
            "tms_51_max": self.tms_51_max,
            "i_inst_50_a_min": self.i_inst_50_a_min,
            "i_inst_50_a_max": self.i_inst_50_a_max,
            "i_pickup_51n_a_min": self.i_pickup_51n_a_min,
            "i_pickup_51n_a_max": self.i_pickup_51n_a_max,
            "tms_51n_min": self.tms_51n_min,
            "tms_51n_max": self.tms_51n_max,
            "i_inst_50n_a_min": self.i_inst_50n_a_min,
            "i_inst_50n_a_max": self.i_inst_50n_a_max,
            "meta": self.meta,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class ProtectionRequirementV0:
    """Wymaganie nastaw wobec aparatu.

    V12K-189: nastawa ``None`` znaczy „niewyznaczalna z danych projektu" — nie
    stawia wymagania wobec aparatu i nie może być zastąpiona liczbą domyślną.
    """

    curve: str
    i_pickup_51_a: float | None
    tms_51: float
    i_inst_50_a: float | None
    i_pickup_51n_a: float | None
    tms_51n: float
    i_inst_50n_a: float | None

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "curve": self.curve,
            "i_pickup_51_a": self.i_pickup_51_a,
            "tms_51": self.tms_51,
            "i_inst_50_a": self.i_inst_50_a,
            "i_pickup_51n_a": self.i_pickup_51n_a,
            "tms_51n": self.tms_51n,
            "i_inst_50n_a": self.i_inst_50n_a,
        }
        return canonicalize_json(payload)


@dataclass(frozen=True)
class DeviceMappingResult:
    compatible: bool
    violations: tuple[str, ...]
    mapped_settings: dict[str, Any]
    assumptions: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "compatible": self.compatible,
            "violations": self.violations,
            "mapped_settings": self.mapped_settings,
            "assumptions": self.assumptions,
        }
        return canonicalize_json(payload)
