from __future__ import annotations

# Karta NAPRAWA-A (§0.1): dane żyły powrotnej PE/PEN dla WSZYSTKICH 17 pozycji
# kab_nn_* — brakowały od P0.2 (`return_conductor_r_ohm_per_km_20c`/
# `return_conductor_x_ohm_per_km` oba `None` dla każdej pozycji), blokując
# fail-closed pętlę zwarcia/SWZ/dobór zabezpieczeń w KAŻDYM punkcie nN poza
# szyną transformatora (`application.analyses.fault_loop.route.
# RouteExtractionError`, zob. `tests/e2e/test_nn_full_chain.py`, ZNALEZISKO
# BRAMKI #1/#4).
#
# Wszystkie 17 pozycji to konstrukcje NIEREDUKOWANE: oznaczenie "4xS" (albo
# "5xS" dla `kab_nn_5x35_cu`) BEZ zapisu "/" redukcji, który producenci
# stosują WYŁĄCZNIE dla żyły powrotnej zmniejszonej (np. kable SN
# "3x120/70" w `mv_cable_line_catalog.py`) — redukcja jest zawsze jawnie
# zapisana w oznaczeniu handlowym, jej brak oznacza, że WSZYSTKIE żyły mają
# jednakowy przekrój. Żyła powrotna (PEN dla rekordów 4-żyłowych
# "3L+PEN", PE dla 5-żyłowej "3L+N+PE" `kab_nn_5x35_cu`) jest zatem kolejną
# (4./5.) żyłą kabla, O TYM SAMYM przekroju i materiale co żyły fazowe:
#
#   R20_powrotna = R20_fazowa — TOŻSAMOŚĆ KONSTRUKCYJNA (§0.1 karty): ten sam
#   metal, ten sam przekrój, ta sama długość ⇒ ta sama rezystancja (IEC 60228)
#   — żaden pomiar nie może dać innej wartości dla identycznej żyły w tym
#   samym płaszczu kabla.
#
#   X_powrotna = X_fazowa — Z DANYCH PRODUCENTA (§0.1 karty, nie tożsamość):
#   NKT i Tele-Fonika Kable publikują JEDNĄ wartość reaktancji na cały typ
#   kabla (bez podziału faza/PEN/PE) — konsekwencja symetrycznej geometrii
#   wiązki żył o jednakowym przekroju; ta sama opublikowana wartość dotyczy
#   dowolnej pary żył w wiązce (nie ma osobnej kolumny "X PEN"/"X PE" w
#   ŻADNYM z przejrzanych katalogów producenckich dla tej klasy konstrukcji).
#
# Zasada konstrukcji nieredukowanej (podstawa powyższego wnioskowania)
# potwierdzona PODWÓJNIE, niezależnie od siebie: NKT YAKY/YAKYżo 0,6/1kV
# oraz Tele-Fonika Kable YAKY 0,6/1kV (MK-22-01-2018) — obie te same firmy
# stosują zapis "/" redukcji dla kabli SN w INNYCH swoich katalogach, a dla
# całej serii YAKY 16-240 mm² (0,6/1kV) go NIE stosują; Eltrim Kable
# YKXS(żo) 0,6/1kV potwierdza niezależnie ten sam wzorzec zapisu dla rodziny
# XLPE. Ogólna zasada konstrukcyjna (żyła N/PE pełnowymiarowa, chyba że
# jawnie zredukowana) dodatkowo opisana w materiale szkoleniowym SEP:
# A. Rynkowski, "Kable elektroenergetyczne — znaczenie i interpretacja
# danych". `return_conductor_material` NIE jest tu ustawiane — `LVCableType`
# (w odróżnieniu od SN `CableType`) świadomie NIE ma tego pola (decyzja karty
# P0.6 udokumentowana przy `MATERIALIZATION_CONTRACTS[KABEL_NN]` w
# `network_model/catalog/types.py`) — dopisanie go do `params` byłoby martwym
# wpisem bez konsumenta (zero fabrykacji fantomowych pól).
_RETURN_CONDUCTOR_NOTE_NN: str = (
    "Żyła powrotna PEN/PE = kolejna (4./5.) żyła kabla, o TYM SAMYM przekroju "
    "i materiale co żyły fazowe (konstrukcja NIEREDUKOWANA — oznaczenie bez "
    "zapisu '/' redukcji, w odróżnieniu od kabli z żyłą zmniejszoną). "
    "R20 żyły powrotnej z tożsamości konstrukcyjnej (IEC 60228: ten sam "
    "metal/przekrój/długość ⇒ ta sama rezystancja). X żyły powrotnej z "
    "danych producenta — NKT/Tele-Fonika/Eltrim publikują JEDNĄ wartość "
    "reaktancji na cały kabel (symetryczna geometria wiązki), stosowaną "
    "identycznie do dowolnej pary żył. Zasada konstrukcji nieredukowanej "
    "potwierdzona podwójnie i niezależnie: NKT YAKY/YAKYżo 0,6/1kV + "
    "Tele-Fonika Kable YAKY 0,6/1kV (MK-22-01-2018) dla rodziny AL; Eltrim "
    "Kable YKXS(żo) 0,6/1kV niezależnie dla rodziny XLPE. Zasada "
    "konstrukcyjna ogólna dodatkowo w materiale szkoleniowym SEP: "
    'A. Rynkowski, "Kable elektroenergetyczne — znaczenie i interpretacja '
    'danych". Karta NAPRAWA-A.'
)


def get_all_lv_cable_types() -> list[dict]:
    """
    Katalog kabli niskiego napięcia (nN) 0.6/1 kV.

    Rodziny:
    - YAKY (Al, 4-żyłowy, PVC, 0.6/1 kV): przekroje 16-240 mm²
    - YKY (Cu, 4/5-żyłowy, PVC, 0.6/1 kV): przekroje 35-120 mm²
    - YKXS (Cu, 4-żyłowy, XLPE, 0.6/1 kV): przekroje 35-70 mm²

    Źródło: Tele-Fonika Kable / NKT / norma IEC 60502-1 / dane referencyjne.
    """
    return [
        # -----------------------------------------------------------------------
        # YAKY — aluminium, 4-żyłowy, izolacja PVC, 0.6/1 kV
        # -----------------------------------------------------------------------
        {
            "id": "kab_nn_yaky_4x16_al",
            "name": "YAKY 4x16 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 1.910,
                "x_ohm_per_km": 0.077,
                "i_max_a": 85.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 16.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 16.0,
                "return_conductor_r_ohm_per_km_20c": 1.910,
                "return_conductor_x_ohm_per_km": 0.077,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x25_al",
            "name": "YAKY 4x25 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 1.200,
                "x_ohm_per_km": 0.075,
                "i_max_a": 110.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 25.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 25.0,
                "return_conductor_r_ohm_per_km_20c": 1.200,
                "return_conductor_x_ohm_per_km": 0.075,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x35_al",
            "name": "YAKY 4x35 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.868,
                "x_ohm_per_km": 0.073,
                "i_max_a": 135.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 35.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 35.0,
                "return_conductor_r_ohm_per_km_20c": 0.868,
                "return_conductor_x_ohm_per_km": 0.073,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x50_al",
            "name": "YAKY 4x50 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.641,
                "x_ohm_per_km": 0.072,
                "i_max_a": 160.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 50.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 50.0,
                "return_conductor_r_ohm_per_km_20c": 0.641,
                "return_conductor_x_ohm_per_km": 0.072,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_4x70_al",
            "name": "YAKY 4x70 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.072,
                "i_max_a": 180.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 70.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 70.0,
                "return_conductor_r_ohm_per_km_20c": 0.443,
                "return_conductor_x_ohm_per_km": 0.072,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x95_al",
            "name": "YAKY 4x95 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.320,
                "x_ohm_per_km": 0.070,
                "i_max_a": 215.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 95.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 95.0,
                "return_conductor_r_ohm_per_km_20c": 0.320,
                "return_conductor_x_ohm_per_km": 0.070,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_4x120_al",
            "name": "YAKY 4x120 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.253,
                "x_ohm_per_km": 0.069,
                "i_max_a": 240.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 120.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 120.0,
                "return_conductor_r_ohm_per_km_20c": 0.253,
                "return_conductor_x_ohm_per_km": 0.069,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x150_al",
            "name": "YAKY 4x150 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.206,
                "x_ohm_per_km": 0.068,
                "i_max_a": 275.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 150.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 150.0,
                "return_conductor_r_ohm_per_km_20c": 0.206,
                "return_conductor_x_ohm_per_km": 0.068,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x185_al",
            "name": "YAKY 4x185 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.164,
                "x_ohm_per_km": 0.067,
                "i_max_a": 315.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 185.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 185.0,
                "return_conductor_r_ohm_per_km_20c": 0.164,
                "return_conductor_x_ohm_per_km": 0.067,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yaky_4x240_al",
            "name": "YAKY 4x240 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.125,
                "x_ohm_per_km": 0.066,
                "i_max_a": 360.0,
                "conductor_material": "AL",
                "insulation_type": "PVC",
                "cross_section_mm2": 240.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 240.0,
                "return_conductor_r_ohm_per_km_20c": 0.125,
                "return_conductor_x_ohm_per_km": 0.066,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 76.09,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        # -----------------------------------------------------------------------
        # YKY — miedź, 4/5-żyłowy, izolacja PVC, 0.6/1 kV
        # -----------------------------------------------------------------------
        {
            "id": "kab_nn_5x35_cu",
            "name": "YKY 5x35 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.524,
                "x_ohm_per_km": 0.082,
                "i_max_a": 125.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 35.0,
                "number_of_cores": 5,
                "core_functions": "3L+N+PE",
                "return_conductor_cross_section_mm2": 35.0,
                "return_conductor_r_ohm_per_km_20c": 0.524,
                "return_conductor_x_ohm_per_km": 0.082,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 114.84,
                "standard": "IEC 60502-1",
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN
                + " (rekord 5-żyłowy: żyła powrotna = PE, 5. żyła, NIE N — obwód "
                "pętli zwarcia L-PE tego kontraktu czyta 'żyłę powrotną' generycznie, "
                "niezależnie od układu TN-S/TN-C-S).",
            },
        },
        {
            "id": "kab_nn_yky_4x50_cu",
            "name": "YKY 4x50 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.387,
                "x_ohm_per_km": 0.079,
                "i_max_a": 160.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 50.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 50.0,
                "return_conductor_r_ohm_per_km_20c": 0.387,
                "return_conductor_x_ohm_per_km": 0.079,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 114.84,
                "standard": "IEC 60502-1",
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yky_4x70_cu",
            "name": "YKY 4x70 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.268,
                "x_ohm_per_km": 0.076,
                "i_max_a": 200.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 70.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 70.0,
                "return_conductor_r_ohm_per_km_20c": 0.268,
                "return_conductor_x_ohm_per_km": 0.076,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 114.84,
                "standard": "IEC 60502-1",
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yky_4x95_cu",
            "name": "YKY 4x95 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.193,
                "x_ohm_per_km": 0.074,
                "i_max_a": 240.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 95.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 95.0,
                "return_conductor_r_ohm_per_km_20c": 0.193,
                "return_conductor_x_ohm_per_km": 0.074,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 114.84,
                "standard": "IEC 60502-1",
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_yky_4x120_cu",
            "name": "YKY 4x120 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.153,
                "x_ohm_per_km": 0.073,
                "i_max_a": 275.0,
                "conductor_material": "CU",
                "insulation_type": "PVC",
                "cross_section_mm2": 120.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 120.0,
                "return_conductor_r_ohm_per_km_20c": 0.153,
                "return_conductor_x_ohm_per_km": 0.073,
                "max_temperature_c": 70.0,
                "short_circuit_temperature_c": 160.0,
                "jth_1s_a_per_mm2": 114.84,
                "standard": "IEC 60502-1",
                "manufacturer": "NKT",
                "source_reference": "NKT Cables / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        # -----------------------------------------------------------------------
        # YKXS — miedź, 4-żyłowy, izolacja XLPE, 0.6/1 kV (lepsza obciążalność)
        # -----------------------------------------------------------------------
        {
            "id": "kab_nn_ykxs_4x35_cu",
            "name": "YKXS 4x35 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.524,
                "x_ohm_per_km": 0.078,
                "i_max_a": 145.0,
                "conductor_material": "CU",
                "insulation_type": "XLPE",
                "cross_section_mm2": 35.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 35.0,
                "return_conductor_r_ohm_per_km_20c": 0.524,
                "return_conductor_x_ohm_per_km": 0.078,
                "max_temperature_c": 90.0,
                "short_circuit_temperature_c": 250.0,
                "jth_1s_a_per_mm2": 142.87,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
        {
            "id": "kab_nn_ykxs_4x70_cu",
            "name": "YKXS 4x70 mm²",
            "params": {
                "u_n_kv": 0.4,
                "r_ohm_per_km": 0.268,
                "x_ohm_per_km": 0.072,
                "i_max_a": 225.0,
                "conductor_material": "CU",
                "insulation_type": "XLPE",
                "cross_section_mm2": 70.0,
                "number_of_cores": 4,
                "core_functions": "3L+PEN",
                "return_conductor_cross_section_mm2": 70.0,
                "return_conductor_r_ohm_per_km_20c": 0.268,
                "return_conductor_x_ohm_per_km": 0.072,
                "max_temperature_c": 90.0,
                "short_circuit_temperature_c": 250.0,
                "jth_1s_a_per_mm2": 142.87,
                "standard": "IEC 60502-1",
                "manufacturer": "Tele-Fonika Kable",
                "source_reference": "Tele-Fonika Kable / IEC 60502-1 / dane referencyjne",
                "verification_note": _RETURN_CONDUCTOR_NOTE_NN,
            },
        },
    ]


def get_all_load_types() -> list[dict]:
    return [
        {
            "id": "load_mieszk_15kw",
            "name": "Obciazenie mieszkaniowe 15 kW",
            "params": {
                "model": "PQ",
                "p_kw": 15.0,
                "cos_phi": 0.95,
                "cos_phi_mode": "IND",
                "manufacturer": "Profil standardowy",
            },
        },
        {
            "id": "load_uslugi_30kw",
            "name": "Obciazenie uslugowe 30 kW",
            "params": {
                "model": "PQ",
                "p_kw": 30.0,
                "cos_phi": 0.92,
                "cos_phi_mode": "IND",
                "manufacturer": "Profil standardowy",
            },
        },
        {
            "id": "load_przem_75kw",
            "name": "Obciazenie przemyslowe 75 kW",
            "params": {
                "model": "PQ",
                "p_kw": 75.0,
                "q_kvar": 28.0,
                "cos_phi": 0.94,
                "cos_phi_mode": "IND",
                "manufacturer": "Profil standardowy",
            },
        },
    ]


def get_all_lv_apparatus_types() -> list[dict]:
    """Zwraca aparature laczeniowa nN — 14 rekordow.

    Zrodla:
    - WYLACZNIK_GLOWNY (ABB SACE Emax2, 630-1600 A): ABB SACE Emax2 katalog
      1SDA073513R1 / 1SDC200023D0203 (rama E1.2 wersja C, Icu 440V=50kA)
    - WYLACZNIK_GLOWNY 400 A (ABB SACE Tmax XT5S — KOREKTA UM-ICU-KATALOG,
      karta S-UM-ICU §0.4a): rama E1.2 Emax2 zaczyna sie od 630 A, wiec 400 A
      nie moze byc Emax2; 400 A/50 kA odpowiada ramie XT5S. ABB Tmax XT5 karta
      techniczna 1SXU210259D0201
    - WYLACZNIK_ODPLYWOWY (ABB SACE Tmax XT): ABB Tmax XT katalog 1SDA066835R1
      (100/160/250 A rama XT1C/XT3C wg 1SDC210064D0201; 400/630 A rama XT5N/S)
    - ROZLACZNIK_BEZPIECZNIKOWY (Jean Muller NH, wielkosc 00/1): Jean Muller
      NH Fuse-Switch-Disconnectors katalog (Ue=AC690V, warunkowy prad
      zwarciowy=50kA) — KOREKTA UM-ICU-KATALOG: poprzednia wartosc 16kA
      breaking_capacity_ka byla zanizona wobec karty katalogowej producenta

    U_m / I_cu (IEC 60947-2/-3, karta UM-ICU-KATALOG): u_m_kv = 0,69 kV
    (znamionowe napiecie laczeniowe Ue producenta) dla WSZYSTKICH pozycji
    ponizej; i_cu_ka = zdolnosc wylaczalna I_cu przy Ue.

    KOREKTA (karta P0.7, „Stanowisko nN runda 3" —
    docs/nn/UZGODNIENIA_WATKOW_2026-08-13.md): dla ROZLACZNIK_BEZPIECZNIKOWY
    i_cu_ka jest teraz "nie dotyczy" (None) — sam rozlacznik (bez wkladki) NIE
    MA wlasnej zdolnosci wylaczania zwarcia. Warunkowy prad zwarciowy
    KOMBINACJI rozlacznik+wkladka NH (Jean Muller NH Fuse-Switch-Disconnectors
    katalog, Ue=AC690V) niesie teraz osobne pole `conditional_sc_current_ka`
    (poprzednio blednie zapisywany w i_cu_ka — przeniesione, nie zdublowane).

    KARTA NAPRAWA-A (§0.2.b) — SWIADOMIE NIE dodano tu nastaw wyzwalacza
    elektronicznego MCCB (Ir/Isd/Ii/tr/tsd) dla WYLACZNIK_GLOWNY/
    WYLACZNIK_ODPLYWOWY. Karta warunkowala populacje TYLKO jesli istnieje
    JUZ DZIALAJACY konsument w produkcji — audyt kontraktu wykazal, ze GO
    NIE MA:
      1. `network_model/solvers/protection_lv_curves.py::compute_mccb_point`
         przyjmuje skonkretyzowane skalary (ir_a/isd_a/ii_a/tr_s/tsd_s), ale
         ma ZERO wywolan produkcyjnych poza wlasnym modulem (grep w `src/`) —
         MCCB_ELECTRONIC (P0.7) istnieje jako RODZINA KRZYWYCH, nie jako
         sciezka wpiecia w dobor aparatu.
      2. `application/analyses/nn_device_selection.py::_kryterium_i2` dla
         `KIND_MCCB` jest TWARDO zakodowane na NIEROZSTRZYGALNE — gałąź
         `else` zwraca stały komunikat „brak rozwiazanych nastaw" NIEZALEZNIE
         od tego, czy dane katalogowe istnieja, czy nie (nie odczytuje w
         ogole pol Ir/Isd/Ii z kandydata).
      3. `KandydatAparatuNn` (ta sama analiza) NIE MA pol ir_a/isd_a/ii_a —
         nawet gdyby katalog je niosl, nie ma jak dotrzec do kryterium.
    To jest LUKA KONSUMENTA, nie luka danych — dopisanie tu ir_range/
    isd_range/ii_range/tr_range/tsd_range BEZ rownoczesnej zmiany (1)-(3)
    stworzyloby rekord z polem, ktorego ZADEN kod produkcyjny nie czyta
    (fantom, zakazany przez zasade zero-fabrykacji karty). Naprawa wymaga
    OSOBNEJ karty, ktora zmienia `_kryterium_i2`/`KandydatAparatuNn` zeby
    faktycznie konsumowaly nastawy — bez tego dopisanie samych danych
    katalogowych nic by nie zmienilo w wyniku doboru aparatu.
    """
    return [
        # --- WYLACZNIK_GLOWNY: ABB SACE Emax2 ---
        {
            "id": "cb_nn_400a",
            "name": "Wylacznik glowny nN 400 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 400.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1 / ABB Tmax XT5 karta techniczna 1SXU210259D0201 (rama XT5S 400A, Icu 480V=50kA; KOREKTA atrybucji zrodlowej: rama E1.2 Emax2 zaczyna sie od 630A, wiec 400A/50kA nie moze byc Emax2 — pasuje do Tmax XT5S)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_630a",
            "name": "Wylacznik glowny nN 630 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 630.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1 / ABB SACE Emax2 katalog 1SDC200023D0203 str.2/2 (rama E1.2 wersja C, Icu 440V=50kA @ 630A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_800a",
            "name": "Wylacznik glowny nN 800 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 800.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1 / ABB SACE Emax2 katalog 1SDC200023D0203 str.2/2 (rama E1.2 wersja C, Icu 440V=50kA @ 800A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_1000a",
            "name": "Wylacznik glowny nN 1000 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 1000.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1 / ABB SACE Emax2 katalog 1SDC200023D0203 str.2/2 (rama E1.2 wersja C, Icu 440V=50kA @ 1000A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_1250a",
            "name": "Wylacznik glowny nN 1250 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 1250.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1 / ABB SACE Emax2 katalog 1SDC200023D0203 str.2/2 (rama E1.2 wersja C, Icu 440V=50kA @ 1250A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_1600a",
            "name": "Wylacznik glowny nN 1600 A",
            "params": {
                "device_kind": "WYLACZNIK_GLOWNY",
                "u_n_kv": 0.4,
                "i_n_a": 1600.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB SACE Emax2 katalog 1SDA073513R1 / ABB SACE Emax2 katalog 1SDC200023D0203 str.2/2 (rama E1.2 wersja C, Icu 440V=50kA @ 1600A)",
                "contract_version": "2.0",
            },
        },
        # --- WYLACZNIK_ODPLYWOWY: ABB SACE Tmax XT ---
        {
            "id": "cb_nn_100a",
            "name": "Wylacznik odplywowy nN 100 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 100.0,
                "breaking_capacity_ka": 25.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 25.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1 / ABB Tmax XT katalog 1SDC210064D0201 str.6 (rama XT1C 160, Icu 415V=25kA @ In=100A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_160a",
            "name": "Wylacznik odplywowy nN 160 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 160.0,
                "breaking_capacity_ka": 25.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 25.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1 / ABB Tmax XT katalog 1SDC210064D0201 str.6 (rama XT1C 160, Icu 415V=25kA @ In=150A/160A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_250a",
            "name": "Wylacznik odplywowy nN 250 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 250.0,
                "breaking_capacity_ka": 25.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 25.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1 / ABB Tmax XT katalog 1SDC210064D0201 str.7 (rama XT3C 250, Icu 415V=25kA @ In=250A)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_400a_odp",
            "name": "Wylacznik odplywowy nN 400 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 400.0,
                "breaking_capacity_ka": 36.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 36.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1 (rama XT5N 400A, Icu 415V=36kA; zweryfikowano posrednio kartą techniczną XT5 1SXU210259D0201 — Icu 480V N=35kA, ten sam wariant N — pelna tabela IEC przekroczyla limit rozmiaru pobierania w tej sesji)",
                "contract_version": "2.0",
            },
        },
        {
            "id": "cb_nn_630a_odp",
            "name": "Wylacznik odplywowy nN 630 A",
            "params": {
                "device_kind": "WYLACZNIK_ODPLYWOWY",
                "u_n_kv": 0.4,
                "i_n_a": 630.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": 50.0,
                "manufacturer": "ABB",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "ABB Tmax XT katalog 1SDA066835R1 (rama XT5S 630A, Icu 415V=50kA; zgodnosc z karta techniczna XT5 1SXU210259D0201 — Icu 480V S=50kA, dokladne dopasowanie)",
                "contract_version": "2.0",
            },
        },
        # --- ROZLACZNIK_BEZPIECZNIKOWY: Jean Muller NHR ---
        {
            "id": "rb_nn_100a",
            "name": "Rozlacznik bezpiecznikowy nN 100 A",
            "params": {
                "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
                "u_n_kv": 0.4,
                "i_n_a": 100.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": None,
                "conditional_sc_current_ka": 50.0,
                "manufacturer": "Jean Muller",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "Jean Muller NHR katalog / KOREKTA: Jean Muller NH Fuse-Switch-Disconnectors katalog str. T-30 (typ LTL00, Ue=AC690V, warunkowy prad zwarciowy=50kA) — poprzednia wartosc 16kA byla zanizona / bledna",
                "contract_version": "2.0",
            },
        },
        {
            "id": "rb_nn_160a",
            "name": "Rozlacznik bezpiecznikowy nN 160 A",
            "params": {
                "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
                "u_n_kv": 0.4,
                "i_n_a": 160.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": None,
                "conditional_sc_current_ka": 50.0,
                "manufacturer": "Jean Muller",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "Jean Muller NHR katalog / KOREKTA: Jean Muller NH Fuse-Switch-Disconnectors katalog str. T-30 (typ LTL00, Ue=AC690V, warunkowy prad zwarciowy=50kA) — poprzednia wartosc 16kA byla zanizona / bledna",
                "contract_version": "2.0",
            },
        },
        {
            "id": "rb_nn_250a",
            "name": "Rozlacznik bezpiecznikowy nN 250 A",
            "params": {
                "device_kind": "ROZLACZNIK_BEZPIECZNIKOWY",
                "u_n_kv": 0.4,
                "i_n_a": 250.0,
                "breaking_capacity_ka": 50.0,
                "u_m_kv": 0.69,
                "i_cu_ka": None,
                "conditional_sc_current_ka": 50.0,
                "manufacturer": "Jean Muller",
                "verification_status": "ZWERYFIKOWANY",
                "catalog_status": "PRODUKCYJNY_V1",
                "source_reference": "Jean Muller NHR katalog / KOREKTA: Jean Muller NH Fuse-Switch-Disconnectors katalog str. T-30 (typ LTL1, Ue=AC690V, warunkowy prad zwarciowy=50kA bez Q-wspomagania / 80kA z Q-wspomaganiem — przyjeto wariant podstawowy 50kA) — poprzednia wartosc 16kA byla zanizona / bledna",
                "contract_version": "2.0",
            },
        },
    ]


# Znamionowe pradowe wg IEC 60898-1 Tabela 2 (In 6...63 A, seria E6/E12
# stosowana w wylacznikach nadmiarowo-pradowych domowych i podobnych, WT-1).
_MCB_IN_A: tuple[float, ...] = (6.0, 10.0, 13.0, 16.0, 20.0, 25.0, 32.0, 40.0, 50.0, 63.0)
# Klasy charakterystyki wyzwalania (IEC 60898-1 Tabela 3): B (3-5*In), C
# (5-10*In), D (10-20*In) — progi magnetyczne sa fizyka aparatu, nie danymi tej
# tabeli (patrz protection_lv_curves.py, faza P0.7 planu H).
_MCB_CURVE_CLASSES: tuple[str, ...] = ("B", "C", "D")
# Znamionowa zdolnosc zwarciowa Icn dla rodziny generycznej domowej/podobnej
# (IEC 60898-1 §4.4, wartosc normatywna najczesciej spotykana w tej klasie
# wyrobu — 6 kA). Rodzina jest REFERENCYJNA (brak wiazania z konkretnym
# producentem), wiec Icn jest jednolite dla calej serii.
_MCB_ICN_KA: float = 6.0

# Karta NAPRAWA-A (§0.2.a): druga, rownolegla rodzina MCB o WYZSZEJ znamionowej
# zdolnosci zwarciowej Icn=10 kA — IEC 60898-1 §4.4 dopuszcza 10 kA jako jedna
# ze znormalizowanych wartosci Icn (obok 4,5/6/10/15/20/25 kA), stosowana w
# realnych wyrobach przemyslowych (nie tylko domowych 6 kA). ADDYTYWNA —
# rekordy istniejacej rodziny 6 kA (`mcb_nn_{klasa}{In}a`) NIE sa ruszane ani
# usuwane, nowe rekordy dostaja odrebny identyfikator (`..._10ka`), wiec zaden
# istniejacy test/referencja katalogowa (np. `REF_MCB_K2` w
# `tests/e2e/test_nn_full_chain.py`) sie nie zmienia. Realny konsument juz
# istnieje bez zmian kodu: `_kryterium_zdolnosc_wylaczania`
# (`application/analyses/nn_device_selection.py`) czyta `icn_ka` GENERYCZNIE z
# KAZDEGO rekordu `list_lv_breaker_mcb_types()` — dodanie rekordow z wyzszym
# Icn od razu poszerza pule kandydatow zdolnych spelnic kryterium
# Icu>=Ik''max na obwodach o wyzszym poziomie zwarcia (ZNALEZISKO BRAMKI #4).
_MCB_ICN_KA_10KA: float = 10.0
_MCB_ICN_KA_10KA_SOURCE: str = (
    "IEC 60898-1 §4.4 (Icn=10 kA jest znormalizowana wartoscia szeregu, obok "
    "6/15/20/25 kA) — Icn=10 kA POTWIERDZONA PODWOJNIE, niezaleznie, w kartach "
    "katalogowych realnych wyrobow przemyslowych: Hager (seria NCN2../NBN1../"
    "NDN1.., karta techniczna np. NCN210 — Icn=10000 A, Un=230/400V) i "
    "Schneider Electric (Acti9 iC60H, katalog Acti9 System — Icn=10 kA dla "
    "calej serii iC60H B/C/D, In 0,5-63 A). Rodzina pozostaje REFERENCYJNA "
    "(brak wiazania z JEDNYM konkretnym numerem katalogowym producenta — "
    "Icn=10 kA jest wspolna dla wielu wyrobow obu producentow), analogicznie "
    "do rodziny 6 kA."
)


def get_all_lv_breaker_mcb_types() -> list[dict]:
    """Zwraca generyczne rodziny wylacznikow nadmiarowo-pradowych (MCB) nN.

    Karta P0.2 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.2): rodzina bazowa
    Icn=6 kA, 10 pradow znamionowych x 3 klasy charakterystyki (B/C/D) =
    30 rekordow.

    Karta NAPRAWA-A (§0.2.a): DRUGA, rownolegla rodzina Icn=10 kA (te same 10
    pradow x 3 klasy = kolejne 30 rekordow, identyfikatory `..._10ka`) —
    poszerza pule kandydatow katalogowych zdolnych spelnic kryterium
    Icu>=Ik''max na obwodach nN o wyzszym poziomie zwarcia (ZNALEZISKO
    BRAMKI #4, `tests/e2e/test_nn_full_chain.py::
    test_krok_07b_dobor_zabezpieczen_w_punkcie_znalezisko_bramki`).

    ZERO FABRYKACJI: wszystkie wartosci pradowe/klasy sa znamionowe
    normatywne wg IEC 60898-1 (nie sa to dane zadnego JEDNEGO konkretnego
    produktu) — rekordy maja verification_status=REFERENCYJNY,
    catalog_status=REFERENCYJNY_V1. Icn=6 kA jest normatywna wartoscia
    najpowszechniej spotykana w tej klasie wyrobu (bez potrzeby dodatkowego
    zrodla producenckiego — `_MCB_ICN_KA` niezmienione od karty P0.2);
    Icn=10 kA jest rowniez normatywna wartoscia szeregu IEC 60898-1, ale
    rzadsza w produktach domowych — stad podwojne potwierdzenie producenckie
    (`_MCB_ICN_KA_10KA_SOURCE`) dla realnego istnienia tej klasy wyrobu.
    """
    records: list[dict] = []
    for in_a in _MCB_IN_A:
        for curve_class in _MCB_CURVE_CLASSES:
            in_label = int(in_a) if in_a == int(in_a) else in_a
            records.append(
                {
                    "id": f"mcb_nn_{curve_class.lower()}{int(in_a)}a",
                    "name": f"MCB {curve_class}{in_label}",
                    "params": {
                        "u_n_kv": 0.4,
                        "in_a": in_a,
                        "curve_class": curve_class,
                        "icn_ka": _MCB_ICN_KA,
                        "poles": None,
                        "verification_status": "REFERENCYJNY",
                        "catalog_status": "REFERENCYJNY_V1",
                        "source_reference": "IEC 60898-1 (wartosci znamionowe normatywne)",
                        "contract_version": "2.0",
                    },
                }
            )
            records.append(
                {
                    "id": f"mcb_nn_{curve_class.lower()}{int(in_a)}a_10ka",
                    "name": f"MCB {curve_class}{in_label} (Icn 10 kA)",
                    "params": {
                        "u_n_kv": 0.4,
                        "in_a": in_a,
                        "curve_class": curve_class,
                        "icn_ka": _MCB_ICN_KA_10KA,
                        "poles": None,
                        "verification_status": "REFERENCYJNY",
                        "catalog_status": "REFERENCYJNY_V1",
                        "source_reference": "IEC 60898-1 (wartosci znamionowe normatywne, Icn 10 kA)",
                        "contract_version": "2.0",
                        "verification_note": _MCB_ICN_KA_10KA_SOURCE,
                    },
                }
            )
    return records


# Wielkosci fizyczne wkladek topikowych nN wg IEC 60269-2/DIN 43620 (NH00, NH1,
# NH2 — rodzina najpowszechniej stosowana w rozdzielnicach nN).
_FUSE_SIZES: tuple[str, ...] = ("NH00", "NH1", "NH2")
# Znamionowe pradowe wkladek gG wg IEC 60269-1 Tabela IV (seria znormalizowana).
_FUSE_IN_A: tuple[float, ...] = (
    25.0,
    35.0,
    50.0,
    63.0,
    80.0,
    100.0,
    125.0,
    160.0,
    200.0,
    250.0,
)


_FUSE_GG_BREAKING_CAPACITY_KA: float = 120.0
_FUSE_GG_BREAKING_CAPACITY_SOURCE: str = (
    "IEC 60269-1 (wartosci znamionowe normatywne) — I_1=120 kA AC @ 500 V dla wkladek NH gG, "
    "potwierdzone podwojnie w katalogach producenckich niezaleznych od siebie: "
    "Socomec (emea.socomec.com/en/p/knife-edge-fuses-nh-gg-type), "
    "EFEN (katalog.efen.sk/en/c/nh-fuse-links/nh-fuse-links-ac-500-v-gg), "
    "ETI Group (etigroup.eu, seria NH gG 500V), Mersen (DS-NH-fuse-links-gG-500VAC), "
    "Eaton Bussmann (bus-iec-ds-10164-nh500voltsfuselinks.pdf) — wszystkie zgodnie 120 kA."
)


def get_all_lv_fuse_link_types() -> list[dict]:
    """Zwraca generyczna rodzine wkladek topikowych gG nN wg IEC 60269-1.

    Karta P0.2 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.2). 3 wielkosci
    (NH00/NH1/NH2) x 10 pradow znamionowych = 30 rekordow.

    G-D2 (docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md): bramki czasowo-pradowe I-t
    (pre-arcing/total clearing) NIE SA fabrykowane — `i2t_prearc_a2s` zostaje
    `None` do czasu zasilenia tablicami bramek IEC 60269-1 z proweniencja.
    Konsument (SWZ/selektywnosc) MUSI odczytac brak danej jako "dane
    niekompletne", nigdy PASS.

    KARTA NAPRAWA-A (§0.2.c) — PROBA podwojnego zrodlenia `i2t_prearc_a2s`
    (pre-arcing I²t) PODJETA i NIEROZSTRZYGNIETA. Dwa realne zrodla
    producenckie zweryfikowane bezposrednio (nie przez podsumowanie
    wyszukiwarki — WebFetch+odczyt oryginalnego PDF):
      - ETI Polam, katalog WT-NH (aspar.com.pl/katalogi/wt-nh_eti.pdf), str.
        485, tabela „Straty mocy wkladek topikowych o charakterystykach gG —
        KOMBI" (kolumna I²t 1 ms/pre-arcing per wielkosc/In).
      - Eaton Bussmann, „Technical Data 10164"
        (eaton.com, bus-iec-ds-10164-nh500voltsfuselinks.pdf), oficjalna
        tabela „Minimum pre-arcing I²t (Amps² Seconds)" per wielkosc NH
        (000/00/0/01/1/02/2/03/3/4) i In.
    Dla pasujacych par (wielkosc, In) wartosci ETI sa SYSTEMATYCZNIE wyzsze
    o ok. 30-60% od wartosci Bussmann — rozjazd nie da sie uczciwie pogodzic
    w tej sesji (rozne definicje pomiaru/tolerancji producenta? rozne
    warianty konstrukcyjne w ramach tej samej wielkosci NH? — nieustalone).
    ZERO FABRYKACJI: pole zostaje `None` dla WSZYSTKICH 30 (teraz 60, po
    dodaniu rodziny Icn=10 kA MCB — ta rodzina wkladek jest osobna,
    niezmieniona) rekordow gG — dwa zrodla ISTNIEJA, ale NIE SA ZGODNE, wiec
    nie spelniaja bramki „podwojnie potwierdzone" karty §0.1/§0.2.a.
    Konsekwencja: `_kryterium_swz`/`ocen_swz` dla WKLADKA_GG pozostaje
    NIEROZSTRZYGALNE (ten sam hardcoded branch co przed karta —
    `application/analyses/swz/werdykt.py`, `aparat.typ == "WKLADKA_GG"`),
    NIEZALEZNIE od tego pola — nawet gdyby jedno zrodlo zostalo przyjete
    jednostronnie, `ocen_swz` i tak by go nie odczytalo (branch jest
    bezwarunkowy, nie sprawdza `i2t_prearc_a2s`) — WIEC populacja tego pola
    BEZ rownoczesnej zmiany `werdykt.py` bylaby dodatkowo fantomem (patrz
    analogiczne uzasadnienie przy MCCB w `get_all_lv_apparatus_types`).

    FLIP-TO-VERIFIED (karta P0.7): `breaking_capacity_ka` jest teraz
    zasilone — 120 kA AC @ 500 V, wartosc jednolita dla calej rodziny NH gG
    (analogicznie do `_MCB_ICN_KA` — normatywna, nie zalezna od In), z
    proweniencja podwojna (patrz `_FUSE_GG_BREAKING_CAPACITY_SOURCE`).
    Konsument: kryterium doboru Icu≥Ik″max
    (`application/analyses/nn_device_selection.py`, karta P0.7).
    """
    records: list[dict] = []
    for size in _FUSE_SIZES:
        for in_a in _FUSE_IN_A:
            records.append(
                {
                    "id": f"fuse_nn_gg_{size.lower()}_{int(in_a)}a",
                    "name": f"gG {size} {int(in_a)}A",
                    "params": {
                        "u_n_kv": 0.4,
                        "in_a": in_a,
                        "fuse_class": "gG",
                        "size": size,
                        "i2t_prearc_a2s": None,
                        "breaking_capacity_ka": _FUSE_GG_BREAKING_CAPACITY_KA,
                        "verification_status": "REFERENCYJNY",
                        "catalog_status": "REFERENCYJNY_V1",
                        "source_reference": "IEC 60269-1 (wartosci znamionowe normatywne)",
                        "contract_version": "2.0",
                        "verification_note": _FUSE_GG_BREAKING_CAPACITY_SOURCE,
                    },
                }
            )
    return records


def get_all_ct_types() -> list[dict]:
    def _quality_meta(
        *,
        verification_status: str,
        source_reference: str,
        catalog_status: str,
        verification_note: str,
    ) -> dict:
        return {
            "verification_status": verification_status,
            "source_reference": source_reference,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
        }

    source_reference = (
        "Katalog CT MV-DESIGN-PRO / IEC 61869-2 (rdzen, ALF, Idyn=2,5·Ith, Fs) "
        "/ IEC 62271-200 (szereg wytrzymalosci rozdzielnicy SN)"
    )
    verification_note = (
        "Rekord referencyjny do doboru CT. Ith podano jako WYMAGANA wytrzymalosc "
        "cieplna przekladnika w rozdzielnicy SN wg znormalizowanego szeregu "
        "IEC 62271-200 (16 kA/1 s dla torow <= 150 A, 20 kA/1 s dla 200-1000 A, "
        "25 kA/1 s dla >= 1200 A); Idyn wyprowadzany normowo (2,5·Ith), Fs wg "
        "znormalizowanej wartosci 10 dla rdzeni pomiarowych. Wartosci wlasciwe dla "
        "konkretnego wyrobu potwierdza karta producenta."
    )
    return [
        {
            "id": "ct_50_1_0_5_5va_arteche",
            "name": "CT 50/1 A kl. 0.5 5 VA",
            "params": {
                "ratio_primary_a": 50.0,
                "ratio_secondary_a": 1.0,
                "accuracy_class": "0.5",
                "burden_va": 5.0,
                "ith_ka_1s": 16.0,
                "fs_safety_factor": 10.0,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_100_1_0_5_5va_abb",
            "name": "CT 100/1 A kl. 0.5 5 VA",
            "params": {
                "ratio_primary_a": 100.0,
                "ratio_secondary_a": 1.0,
                "accuracy_class": "0.5",
                "burden_va": 5.0,
                "ith_ka_1s": 16.0,
                "fs_safety_factor": 10.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_150_1_0_5_10va_abb",
            "name": "CT 150/1 A kl. 0.5 10 VA",
            "params": {
                "ratio_primary_a": 150.0,
                "ratio_secondary_a": 1.0,
                "accuracy_class": "0.5",
                "burden_va": 10.0,
                "ith_ka_1s": 16.0,
                "fs_safety_factor": 10.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_200_5_5p10_10va_abb",
            "name": "CT 200/5 A kl. 5P10 10 VA",
            "params": {
                "ratio_primary_a": 200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P10",
                "burden_va": 10.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_300_5_5p10_10va_siemens",
            "name": "CT 300/5 A kl. 5P10 10 VA",
            "params": {
                "ratio_primary_a": 300.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P10",
                "burden_va": 10.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_400_5_5p20_15va_abb",
            "name": "CT 400/5 A kl. 5P20 15 VA",
            "params": {
                "ratio_primary_a": 400.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 15.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_600_5_5p20_15va_schneider",
            "name": "CT 600/5 A kl. 5P20 15 VA",
            "params": {
                "ratio_primary_a": 600.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 15.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "Schneider Electric",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_800_5_5p20_20va_arteche",
            "name": "CT 800/5 A kl. 5P20 20 VA",
            "params": {
                "ratio_primary_a": 800.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 20.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_1000_5_5p20_20va_abb",
            "name": "CT 1000/5 A kl. 5P20 20 VA",
            "params": {
                "ratio_primary_a": 1000.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 20.0,
                "ith_ka_1s": 20.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_1200_5_5p20_20va_siemens",
            "name": "CT 1200/5 A kl. 5P20 20 VA",
            "params": {
                "ratio_primary_a": 1200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 20.0,
                "ith_ka_1s": 25.0,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_1500_5_5p20_30va_abb",
            "name": "CT 1500/5 A kl. 5P20 30 VA",
            "params": {
                "ratio_primary_a": 1500.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P20",
                "burden_va": 30.0,
                "ith_ka_1s": 25.0,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "ct_2000_5_10p10_30va_arteche",
            "name": "CT 2000/5 A kl. 10P10 30 VA",
            "params": {
                "ratio_primary_a": 2000.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "10P10",
                "burden_va": 30.0,
                "ith_ka_1s": 25.0,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
    ]


def get_all_vt_types() -> list[dict]:
    def _quality_meta(
        *,
        verification_status: str,
        source_reference: str,
        catalog_status: str,
        verification_note: str,
    ) -> dict:
        return {
            "verification_status": verification_status,
            "source_reference": source_reference,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
        }

    source_reference = "Katalog VT MV-DESIGN-PRO / IEC 61869-3 / dane referencyjne"
    verification_note = (
        "Rekord referencyjny do doboru VT. Wspolczynnik napieciowy 1,9 przez 8 h jest "
        "WARTOSCIA DEKLAROWANA wg IEC 61869-3 tab. 2 dla sieci maloprądowej (izolowanej "
        "albo kompensowanej) bez automatycznego wylaczania zwarcia doziemnego — takie sa "
        "polskie sieci SN. Moc znamionowa 30 VA pochodzi z szeregu znormalizowanego "
        "IEC 61869-3. Oba parametry oraz obecnosc uzwojenia resztkowego nalezy potwierdzic "
        "karta producenta przed uzyciem produkcyjnym (verification_status)."
    )
    verification_note_fz = (
        "Rekord referencyjny rodziny FAZA-ZIEMIA z uzwojeniem RESZTKOWYM (trzecim), "
        "ktora w sieci SN realizuje pomiar napiecia zerowego 3U0 dla kryteriow "
        "ziemnozwarciowych kierunkowych (67N) i nadnapieciowych zerowych (59N). "
        "Uzwojenie pierwotne pracuje miedzy faza a ziemia, dlatego przekladnia jest "
        "U_n/√3, a wspolczynnik napieciowy musi wynosic 1,9 (IEC 61869-3 tab. 2): "
        "przy zwarciu doziemnym napiecie faz zdrowych rosnie do napiecia miedzyfazowego. "
        "Klasy, moc i obecnosc uzwojenia resztkowego potwierdzic karta producenta."
    )

    return [
        {
            "id": "vt_10kv_100v_05_abb",
            "name": "VT 10 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 10000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_15kv_100v_05_abb",
            "name": "VT 15 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_15kv_100v_3p_abb",
            "name": "VT 15 kV / 100 V kl. 3P",
            "params": {
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "3P",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_20kv_100v_05_arteche",
            "name": "VT 20 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 20000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_20kv_100v_3p_abb",
            "name": "VT 20 kV / 100 V kl. 3P",
            "params": {
                "ratio_primary_v": 20000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "3P",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_24kv_100v_05_siemens",
            "name": "VT 24 kV / 100 V kl. 0.5",
            "params": {
                "ratio_primary_v": 24000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_24kv_100v_3p_schneider",
            "name": "VT 24 kV / 100 V kl. 3P",
            "params": {
                "ratio_primary_v": 24000.0,
                "ratio_secondary_v": 100.0,
                "accuracy_class": "3P",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Schneider Electric",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_15kv_110v_05_ormazabal",
            "name": "VT 15 kV / 110 V kl. 0.5",
            "params": {
                "ratio_primary_v": 15000.0,
                "ratio_secondary_v": 110.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "Ormazabal",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_20kv_110v_05_abb",
            "name": "VT 20 kV / 110 V kl. 0.5",
            "params": {
                "ratio_primary_v": 20000.0,
                "ratio_secondary_v": 110.0,
                "accuracy_class": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": False,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note,
                ),
            },
        },
        {
            "id": "vt_10kv_fz_100_3_05_3p_abb",
            "name": "VT 10 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 5773.5,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "ABB",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
        {
            "id": "vt_15kv_fz_100_3_05_3p_arteche",
            "name": "VT 15 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 8660.3,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "Arteche",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
        {
            "id": "vt_20kv_fz_100_3_05_3p_siemens",
            "name": "VT 20 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 11547.0,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "Siemens",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
        {
            "id": "vt_24kv_fz_100_3_05_3p_schneider",
            "name": "VT 24 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P",
            "params": {
                "ratio_primary_v": 13856.4,
                "ratio_secondary_v": 57.7,
                "accuracy_class": "3P",
                "accuracy_class_metering": "0.5",
                "rated_voltage_factor": 1.9,
                "voltage_factor_duration_s": 28800.0,
                "burden_va": 30.0,
                "has_residual_winding": True,
                "manufacturer": "Schneider Electric",
                **_quality_meta(
                    verification_status="REFERENCYJNY",
                    source_reference=source_reference,
                    catalog_status="REFERENCYJNY_V1",
                    verification_note=verification_note_fz,
                ),
            },
        },
    ]


def get_all_protection_device_types() -> list[dict]:
    def _device_meta(
        *,
        verification_status: str,
        source_reference: str,
        catalog_status: str,
        verification_note: str,
    ) -> dict:
        return {
            "verification_status": verification_status,
            "source_reference": source_reference,
            "catalog_status": catalog_status,
            "contract_version": "2.0",
            "verification_note": verification_note,
        }

    abb_source_reference = "ABB REX / dane referencyjne MV-DESIGN-PRO"
    etango_source_reference = "Elektrometal e2TANGO / dane referencyjne MV-DESIGN-PRO"
    abb_note = "Rekord czesciowo zweryfikowany; zakres funkcji i parametrow wymaga potwierdzenia w karcie producenta."
    etango_note = "Rekord analityczny; zakresy i warianty wymagaja weryfikacji producenta przed uzyciem produkcyjnym."
    return [
        {
            "id": "ACME_REX500_v1",
            "name_pl": "Przekaznik ABB REX-500",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX500_v1",
                "notes_pl": "Rekord zgodny z katalogiem analitycznym ochrony.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX200_v1",
            "name_pl": "Przekaznik ABB REX-200",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX200_v1",
                "notes_pl": "Rekord zgodny z katalogiem analitycznym ochrony.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX100_v1",
            "name_pl": "Przekaznik ABB REX-100",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX100_v1",
                "notes_pl": "Rekord referencyjny rodziny REX dla nizszych zakresow linii i transformatorow.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX300_v1",
            "name_pl": "Przekaznik ABB REX-300",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX300_v1",
                "notes_pl": "Rekord referencyjny rodziny REX dla typowych pol SN.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "ACME_REX700_v1",
            "name_pl": "Przekaznik ABB REX-700",
            "params": {
                "vendor": "ABB",
                "series": "REX",
                "revision": "v1",
                "analytical_library_ref": "ACME_REX700_v1",
                "notes_pl": "Rekord referencyjny rodziny REX dla rozbudowanych zastosowan SN.",
                **_device_meta(
                    verification_status="CZESCIOWO_ZWERYFIKOWANY",
                    source_reference=abb_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=abb_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_400_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-400",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_400_V0",
                "rated_current_a": 400.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_600_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-600",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_600_V0",
                "rated_current_a": 600.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_800_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-800",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_800_V0",
                "rated_current_a": 800.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_1000_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-1000",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_1000_V0",
                "rated_current_a": 1000.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_1250_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-1250",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_1250_V0",
                "rated_current_a": 1250.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_1600_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-1600",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_1600_V0",
                "rated_current_a": 1600.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
        {
            "id": "EM_ETANGO_2000_V0",
            "name_pl": "Przekaznik Elektrometal e2TANGO-2000",
            "params": {
                "vendor": "ELEKTROMETAL",
                "series": "e2TANGO",
                "revision": "v0",
                "analytical_library_ref": "EM_ETANGO_2000_V0",
                "rated_current_a": 2000.0,
                "notes_pl": "Rekord analityczny - dane wymagaja weryfikacji produkcyjnej.",
                **_device_meta(
                    verification_status="NIEWERYFIKOWANY",
                    source_reference=etango_source_reference,
                    catalog_status="ANALITYCZNY_V1",
                    verification_note=etango_note,
                ),
            },
        },
    ]


def get_all_protection_curves() -> list[dict]:
    def _curve_meta(*, name: str) -> dict:
        return {
            "verification_status": "REFERENCYJNY",
            "source_reference": "Katalog krzywych MV-DESIGN-PRO / IEC 60255 / IEEE C37.112 / dane referencyjne",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "verification_note": (
                f"Rekord referencyjny krzywej {name}; parametry wymagaja potwierdzenia w karcie producenta lub normie."
            ),
        }

    return [
        {
            "id": "curve_iec_normal_inverse",
            "name_pl": "IEC normalna inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "inverse",
                "parameters": {"A": 0.14, "B": 0.02},
                **_curve_meta(name="IEC normalna inwersyjna"),
            },
        },
        {
            "id": "curve_iec_very_inverse",
            "name_pl": "IEC bardzo inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "very_inverse",
                "parameters": {"A": 13.5, "B": 1.0},
                **_curve_meta(name="IEC bardzo inwersyjna"),
            },
        },
        {
            "id": "curve_iec_extremely_inverse",
            "name_pl": "IEC skrajnie inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "extremely_inverse",
                "parameters": {"A": 80.0, "B": 2.0},
                **_curve_meta(name="IEC skrajnie inwersyjna"),
            },
        },
        {
            "id": "curve_iec_long_time_inverse",
            "name_pl": "IEC dlugoczasowo inwersyjna",
            "params": {
                "standard": "IEC",
                "curve_kind": "long_time_inverse",
                "parameters": {"A": 120.0, "B": 1.0},
                **_curve_meta(name="IEC dlugoczasowo inwersyjna"),
            },
        },
        {
            "id": "curve_ieee_moderately_inverse",
            "name_pl": "IEEE umiarkowanie inwersyjna",
            "params": {
                "standard": "IEEE",
                "curve_kind": "moderately_inverse",
                "parameters": {"A": 0.0515, "B": 0.02, "C": 0.114},
                **_curve_meta(name="IEEE umiarkowanie inwersyjna"),
            },
        },
        {
            "id": "curve_ieee_very_inverse",
            "name_pl": "IEEE bardzo inwersyjna",
            "params": {
                "standard": "IEEE",
                "curve_kind": "very_inverse",
                "parameters": {"A": 19.61, "B": 0.491, "C": 0.114},
                **_curve_meta(name="IEEE bardzo inwersyjna"),
            },
        },
        {
            "id": "curve_ieee_extremely_inverse",
            "name_pl": "IEEE skrajnie inwersyjna",
            "params": {
                "standard": "IEEE",
                "curve_kind": "extremely_inverse",
                "parameters": {"A": 28.2, "B": 0.1217, "C": 0.02},
                **_curve_meta(name="IEEE skrajnie inwersyjna"),
            },
        },
        {
            "id": "curve_ansi_inverse",
            "name_pl": "ANSI inwersyjna",
            "params": {
                "standard": "ANSI",
                "curve_kind": "inverse",
                "parameters": {"K": 0.0515, "alpha": 0.02, "beta": 0.114},
                **_curve_meta(name="ANSI inwersyjna"),
            },
        },
    ]


def get_all_protection_setting_templates() -> list[dict]:
    def _template_meta(*, name: str) -> dict:
        return {
            "verification_status": "REFERENCYJNY",
            "source_reference": "Szablony nastaw MV-DESIGN-PRO / IEC 60255 / dane referencyjne",
            "catalog_status": "REFERENCYJNY_V1",
            "contract_version": "2.0",
            "verification_note": (
                f"Szablon referencyjny {name}; przed uzyciem nalezy potwierdzic dobor na podstawie modelu sieci i karty producenta."
            ),
        }

    return [
        {
            "id": "template_rex500_oc",
            "name_pl": "Szablon ABB REX-500 - nadpradowy",
            "params": {
                "device_type_ref": "ACME_REX500_v1",
                "curve_ref": "curve_iec_normal_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 10.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 5.0},
                ],
                **_template_meta(name="ABB REX-500 - nadpradowy"),
            },
        },
        {
            "id": "template_rex300_oc",
            "name_pl": "Szablon ABB REX-300 - nadpradowy",
            "params": {
                "device_type_ref": "ACME_REX300_v1",
                "curve_ref": "curve_iec_very_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 12.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 6.0},
                    {"name": "I>>", "unit": "A", "min": 1.0, "max": 80.0},
                ],
                **_template_meta(name="ABB REX-300 - nadpradowy"),
            },
        },
        {
            "id": "template_rex100_oc",
            "name_pl": "Szablon ABB REX-100 - nadpradowy",
            "params": {
                "device_type_ref": "ACME_REX100_v1",
                "curve_ref": "curve_iec_normal_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 8.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 5.0},
                ],
                **_template_meta(name="ABB REX-100 - nadpradowy"),
            },
        },
        {
            "id": "template_etango_400_ef",
            "name_pl": "Szablon e2TANGO-400 - ziemnozwarciowy",
            "params": {
                "device_type_ref": "EM_ETANGO_400_V0",
                "curve_ref": "curve_iec_very_inverse",
                "setting_fields": [
                    {"name": "I0>", "unit": "A", "min": 0.1, "max": 10.0},
                    {"name": "t0>", "unit": "s", "min": 0.0, "max": 5.0},
                ],
                **_template_meta(name="e2TANGO-400 - ziemnozwarciowy"),
            },
        },
        {
            "id": "template_etango_800_ef",
            "name_pl": "Szablon e2TANGO-800 - ziemnozwarciowy",
            "params": {
                "device_type_ref": "EM_ETANGO_800_V0",
                "curve_ref": "curve_ieee_very_inverse",
                "setting_fields": [
                    {"name": "I0>", "unit": "A", "min": 0.1, "max": 12.0},
                    {"name": "t0>", "unit": "s", "min": 0.0, "max": 6.0},
                    {"name": "I0>>", "unit": "A", "min": 1.0, "max": 50.0},
                ],
                **_template_meta(name="e2TANGO-800 - ziemnozwarciowy"),
            },
        },
        {
            "id": "template_etango_1250_oc",
            "name_pl": "Szablon e2TANGO-1250 - nadpradowy",
            "params": {
                "device_type_ref": "EM_ETANGO_1250_V0",
                "curve_ref": "curve_iec_extremely_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 20.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 6.0},
                    {"name": "I>>", "unit": "A", "min": 1.0, "max": 120.0},
                ],
                **_template_meta(name="e2TANGO-1250 - nadpradowy"),
            },
        },
        {
            "id": "template_etango_1600_ef",
            "name_pl": "Szablon e2TANGO-1600 - ziemnozwarciowy",
            "params": {
                "device_type_ref": "EM_ETANGO_1600_V0",
                "curve_ref": "curve_iec_long_time_inverse",
                "setting_fields": [
                    {"name": "I0>", "unit": "A", "min": 0.1, "max": 20.0},
                    {"name": "t0>", "unit": "s", "min": 0.0, "max": 8.0},
                    {"name": "I0>>", "unit": "A", "min": 1.0, "max": 150.0},
                ],
                **_template_meta(name="e2TANGO-1600 - ziemnozwarciowy"),
            },
        },
        {
            "id": "template_etango_2000_oc",
            "name_pl": "Szablon e2TANGO-2000 - nadpradowy",
            "params": {
                "device_type_ref": "EM_ETANGO_2000_V0",
                "curve_ref": "curve_ansi_inverse",
                "setting_fields": [
                    {"name": "I>", "unit": "A", "min": 0.1, "max": 30.0},
                    {"name": "t>", "unit": "s", "min": 0.0, "max": 8.0},
                    {"name": "I>>", "unit": "A", "min": 1.0, "max": 200.0},
                ],
                **_template_meta(name="e2TANGO-2000 - nadpradowy"),
            },
        },
    ]
