"""Przekładniki CT/VT w rzeczywistych schematach dostarczonych przez użytkownika.

Źródłem jest DOKUMENTACJA PROJEKTOWA, nie karta producenta.
Rekordy pozwalają odtworzyć istniejącą i projektowaną aparaturę bez
przypisywania niepotwierdzonych wariantów SKU, prądów Ith, klas czy rdzeni.

Dwa różne aparaty SIGMA 200/5 i IMPa 200/5 NIE są jednym typem mimo
tej samej przekładni; przekładnik MBS SASK 250/5 5P10 to tor
ZABEZPIECZENIOWY, nie rdzeń rozliczeniowy 0,2S.
Przekładnik TESAR 40/5/5/5 ma TRZY RDZENIE, a nie trzy zaczepy.
"""
from __future__ import annotations

from math import sqrt
from typing import Any

WIOSKA_SOURCE = (
    "PROJEKT_DOSTARCZONY: WIOSKA - Schematy elektryczne 1.pdf; "
    "arkusz 1, opisy T11/T12/T13 (TESAR AD11) oraz T21/T22/T23 "
    "(TESAR VT), podpisy tabliczek. Dokument projektowy, "
    "nie fabryczna karta wykonania ani świadectwo badania."
)
TRANSPAK_SOURCE = (
    "PROJEKT_DOSTARCZONY: 119kW PV Transpak v1.-sig_podpisany.pdf; "
    "PDF str. 16 (demontaż IMPa/montaż SIGMA), 25 (dobór CT), "
    "32 (zestawienie), 33/40 (MBS SASK 41.6). "
    "Dane projektowe, nie deklaracja aktualnego katalogu producenta."
)


def _project_meta(source: str, note: str) -> dict[str, Any]:
    return {
        "catalog_status": "REFERENCYJNY_V1",
        "verification_status": "REFERENCYJNY",
        "contract_version": "2.0",
        "source_reference": source,
        "verification_note": (
            "ODWZOROWANIE KONKRETNEJ DOKUMENTACJI PROJEKTOWEJ: "
            + note +
            " Nie potwierdza bieżącej oferty producenta ani odrębnego "
            "numeru fabrycznego, certyfikatu wzorcowania i kompletności "
            "parametrów wykonawczych. Własność i zastosowanie aparatu "
            "sprawdzić z tabliczką na obiekcie i warunkami ENEA."
        ),
    }


def get_all_project_reference_ct_types() -> list[dict[str, Any]]:
    """Cztery unikalne konfiguracje z dwóch dokumentów projektowych."""
    return [
        {
            "id": "ct-projekt-wioska-tesar-ad11-40-5-5-5",
            "name": "TESAR AD11 — WIOSKA, 40/5/5/5 A, 3 rdzenie 0,2S",
            "params": {
                "manufacturer": "TESAR",
                "ratio_primary_a": 40.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.2S",
                "burden_va": 5.0,
                "fs_safety_factor": 5.0,
                "ith_ka_1s": 6.0,
                "idyn_ka_peak": 10.0,
                "core_count": 3,
                "construction": "SUPPORT",
                "secondary_cores": [
                    {"index": 1, "role": "BILLING",
                     "consumer": "UP", "secondary_a": 5.0,
                     "accuracy_class": "0.2S", "burden_va": 5.0},
                    {"index": 2, "role": "METERING",
                     "consumer": "ND45", "secondary_a": 5.0,
                     "accuracy_class": "0.2S", "burden_va": 5.0},
                    {"index": 3, "role": "METERING",
                     "consumer": "e2TANGO", "secondary_a": 5.0,
                     "accuracy_class": "0.2S", "burden_va": 5.0},
                ],
                **_project_meta(
                    WIOSKA_SOURCE,
                    "Schemat opisuje trzy odrębne rdzenie po 5 VA, "
                    "0,2S: UP / ND45 / e2TANGO, oraz wspólne FS5, "
                    "Ith=6 kA/1s i Idyn=10 kA. Nie przypisywać automatycznie "
                    "FS5 do każdego rdzenia, bo podpis jest wspólny. "
                    "Nie ma przełączanych zaczepów pierwotnych."
                ),
            },
        },
        {
            "id": "ct-projekt-transpak-impa-200-5-0p5-5va",
            "name": "IMPa — TRANSPAK istniejący, 200/5 A, kl.0,5, 5 VA",
            "params": {
                "ratio_primary_a": 200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.5",
                "burden_va": 5.0,
                "fs_safety_factor": 5.0,
                "ith_ka_1s": 12.0,
                "core_count": 1,
                "secondary_cores": [{
                    "index": 1, "role": "METERING", "secondary_a": 5.0,
                    "accuracy_class": "0.5", "burden_va": 5.0, "fs": 5.0,
                }],
                **_project_meta(
                    TRANSPAK_SOURCE,
                    "Istniejące CT IMPa 200/5, klasa 0,5, 5VA, FS5, "
                    "Ith 12kA wskazano do DEMONTAŻU. "
                    "Producent nie jest jednoznacznie ustalony w projekcie; "
                    "IMPa to odczytane oznaczenie wyrobu. "
                    "Brak danych Idyn, Um i Rct. Jednozakresowy CT, "
                    "nie dodawać zaczepu 400/5."
                ),
            },
        },
        {
            "id": "ct-projekt-transpak-sigma-s40-200-5-02s-2p5va",
            "name": "SIGMA S40 — TRANSPAK projektowany, 200/5 A, 0,2S, 2,5 VA",
            "params": {
                "manufacturer": "SIGMA",
                "ratio_primary_a": 200.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.2S",
                "burden_va": 2.5,
                "fs_safety_factor": 5.0,
                "ith_ka_1s": 12.0,
                "core_count": 1,
                "secondary_cores": [{
                    "index": 1, "role": "BILLING", "secondary_a": 5.0,
                    "accuracy_class": "0.2S", "burden_va": 2.5, "fs": 5.0,
                }],
                **_project_meta(
                    TRANSPAK_SOURCE,
                    "SIGMA S40 200/5 A, 0,2S, 2,5VA, FS5, Ith 12kA "
                    "na arkuszu pomiarowym. "
                    "Obliczony w projekcie odbiór obwodu wtórnego to 2,077VA; "
                    "NIE jest znamionową mocą przekładnika ani danym producenta. "
                    "Przewody wtórne 2m, 2,5mm²; bez potwierdzonych Um, Idyn/Rct. "
                    "Przekładnia pojedyncza 200/5 bez zaczepów."
                ),
            },
        },
        {
            "id": "ct-projekt-transpak-mbs-sask416-250-5-5p10",
            "name": "MBS SASK 41.6 — TRANSPAK, 250/5 A, 5P10, 2,5 VA",
            "params": {
                "manufacturer": "MBS",
                "ratio_primary_a": 250.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P10",
                "burden_va": 2.5,
                "core_count": 1,
                "secondary_cores": [{
                    "index": 1, "role": "PROTECTION", "secondary_a": 5.0,
                    "accuracy_class": "5P10", "burden_va": 2.5,
                    "alf": 10,
                }],
                **_project_meta(
                    TRANSPAK_SOURCE,
                    "MBS SASK 41.6, 250/5 A, 2,5VA, 5P10 z tabeli "
                    "doboru i schematu obwodów e2TANGO (str. 33 i 40). "
                    "Na schemacie występuje też napis FS5, którego NIE "
                    "przeniesiono do rdzenia 5P — FS dotyczy CT pomiarowych, "
                    "a nie ALF rdzenia zabezpieczeniowego. Brak Ith i Idyn "
                    "w tym wierszu dokumentacji; nie przyjęto wartości."
                ),
            },
        },
    ]


def get_all_project_reference_vt_types() -> list[dict[str, Any]]:
    """Cztery uzwojenia TESAR ze schematu, w tym dedykowane 3U0."""
    phase = 100.0 / sqrt(3.0)
    primary = 15000.0 / sqrt(3.0)
    return [{
        "id": "vt-projekt-wioska-tesar-15kv-cztery-uzwojenia",
        "name": "TESAR — WIOSKA, 15/√3 kV, 3×100/√3 V + 100/3 V",
        "params": {
            "manufacturer": "TESAR",
            "ratio_primary_v": primary,
            "ratio_secondary_v": phase,
            "accuracy_class": "0.2",
            "burden_va": 7.5,
            "primary_connection": "PHASE_EARTH",
            "has_residual_winding": True,
            "secondary_windings": [
                {"index": 1, "role": "BILLING", "consumer": "UP",
                 "rated_voltage_v": phase, "accuracy_class": "0.2",
                 "burden_va_min": 0.0, "burden_va_max": 7.5,
                 "connection": "STAR_PER_PHASE_BANK"},
                {"index": 2, "role": "METERING", "consumer": "ND45",
                 "rated_voltage_v": phase, "accuracy_class": "0.2",
                 "burden_va_min": 0.0, "burden_va_max": 5.0,
                 "connection": "STAR_PER_PHASE_BANK"},
                {"index": 3, "role": "LOCAL_OR_PROTECTION", "consumer": "e2TANGO UL",
                 "rated_voltage_v": phase, "accuracy_class": "0.2",
                 "burden_va_min": 0.0, "burden_va_max": 5.0,
                 "connection": "TO_CONFIRM"},
                {"index": 4, "role": "RESIDUAL_3U0", "consumer": "e2TANGO U0",
                 "rated_voltage_v": 100.0 / 3.0, "accuracy_class": "3P",
                 "burden_va_min": 0.0, "burden_va_max": 5.0,
                 "connection": "TO_CONFIRM"},
            ],
            **_project_meta(
                WIOSKA_SOURCE,
                "Na schemacie T21-T23: cztery osobne wtórne "
                "I 0–7,5VA kl.0,2 UP; II 0–5VA kl.0,2 ND45; "
                "III 0–5VA kl.0,2 e2TANGO UL; "
                "IV 0–5VA kl.3P e2TANGO U0. "
                "Czwarte uzwojenie ma 0,1/3 kV i służy do 3U0. "
                "Nie utożsamiać go z uzwojeniem 0,1/√3. Schemat " "połączeń wtórnych (otwarty trójkąt) należy osobno potwierdzić; "
                "Um, Fv i obciążalność łączną wymagają DTR "
                "konkretnego wykonania TESAR."
            ),
        },
    }]
