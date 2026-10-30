"""ABB KOKM 1 — przeznaczone do pomiaru PRĄDÓW FAZOWYCH na kablu/szynie.

Źródło ABB: Produkty niskiego napięcia. Przekładniki prądowe kablowe,
KOKM, tabela 1 i 2 (strony 4–5). Wartości to przykładowo osiągane
parametry standardowych konfiguracji, a nie potwierdzenie dostępności
numerów zamówieniowych w 2026 r.

Dla SN izolację główną zapewnia kabel pierwotny. Um=1,2 kV to
IZOLACJA SAMEGO PRZEKŁADNIKA KOKM1, nie napięcie znamionowe sieci.
KOLA/KOLMA z tego samego katalogu służą do prądu zerowego i nie mogą
być dodane do tej listy CT FAZOWYCH ani błędnie traktowane jako Ferranti.
"""
from __future__ import annotations

from typing import Any

ABB_KOKM1_SOURCE = (
    "ABB, Produkty niskiego napięcia: Przekładniki prądowe kablowe, "
    "tabele 1 i 2, KOKM 1, s.4–5, przykładowe parametry; "
    "https://library.e.abb.com/public/9ec0e942183d4a40b26153d12e58476e/"
    "ABB-przekladniki%20nn_PL_noweA%28217B%29_05.03.pdf"
)
# (oznaczenie konstrukcyjne, prąd pierwotny [A], wtórny [A],
#  klasa dokładności, moc [VA], średnica wewnętrzna [mm]).
ABB_KOKM1_KONFIGURACJE: tuple[
    tuple[str, int, int, str, float, int], ...
] = (
    ("BC10", 200, 5, "5P20", 5, 42),
    ("DC8", 100, 1, "10P10", 2, 60),
    ("DF12", 100, 5, "0.5", 3, 60),
    ("DC6", 150, 1, "5P20", 1, 60),
    ("DC14", 150, 5, "5P10", 10, 60),
    ("DC12", 300, 5, "5P10", 15, 60),
    ("DC16", 400, 5, "5P20", 10, 60),
    ("EC8", 100, 1, "5P20", 1, 70),
    ("EF16", 100, 1, "0.5", 1, 70),
    ("EC8", 150, 1, "5P20", 1, 70),
    ("EC6", 200, 1, "5P20", 1, 70),
    ("EC16", 250, 1, "5P10", 20, 70),
    ("EH16", 250, 1, "5P20", 20, 70),
    ("EC10", 400, 1, "5P10", 10, 70),
    ("EF14", 400, 1, "5P20", 20, 70),
    ("FC8", 600, 5, "0.5", 15, 85),
    ("FC8", 1000, 5, "0.5", 50, 85),
)


def get_abb_kokm1_phase_ct_types() -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for model, primary_a, secondary_a, accuracy, burden_va, bore_mm in ABB_KOKM1_KONFIGURACJE:
        is_protection = "P" in accuracy
        alf = int(accuracy.split("P", 1)[1]) if is_protection else None
        # Producent dla całej rodziny KOKM1 podaje 60*I1 (max 100 kA/1s).
        # Jest to reguła rodziny z tabeli 1, nie wynik testu egzemplarza.
        ith_kA = min(60 * primary_a / 1000.0, 100.0)
        record_id = (
            f"ct-abb-kokm1-{model.lower()}-{primary_a}-{secondary_a}-"
            f"{accuracy.lower().replace('.', 'p')}"
        )
        core = {
            "index": 1,
            "role": "PROTECTION" if is_protection else "METERING",
            "secondary_a": float(secondary_a),
            "accuracy_class": accuracy,
            "burden_va": float(burden_va),
        }
        if alf is not None:
            core["alf"] = alf
        result.append({
            "id": record_id,
            "name": (
                f"ABB KOKM 1 {model} {primary_a}/{secondary_a} A, "
                f"{accuracy}, {burden_va:g} VA, otwór {bore_mm} mm"
            ),
            "params": {
                "manufacturer": "ABB",
                "ratio_primary_a": float(primary_a),
                "ratio_secondary_a": float(secondary_a),
                "accuracy_class": accuracy,
                "burden_va": float(burden_va),
                "ith_ka_1s": ith_kA,
                "um_kv": 1.2,
                "construction": "RING_PHASE_CT",
                "core_count": 1,
                "secondary_cores": [core],
                "verification_status": "CZESCIOWO_ZWERYFIKOWANY",
                "catalog_status": "REFERENCYJNY_V1",
                "contract_version": "2.0",
                "source_reference": ABB_KOKM1_SOURCE,
                "verification_note": (
                    f"ABB KOKM1 typ {model}: RODZINA FAZOWA, I1={primary_a} A, "
                    f"I2={secondary_a} A, klasa {accuracy}, {burden_va:g} VA, "
                    f"otwór {bore_mm} mm wg tabeli 2. Ith={ith_kA:g} kA/1s "
                    "wyliczone z 60×I1 (max 100 kA), reguła rodziny z tab. 1. "
                    "Um 1,2 kV dotyczy samego toroidu; dla sieci SN "
                    "przewód/kabel pierwotny MUSI zapewnić właściwą izolację. "
                    "Tylko jedna faza w otworze CT; nie używać do pomiaru 3I0. "
                    "Brak potwierdzonej aktualnej dostawy 2026. "
                    "Dla nowych układów rozliczeniowych ENEA wymagana jest "
                    "klasa 0,2S i FS≤5, nie wolno automatycznie uznawać "
                    "tych modeli za zgodne z układem rozliczeniowym."
                ),
            },
        })
    if len(result) != len({r["id"] for r in result}):
        raise ValueError("Duplikat ABB KOKM 1 w katalogu CT")
    return result
