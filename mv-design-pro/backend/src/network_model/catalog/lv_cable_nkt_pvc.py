"""NKT YKYżo PVC 0,6/1 kV: 23 kompletne wiersze katalogu producenta.

Pełny tekst dokumentu NKT YKY 0,6/1 kV — str. drukowane 51 i 52,
tabele R20, L, Ith 1 s i Iz:
https://media.solar.pl/mdm/data/technicals/5A43D1111FF74A972980A1A53D1782DA.pdf

X=2πfL (f=50Hz). Iz: pojedyncze kable, 20°C grunt, 30°C powietrze,
0,7m, rezystywność gruntu 1 K·m/W. Brak Cu 4x1,5..6 w konfiguracji PEN
z powodu minimalnego przekroju PEN Cu 10 mm².
"""
from __future__ import annotations

from math import tau
from typing import Any

SOURCE = (
    "NKT, YKY/YKYżo 0,6/1 kV, IEC 60502-1:2004, "
    "str. druk. 51-52, tabele elektryczne, "
    "https://media.solar.pl/mdm/data/technicals/"
    "5A43D1111FF74A972980A1A53D1782DA.pdf"
)

# (przekrój Cu mm2, R20 Ω/km, L mH/km, Ith fazy kA/1s, Iz powietrze, Iz grunt)
NKT_YKY_CU_4Z: tuple[tuple[float, float, float, float, float, float], ...] = (
    (10, 1.83, 0.3, 1.15, 59, 79),
    (16, 1.15, 0.286, 1.837, 85, 108),
    (25, 0.727, 0.279, 2.871, 116, 141),
    (35, 0.524, 0.246, 4.019, 137, 166),
    (50, 0.387, 0.245, 5.742, 168, 197),
    (70, 0.268, 0.235, 8.039, 210, 240),
    (95, 0.193, 0.231, 10.909, 260, 287),
    (120, 0.153, 0.224, 13.78, 299, 324),
    (150, 0.124, 0.221, 17.225, 344, 364),
    (185, 0.0991, 0.218, 21.245, 395, 408),
    (240, 0.0754, 0.21, 27.561, 465, 466),
)
NKT_YKY_CU_5Z: tuple[tuple[float, float, float, float, float, float], ...] = (
    (1.5, 12.1, 0.4, 0.17, 19.5, 27),
    (2.5, 7.41, 0.38, 0.28, 25, 36),
    (4, 4.61, 0.37, 0.46, 34, 47),
    (6, 3.08, 0.36, 0.69, 43, 59),
    (10, 1.83, 0.34, 1.15, 59, 79),
    (16, 1.15, 0.295, 1.837, 88, 109),
    (25, 0.727, 0.288, 2.871, 120, 142),
    (35, 0.524, 0.278, 4.019, 148, 171),
    (50, 0.387, 0.252, 5.742, 176, 200),
    (70, 0.268, 0.237, 8.039, 222, 245),
    (95, 0.193, 0.234, 10.909, 271, 291),
    (120, 0.153, 0.223, 13.78, 313, 328),
)


def get_all_nkt_yky_lv_cable_types() -> list[dict[str, Any]]:
    result = []
    for cores, rows in ((4, NKT_YKY_CU_4Z), (5, NKT_YKY_CU_5Z)):
        for section, r20, l_mh, ith, iz_air, iz_ground in rows:
            sec_id = str(int(section)) if section == int(section) else str(section).replace(".", "p")
            x = round(tau * 50 * l_mh / 1000, 6)
            result.append({
                "id": f"kab-nn-nkt-yky-{cores}x{sec_id}",
                "name": f"NKT YKYżo {cores}×{section:g} Cu/PVC 0,6/1 kV",
                "params": {
                    "u_n_kv": 0.4,
                    "r_ohm_per_km": r20,
                    "x_ohm_per_km": x,
                    "i_max_a": float(iz_ground),
                    "manufacturer": "NKT",
                    "conductor_material": "CU",
                    "insulation_type": "PVC",
                    "cross_section_mm2": float(section),
                    "number_of_cores": cores,
                    "core_functions": "3L+PEN" if cores == 4 else "3L+N+PE",
                    "return_conductor_cross_section_mm2": float(section),
                    "return_conductor_r_ohm_per_km_20c": r20,
                    "return_conductor_x_ohm_per_km": x,
                    "ith_1s_a": ith * 1000.0,
                    "jth_1s_a_per_mm2": round(ith * 1000.0 / section, 6),
                    "max_temperature_c": 70.0,
                    "short_circuit_temperature_c": 160.0,
                    "standard": "IEC 60502-1",
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "PRODUKCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": SOURCE,
                    "verification_note": (
                        f"NKT YKY: R20={r20:g} Ω/km, L={l_mh:g} mH/km, "
                        f"Ith1s={ith:g} kA, Iz ziemia={iz_ground:g} A, "
                        f"Iz powietrze={iz_air:g} A. "
                        "Iz: 20°C grunt/30°C powietrze, pojedynczy kabel, "
                        "0,7 m, 1 K m/W; inne ułożenie wymaga przeliczenia. "
                        "Reaktancja żyły PE/PEN = reaktancja fazowa jest "
                        "założeniem modelowym, nie odrębną deklaracją NKT."
                    ),
                },
            })
    return result
