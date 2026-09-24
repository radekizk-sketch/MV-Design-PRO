"""Przeksztaltnik grid-forming (GFM): statyzm albo maszyna wirtualna za impedancja.

CZYM JEST GFM W MODELU RMS. Przeksztaltnik tworzacy siec NARZUCA napiecie: jest
zrodlem napieciowym `E exp(j delta)` za IMPEDANCJA WIRTUALNA `Z_w = R_w + j X_w`,
dokladnie tak, jak maszyna synchroniczna za reaktancja przejsciowa. Dlatego jego
prad zalezy od napiecia wezla (`jakobian_prad_napiecie` jest blokiem mnozenia
przez `-1/Z_w`), inaczej niz w przeksztaltniku nadaznym.

Impedancja wirtualna JEST wymagana: zrodlo napieciowe o zerowej impedancji nie ma
skonczonej admitancji, a bez niej uklad wezlowy nie ma rozwiazania. Zerowe
`R_w` i `X_w` konczy sie odmowa `dynamika.parametry_urzadzenia_sprzeczne`.

DWA TRYBY Z KONTRAKTU (`tryb`), oba parametryzowane w calosci:

* **`droop`** — czestotliwosc wprost ze statyzmu mocy czynnej:

      omega = 1 - mp (P_f - P_zad),    d(delta)/dt = omega_0 (omega - 1)

  Predkosc jest tu wielkoscia ALGEBRAICZNA, wiec w tym trybie NIE MA stanu
  `omega_pu`. Stan o wartosci wyznaczonej algebraicznie z innego stanu byloby
  duplikatem informacji, a nie stopniem swobody.

* **`vsm`** — maszyna wirtualna: rownanie ruchu z wirtualna bezwladnoscia i
  wirtualnym tlumieniem, ze statyzmem na ZADANIU mocy (klasyczny synchronwerter
  z regulacja pierwotna):

      2 H_w d(omega)/dt = P_zad - (omega - 1)/mp - P_f - D_w (omega - 1)

  `H_w = 0` w tym trybie jest sprzecznoscia (rownanie ruchu bez masy), wiec konczy
  sie odmowa — nie cichym przejsciem na statyzm.

REGULACJA NAPIECIA. Modul SEM powstaje ze statyzmu mocy biernej wzgledem
odniesienia: `E = U_odn - mq (Q_f - Q_zad)`. Dynamike wnosi filtr mocy biernej o
stalej `Tiq` (a filtr mocy czynnej — `Tp`), wiec kazda stala czasowa kontraktu
ma dokladnie jedno miejsce.

OGRANICZENIE PRADU — DWIE STRATEGIE Z KONTRAKTU, obie BEZ ani jednej dobranej
liczby (`strategia_ograniczenia`):

* **`impedancja_wirtualna`** — impedancja jest SKALOWANA `Z_eff = s Z_w` przez
  najmniejsze `s >= 1`, przy ktorym `|I| = i_max`. Kierunek pradu zostaje bez
  zmian (skalowanie jest rzeczywiste), przeksztaltnik pozostaje zrodlem
  napieciowym o wiekszej impedancji — to jest kanoniczne „current-limiting
  virtual impedance".
* **`nasycenie_zadania`** — nasycany jest MODUL ZADANIA SEM: modul jest sciagany
  ku rzutowi `V` na kierunek kata (punkt najmniejszego pradu na tym kierunku) w
  stosunku `i_max |Z_w| / |E - V|`, a gdy sama skladowa prostopadla przekracza
  ogranicznik, prad jest dodatkowo obcinany co do modulu. Kierunek pradu ZMIENIA
  sie (inaczej niz wyzej), bo zmienia sie wierzcholek trojkata napiec — i o to
  wlasnie chodzi: to sa dwa rozne mechanizmy, nie dwie nazwy jednego. Szczegolowe
  uzasadnienie, dlaczego NIE jest to dokladne rozwiazanie `|I| = i_max` (pionowa
  styczna i rezim bez rozwiazania), stoi przy samym wzorze w `prad_siec`.

BAZY. `i_max`, `H_w` i `D_w` przeliczaja sie jak moc (mnoznik `S_urz/S_uklad`),
statyzmy `mp`/`mq` i impedancja wirtualna — jak impedancja (mnoznik odwrotny).
"""

from __future__ import annotations

import cmath
from dataclasses import dataclass, field
from typing import ClassVar

import numpy as np

from ..kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    OdmowaDynamiki,
    SprzezenieUrzadzenia,
)
from ..konwencje import (
    pulsacja_bazowa_rad_s,
    zmiana_bazy_impedancji,
    zmiana_bazy_mocy_wzglednej,
)
from .bazowe import parametry_bloku
from .okno_mocy import OknoMocy
from .pochodne_kierunkowe import (
    Dual,
    Zespolona,
    kwadrat,
    obrot,
    pierwiastek,
)
from .uklad_stanow import UkladStanow

STAN_KATA = "kat_rad"
STAN_PREDKOSCI = "omega_pu"
STAN_FILTRU_CZYNNEJ = "p_filtr_pu"
STAN_FILTRU_BIERNEJ = "q_filtr_pu"
STAN_ZADANIA_CZYNNEGO = "p_zadane_pu"
STAN_ZADANIA_BIERNEGO = "q_zadane_pu"
STAN_ODNIESIENIA_NAPIECIA = "u_odniesienia_pu"

#: Tryby pracy przeksztaltnika tworzacego siec — wprost z kontraktu ENM.
TRYB_STATYZM = "droop"
TRYB_MASZYNA_WIRTUALNA = "vsm"
TRYBY_GFM: tuple[str, ...] = (TRYB_STATYZM, TRYB_MASZYNA_WIRTUALNA)

#: Strategie ograniczenia pradu — wprost z kontraktu ENM.
STRATEGIA_IMPEDANCJA = "impedancja_wirtualna"
STRATEGIA_NASYCENIE = "nasycenie_zadania"
STRATEGIE_GFM: tuple[str, ...] = (STRATEGIA_IMPEDANCJA, STRATEGIA_NASYCENIE)


@dataclass(frozen=True)
class RdzenGFM:
    """Regulacja przeksztaltnika tworzacego siec — parametry JUZ w bazie ukladu.

    Rdzen jest wspolny dla przeksztaltnika samodzielnego i dla magazynu (kontrakt
    ENM dopuszcza GFM jako przeksztaltnik magazynu), wiec regulacja zyje w jednym
    miejscu, a nie w dwoch kopiach.
    """

    tryb: str
    mp_pu: float
    mq_pu: float
    h_wirtualne_s: float
    d_wirtualne_pu: float
    r_wirtualne_pu: float
    x_wirtualne_pu: float
    i_max_pu: float
    strategia_ograniczenia: str
    tp_s: float
    tiq_s: float
    omega_bazowa_rad_s: float
    uklad: UkladStanow = field(compare=False)

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = (
        (
            "uklad",
            "uklad stanow rdzenia jest WYPROWADZONY z jego nastaw (np. opoznienie "
            "odbudowy dodaje stan); nazwy wchodza do odcisku jako `nazwy_stanow` urzadzenia",
        ),
    )

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Komplet parametrow do odcisku migawki — jawnie, pole po polu."""
        return {
            "tryb": self.tryb,
            "mp_pu": self.mp_pu,
            "mq_pu": self.mq_pu,
            "h_wirtualne_s": self.h_wirtualne_s,
            "d_wirtualne_pu": self.d_wirtualne_pu,
            "r_wirtualne_pu": self.r_wirtualne_pu,
            "x_wirtualne_pu": self.x_wirtualne_pu,
            "i_max_pu": self.i_max_pu,
            "strategia_ograniczenia": self.strategia_ograniczenia,
            "tp_s": self.tp_s,
            "tiq_s": self.tiq_s,
            "omega_bazowa_rad_s": self.omega_bazowa_rad_s,
        }

    @property
    def ma_bezwladnosc(self) -> bool:
        return self.tryb == TRYB_MASZYNA_WIRTUALNA

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Zaden stan rdzenia tworzacego siec nie potrzebuje rzutowania
        (uzasadnienie w `PrzeksztaltnikGFM.granice_stanow`). Deklaracja zyje
        TUTAJ, zeby magazyn skladal swoje granice z rdzenia, a nie z kopii."""
        return tuple(None for _ in self.uklad.nazwy)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Rownania rdzenia tworzacego siec sa wazne w calej przestrzeni swoich
        stanow — model wirtualnej maszyny i filtry mocy nie opisuja zasobu, ktory
        moglby sie wyczerpac. Deklaracja zyje TUTAJ, zeby magazyn skladal swoja z
        rdzenia, a nie z kopii."""
        return tuple(None for _ in self.uklad.nazwy)

    @property
    def impedancja_pu(self) -> complex:
        return complex(self.r_wirtualne_pu, self.x_wirtualne_pu)

    @property
    def promien_ograniczenia_pu(self) -> float:
        """`R = i_max |Z_w|` — promien okregu, na ktorym prad osiaga ogranicznik."""
        return self.i_max_pu * abs(self.impedancja_pu)

    # -- wielkosci posrednie ---------------------------------------------

    def modul_sem(self, stany: dict[str, Dual]) -> Dual:
        """`E = U_odn - mq (Q_f - Q_zad)` — statyzm mocy biernej."""
        return (
            stany[STAN_ODNIESIENIA_NAPIECIA]
            - (stany[STAN_FILTRU_BIERNEJ] - stany[STAN_ZADANIA_BIERNEGO]) * self.mq_pu
        )

    def napiecie_wewnetrzne(self, stany: dict[str, Dual]) -> Zespolona:
        return obrot(stany[STAN_KATA]) * self.modul_sem(stany)

    def zadanie_czynne(self, stany: dict[str, Dual], okno: OknoMocy) -> Dual:
        """Zadanie mocy czynnej sprowadzone do okna urzadzenia.

        OKNO OGRANICZA ZADANIE, NIE MOC RZECZYWISTA. Moc zrodla NAPIECIOWEGO
        wyznacza siec (kat i modul SEM wobec napiecia wezla), wiec nie ma tu
        wielkosci, ktora dalaby sie „przyciac" bez zmiany fizyki. Fizyczna
        granica mocy przeksztaltnika tworzacego siec to OGRANICZNIK PRADU
        (`i_max`), i to on jest w tym modelu nienaruszalny. Ten sam ogranicznik
        zadania dziala w obu trybach — jedna funkcja, dwa miejsca wywolania.
        """
        return okno.ogranicz(stany[STAN_ZADANIA_CZYNNEGO])

    def predkosc(self, stany: dict[str, Dual], okno: OknoMocy) -> Dual:
        """Predkosc katowa: stan w trybie maszyny wirtualnej, algebra w statyzmie.

        Statyzm jest USTALONA postacia rownania maszyny wirtualnej: przy `H = 0`
        i `D = 0` rownanie ruchu daje dokladnie `omega = 1 - mp (P_f - P_zad)`.
        Dwa tryby to wiec ta sama prawa regulacji o roznej dynamice, a nie dwa
        niezalezne modele.
        """
        if self.ma_bezwladnosc:
            return stany[STAN_PREDKOSCI]
        return 1.0 - (stany[STAN_FILTRU_CZYNNEJ] - self.zadanie_czynne(stany, okno)) * self.mp_pu

    def prad_siec(self, stany: dict[str, Dual], napiecie: Zespolona) -> Zespolona:
        """Prad wstrzykiwany po zastosowaniu strategii ograniczenia z kontraktu."""
        impedancja = Zespolona.stala(self.impedancja_pu)
        promien = self.promien_ograniczenia_pu
        sem = self.napiecie_wewnetrzne(stany)
        roznica = sem - napiecie
        kwadrat_roznicy = kwadrat(roznica.re) + kwadrat(roznica.im)
        if kwadrat_roznicy.wartosc <= promien * promien:
            return roznica / impedancja

        if self.strategia_ograniczenia == STRATEGIA_IMPEDANCJA:
            skala = pierwiastek(kwadrat_roznicy) / promien
            return roznica / (impedancja * skala)
        if self.strategia_ograniczenia != STRATEGIA_NASYCENIE:
            raise AssertionError(
                f"Strategia ograniczenia {self.strategia_ograniczenia!r} spoza zbioru "
                f"kontraktu {STRATEGIE_GFM} — rdzen nie wybiera strategii sam"
            )
        kierunek = obrot(stany[STAN_KATA])
        rzut = napiecie.re * kierunek.re + napiecie.im * kierunek.im
        # NASYCENIE ZADANIA: modul zadania SEM jest sciagany W STRONE RZUTU
        # napiecia na kierunek kata, w stosunku `i_max |Z_w| / |E - V|`. Rzut
        # jest punktem NAJMNIEJSZEGO pradu na tym kierunku, wiec kazde sciagniecie
        # ku niemu prad OBNIZA, a wspolczynnik jest dobrany tak, zeby przy
        # wejsciu w nasycenie (`|E - V| = i_max |Z_w|`) byl rowny jedynce —
        # przejscie jest wiec CIAGLE.
        #
        # DLACZEGO NIE DOKLADNE ROZWIAZANIE `|I| = i_max`. Modul SEM spelniajacy
        # te rownosc to `rzut +- sqrt(rzut^2 - |V|^2 + (i_max |Z_w|)^2)`, czyli
        # funkcja o PIONOWEJ STYCZNEJ w miejscu zerowania sie wyroznika — a tam,
        # gdzie wyroznik jest ujemny, rozwiazania nie ma wcale (zaden modul SEM
        # nie daje juz pradu rownego `i_max`). Metoda niejawna przechodzaca przez
        # to miejsce tam i z powrotem gubi zbieznosc (pomiar: bieg padal przy
        # t = 0,514 s, residuum 2,8e-03 na `kat_rad`, niezaleznie od skrocenia
        # kroku). Sciaganie proporcjonalne jest LIPSCHITZOWSKIE w calym zakresie
        # i nie ma rezimu bez rozwiazania.
        #
        # CZYM SIE ROZNI OD IMPEDANCJI WIRTUALNEJ. Tam skalowana jest CALA
        # roznica `E - V`, wiec kierunek pradu zostaje bez zmian. Tutaj skalowana
        # jest wylacznie skladowa RÓWNOLEGLA do kierunku kata (`E - rzut`), a
        # skladowa prostopadla (`rzut * A - V`) zostaje — kierunek pradu SIE
        # ZMIENIA. To sa dwa rozne mechanizmy, nie dwie nazwy jednego.
        modul = self.modul_sem(stany)
        sciagniecie = promien / pierwiastek(kwadrat_roznicy)
        sem_nasycona = kierunek * (rzut + (modul - rzut) * sciagniecie)
        prad = (sem_nasycona - napiecie) / impedancja
        kwadrat_pradu = kwadrat(prad.re) + kwadrat(prad.im)
        if kwadrat_pradu.wartosc <= self.i_max_pu * self.i_max_pu:
            return prad
        # OSTATNI STOPIEN: przy zapadzie tak glebokim, ze sama skladowa
        # prostopadla przekracza ogranicznik, sciaganie modulu SEM nie wystarcza
        # — prad jest wtedy obcinany co do modulu. Przejscie jest ciagle, bo
        # obciecie wlacza sie dokladnie w chwili osiagniecia `i_max`.
        return prad * (self.i_max_pu / pierwiastek(kwadrat_pradu))

    def moc_czynna(self, stany: dict[str, Dual], napiecie: Zespolona) -> Dual:
        """Moc czynna oddawana do sieci — wspolny kontrakt rdzeni GFL i GFM."""
        return self.moce(stany, napiecie)[0]

    def moce(self, stany: dict[str, Dual], napiecie: Zespolona) -> tuple[Dual, Dual]:
        """(P, Q) oddawane do sieci: `S = V conj(I)`."""
        prad = self.prad_siec(stany, napiecie)
        return (
            napiecie.re * prad.re + napiecie.im * prad.im,
            napiecie.im * prad.re - napiecie.re * prad.im,
        )

    # -- rownania ruchu ---------------------------------------------------

    def rownania(
        self, stany: dict[str, Dual], napiecie: Zespolona, okno: OknoMocy, opis: str
    ) -> dict[str, Dual]:
        """Pochodne stanow. `opis` nalezy do WSPOLNEGO kontraktu rdzeni GFL/GFM
        (magazyn i turbina uzywaja ich wymiennie); tutaj nie ma odmowy, ktora
        musialaby sie przedstawic, wiec argument pozostaje nieuzyty."""
        del opis
        moc_czynna, moc_bierna = self.moce(stany, napiecie)
        predkosc = self.predkosc(stany, okno)
        pochodne: dict[str, Dual] = {
            STAN_KATA: (predkosc - 1.0) * self.omega_bazowa_rad_s,
            STAN_FILTRU_CZYNNEJ: (moc_czynna - stany[STAN_FILTRU_CZYNNEJ]) / self.tp_s,
            STAN_FILTRU_BIERNEJ: (moc_bierna - stany[STAN_FILTRU_BIERNEJ]) / self.tiq_s,
            STAN_ZADANIA_CZYNNEGO: Dual(0.0),
            STAN_ZADANIA_BIERNEGO: Dual(0.0),
            STAN_ODNIESIENIA_NAPIECIA: Dual(0.0),
        }
        if self.ma_bezwladnosc:
            odchylka = predkosc - 1.0
            pochodne[STAN_PREDKOSCI] = (
                self.zadanie_czynne(stany, okno)
                - odchylka / self.mp_pu
                - stany[STAN_FILTRU_CZYNNEJ]
                - odchylka * self.d_wirtualne_pu
            ) / (2.0 * self.h_wirtualne_s)
        return pochodne

    # -- rownowaga --------------------------------------------------------

    def stany_rownowagi(
        self, napiecie_pu: complex, moc_pu: complex, okno: OknoMocy, opis: str
    ) -> dict[str, float]:
        """Stany rownowagi z punktu pracy — KAZDA pochodna zeruje sie analitycznie."""
        if napiecie_pu == 0:
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{opis}: zerowe napiecie punktu pracy nie wyznacza kata SEM",
            )
        prad = moc_pu.conjugate() / napiecie_pu.conjugate()
        if abs(prad) > self.i_max_pu:
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"{opis}: punkt pracy wymaga pradu {abs(prad)} pu ponad ogranicznik "
                f"{self.i_max_pu} pu — rownowaga nie istnieje",
                i_pu=abs(prad),
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
        sem = napiecie_pu + self.impedancja_pu * prad
        wartosci = {
            STAN_KATA: cmath.phase(sem),
            STAN_FILTRU_CZYNNEJ: moc_pu.real,
            STAN_FILTRU_BIERNEJ: moc_pu.imag,
            STAN_ZADANIA_CZYNNEGO: moc_pu.real,
            STAN_ZADANIA_BIERNEGO: moc_pu.imag,
            STAN_ODNIESIENIA_NAPIECIA: abs(sem),
        }
        if self.ma_bezwladnosc:
            wartosci[STAN_PREDKOSCI] = 1.0
        return wartosci


def _uklad_stanow_gfm(tryb: str) -> UkladStanow:
    nazwy = [STAN_KATA]
    if tryb == TRYB_MASZYNA_WIRTUALNA:
        nazwy.append(STAN_PREDKOSCI)
    nazwy.extend(
        (
            STAN_FILTRU_CZYNNEJ,
            STAN_FILTRU_BIERNEJ,
            STAN_ZADANIA_CZYNNEGO,
            STAN_ZADANIA_BIERNEGO,
            STAN_ODNIESIENIA_NAPIECIA,
        )
    )
    return UkladStanow(tuple(nazwy))


def zbuduj_rdzen_gfm(
    *,
    s_n_mva: float,
    tryb: str,
    mp_pu: float,
    mq_pu: float,
    h_wirtualne_s: float,
    d_wirtualne_pu: float,
    r_wirtualne_pu: float,
    x_wirtualne_pu: float,
    i_max_pu: float,
    strategia_ograniczenia: str,
    tp_s: float,
    tiq_s: float,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> RdzenGFM:
    """Zbuduj rdzen GFM, przeliczajac parametry z bazy urzadzenia na baze ukladu."""
    if tryb not in TRYBY_GFM:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Tryb przeksztaltnika tworzacego siec {tryb!r} spoza zbioru {TRYBY_GFM}",
            tryb=tryb,
        )
    if strategia_ograniczenia not in STRATEGIE_GFM:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Strategia ograniczenia {strategia_ograniczenia!r} spoza zbioru " f"{STRATEGIE_GFM}",
            strategia=strategia_ograniczenia,
        )
    if r_wirtualne_pu <= 0.0 and x_wirtualne_pu <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            "Przeksztaltnik tworzacy siec o ZEROWEJ impedancji wirtualnej nie ma "
            "skonczonej admitancji — R_w i X_w nie moga byc jednoczesnie zerowe",
            r_wirtualne_pu=r_wirtualne_pu,
            x_wirtualne_pu=x_wirtualne_pu,
        )
    if tryb == TRYB_MASZYNA_WIRTUALNA and h_wirtualne_s <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            "Tryb maszyny wirtualnej wymaga niezerowej wirtualnej stalej bezwladnosci "
            "— rownanie ruchu bez masy nie ma rozwiazania",
            h_wirtualne_s=h_wirtualne_s,
        )
    return RdzenGFM(
        tryb=tryb,
        mp_pu=zmiana_bazy_impedancji(mp_pu, s_n_mva, s_bazowa_mva),
        mq_pu=zmiana_bazy_impedancji(mq_pu, s_n_mva, s_bazowa_mva),
        h_wirtualne_s=zmiana_bazy_mocy_wzglednej(h_wirtualne_s, s_n_mva, s_bazowa_mva),
        d_wirtualne_pu=zmiana_bazy_mocy_wzglednej(d_wirtualne_pu, s_n_mva, s_bazowa_mva),
        r_wirtualne_pu=zmiana_bazy_impedancji(r_wirtualne_pu, s_n_mva, s_bazowa_mva),
        x_wirtualne_pu=zmiana_bazy_impedancji(x_wirtualne_pu, s_n_mva, s_bazowa_mva),
        i_max_pu=zmiana_bazy_mocy_wzglednej(i_max_pu, s_n_mva, s_bazowa_mva),
        strategia_ograniczenia=strategia_ograniczenia,
        tp_s=tp_s,
        tiq_s=tiq_s,
        omega_bazowa_rad_s=pulsacja_bazowa_rad_s(f_bazowa_hz),
        uklad=_uklad_stanow_gfm(tryb),
    )


@dataclass(frozen=True)
class PrzeksztaltnikGFM:
    """Samodzielny przeksztaltnik tworzacy siec przylaczony do wezla."""

    ident: str
    wezel: str
    rdzen: RdzenGFM
    okno_mocy: OknoMocy

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    @property
    def sprzezenie(self) -> SprzezenieUrzadzenia:
        """Przeksztaltnik tworzacy siec: SEM za impedancja WIRTUALNA (niezerowa) — do sieci wchodzi prad."""
        return "pradowe"

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Komplet parametrow do odcisku migawki — jawnie, pole po polu."""
        return {
            "ident": self.ident,
            "wezel": self.wezel,
            "rdzen": parametry_bloku(self.rdzen),
            "okno_mocy": parametry_bloku(self.okno_mocy),
        }

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.rdzen.uklad.nazwy

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Zaden stan tworzacego siec nie ma twardej granicy.

        Ograniczenie pradu dziala na WIELKOSC ALGEBRAICZNA (impedancja efektywna
        albo modul zadania SEM), nie na stan rozniczkowy: nie ma calki, ktora
        moglaby wyjsc poza zakres. Filtry mocy sa czlonami inercyjnymi mocy
        rzeczywistej, a odniesienia maja zerowa pochodna.
        """
        return tuple(None for _ in self.nazwy_stanow)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Przeksztaltnik bez zasobnika nie ma zakresu waznosci na zadnym stanie —
        energia plynie z instalacji pierwotnej, ktorej ten model nie obejmuje."""
        return self.rdzen.zakresy_waznosci

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Kazdy stan przeksztaltnika tworzacego siec MUSI byc rownowaga."""
        return ()

    @property
    def _opis(self) -> str:
        return f"przeksztaltnik tworzacy siec {self.ident}"

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
        stany, napiecie = self.rdzen.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.rdzen.uklad.blok_po_napieciu([prad.re, prad.im])

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.rdzen.uklad.zaszczep(stan, napiecie_pu)
        prad = self.rdzen.prad_siec(stany, napiecie)
        return self.rdzen.uklad.blok_po_stanach([prad.re, prad.im])

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        """SEM zrodla napieciowego — przy niej prad przez impedancje wirtualna znika."""
        stany, _ = self.rdzen.uklad.bez_gradientu(stan, 0j)
        return self.rdzen.napiecie_wewnetrzne(stany).wartosc

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        stany, _ = self.rdzen.uklad.zaszczep(stan, 0j)
        sem = self.rdzen.napiecie_wewnetrzne(stany)
        return self.rdzen.uklad.blok_po_stanach([sem.re, sem.im])


def zbuduj_przeksztaltnik_gfm(
    *, ident: str, wezel: str, rdzen: RdzenGFM, okno_mocy: OknoMocy
) -> PrzeksztaltnikGFM:
    return PrzeksztaltnikGFM(ident=ident, wezel=wezel, rdzen=rdzen, okno_mocy=okno_mocy)


__all__ = [
    "STAN_FILTRU_BIERNEJ",
    "STAN_FILTRU_CZYNNEJ",
    "STAN_KATA",
    "STAN_ODNIESIENIA_NAPIECIA",
    "STAN_PREDKOSCI",
    "STAN_ZADANIA_BIERNEGO",
    "STAN_ZADANIA_CZYNNEGO",
    "STRATEGIA_IMPEDANCJA",
    "STRATEGIA_NASYCENIE",
    "STRATEGIE_GFM",
    "TRYBY_GFM",
    "TRYB_MASZYNA_WIRTUALNA",
    "TRYB_STATYZM",
    "PrzeksztaltnikGFM",
    "RdzenGFM",
    "zbuduj_przeksztaltnik_gfm",
    "zbuduj_rdzen_gfm",
]
