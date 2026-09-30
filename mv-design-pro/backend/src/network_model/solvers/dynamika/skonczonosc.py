"""Straznik skonczonosci: NaN/Inf lapane W CHWILI POWSTANIA, z adresem (SS0 p.4).

PO CO OSOBNY MODUL. NaN, ktory wejdzie do wektora stanu, przechodzi przez caly
bieg bez jednego wyjatku: mnozenie, dodawanie i rozklad LU przyjmuja go
milczaco, a koncowy szereg czasowy jest pelen `nan` bez jednej informacji, ktory
stan i w ktorej chwili go wyprodukowal. Dlatego sprawdzenie stoi TUZ ZA kazda
operacja, ktora moze go wytworzyc (pochodne urzadzen, rozwiazanie algebry, krok
calkowania), a komunikat niesie ADRES: nazwe stanu albo ident wezla, indeks w
wektorze i chwile biegu.

Sprawdzenie jest wektorowe (`numpy.isfinite`) i wchodzi w tor gorący raz na
operacje, nie raz na element.
"""

from __future__ import annotations

import numpy as np

from .kontrakty import KOD_WARTOSC_NIESKONCZONA, OdmowaDynamiki


def sprawdz_wektor(
    wartosci: np.ndarray, adresy: tuple[str, ...], kontekst: str, t_s: float
) -> None:
    """Odmow, gdy ktorakolwiek skladowa nie jest skonczona — z adresem i chwila.

    `adresy` ma dokladnie tyle pozycji, ile `wartosci` — niezgodnosc dlugosci jest
    bledem programisty (adres bez pokrycia bylby zmysleniem), wiec konczy sie
    `AssertionError`, nie odmowa dziedzinowa.
    """
    if wartosci.shape[0] != len(adresy):
        raise AssertionError(
            f"sprawdz_wektor: {wartosci.shape[0]} wartosci wobec {len(adresy)} adresow "
            f"(kontekst={kontekst!r})"
        )
    skonczone = np.isfinite(wartosci)
    if bool(skonczone.all()):
        return
    zle = [
        (int(indeks), adresy[int(indeks)], float(wartosci[int(indeks)]))
        for indeks in np.flatnonzero(~skonczone)
    ]
    opis = ", ".join(f"{adres}[{indeks}]={wartosc}" for indeks, adres, wartosc in zle)
    raise OdmowaDynamiki(
        KOD_WARTOSC_NIESKONCZONA,
        f"Wartosc nieskonczona w {kontekst} przy t={t_s} s: {opis}",
        kontekst=kontekst,
        t_s=t_s,
        adresy=tuple(adres for _, adres, _ in zle),
        indeksy=tuple(indeks for indeks, _, _ in zle),
    )


def sprawdz_napiecia(napiecia: np.ndarray, identy_wezlow: tuple[str, ...], t_s: float) -> None:
    """Skonczonosc wektora napiec zespolonych — adresem jest ident wezla."""
    if napiecia.shape[0] != len(identy_wezlow):
        raise AssertionError(
            f"sprawdz_napiecia: {napiecia.shape[0]} napiec wobec {len(identy_wezlow)} wezlow"
        )
    skonczone = np.isfinite(napiecia.real) & np.isfinite(napiecia.imag)
    if bool(skonczone.all()):
        return
    zle = [
        (int(indeks), identy_wezlow[int(indeks)], complex(napiecia[int(indeks)]))
        for indeks in np.flatnonzero(~skonczone)
    ]
    opis = ", ".join(f"{ident}={wartosc}" for _, ident, wartosc in zle)
    raise OdmowaDynamiki(
        KOD_WARTOSC_NIESKONCZONA,
        f"Napiecie nieskonczone przy t={t_s} s: {opis}",
        kontekst="napiecia_wezlow",
        t_s=t_s,
        adresy=tuple(ident for _, ident, _ in zle),
        indeksy=tuple(indeks for indeks, _, _ in zle),
    )


__all__ = ["sprawdz_napiecia", "sprawdz_wektor"]
