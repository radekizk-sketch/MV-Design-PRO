"""Wspolne elementy sladu WHITE BOX dla kryteriow wyposazenia stacji.

REUZYCIE, NIE DUPLIKACJA: kanon pieciu pol kroku (wzor → dane → podstawienie →
wynik → uwagi) oraz zapis liczb dla KaTeX-a powstaly przy kryterium cieplnym
przewodu (`conductor_thermal_withstand`). Tu sa wyniesione do jednego miejsca,
zeby cztery moduly tego pakietu nie powtarzaly wlasnych kopii i nie rozjechaly
sie w formacie sladu.
"""

from __future__ import annotations

import math
from typing import Any

#: Werdykty kryteriow. ``NIEDOSTEPNY`` znaczy BRAK PODSTAWY do oceny (patrz kody
#: gotowosci wyniku) i NIE WOLNO go czytac jako spelnienia kryterium.
STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
STATUS_UNAVAILABLE = "UNAVAILABLE"


def wartosc(value: float | None, unit: str, label: str) -> dict[str, Any]:
    """Wielkosc sladu w kanonie TraceValue.

    Zaokraglenie do 6 miejsc jest ZAPISEM, nie korekta wyniku: chroni slad przed
    roznicami ostatniego bitu przy serializacji, wiec dwa biegi tego samego
    wejscia daja identyczny dokument (Determinism Rule).
    """
    return {"value": None if value is None else round(value, 6), "unit": unit, "label": label}


def liczba_tex(value: float | None) -> str:
    """Liczba w zapisie polskim dla LaTeX-a (przecinek jako grupa ``{,}``).

    Pole „Podstawienie" renderuje KaTeX — zwykly przecinek traktuje jak separator
    i wstawia spacje (``0, 421``). Wartosci o rzedzie ≥ 10^5 ida w notacji
    potegowej, bo domyslny zapis Pythona (``8.464e+07``) jest w dowodzie
    nieczytelny.
    """
    if value is None:
        return "—"
    zaokraglona = round(value, 4)
    if zaokraglona != 0.0 and abs(zaokraglona) >= 1e5:
        wykladnik = math.floor(math.log10(abs(zaokraglona)))
        mantysa = zaokraglona / (10**wykladnik)
        return f"{round(mantysa, 4):g}".replace(".", "{,}") + r" \cdot 10^{" + str(wykladnik) + "}"
    return f"{zaokraglona:g}".replace(".", "{,}")


def dodatnia(value: float | None) -> float | None:
    """Zwroc wartosc tylko wtedy, gdy jest dodatnia — inaczej ``None``.

    Zero i wartosci ujemne sa dla wielkosci znamionowych (moc, dlugosc, przekroj)
    brakiem danej, a nie danymi: rachunek na nich milczaco falszowalby werdykt.
    """
    if value is None:
        return None
    return value if value > 0.0 else None


def nieujemna(value: float | None) -> float | None:
    """Zwroc wartosc tylko wtedy, gdy jest nieujemna — inaczej ``None``.

    Dla obciazen aparatow zero jest POPRAWNA dana (aparat cyfrowy o pomijalnym
    poborze), wiec nie wolno go traktowac jak braku.
    """
    if value is None:
        return None
    return value if value >= 0.0 else None
