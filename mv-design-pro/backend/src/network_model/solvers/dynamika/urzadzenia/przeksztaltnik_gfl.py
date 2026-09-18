"""Przeksztaltnik grid-following (GFL): petla synchronizacji + zrodlo pradowe.

CZYM JEST GFL W MODELU RMS. Przeksztaltnik nadazny nie narzuca sieci napiecia —
synchronizuje sie z nim petla PLL i wstrzykuje PRAD o zadanych skladowych.
Dlatego jego sprzezenie z siecia to zrodlo PRADOWE (`jakobian_prad_napiecie`
niesie wylacznie wplyw regulacji przez modul napiecia, nie admitancje
wewnetrzna), w odroznieniu od maszyny i od GFM.

UKLAD ODNIESIENIA. `theta` jest katem PLL w tej samej konwencji, co kat wirnika
maszyny (`konwencje.dq_na_siec`): os q pokrywa sie z kierunkiem `theta`. Petla
sprowadza do zera skladowa `d` napiecia, wiec po zsynchronizowaniu napiecie lezy
na osi q. Wtedy `P = |V| i_czynny` i `Q = |V| i_bierny`, gdzie `i_czynny` jest
skladowa q pradu, a `i_bierny` skladowa d — stad nazwy stanow.

    eps = -V_d
    d(theta)/dt = omega_0 (kp*eps + x_pll)
    d(x_pll)/dt = ki*eps

STEROWANIE (kolejnosc, w ktorej licza to modele generyczne WECC REEC/REGC i
IEC 61400-27-1 dla typu 4):

1. Czestotliwosc z PLL -> martwa strefa -> statyzm P/f  => korekta zadania mocy.
2. Napiecie zaciskow -> martwa strefa wzgledem odniesienia -> statyzm Q/U
   => korekta zadania mocy biernej.
3. Zadania mocy dzielone przez napiecie daja zadania pradu.
4. Ponizej progu FRT dochodzi prad bierny wsparcia `k_frt (U_prog - U)`.
5. OGRANICZNIK PRADU z priorytetem skladowej Z KONTRAKTU (A-9: priorytet jest
   parametrem katalogowym, NIGDY wyborem w kodzie).
6. Czlony inercyjne `Tp` (skladowa czynna) i `Tiq` (skladowa bierna) prowadza
   prad rzeczywisty do zadania.

ODBUDOWA MOCY CZYNNEJ PO ZAPADZIE. `p_odbudowa_pu_na_s` ogranicza TEMPO wzrostu
mocy czynnej po ustapieniu zapadu (ogranicznik szybkosci na pochodnej skladowej
czynnej, przeliczony z mocy na prad przez biezace napiecie). `p_odbudowa_
opoznienie_s` opoznia ZWOLNIENIE tego ogranicznika: stan `odbudowa_zwolnienie_pu`
dazy do 1 po wyjsciu z zapadu i do 0 w zapadzie, z ta wlasnie stala czasowa.
Licznik czasu bezwzgledny bylby tu niemozliwy do uczciwego zapisania — protokol
`Urzadzenie` nie podaje czasu, a reset licznika jest zdarzeniem dyskretnym,
ktorego rdzen nie zna poza harmonogramem. Stala czasowa zwolnienia realizuje to
samo opoznienie bez wprowadzania do rdzenia pojecia, ktorego on nie ma.
Przy `p_odbudowa_opoznienie_s = 0` stanu nie ma, a zwolnienie jest natychmiastowe.

GRANICE PRACY CIAGLEJ. `u_min_ciagle_pu`/`u_max_ciagle_pu` wyznaczaja pasmo, w
ktorym dziala statyzm Q/U. Poza nim regulacja biernej przechodzi w tryb wsparcia
napiecia (ponizej: prad bierny FRT; powyzej: symetryczny prad bierny pobierany
o tym samym wzmocnieniu `k_frt`). To NIE jest wylaczenie przeksztaltnika —
odlaczenie jest zdarzeniem scenariusza (`OdlaczenieZrodla`), nie decyzja modelu.

ZERO DZIELENIA PRZEZ ZERO. Zadania pradu powstaja przez dzielenie mocy przez
modul napiecia. Dokladnie zerowe napiecie zaciskow konczy sie NAZWANA odmowa
(`modul_niezerowy`), a nie „bardzo duzym pradem": przy zerowym napieciu zrodlo o
zadanej mocy nie ma rozwiazania, dokladnie tak samo jak odbior o stalej mocy w
`kontrakty.OdbiorDynamiki`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from ..kontrakty import KOD_PUNKT_PRACY_POZA_OGRANICZENIEM, OdmowaDynamiki
from ..konwencje import (
    CWIERC_OBROTU_RAD,
    pulsacja_bazowa_rad_s,
    zmiana_bazy_mocy_wzglednej,
)
from .bazowe import modul_niezerowy
from .okno_mocy import OknoMocy
from .pochodne_kierunkowe import (
    Dual,
    Zespolona,
    kwadrat,
    maksimum,
    minimum,
    obrot,
    ogranicz,
    pierwiastek,
    strefa_martwa,
)
from .uklad_stanow import UkladStanow

STAN_KATA_PLL = "pll_kat_rad"
STAN_CALKI_PLL = "pll_calka_pu"
STAN_PRADU_CZYNNEGO = "i_czynny_pu"
STAN_PRADU_BIERNEGO = "i_bierny_pu"
STAN_ZADANIA_CZYNNEGO = "p_zadane_pu"
STAN_ZADANIA_BIERNEGO = "q_zadane_pu"
STAN_ODNIESIENIA_NAPIECIA = "u_odniesienia_pu"
STAN_ZWOLNIENIA_ODBUDOWY = "odbudowa_zwolnienie_pu"

#: Stany obecne w kazdej konfiguracji przeksztaltnika nadaznego.
STANY_GFL: tuple[str, ...] = (
    STAN_KATA_PLL,
    STAN_CALKI_PLL,
    STAN_PRADU_CZYNNEGO,
    STAN_PRADU_BIERNEGO,
    STAN_ZADANIA_CZYNNEGO,
    STAN_ZADANIA_BIERNEGO,
    STAN_ODNIESIENIA_NAPIECIA,
)


def ogranicz_prad(czynny: Dual, bierny: Dual, i_max_pu: float, priorytet: str) -> tuple[Dual, Dual]:
    """Ogranicznik pradu przeksztaltnika z priorytetem skladowej Z KONTRAKTU.

    Priorytet `"bierna"` zachowuje skladowa bierna (wsparcie napiecia) i obcina
    czynna do tego, co zostaje w kole `|I| <= i_max`; priorytet `"czynna"` robi
    to symetrycznie. Wybor NIE jest podejmowany tutaj — `priorytet` przychodzi z
    kontraktu katalogowego (A-9), a wartosc spoza zbioru jest bledem programu
    wolajacego, nie powodem do domyslki.
    """
    if priorytet == "bierna":
        pierwsza, druga = bierny, czynny
    elif priorytet == "czynna":
        pierwsza, druga = czynny, bierny
    else:
        raise AssertionError(
            f"Priorytet ogranicznika {priorytet!r} spoza zbioru kontraktu "
            "('bierna', 'czynna') — ogranicznik nie wybiera priorytetu sam"
        )
    zachowana = ogranicz(pierwsza, -i_max_pu, i_max_pu)
    zapas_kwadrat = i_max_pu * i_max_pu - kwadrat(zachowana).wartosc
    if zapas_kwadrat <= 0.0:
        podporzadkowana = Dual(0.0)
    else:
        zapas = pierwiastek(Dual(i_max_pu * i_max_pu) - kwadrat(zachowana))
        podporzadkowana = minimum(maksimum(druga, -zapas), zapas)
    if priorytet == "bierna":
        return podporzadkowana, zachowana
    return zachowana, podporzadkowana


@dataclass(frozen=True)
class RdzenGFL:
    """Regulacja przeksztaltnika nadaznego — parametry JUZ w bazie ukladu.

    Rdzen jest WSPOLNY dla trzech konsumentow: przeksztaltnika samodzielnego,
    magazynu (`magazyn.py`) i turbiny wiatrowej typu 3/4 (`turbina_wiatrowa.py`).
    Kontrakt ENM wprost sklada te urzadzenia z tego samego bloku, wiec trzy
    niezalezne kopie regulacji bylyby trzema miejscami na ten sam rozjazd.
    """

    i_max_pu: float
    priorytet_ogranicznika: str
    pll_kp: float
    pll_ki: float
    k_frt: float
    prog_frt_pu: float
    tp_s: float
    tiq_s: float
    p_odbudowa_pu_na_s: float
    p_odbudowa_opoznienie_s: float
    droop_p_f_pu: float
    martwa_strefa_f_hz: float
    droop_q_u_pu: float
    martwa_strefa_u_pu: float
    u_min_ciagle_pu: float
    u_max_ciagle_pu: float
    omega_bazowa_rad_s: float
    f_bazowa_hz: float
    uklad: UkladStanow = field(compare=False)

    @property
    def ma_zwolnienie_odbudowy(self) -> bool:
        return self.p_odbudowa_opoznienie_s > 0.0

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Zaden stan rdzenia nadaznego nie potrzebuje rzutowania (uzasadnienie w
        `PrzeksztaltnikGFL.granice_stanow`). Deklaracja zyje TUTAJ, zeby magazyn i
        turbina skladaly swoje granice z rdzenia, a nie z wlasnej kopii wiedzy."""
        return tuple(None for _ in self.uklad.nazwy)

    # -- wielkosci posrednie ---------------------------------------------

    def czestotliwosc_pll(self, stany: dict[str, Dual], napiecie: Zespolona) -> Dual:
        """Odchylka pulsacji z PLL: `kp*eps + x_pll`, gdzie `eps = -V_d`."""
        napiecie_dq = napiecie * obrot(stany[STAN_KATA_PLL] - CWIERC_OBROTU_RAD).sprzezenie()
        uchyb = -napiecie_dq.re
        return uchyb * self.pll_kp + stany[STAN_CALKI_PLL]

    def glebokosc_zapadu(self, modul_napiecia: Dual) -> Dual:
        """Udzial zapadu `(U_prog - U)/U_prog` obciety do [0, 1] — CIAGLY.

        Zero powyzej progu FRT, jeden przy napieciu zerowym. Sluzy zwolnieniu
        ogranicznika tempa odbudowy mocy czynnej. Skala jest wzieta z SAMEGO
        progu, wiec nie ma tu ani jednej dobranej liczby.

        DLACZEGO NIE SYGNAL DWUSTANOWY. Skok sygnalu „w zapadzie / poza zapadem"
        wprowadzalby do pochodnej stanu zwolnienia skok o `1/T_op`, czyli do
        residuum kroku skok o `dt/(2 T_op)`. Metoda niejawna gubi wtedy
        rozwiazanie rownania kroku dokladnie w chwili ustapienia zapadu (pomiar
        przed poprawka: bieg z przeksztaltnikiem padal przy usunieciu zwarcia,
        residuum 3,9e-03 na `odbudowa_zwolnienie_pu`, zaden nawrot go nie obnizyl).
        """
        return ogranicz((self.prog_frt_pu - modul_napiecia) / self.prog_frt_pu, 0.0, 1.0)

    def wsparcie_napieciowe(self, modul_napiecia: Dual) -> Dual:
        """Prad bierny wsparcia napiecia poza pasmem pracy ciaglej (FRT / HVRT).

        Funkcja jest CIAGLA: oba czlony zerują sie dokladnie na swoim progu, wiec
        wejscie w tryb wsparcia i wyjscie z niego nie daja skoku zadania.

        Ta sama funkcja liczy wsparcie w biegu i przy odczycie nastawy z punktu
        pracy (`stany_rownowagi`), wiec rownowaga poczatkowa nie moze rozminac sie
        z tym, co model policzy w chwili `t = 0`.
        """
        if modul_napiecia.wartosc < self.prog_frt_pu:
            return (self.prog_frt_pu - modul_napiecia) * self.k_frt
        if modul_napiecia.wartosc > self.u_max_ciagle_pu:
            return (self.u_max_ciagle_pu - modul_napiecia) * self.k_frt
        return Dual(0.0)

    def korekta_statyzmu_biernego(self, modul_napiecia: Dual, odniesienie: Dual) -> Dual:
        """Korekta mocy biernej ze statyzmu Q/U — CIAGLA i ograniczona pasmem pracy.

        Napiecie wchodzace do statyzmu jest sprowadzone do pasma pracy ciaglej
        `[u_min, u_max]`: poza pasmem statyzm NASYCA sie zamiast rosnac dalej, a
        rolę regulacji przejmuje prad wsparcia. Bramkowanie statyzmu warunkiem
        „czy jestesmy w pasmie" dawaloby SKOK zadania o cala wartosc statyzmu na
        krawedzi pasma (pomiar przed poprawka: 2,8 pu skoku przy progu FRT 0,9 pu
        i odniesieniu 1,05 pu — bieg padal przy usunieciu zwarcia, residuum
        1,6e-02 na `i_bierny_pu`). Nasycenie daje TE SAMA granice dzialania
        statyzmu bez skoku.
        """
        if self.droop_q_u_pu <= 0.0:
            return Dual(0.0)
        napiecie_w_pasmie = ogranicz(modul_napiecia, self.u_min_ciagle_pu, self.u_max_ciagle_pu)
        odchylka = strefa_martwa(napiecie_w_pasmie - odniesienie, self.martwa_strefa_u_pu)
        return -odchylka / self.droop_q_u_pu

    def zadania_pradu(
        self, stany: dict[str, Dual], napiecie: Zespolona, okno: OknoMocy, opis: str
    ) -> tuple[Dual, Dual, Dual]:
        """(zadanie skladowej czynnej, zadanie skladowej biernej, modul napiecia)."""
        modul = modul_niezerowy(napiecie, opis)
        odchylka_pulsacji = self.czestotliwosc_pll(stany, napiecie)

        zadanie_czynne = stany[STAN_ZADANIA_CZYNNEGO]
        if self.droop_p_f_pu > 0.0:
            odchylka_hz = strefa_martwa(
                odchylka_pulsacji * self.f_bazowa_hz, self.martwa_strefa_f_hz
            )
            zadanie_czynne = zadanie_czynne - odchylka_hz / (self.f_bazowa_hz * self.droop_p_f_pu)
        zadanie_czynne = okno.ogranicz(zadanie_czynne)

        zadanie_bierne = stany[STAN_ZADANIA_BIERNEGO] + self.korekta_statyzmu_biernego(
            modul, stany[STAN_ODNIESIENIA_NAPIECIA]
        )
        wsparcie = self.wsparcie_napieciowe(modul)

        return zadanie_czynne / modul, zadanie_bierne / modul + wsparcie, modul

    def prady_zadane(
        self, stany: dict[str, Dual], napiecie: Zespolona, okno: OknoMocy, opis: str
    ) -> tuple[Dual, Dual, Dual]:
        """Zadania pradu PO ograniczniku oraz modul napiecia zaciskow."""
        czynne, bierne, modul = self.zadania_pradu(stany, napiecie, okno, opis)
        po_ograniczeniu = ogranicz_prad(czynne, bierne, self.i_max_pu, self.priorytet_ogranicznika)
        return po_ograniczeniu[0], po_ograniczeniu[1], modul

    def prad_dq(self, stany: dict[str, Dual]) -> Zespolona:
        """Prad wstrzykiwany w ukladzie PLL: skladowa d = bierna, q = czynna."""
        return Zespolona(stany[STAN_PRADU_BIERNEGO], stany[STAN_PRADU_CZYNNEGO])

    def prad_siec(self, stany: dict[str, Dual], napiecie: Zespolona) -> Zespolona:
        """Prad wstrzykiwany do wezla. ZALEZY WYLACZNIE OD STANOW — to zrodlo pradowe.

        `napiecie` jest w podpisie, zeby rdzenie GFL i GFM mialy TEN SAM kontrakt
        (magazyn i turbina wiatrowa uzywaja ich wymiennie). Nieuzycie argumentu
        JEST tresc fizyczna: blok `jakobian_prad_napiecie` wychodzi wtedy zerowy
        sam z siebie, bez osobnej galezi „bo to zrodlo pradowe", ktora mozna by
        rozjechac z funkcja.
        """
        del napiecie
        return self.prad_dq(stany) * obrot(stany[STAN_KATA_PLL] - CWIERC_OBROTU_RAD)

    def moc_czynna(self, stany: dict[str, Dual], napiecie: Zespolona) -> Dual:
        prad = self.prad_siec(stany, napiecie)
        return napiecie.re * prad.re + napiecie.im * prad.im

    def napiecie_wewnetrzne(self, stany: dict[str, Dual]) -> Zespolona:
        """`U_odn * exp(j theta_PLL)` — wlasne odniesienie napieciowe przeksztaltnika."""
        return Zespolona(stany[STAN_ODNIESIENIA_NAPIECIA], Dual(0.0)) * obrot(stany[STAN_KATA_PLL])

    # -- rownania ruchu ---------------------------------------------------

    def rownania(
        self, stany: dict[str, Dual], napiecie: Zespolona, okno: OknoMocy, opis: str
    ) -> dict[str, Dual]:
        napiecie_dq = napiecie * obrot(stany[STAN_KATA_PLL] - CWIERC_OBROTU_RAD).sprzezenie()
        uchyb_pll = -napiecie_dq.re
        odchylka_pulsacji = uchyb_pll * self.pll_kp + stany[STAN_CALKI_PLL]

        zadanie_czynne, zadanie_bierne, modul = self.prady_zadane(stany, napiecie, okno, opis)

        pochodna_czynnej = (zadanie_czynne - stany[STAN_PRADU_CZYNNEGO]) / self.tp_s
        zwolnienie = stany[STAN_ZWOLNIENIA_ODBUDOWY] if self.ma_zwolnienie_odbudowy else Dual(1.0)
        tempo = zwolnienie * self.p_odbudowa_pu_na_s / modul
        pochodna_czynnej = minimum(pochodna_czynnej, tempo)

        pochodne: dict[str, Dual] = {
            STAN_KATA_PLL: odchylka_pulsacji * self.omega_bazowa_rad_s,
            STAN_CALKI_PLL: uchyb_pll * self.pll_ki,
            STAN_PRADU_CZYNNEGO: pochodna_czynnej,
            STAN_PRADU_BIERNEGO: (zadanie_bierne - stany[STAN_PRADU_BIERNEGO]) / self.tiq_s,
            STAN_ZADANIA_CZYNNEGO: Dual(0.0),
            STAN_ZADANIA_BIERNEGO: Dual(0.0),
            STAN_ODNIESIENIA_NAPIECIA: Dual(0.0),
        }
        if self.ma_zwolnienie_odbudowy:
            cel = 1.0 - self.glebokosc_zapadu(modul)
            pochodne[STAN_ZWOLNIENIA_ODBUDOWY] = (
                cel - stany[STAN_ZWOLNIENIA_ODBUDOWY]
            ) / self.p_odbudowa_opoznienie_s
        return pochodne

    # -- rownowaga --------------------------------------------------------

    def stany_rownowagi(
        self, napiecie_pu: complex, moc_pu: complex, okno: OknoMocy, opis: str
    ) -> dict[str, float]:
        """Stany rownowagi z punktu pracy — KAZDA pochodna zeruje sie analitycznie.

        Odniesienia (`p_zadane`, `q_zadane`, `u_odniesienia`) sa DOBIERANE tak,
        zeby punkt pracy byl rownowaga: zadanie mocy biernej jest pomniejszone o
        prad wsparcia napieciowego, jesli punkt pracy juz w nim siedzi. To nie
        jest korekta wyniku — to odczytanie NASTAWY regulatora z pomierzonego
        stanu, dokladnie tak samo, jak `Vref` maszyny z `Efd`.
        """
        modul = abs(napiecie_pu)
        if modul <= 0.0:
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{opis}: zerowe napiecie punktu pracy nie wyznacza zadania pradu",
            )
        prad_czynny = moc_pu.real / modul
        prad_bierny = moc_pu.imag / modul
        if math.hypot(prad_czynny, prad_bierny) > self.i_max_pu:
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{opis}: punkt pracy wymaga pradu "
                f"{math.hypot(prad_czynny, prad_bierny)} pu ponad ogranicznik "
                f"{self.i_max_pu} pu — rownowaga nie istnieje",
                i_pu=math.hypot(prad_czynny, prad_bierny),
                i_max_pu=self.i_max_pu,
            )
        if not okno.zawiera(moc_pu.real):
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{opis}: moc czynna punktu pracy {moc_pu.real} pu poza oknem "
                f"[{okno.dol_pu}, {okno.gora_pu}] pu",
                p_pu=moc_pu.real,
                dol_pu=okno.dol_pu,
                gora_pu=okno.gora_pu,
            )
        wsparcie = self.wsparcie_napieciowe(Dual(modul)).wartosc
        wartosci = {
            STAN_KATA_PLL: math.atan2(napiecie_pu.imag, napiecie_pu.real),
            STAN_CALKI_PLL: 0.0,
            STAN_PRADU_CZYNNEGO: prad_czynny,
            STAN_PRADU_BIERNEGO: prad_bierny,
            STAN_ZADANIA_CZYNNEGO: moc_pu.real,
            STAN_ZADANIA_BIERNEGO: (prad_bierny - wsparcie) * modul,
            STAN_ODNIESIENIA_NAPIECIA: modul,
        }
        if self.ma_zwolnienie_odbudowy:
            wartosci[STAN_ZWOLNIENIA_ODBUDOWY] = 1.0 - self.glebokosc_zapadu(Dual(modul)).wartosc
        return wartosci


def _uklad_stanow_gfl(ma_zwolnienie: bool) -> UkladStanow:
    nazwy = list(STANY_GFL)
    if ma_zwolnienie:
        nazwy.append(STAN_ZWOLNIENIA_ODBUDOWY)
    return UkladStanow(tuple(nazwy))


def zbuduj_rdzen_gfl(
    *,
    s_n_mva: float,
    i_max_pu: float,
    priorytet_ogranicznika: str,
    pll_kp: float,
    pll_ki: float,
    k_frt: float,
    prog_frt_pu: float,
    tp_s: float,
    tiq_s: float,
    p_odbudowa_pu_na_s: float,
    p_odbudowa_opoznienie_s: float,
    droop_p_f_pu: float,
    martwa_strefa_f_hz: float,
    droop_q_u_pu: float,
    martwa_strefa_u_pu: float,
    u_min_ciagle_pu: float,
    u_max_ciagle_pu: float,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> RdzenGFL:
    """Zbuduj rdzen GFL, przeliczajac wielkosci PRADOWE i MOCOWE na baze ukladu.

    Przeliczaja sie: `i_max_pu` i `p_odbudowa_pu_na_s` (wielkosci mocy/pradu,
    mnoznik `S_urz/S_uklad`) oraz `k_frt` (wzmocnienie prad na napiecie).
    NIE przeliczaja sie: statyzmy (`droop_p_f_pu`, `droop_q_u_pu` sa zdefiniowane
    jako stosunki wzgledne w bazie urzadzenia i wchodza do zadania mocy, ktore
    juz jest w bazie urzadzenia — dlatego przeliczany jest WYNIK dzialania
    statyzmu, a nie sam statyzm), progi napieciowe i stale czasowe.
    """
    return RdzenGFL(
        i_max_pu=zmiana_bazy_mocy_wzglednej(i_max_pu, s_n_mva, s_bazowa_mva),
        priorytet_ogranicznika=priorytet_ogranicznika,
        pll_kp=pll_kp,
        pll_ki=pll_ki,
        k_frt=zmiana_bazy_mocy_wzglednej(k_frt, s_n_mva, s_bazowa_mva),
        prog_frt_pu=prog_frt_pu,
        tp_s=tp_s,
        tiq_s=tiq_s,
        p_odbudowa_pu_na_s=zmiana_bazy_mocy_wzglednej(p_odbudowa_pu_na_s, s_n_mva, s_bazowa_mva),
        p_odbudowa_opoznienie_s=p_odbudowa_opoznienie_s,
        droop_p_f_pu=droop_p_f_pu,
        martwa_strefa_f_hz=martwa_strefa_f_hz,
        droop_q_u_pu=droop_q_u_pu,
        martwa_strefa_u_pu=martwa_strefa_u_pu,
        u_min_ciagle_pu=u_min_ciagle_pu,
        u_max_ciagle_pu=u_max_ciagle_pu,
        omega_bazowa_rad_s=pulsacja_bazowa_rad_s(f_bazowa_hz),
        f_bazowa_hz=f_bazowa_hz,
        uklad=_uklad_stanow_gfl(p_odbudowa_opoznienie_s > 0.0),
    )


@dataclass(frozen=True)
class PrzeksztaltnikGFL:
    """Samodzielny przeksztaltnik nadazny przylaczony do wezla sieci."""

    ident: str
    wezel: str
    rdzen: RdzenGFL
    okno_mocy: OknoMocy

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.rdzen.uklad.nazwy

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Zaden stan nadaznego nie potrzebuje rzutowania — i to jest WYNIK, nie brak.

        Skladowe pradu sa czlonami inercyjnymi ZADAN, ktore ogranicznik sprowadza
        do kola `|I| <= i_max` PRZED calkowaniem. Czlon inercyjny daje srednia
        wazona przeszlych wejsc, a kolo jest zbiorem WYPUKLYM, wiec prad
        rzeczywisty nie moze z niego wyjsc — ograniczenie jest dotrzymane z
        konstrukcji, bez ani jednego rzutowania. Stan zwolnienia odbudowy jest
        czlonem inercyjnym sygnalu dwustanowego, wiec z tego samego powodu lezy
        w [0, 1]. Stany odniesien maja zerowa pochodna.
        """
        return tuple(None for _ in self.nazwy_stanow)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Kazdy stan przeksztaltnika nadaznego MUSI byc rownowaga w punkcie pracy."""
        return ()

    @property
    def _opis(self) -> str:
        return f"przeksztaltnik nadazny {self.ident}"

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        return self.rdzen.uklad.wektor(
            self.rdzen.stany_rownowagi(napiecie_pu, moc_pu, self.okno_mocy, self._opis)
        )

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.rdzen.uklad.bez_gradientu(stan, napiecie_pu)
        pochodne = self.rdzen.uklad.uporzadkuj(
            self.rdzen.rownania(stany, napiecie, self.okno_mocy, self._opis)
        )
        return np.array([wielkosc.wartosc for wielkosc in pochodne], dtype=float)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.rdzen.uklad.zaszczep(stan, napiecie_pu)
        return self.rdzen.uklad.blok_po_stanach(
            self.rdzen.uklad.uporzadkuj(
                self.rdzen.rownania(stany, napiecie, self.okno_mocy, self._opis)
            )
        )

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.rdzen.uklad.zaszczep(stan, napiecie_pu)
        return self.rdzen.uklad.blok_po_napieciu(
            self.rdzen.uklad.uporzadkuj(
                self.rdzen.rownania(stany, napiecie, self.okno_mocy, self._opis)
            )
        )

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        stany, napiecie = self.rdzen.uklad.bez_gradientu(stan, napiecie_pu)
        return self.rdzen.prad_siec(stany, napiecie).wartosc

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """Wychodzi ZEROWY, bo prad zrodla pradowego nie zalezy od napiecia wezla.

        Nie jest to jednak zero WPISANE: powstaje z tego samego przebiegu obliczen,
        co `prad_pu`, wiec gdyby regulacja kiedykolwiek wprowadzila zaleznosc od
        napiecia, jakobian zmieni sie razem z funkcja, a nie zostanie w tyle.
        """
        stany, napiecie = self.rdzen.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.rdzen.uklad.blok_po_napieciu([prad.re, prad.im])

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.rdzen.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.rdzen.uklad.blok_po_stanach([prad.re, prad.im])

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        """Napiecie WLASNEGO odniesienia przeksztaltnika: `U_odn * exp(j theta_PLL)`.

        DLACZEGO NIE ZERO. `UrzadzenieOdlaczone` (zdarzenie `OdlaczenieZrodla`)
        liczy pochodne wlasnie przy tym napieciu. Przy zerze modul napiecia nie
        mialby pochodnej (odmowa `dynamika.wartosc_nieskonczona`), a caly tor
        regulacji dzieli przez ten modul — odlaczenie przeksztaltnika wywalaloby
        bieg zamiast go prowadzic.

        Przy napieciu WLASNEGO odniesienia model jest dokladnie w rownowadze:
        skladowa `d` napiecia w ukladzie PLL jest zerowa (kat jest stanem), wiec
        petla stoi; modul rowna sie odniesieniu, wiec statyzm Q/U daje zero;
        zadanie pradu czynnego rowna sie stanowi, wiec czlon inercyjny stoi. Stany
        odlaczonego przeksztaltnika ZAMARZAJA — dokladnie, nie w przyblizeniu — co
        jest fizycznie poprawnym opisem zablokowanego falownika bez sieci.
        """
        stany, _ = self.rdzen.uklad.bez_gradientu(stan, 0j)
        return self.rdzen.napiecie_wewnetrzne(stany).wartosc

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        stany, _ = self.rdzen.uklad.zaszczep(stan, 0j)
        napiecie = self.rdzen.napiecie_wewnetrzne(stany)
        return self.rdzen.uklad.blok_po_stanach([napiecie.re, napiecie.im])


def zbuduj_przeksztaltnik_gfl(
    *, ident: str, wezel: str, rdzen: RdzenGFL, okno_mocy: OknoMocy
) -> PrzeksztaltnikGFL:
    return PrzeksztaltnikGFL(ident=ident, wezel=wezel, rdzen=rdzen, okno_mocy=okno_mocy)


__all__ = [
    "STANY_GFL",
    "STAN_CALKI_PLL",
    "STAN_KATA_PLL",
    "STAN_ODNIESIENIA_NAPIECIA",
    "STAN_PRADU_BIERNEGO",
    "STAN_PRADU_CZYNNEGO",
    "STAN_ZADANIA_BIERNEGO",
    "STAN_ZADANIA_CZYNNEGO",
    "STAN_ZWOLNIENIA_ODBUDOWY",
    "PrzeksztaltnikGFL",
    "RdzenGFL",
    "ogranicz_prad",
    "zbuduj_przeksztaltnik_gfl",
    "zbuduj_rdzen_gfl",
]
