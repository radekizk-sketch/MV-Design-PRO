"""Maszyna synchroniczna 6. rzedu (osie d/q) z AVR, regulatorem obrotow i PSS.

ROWNANIA (Sauer & Pai, „Power System Dynamics and Stability", rozdz. 3.6-3.8,
rownania 3.148-3.152; Kundur rozdz. 3.8 dla nasycenia). Konwencja GENERATOROWA:
`Id`, `Iq` sa skladowymi pradu ODDAWANEGO do sieci.

    d(delta)/dt  = omega_0 (omega - 1)
    d(omega)/dt  = (P_m - P_e - D (omega - 1)) / (2H)
    T'd0 dE'q/dt = Efd - E'q - (Xd - X'd) Id - Sat(psi_ag)
    T'q0 dE'd/dt = -E'd + (Xq - X'q) Iq
    T''d0 dE''q/dt = E'q - E''q - (X'd - X''d) Id
    T''q0 dE''d/dt = E'd - E''d + (X'q - X''q) Iq

Rownania stojana (bez skladowych transformatorowych — model RMS):

    Vd = E''d - Ra Id + X''q Iq
    Vq = E''q - Ra Iq - X''d Id

Uklad rozwiazany wzgledem pradu (BIEGUNOWOSC PODPRZEJSCIOWA X''d != X''q jest
zachowana — kontrakt niesie obie reaktancje, wiec ich zrownanie byloby cicha
podmiana modelu):

    det = Ra^2 + X''d X''q
    Id = ( Ra (E''d - Vd) + X''q (E''q - Vq) ) / det
    Iq = ( -X''d (E''d - Vd) + Ra (E''q - Vq) ) / det

MOC W ROWNANIU RUCHU to moc PRZEZ SZCZELINE (moc zaciskow powiekszona o straty w
uzwojeniu stojana), tak samo jak w modelu klasycznym tego pakietu:

    P_e = Vd Id + Vq Iq + Ra (Id^2 + Iq^2) = E''d Id + E''q Iq + (X''q - X''d) Id Iq

(drugi czlon to moment reluktancyjny biegunowosci podprzejsciowej). Do rownania
ruchu wchodzi MOC, nie moment: przy `omega ~ 1` roznica jest drugiego rzedu, a
caly pakiet (model klasyczny, wyrocznia rownych pol, calka pierwsza) ma juz te
umowe — druga umowa w tym samym pakiecie bylaby rozjazdem, nie dokladnoscia.

NASYCENIE OBWODU MAGNETYCZNEGO (Kundur 3.8.2). Argumentem funkcji nasycenia jest
strumien SZCZELINY, czyli napiecie za reaktancja rozproszenia stojana:

    psi_ag = | V_dq + (Ra + j Xl) I_dq |

Funkcja nasycenia jest kwadratowa, `Se(x) = B (x - A)^2 / x`, a jej wklad do
rownania wzbudzenia to dodatkowe zapotrzebowanie pradu wzbudzenia `Se(x) x =
B (x - A)^2`. Wspolczynniki `A`, `B` sa dopasowane do DWOCH punktow z kontraktu:
`Se(1,0) = S10` i `Se(1,2) = S12`. Dopasowanie bez rozwiazania (np. `S12` zbyt
male wobec `S10`) konczy sie odmowa `dynamika.parametry_urzadzenia_sprzeczne` —
krzywa nasycenia, ktora maleje, nie jest krzywa nasycenia. Reaktancja `Xl` jest
tu KONSUMOWANA (a nie „niesiona"): bez niej argument nasycenia bylby napieciem
zaciskow, czyli wielkoscia o innym sensie fizycznym.

STANY ODNIESIENIA SA STANAMI, NIE POLAMI. `Efd` bez wzbudnicy, `P_m` bez
regulatora obrotow oraz odniesienia `Vref`/`Pref` przy ich obecnosci maja ZEROWE
pochodne i sa wyznaczane z punktu pracy — dokladnie ten sam wzorzec, co `P_m` i
`|E'|` maszyny klasycznej. Nie ma wiec drogi, ktora wprowadzilaby do biegu
odniesienie niezgodne z rozplywem (skok momentu albo skok wzbudzenia w t = 0).

UKLAD STANOW JEST ZMIENNY. Blok nieobecny nie dostaje stanu: maszyna bez
regulatorow ma osiem stanow, z pelnym kompletem regulacji — trzynascie. Stan o
tozsamosciowo zerowej pochodnej dopisywany „na zapas" dokladalby zerowa wartosc
wlasna do analizy malosygnalowej i pusty kanal do wyniku.

BAZY. Parametry wchodza w bazie URZADZENIA (`s_n_mva`) i sa przeliczane RAZ, w
`zbuduj_maszyne_synchroniczna`: reaktancje i rezystancja jak impedancja
(mnoznik `S_uklad/S_urz`), stale bezwladnosci i tlumienia oraz granice mocy
turbiny ODWROTNIE, statyzm regulatora obrotow jak impedancja (wzmocnienie `1/R`
jest moca na jednostke odchylki predkosci). Wielkosci NAPIECIOWE (Efd, limity
wzbudzenia, wyjscie PSS, wspolczynniki nasycenia) nie przeliczaja sie wcale.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass, field

import numpy as np

from ..kontrakty import (
    KOD_PARAMETRY_SPRZECZNE,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    OdmowaDynamiki,
)
from ..konwencje import (
    CWIERC_OBROTU_RAD,
    pulsacja_bazowa_rad_s,
    siec_na_dq,
    zmiana_bazy_impedancji,
    zmiana_bazy_mocy_wzglednej,
    zmiana_bazy_stalej_bezwladnosci,
)
from .bazowe import modul_niezerowy
from .pochodne_kierunkowe import Dual, Zespolona, kwadrat, obrot
from .regulatory import (
    RegulatorNapieciaSEXS,
    RegulatorObrotowTGOV1,
    StabilizatorPSS1A,
)
from .uklad_stanow import UkladStanow

#: Stany rdzenia elektromechanicznego — obecne zawsze, w tej kolejnosci.
STANY_RDZENIA: tuple[str, ...] = (
    "delta_rad",
    "omega_pu",
    "eq_prim_pu",
    "ed_prim_pu",
    "eq_bis_pu",
    "ed_bis_pu",
)

STAN_WZBUDZENIA = "efd_pu"
STAN_ODNIESIENIA_WZBUDZENIA = "wzbudzenie_odniesienie_pu"
STAN_WYPRZEDZENIA_WZBUDZENIA = "wzbudzenie_wyprzedzenie_pu"
STAN_MOCY_MECHANICZNEJ = "p_mechaniczna_pu"
STAN_ODNIESIENIA_TURBINY = "turbina_odniesienie_pu"
STAN_ZAWORU_TURBINY = "turbina_zawor_pu"
STAN_WYPRZEDZENIA_TURBINY = "turbina_wyprzedzenie_pu"
STAN_FILTRU_PSS = "pss_filtr_pu"
STAN_WYPRZEDZENIA1_PSS = "pss_wyprzedzenie1_pu"
STAN_WYPRZEDZENIA2_PSS = "pss_wyprzedzenie2_pu"


@dataclass(frozen=True)
class WspolczynnikiNasycenia:
    """Kwadratowa krzywa nasycenia `Se(x) = B (x - A)^2 / x` dopasowana do S10/S12."""

    prog_pu: float
    wspolczynnik: float

    @property
    def aktywne(self) -> bool:
        return self.wspolczynnik > 0.0

    def zapotrzebowanie(self, strumien: Dual) -> Dual:
        """Dodatkowe zapotrzebowanie pradu wzbudzenia `Se(x) * x = B (x - A)^2`."""
        if not self.aktywne or strumien.wartosc <= self.prog_pu:
            return Dual(0.0)
        return kwadrat(strumien - self.prog_pu) * self.wspolczynnik


def dopasuj_nasycenie(s10: float, s12: float) -> WspolczynnikiNasycenia:
    """Wyznacz `A` i `B` krzywej `Se(x) = B (x - A)^2 / x` z `Se(1,0)` i `Se(1,2)`.

    Z `B (1 - A)^2 = S10` i `B (1,2 - A)^2 = 1,2 S12` wychodzi
    `r = sqrt(1,2 S12 / S10)`, `A = (r - 1,2)/(r - 1)`, `B = S10/(1 - A)^2`.

    PRZYPADKI BRZEGOWE SA NAZWANE, nie zgadywane:
    * `S10 = 0` i `S12 = 0` — maszyna bez nasycenia (`B = 0`);
    * `S10 = 0` i `S12 > 0` — kolano dokladnie w `1,0` pu (`A = 1`, `B = 30 S12`),
      bo `B (1-A)^2 = 0` przy `B > 0` wymusza `A = 1`;
    * `1,2 S12 <= S10` — krzywa nasycenia nie rosnie, wiec dopasowanie nie ma
      rozwiazania fizycznego: odmowa, nie „wez cokolwiek".
    """
    if s10 < 0.0 or s12 < 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Nasycenie: Se(1,0)={s10} i Se(1,2)={s12} musza byc nieujemne",
            s10=s10,
            s12=s12,
        )
    if s10 == 0.0 and s12 == 0.0:
        return WspolczynnikiNasycenia(prog_pu=1.0, wspolczynnik=0.0)
    if s10 == 0.0:
        return WspolczynnikiNasycenia(prog_pu=1.0, wspolczynnik=1.2 * s12 / (0.2**2))
    iloraz = 1.2 * s12 / s10
    if iloraz <= 1.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Nasycenie: Se(1,2)={s12} wobec Se(1,0)={s10} daje krzywa nierosnaca "
            "(1,2*S12 <= S10) — kwadratowa krzywa nasycenia nie ma dopasowania",
            s10=s10,
            s12=s12,
        )
    pierwiastek_ilorazu = math.sqrt(iloraz)
    prog = (pierwiastek_ilorazu - 1.2) / (pierwiastek_ilorazu - 1.0)
    return WspolczynnikiNasycenia(prog_pu=prog, wspolczynnik=s10 / ((1.0 - prog) ** 2))


def _uklad_stanow(
    wzbudzenie: RegulatorNapieciaSEXS | None,
    turbina: RegulatorObrotowTGOV1 | None,
    stabilizator: StabilizatorPSS1A | None,
) -> UkladStanow:
    """Zloz uklad stanow z OBECNYCH blokow regulacji (brak bloku = brak stanu)."""
    nazwy = list(STANY_RDZENIA)
    if wzbudzenie is None:
        nazwy.append(STAN_WZBUDZENIA)
    else:
        nazwy.append(STAN_ODNIESIENIA_WZBUDZENIA)
        if wzbudzenie.ma_wyprzedzenie:
            nazwy.append(STAN_WYPRZEDZENIA_WZBUDZENIA)
        nazwy.append(STAN_WZBUDZENIA)
    if turbina is None:
        nazwy.append(STAN_MOCY_MECHANICZNEJ)
    else:
        nazwy.append(STAN_ODNIESIENIA_TURBINY)
        if turbina.ma_zawor:
            nazwy.append(STAN_ZAWORU_TURBINY)
        if turbina.ma_wyprzedzenie:
            nazwy.append(STAN_WYPRZEDZENIA_TURBINY)
    if stabilizator is not None:
        nazwy.append(STAN_FILTRU_PSS)
        if stabilizator.ma_wyprzedzenie1:
            nazwy.append(STAN_WYPRZEDZENIA1_PSS)
        if stabilizator.ma_wyprzedzenie2:
            nazwy.append(STAN_WYPRZEDZENIA2_PSS)
    return UkladStanow(tuple(nazwy))


@dataclass(frozen=True)
class _Elektryka:
    """Wielkosci elektryczne wyznaczone z (delta, E''d, E''q, V) — jeden rachunek."""

    napiecie_d: Dual
    napiecie_q: Dual
    prad_d: Dual
    prad_q: Dual
    prad_siec: Zespolona
    moc_elektryczna: Dual
    strumien_szczeliny: Dual


@dataclass(frozen=True)
class MaszynaSynchroniczna:
    """Maszyna 6. rzedu z parametrami JUZ w bazie ukladu (buduj przez fabryke modulu)."""

    ident: str
    wezel: str
    h_s: float
    d_pu: float
    xd_pu: float
    xq_pu: float
    xd_prim_pu: float
    xq_prim_pu: float
    xd_bis_pu: float
    xq_bis_pu: float
    xl_pu: float
    ra_pu: float
    td0_prim_s: float
    tq0_prim_s: float
    td0_bis_s: float
    tq0_bis_s: float
    nasycenie: WspolczynnikiNasycenia
    omega_bazowa_rad_s: float
    wzbudzenie: RegulatorNapieciaSEXS | None
    turbina: RegulatorObrotowTGOV1 | None
    stabilizator: StabilizatorPSS1A | None
    uklad: UkladStanow = field(compare=False)

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.uklad.nazwy

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Twarda granica ma DOKLADNIE JEDEN stan: napiecie wzbudzenia z regulatorem.

        Pozostale ograniczniki modelu sa ograniczeniami SYGNALU, nie stanu, i
        dlatego nie potrzebuja mechanizmu rzutowania:
        * granice mocy turbiny dzialaja na ZADANIE `Pref - dOmega/R`, a stan
          zaworu jest czlonem inercyjnym tego zadania — czlon inercyjny sygnalu
          ograniczonego sam nie wychodzi poza jego zakres (jest srednia wazona
          przeszlych wartosci wejscia);
        * to samo dotyczy czlonu wyprzedzajacego turbiny i wyjscia stabilizatora;
        * bez regulatora napiecia `Efd` jest STALA punktu pracy (pochodna zero),
          wiec granica nie ma na czym zadzialac.

        Napiecie wzbudzenia Z REGULATOREM jest inne: jego wejsciem jest `Ka * u`,
        wielkosc NIEOGRANICZONA (pomiar: przy zwarciu na zaciskach regulator zada
        Efd = 22,9 pu przy granicy 6,0 pu), wiec bez rzutowania stan przestrzeliwa
        granice o `dt/2 * f`.
        """
        granice: list[tuple[float, float] | None] = []
        for nazwa in self.uklad.nazwy:
            if nazwa == STAN_WZBUDZENIA and self.wzbudzenie is not None:
                granice.append((self.wzbudzenie.efd_min_pu, self.wzbudzenie.efd_max_pu))
            else:
                granice.append(None)
        return tuple(granice)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Kazdy stan maszyny — wirnika, strumieni i regulatorow — MUSI byc rownowaga."""
        return ()

    @property
    def wyznacznik_stojana(self) -> float:
        """`det = Ra^2 + X''d X''q` — mianownik rozwiazania rownan stojana."""
        return self.ra_pu * self.ra_pu + self.xd_bis_pu * self.xq_bis_pu

    # -- rachunek elektryczny --------------------------------------------

    def _elektryka(self, stany: dict[str, Dual], napiecie: Zespolona) -> _Elektryka:
        kat = stany["delta_rad"]
        obrot_wirnika = obrot(kat - CWIERC_OBROTU_RAD)
        napiecie_dq = napiecie * obrot_wirnika.sprzezenie()
        napiecie_d, napiecie_q = napiecie_dq.re, napiecie_dq.im

        roznica_d = stany["ed_bis_pu"] - napiecie_d
        roznica_q = stany["eq_bis_pu"] - napiecie_q
        wyznacznik = self.wyznacznik_stojana
        prad_d = (roznica_d * self.ra_pu + roznica_q * self.xq_bis_pu) / wyznacznik
        prad_q = (roznica_d * (-self.xd_bis_pu) + roznica_q * self.ra_pu) / wyznacznik
        prad_dq = Zespolona(prad_d, prad_q)

        moc = (
            napiecie_d * prad_d
            + napiecie_q * prad_q
            + (kwadrat(prad_d) + kwadrat(prad_q)) * self.ra_pu
        )
        strumien_wektor = napiecie_dq + prad_dq * Zespolona(Dual(self.ra_pu), Dual(self.xl_pu))
        strumien = (
            modul_niezerowy(strumien_wektor, f"strumien szczeliny maszyny {self.ident}")
            if self.nasycenie.aktywne
            else Dual(0.0)
        )
        return _Elektryka(
            napiecie_d=napiecie_d,
            napiecie_q=napiecie_q,
            prad_d=prad_d,
            prad_q=prad_q,
            prad_siec=prad_dq * obrot_wirnika,
            moc_elektryczna=moc,
            strumien_szczeliny=strumien,
        )

    # -- rownania ruchu ---------------------------------------------------

    def _rownania(self, stany: dict[str, Dual], napiecie: Zespolona) -> dict[str, Dual]:
        elektryka = self._elektryka(stany, napiecie)
        odchylka_predkosci = stany["omega_pu"] - 1.0

        sygnal_pss = self._sygnal_stabilizatora(stany, odchylka_predkosci)
        wzbudzenie_pu, pochodne_wzbudzenia = self._tor_wzbudzenia(stany, napiecie, sygnal_pss)
        moc_mechaniczna, pochodne_turbiny = self._tor_turbiny(stany, odchylka_predkosci)

        nasycenie = self.nasycenie.zapotrzebowanie(elektryka.strumien_szczeliny)
        pochodne: dict[str, Dual] = {
            "delta_rad": odchylka_predkosci * self.omega_bazowa_rad_s,
            "omega_pu": (
                moc_mechaniczna - elektryka.moc_elektryczna - odchylka_predkosci * self.d_pu
            )
            / (2.0 * self.h_s),
            "eq_prim_pu": (
                wzbudzenie_pu
                - stany["eq_prim_pu"]
                - elektryka.prad_d * (self.xd_pu - self.xd_prim_pu)
                - nasycenie
            )
            / self.td0_prim_s,
            "ed_prim_pu": (-stany["ed_prim_pu"] + elektryka.prad_q * (self.xq_pu - self.xq_prim_pu))
            / self.tq0_prim_s,
            "eq_bis_pu": (
                stany["eq_prim_pu"]
                - stany["eq_bis_pu"]
                - elektryka.prad_d * (self.xd_prim_pu - self.xd_bis_pu)
            )
            / self.td0_bis_s,
            "ed_bis_pu": (
                stany["ed_prim_pu"]
                - stany["ed_bis_pu"]
                + elektryka.prad_q * (self.xq_prim_pu - self.xq_bis_pu)
            )
            / self.tq0_bis_s,
        }
        pochodne.update(pochodne_wzbudzenia)
        pochodne.update(pochodne_turbiny)
        pochodne.update(self._pochodne_stabilizatora(stany, odchylka_predkosci))
        return pochodne

    def _sygnal_stabilizatora(self, stany: dict[str, Dual], odchylka_predkosci: Dual) -> Dual:
        stabilizator = self.stabilizator
        if stabilizator is None:
            return Dual(0.0)
        po_filtrze = stabilizator.wyjscie_filtru(odchylka_predkosci, stany[STAN_FILTRU_PSS])
        po_pierwszym = stabilizator.wyjscie_wyprzedzenia1(
            po_filtrze,
            stany[STAN_WYPRZEDZENIA1_PSS] if stabilizator.ma_wyprzedzenie1 else None,
        )
        po_drugim = stabilizator.wyjscie_wyprzedzenia2(
            po_pierwszym,
            stany[STAN_WYPRZEDZENIA2_PSS] if stabilizator.ma_wyprzedzenie2 else None,
        )
        return stabilizator.sygnal(po_drugim)

    def _pochodne_stabilizatora(
        self, stany: dict[str, Dual], odchylka_predkosci: Dual
    ) -> dict[str, Dual]:
        stabilizator = self.stabilizator
        if stabilizator is None:
            return {}
        pochodne = {
            STAN_FILTRU_PSS: stabilizator.pochodna_filtru(
                odchylka_predkosci, stany[STAN_FILTRU_PSS]
            )
        }
        po_filtrze = stabilizator.wyjscie_filtru(odchylka_predkosci, stany[STAN_FILTRU_PSS])
        if stabilizator.ma_wyprzedzenie1:
            pochodne[STAN_WYPRZEDZENIA1_PSS] = stabilizator.pochodna_wyprzedzenia1(
                po_filtrze, stany[STAN_WYPRZEDZENIA1_PSS]
            )
        po_pierwszym = stabilizator.wyjscie_wyprzedzenia1(
            po_filtrze,
            stany[STAN_WYPRZEDZENIA1_PSS] if stabilizator.ma_wyprzedzenie1 else None,
        )
        if stabilizator.ma_wyprzedzenie2:
            pochodne[STAN_WYPRZEDZENIA2_PSS] = stabilizator.pochodna_wyprzedzenia2(
                po_pierwszym, stany[STAN_WYPRZEDZENIA2_PSS]
            )
        return pochodne

    def _tor_wzbudzenia(
        self, stany: dict[str, Dual], napiecie: Zespolona, sygnal_pss: Dual
    ) -> tuple[Dual, dict[str, Dual]]:
        wzbudzenie = self.wzbudzenie
        efd = stany[STAN_WZBUDZENIA]
        if wzbudzenie is None:
            return efd, {STAN_WZBUDZENIA: Dual(0.0)}
        napiecie_zaciskow = modul_niezerowy(napiecie, f"napiecie zaciskow maszyny {self.ident}")
        uchyb = stany[STAN_ODNIESIENIA_WZBUDZENIA] - napiecie_zaciskow + sygnal_pss
        stan_wyprzedzenia = (
            stany[STAN_WYPRZEDZENIA_WZBUDZENIA] if wzbudzenie.ma_wyprzedzenie else None
        )
        pochodne: dict[str, Dual] = {
            STAN_ODNIESIENIA_WZBUDZENIA: Dual(0.0),
            STAN_WZBUDZENIA: wzbudzenie.pochodna_wzbudzenia(uchyb, stan_wyprzedzenia, efd),
        }
        if stan_wyprzedzenia is not None:
            pochodne[STAN_WYPRZEDZENIA_WZBUDZENIA] = wzbudzenie.pochodna_wyprzedzenia(
                uchyb, stan_wyprzedzenia
            )
        return efd, pochodne

    def _tor_turbiny(
        self, stany: dict[str, Dual], odchylka_predkosci: Dual
    ) -> tuple[Dual, dict[str, Dual]]:
        turbina = self.turbina
        if turbina is None:
            return stany[STAN_MOCY_MECHANICZNEJ], {STAN_MOCY_MECHANICZNEJ: Dual(0.0)}
        zadanie = turbina.zadanie_ograniczone(stany[STAN_ODNIESIENIA_TURBINY], odchylka_predkosci)
        pochodne: dict[str, Dual] = {STAN_ODNIESIENIA_TURBINY: Dual(0.0)}
        if turbina.ma_zawor:
            zawor = stany[STAN_ZAWORU_TURBINY]
            pochodne[STAN_ZAWORU_TURBINY] = turbina.pochodna_zaworu(zadanie, zawor)
        else:
            zawor = zadanie
        if turbina.ma_wyprzedzenie:
            pochodne[STAN_WYPRZEDZENIA_TURBINY] = turbina.pochodna_wyprzedzenia(
                zawor, stany[STAN_WYPRZEDZENIA_TURBINY]
            )
            moc = turbina.moc_mechaniczna(zawor, stany[STAN_WYPRZEDZENIA_TURBINY])
        else:
            moc = turbina.moc_mechaniczna(zawor, None)
        return moc, pochodne

    # -- protokol Urzadzenie ----------------------------------------------

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        """Stan rownowagi z punktu pracy — KAZDA pochodna zeruje sie analitycznie."""
        if napiecie_pu == 0:
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"Maszyna {self.ident!r}: zerowe napiecie punktu pracy nie wyznacza "
                "kata wirnika",
                urzadzenie=self.ident,
            )
        prad = moc_pu.conjugate() / napiecie_pu.conjugate()
        wektor_osi_q = napiecie_pu + complex(self.ra_pu, self.xq_pu) * prad
        kat = cmath.phase(wektor_osi_q)
        napiecie_d, napiecie_q = siec_na_dq(napiecie_pu, kat)
        prad_d, prad_q = siec_na_dq(prad, kat)

        eq_prim = napiecie_q + self.ra_pu * prad_q + self.xd_prim_pu * prad_d
        ed_prim = (self.xq_pu - self.xq_prim_pu) * prad_q
        eq_bis = napiecie_q + self.ra_pu * prad_q + self.xd_bis_pu * prad_d
        ed_bis = (self.xq_pu - self.xq_bis_pu) * prad_q

        strumien = abs(
            complex(napiecie_d, napiecie_q)
            + complex(self.ra_pu, self.xl_pu) * complex(prad_d, prad_q)
        )
        nasycenie = self.nasycenie.zapotrzebowanie(Dual(strumien)).wartosc
        wzbudzenie_pu = eq_prim + (self.xd_pu - self.xd_prim_pu) * prad_d + nasycenie
        moc_mechaniczna = (
            napiecie_d * prad_d
            + napiecie_q * prad_q
            + self.ra_pu * (prad_d * prad_d + prad_q * prad_q)
        )

        wartosci: dict[str, float] = {
            "delta_rad": kat,
            "omega_pu": 1.0,
            "eq_prim_pu": eq_prim,
            "ed_prim_pu": ed_prim,
            "eq_bis_pu": eq_bis,
            "ed_bis_pu": ed_bis,
            STAN_WZBUDZENIA: wzbudzenie_pu,
        }
        wartosci.update(self._stany_wzbudzenia(abs(napiecie_pu), wzbudzenie_pu))
        wartosci.update(self._stany_turbiny(moc_mechaniczna))
        wartosci.update(self._stany_stabilizatora())
        return self.uklad.wektor(wartosci)

    def _stany_wzbudzenia(
        self, napiecie_zaciskow_pu: float, wzbudzenie_pu: float
    ) -> dict[str, float]:
        wzbudzenie = self.wzbudzenie
        if wzbudzenie is None:
            return {}
        if not (wzbudzenie.efd_min_pu <= wzbudzenie_pu <= wzbudzenie.efd_max_pu):
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"Maszyna {self.ident!r}: punkt pracy wymaga wzbudzenia "
                f"Efd = {wzbudzenie_pu} pu poza granicami regulatora "
                f"[{wzbudzenie.efd_min_pu}, {wzbudzenie.efd_max_pu}] — rownowaga nie istnieje",
                urzadzenie=self.ident,
                efd_pu=wzbudzenie_pu,
                efd_min_pu=wzbudzenie.efd_min_pu,
                efd_max_pu=wzbudzenie.efd_max_pu,
            )
        wartosci = {
            STAN_ODNIESIENIA_WZBUDZENIA: wzbudzenie.odniesienie_rownowagi(
                napiecie_zaciskow_pu, wzbudzenie_pu
            )
        }
        if wzbudzenie.ma_wyprzedzenie:
            wartosci[STAN_WYPRZEDZENIA_WZBUDZENIA] = wzbudzenie_pu / wzbudzenie.ka
        return wartosci

    def _stany_turbiny(self, moc_mechaniczna_pu: float) -> dict[str, float]:
        turbina = self.turbina
        if turbina is None:
            return {STAN_MOCY_MECHANICZNEJ: moc_mechaniczna_pu}
        if not (turbina.p_min_pu <= moc_mechaniczna_pu <= turbina.p_max_pu):
            raise OdmowaDynamiki(
                KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
                f"Maszyna {self.ident!r}: punkt pracy wymaga mocy turbiny "
                f"P_m = {moc_mechaniczna_pu} pu poza granicami regulatora "
                f"[{turbina.p_min_pu}, {turbina.p_max_pu}] — rownowaga nie istnieje",
                urzadzenie=self.ident,
                p_mechaniczna_pu=moc_mechaniczna_pu,
                p_min_pu=turbina.p_min_pu,
                p_max_pu=turbina.p_max_pu,
            )
        wartosci = {STAN_ODNIESIENIA_TURBINY: moc_mechaniczna_pu}
        if turbina.ma_zawor:
            wartosci[STAN_ZAWORU_TURBINY] = moc_mechaniczna_pu
        if turbina.ma_wyprzedzenie:
            wartosci[STAN_WYPRZEDZENIA_TURBINY] = moc_mechaniczna_pu
        return wartosci

    def _stany_stabilizatora(self) -> dict[str, float]:
        stabilizator = self.stabilizator
        if stabilizator is None:
            return {}
        wartosci = {STAN_FILTRU_PSS: 0.0}
        if stabilizator.ma_wyprzedzenie1:
            wartosci[STAN_WYPRZEDZENIA1_PSS] = 0.0
        if stabilizator.ma_wyprzedzenie2:
            wartosci[STAN_WYPRZEDZENIA2_PSS] = 0.0
        return wartosci

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        pochodne = self.uklad.uporzadkuj(self._rownania(stany, napiecie))
        return np.array([wielkosc.wartosc for wielkosc in pochodne], dtype=float)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_stanach(self.uklad.uporzadkuj(self._rownania(stany, napiecie)))

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        return self.uklad.blok_po_napieciu(self.uklad.uporzadkuj(self._rownania(stany, napiecie)))

    def moc_elektryczna_pu(self, stan: np.ndarray, napiecie_pu: complex) -> float:
        """`P_e` przez szczeline — wielkosc inzynierska, nie tylko krok posredni."""
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        return self._elektryka(stany, napiecie).moc_elektryczna.wartosc

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        stany, napiecie = self.uklad.bez_gradientu(stan, napiecie_pu)
        return self._elektryka(stany, napiecie).prad_siec.wartosc

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        prad = self._elektryka(stany, napiecie).prad_siec
        return self.uklad.blok_po_napieciu([prad.re, prad.im])

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        stany, napiecie = self.uklad.zaszczep(stan, napiecie_pu)
        prad = self._elektryka(stany, napiecie).prad_siec
        return self.uklad.blok_po_stanach([prad.re, prad.im])

    def _napiecie_jalowe(self, stany: dict[str, Dual]) -> Zespolona:
        """`I = 0` daje `Vd = E''d`, `Vq = E''q`, wiec `V = (E''d + jE''q) e^(j(delta-pi/2))`."""
        return Zespolona(stany["ed_bis_pu"], stany["eq_bis_pu"]) * obrot(
            stany["delta_rad"] - CWIERC_OBROTU_RAD
        )

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        stany, _ = self.uklad.bez_gradientu(stan, 0j)
        return self._napiecie_jalowe(stany).wartosc

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        stany, _ = self.uklad.zaszczep(stan, 0j)
        napiecie = self._napiecie_jalowe(stany)
        return self.uklad.blok_po_stanach([napiecie.re, napiecie.im])


def zbuduj_maszyne_synchroniczna(
    *,
    ident: str,
    wezel: str,
    s_n_mva: float,
    h_s: float,
    d_pu: float,
    xd_pu: float,
    xq_pu: float,
    xd_prim_pu: float,
    xq_prim_pu: float,
    xd_bis_pu: float,
    xq_bis_pu: float,
    xl_pu: float,
    ra_pu: float,
    td0_prim_s: float,
    tq0_prim_s: float,
    td0_bis_s: float,
    tq0_bis_s: float,
    nasycenie_s10: float,
    nasycenie_s12: float,
    wzbudzenie: RegulatorNapieciaSEXS | None,
    turbina: RegulatorObrotowTGOV1 | None,
    stabilizator: StabilizatorPSS1A | None,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> MaszynaSynchroniczna:
    """Zbuduj maszyne 6. rzedu, przeliczajac parametry z bazy urzadzenia na baze ukladu.

    JEDYNE miejsce zmiany bazy tej rodziny. Klasa nie przelicza niczego w srodku,
    wiec nie ma drugiej drogi, ktora moglaby sie z ta rozejsc.
    """
    if stabilizator is not None and wzbudzenie is None:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Maszyna {ident!r}: stabilizator systemowy oddaje sygnal na wejscie "
            "regulatora napiecia, ktorego maszyna nie ma — PSS bez AVR nie ma gdzie "
            "dzialac",
            urzadzenie=ident,
        )
    if xd_bis_pu <= 0.0 and xq_bis_pu <= 0.0 and ra_pu <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Maszyna {ident!r}: zerowa impedancja podprzejsciowa i zerowa rezystancja "
            "stojana nie wyznaczaja pradu (wyznacznik rownan stojana rowny zeru)",
            urzadzenie=ident,
        )
    turbina_w_bazie = (
        None
        if turbina is None
        else RegulatorObrotowTGOV1(
            wariant=turbina.wariant,
            r_pu=zmiana_bazy_impedancji(turbina.r_pu, s_n_mva, s_bazowa_mva),
            t1_s=turbina.t1_s,
            t2_s=turbina.t2_s,
            t3_s=turbina.t3_s,
            p_min_pu=zmiana_bazy_mocy_wzglednej(turbina.p_min_pu, s_n_mva, s_bazowa_mva),
            p_max_pu=zmiana_bazy_mocy_wzglednej(turbina.p_max_pu, s_n_mva, s_bazowa_mva),
        )
    )
    return MaszynaSynchroniczna(
        ident=ident,
        wezel=wezel,
        h_s=zmiana_bazy_stalej_bezwladnosci(h_s, s_n_mva, s_bazowa_mva),
        d_pu=zmiana_bazy_stalej_bezwladnosci(d_pu, s_n_mva, s_bazowa_mva),
        xd_pu=zmiana_bazy_impedancji(xd_pu, s_n_mva, s_bazowa_mva),
        xq_pu=zmiana_bazy_impedancji(xq_pu, s_n_mva, s_bazowa_mva),
        xd_prim_pu=zmiana_bazy_impedancji(xd_prim_pu, s_n_mva, s_bazowa_mva),
        xq_prim_pu=zmiana_bazy_impedancji(xq_prim_pu, s_n_mva, s_bazowa_mva),
        xd_bis_pu=zmiana_bazy_impedancji(xd_bis_pu, s_n_mva, s_bazowa_mva),
        xq_bis_pu=zmiana_bazy_impedancji(xq_bis_pu, s_n_mva, s_bazowa_mva),
        xl_pu=zmiana_bazy_impedancji(xl_pu, s_n_mva, s_bazowa_mva),
        ra_pu=zmiana_bazy_impedancji(ra_pu, s_n_mva, s_bazowa_mva),
        td0_prim_s=td0_prim_s,
        tq0_prim_s=tq0_prim_s,
        td0_bis_s=td0_bis_s,
        tq0_bis_s=tq0_bis_s,
        nasycenie=dopasuj_nasycenie(nasycenie_s10, nasycenie_s12),
        omega_bazowa_rad_s=pulsacja_bazowa_rad_s(f_bazowa_hz),
        wzbudzenie=wzbudzenie,
        turbina=turbina_w_bazie,
        stabilizator=stabilizator,
        uklad=_uklad_stanow(wzbudzenie, turbina_w_bazie, stabilizator),
    )


__all__ = [
    "STANY_RDZENIA",
    "STAN_FILTRU_PSS",
    "STAN_MOCY_MECHANICZNEJ",
    "STAN_ODNIESIENIA_TURBINY",
    "STAN_ODNIESIENIA_WZBUDZENIA",
    "STAN_WYPRZEDZENIA1_PSS",
    "STAN_WYPRZEDZENIA2_PSS",
    "STAN_WYPRZEDZENIA_TURBINY",
    "STAN_WYPRZEDZENIA_WZBUDZENIA",
    "STAN_WZBUDZENIA",
    "STAN_ZAWORU_TURBINY",
    "MaszynaSynchroniczna",
    "WspolczynnikiNasycenia",
    "dopasuj_nasycenie",
    "zbuduj_maszyne_synchroniczna",
]
