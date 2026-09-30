"""Straznik ZAKRESU WAZNOSCI stanow — bieg poza modelem konczy sie odmowa.

PO CO OSOBNY MODUL, skoro obok stoi `skonczonosc`. Tamten lapie wartosc, ktora
nie jest liczba; ten lapie liczbe POPRAWNA ARYTMETYCZNIE, ktora lezy poza
zakresem, dla ktorego ktokolwiek napisal rownania. Drugi przypadek jest
grozniejszy, bo nie zostawia zadnego sladu: przebieg wyglada zwyczajnie i
przechodzi kazde sprawdzenie ksztaltu.

Roznica miedzy ZAKRESEM WAZNOSCI a OGRANICZNIKIEM (`granice_stanow`) jest
opisana w `kontrakty.Urzadzenie.zakresy_waznosci` i tam jest jedynym zrodlem
prawdy — tutaj tylko egzekucja.

MARGINES JEST WYPROWADZONY, NIE DOBRANY. Stan calkuje sie w podwojnej precyzji,
wiec sama reprezentacja przesuwa go o co najwyzej `ulp(x)` na krok; liczba krokow
przyjetych w biegu nie przekroczy `horyzont_s / dt_min_s` (kontrakt nastaw).
Iloczyn tych dwoch wielkosci jest najwiekszym przesunieciem, ktore MOZNA
przypisac samej arytmetyce — wszystko powyzej jest ruchem fizycznym. Dla nastaw
domyslnych (2 s / 2 ms, granica 0,1) daje to 1,4e-14, a dla najciezszych
(10 s / 1e-7 s, granica 0,95) 1,1e-08; kazde realne wyjscie poza zakres jest
o rzedy wielkosci wieksze, bo rosnie liniowo z czasem. Zadnej stalej progowej tu
nie ma i nie moze byc: prog wzialby sie z niczego i zaczalby decydowac o fizyce.
"""

from __future__ import annotations

import numpy as np

from .kontrakty import KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY, NastawySolvera, OdmowaDynamiki


def margines_arytmetyczny(granice: np.ndarray, nastawy: NastawySolvera) -> np.ndarray:
    """Najwieksze przesuniecie stanu, ktore mozna przypisac samej arytmetyce.

    Wyprowadzenie w docstringu modulu. Dla granicy nieskonczonej (stan bez zakresu
    waznosci) margines nie ma sensu i nie jest liczony — te pozycje i tak wypadaja
    z porownania.
    """
    skonczone = np.isfinite(granice)
    kroki_max = np.ceil(nastawy.horyzont_s / nastawy.dt_min_s)
    margines = np.zeros_like(granice)
    margines[skonczone] = kroki_max * np.spacing(np.abs(granice[skonczone]))
    return margines


def sprawdz_zakresy_waznosci(
    wartosci: np.ndarray,
    dolne: np.ndarray,
    gorne: np.ndarray,
    adresy: tuple[str, ...],
    nastawy: NastawySolvera,
    t_s: float,
) -> None:
    """Odmow, gdy ktorykolwiek stan opuscil zakres waznosci swojego modelu.

    `adresy` ma dokladnie tyle pozycji, ile `wartosci` — niezgodnosc dlugosci jest
    bledem programisty (adres bez pokrycia bylby zmysleniem), wiec konczy sie
    `AssertionError`, nie odmowa dziedzinowa. Tak samo jak w `skonczonosc`.
    """
    if wartosci.shape[0] != len(adresy):
        raise AssertionError(
            f"sprawdz_zakresy_waznosci: {wartosci.shape[0]} wartosci wobec {len(adresy)} adresow"
        )
    ponizej = wartosci < dolne - margines_arytmetyczny(dolne, nastawy)
    powyzej = wartosci > gorne + margines_arytmetyczny(gorne, nastawy)
    poza = ponizej | powyzej
    if not bool(poza.any()):
        return
    opisy: list[str] = []
    adresy_zle: list[str] = []
    wartosci_zle: list[float] = []
    granice_zle: list[float] = []
    przekroczenia: list[float] = []
    for indeks in np.flatnonzero(poza):
        indeks = int(indeks)
        wartosc = float(wartosci[indeks])
        granica = float(dolne[indeks]) if ponizej[indeks] else float(gorne[indeks])
        strona = "dolna" if ponizej[indeks] else "gorna"
        opisy.append(
            f"{adresy[indeks]}[{indeks}]={wartosc} "
            f"(granica {strona} {granica}, przekroczenie {abs(wartosc - granica)})"
        )
        adresy_zle.append(adresy[indeks])
        wartosci_zle.append(wartosc)
        granice_zle.append(granica)
        przekroczenia.append(abs(wartosc - granica))
    raise OdmowaDynamiki(
        KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
        f"Stan poza zakresem waznosci modelu przy t={t_s} s: {'; '.join(opisy)}. "
        "Od tej chwili przebieg nie pochodzi z zadnego modelu — zalozenia badania "
        "leza poza zakresem waznosci tego urzadzenia.",
        t_s=t_s,
        adresy=tuple(adresy_zle),
        indeksy=tuple(int(indeks) for indeks in np.flatnonzero(poza)),
        wartosci=tuple(wartosci_zle),
        granice=tuple(granice_zle),
        przekroczenia=tuple(przekroczenia),
    )


__all__ = ["margines_arytmetyczny", "sprawdz_zakresy_waznosci"]
