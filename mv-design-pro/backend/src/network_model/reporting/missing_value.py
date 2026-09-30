"""Kanoniczny format braku wartosci WYNIKU w eksportach (PDF/DOCX/tekst).

FAB-E (E1, karta A6-12 czesc 3): brak pola WYNIKU solvera (rozplyw/zwarcia/
slad obliczen) w zapisanym przebiegu NIE jest liczba 0. Analog
``formatPolishValue`` z warstwy UI
(``frontend/src/ui/shared/formatPolishValue.ts``, stala ``MISSING_LABEL``) —
dla eksportow PDF/DOCX/tekstowych renderujemy zawsze PELNA etykiete slowna
(w przeciwienstwie do UI, eksport nie ma ograniczenia szerokosci kolumny jak
SLD, wiec nie potrzebuje wariantu skroconego).

Uzycie: odczytaj pole wyniku solvera przez ``slownik.get("pole")`` (BEZ
domyslnej liczby jak ``0``/``0.0``), a sformatowanie do wyswietlenia przekaz
przez ``format_wynik``. Nie dotyczy identyfikatorow/etykiet opisowych (np.
``bus_id``), dla ktorych myslnik pozostaje ustalona konwencja tych modulow —
to WYLACZNIE dla wartosci bedacych wynikiem obliczen solvera.
"""

from __future__ import annotations

import math
from typing import Any, Final

#: Jedyny, jednolity napis dla brakujacego pola WYNIKU w eksportach tekstowych.
BRAK_DANYCH: Final[str] = "brak danych"


def _jest_nieznana(wartosc: Any) -> bool:
    if wartosc is None:
        return True
    if isinstance(wartosc, float) and math.isnan(wartosc):
        return True
    return False


def format_wynik(wartosc: Any, format_spec: str = "") -> str:
    """Sformatuj wartosc WYNIKU solvera do PDF/DOCX/tekstu.

    ``wartosc is None`` (pole nieobecne w wyniku solvera) lub NaN (znacznik
    solvera dla "nieznana", patrz ``network_model/solvers/power_flow_newton.py``
    — wezly poza wyspa bilansujaca) renderuje ``BRAK_DANYCH`` zamiast
    fabrykowanej liczby (``0.00``, ``0.0e+00`` itp.), ktora wygladalaby jak
    prawdziwy wynik obliczen. Dla znanej wartosci ``format_spec`` dziala jak
    w ``format(wartosc, format_spec)`` (pusty spec = ``str(wartosc)``).
    """
    if _jest_nieznana(wartosc):
        return BRAK_DANYCH
    if format_spec:
        return format(wartosc, format_spec)
    return str(wartosc)
