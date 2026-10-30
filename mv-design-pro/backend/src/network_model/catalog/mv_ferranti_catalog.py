"""Osobny katalog przekładników Ferrantiego (3I0), nie przekładników FAZOWYCH.

NIE wolno rejestrować CSH / IO1s / IFW jako CT fazowy ratio_primary_a/ratio_secondary_a:
np. 1/470 oznacza PRZEKŁADNIĘ ZWOJOWĄ CZUJNIKA I0, a NIE 470/1 A aparatu SN.
Stąd osobne API /api/catalog/ferranti-types i osobne zastosowanie 3I0.
"""
from __future__ import annotations

from typing import Any

SOURCE_SE = (
    "Schneider Electric, Sepam Series 20, PCRED301005EN, sekcja CSH120/200/300; "
    "https://download.schneider-electric.com/files?p_Doc_Ref=PCRED301005EN"
)
SOURCE_SE_INSTALL = (
    "Schneider Electric, zalecenia CSH120/200: centrowanie, przewlekanie "
    "przewodu uziemienia ekranu, zgodność z wejściem Sepam/ACE990; "
    "https://www.se.com/ie/en/faqs/FA86757/"
)
SOURCE_SE_SCREENS = (
    "Schneider Electric, CSH120/200 tylko na kablach z uziemionymi ekranami, "
    "2026: https://www.se.com/pl/pl/faqs/FA300860/"
)
SOURCE_ABB = (
    "ABB, Przekładniki ziemnozwarciowe Ferrantiego IO1s, IFW, "
    "tabela 23, przekładnia zwojowa 1/120 lub 1/100, "
    "Ith 10 kA / 5 s, uzwojenie testowe 5/10 zwojów: "
    "https://library.e.abb.com/public/9ec0e942183d4a40b26153d12e58476e/"
    "ABB-przekladniki%20nn_PL_noweA%28217B%29_05.03.pdf"
)
SOURCE_ENEA = (
    "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1, "
    "strona 26/76: Ferranti w przedziale kablowym pola liniowego, "
    "wymagana osiowość i dodatkowe złącze pomiarowe na listwie wtórnej; "
    "https://www.operator.enea.pl/uploads-ev2/Operator/"
    "us%C5%82ugidystrybucyjne/instrukcjeistandardysieci/standardywsieci/"
    "21.03.2024_1/Stacje%20elektroenergetyczne%20110%20kV%20Zeszyt%201."
    "%20Stacje%20dwutransformatorowe%20110%20kVSN%20-%20"
    "obowi%C4%85zuje%20od%2002.04.2024.pdf"
)


def get_all_ferranti_types() -> list[dict[str, Any]]:
    """5 modeli rodzin czujników (3 Schneider i 2 ABB).

    Parametry niewymienione przez producenta pozostają nieznane. Nie ma
    podstaw do przypisania CSH klasy 0,2S, Fs=5, rdzenia 5P20 ani 5 VA.
    """
    results: list[dict[str, Any]] = []
    for designation, diameter_mm in (("CSH120", 120.0), ("CSH200", 196.0), ("CSH300", 291.0)):
        results.append({
            "id": f"ferranti-se-{designation.lower()}",
            "name": f"Schneider Electric {designation} – czujnik 3I₀",
            "manufacturer": "Schneider Electric",
            "model": designation,
            "measurement_kind": "ZERO_SEQUENCE_3I0",
            "construction": "CLOSED_RING",
            "window_diameter_mm": diameter_mm,
            "turns_ratio": "1/470",
            "secondary_interface": "SEPAM_CSH_DIRECT",
            "secondary_current_a": None,
            "test_winding": False,
            "um_kv": 0.72,
            "source_reference": SOURCE_SE + " || " + SOURCE_SE_INSTALL + " || " + SOURCE_SE_SCREENS,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "verification_note": (
                "3I0 przez toroid obejmujący WSZYSTKIE trzy fazy; "
                "przewód uziemiający ekrany poprowadzić zgodnie z instrukcją "
                "czujnika, zachować osiowość. Jest to czujnik z wejściem "
                "dopasowanym do Sepam, nie klasyczny CT 1 A/5 A. "
                "Um=0,72 kV dotyczy izolacji czujnika; obwód SN musi "
                "mieć własną izolację. Dla innych przekaźników zweryfikować "
                "zgodność albo użyć interfejsu ACE990. "
                "W standardzie ENEA dla GPZ wymagane jest osobne złącze testowe; "
                "karta CSH nie potwierdza takiego złącza."
            ),
        })
    for designation, split_core in (("IO1s", False), ("IFW", True)):
        results.append({
            "id": f"ferranti-abb-{designation.lower()}",
            "name": f"ABB {designation} – przekładnik ziemnozwarciowy 3I₀",
            "manufacturer": "ABB",
            "model": designation,
            "measurement_kind": "ZERO_SEQUENCE_3I0",
            "construction": "SPLIT_RING" if split_core else "CLOSED_RING",
            "turns_ratio": "1/120",
            "alternative_turns_ratio": "1/100",
            "test_winding": True,
            "test_winding_turns": [5, 10],
            "thermal_short_circuit_current_ka": 10.0,
            "thermal_short_circuit_duration_s": 5.0,
            "source_reference": SOURCE_ABB + " || " + SOURCE_ENEA,
            "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
            "catalog_status": "REFERENCYJNY_V1",
            "verification_note": (
                "Dane ABB dotyczą RODZINY konstrukcyjnej, a nie unikalnego "
                "numeru zamówieniowego. Przekładnia 1/120 zwojowa; "
                "testowe 5/10 zwojów, cieplne 10 kA przez 5 s, "
                "NIE 10 kA / 1 s. IFW posiada rdzeń dzielony; "
                "przed doborem sprawdzić okno, kompatybilność wejścia "
                "zabezpieczenia i wyprowadzenie złącza testowego."
            ),
        })
    return results
