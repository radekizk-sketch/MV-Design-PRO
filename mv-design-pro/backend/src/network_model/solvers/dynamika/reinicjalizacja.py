"""Re-inicjalizacja po zdarzeniu: stany TRZYMANE, algebra OD NOWA (SS0 p.5).

FIZYKA. Zmiana topologii (zwarcie, otwarcie galezi, odlaczenie zrodla) nie moze
zmienic stanow ROZNICZKOWYCH: skok strumienia, kata wirnika, predkosci albo
stanu naladowania wymagalby nieskonczonego napiecia, momentu albo mocy. Zmienia
sie natomiast caly stan ALGEBRAICZNY — napiecia wezlowe skacza w tej samej
chwili. Dlatego po kazdym zdarzeniu stany rozniczkowe sa PRZENOSZONE bez zmiany,
a uklad algebraiczny rozwiazywany OD NOWA na nowej topologii.

DIAGNOSTYKA LICZONA NIEZALEZNIE — naprawa defektu zmierzonego w przegladzie
watku badawczego (P1-B55-01). Tamta implementacja ZATWIERDZALA nowy punkt pracy
PRZED policzeniem roznicy napiec, a funkcja czytajaca „napiecia odniesienia"
siegala juz po nadpisany stan — porownywala wiec `v_po` z `v_po` i meldowala
`delta_y = 0` przy rzeczywistym skoku `1,012` pu. Diagnostyka fałszywie dowodzila
ciaglosci czesci algebraicznej.

Tutaj defekt jest niemozliwy Z KONSTRUKCJI, na trzy sposoby naraz:
1. migawka `napiecia_przed` powstaje jako KOPIA w PIERWSZEJ instrukcji funkcji,
   zanim cokolwiek zostanie policzone;
2. funkcja nie ma dostepu do zadnego stanu wspoldzielonego — nowy punkt pracy
   istnieje wylacznie jako wartosc zwracana, wiec nie ma czego „zatwierdzic" za
   wczesnie;
3. residuum KCL liczy `siec.residuum_kcl_niezalezne`, ktore sklada bilans
   element po elemencie, z pominieciem macierzy `Y` uzywanej przez Newtona.

Punkt 1 jest przypiety testem mutacyjnym: podmiana migawki na wynik po
rozwiazaniu (dokladnie ten defekt) MUSI wywrocic test — inaczej deklaracja z tego
docstringa bylaby obietnica bez pokrycia.

PUNKT STARTOWY NEWTONA A NAPIECIA PRZED ZDARZENIEM (karta AB-1b.1 par. 0 pkt 2).
Wezel, ktory w tej chwili PRZESTAJE miec napiecie narzucone zerem (ponowne zasilenie
obszaru odcietego, zdjecie zwarcia metalicznego), startowalby Newtona z `V = 0` — a
odbior o stalej mocy ma tam `1/|V|^2`. Silnik podaje wtedy osobny `napiecia_startowe`
(napiecie najblizszego wezla zywego); to jest WYBOR PUNKTU STARTOWEGO, nie korekta
rozwiazania. Skok `delta_y` jest nadal mierzony wzgledem napiec PRZED zdarzeniem —
migawki, nie punktu startowego.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .kontrakty import (
    KOD_REINICJALIZACJA_NIEZBIEZNA,
    NastawySolvera,
    OdbiorDynamiki,
    OdmowaDynamiki,
    Urzadzenie,
)
from .siec import ModelSieci, residuum_kcl_niezalezne, rozwiaz_algebre, wezly_ograniczone


@dataclass(frozen=True)
class RaportReinicjalizacji:
    """Pomiar skoku algebry i bilansu po re-inicjalizacji — dane do `zdarzenia_wykonane`.

    Ciaglosci stanow rozniczkowych ten raport NIE mierzy (korekta 2026-09-24, karta
    AB-1b.1 S19): dawne pole `delta_x_max` porownywalo kopie stanow przekazana do algebry
    z ta sama kopia po rozwiazaniu, czyli wykrywalo wylacznie mutacje w miejscu wewnatrz
    Newtona, a bylo przedstawiane jako dowod ciaglosci stanow przez zdarzenie. Pomiar z
    trescia (`delta_x_nieprzypisane_max`) liczy silnik wobec stanow sprzed CALEJ chwili
    zdarzen, z wylaczeniem pozycji przypisanych jawnie (przypisanie stanu, komenda
    regulacji).
    """

    delta_y_max: float
    delta_y_per_wezel: tuple[tuple[str, float], ...]
    residuum_kcl_max: float
    residuum_algebry: float
    iteracje: int
    nawroty: int
    #: Wezly z wierszem ograniczenia napiecia w nowym stanie (obszar odciety, zwarcie
    #: metaliczne, zrodlo napieciowe) — POZA `residuum_kcl_max`, bo ich bilans jest z
    #: definicji domknieciem pradu elementu narzucajacego napiecie.
    wezly_ograniczone: tuple[str, ...]


def reinicjalizuj(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany_przed: tuple[np.ndarray, ...],
    napiecia_przed: np.ndarray,
    *,
    nastawy: NastawySolvera,
    t_s: float,
    napiecia_startowe: np.ndarray | None = None,
) -> tuple[np.ndarray, RaportReinicjalizacji]:
    """Rozwiaz algebre na NOWEJ topologii przy TRZYMANYCH stanach rozniczkowych.

    Zwraca nowe napiecia i raport skoku. Stany rozniczkowe NIE sa zwracane, bo
    re-inicjalizacja ich nie zmienia — to nie jest uproszczenie, tylko fizyka ciaglosci.
    Algebra dostaje KOPIE stanow, wiec nie ma jak zmienic stanow wolajacego; ciaglosc
    stanow przez cala chwile zdarzen mierzy silnik (`delta_x_nieprzypisane_max`).
    """
    migawka_napiec = np.array(napiecia_przed, dtype=complex, copy=True)
    migawka_stanow = tuple(np.array(stan, dtype=float, copy=True) for stan in stany_przed)
    start = (
        migawka_napiec
        if napiecia_startowe is None
        else np.array(napiecia_startowe, dtype=complex, copy=True)
    )

    try:
        wynik = rozwiaz_algebre(
            model,
            odbiory,
            urzadzenia,
            migawka_stanow,
            start,
            tolerancja=nastawy.tolerancja,
            max_iteracji=nastawy.max_iteracji_newtona,
            max_nawrotow=nastawy.max_nawrotow,
            t_s=t_s,
        )
    except OdmowaDynamiki as odmowa:
        # Szczegoly przyczyny SCALAMY, zamiast rozpakowywac obok wlasnych kluczy:
        # przyczyna niesie wlasne `t_s`/`residuum`, wiec rozpakowanie obok
        # `t_s=t_s` konczy sie `KeyError` — cala droga odmowy padala wtedy innym
        # bledem niz ten, ktory mial byc zameldowany. Klucze zewnetrzne wygrywaja,
        # bo opisuja miejsce w cyklu biegu, a nie miejsce w algebrze.
        szczegoly = dict(odmowa.szczegoly)
        szczegoly.update({"t_s": t_s, "przyczyna": odmowa.kod})
        raise OdmowaDynamiki(
            KOD_REINICJALIZACJA_NIEZBIEZNA,
            f"Re-inicjalizacja algebry po zdarzeniu w t={t_s} s nie zbiegla: {odmowa}",
            **szczegoly,
        ) from odmowa

    roznice = np.abs(wynik.napiecia - migawka_napiec)
    delta_y_per_wezel = tuple(
        (ident, float(roznice[pozycja])) for pozycja, ident in enumerate(model.identy_wezlow)
    )
    return wynik.napiecia, RaportReinicjalizacji(
        delta_y_max=float(np.max(roznice)) if roznice.size else 0.0,
        delta_y_per_wezel=delta_y_per_wezel,
        residuum_kcl_max=residuum_kcl_niezalezne(
            model, odbiory, urzadzenia, migawka_stanow, wynik.napiecia
        ),
        residuum_algebry=wynik.residuum,
        iteracje=wynik.iteracje,
        nawroty=wynik.nawroty,
        wezly_ograniczone=wezly_ograniczone(model, urzadzenia),
    )


__all__ = ["RaportReinicjalizacji", "reinicjalizuj"]
