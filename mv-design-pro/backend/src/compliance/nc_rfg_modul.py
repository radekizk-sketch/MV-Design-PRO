"""Klasyfikacja modułu wytwórczego NC RfG (art. 5 rozporządzenia (UE) 2016/631).

Karta FAB-J. Klasyfikacja modułu (A/B/C/D) jest normatywna — do karty FAB-J
liczyło ją FRONTEND (`AddDerWizard.tsx::deriveModuleTypesForPowerKw`) z progów
200 kW / 10 MW / 50 MW BEZ kryterium napięcia i BEZ oparcia w normie.

JEDYNE ŹRÓDŁO PROGÓW (naprawa 2026-09-05, odbiór FAB-J — reguła KLASA NIE
INSTANCJA): ta funkcja DELEGUJE do `NcRfgProfile.classify_module`
(`catalog/profiles/nc_rfg/loader.py`), który zamrożony solver
`network_model/solvers/ncrfg_ptpiree/engine.py` (linia 235) już woła dla
DOKŁADNIE tego samego rozstrzygnięcia. Zero własnej tabeli progów — jeden
kod klasyfikujący, czytany zarówno przez solver PTPiREE, jak i przez
`GET /api/ncrfg-tests/modul` oraz walidację 422 w `POST .../generators`.
Odczyt profilu YAML przez `load_nc_rfg_profile` jest read-only (solver
pozostaje NIETKNIĘTY — B-01 nienaruszone).

Wybór profilu referencyjnego: wszystkich 5 profili operatorów
(pse/energa/tauron/enea/pge) ma IDENTYCZNE `module_types` (sprawdzone przy
tej naprawie — patrz meldunek karty, tabela progów). Klasyfikacja modułu
NC RfG art. 5 jest definicją na poziomie rozporządzenia, nie praktyką
operatora, więc wybór KTÓREGO profilu nie zmienia wyniku; `pse` (operator
systemu przesyłowego, pierwszy w `SUPPORTED_OPERATORS`) jest referencją.

ROZBIEŻNOŚĆ LICZBOWA — PYTANIE DO WŁAŚCICIELA (B-01, YAML solvera NIE
zmieniony w tej karcie): progi w YAML (`catalog/profiles/nc_rfg/*.yaml`,
identyczne we wszystkich 5 profilach) NIE zgadzają się z progami decyzji
Prezesa URE dla NC RfG (poprzednie źródło tej funkcji, usunięte tą naprawą):

    próg           | YAML (module_types, solver PTPiREE) | URE (poprzednie źródło tej funkcji)
    A/B (górny A)  | 1 000 kW (1 MW)                     | 200 kW
    B/C (górny B)  | 50 000 kW (50 MW)                   | 10 000 kW (10 MW)
    C/D (górny C)  | 75 000 kW (75 MW)                   | 75 000 kW (75 MW) — ZGODNE
    D wg napięcia  | brak dopasowania A/B/C -> fallback D | jawne: napiecie_kv >= 110 -> D

Dla mocy 200 kW-1 MW i 10-50 MW klasyfikacja WEDŁUG YAML (A wzgl. B) różni
się od klasyfikacji WEDŁUG URE (B wzgl. C) — to real rozbieżność, nie błąd
zaokrąglenia. Kryterium napięcia D jest równoważne w obu: YAML nie ma
`voltage_kv_max` dla A/B/C powyżej 110 kV, więc żadna z tych kategorii nie
dopasowuje się dla napięcia >110 kV i pętla `classify_module` spada do
ostatniego typu (D) — ten sam skutek co jawny próg URE ≥110 kV.
"""

from __future__ import annotations

from typing import Literal, get_args

from catalog.profiles.nc_rfg import load_nc_rfg_profile

NcRfgModul = Literal["A", "B", "C", "D"]

#: Profil referencyjny do klasyfikacji — patrz uzasadnienie w module docstring:
#: wszystkie profile mają identyczne `module_types`, wybór jest deterministyczny.
_PROFIL_REFERENCYJNY = "pse"


def modul_nc_rfg(p_max_mw: float, napiecie_przylaczenia_kv: float) -> NcRfgModul:
    """Klasyfikuje moduł wytwórczy NC RfG delegując do profilu solvera PTPiREE.

    Args:
        p_max_mw: Moc maksymalna modułu wytwórczego [MW] (P_max, art. 5).
        napiecie_przylaczenia_kv: Napięcie znamionowe w punkcie przyłączenia [kV].

    Returns:
        Jedna z liter "A" | "B" | "C" | "D" — dokładnie ta, którą zwróciłby
        `NcRfgProfile.classify_module` (ten sam kod, którego solver PTPiREE
        już używa; patrz rozbieżność progów YAML vs URE w module docstring).
    """
    profile = load_nc_rfg_profile(_PROFIL_REFERENCYJNY)
    module_type = profile.classify_module(p_max_mw * 1000.0, napiecie_przylaczenia_kv)
    if module_type is None or module_type.id not in get_args(NcRfgModul):
        raise ValueError(
            f"NcRfgProfile.classify_module('{_PROFIL_REFERENCYJNY}') zwrócił "
            f"nieoczekiwaną wartość: {module_type!r} dla P={p_max_mw} MW, "
            f"U={napiecie_przylaczenia_kv} kV — profil YAML wymaga poprawy "
            f"(nie tego wywołania)."
        )
    id_modulu = module_type.id
    if id_modulu == "A":
        return "A"
    if id_modulu == "B":
        return "B"
    if id_modulu == "C":
        return "C"
    return "D"
