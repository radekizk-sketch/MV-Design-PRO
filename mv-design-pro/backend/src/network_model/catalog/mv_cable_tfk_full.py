"""TFK: kompletne dane SN 12/20(24) kV z oryginalnego katalogu producenta.

TELE-FONIKA Kable S.A., TFK WIND ENERGY CABLES, Clean Energy, edition II,
strony drukowane 40-45 (PDF p20-p22), XRUHAKXS (Al) / XRUHKXS (Cu),
uszczelnienie wzdłużne i promieniowe.

Wszystkie liczby w wierszu R20, C, L, Iz, Ith i ekranu pochodzą z tablic
TEGO producenta (bez przenoszenia z innych rodzin).
Ułożenie: trzy kable w trójkąt, uziemienie ekranów po obu stronach (BE);
grunt 20°C, głębokość 0,7m, 1 K·m/W. X=2π·50Hz·L.
R0/X0 nie są kopiowane z tablic przy nieokreślonym wariancie uziemienia ekranu:
istniejąca materializacja liczy je z jawnych założeń.
"""
from __future__ import annotations

from math import tau
from typing import Any

TFK_WIND_ENERGY_2025_PDF = (
    "https://www.tele-fonika.com/storage/file/core_files/2025/3/27/"
    "7459739d043ef898b9ecd655bc593b07/Clean%20Energy%20ENG.pdf"
)
TFK_SOURCE = (
    "TELE-FONIKA Kable, WIND ENERGY CABLES, Clean Energy Edition II, "
    "2025, str. druk. 40-45, XRUHAKXS/XRUHKXS 12/20(24) kV; "
    + TFK_WIND_ENERGY_2025_PDF
)

# (żyła mm², ekran Cu mm², R20 Ω/km, C µF/km, L trójkąt mH/km,
#  Iz grunt trójkąt BE A, Ith fazowy kA/1s, Ith ekranu kA/1s,
#  R20 ekranu Ω/km).
# Warianty 50/16, 70/25, 95/35, 120-1000/50 są fizycznymi
# przekrojami EKRANU podanymi przez TFK, nie założeniem.
TFK_XRUHAKXS_AL_1220: tuple[tuple[int, int, float, float, float, int, float, float, float], ...] = (
    (50, 16, 0.641, 0.16, 0.45, 212, 4.7, 3.7, 1.12),
    (70, 25, 0.443, 0.18, 0.43, 260, 6.6, 5.3, 0.72),
    (95, 35, 0.32, 0.2, 0.41, 312, 9, 7.1, 0.51),
    (120, 50, 0.253, 0.21, 0.39, 354, 11.3, 9.8, 0.36),
    (150, 50, 0.206, 0.23, 0.38, 398, 14.2, 9.8, 0.36),
    (185, 50, 0.164, 0.25, 0.36, 451, 17.5, 9.8, 0.36),
    (240, 50, 0.125, 0.27, 0.35, 523, 22.7, 9.8, 0.36),
    (300, 50, 0.1, 0.3, 0.34, 589, 28.4, 9.8, 0.36),
    (400, 50, 0.0778, 0.33, 0.32, 675, 37.8, 9.8, 0.36),
    (500, 50, 0.0605, 0.37, 0.32, 766, 47.3, 9.8, 0.36),
    (630, 50, 0.0469, 0.41, 0.31, 870, 59.5, 9.8, 0.36),
    (800, 50, 0.0367, 0.46, 0.3, 974, 75.6, 9.8, 0.36),
    (1000, 50, 0.0291, 0.51, 0.29, 1077, 94.5, 9.8, 0.36),
)

TFK_XRUHKXS_CU_1220: tuple[tuple[int, int, float, float, float, int, float, float, float], ...] = (
    (35, 16, 0.524, 0.15, 0.47, 231, 5, 3.7, 1.12),
    (50, 16, 0.387, 0.16, 0.45, 274, 7.2, 3.7, 1.12),
    (70, 25, 0.268, 0.18, 0.43, 334, 10, 5.3, 0.72),
    (95, 35, 0.193, 0.2, 0.4, 402, 13.6, 7.1, 0.51),
    (120, 50, 0.153, 0.22, 0.39, 455, 17.2, 9.8, 0.36),
    (150, 50, 0.124, 0.23, 0.37, 511, 21.5, 9.8, 0.36),
    (185, 50, 0.0991, 0.25, 0.36, 575, 26.5, 9.8, 0.36),
    (240, 50, 0.0754, 0.28, 0.35, 666, 34.3, 9.8, 0.36),
    (300, 50, 0.0601, 0.3, 0.34, 747, 42.9, 9.8, 0.36),
    (400, 50, 0.047, 0.34, 0.32, 846, 57.2, 9.8, 0.36),
    (500, 50, 0.0366, 0.38, 0.31, 949, 71.5, 9.8, 0.36),
    (630, 50, 0.0283, 0.42, 0.3, 1060, 90.1, 9.8, 0.36),
    (800, 50, 0.0221, 0.48, 0.3, 1167, 114.4, 9.8, 0.36),
    (1000, 50, 0.0176, 0.52, 0.29, 1257, 143, 9.8, 0.36),
)


def get_all_tfk_1220_cable_types() -> list[dict[str, Any]]:
    """27 pełnych modeli SN Cu/Al do projektów klienta, niezależnych od ENEA."""
    result: list[dict[str, Any]] = []
    for material, family, rows in (
        ("AL", "XRUHAKXS", TFK_XRUHAKXS_AL_1220),
        ("CU", "XRUHKXS", TFK_XRUHKXS_CU_1220),
    ):
        for s, screen, r20, cap, l_mh, iz, ith, ith_screen, r20_screen in rows:
            result.append({
                "id": f"cable-tfk-2025-{family.lower()}-{s}-{screen}-12-20",
                "name": f"Tele-Fonika {family} 1×{s}/{screen} mm² 12/20 kV",
                "params": {
                    "manufacturer": "TELE-FONIKA Kable",
                    "trade_name": f"{family} 1x{s}/{screen}",
                    "conductor_material": material,
                    "return_conductor_material": "CU",
                    "return_conductor_cross_section_mm2": float(screen),
                    "return_conductor_r_ohm_per_km_20c": r20_screen,
                    "return_conductor_ith_1s_a": ith_screen * 1000.0,
                    "return_conductor_jth_1s_a_per_mm2": round(ith_screen * 1000.0 / screen, 6),
                    "insulation_type": "XLPE",
                    "cross_section_mm2": float(s),
                    "number_of_cores": 1,
                    "r_ohm_per_km": r20,
                    "x_ohm_per_km": round(tau * 50.0 * l_mh / 1000.0, 6),
                    "c_nf_per_km": cap * 1000.0,
                    "rated_current_a": float(iz),
                    "ith_1s_a": ith * 1000.0,
                    "jth_1s_a_per_mm2": round(ith * 1000.0 / s, 6),
                    "voltage_rating_kv": 20.0,
                    "max_temperature_c": 90.0,
                    "short_circuit_temperature_c": 250.0,
                    "standard": "HD 620 S3:2023 10-R / IEC 60502-2",
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "PRODUKCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": TFK_SOURCE,
                    "verification_note": (
                        f"TFK: R20={r20:g} Ω/km, C={cap:g} µF/km, "
                        f"L(trójkąt)={l_mh:g} mH/km, "
                        f"Iz(trójkąt, ekran BE)={iz} A, "
                        f"Ith fazy={ith:g} kA/1s, ekranu={ith_screen:g} kA/1s. "
                        "Warunki Iz: grunt 20°C, 0,7 m, 1 K·m/W, "
                        "trójkąt, ekrany uziemione obustronnie. "
                        "Przy innym sposobie ułożenia i bonding niezbędne "
                        "przeliczenie i dane odpowiedniej kolumny karty. "
                        "Parametry R0/X0 wymagają modelu konkretnego uziemienia "
                        "ekranów i są oznaczane jako obliczeniowe, nie producenta."
                    ),
                },
            })
    return result



# TFK 2025, strony 58-63 — odrębne fizyczne wyroby 18/30(36) kV.
# R20/C/L, Iz dla trójkąta i ekranów obustronnie uziemionych (BE), Ith.
TFK_SOURCE_1830 = (
    "TELE-FONIKA Kable WIND ENERGY CABLES, Clean Energy Edition II, "
    "2025, str. druk. 58-63, XRUHAKXS/XRUHKXS 18/30(36) kV; "
    + TFK_WIND_ENERGY_2025_PDF
)

TFK_XRUHAKXS_AL_1830: tuple[tuple[int, int, float, float, float, int, float, float, float], ...] = (
    (50, 16, 0.641, 0.13, 0.48, 210, 4.7, 3.7, 1.12),
    (70, 25, 0.443, 0.14, 0.46, 257, 6.6, 5.3, 0.72),
    (95, 35, 0.32, 0.15, 0.43, 308, 9, 7.1, 0.51),
    (120, 50, 0.253, 0.16, 0.42, 351, 11.3, 9.8, 0.36),
    (150, 50, 0.206, 0.18, 0.4, 394, 14.2, 9.8, 0.36),
    (185, 50, 0.164, 0.19, 0.39, 447, 17.5, 9.8, 0.36),
    (240, 50, 0.125, 0.21, 0.37, 518, 22.7, 9.8, 0.36),
    (300, 50, 0.1, 0.22, 0.36, 585, 28.4, 9.8, 0.36),
    (400, 50, 0.0778, 0.25, 0.35, 670, 37.8, 9.8, 0.36),
    (500, 50, 0.0605, 0.27, 0.34, 761, 47.3, 9.8, 0.36),
    (630, 50, 0.0469, 0.3, 0.33, 864, 59.5, 9.8, 0.36),
    (800, 50, 0.0367, 0.33, 0.32, 968, 75.6, 9.8, 0.36),
    (1000, 50, 0.0291, 0.37, 0.31, 1075, 94.5, 9.8, 0.36),
)

TFK_XRUHKXS_CU_1830: tuple[tuple[int, int, float, float, float, int, float, float, float], ...] = (
    (35, 16, 0.524, 0.12, 0.51, 228, 5, 3.7, 1.12),
    (50, 16, 0.387, 0.13, 0.48, 271, 7.2, 3.7, 1.12),
    (70, 25, 0.268, 0.14, 0.46, 331, 10, 5.3, 0.72),
    (95, 35, 0.193, 0.15, 0.43, 397, 13.6, 7.1, 0.51),
    (120, 50, 0.153, 0.17, 0.42, 451, 17.2, 9.8, 0.36),
    (150, 50, 0.124, 0.18, 0.4, 506, 21.5, 9.8, 0.36),
    (185, 50, 0.0991, 0.19, 0.39, 571, 26.5, 9.8, 0.36),
    (240, 50, 0.0754, 0.21, 0.37, 661, 34.3, 9.8, 0.36),
    (300, 50, 0.0601, 0.23, 0.36, 743, 42.9, 9.8, 0.36),
    (400, 50, 0.047, 0.25, 0.34, 841, 57.2, 9.8, 0.36),
    (500, 50, 0.0366, 0.28, 0.33, 945, 71.5, 9.8, 0.36),
    (630, 50, 0.0283, 0.31, 0.32, 1058, 90.1, 9.8, 0.36),
    (800, 50, 0.0221, 0.35, 0.31, 1165, 114.4, 9.8, 0.36),
    (1000, 50, 0.0176, 0.38, 0.3, 1260, 143, 9.8, 0.36),
)

def get_all_tfk_1830_cable_types() -> list[dict[str, Any]]:
    """27 pełnych modeli 18/30 kV SN Cu/Al, niezależnych od ENEA."""
    result: list[dict[str, Any]] = []
    for material, family, rows in (
        ("AL", "XRUHAKXS", TFK_XRUHAKXS_AL_1830),
        ("CU", "XRUHKXS", TFK_XRUHKXS_CU_1830),
    ):
        for s, screen, r20, cap, l_mh, iz, ith, ith_screen, r20_screen in rows:
            result.append({
                "id": f"cable-tfk-2025-{family.lower()}-{s}-{screen}-18-30",
                "name": f"Tele-Fonika {family} 1×{s}/{screen} mm² 18/30 kV",
                "params": {
                    "manufacturer": "TELE-FONIKA Kable",
                    "trade_name": f"{family} 1x{s}/{screen}",
                    "conductor_material": material,
                    "return_conductor_material": "CU",
                    "return_conductor_cross_section_mm2": float(screen),
                    "return_conductor_r_ohm_per_km_20c": r20_screen,
                    "return_conductor_ith_1s_a": ith_screen * 1000.0,
                    "return_conductor_jth_1s_a_per_mm2": round(ith_screen * 1000.0 / screen, 6),
                    "insulation_type": "XLPE",
                    "cross_section_mm2": float(s),
                    "number_of_cores": 1,
                    "r_ohm_per_km": r20,
                    "x_ohm_per_km": round(tau * 50.0 * l_mh / 1000.0, 6),
                    "c_nf_per_km": cap * 1000.0,
                    "rated_current_a": float(iz),
                    "ith_1s_a": ith * 1000.0,
                    "jth_1s_a_per_mm2": round(ith * 1000.0 / s, 6),
                    "voltage_rating_kv": 30.0,
                    "max_temperature_c": 90.0,
                    "short_circuit_temperature_c": 250.0,
                    "standard": "HD 620 S3:2023 10-R / IEC 60502-2",
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "PRODUKCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": TFK_SOURCE_1830,
                    "verification_note": (
                        f"TFK: R20={r20:g} Ω/km, C={cap:g} µF/km, "
                        f"L(trójkąt)={l_mh:g} mH/km, "
                        f"Iz(trójkąt, ekran BE)={iz} A, "
                        f"Ith fazy={ith:g} kA/1s, ekranu={ith_screen:g} kA/1s. "
                        "Warunki Iz: grunt 20°C, 0,7 m, 1 K·m/W, "
                        "trójkąt, ekrany uziemione obustronnie. "
                        "Przy innym sposobie ułożenia i bonding niezbędne "
                        "przeliczenie i dane odpowiedniej kolumny karty. "
                        "Parametry R0/X0 wymagają modelu konkretnego uziemienia "
                        "ekranów i są oznaczane jako obliczeniowe, nie producenta."
                    ),
                },
            })
    return result
