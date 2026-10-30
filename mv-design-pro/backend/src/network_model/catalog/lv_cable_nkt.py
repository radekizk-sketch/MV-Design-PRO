"""Kable nN NKT — pełne wiersze elektryczne YKXS 0,6/1 kV.

Źródło: NKT cables, katalog YKXS/YKXSżo IEC 60502-1:2004,
strony drukowane 64 i 65 (tabele parametrów elektrycznych):
https://www.elektrykasklep.pl/file,470067,ykxs.pdf

Wartości R20, L, Ith, Iz powietrze, Iz ziemia są dokładnymi danymi
wiersza producenta. X=2π·50Hz·L. Zwracane rekordy są pełne numerycznie
dla podstawowych analiz, a X przewodu PE/PEN pozostaje jawnym
przyjęciem modelowym (nie przypisujemy mu statusu DATASHEET).
"""
from __future__ import annotations

from math import tau
from typing import Any

SOURCE = (
    "NKT cables, YKXS/YKXSżo 0,6/1 kV, IEC 60502-1:2004, "
    "str. druk. 64-65, tabela parametrów elektrycznych, "
    "https://www.elektrykasklep.pl/file,470067,ykxs.pdf"
)

# Liczba żył = 4: przekrój Cu, R20 Ω/km, L mH/km, Ith kA/1s,
# dopuszczalny prąd w powietrzu / w ziemi [A].
# Dla 4×35 istnieją 2 konstrukcje: tu jawnie wybrano RMC (L=0,256).
NKT_YKXS_4Z: tuple[tuple[int, float, float, float, int, int], ...] = (
    (10, 1.83, 0.279, 1.429, 78, 96),
    (16, 1.15, 0.266, 2.286, 104, 124),
    (25, 0.727, 0.264, 3.572, 142, 162),
    (35, 0.524, 0.256, 5.001, 176, 195),
    (50, 0.387, 0.227, 7.144, 206, 228),
    (70, 0.268, 0.223, 10.001, 260, 278),
    (95, 0.193, 0.215, 13.573, 320, 332),
    (120, 0.153, 0.213, 17.145, 371, 376),
    (150, 0.124, 0.211, 21.431, 426, 420),
    (185, 0.0991, 0.209, 26.432, 490, 472),
    (240, 0.0754, 0.2, 34.29, 577, 540),
)

NKT_YKXS_5Z: tuple[tuple[int, float, float, float, int, int], ...] = (
    (10, 1.83, 0.288, 1.429, 81, 98),
    (16, 1.15, 0.275, 2.286, 108, 126),
    (25, 0.727, 0.273, 3.572, 147, 165),
    (35, 0.524, 0.265, 5.001, 183, 198),
    (50, 0.387, 0.233, 7.144, 216, 232),
    (70, 0.268, 0.225, 10.001, 275, 283),
    (95, 0.193, 0.217, 13.573, 333, 336),
    (120, 0.153, 0.211, 17.145, 388, 380),
)



NKT_YAKXS_SOURCE = (
    "NKT, YAKXS/YAKXSżo 0,6/1 kV, karta elektryczna, "
    "str. druk. 79-80, "
    "https://www.elektrykasklep.pl/file,553320,przewody-i-kable-elektroenergetyczne_201532.pdf"
)

# NKT AL XLPE, nN: przekrój, R20, L, Ith1s kA, Iz w powietrzu, Iz w ziemi.
# Gdy jeden przekrój ma różne geometrie (SE/SM), to konkretna
# poniższa kombinacja pochodzi z JEDNEGO wiersza karty NKT.
NKT_YAKXS_4Z: tuple[tuple[int, float, float, float, int, int], ...] = (
    (10, 3.08, 0.279, 0.946, 60, 74),
    (16, 1.91, 0.265, 1.513, 81, 96),
    (25, 1.2, 0.267, 2.364, 109, 126),
    (35, 0.868, 0.259, 3.309, 134, 150),
    (50, 0.641, 0.226, 4.728, 156, 175),
    (70, 0.443, 0.224, 6.619, 202, 217),
    (95, 0.32, 0.22, 8.983, 243, 256),
    (120, 0.253, 0.217, 11.346, 284, 292),
    (150, 0.206, 0.219, 14.183, 325, 327),
    (185, 0.164, 0.218, 17.492, 378, 370),
    (240, 0.125, 0.213, 22.693, 447, 426),
)
NKT_YAKXS_5Z: tuple[tuple[int, float, float, float, int, int], ...] = (
    (10, 3.08, 0.288, 0.946, 62, 75),
    (16, 1.91, 0.275, 1.513, 84, 98),
    (25, 1.2, 0.276, 2.364, 113, 127),
    (35, 0.868, 0.268, 3.309, 139, 152),
    (50, 0.641, 0.234, 4.728, 168, 180),
    (70, 0.443, 0.228, 6.619, 215, 221),
    (95, 0.32, 0.221, 8.983, 260, 262),
    (120, 0.253, 0.218, 11.346, 305, 299),
)


def get_all_nkt_yakxs_lv_cable_types() -> list[dict[str, Any]]:
    result = []
    for cores, rows in ((4, NKT_YAKXS_4Z), (5, NKT_YAKXS_5Z)):
        for section, r20, l_mh, ith_ka, iz_air, iz_soil in rows:
            x = round(tau * 50 * l_mh / 1000, 6)
            result.append({
                "id": f"kab-nn-nkt-yakxs-{cores}x{section}",
                "name": f"NKT YAKXSżo {cores}×{section} Al 0,6/1 kV",
                "params": {
                    "u_n_kv": 0.4, "r_ohm_per_km": r20,
                    "x_ohm_per_km": x, "i_max_a": float(iz_soil),
                    "manufacturer": "NKT", "conductor_material": "AL",
                    "insulation_type": "XLPE",
                    "cross_section_mm2": float(section), "number_of_cores": cores,
                    "core_functions": "3L+PEN" if cores == 4 else "3L+N+PE",
                    "return_conductor_cross_section_mm2": float(section),
                    "return_conductor_r_ohm_per_km_20c": r20,
                    "return_conductor_x_ohm_per_km": x,
                    "ith_1s_a": ith_ka * 1000.0,
                    "jth_1s_a_per_mm2": round(ith_ka * 1000 / section, 6),
                    "max_temperature_c": 90.0,
                    "short_circuit_temperature_c": 250.0,
                    "standard": "IEC 60502-1",
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "PRODUKCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": NKT_YAKXS_SOURCE,
                    "verification_note": (
                        f"NKT: R20={r20:g} Ω/km, L={l_mh:g} mH/km, "
                        f"Ith(1s)={ith_ka:g} kA, Iz ziemia={iz_soil} A, "
                        f"Iz powietrze={iz_air} A. "
                        "Iz dotyczy tylko warunków odniesienia NKT "
                        "(grunt 20°C, powietrze 30°C, 0,7m, 1,0 K m/W, pojedynczy kabel). "
                        "Reaktancja żyły powrotnej to założenie modelowe symetrii, "
                        "nie osobna dana fabryczna."
                    ),
                },
            })
    return result


def get_all_nkt_lv_cable_types() -> list[dict[str, Any]]:
    """Kable Cu/XLPE nN NKT: 11 wariantów 4ż + 8 wariantów 5ż."""
    result = []
    for cores, rows in ((4, NKT_YKXS_4Z), (5, NKT_YKXS_5Z)):
        for section, r20, l_mh, ith_ka, iz_air, iz_soil in rows:
            x = round(tau * 50 * l_mh / 1000, 6)
            result.append({
                "id": f"kab-nn-nkt-ykxs-{cores}x{section}",
                "name": f"NKT YKXSżo {cores}×{section} Cu 0,6/1 kV",
                "params": {
                    "u_n_kv": 0.4,
                    "r_ohm_per_km": r20,
                    "x_ohm_per_km": x,
                    "i_max_a": float(iz_soil),
                    "manufacturer": "NKT",
                    "conductor_material": "CU",
                    "insulation_type": "XLPE",
                    "cross_section_mm2": float(section),
                    "number_of_cores": cores,
                    "core_functions": "3L+PEN" if cores == 4 else "3L+N+PE",
                    "return_conductor_cross_section_mm2": float(section),
                    "return_conductor_r_ohm_per_km_20c": r20,
                    "return_conductor_x_ohm_per_km": x,
                    "ith_1s_a": ith_ka * 1000,
                    "jth_1s_a_per_mm2": round(ith_ka * 1000 / section, 6),
                    "max_temperature_c": 90.0,
                    "short_circuit_temperature_c": 250.0,
                    "standard": "IEC 60502-1",
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "PRODUKCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": SOURCE,
                    "verification_note": (
                        f"NKT: R20={r20:g} Ω/km, L={l_mh:g} mH/km, "
                        f"Ith(1s)={ith_ka:g} kA, Iz ziemia={iz_soil} A, "
                        f"Iz powietrze={iz_air} A. "
                        "Wartość i_max_a to wyłącznie obciążalność "
                        "dla warunków odniesienia NKT z karty; "
                        "w projekcie wymaga przeliczenia warunków ułożenia. "
                        "X żyły powrotnej to jawne założenie modelowe "
                        "(symetryczny nieredukowany 4/5-żyłowy), nie osobna "
                        "deklaracja producenta. Dostępna inna geometria "
                        "4x35 SM, nieuwzględniona w tym rekordzie."
                    ),
                },
            })
    result.extend(get_all_nkt_yakxs_lv_cable_types())
    return result
