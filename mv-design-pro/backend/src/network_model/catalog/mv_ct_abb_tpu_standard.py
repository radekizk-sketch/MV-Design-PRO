"""ABB TPU 6x.xx 24 kV — fizyczne wykonania z tabeli producenta (2014).

Podstawa: ABB, Standardowe wykonania przekładników prądowych typu TPU 6x.xx,
tabela na str. drukowanej 35, wiersze 20...3200 A:
https://library.e.abb.com/public/a30bcdbdd6e74381b444c9356675fb28/TPU-katalog-09052014_LR.pdf

To historyczne standardowe WYKONANIA, nie potwierdzenie aktualnej oferty.
Ith i Idyn z tej samej tabeli, a FS jest TYLKO dla rdzenia pomiarowego.
Wszystkie rekordy mają dwa rdzenie 0,5/5P i pojedynczą przekładnię 5A.
"""
from __future__ import annotations

from typing import Any

SOURCE = (
    "ABB, Przekładniki prądowe TPU 6x.xx, katalog 2014, str. 35,"
    " tabela Standardowe wykonania, wiersz przekładni/typu:"
    " https://library.e.abb.com/public/"
    "a30bcdbdd6e74381b444c9356675fb28/TPU-katalog-09052014_LR.pdf"
)

# (typ, I1[A], Ith[kA]/1s, Idyn[kA] peak, rdzen1 VA kl0,5 FS5,
# rdzen2 VA kl5P z ALF)
ABB_TPU6_STANDARD_2014: tuple[tuple[str, int, float, float, float, float, int], ...] = (
    ("60.11", 20, 6.3, 16, 15, 15, 10),
    ("60.11", 30, 6.3, 16, 15, 15, 15),
    ("60.21", 50, 16, 40, 15, 15, 15),
    ("60.11", 100, 16, 40, 15, 15, 15),
    ("60.11", 200, 40, 100, 15, 15, 10),
    ("60.11", 300, 50, 125, 15, 15, 15),
    ("60.11", 400, 40, 100, 15, 15, 15),
    ("60.11", 500, 50, 125, 15, 15, 15),
    ("60.11", 600, 50, 125, 20, 20, 10),
    ("63.11", 750, 50, 125, 15, 15, 10),
    ("63.11", 1000, 63, 160, 15, 15, 10),
    ("63.11", 1250, 63, 160, 15, 15, 15),
    ("64.11", 1500, 63, 160, 15, 15, 15),
    ("65.11", 2000, 80, 200, 15, 15, 15),
    ("66.11", 2500, 100, 250, 30, 30, 15),
    ("67.11", 3000, 100, 250, 30, 30, 15),
    ("68.11", 3200, 100, 250, 30, 30, 15),
)


def get_abb_tpu6_standard_types() -> list[dict[str, Any]]:
    result = []
    for model, primary, ith, idyn, meter_va, protection_va, alf in ABB_TPU6_STANDARD_2014:
        result.append({
            "id": f"ct-abb-tpu-{model.replace('.', '-')}-{primary}-5-2c-2014",
            "name": (
                f"ABB TPU {model} {primary}//5/5 A, "
                f"{meter_va:g} VA 0,5 FS5 + {protection_va:g} VA 5P{alf}"
            ),
            "params": {
                "manufacturer": "ABB",
                "ratio_primary_a": float(primary),
                "ratio_secondary_a": 5.0,
                "accuracy_class": "0.5",
                "burden_va": float(meter_va),
                "fs_safety_factor": 5.0,
                "ith_ka_1s": float(ith),
                "idyn_ka_peak": float(idyn),
                "um_kv": 24.0,
                "construction": "SUPPORT",
                "core_count": 2,
                "secondary_cores": [
                    {"index": 1, "role": "METERING",
                     "secondary_a": 5.0, "accuracy_class": "0.5",
                     "burden_va": float(meter_va), "fs": 5.0},
                    {"index": 2, "role": "PROTECTION",
                     "secondary_a": 5.0, "accuracy_class": f"5P{alf}",
                     "burden_va": float(protection_va), "alf": alf},
                ],
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "source_reference": SOURCE,
                "verification_note": (
                    f"Jednoznaczny wiersz ABB TPU {model}, I1={primary} A, "
                    f"Ith={ith:g} kA/1s, Idyn={idyn:g} kA szczyt, "
                    f"rdzenie 0,5 FS5 {meter_va:g} VA oraz "
                    f"5P{alf} {protection_va:g} VA. "
                    "Historyczne wykonanie standardowe z katalogu ABB 2014, "
                    "nie gwarancja aktualnej dostępności handlowej. "
                    "Klasa 0,5 nie zastępuje wymogu 0,2S dla nowego pomiaru "
                    "rozliczeniowego ENEA; ten model służy doborowi "
                    "technicznemu poza takim układem lub przy odrębnej zgodzie. "
                    "Rct niewymieniona w tabeli, NIE zgadywana."
                ),
            },
        })
    return result
