"""Czesciowa utrata zrodla — agregat identycznych jednostek z ubytkiem udzialu (D-20).

MODEL (karta AB-1b.1 par. 0 pkt 10). Elektrownia zlozona z N IDENTYCZNYCH jednostek
rownoleglych (falowniki, maszyny, moduly magazynu, turbiny) jest w rdzeniu jednym
urzadzeniem, ktorego stany opisuja agregat WSZYSTKICH jednostek w bazie ukladu. Gdy
czesc jednostek wypada (zabezpieczenie falownika, awaria modulu), pozostale pracuja DALEJ
z tym samym stanem NA JEDNOSTKE: ich pradem zadanym, katem petli synchronizacji, predkoscia
wirnika, stanem naladowania. Zmienia sie wylacznie liczba jednostek oddajacych prad do
sieci. Dlatego:

* prad wstrzykiwany do wezla i OBA jego jakobiany (po napieciu i po stanie) sa mnozone przez
  udzial pozostaly `u` — do sieci oddaje `u N` jednostek,
* pochodne stanow i ich jakobiany sa BEZ skalowania — kazda pozostala jednostka widzi to
  samo napiecie zaciskow i ten sam wlasny prad na jednostke,
* napiecie jalowe (SEM przy zerowym pradzie) jest napieciem kazdej jednostki z osobna.

ZERO PRZYBLIZENIA. Dla `u` rownego 0,5 uklad jest w arytmetyce dwojkowej rownowazny dwom
identycznym polowkom, z ktorych jedna zostala odlaczona (`UrzadzenieOdlaczone`): mnozenia
przez 0,5 i przez 2 sa dokladne — twierdzenie D-20 (a) przypina te rownowaznosc wobec
biegu z dwiema jednostkami.

KOMENDA PO UTRACIE. Stany opisuja agregat wszystkich jednostek, a komenda regulacji
dotyczy jednostek POZOSTALYCH, wiec nastawa mocy czynnej i biernej jest dzielona przez
udzial (`NastawaRegulacji.mnoznik`); nastawa napiecia jest nastawa kazdej jednostki i
przechodzi bez zmiany. Zakres nastawy (okno mocy) pozostaje zakresem STANU — nastawa
`P / u` sprawdzana wobec okna agregatu to dokladnie nastawa `P` wobec okna jednostek
pozostalych.

ZAKRES. Opakowanie przyjmuje wylacznie urzadzenie o sprzezeniu PRADOWYM, ktore deklaruje
sie jako agregat jednostek (`Urzadzenie.agregat_jednostek`) — ekwiwalent sieci (szyna
sztywna) i zrodlo testowe nimi nie sa; te odmowy (i odmowy udzialu rosnacego) stawia
silnik przed zbudowaniem opakowania.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import ClassVar

import numpy as np

from ..kontrakty import NastawaRegulacji, SprzezenieUrzadzenia, Urzadzenie


@dataclass(frozen=True)
class UrzadzenieCzesciowe:
    """Agregat identycznych jednostek, z ktorego pracuje udzial `udzial` (0 < u < 1)."""

    bazowe: Urzadzenie
    udzial: float

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    @property
    def ident(self) -> str:
        return self.bazowe.ident

    @property
    def wezel(self) -> str:
        return self.bazowe.wezel

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.bazowe.nazwy_stanow

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Ograniczniki sa wlasnoscia KAZDEJ jednostki — przenoszone bez zmian."""
        return self.bazowe.granice_stanow

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Zakres waznosci stanu na jednostke nie zalezy od liczby jednostek."""
        return self.bazowe.zakresy_waznosci

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        return self.bazowe.stany_bez_rownowagi

    @property
    def sprzezenie(self) -> SprzezenieUrzadzenia:
        """Pradowe — agregat oddaje prad `u I(x, V)`; zrodla napieciowego nie opakowujemy."""
        return "pradowe"

    @property
    def stany_przypisywalne(self) -> tuple[str, ...]:
        """Te same nastawy, co urzadzenia bazowego (nastawa kazdej jednostki)."""
        return self.bazowe.stany_przypisywalne

    @property
    def nastawy_regulacji(self) -> tuple[NastawaRegulacji, ...]:
        """Nastawy bazowego z mnoznikiem mocy `1/u` (komenda dotyczy jednostek pozostalych)."""
        return tuple(
            (
                replace(nastawa, mnoznik=nastawa.mnoznik / self.udzial)
                if nastawa.wielkosc in ("p", "q")
                else nastawa
            )
            for nastawa in self.bazowe.nastawy_regulacji
        )

    @property
    def agregat_jednostek(self) -> bool:
        return True

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Parametry bazowego i udzial pozostaly — opakowanie rozpoznawane po nazwie klasy."""
        return {"bazowe": self.bazowe.parametry_tozsamosci(), "udzial": self.udzial}

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        """Stan agregatu, ktory przy udziale `u` oddaje moc `moc_pu`: stany opisuja CALY
        agregat, wiec punkt pracy jednostek pozostalych skaluje sie `1/u`."""
        return self.bazowe.stan_poczatkowy(napiecie_pu, moc_pu / self.udzial)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.pochodne(stan, napiecie_pu)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.jakobian_stan_stan(stan, napiecie_pu)

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.bazowe.jakobian_stan_napiecie(stan, napiecie_pu)

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        return self.udzial * self.bazowe.prad_pu(stan, napiecie_pu)

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.udzial * self.bazowe.jakobian_prad_napiecie(stan, napiecie_pu)

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        return self.udzial * self.bazowe.jakobian_prad_stan(stan, napiecie_pu)

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        return self.bazowe.napiecie_bez_obciazenia(stan)

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        return self.bazowe.jakobian_napiecia_bez_obciazenia(stan)


__all__ = ["UrzadzenieCzesciowe"]
