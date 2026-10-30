"""ESITAS: zidentyfikowane SKU VT z polskiej oferty ASTAT.

Nie kopiujemy Fv=1,9 / 8h i nie dopisujemy uzwojenia resztkowego: strony
konkretnego SKU nie deklarują tych pól. '0..10 VA' oznacza zakres klasy
0,2, a nie 10 VA dla każdego obciążenia i każdej konfiguracji wtórnej.
"""
from __future__ import annotations

from math import sqrt
from typing import Any


def get_all_esitas_vt_confirmed_sku() -> list[dict[str, Any]]:
    # (kod producenta, model, Un l-l V, Um kV, URL polskiego dostawcy)
    items = (
        ("ESI-VTB20KM150000", "VTB 20-K 15", 15000, 24.0,
         "https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb20km150000/"),
        ("ESI-VTB20KM200000", "VTB 20-K 20", 20000, 24.0,
         "https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb20km200000/"),
        ("ESI-VTB10KM150000", "VTB 10-K 15", 15000, 17.5,
         "https://astat.pl/produkty/przekladniki-sredniego-napiecia-esi-vtb10km150000/"),
    )
    records: list[dict[str, Any]] = []
    for code, model, line_voltage_v, um, url in items:
        p = line_voltage_v / sqrt(3)
        s = 100 / sqrt(3)
        records.append({
            "id": f"vt-esitas-{code.lower()}",
            "name": f"ESITAS {model}, {line_voltage_v:g}/√3 / 100/√3 V, kl.0,2, 0–10 VA",
            "params": {
                "manufacturer": "ESITAS",
                "ratio_primary_v": p,
                "ratio_secondary_v": s,
                "accuracy_class": "0.2",
                "burden_va": 10.0,
                "um_kv": um,
                "primary_connection": "PHASE_EARTH",
                "has_residual_winding": None,
                "secondary_windings": [{
                    "index": 1,
                    "role": "METERING",
                    "rated_voltage_v": s,
                    "accuracy_class": "0.2",
                    "burden_va_min": 0.0,
                    "burden_va_max": 10.0,
                    "connection": "TO_CONFIRM",
                }],
                "catalog_status": "REFERENCYJNY_V1",
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "contract_version": "2.0",
                "source_reference": (
                    f"ESITAS, zidentyfikowany kod {code}, oferta polska ASTAT: {url}"
                ),
                "verification_note": (
                    "Zidentyfikowany kod wyrobu producenta w polskiej ofercie. "
                    f"Model {model}; Um={um:g} kV, "
                    f"{line_voltage_v:g}/sqrt3 / 100/sqrt3 V, klasa 0,2, "
                    "deklarowana dokładność dla obciążenia 0–10 VA. "
                    "Jest to ZAKRES, nie dowód znamionowego 10VA w "
                    "całym zakresie normowej dokładności innej konfiguracji. "
                    "Nie znamy z tej karty Fv, czasu Fv, wszystkich wtórnych "
                    "ani obecności uzwojenia 100/3 V. Wymagana DTR wariantu "
                    "do oceny doborowej, przed użyciem produkcyjnym."
                ),
            },
        })
    return records
