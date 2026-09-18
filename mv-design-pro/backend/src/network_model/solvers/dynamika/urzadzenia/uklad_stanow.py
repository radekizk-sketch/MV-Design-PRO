"""Uklad stanow urzadzenia: nazwy, indeksy i zaszczepienie pochodnych kierunkowych.

PO CO. Urzadzenia tej biblioteki maja ZMIENNA liczbe stanow: maszyna bez
regulatorow ma osiem stanow, ta sama maszyna z AVR, regulatorem obrotow i
stabilizatorem — trzynascie; przeksztaltnik bez opoznienia odbudowy mocy ma
siedem, z opoznieniem osiem. Blok nieobecny NIE dostaje stanu „na zapas":
stan o tozsamosciowo zerowej pochodnej zaklamywalby analize malosygnalowa
(dodatkowa zerowa wartosc wlasna) i wypelnialby wynik kanalem bez tresci.

Dlatego kazde urzadzenie sklada swoj uklad stanow PRZY BUDOWIE, a potem czyta
stany WYLACZNIE po nazwie. Zadnego `stan[7]` w rownaniach: indeks liczbowy przy
zmiennym ukladzie jest bledem czekajacym na zmiane konfiguracji.

ZASZCZEPIENIE. `zaszczep` zamienia wektor stanu i fazor napiecia na liczby
dualne z gradientami wzgledem (stany, Re V, Im V) — dokladnie tej przestrzeni,
w ktorej protokol `Urzadzenie` zada czterech blokow jakobianu. Ten sam uklad
stanow sluzy wiec do liczenia wartosci i do liczenia pochodnych; nie ma drugiej
mapy indeksow, ktora moglaby sie z ta rozejsc.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .pochodne_kierunkowe import Dual, Zespolona


@dataclass(frozen=True)
class UkladStanow:
    """Uporzadkowane nazwy stanow urzadzenia (kolejnosc jest czescia kontraktu)."""

    nazwy: tuple[str, ...]

    def __post_init__(self) -> None:
        if len(set(self.nazwy)) != len(self.nazwy):
            raise AssertionError(f"Uklad stanow ma powtorzone nazwy: {self.nazwy}")
        if not self.nazwy:
            raise AssertionError("Urzadzenie bez ani jednego stanu nie ma dynamiki")

    @property
    def wymiar(self) -> int:
        return len(self.nazwy)

    def indeks(self, nazwa: str) -> int:
        """Indeks stanu o zadanej nazwie; nazwa spoza ukladu jest bledem programu."""
        if nazwa not in self.nazwy:
            raise AssertionError(
                f"Stan {nazwa!r} nie nalezy do ukladu {self.nazwy} — czytanie stanu, "
                "ktorego konfiguracja urzadzenia nie utworzyla"
            )
        return self.nazwy.index(nazwa)

    def ma(self, nazwa: str) -> bool:
        return nazwa in self.nazwy

    def wektor(self, wartosci: dict[str, float]) -> np.ndarray:
        """Wektor stanu z kompletu wartosci; brak KTOREGOKOLWIEK stanu jest bledem."""
        brakujace = [nazwa for nazwa in self.nazwy if nazwa not in wartosci]
        if brakujace:
            raise AssertionError(
                f"Inicjalizacja nie podala stanow {brakujace} ukladu {self.nazwy} — "
                "stan bez wartosci poczatkowej nie ma rownowagi"
            )
        nadmiarowe = [nazwa for nazwa in wartosci if nazwa not in self.nazwy]
        if nadmiarowe:
            raise AssertionError(
                f"Inicjalizacja podala stany {nadmiarowe} spoza ukladu {self.nazwy}"
            )
        return np.array([wartosci[nazwa] for nazwa in self.nazwy], dtype=float)

    def uporzadkuj(self, pochodne: dict[str, Dual]) -> list[Dual]:
        """Pochodne stanow w kolejnosci ukladu; brak albo nadmiar to blad programu."""
        brakujace = [nazwa for nazwa in self.nazwy if nazwa not in pochodne]
        if brakujace:
            raise AssertionError(
                f"Rownania nie podaly pochodnych stanow {brakujace} — stan bez rownania "
                "ruchu nie jest stanem, tylko polem"
            )
        nadmiarowe = [nazwa for nazwa in pochodne if nazwa not in self.nazwy]
        if nadmiarowe:
            raise AssertionError(f"Rownania podaly pochodne {nadmiarowe} spoza ukladu")
        return [pochodne[nazwa] for nazwa in self.nazwy]

    # -- zaszczepienie pochodnych ----------------------------------------

    def bez_gradientu(
        self, stan: np.ndarray, napiecie_pu: complex
    ) -> tuple[dict[str, Dual], Zespolona]:
        """Stany i napiecie jako liczby dualne BEZ gradientu (tor tylko-wartosci)."""
        wartosci = {nazwa: Dual(float(stan[indeks])) for indeks, nazwa in enumerate(self.nazwy)}
        return wartosci, Zespolona(Dual(napiecie_pu.real), Dual(napiecie_pu.imag))

    def zaszczep(self, stan: np.ndarray, napiecie_pu: complex) -> tuple[dict[str, Dual], Zespolona]:
        """Stany i napiecie z gradientami wzgledem (stany, Re V, Im V).

        Wymiar przestrzeni rozniczkowania to `wymiar + 2`; dwie ostatnie
        wspolrzedne to skladowe napiecia — dokladnie w kolejnosci, ktorej zada
        `jakobian_stan_napiecie` i `jakobian_prad_napiecie`.
        """
        wymiar = self.wymiar + 2
        wartosci = {
            nazwa: Dual.zmienna(float(stan[indeks]), indeks, wymiar)
            for indeks, nazwa in enumerate(self.nazwy)
        }
        napiecie = Zespolona(
            Dual.zmienna(napiecie_pu.real, self.wymiar, wymiar),
            Dual.zmienna(napiecie_pu.imag, self.wymiar + 1, wymiar),
        )
        return wartosci, napiecie

    # -- skladanie blokow jakobianu --------------------------------------

    def blok_po_stanach(self, wielkosci: list[Dual]) -> np.ndarray:
        """Macierz (len(wielkosci), wymiar) pochodnych po STANACH."""
        wymiar = self.wymiar + 2
        blok = np.zeros((len(wielkosci), self.wymiar), dtype=float)
        for wiersz, wielkosc in enumerate(wielkosci):
            blok[wiersz, :] = wielkosc.do_wektora(wymiar)[: self.wymiar]
        return blok

    def blok_po_napieciu(self, wielkosci: list[Dual]) -> np.ndarray:
        """Macierz (len(wielkosci), 2) pochodnych po (Re V, Im V)."""
        wymiar = self.wymiar + 2
        blok = np.zeros((len(wielkosci), 2), dtype=float)
        for wiersz, wielkosc in enumerate(wielkosci):
            blok[wiersz, :] = wielkosc.do_wektora(wymiar)[self.wymiar :]
        return blok


__all__ = ["UkladStanow"]
