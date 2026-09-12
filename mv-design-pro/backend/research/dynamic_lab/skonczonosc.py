"""Skończoność wielkości numerycznych — JEDNO miejsce, w którym NaN i Inf są łapane.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

PO CO TEN MODUŁ ISTNIEJE (audyt niezależny, plan naprawy §2). Kontrprzykład z
audytu został ODTWORZONY na HEAD, nie przyjęty na słowo::

    pochodna zwracająca NaN  ->  rk4 daje stan NaN
                             ->  nakładka niezmienników RZUTUJE NaN na granicę
                             ->  stan wraca SKOŃCZONY (1,0)
                             ->  sprawozdanie kroku: STRICT_CONVERGENCE, rho = 0,0
                             ->  silnik melduje bieg jako zbieżny

Ta sama ścieżka dla ``+Inf`` daje ten sam wynik. Mechanizm rzutowania::

    if ogr.dol <= wartosc <= ogr.gora: continue        # NaN: oba porównania False
    granica = "dol" if wartosc < ogr.dol else "gora"   # NaN < dol: False -> "gora"

czyli ``NaN`` przechodził przez predykat przedziału jako „poza zakresem", a przez
wybór granicy jako „za duży". Obie odpowiedzi są nieprawdziwe: ``NaN`` nie jest
ani w przedziale, ani poza nim — jest BRAKIEM WARTOŚCI.

REGUŁA, KTÓRĄ TEN MODUŁ EGZEKWUJE:

    ``NaN`` i ``±Inf`` nigdy nie są argumentem porównania, min/max ani rzutowania.
    Są zgłaszane w miejscu POWSTANIA, z nazwą wielkości i miejscem.

DLACZEGO GŁOŚNO, A NIE „BEZPIECZNĄ WARTOŚCIĄ". Cicha podmiana ``NaN`` na granicę
przedziału zamienia awarię numeryczną w PRAWDOPODOBNIE WYGLĄDAJĄCY przebieg.
Przebieg, który „wygląda rozsądnie", jest gorszy od przebiegu, którego nie ma:
drugi zatrzymuje pracę, pierwszy trafia do wniosków.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

import numpy as np
from numpy.typing import NDArray


class WartoscNieskonczonaError(FloatingPointError):
    """Wielkość numeryczna nie jest liczbą skończoną.

    Dziedziczy po ``FloatingPointError``, a nie po ``ValueError``: to nie jest
    zła DANA WEJŚCIOWA (te odrzucają walidatory modelu), tylko wynik rachunku,
    który wyszedł poza dziedzinę liczb zmiennoprzecinkowych.

    ADRES DEFEKTU JEST DANĄ, NIE TYLKO TEKSTEM. Pierwsza wersja niosła pozycje
    wyłącznie w komunikacie — czytelnym dla człowieka i bezużytecznym dla kodu,
    który ma z tego zbudować pole kontraktu wyniku. Skutek był ZMIERZONY:
    po wpięciu kontroli skończoności do ``SilnikRMS.pochodne`` NaN był łapany
    już przy POCHODNEJ, więc lokalizacja liczona ze STANU (``x`` jest w tej
    chwili jeszcze skończony) zwracała pustą krotkę. Wynik meldował „bieg
    przerwany", nie mówiąc KTÓRY stan go przerwał — czyli tracił dokładnie tę
    informację, dla której kontrola powstała.

    Dlatego wyjątek niesie:

    ``pozycje``
        indeksy niepoprawnych elementów (krotka krotek — wymiar tablicy);
    ``etykiety``
        NAZWY tych elementów, gdy wołający je zna (np. ``("G1.delta_rad",)``);
        pusta krotka znaczy „wołający nie podał nazw", nigdy „nazw nie ma";
    ``co`` / ``gdzie``
        opis wielkości i miejsca, ten sam co w komunikacie.
    """

    def __init__(
        self,
        komunikat: str,
        *,
        pozycje: tuple[tuple[int, ...], ...] = (),
        etykiety: tuple[str, ...] = (),
        co: str = "",
        gdzie: str = "",
    ) -> None:
        super().__init__(komunikat)
        self.pozycje = pozycje
        self.etykiety = etykiety
        self.co = co
        self.gdzie = gdzie


def _opis_miejsca(co: str, gdzie: str) -> str:
    return f"{co} ({gdzie})" if gdzie else co


def wymagaj_skonczonosci(
    wartosci: float | complex | NDArray[np.float64] | NDArray[np.complex128] | Iterable[float],
    *,
    co: str,
    gdzie: str = "",
    etykiety: Sequence[str] | None = None,
) -> None:
    """Podnieś ``WartoscNieskonczonaError``, jeżeli cokolwiek nie jest skończone.

    Przyjmuje skalar, liczbę zespoloną, tablicę i dowolny ciąg — jedna funkcja,
    bo inaczej każdy tor miałby własne sprawdzenie i pierwszy pominięty otworzy
    tę samą dziurę (to jest reguła KLASA, NIE INSTANCJA zastosowana do kontroli
    dziedziny).

    Komunikat wskazuje INDEKSY niepoprawnych pozycji, a nie tylko fakt: przy
    stanie o kilkunastu współrzędnych „coś jest NaN" nie pozwala znaleźć modelu,
    który go wyprodukował.

    ``etykiety`` podaje się tam, gdzie wołający ZNA nazwy kolejnych elementów
    (silnik zna nazwy stanów urządzenia, integrator już nie). Wtedy komunikat
    mówi ``G1.delta_rad`` zamiast ``[0]``, a wyjątek niesie te nazwy jako daną —
    dzięki czemu kontrakt wyniku może je przepisać do ``stany_niesksonczone``
    BEZ parsowania tekstu. Długość niezgodna z liczbą elementów jest BŁĘDEM
    wołającego i podnosi ``ValueError``: etykiety przesunięte o jeden wskazują
    niewłaściwy stan, czyli są gorsze niż ich brak.
    """
    tablica = np.asarray(wartosci)
    if tablica.size == 0:
        return
    if etykiety is not None and len(etykiety) != tablica.size:
        raise ValueError(
            f"{_opis_miejsca(co, gdzie)}: podano {len(etykiety)} etykiet dla "
            f"{tablica.size} wartości — etykieta wskazująca nie ten element jest "
            f"gorsza niż brak etykiet."
        )
    skonczone = np.isfinite(tablica)
    if bool(np.all(skonczone)):
        return
    zle = np.argwhere(~skonczone)
    krotki = tuple(tuple(int(i) for i in idx) for idx in zle)
    nazwy = (
        tuple(etykiety[int(np.ravel_multi_index(idx, tablica.shape))] for idx in krotki)
        if etykiety is not None
        else ()
    )

    def _adres(numer: int, idx: tuple[int, ...]) -> str:
        if nazwy:
            return f"{nazwy[numer]} = {tablica[idx]!r}"
        return f"[{', '.join(str(i) for i in idx)}] = {tablica[idx]!r}"

    pozycje = ", ".join(_adres(numer, idx) for numer, idx in enumerate(krotki[:8]))
    reszta = "" if len(krotki) <= 8 else f" (i {len(krotki) - 8} dalszych)"
    raise WartoscNieskonczonaError(
        f"{_opis_miejsca(co, gdzie)}: wartość nie jest liczbą skończoną — {pozycje}{reszta}. "
        "NaN/Inf nie wolno rzutować, porównywać ani przyjąć za wynik: przebieg "
        "wyglądający rozsądnie po cichej podmianie jest gorszy niż brak przebiegu.",
        pozycje=krotki,
        etykiety=nazwy,
        co=co,
        gdzie=gdzie,
    )


def jest_skonczone(
    wartosci: float | complex | NDArray[np.float64] | NDArray[np.complex128] | Iterable[float],
) -> bool:
    """Predykat bez wyjątku — dla miejsc, które muszą ZDECYDOWAĆ, a nie przerwać.

    Istnieje po to, żeby nikt nie pisał własnego ``math.isnan or math.isinf``:
    dwa predykaty na tę samą własność rozjeżdżają się przy pierwszym przypadku
    brzegowym (dokładnie tak powstał defekt rzutowania NaN na granicę).
    """
    tablica = np.asarray(wartosci)
    return bool(tablica.size == 0 or np.all(np.isfinite(tablica)))
