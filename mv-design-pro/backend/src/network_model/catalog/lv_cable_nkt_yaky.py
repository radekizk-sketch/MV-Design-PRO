"""NKT YAKY Al/PVC 0,6/1 kV, z pełnej karty elektrycznej NKT.

Strony drukowane 74–75: R20, L, prąd zwarciowy Ith(1s), Iz
dla ułożenia w powietrzu i gruncie, YAKY/YAKYżo:
https://www.elektrykasklep.pl/file,358936,karta_2015_yaky.pdf
https://www.elektrykasklep.pl/file,470056,yaky.pdf

Każdy wiersz to osobna konstrukcja. Przy powtórzonym przekroju
SE/SM/RE nie mieszamy L/Iz z różnych wierszy:
dobrano pierwszy wariant w danym przekroju.
4x10 Al WYŁĄCZONY — za mały PEN (16 mm² minimum).
"""
from __future__ import annotations

from math import tau
from typing import Any

SOURCE = (
    "NKT YAKY/YAKYżo 0,6/1 kV, IEC 60502-1:2004,"
    " str. druk. 74–75, R20/L/Ith/Iz dla konkretnego wiersza,"
    " https://www.elektrykasklep.pl/file,358936,karta_2015_yaky.pdf"
)
NKT_YAKY_AL_4Z: tuple[tuple[int, float, float, float, int, int], ...] = (
    (16, 1.91, 0.285, 1.217, 66, 84),
    (25, 1.2, 0.283, 1.902, 89, 109),
    (35, 0.868, 0.273, 2.663, 109, 130),
    (50, 0.641, 0.25, 3.804, 128, 152),
    (70, 0.443, 0.239, 5.326, 161, 186),
    (95, 0.32, 0.237, 7.228, 198, 222),
    (120, 0.253, 0.23, 9.13, 231, 253),
    (150, 0.206, 0.23, 11.413, 263, 283),
    (185, 0.164, 0.228, 14.076, 305, 319),
    (240, 0.125, 0.223, 18.261, 362, 369),
    (300, 0.1, 0.215, 22.826, 424, 417),
)
NKT_YAKY_AL_5Z: tuple[tuple[int, float, float, float, int, int], ...] = (
    (10, 3.08, 0.311, 0.761, 51, 65),
    (16, 1.91, 0.294, 1.217, 68, 85),
    (25, 1.2, 0.292, 1.902, 92, 110),
    (35, 0.868, 0.282, 2.663, 113, 132),
    (50, 0.641, 0.278, 3.804, 141, 157),
    (70, 0.443, 0.268, 5.326, 178, 193),
    (95, 0.32, 0.239, 7.228, 212, 228),
    (120, 0.253, 0.23, 9.13, 246, 258),
)


def get_all_nkt_yaky_lv_cable_types() -> list[dict[str, Any]]:
    result = []
    for cores, rows in ((4, NKT_YAKY_AL_4Z), (5, NKT_YAKY_AL_5Z)):
        for section, r20, l_mh, ith, iz_air, iz_ground in rows:
            x = round(tau * 50 * l_mh / 1000, 6)
            result.append({
                "id": f"kab-nn-nkt-yaky-{cores}x{section}",
                "name": f"NKT YAKYżo {cores}×{section} Al/PVC 0,6/1 kV",
                "params": {
                    "u_n_kv": 0.4,
                    "r_ohm_per_km": r20,
                    "x_ohm_per_km": x,
                    "i_max_a": float(iz_ground),
                    "manufacturer": "NKT",
                    "conductor_material": "AL",
                    "insulation_type": "PVC",
                    "cross_section_mm2": float(section),
                    "number_of_cores": cores,
                    "core_functions": "3L+PEN" if cores == 4 else "3L+N+PE",
                    "return_conductor_cross_section_mm2": float(section),
                    "return_conductor_r_ohm_per_km_20c": r20,
                    "return_conductor_x_ohm_per_km": x,
                    "ith_1s_a": ith * 1000.0,
                    "jth_1s_a_per_mm2": round(ith * 1000 / section, 6),
                    "max_temperature_c": 70.0,
                    "short_circuit_temperature_c": 160.0,
                    "standard": "IEC 60502-1",
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "PRODUKCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": SOURCE,
                    "verification_note": (
                        f"NKT YAKY: R20={r20:g} Ω/km, L={l_mh:g} mH/km, "
                        f"Ith={ith:g} kA/1s, Iz ziemia={iz_ground} A, "
                        f"Iz powietrze={iz_air} A. "
                        "Iz dotyczy warunków referencyjnych producenta, "
                        "20°C grunt /30°C powietrze, 0,7m, 1,0 K m/W. "
                        "X żyły PE/PEN = X fazowa: jawne uproszczenie geometryczne, "
                        "nie odrębny pomiar NKT; dla SWZ sprawdź topologię PE/PEN."
                    ),
                },
            })
    return result
