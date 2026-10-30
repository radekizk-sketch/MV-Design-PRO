"""Profile ENEA CT SN wieloprzekładniowe i pomiarowe CT nN.

Przekładnia "200-400/5" to JEDEN profil przekładnika z dwoma nominalnymi
pozycjami pierwotnymi. Dwa rdzenie nie są dwoma zaczepami. Ta biblioteka
dostarcza dane producentowi/doborowi i nie wybiera czynnego zaczepu w polu:
wybór oraz wyróżnienie na SLD należy do inspektora Opusa.

Źródło pierwotne: ENEA Operator, Układy pomiarowe energii elektrycznej,
wersja 05.2022-2, obowiązuje od 02.04.2024, załącznik 4 i 5/A–D,
s. 24–29/36. Wartości VA i Ith dla mniejszej przekładni;
nie przypisuj automatycznie tych samych parametrów większemu zaczepowi.
"""
from __future__ import annotations

from typing import Any

ENEA_2024_CT_SOURCE = (
    "ENEA Operator, Układy pomiarowe energii elektrycznej, 05.2022-2, "
    "obowiązuje 02.04.2024, załącznik 5/A-D, s.25-29/36; "
    "https://www.operator.enea.pl/media/698/"
    "uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf"
)
ENEA_2024_LV_CT_SOURCE = (
    "ENEA Operator, Układy pomiarowe energii elektrycznej, 05.2022-2, "
    "załącznik 4, s.24/36, przekładniki pomiarowe nN; "
    "https://www.operator.enea.pl/media/698/"
    "uklady-pomiarowe-energii-elektrycznej-obowiazuje-od-02042024pdf.pdf"
)

# (załącznik, lokalizacja, konstrukcja, zaczepy I1, liczba rdzeni,
#  występuje udokumentowany rdzeń lokalny, moc rdzenia rozliczeniowego,
#  wymagana Ith dla MNIEJSZEJ przekładni).
# Zał. 5/A zawiera DWA warianty 200-400/5/5/5: z lokalnym pomiarem
# i bez niego. Nie są dublowane identyfikatory.
ENEA_CT_SN_WIELOPRZEKLADNIOWE: tuple[
    tuple[str, str, str, tuple[int, int], int, bool, float, float], ...
] = (
    ("A", "linia-rozdzielcza", "SUPPORT", (200, 400), 2, False, 10.0, 16.0),
    ("A", "linia-rozdzielcza", "SUPPORT", (200, 400), 3, False, 10.0, 16.0),
    ("A", "linia-rozdzielcza", "SUPPORT", (200, 400), 3, True, 10.0, 16.0),
    ("A", "linia-rozdzielcza", "SUPPORT", (200, 400), 4, True, 10.0, 16.0),
    ("B", "linia-eop-odbiorca", "SUPPORT", (50, 100), 2, False, 5.0, 8.0),
    ("B", "linia-eop-odbiorca", "SUPPORT", (50, 100), 3, False, 5.0, 8.0),
    ("B", "linia-eop-odbiorca", "SUPPORT", (200, 400), 2, False, 5.0, 8.0),
    ("B", "linia-eop-odbiorca", "SUPPORT", (200, 400), 3, False, 5.0, 8.0),
    ("B", "slup-odbiorca-wytworca", "SUPPORT", (50, 100), 1, False, 5.0, 8.0),
    ("C", "linia-rozdzielcza", "RING_PHASE_CT", (200, 400), 1, False, 10.0, 16.0),
    ("C", "linia-rozdzielcza", "RING_PHASE_CT", (200, 400), 2, False, 10.0, 16.0),
    ("C", "linia-rozdzielcza", "RING_PHASE_CT", (200, 400), 3, True, 10.0, 16.0),
    ("D", "linia-eop-odbiorca", "RING_PHASE_CT", (200, 400), 2, False, 5.0, 8.0),
)


def get_all_enea_multirange_ct_types() -> list[dict[str, Any]]:
    """13 rzeczywistych *układów wymagań* ENEA, nie 13 SKU producentów."""
    records: list[dict[str, Any]] = []
    for annex, site, kind, taps, count, has_local, billing_va, ith in ENEA_CT_SN_WIELOPRZEKLADNIOWE:
        first, second = taps
        scenario = "lokalny" if has_local else "bez-lokalnego"
        ident = (
            f"ct-enea-2024-5{annex.lower()}-{site}-{kind.lower()}-"
            f"{first}-{second}-5-{count}rdz-{scenario}"
        )
        billing = {
            "index": 1,
            "role": "BILLING",
            "secondary_a": 5.0,
            "accuracy_class": "0.2S",
            "burden_va": billing_va,
            "fs": 5.0,
            "rated_at_primary_tap_a": float(first),
            "source_kind": "ENEA_REQUIREMENT",
        }
        secondary = [billing]
        if has_local:
            secondary.append({
                "index": 2,
                "role": "LOCAL_METERING",
                "secondary_a": 5.0,
                "accuracy_class": "0.2",
                "burden_va": 10.0,
                "fs": 5.0,
                "rated_at_primary_tap_a": float(first),
                "source_kind": "ENEA_REQUIREMENT",
            })
        records.append({
            "id": ident,
            "name": (
                f"ENEA 5/{annex} {site}: {first}–{second}/"
                + "/".join(["5"] * count)
                + f" A; {count} rdzenie, {scenario}"
            ),
            "params": {
                # Wymagany przez CTType nominalny punkt referencyjny; nie jest
                # wyborem aktywnego zaczepu, który należy do instancji aparatu.
                "ratio_primary_a": float(first),
                "primary_taps_a": [float(first), float(second)],
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.2S",
                "burden_va": billing_va,
                "fs_safety_factor": 5.0,
                "ith_ka_1s": ith,
                "um_kv": 0.72 if kind == "RING_PHASE_CT" else 24.0,
                "construction": kind,
                "core_count": count,
                "secondary_cores": secondary,
                "verification_status": "REFERENCYJNY",
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "source_reference": ENEA_2024_CT_SOURCE,
                "verification_note": (
                    f"JEDEN profil ENEA zał. 5/{annex} z dwiema przekładniami "
                    f"{first}/5 i {second}/5 A, a nie dwa odrębne wyroby. "
                    f"Rdzeń rozliczeniowy 0,2S, FS5, {billing_va:g} VA i "
                    f"Ith={ith:g} kA określono dla MNIEJSZEGO zaczepu {first} A. "
                    "Nie rozciągać bez dowodu mocy ani dokładności na większy "
                    "zaczep. Liczba rdzeni jest niezależna od liczby zaczepów; "
                    "dla pozostałych rdzeni klasa, ALF, Rct i VA wymagają "
                    "odrębnego standardu pola / dokumentacji wyrobu. "
                    "Sposobu przełączania (pierwotny/wtórny/mostki) standard "
                    "nie podaje — ustala go karta konkretnego wykonania. "
                    "Wartość ratio_primary_a wskazuje tylko mniejszy "
                    "nominalny zakres katalogowy, NIE aktywny zaczep. "
                    "Wybór aktywnego zaczepu i podkreślenie na SLD są danymi "
                    "instancji pola zarządzanymi poza katalogiem."
                    + (
                        " Toroid ma izolację własną Um=0,72 kV, mimo że "
                        "wymagane napięcie znamionowe sieci SN wynosi 24 kV."
                        if kind == "RING_PHASE_CT" else ""
                    )
                ),
            },
        })
    if len({r["id"] for r in records}) != len(records):
        raise ValueError("Powtórzony identyfikator profilu wieloprzekładniowego ENEA")
    return records


def get_all_enea_lv_metering_ct_types() -> list[dict[str, Any]]:
    """3 profile nN ENEA zał.4 — pomiar rozliczeniowy 0,2S, FS≤5, 5 VA."""
    result: list[dict[str, Any]] = []
    for primary, busbar in ((200, "40x5"), (400, "40x5"), (800, "60x5")):
        result.append({
            "id": f"ct-enea-2024-nn-04-{primary}-5-02s-fs5",
            "name": f"ENEA nN: przekładnik na szynę/kabel {primary}/5 A 0,2S FS≤5",
            "params": {
                "ratio_primary_a": float(primary),
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.2S",
                "burden_va": 5.0,
                "fs_safety_factor": 5.0,  # limit FS, nie wartość potwierdzona egzemplarza
                "ith_ka_1s": primary * 60.0 / 1000.0,
                "um_kv": 0.72,
                "construction": "LV_BUS_CABLE_METERING_CT",
                "core_count": 1,
                "secondary_cores": [{
                    "index": 1, "role": "BILLING", "secondary_a": 5.0,
                    "accuracy_class": "0.2S", "burden_va": 5.0,
                    "fs_max": 5.0, "extended_current_min_percent": 120.0,
                    "source_kind": "ENEA_REQUIREMENT",
                }],
                "verification_status": "REFERENCYJNY",
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "source_reference": ENEA_2024_LV_CT_SOURCE,
                "verification_note": (
                    f"Wymagania ENEA nN zał.4: I1={primary} A, 5 A, "
                    "0,2S, FS≤5, 5 VA, 50 Hz, ext≥120%, "
                    "Ith≥60·In, izolacja 0,72 kV i Up=3 kV. "
                    f"Szyna maks. {busbar} mm; możliwość montażu na kablu "
                    "zależna od wskazanego wariantu: 1×240 dla 200/400 A; "
                    "2×1×240 dla 800 A. Nie jest to numer katalogowy producenta. "
                    "FS5 w polu nadrzędnym reprezentuje dopuszczalną GRANICĘ, "
                    "nie zmierzone FS tego aparatu. "
                    "Parametry gabarytowe: max. 105×125×60 mm, "
                    "IP20, temperatura -25...+50°C — potwierdzić kartą wyrobu."
                ),
            },
        })
    return result
