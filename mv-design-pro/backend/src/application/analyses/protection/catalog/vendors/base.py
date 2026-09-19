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


#: Funkcja logiczna -> klucz logiczny, ktorego OBECNOSC w `mapped_settings`
#: dowodzi, ze wymaganie stawia te funkcje (karta W3-C1, naprawa klasy: adaptery
#: wymagaly WSZYSTKICH siedmiu kluczy bezwarunkowo, wiec kazde wymaganie bez
#: ziemnozwarcia — czyli KAZDE wymaganie z metody Hoppela — dostawalo
#: VENDOR_MISSING_LOGICAL_KEY_I51N/TMS51N/I50N nawet dla aparatu, ktory realnie
#: obsluguje sama fazowa czesc wymagania).
_KLUCZ_FUNKCJI: dict[str, str] = {
    "51": "I51",
    "50": "I50",
    "51N": "I51N",
    "50N": "I50N",
}


def required_vendor_functions(mapped_settings: dict[str, float | str]) -> frozenset[str]:
    """Funkcje, ktorych wymaga TO KONKRETNE `mapped_settings` — wyprowadzone z
    obecnosci klucza logicznego, tego samego zrodla prawdy, ktorego uzywa
    `validator.py::_required_functions` (predykaty parami: jeden warunek
    "wymagane", nie dwa niezalezne domysly osobno w logice i osobno w adapterze
    producenta)."""
    return frozenset(
        funkcja for funkcja, klucz in _KLUCZ_FUNKCJI.items() if klucz in mapped_settings
    )


def validate_common_vendor_support(
    mapped_settings: dict[str, float | str], device: DeviceCapability
) -> tuple[bool, tuple[str, ...]]:
    """Walidacja wspolna WSZYSTKICH adapterow producenta (ABB/Elektrometal/generyczni).

    Wymaga TYLKO funkcji i kluczy, ktore wymaganie REALNIE stawia — nie calego
    kompletu 50/51/50N/51N bezwarunkowo (klasa naprawiona kartą W3-C1: metoda
    Hoppela nigdy nie stawia 50N/51N, wiec bezwarunkowy wymog czynil KAZDY dobor
    aparatu producenta zdegradowanym, nawet gdy urzadzenie realnie pasowalo).
    """
    violations: list[str] = []
    funkcje = required_vendor_functions(mapped_settings)
    for funkcja in sorted(funkcje):
        if funkcja not in device.functions_supported:
            violations.append(f"VENDOR_UNSUPPORTED_FUNCTION_{funkcja}")
    # Wielkosc czasowa stopnia 51 zalezy od krzywej (DT -> T51, odwrotnoczasowa
    # -> TMS51) — wymagana jest DOKLADNIE jedna z dwoch, gdy funkcja 51 wystepuje.
    if "51" in funkcje and "TMS51" not in mapped_settings and "T51" not in mapped_settings:
        violations.append("VENDOR_MISSING_LOGICAL_KEY_TIME_51")
    if "51N" in funkcje and "TMS51N" not in mapped_settings:
        violations.append("VENDOR_MISSING_LOGICAL_KEY_TMS51N")
    curve = mapped_settings.get("CURVE")
    if curve is not None and curve not in device.curves_supported:
        violations.append("VENDOR_UNSUPPORTED_CURVE")
    return (len(violations) == 0, tuple(violations))
