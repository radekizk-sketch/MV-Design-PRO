"""Projektowe warianty CT SN/nN — SZABLONY, nie wyroby producenta.

Warianty na bazie przykładów projektowych MV-DESIGN-PRO (2025–2026).
Żaden nie jest deklarowany jako rzeczywista tabliczka konkretnego klienta.
Różne rdzenie nie oznaczają różnych zaczepów; FS dotyczy wyłącznie
pomiaru, ALF wyłącznie rdzenia zabezpieczeniowego.
"""
from __future__ import annotations

from typing import Any

PROJECT_CT_SOURCE = (
    "MV-DESIGN-PRO, warianty projektowe SN/nN (przykłady robocze "
    "2025-12: SN 75/1–800/1, nN 400/1–1500/1; pomiar 0,2S/0,5 "
    "5 VA, EAZ 5P10/5P20 10–15 VA). "
    "Szablon do konfiguracji — nie karta katalogowa producenta."
)

# Przykłady użytkowe, a NIE numery katalogowe: zakresy I1, I2, klasa/VA.
SN_PRIMARY = (75, 100, 150, 200, 300, 400, 600, 800)
LV_PRIMARY = (400, 600, 800, 1000, 1500)
MEASUREMENT = (("0.2S", 5.0), ("0.5", 5.0), ("0.5S", 5.0))
PROTECTION = (("5P10", 10.0), ("5P20", 15.0))


def get_ct_project_combination_templates() -> list[dict[str, Any]]:
    """78 kombinacji SN i 30 nN: 1 rdzeń pomiarowy + 1 EAZ.

    13 prądów × 3 klasy pomiaru × 2 warianty EAZ = 78; ponieważ
    zakresy SN i nN są niezależne, rzeczywista liczba to 48 SN + 30 nN.
    """
    result: list[dict[str, Any]] = []
    for domain, primaries in (("sn", SN_PRIMARY), ("nn", LV_PRIMARY)):
        for primary in primaries:
            for metering_class, metering_va in MEASUREMENT:
                for protection_class, protection_va in PROTECTION:
                    alf = int(protection_class.split("P", 1)[1])
                    ident = (
                        f"ct-project-{domain}-{primary}-1-"
                        f"{metering_class.lower().replace('.', 'p')}-5va-"
                        f"{protection_class.lower()}-{int(protection_va)}va"
                    )
                    result.append({
                        "id": ident,
                        "name": (
                            f"Szablon {domain.upper()} {primary}/1/1 A — "
                            f"pomiar {metering_class} {metering_va:g} VA; "
                            f"EAZ {protection_class} {protection_va:g} VA"
                        ),
                        "params": {
                            "ratio_primary_a": float(primary),
                            "ratio_secondary_a": 1.0,
                            "accuracy_class": metering_class,
                            "burden_va": metering_va,
                            "construction": "LV_BUS_CABLE_METERING_CT" if domain == "nn" else "SUPPORT",
                            "core_count": 2,
                            "secondary_cores": [
                                {
                                    "index": 1, "role": "METERING",
                                    "secondary_a": 1.0,
                                    "accuracy_class": metering_class,
                                    "burden_va": metering_va,
                                },
                                {
                                    "index": 2, "role": "PROTECTION",
                                    "secondary_a": 1.0,
                                    "accuracy_class": protection_class,
                                    "burden_va": protection_va,
                                    "alf": alf,
                                },
                            ],
                            "verification_status": "REFERENCYJNY",
                            "catalog_status": "REFERENCYJNY_V1",
                            "contract_version": "2.0",
                            "source_reference": PROJECT_CT_SOURCE,
                            "verification_note": (
                                "SZABLON PROJEKTOWY, nie zweryfikowany model "
                                "producenta ani odczyt z rzeczywistej tabliczki. "
                                "Dwa rdzenie (pomiar i EAZ), JEDNA przekładnia "
                                "pierwotna; nie tworzyć fikcyjnych zaczepów. "
                                "Wartości 0,2S/0,5/0,5S i 5P10/5P20 oraz VA "
                                "to przykłady doborowe, nie potwierdzenie "
                                "osiągalności tej kombinacji u producenta. "
                                "Ith, Idyn, Rct, FS, Um, geometria, obciążenie "
                                "obwodów i dostępność wymagają karty wyrobu. "
                                "Nie deklarować zgodności z nowym układem "
                                "rozliczeniowym ENEA bez odrębnej oceny."
                            ),
                        },
                    })
    if len(result) != len({r["id"] for r in result}):
        raise ValueError("Duplikat szablonu CT")
    return result
