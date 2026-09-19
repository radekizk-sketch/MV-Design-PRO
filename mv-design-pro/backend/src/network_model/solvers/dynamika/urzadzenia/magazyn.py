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

ZAKRES SOC JEST ZAKRESEM WAZNOSCI, NIE OGRANICZNIKIEM. `[SOC_min, SOC_max]`
opisuje, dla jakich stanow napisano rownania — a nie czlon modelu, ktory cokolwiek
zatrzymuje. Wyjscie poza ten zakres konczy bieg odmowa
`dynamika.zakres_waznosci_przekroczony` (`zakresy_waznosci`), bo od tej chwili
przeksztaltnik oddawalby moc, ktorej zrodla w modelu nie ma. Okno mocy zasobnika
NIE zalezy od stanu naladowania; dlaczego — patrz `Zasobnik.okno_mocy` (skokowe
zamykanie okna odbiera rownaniu kroku rozwiazanie).

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

    def okno_mocy(self) -> OknoMocy:
        """Okno mocy z granic ladowania i rozladowania kontraktu.

        OKNO NIE ZALEZY OD STANU NALADOWANIA — i to jest decyzja mierzona, nie
        przeoczenie. Zamykanie okna przy dojsciu SOC do konca zakresu jest
        funkcja SKOKOWA stanu, a wiec wprowadza do residuum kroku skok o cala
        szerokosc okna (pomiar: bieg magazynu padal w chwili dojscia SOC do
        granicy — residuum 6,8e-05 na `i_czynny_pu` nie malalo ani po 60
        iteracjach, ani po dwukrotnym skroceniu kroku). Zamkniecie okna nie jest
        wiec droga do dotrzymania zakresu; zakres jest ZAKRESEM WAZNOSCI i konczy
        sie odmowa (`Magazyn.zakresy_waznosci`), a nie cichym przycieciem.

        CZEGO TEN MODEL NIE OBEJMUJE, powiedziane wprost: odciecia mocy przez
        uklad zarzadzania bateria po dojsciu do konca zakresu. To jest funkcja
        DZIEDZINY WOLNEJ (godziny pracy zasobu), a nie dynamiki RMS o horyzoncie
        sekund; magazyn dochodzacy do granicy SOC w ciagu przebiegu oznacza, ze
        zalozenia badania leza poza zakresem waznosci tego modelu — i wtedy bieg
        konczy sie odmowa, a nie przebiegiem (patrz `Magazyn.zakresy_waznosci`).
        """
        return OknoMocy(dol_pu=-self.p_ladowania_max_pu, gora_pu=self.p_rozladowania_max_pu)

    def pochodna_naladowania(self, moc_czynna_pu: Dual) -> Dual:
        """`d(SOC)/dt` — calka mocy stalopradowej, BEZ wyjatku na koncach zakresu.

        Zerowanie pochodnej na granicy zakresu byloby ogranicznikiem NIECIAGLYM
        w rownaniu, czyli dokladnie tym, co odbiera rownaniu kroku rozwiazanie
        (patrz `regulatory.NIENAWROTNOSC_JEST_W_CALKOWANIU`) — i do tego
        UDAWALOBY, ze model wie, co robi bateria po opróznieniu. Prawo calkowania
        obowiazuje w calym zakresie waznosci bez wyjatkow, a jego koniec melduje
        odmowa (`Magazyn.zakresy_waznosci`).
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
        """Magazyn nie ma ANI JEDNEGO ogranicznika stanu — zakres SOC to co innego.

        Stan naladowania byl tu zadeklarowany jako twarda granica i to bylo
        POMYLENIE DWOCH ROZNYCH RZECZY (pelne wyprowadzenie:
        `kontrakty.Urzadzenie.zakresy_waznosci`). Ogranicznik jest czlonem modelu,
        a stan sprowadzony na granice CZYTAJA pozostale rownania — `Efd` czyta
        strumien maszyny, kat lopat czyta moc aerodynamiczna. Stanu naladowania
        NIE CZYTA nic: przeksztaltnik pracuje tak samo przy SOC 0,55 i przy
        SOC 0,10. Rzutowanie zamrazalo wiec jedna liczbe i zostawialo reszte modelu
        w biegu — magazyn oddawal moc z pustych ogniw, a przebieg wygladal
        zwyczajnie (pomiar w `zakresy_waznosci` ponizej).

        Zakres SOC jest ZAKRESEM WAZNOSCI i jest egzekwowany odmowa — patrz
        `zakresy_waznosci`. Stany przeksztaltnika granic nie potrzebuja (patrz jego
        wlasna deklaracja).
        """
        return self.rdzen.granice_stanow + (None,)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Stan naladowania jest wazny TYLKO w `[SOC_min, SOC_max]` — poza nim nie
        ma rownan.

        POMIAR, ktory to rozstrzygnal (magazyn 20 MWh, rozladowanie 24 MW, start
        SOC = 0,1001 przy SOC_min = 0,10, horyzont 2 s). Przy rzutowaniu stanu bieg
        konczyl sie normalnie, z kompletem probek i statusem poprawnym, a bilans
        energii rozjezdzal sie tak: z ogniw mialo ubyc 14,337 kWh, ubylo 2,000 kWh
        — 12,337 kWh oddane do sieci ZNIKAD (86 % bilansu przebiegu). Symetrycznie
        przy SOC_max: 10,667 kWh pochlonietych przez bateria, ktora juz jest pelna.
        Zaden kanal wyniku tego nie pokazywal.

        CZEGO TEN MODEL NIE OBEJMUJE, powiedziane wprost: odciecia mocy przez uklad
        zarzadzania bateria po dojsciu do konca zakresu. To jest funkcja DZIEDZINY
        WOLNEJ (godziny pracy zasobu), a nie dynamiki RMS o horyzoncie sekund.
        Magazyn dochodzacy do granicy SOC w ciagu przebiegu oznacza, ze zalozenia
        badania leza poza zakresem waznosci tego modelu — i wlasnie to melduje
        odmowa, zamiast podawac przebieg, ktorego nikt nie policzyl.
        """
        return self.rdzen.zakresy_waznosci + ((self.zasobnik.soc_min, self.zasobnik.soc_max),)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Stan naladowania DRYFUJE w punkcie pracy — to fizyka, nie niespojnosc."""
        return (STAN_NALADOWANIA,)

    @property
    def _opis(self) -> str:
        return f"magazyn {self.ident}"

    def _pochodne_dual(
        self, stany: dict[str, Dual], napiecie: Zespolona, okno: OknoMocy
    ) -> list[Dual]:
        pochodne = self.rdzen.rownania(stany, napiecie, okno, self._opis)
        moc_czynna = self.rdzen.moc_czynna(stany, napiecie)
        pochodne[STAN_NALADOWANIA] = self.zasobnik.pochodna_naladowania(moc_czynna)
        return self.uklad.uporzadkuj(pochodne)

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        okno = self.zasobnik.okno_mocy()
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
        pochodne = self._pochodne_dual(stany, napiecie, self.zasobnik.okno_mocy())
        return np.array([wielkosc.wartosc for wielkosc in pochodne], dtype=float)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_stanach(
            self._pochodne_dual(stany, napiecie, self.zasobnik.okno_mocy())
        )

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_napieciu(
            self._pochodne_dual(stany, napiecie, self.zasobnik.okno_mocy())
        )

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
