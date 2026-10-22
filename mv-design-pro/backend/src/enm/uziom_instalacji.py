"""Uziom instalacji odbiorczej R_A (`Load.earth_electrode_r_ohm`, karta W5-E-TTIT) — JEDEN walidator.

Rezystancja uziomu instalacji odbiorczej [Ω] jest daną PROJEKTOWĄ (pomiar albo projekt
uziomu) potrzebną fizyce pętli zwarcia doziemnego układów TT/IT
(``network_model/solvers/petla_zwarcia_tt_it.py``: pętla TT domyka się przez R_A i R_B,
napięcie dotykowe U_dotyk = R_A·I_Δn albo R_A·I_d). Odbiór zapisują dwie operacje domenowe
(`add_nn_load`, `update_element_parameters` na kolekcji `loads`) — obie wołają TĘ funkcję
(reguła KLASA NIE INSTANCJA: dwaj pisarze, jeden predykat). Brak klucza albo `None` = dana
NIEOBECNA (nigdy zero): operacja nie dopisuje pola, a werdykt TT/IT odmawia nazwanym kodem
`nn.brak_r_a` z akcją naprawczą.

Kod błędu `load.earth_electrode_r_ohm_invalid` jest kodem ODPOWIEDZI operacji domenowej
(jak `load.phases_invalid`), nie kodem gotowości kanonu.
"""

from __future__ import annotations

import math

KOD_BLEDU_R_A = "load.earth_electrode_r_ohm_invalid"


def waliduj_r_a(wartosc: object) -> tuple[float | None, str | None]:
    """Zwraca `(r_a_ohm, blad)`: liczba skończona > 0 albo `None` (brak deklaracji);
    `blad` = komunikat PL dla wartości niebędącej dodatnią liczbą skończoną."""
    if wartosc is None:
        return None, None
    if isinstance(wartosc, bool) or not isinstance(wartosc, int | float | str):
        return None, _blad(wartosc)
    try:
        liczba = float(wartosc)
    except (TypeError, ValueError):
        return None, _blad(wartosc)
    if not math.isfinite(liczba) or liczba <= 0.0:
        return None, _blad(wartosc)
    return liczba, None


def _blad(wartosc: object) -> str:
    return (
        f"Nieprawidłowa rezystancja uziomu instalacji odbiorczej R_A: {wartosc!r}. Podaj dodatnią "
        "liczbę w omach (brak = dana nieobecna; zero nie jest wartością uziomu)."
    )
