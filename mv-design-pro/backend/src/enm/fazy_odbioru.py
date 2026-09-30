"""Fazy przyłączenia odbioru (`Load.phases`, karta W5-D / decyzja F-1) — JEDEN walidator.

Model ENM (`enm/models.py::PhaseSet`) jest jedynym słownikiem wartości faz. Odbiór
zapisują trzy operacje domenowe (`add_nn_load`, `add_load_sn`, `update_element_parameters`
na kolekcji `loads`) — każda woła TĘ funkcję, żeby brzeg kontraktu był jeden (reguła
KLASA NIE INSTANCJA: trzy pisarze, jeden predykat). Brak klucza albo `None` znaczy
„odbiór trójfazowy symetryczny" — jedyne dotychczasowe znaczenie `Load` — i NIE jest
wartością domyślną fizyki: operacja nie dopisuje wtedy pola (migawka bez zmian).

Kod błędu `load.phases_invalid` jest kodem ODPOWIEDZI operacji domenowej (jak
`load.q_missing`), nie kodem gotowości kanonu.
"""

from __future__ import annotations

from typing import Any

from enm.models import FAZY_PRZYLACZENIA

KOD_BLEDU_FAZ = "load.phases_invalid"


def waliduj_fazy_odbioru(wartosc: Any) -> tuple[str | None, str | None]:
    """Zwraca `(fazy, blad)`: `fazy` = literał `PhaseSet` albo `None` (brak deklaracji),
    `blad` = komunikat PL, gdy wartość nie należy do słownika `FAZY_PRZYLACZENIA`."""
    if wartosc is None:
        return None, None
    if isinstance(wartosc, str) and wartosc in FAZY_PRZYLACZENIA:
        return wartosc, None
    return None, (
        f"Nieprawidłowe fazy przyłączenia odbioru: {wartosc!r}. Dozwolone: "
        f"{', '.join(FAZY_PRZYLACZENIA)} (brak = odbiór trójfazowy symetryczny)."
    )
