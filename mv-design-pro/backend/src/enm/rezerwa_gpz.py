"""Tryb rezerwy transformatorowej i stany normalne łączników szyn GPZ — JEDNO źródło prawdy
(karta GPZ-H5): wyprowadzenie stanu, podstawa normatywna i podpowiedzi pól wejścia.

Podstawa: Wymagania techniczne ENEA Operator, Zeszyt 1 (02.2023-2), §26.10.5 — dwa sposoby
utrzymania rezerwy transformatorowej w stacji 110 kV/SN:

* **rezerwa ukryta** (``hidden``) — każdy transformator 110/SN pracuje na swojej sekcji SN,
  łącznik szyn SN jest normalnie OTWARTY; przy utracie transformatora SZR SN zamyka łącznik
  i drugi transformator przejmuje obie sekcje;
* **rezerwa jawna** (``explicit``) — transformator rezerwowy nie jest obciążony w normalnej
  pracy (wyłącznik jego pola SN normalnie OTWARTY), łącznik szyn SN jest normalnie ZAMKNIĘTY
  i całą rozdzielnię SN zasila transformator pracujący.

Tryb jest JAWNYM wyborem w danych stacji (``Substation.gpz_reserve_mode``). Stan normalny
łącznika szyn SN i stan normalny wyłącznika pola SN transformatora rezerwowego są z niego
WYPROWADZANE — operacja budowy GPZ (``enm.domain_operations.add_grid_source_sn``) zapisuje je
tą funkcją, walidator (W063) sprawdza zgodność modelu z trybem tą samą funkcją (predykaty
parami: zapis i kontrola z jednego źródła).

Moduł-LIŚĆ (tylko biblioteka standardowa) — czytają go operacje ENM i walidator.
"""

from __future__ import annotations

from typing import Final

TRYB_REZERWY_UKRYTEJ: Final = "hidden"
TRYB_REZERWY_JAWNEJ: Final = "explicit"
TRYBY_REZERWY: Final[tuple[str, ...]] = (TRYB_REZERWY_UKRYTEJ, TRYB_REZERWY_JAWNEJ)

NAZWA_TRYBU_REZERWY_PL: Final[dict[str, str]] = {
    TRYB_REZERWY_UKRYTEJ: "rezerwa ukryta",
    TRYB_REZERWY_JAWNEJ: "rezerwa jawna",
}

#: Podstawa normatywna trybu (przywoływana w komunikatach i uzasadnieniach modelu).
PODSTAWA_TRYBU_REZERWY_PL: Final = "Wymagania techniczne ENEA Operator, Zeszyt 1, §26.10.5"

#: Podpowiedź pola trybu rezerwy (formularz operacji budowy GPZ i szablon H5) — opis obu
#: wartości, BEZ wartości domyślnej (§26.10.5 nie wyróżnia żadnej z nich).
PODPOWIEDZ_TRYBU_REZERWY_PL: Final = (
    "Rezerwa ukryta: każdy transformator 110/SN pracuje na swojej sekcji SN, łącznik szyn SN "
    "jest normalnie otwarty, przy utracie transformatora SZR SN zamyka łącznik. Rezerwa jawna: "
    "transformator rezerwowy nie jest obciążony (wyłącznik jego pola SN normalnie otwarty), "
    "łącznik szyn SN jest normalnie zamknięty."
)

#: Podstawa stanu normalnego łącznika szyn 110 kV GPZ. Standard ENEA NIE ustala tego stanu
#: (§26.8.4: podziały planowe sieci 110 kV wyznacza ODM/KDM) — stan jest daną projektu.
PODSTAWA_STANU_LACZNIKA_SZYN_WN_PL: Final = (
    "Wymagania techniczne ENEA Operator, Zeszyt 1, §26.8.4 — podziały planowe sieci 110 kV "
    "wyznacza ODM/KDM, standard nie ustala stanu normalnego łącznika szyn 110 kV"
)

#: Podpowiedź pola stanu normalnego łącznika szyn 110 kV (model dwóch niezależnych
#: równoważników L1/L2): co daje każda wartość — bez wartości domyślnej.
PODPOWIEDZ_STANU_LACZNIKA_SZYN_WN_PL: Final = (
    "Przy dwóch niezależnych torach zasilania L1, L2 stan otwarty utrzymuje każdą sekcję "
    "110 kV na własnym torze (tak przyjmuje przypadek odbiorczy H5); stan zamknięty łączy "
    "dwa niezależne równoważniki sieci i wymaga wariantu ze wspólnym punktem zasilania "
    "(model B) — w tym modelu rozpływ i zwarcia nie są wtedy liczone."
)

#: Podpowiedź pola stanu normalnego łącznika szyn SN GPZ bez strony 110 kV (każda sekcja
#: z własnym równoważnikiem albo sekcje zasilane jednym równoważnikiem).
PODPOWIEDZ_STANU_LACZNIKA_SZYN_SN_PL: Final = (
    "Sekcje SN z własnymi równoważnikami: stan otwarty (rezerwa ukryta, każdy transformator "
    "zasila swoją sekcję); stan zamknięty tylko przy sekcjach zasilanych jednym "
    "równoważnikiem, z uzasadnieniem"
)

#: Uzasadnienie stanu normalnego „zamknięty” łącznika szyn SN zapisywane w modelu przy
#: rezerwie jawnej (stan wynika z trybu, nie z osobnej deklaracji).
UZASADNIENIE_ZAMKNIECIA_REZERWY_JAWNEJ: Final = (
    "Rezerwa jawna (Wymagania techniczne ENEA Operator, Zeszyt 1, §26.10.5): transformator "
    "rezerwowy nie jest obciążony, rozdzielnię SN zasila transformator pracujący przez "
    "zamknięty łącznik szyn SN."
)

#: Stan normalny wyłącznika pola SN transformatora rezerwowego (rezerwa jawna).
STAN_NORMALNY_WYLACZNIKA_TR_REZERWOWEGO: Final = "open"


def stan_normalny_lacznika_szyn_sn(tryb: str) -> str:
    """Stan normalny łącznika szyn SN wyprowadzony z trybu rezerwy (``open``/``closed``).

    ``ValueError`` dla trybu spoza ``TRYBY_REZERWY`` — wywołujący sprawdza tryb wcześniej
    (odmowa nazwana), więc funkcja nie zgaduje stanu dla danej nieznanej."""
    if tryb == TRYB_REZERWY_UKRYTEJ:
        return "open"
    if tryb == TRYB_REZERWY_JAWNEJ:
        return "closed"
    raise ValueError(f"nieznany tryb rezerwy GPZ: {tryb!r}")
