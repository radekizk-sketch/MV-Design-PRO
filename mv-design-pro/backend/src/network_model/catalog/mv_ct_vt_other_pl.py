"""Warianty producentów obecnych w Polsce — tylko udokumentowane parametry.

Zwarpol JSGO: tabliczki wyprodukowanych sztuk (2021), nie bieżąca oferta.
RITZ VES: konfiguracje obciążeń z tabeli katalogowej producenta (s. 27),
bez niepotwierdzonego uzwojenia resztkowego, factor Fv i numeru zamówienia.
"""
from __future__ import annotations

from math import sqrt
from typing import Any

ZWARPOL_JSGO_SOURCE = (
    "ZWARPOL, dostawa JSGO-2a/JSGO-2b 2021, dane dwóch tabliczek na stronie producenta: "
    "https://www.zwarpol.com/przekladnik-pradowy-jsgo-2a-i-jsgo-2b/"
)
RITZ_VES_SOURCE = (
    "RITZ Instrument Transformers GmbH, Medium Voltage Instrument Transformers "
    "Standard Transformers, tabela VES 12/17.5/24, str. 27 (PDF s. 27), "
    "klasa 0.2 = 20 VA, 0.5 = 50 VA, pierwotne/wtórne z kolumn napięć: "
    "https://ritz-international.com/wp-content/uploads/"
    "RITZ-medium_voltage_instrument_transformers_standard_EN-1-1.pdf"
)


def get_zwarpol_jsgo_ct_types() -> list[dict[str, Any]]:
    return [
        {
            "id": "ct-zwarpol-jsgo2a-1500-5-5-2021",
            "name": "ZWARPOL JSGO-2a 1500//5/5 A, 0,2S FS5 + 5P20",
            "params": {
                "manufacturer": "ZWARPOL",
                "ratio_primary_a": 1500.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.2S",
                "burden_va": 30.0,
                "fs_safety_factor": 5.0,
                "core_count": 2,
                "secondary_cores": [
                    {"index": 1, "role": "BILLING", "secondary_a": 5.0,
                     "accuracy_class": "0.2S", "burden_va": 30.0, "fs": 5.0},
                    {"index": 2, "role": "PROTECTION", "secondary_a": 5.0,
                     "accuracy_class": "5P20", "burden_va": 120.0, "alf": 20},
                ],
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "source_reference": ZWARPOL_JSGO_SOURCE,
                "verification_note": (
                    "Producent opisuje zrealizowaną w 2021 r. dostawę 51 przekładników. "
                    "Rdzeń I: 30VA 0,2S FS5 (uzwojenie uwierzytelnione); "
                    "rdzeń II: 120VA 5P20. W publikacji nie ma Ith/Idyn/Um; "
                    "nie wpisano wartości domyślnych ani fikcyjnego Rct. "
                    "Wyrób historyczny: wymaga aktualnej oferty i karty zamówieniowej."
                ),
            },
        },
        {
            "id": "ct-zwarpol-jsgo2b-1500-5-0p625-2021",
            "name": "ZWARPOL JSGO-2b 1500//5/0,625 A, 5P10 + 5P150",
            "params": {
                "manufacturer": "ZWARPOL",
                "ratio_primary_a": 1500.0,
                "ratio_secondary_a": 5.0,
                "accuracy_class": "5P10",
                "burden_va": 30.0,
                "core_count": 2,
                "secondary_cores": [
                    {"index": 1, "role": "PROTECTION", "secondary_a": 5.0,
                     "accuracy_class": "5P10", "burden_va": 30.0, "alf": 10},
                    {"index": 2, "role": "PROTECTION", "secondary_a": 0.625,
                     "accuracy_class": "5P150", "burden_va": 15.0, "alf": 150},
                ],
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "source_reference": ZWARPOL_JSGO_SOURCE,
                "verification_note": (
                    "ZWARPOL JSGO2b: I 5 A / 30VA / 5P10, "
                    "II 0,625 A / 15VA / 5P150. "
                    "To DWIE RÓŻNE wartości prądu wtórnego; brak rdzenia "
                    "pomiarowego i brak FS. Brak opublikowanych Ith/Idyn/Um. "
                    "Opis dostawy 2021, nie potwierdzenie bieżącej oferty."
                ),
            },
        },
    ]


def get_ritz_ves_vt_types() -> list[dict[str, Any]]:
    """6 konfiguracji tablicowych RITZ VES; nie przypisywać nieznanej 3U0."""
    ratings = ((10, 12.0, "VES 12"), (15, 17.5, "VES 17,5"),
               (20, 24.0, "VES 24"))
    burdens = (("0.2", 20.0), ("0.5", 50.0))
    records: list[dict[str, Any]] = []
    for line_kv, um, model in ratings:
        for accuracy, va in burdens:
            sec = 100.0 / sqrt(3.0)
            records.append({
                "id": f"vt-ritz-ves-{line_kv}kv-{accuracy.replace('.', 'p')}-{int(va)}va",
                "name": (
                    f"RITZ {model}, {line_kv}/sqrt3 kV /100/sqrt3 V, "
                    f"kl.{accuracy} {va:g}VA (konfiguracja katalogowa)"
                ),
                "params": {
                    "manufacturer": "RITZ",
                    "ratio_primary_v": line_kv * 1000.0 / sqrt(3.0),
                    "ratio_secondary_v": sec,
                    "accuracy_class": accuracy,
                    "burden_va": va,
                    "um_kv": um,
                    "primary_connection": "PHASE_EARTH",
                    "has_residual_winding": None,
                    "secondary_windings": [
                        {"index": 1, "role": "METERING", "rated_voltage_v": sec,
                         "accuracy_class": accuracy, "burden_va": va,
                         "connection": "TO_CONFIRM"}
                    ],
                    "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                    "catalog_status": "REFERENCYJNY_V1",
                    "contract_version": "2.0",
                    "source_reference": RITZ_VES_SOURCE,
                    "verification_note": (
                        f"Przekładnia dla sieci {line_kv} kV, poziom Um {um:g} kV, "
                        f"klasa {accuracy} i znamionowe {va:g} VA "
                        "wynikają z osobnej kolumny tabeli RITZ VES str.27. "
                        "To konfiguracja z szeregu katalogowego, bez potwierdzonego "
                        "numeru zamówieniowego. Fv, czas Fv i zamontowanie "
                        "uzwojenia 100/3 V nie wynikają z tej tabeli; "
                        "muszą zostać potwierdzone w DTR konkretnego wykonania."
                    ),
                },
            })
    return records
