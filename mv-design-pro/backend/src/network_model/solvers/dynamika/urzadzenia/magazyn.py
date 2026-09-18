"""Magazyn energii (BESS): stan naladowania + przeksztaltnik na JEDNEJ bazie mocy.

SKLAD. Kontrakt ENM sklada magazyn z dwoch czesci: zasobnika (pojemnosc,
sprawnosci, granice SOC, granice mocy ladowania i rozladowania) oraz
PRZEKSZTALTNIKA — nadaznego albo tworzacego siec. Ten modul nie powiela ani
jednego rownania regulacji: uzywa rdzenia `RdzenGFL` albo `RdzenGFM`, dokladnie
tego samego, ktory obsluguje przeksztaltnik samodzielny. Kontrakt sklada te
urzadzenia z tych samych blokow, wiec trzecia kopia regulacji bylaby trzecim
miejscem na ten sam rozjazd.

JEDNA BAZA MOCY. Kontrakt ENM mowi wprost: baza mocy magazynu to
`przeksztaltnik.s_n_mva`. Granice `p_ladowania_max_kw` i `p_rozladowania_max_kw`
sa w kW i przeliczaja sie na pu bazy UKLADU przez te wlasnie baze (kontrakt
waliduje, ze nie przekraczaja `s_n_mva * 1000`).

BILANS ENERGII. Stan naladowania jest calka mocy po stronie STALOPRADOWEJ, a
sprawnosc wchodzi ROZNIE w kazda strone (to nie jest jedna liczba „sprawnosc
cyklu"):

    rozladowanie (P_ac > 0):  P_dc = P_ac / sprawnosc_rozladowania
    ladowanie    (P_ac < 0):  P_dc = P_ac * sprawnosc_ladowania
    d(SOC)/dt = -P_dc [MW] / (E_n [MWh] * 3600)

Znak: dodatnia moc oddawana do sieci OBNIZA stan naladowania.

NIENARUSZALNOSC ZAKRESU SOC JEST DWUSTOPNIOWA — i oba stopnie pochodza z tego
samego predykatu (`OknoMocy`), a nie z dwoch niezaleznych warunkow:

1. **Okno zadania.** Przy `SOC <= SOC_min` okno mocy zamyka sie od gory (koniec
   rozladowania), przy `SOC >= SOC_max` od dolu (koniec ladowania). Rdzen
   przeksztaltnika ogranicza tym oknem SWOJE zadanie mocy czynnej.
2. **Ogranicznik nienawrotny na calce SOC.** Pochodna, ktora wypchnelaby SOC poza
   zakres, jest ZEROWANA. To jest zabezpieczenie ostateczne: przeksztaltnik
   tworzacy siec oddaje moc, ktora narzuca mu SIEC (okno ogranicza zadanie, nie
   moc rzeczywista), wiec bez tego stopnia SOC moglby wyjsc poza zakres mimo
   poprawnego zadania. Dokladnie tak dziala uklad zarzadzania bateria.

REGULACJA CZESTOTLIWOSCI MAGAZYNU. Blok `regulacja_f` jest regulacja P/f TEGO
SAMEGO rodzaju, co statyzm przeksztaltnika — przylozenie obu naraz liczyloby te
sama odpowiedz dwa razy. Dlatego, gdy blok jest obecny, jego statyzm i martwa
strefa ZASTEPUJA nastawy statyzmu przeksztaltnika (nastawa magazynu jest
nastawa zasobu, a nie urzadzenia), a `p_rezerwa_pu` ZWEZA okno mocy z obu stron
— rezerwa na regulacje to moc, ktorej harmonogram nie moze zajac.

STAN SOC NIE MA ROWNOWAGI. Magazyn w pracy laduje sie albo rozladowuje, wiec
`d(SOC)/dt != 0` w punkcie pracy — to jest FIZYKA, nie niespojnosc wejscia.
Dlatego `soc_pu` jest zgloszony w `stany_bez_rownowagi` i bramka rownowagi
rdzenia go pomija. Gdyby go nie pomijala, KAZDY bieg z pracujacym magazynem
konczylby sie odmowa `dynamika.inicjalizacja_niezbiezna` — czyli funkcja
istnialaby tylko w testach.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from network_model.pochodne import kw_na_mw, mw_na_kw

from ..kontrakty import KOD_PUNKT_PRACY_POZA_OGRANICZENIEM, OdmowaDynamiki
from ..konwencje import moc_pu, zmiana_bazy_mocy_wzglednej
from .okno_mocy import OknoMocy
from .pochodne_kierunkowe import Dual, Zespolona
from .przeksztaltnik_gfl import RdzenGFL
from .przeksztaltnik_gfm import RdzenGFM
from .uklad_stanow import UkladStanow

STAN_NALADOWANIA = "soc_pu"

#: Sekund w godzinie — przelicznik energii [MWh] na moc [MW] razy czas [s].
SEKUND_W_GODZINIE = 3600.0

RdzenPrzeksztaltnika = RdzenGFL | RdzenGFM


@dataclass(frozen=True)
class Zasobnik:
    """Czesc energetyczna magazynu — parametry JUZ w jednostkach bazy ukladu."""

    pojemnosc_kwh: float
    p_ladowania_max_pu: float
    p_rozladowania_max_pu: float
    sprawnosc_ladowania: float
    sprawnosc_rozladowania: float
    soc_min: float
    soc_max: float
    soc_poczatkowy: float
    s_bazowa_mva: float

    def okno_bazowe(self) -> OknoMocy:
        """Okno mocy wynikajace z granic ladowania i rozladowania (bez SOC)."""
        return OknoMocy(dol_pu=-self.p_ladowania_max_pu, gora_pu=self.p_rozladowania_max_pu)

    def okno_dla_soc(self, soc: float) -> OknoMocy:
        """Okno zwezone przez stan naladowania — pusty nie oddaje, pelny nie przyjmuje."""
        okno = self.okno_bazowe()
        if soc <= self.soc_min:
            okno = okno.zwezone(gora_pu=0.0)
        if soc >= self.soc_max:
            okno = okno.zwezone(dol_pu=0.0)
        return okno

    def pochodna_naladowania(self, moc_czynna_pu: Dual) -> Dual:
        """`d(SOC)/dt` — calka mocy stalopradowej; zakres egzekwuje CALKOWANIE.

        Zerowanie pochodnej na granicy zakresu bylo by ogranicznikiem NIECIAGLYM
        w rownaniu, czyli dokladnie tym, co odbiera rownaniu kroku rozwiazanie
        (patrz `regulatory.NIENAWROTNOSC_JEST_W_CALKOWANIU`). Zakres jest tu
        zgloszony jako `granice_stanow` i dotrzymany DOKLADNIE przez zbior aktywny
        calkowania.
        """
        sprawnosc = (
            self.sprawnosc_rozladowania
            if moc_czynna_pu.wartosc >= 0.0
            else 1.0 / self.sprawnosc_ladowania
        )
        moc_stalopradowa_kw = moc_czynna_pu * (mw_na_kw(self.s_bazowa_mva) / sprawnosc)
        return -moc_stalopradowa_kw / (self.pojemnosc_kwh * SEKUND_W_GODZINIE)


def zbuduj_zasobnik(
    *,
    e_n_kwh: float,
    p_ladowania_max_kw: float,
    p_rozladowania_max_kw: float,
    sprawnosc_ladowania: float,
    sprawnosc_rozladowania: float,
    soc_min: float,
    soc_max: float,
    soc_poczatkowy: float,
    p_rezerwa_pu: float,
    s_n_przeksztaltnika_mva: float,
    s_bazowa_mva: float,
) -> Zasobnik:
    """Zbuduj zasobnik, przeliczajac kW/kWh na baze ukladu.

    `p_rezerwa_pu` jest w bazie PRZEKSZTALTNIKA (jak kazda moc wzgledna
    urzadzenia) i zweza okno Z OBU STRON: rezerwa na regulacje czestotliwosci to
    moc, ktorej zadanie harmonogramowe nie ma prawa zajac — inaczej statyzm
    nie mialby czym odpowiedziec.
    """
    rezerwa_pu = zmiana_bazy_mocy_wzglednej(p_rezerwa_pu, s_n_przeksztaltnika_mva, s_bazowa_mva)
    ladowanie_pu = max(moc_pu(kw_na_mw(p_ladowania_max_kw), s_bazowa_mva) - rezerwa_pu, 0.0)
    rozladowanie_pu = max(moc_pu(kw_na_mw(p_rozladowania_max_kw), s_bazowa_mva) - rezerwa_pu, 0.0)
    return Zasobnik(
        pojemnosc_kwh=e_n_kwh,
        p_ladowania_max_pu=ladowanie_pu,
        p_rozladowania_max_pu=rozladowanie_pu,
        sprawnosc_ladowania=sprawnosc_ladowania,
        sprawnosc_rozladowania=sprawnosc_rozladowania,
        soc_min=soc_min,
        soc_max=soc_max,
        soc_poczatkowy=soc_poczatkowy,
        s_bazowa_mva=s_bazowa_mva,
    )


@dataclass(frozen=True)
class Magazyn:
    """Magazyn energii przylaczony do wezla — zasobnik + rdzen przeksztaltnika."""

    ident: str
    wezel: str
    rdzen: RdzenPrzeksztaltnika
    zasobnik: Zasobnik
    uklad: UkladStanow = field(compare=False)

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.uklad.nazwy

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Stan naladowania ma TWARDA granice — to trzeci stopien ochrony zakresu.

        Dwa pierwsze (okno zadania i ogranicznik nienawrotny pochodnej) dzialaja
        wewnatrz rownan; trzeci jest rzutowaniem w calkowaniu i to on gwarantuje
        DOKLADNOSC granicy: bez niego trapez moglby przestrzelic o `dt/2 * f`
        w kroku, w ktorym SOC dochodzi do konca zakresu. Stany przeksztaltnika
        granic nie potrzebuja (patrz jego wlasna deklaracja).
        """
        granice: list[tuple[float, float] | None] = list(self.rdzen.granice_stanow)
        granice.append((self.zasobnik.soc_min, self.zasobnik.soc_max))
        return tuple(granice)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Stan naladowania DRYFUJE w punkcie pracy — to fizyka, nie niespojnosc."""
        return (STAN_NALADOWANIA,)

    @property
    def _opis(self) -> str:
        return f"magazyn {self.ident}"

    def _okno(self, stan: np.ndarray) -> OknoMocy:
        return self.zasobnik.okno_dla_soc(float(stan[self.uklad.indeks(STAN_NALADOWANIA)]))

    def _pochodne_dual(
        self, stany: dict[str, Dual], napiecie: Zespolona, okno: OknoMocy
    ) -> list[Dual]:
        pochodne = self.rdzen.rownania(stany, napiecie, okno, self._opis)
        moc_czynna = self.rdzen.moc_czynna(stany, napiecie)
        pochodne[STAN_NALADOWANIA] = self.zasobnik.pochodna_naladowania(moc_czynna)
        return self.uklad.uporzadkuj(pochodne)

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        okno = self.zasobnik.okno_dla_soc(self.zasobnik.soc_poczatkowy)
        if not (self.zasobnik.soc_min <= self.zasobnik.soc_poczatkowy <= self.zasobnik.soc_max):
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{self._opis}: poczatkowy stan naladowania "
                f"{self.zasobnik.soc_poczatkowy} poza zakresem "
                f"[{self.zasobnik.soc_min}, {self.zasobnik.soc_max}]",
                urzadzenie=self.ident,
            )
        wartosci = self.rdzen.stany_rownowagi(napiecie_pu, moc_pu, okno, self._opis)
        wartosci[STAN_NALADOWANIA] = self.zasobnik.soc_poczatkowy
        return self.uklad.wektor(wartosci)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        pochodne = self._pochodne_dual(stany, napiecie, self._okno(stan))
        return np.array([wielkosc.wartosc for wielkosc in pochodne], dtype=float)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_stanach(self._pochodne_dual(stany, napiecie, self._okno(stan)))

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_napieciu(self._pochodne_dual(stany, napiecie, self._okno(stan)))

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        return self.rdzen.prad_siec(stany, napiecie).wartosc

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.uklad.blok_po_napieciu([prad.re, prad.im])

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.uklad.blok_po_stanach([prad.re, prad.im])

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        stany, _ = self.uklad.bez_gradientu(stan, 0j)
        return self.rdzen.napiecie_wewnetrzne(stany).wartosc

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        stany, _ = self.uklad.zaszczep(stan, 0j)
        napiecie = self.rdzen.napiecie_wewnetrzne(stany)
        return self.uklad.blok_po_stanach([napiecie.re, napiecie.im])


def zbuduj_magazyn(
    *, ident: str, wezel: str, rdzen: RdzenPrzeksztaltnika, zasobnik: Zasobnik
) -> Magazyn:
    """Zloz magazyn z rdzenia przeksztaltnika i zasobnika (stan SOC na koncu ukladu)."""
    return Magazyn(
        ident=ident,
        wezel=wezel,
        rdzen=rdzen,
        zasobnik=zasobnik,
        uklad=UkladStanow((*rdzen.uklad.nazwy, STAN_NALADOWANIA)),
    )


__all__ = [
    "SEKUND_W_GODZINIE",
    "STAN_NALADOWANIA",
    "Magazyn",
    "RdzenPrzeksztaltnika",
    "Zasobnik",
    "zbuduj_magazyn",
    "zbuduj_zasobnik",
]
